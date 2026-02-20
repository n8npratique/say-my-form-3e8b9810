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

async function verifyState(state: string): Promise<{ workspace_id: string; user_id: string } | null> {
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
  const action = url.searchParams.get("action");

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ── ACTION: authorize ─────────────────────────────────────────────────
    if (action === "authorize") {
      const body = await req.json();
      const { workspace_id } = body;

      const user = await getUser(req, supabaseAdmin);
      if (!user) return respond({ error: "unauthorized" }, 401);

      const statePayload = JSON.stringify({
        workspace_id,
        user_id: user.id,
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

      if (error) {
        return new Response(callbackHTML("error", error), {
          headers: { "Content-Type": "text/html" },
        });
      }

      if (!code || !state) {
        return new Response(callbackHTML("error", "Missing code or state"), {
          headers: { "Content-Type": "text/html" },
        });
      }

      // Verify HMAC state
      const stateData = await verifyState(state);
      if (!stateData) {
        return new Response(callbackHTML("error", "Invalid state signature"), {
          headers: { "Content-Type": "text/html" },
        });
      }

      const { workspace_id, user_id } = stateData;

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
        return new Response(
          callbackHTML("error", `Token exchange failed: ${tokenData.error || "unknown"}`),
          { headers: { "Content-Type": "text/html" } }
        );
      }

      // Get user email from Google
      const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userinfo = await userinfoRes.json();
      const googleEmail = userinfo.email;

      if (!googleEmail) {
        return new Response(
          callbackHTML("error", "Could not retrieve Google email"),
          { headers: { "Content-Type": "text/html" } }
        );
      }

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
        return new Response(
          callbackHTML("error", `Database error: ${dbError.message}`),
          { headers: { "Content-Type": "text/html" } }
        );
      }

      return new Response(
        callbackHTML("success", googleEmail),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // ── ACTION: status ────────────────────────────────────────────────────
    if (action === "status") {
      const body = await req.json();
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
      const body = await req.json();
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
      const body = await req.json();
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

// ── Callback HTML page (shown in popup/redirect) ────────────────────────────
function callbackHTML(status: "success" | "error", detail: string): string {
  const isSuccess = status === "success";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Google OAuth - TecForms</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0; background: #f8fafc;
    }
    .card {
      background: white; border-radius: 12px; padding: 2rem; text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 400px; width: 90%;
    }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h2 { margin: 0 0 0.5rem; color: #1a1a2e; font-size: 1.25rem; }
    p { color: #64748b; font-size: 0.875rem; margin: 0; }
    .email { color: #3b82f6; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isSuccess ? "&#10004;&#65039;" : "&#10060;"}</div>
    <h2>${isSuccess ? "Conta conectada!" : "Erro na conexão"}</h2>
    <p>${isSuccess
      ? `A conta <span class="email">${detail}</span> foi conectada com sucesso.`
      : `${detail}`
    }</p>
    <p style="margin-top:1rem;color:#94a3b8;font-size:0.75rem;">
      Você pode fechar esta janela.
    </p>
  </div>
  <script>
    // Notify parent window (if opened as popup)
    if (window.opener) {
      window.opener.postMessage({
        type: "google-oauth-callback",
        status: "${status}",
        detail: ${JSON.stringify(detail)}
      }, "*");
      setTimeout(() => window.close(), 2000);
    }
  </script>
</body>
</html>`;
}
