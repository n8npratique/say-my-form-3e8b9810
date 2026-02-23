import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function fetchWithTimeout(url: string, init: RequestInit, ms = 10000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal }); }
  finally { clearTimeout(t); }
}

// ── OAuth helper: get access token from OAuth connection (with auto-refresh) ──
async function getOAuthAccessToken(
  supabase: any,
  connectionId: string
): Promise<string> {
  const { data: conn } = await supabase
    .from("google_oauth_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();

  if (!conn) throw new Error("OAuth connection not found");

  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (Date.now() < expiresAt - 5 * 60 * 1000) {
    return conn.access_token;
  }

  if (!conn.refresh_token) throw new Error("No refresh token available");

  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured");
  }

  const tokenRes = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
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
    throw new Error("OAuth refresh failed");
  }

  const newExpiresAt = new Date(
    Date.now() + (tokenData.expires_in || 3600) * 1000
  ).toISOString();

  await supabase
    .from("google_oauth_connections")
    .update({
      access_token: tokenData.access_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { session_token } = await req.json();

    if (!session_token) {
      return respond({ cancelled: false, reason: "missing_token" }, 400);
    }

    // 1. Find the response by session_token
    const { data: response } = await supabase
      .from("responses")
      .select("id, status, meta, form_id")
      .eq("session_token", session_token)
      .maybeSingle();

    if (!response) {
      return respond({ cancelled: false, reason: "not_found" }, 404);
    }

    if (response.status === "cancelled") {
      return respond({ cancelled: false, reason: "already_cancelled" }, 409);
    }

    const meta = (response.meta as any) || {};
    const eventId = meta.calendar_event_id;
    const calendarId = meta.calendar_id || "primary";
    const connectionId = meta.google_connection_id;

    if (!eventId) {
      return respond({ cancelled: false, reason: "no_calendar_event" }, 400);
    }

    if (!connectionId) {
      return respond({ cancelled: false, reason: "no_connection" }, 400);
    }

    // 2. Get Google OAuth access token
    const accessToken = await getOAuthAccessToken(supabase, connectionId);

    // 3. Delete the event from Google Calendar
    const deleteRes = await fetchWithTimeout(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    // 204 = success, 410 = already deleted
    if (!deleteRes.ok && deleteRes.status !== 410) {
      throw new Error("Google Calendar delete failed");
    }

    // 4. Update response status to cancelled
    await supabase
      .from("responses")
      .update({
        status: "cancelled",
        meta: {
          ...meta,
          cancelled_at: new Date().toISOString(),
        } as any,
      })
      .eq("id", response.id);

    // 5. Release any appointment holds for this form/slot
    // (in case the hold wasn't cleaned up or the slot should re-open)

    return respond({ cancelled: true });
  } catch (err: any) {
    console.error("cancel-appointment error:", err);
    return respond(
      { cancelled: false, reason: "internal_error" },
      500
    );
  }
});
