import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HMAC_SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // reuse as HMAC key

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-oauth?action=callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

// ── HMAC state signing ──────────────────────────────────────────────────────
async function signState(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(HMAC_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return btoa(JSON.stringify({ payload, sig: sigHex }));
}

async function verifyState(state: string): Promise<{ workspace_id: string; user_id: string; origin?: string } | null> {
  try {
    const { payload, sig } = JSON.parse(atob(state));
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(HMAC_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBytes = new Uint8Array(
      (sig as string).match(/.{2}/g)!.map((h: string) => parseInt(h, 16))
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(payload)
    );
    if (!valid) return null;
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

// ── Helper: respond JSON ────────────────────────────────────────────────────
function respond(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Helper: get authenticated user from Bearer token ────────────────────────
async function getUser(req: Request, supabase: any) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user;
}

// ── Main handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // action can come from query param OR body
  let action = url.searchParams.get("action");

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // For non-callback actions, parse body and check for action there too
    let body: any = {};
    if (action !== "callback" && req.method === "POST") {
      try {
        body = await req.json();
        if (!action && body.action) action = body.action;
      } catch {
        // no body
      }
    }

    // ── ACTION: authorize ─────────────────────────────────────────────────
    if (action === "authorize") {
      const { workspace_id, origin: clientOrigin } = body;

      const user = await getUser(req, supabaseAdmin);
      if (!user) return respond({ error: "unauthorized" }, 401);

      const statePayload = JSON.stringify({
        workspace_id,
        user_id: user.id,
        origin: clientOrigin || "",
      });
      const state = await signState(statePayload);

      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        state,
      });

      return respond({
        authorization_url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      });
    }

    // ── ACTION: callback (Google redirects here) ──────────────────────────
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const fallbackOrigin = Deno.env.get("SITE_URL") || "";

      // Helper: redirect back to app — the popup will auto-close via polling in the opener
      const redirect = (origin: string, status: string, detail: string) => {
        // Minimal HTML that stores result in localStorage (triggers storage event in opener) then closes
        const html = `<!DOCTYPE html><html><head><script>
try{localStorage.setItem("google-oauth-result",JSON.stringify({status:"${status}",detail:${JSON.stringify(detail)}}));}catch(e){}
window.close();
setTimeout(function(){location.href="${(origin || "").replace(/\/+$/, "")}/dashboard";},500);
</script></head><body></body></html>`;
        return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
      };

      // Try to extract origin from state early
      let earlyOrigin = fallbackOrigin;
      if (state) {
        try {
          const { payload } = JSON.parse(atob(state));
          const parsed = JSON.parse(payload);
          if (parsed.origin) earlyOrigin = parsed.origin;
        } catch {}
      }

      if (error) return redirect(earlyOrigin, "error", error);
      if (!code || !state) return redirect(earlyOrigin, "error", "Missing code or state");

      // Verify HMAC state
      const stateData = await verifyState(state);
      if (!stateData) return redirect(earlyOrigin, "error", "Invalid state signature");

      const { workspace_id, user_id, origin: stateOrigin } = stateData;
      const appOrigin = stateOrigin || fallbackOrigin;

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        return redirect(appOrigin, "error", `Token exchange failed: ${tokenData.error || "unknown"}`);
      }

      // Get user email from Google
      const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userinfo = await userinfoRes.json();
      const googleEmail = userinfo.email;

      if (!googleEmail) return redirect(appOrigin, "error", "Could not retrieve Google email");

      // Calculate token expiry
      const expiresAt = new Date(
        Date.now() + (tokenData.expires_in || 3600) * 1000
      ).toISOString();

      // Upsert connection (same workspace + email = update tokens)
      const { error: dbError } = await supabaseAdmin
        .from("google_oauth_connections")
        .upsert(
          {
            workspace_id,
            user_id,
            google_email: googleEmail,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || "",
            token_expires_at: expiresAt,
            scopes: SCOPES.split(" "),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workspace_id,google_email" }
        );

      if (dbError) {
        console.error("DB upsert error:", dbError);
        return redirect(appOrigin, "error", `Database error: ${dbError.message}`);
      }

      return redirect(appOrigin, "success", googleEmail);
    }

    // ── ACTION: status ────────────────────────────────────────────────────
    if (action === "status") {
      const { workspace_id } = body;

      const user = await getUser(req, supabaseAdmin);
      if (!user) return respond({ error: "unauthorized" }, 401);

      const { data: connections } = await supabaseAdmin
        .from("google_oauth_connections")
        .select("id, google_email, created_at, user_id, scopes")
        .eq("workspace_id", workspace_id)
        .order("created_at", { ascending: true });

      return respond({ connections: connections || [] });
    }

    // ── ACTION: disconnect ────────────────────────────────────────────────
    if (action === "disconnect") {
      const { connection_id } = body;

      const user = await getUser(req, supabaseAdmin);
      if (!user) return respond({ error: "unauthorized" }, 401);

      // Fetch token before deleting so we can revoke
      const { data: conn } = await supabaseAdmin
        .from("google_oauth_connections")
        .select("access_token")
        .eq("id", connection_id)
        .maybeSingle();

      if (conn?.access_token) {
        // Best-effort revoke at Google
        try {
          await fetch(
            `https://oauth2.googleapis.com/revoke?token=${conn.access_token}`,
            { method: "POST" }
          );
        } catch {
          // ignore revocation failures
        }
      }

      await supabaseAdmin
        .from("google_oauth_connections")
        .delete()
        .eq("id", connection_id);

      return respond({ disconnected: true });
    }

    // ── ACTION: refresh (internal - called by other edge functions) ───────
    if (action === "refresh") {
      const { connection_id } = body;

      const { data: conn } = await supabaseAdmin
        .from("google_oauth_connections")
        .select("*")
        .eq("id", connection_id)
        .maybeSingle();

      if (!conn) return respond({ error: "connection_not_found" }, 404);

      // Check if token is still valid (with 5min buffer)
      const expiresAt = new Date(conn.token_expires_at).getTime();
      if (Date.now() < expiresAt - 5 * 60 * 1000) {
        return respond({ access_token: conn.access_token });
      }

      // Refresh the token
      if (!conn.refresh_token) {
        return respond({ error: "no_refresh_token" }, 400);
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: conn.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        return respond({ error: "refresh_failed", details: tokenData }, 400);
      }

      const newExpiresAt = new Date(
        Date.now() + (tokenData.expires_in || 3600) * 1000
      ).toISOString();

      await supabaseAdmin
        .from("google_oauth_connections")
        .update({
          access_token: tokenData.access_token,
          token_expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection_id);

      return respond({ access_token: tokenData.access_token });
    }

    return respond({ error: "unknown_action" }, 400);
  } catch (err: any) {
    console.error("google-oauth error:", err);
    return respond({ error: err.message }, 500);
  }
});

