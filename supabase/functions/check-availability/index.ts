import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── OAuth helper: get access token (same as create-calendar-event) ──
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
    throw new Error(`OAuth refresh failed: ${JSON.stringify(tokenData)}`);
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

// ── Helper: generate time slots for a given day ──
// Uses -03:00 (São Paulo) offset so Date objects align with Google FreeBusy UTC times
function generateSlots(
  dateStr: string,
  startTime: string,
  endTime: string,
  durationMin: number,
  bufferMin: number,
  _tz: string
): { start: Date; end: Date }[] {
  const slots: { start: Date; end: Date }[] = [];

  // Parse with São Paulo offset so comparisons with Google FreeBusy (UTC) are correct
  const baseDate = new Date(`${dateStr}T${startTime}:00-03:00`);
  const endLimit = new Date(`${dateStr}T${endTime}:00-03:00`);

  let cursor = new Date(baseDate);
  while (cursor < endLimit) {
    const slotEnd = new Date(cursor.getTime() + durationMin * 60 * 1000);
    if (slotEnd <= endLimit) {
      slots.push({ start: new Date(cursor), end: new Date(slotEnd) });
    }
    cursor = new Date(cursor.getTime() + (durationMin + bufferMin) * 60 * 1000);
  }

  return slots;
}

// ── Helper: extract São Paulo local HH:MM from a timezone-aware Date ──
function toSaoPauloTime(date: Date): string {
  const spHours = (date.getUTCHours() - 3 + 24) % 24;
  const spMinutes = date.getUTCMinutes();
  return `${String(spHours).padStart(2, "0")}:${String(spMinutes).padStart(2, "0")}`;
}

