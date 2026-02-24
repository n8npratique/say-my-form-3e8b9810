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

  await supabase
    .from("google_oauth_connections")
    .update({
      access_token: tokenData.access_token,
      token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
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
    const { session_token, new_slot_start, new_slot_end } = await req.json();

    if (!session_token || !new_slot_start || !new_slot_end) {
      return respond({ rescheduled: false, reason: "missing_fields" }, 400);
    }

    // 1. Find the response
    const { data: response } = await supabase
      .from("responses")
      .select("id, status, meta, form_id")
      .eq("session_token", session_token)
      .maybeSingle();

    if (!response) {
      return respond({ rescheduled: false, reason: "not_found" }, 404);
    }

    if (response.status === "cancelled") {
      return respond({ rescheduled: false, reason: "already_cancelled" }, 409);
    }

    const meta = (response.meta as any) || {};
    const oldEventId = meta.calendar_event_id;
    const calendarId = meta.calendar_id || "primary";
    const connectionId = meta.google_connection_id;
    const timezone = meta.timezone || "America/Sao_Paulo";

    if (!connectionId) {
      return respond({ rescheduled: false, reason: "no_connection" }, 400);
    }

    // Verify new slot is in the future
    if (new Date(new_slot_start) <= new Date()) {
      return respond({ rescheduled: false, reason: "slot_in_past" }, 400);
    }

    // 2. Get Google OAuth access token
    const accessToken = await getOAuthAccessToken(supabase, connectionId);

    // 3. Delete old event (if exists)
    if (oldEventId) {
      const deleteRes = await fetchWithTimeout(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(oldEventId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      // 204 = success, 410 = already deleted — both are OK
      if (!deleteRes.ok && deleteRes.status !== 410) {
        console.warn("Failed to delete old event:", deleteRes.status);
      }
    }

    // 4. Get form schema for event title/description/meet settings
    const { data: form } = await supabase
      .from("forms")
      .select("name, published_version_id")
      .eq("id", response.form_id)
      .maybeSingle();

    let appointmentConfig: any = null;
    if (form?.published_version_id) {
      const { data: version } = await supabase
        .from("form_versions")
        .select("schema")
        .eq("id", form.published_version_id)
        .maybeSingle();
      const schema = (version?.schema as any) ?? {};
      const fields: any[] = schema.fields ?? [];
      const apptField = fields.find((f: any) => f.type === "appointment");
      if (apptField?.appointment_config) {
        appointmentConfig = apptField.appointment_config;
      }
    }

    // 5. Create new event
    const eventBody: any = {
      summary: appointmentConfig?.event_title?.replace(/\{\{form_name\}\}/g, form?.name || "") || form?.name || "Agendamento",
      description: appointmentConfig?.event_description?.replace(/\{\{form_name\}\}/g, form?.name || "") || "",
      start: { dateTime: new_slot_start, timeZone: appointmentConfig?.timezone || timezone },
      end: { dateTime: new_slot_end, timeZone: appointmentConfig?.timezone || timezone },
    };

    // Preserve attendees from old event meta
    if (meta.respondent_email) {
      eventBody.attendees = [{ email: meta.respondent_email }];
    }

    // Google Meet
    const shouldAddMeet = appointmentConfig?.add_meet || meta.calendar_meet_link;
    if (shouldAddMeet) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    const calendarUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    );
    if (shouldAddMeet) {
      calendarUrl.searchParams.set("conferenceDataVersion", "1");
    }

    const createRes = await fetchWithTimeout(calendarUrl.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    });

    const eventData = await createRes.json();
    if (!createRes.ok) {
      console.error("Calendar API error on reschedule:", eventData);
      throw new Error("Calendar event creation failed");
    }

    const meetLink = eventData.conferenceData?.entryPoints?.find(
      (ep: any) => ep.entryPointType === "video"
    )?.uri || null;

    // 6. Update response meta with new event info
    await supabase
      .from("responses")
      .update({
        meta: {
          ...meta,
          calendar_event_id: eventData.id,
          calendar_html_link: eventData.htmlLink,
          calendar_meet_link: meetLink,
          rescheduled_at: new Date().toISOString(),
          previous_event_id: oldEventId,
        } as any,
      })
      .eq("id", response.id);

    // 7. Update the appointment answer with new slot times
    const { data: answers } = await supabase
      .from("response_answers")
      .select("id, value")
      .eq("response_id", response.id);

    for (const ans of answers || []) {
      const val = typeof ans.value === "string"
        ? (() => { try { return JSON.parse(ans.value); } catch { return null; } })()
        : ans.value;
      if (val && val.slot_start) {
        // This is the appointment answer — update it
        await supabase
          .from("response_answers")
          .update({
            value: { ...val, slot_start: new_slot_start, slot_end: new_slot_end } as any,
            value_text: new Date(new_slot_start).toLocaleString("pt-BR", {
              weekday: "long", day: "2-digit", month: "long", year: "numeric",
              hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
            }),
          })
          .eq("id", ans.id);
        break;
      }
    }

    return respond({
      rescheduled: true,
      event_id: eventData.id,
      html_link: eventData.htmlLink,
      meet_link: meetLink,
    });
  } catch (err: any) {
    console.error("reschedule-appointment error:", err);
    return respond({ rescheduled: false, reason: "internal_error" }, 500);
  }
});