// ── Helper: check if two time ranges overlap ──
function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart < bEnd && aEnd > bStart;
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
    const body = await req.json();
    const { action = "check" } = body;

    // ── ACTION: HOLD — create a temporary hold ──
    if (action === "hold") {
      const { form_id, field_id, slot_start, slot_end, session_id } = body;
      if (!form_id || !field_id || !slot_start || !slot_end || !session_id) {
        return respond({ error: "Missing required fields for hold" }, 400);
      }

      // Remove any existing hold by this session for this field
      await supabase
        .from("appointment_holds")
        .delete()
        .eq("form_id", form_id)
        .eq("field_id", field_id)
        .eq("session_id", session_id);

      // Check for conflicting holds from OTHER sessions
      const { data: conflictingHolds } = await supabase
        .from("appointment_holds")
        .select("id, session_id")
        .eq("form_id", form_id)
        .eq("field_id", field_id)
        .neq("session_id", session_id)
        .gt("expires_at", new Date().toISOString())
        .lt("slot_start", slot_end)
        .gt("slot_end", slot_start);

      if (conflictingHolds && conflictingHolds.length > 0) {
        return respond({ held: false, conflict: true, message: "Horário já reservado por outra pessoa" }, 409);
      }

      // Create new hold
      const { data: hold, error: holdErr } = await supabase
        .from("appointment_holds")
        .insert({
          form_id,
          field_id,
          slot_start,
          slot_end,
          session_id,
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single();

      if (holdErr) {
        return respond({ error: holdErr.message }, 500);
      }

      return respond({ held: true, hold_id: hold.id });
    }

    // ── ACTION: LIST_CALENDARS — return calendars for a connection ──
    if (action === "list_calendars") {
      const { google_connection_id } = body;
      if (!google_connection_id) {
        return respond({ error: "No google_connection_id provided" }, 400);
      }
      const accessToken = await getOAuthAccessToken(supabase, google_connection_id);
      const calRes = await fetch(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const calData = await calRes.json();
      if (!calRes.ok) {
        throw new Error(`CalendarList API error: ${JSON.stringify(calData)}`);
      }
      const calendars = (calData.items || []).map((c: any) => ({
        id: c.id,
        summary: c.summary || c.id,
        primary: !!c.primary,
        backgroundColor: c.backgroundColor || null,
      }));
      return respond({ calendars });
    }

    // ── ACTION: CHECK — return available slots ──
    const {
      form_id,
      field_id,
      appointment_config,
      session_id,
    } = body;

    if (!appointment_config?.google_connection_id) {
      return respond({ error: "No Google connection configured" }, 400);
    }

    const {
      google_connection_id,
      calendar_id = "primary",
      available_days = [1, 2, 3, 4, 5],
      start_time = "08:00",
      end_time = "18:00",
      slot_duration = 60,
      horizon_days = 14,
      buffer_minutes = 0,
    } = appointment_config;

    // 1. Get OAuth token
    const accessToken = await getOAuthAccessToken(supabase, google_connection_id);

    // 2. Calculate date range
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rangeEnd = new Date(today.getTime() + horizon_days * 24 * 60 * 60 * 1000);

    // 3. Collect candidate dates (only available_days)
    const candidateDates: string[] = [];
    const cursor = new Date(today);
    // Start from tomorrow if today's slots are mostly past
    if (now.getHours() >= parseInt(end_time.split(":")[0])) {
      cursor.setDate(cursor.getDate() + 1);
    }
    while (cursor <= rangeEnd) {
      if (available_days.includes(cursor.getDay())) {
        const yyyy = cursor.getFullYear();
        const mm = String(cursor.getMonth() + 1).padStart(2, "0");
        const dd = String(cursor.getDate()).padStart(2, "0");
        candidateDates.push(`${yyyy}-${mm}-${dd}`);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (candidateDates.length === 0) {
      return respond({ available_slots: [] });
    }

    // 4. Call Google Calendar FreeBusy API
    const timeMin = `${candidateDates[0]}T${start_time}:00-03:00`;
    const timeMax = `${candidateDates[candidateDates.length - 1]}T${end_time}:00-03:00`;

    const freeBusyRes = await fetch(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          timeZone: "America/Sao_Paulo",
          items: [{ id: calendar_id }],
        }),
      }
    );

    const freeBusyData = await freeBusyRes.json();
    if (!freeBusyRes.ok) {
      throw new Error(`FreeBusy API error: ${JSON.stringify(freeBusyData)}`);
    }

    const busyPeriods: { start: Date; end: Date }[] = (
      freeBusyData.calendars?.[calendar_id]?.busy || []
    ).map((b: any) => ({ start: new Date(b.start), end: new Date(b.end) }));

    // 5. Fetch active holds (not expired) for this form+field
    const { data: activeHolds } = await supabase
      .from("appointment_holds")
      .select("slot_start, slot_end, session_id")
      .eq("form_id", form_id)
      .eq("field_id", field_id)
      .gt("expires_at", new Date().toISOString());

    const holdPeriods: { start: Date; end: Date }[] = (activeHolds || [])
      .filter((h: any) => h.session_id !== session_id) // don't block own session's hold
      .map((h: any) => ({
        start: new Date(h.slot_start),
        end: new Date(h.slot_end),
      }));

    // 6. For each day, generate slots and filter
    const available_slots: { date: string; times: string[] }[] = [];

    for (const dateStr of candidateDates) {
      const slots = generateSlots(
        dateStr,
        start_time,
        end_time,
        slot_duration,
        buffer_minutes,
        "America/Sao_Paulo"
      );

      const freeTimes: string[] = [];
      for (const slot of slots) {
        // Skip past slots
        if (slot.start <= now) continue;

        // Check against busy periods
        const isBusy = busyPeriods.some((bp) =>
          overlaps(slot.start, slot.end, bp.start, bp.end)
        );
        if (isBusy) continue;

        // Check against holds
        const isHeld = holdPeriods.some((hp) =>
          overlaps(slot.start, slot.end, hp.start, hp.end)
        );
        if (isHeld) continue;

        freeTimes.push(toSaoPauloTime(slot.start));
      }

      if (freeTimes.length > 0) {
        available_slots.push({ date: dateStr, times: freeTimes });
      }
    }

    // 7. Best-effort cleanup: delete expired holds
    supabase
      .from("appointment_holds")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .then(() => {});

    return respond({ available_slots });
  } catch (err: any) {
    console.error("check-availability error:", err);
    return respond({ error: err.message }, 500);
  }
});
