import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── JWT for Google Service Account (same pattern as sync-google-sheets) ──
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\\n/g, "")
    .replace(/\n/g, "")
    .replace(/\r/g, "")
    .trim();
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64url(data: ArrayBuffer | string): string {
  let str: string;
  if (typeof data === "string") {
    str = btoa(data);
  } else {
    str = btoa(String.fromCharCode(...new Uint8Array(data)));
  }
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getGoogleAccessToken(
  clientEmail: string,
  privateKey: string,
  scope: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64url(signature)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Google token error: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
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
    const { form_id, response_id, google_connection_id } = await req.json();

    // 1. Fetch integration (may be null if only appointment field is used)
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("form_id", form_id)
      .eq("type", "google_calendar")
      .maybeSingle();

    const cfg: any = integration?.config ?? {};
    // Don't return early yet — appointment fields work without the calendar integration

    // 2. Fetch form
    const { data: form } = await supabase
      .from("forms")
      .select("workspace_id, name, published_version_id")
      .eq("id", form_id)
      .maybeSingle();

    if (!form) return respond({ created: false, reason: "form_not_found" });

    // 3. Fetch response + answers
    const { data: response } = await supabase
      .from("responses")
      .select("*")
      .eq("id", response_id)
      .maybeSingle();

    const { data: answersRaw } = await supabase
      .from("response_answers")
      .select("*")
      .eq("response_id", response_id);

    const answers: Record<string, any> = {};
    const rawValues: Record<string, any> = {}; // keep raw value objects for appointment detection
    for (const ans of answersRaw ?? []) {
      answers[ans.field_key] = ans.value_text ?? (typeof ans.value === "object" ? JSON.stringify(ans.value) : ans.value);
      rawValues[ans.field_key] = ans.value;
    }

    // 4. Fetch schema
    const versionId = form.published_version_id;
    let schemaFields: any[] = [];
    if (versionId) {
      const { data: version } = await supabase
        .from("form_versions")
        .select("schema")
        .eq("id", versionId)
        .maybeSingle();
      const schema = (version?.schema as any) ?? {};
      schemaFields = schema.fields ?? [];
    }

    // 4b. Check for appointment fields to determine connection + early return
    let appointmentFieldConfig: any = null;
    for (const field of schemaFields) {
      if (field.type === "appointment" && field.appointment_config?.google_connection_id) {
        const raw = rawValues[field.id];
        const parsed = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : raw;
        if (parsed && parsed.slot_start) {
          appointmentFieldConfig = field.appointment_config;
          break;
        }
      }
    }

    // If no calendar integration and no appointment field, return early
    if ((!integration || cfg.enabled === false) && !appointmentFieldConfig) {
      return respond({ created: false, reason: "not_enabled" });
    }

    // 5. Google auth — OAuth ou Service Account (dual-token)
    const effectiveConnectionId =
      google_connection_id || appointmentFieldConfig?.google_connection_id || cfg.google_connection_id;

    let accessToken: string;

    if (effectiveConnectionId) {
      try {
        accessToken = await getOAuthAccessToken(supabase, effectiveConnectionId);
      } catch (oauthErr: any) {
        console.warn("OAuth failed, falling back to SA:", oauthErr.message);
        const { data: serviceAccount } = await supabase
          .from("google_service_accounts")
          .select("*")
          .eq("workspace_id", form.workspace_id)
          .maybeSingle();
        if (!serviceAccount) {
          throw new Error(`OAuth failed and no SA: ${oauthErr.message}`);
        }
        accessToken = await getGoogleAccessToken(
          serviceAccount.client_email,
          serviceAccount.encrypted_key,
          "https://www.googleapis.com/auth/calendar"
        );
      }
    } else {
      const { data: serviceAccount } = await supabase
        .from("google_service_accounts")
        .select("*")
        .eq("workspace_id", form.workspace_id)
        .maybeSingle();
      if (!serviceAccount) {
        return respond({ created: false, reason: "no_credentials" });
      }
      accessToken = await getGoogleAccessToken(
        serviceAccount.client_email,
        serviceAccount.encrypted_key,
        "https://www.googleapis.com/auth/calendar"
      );
    }

    // 6. Substitute variables in text
    // Maps Portuguese sub-field names to contact_info keys
    const SUBFIELD_MAP: Record<string, string> = {
      nome: "first_name", sobrenome: "last_name",
      email: "email", telefone: "phone",
      cpf: "cpf", cep: "cep", "endereço": "address", endereco: "address",
      // English aliases
      first_name: "first_name", last_name: "last_name", phone: "phone", address: "address",
    };

    const substituteVars = (text: string): string => {
      let result = text.replace(/\{\{form_name\}\}/g, form.name || "");
      // {{field:LABEL.SUBFIELD}} — dot notation for contact_info sub-fields
      // {{field:LABEL}} — full field value
      result = result.replace(/\{\{field:([^}]+)\}\}/g, (_m, expr: string) => {
        const dotIdx = expr.indexOf(".");
        if (dotIdx > 0) {
          // Dot notation: "Dados.Nome" → field "Dados", sub-field "Nome"
          const fieldLabel = expr.slice(0, dotIdx);
          const subLabel = expr.slice(dotIdx + 1).toLowerCase();
          const field = schemaFields.find(
            (f: any) => (f.label || "").toLowerCase() === fieldLabel.toLowerCase()
          );
          if (!field) return "";
          const raw = rawValues[field.id];
          const parsed = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
          if (parsed && typeof parsed === "object") {
            const key = SUBFIELD_MAP[subLabel] || subLabel;
            return parsed[key] ?? "";
          }
          return answers[field.id] ?? "";
        }
        // No dot: return full value
        const field = schemaFields.find(
          (f: any) => (f.label || "").toLowerCase() === expr.toLowerCase()
        );
        if (!field) return "";
        return answers[field.id] ?? "";
      });
      return result;
    };

    // 7. Build event datetime
    const calendarId = appointmentFieldConfig?.calendar_id || cfg.calendar_id || "primary";
    let startIso: string;
    let endIso: string;
    let appointmentFieldId: string | null = null;

    // Check if any answer came from an appointment field (has slot_start/slot_end)
    let appointmentValue: any = null;
    for (const field of schemaFields) {
      if (field.type === "appointment") {
        const raw = rawValues[field.id];
        const parsed = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : raw;
        if (parsed && parsed.slot_start && parsed.slot_end) {
          appointmentValue = parsed;
          appointmentFieldId = field.id;
          break;
        }
      }
    }

    if (appointmentValue) {
      // Use slot_start/slot_end directly from appointment picker
      startIso = appointmentValue.slot_start;
      endIso = appointmentValue.slot_end;
    } else {
      // Fallback: use date_field_id / time_field_id (existing behavior)
      const dateFieldId: string = cfg.date_field_id || "";
      const timeFieldId: string = cfg.time_field_id || "";
      const durationMinutes: number = cfg.duration_minutes ?? 60;

      let dateStr = "";
      if (dateFieldId && answers[dateFieldId]) {
        const raw = String(answers[dateFieldId]);
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
          dateStr = raw.substring(0, 10);
        } else if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
          const [d, m, y] = raw.split("/");
          dateStr = `${y}-${m}-${d}`;
        } else {
          dateStr = raw.substring(0, 10);
        }
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateStr = tomorrow.toISOString().substring(0, 10);
      }

      let timeStr = "09:00";
      if (timeFieldId && answers[timeFieldId]) {
        const raw = String(answers[timeFieldId]).trim();
        const match = raw.match(/(\d{1,2}):(\d{2})/);
        if (match) {
          timeStr = `${match[1].padStart(2, "0")}:${match[2]}`;
        }
      }

      const startDt = new Date(`${dateStr}T${timeStr}:00`);
      const endDt = new Date(startDt.getTime() + durationMinutes * 60 * 1000);
      startIso = startDt.toISOString();
      endIso = endDt.toISOString();
    }

    // 8. Build attendees
    // Use appointment config if available, otherwise fall back to integration config
    const shouldAddRespondent = appointmentFieldConfig
      ? (appointmentFieldConfig.add_respondent !== false)
      : cfg.add_respondent;

    const attendees: { email: string }[] = [];
    if (shouldAddRespondent) {
      for (const field of schemaFields) {
        if (field.type === "email") {
          const val = answers[field.id];
          if (val && String(val).includes("@")) {
            attendees.push({ email: String(val) });
          }
        } else if (field.type === "contact_info") {
          const val = answers[field.id];
          if (val && typeof val === "object" && (val as any).email) {
            attendees.push({ email: (val as any).email });
          }
        }
      }
      const meta: any = response?.meta ?? {};
      if (meta.respondent_email && String(meta.respondent_email).includes("@")) {
        const already = attendees.some((a) => a.email === meta.respondent_email);
        if (!already) attendees.push({ email: meta.respondent_email });
      }
    }

    // 9. Build event title/description (appointment config takes priority)
    const eventTitle = appointmentFieldConfig?.event_title || cfg.event_title || form.name;
    const eventDescription = appointmentFieldConfig?.event_description || cfg.event_description || "";
    const eventTimezone = appointmentFieldConfig?.timezone || cfg.timezone || "America/Sao_Paulo";

    const eventBody: any = {
      summary: substituteVars(eventTitle),
      description: substituteVars(eventDescription),
      start: { dateTime: startIso, timeZone: eventTimezone },
      end: { dateTime: endIso, timeZone: eventTimezone },
    };

    if (attendees.length > 0) {
      eventBody.attendees = attendees;
    }

    // Google Meet — add conference data if enabled
    const shouldAddMeet = appointmentFieldConfig?.add_meet || cfg.add_meet;
    if (shouldAddMeet) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    // ── FreeBusy check: verify slot is still available before creating ──
    if (appointmentValue) {
      const freeBusyRes = await fetch(
        "https://www.googleapis.com/calendar/v3/freeBusy",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            timeMin: startIso,
            timeMax: endIso,
            timeZone: eventTimezone,
            items: [{ id: calendarId }],
          }),
        }
      );

      const freeBusyData = await freeBusyRes.json();
      if (freeBusyRes.ok) {
        const busyPeriods = freeBusyData.calendars?.[calendarId]?.busy || [];
        if (busyPeriods.length > 0) {
          console.warn("Slot conflict detected at creation time:", { startIso, endIso, busyPeriods });
          return respond({
            created: false,
            reason: "slot_conflict",
            message: "Este horário já foi reservado por outra pessoa.",
          }, 409);
        }
      }
    }

    const calendarUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    );
    if (shouldAddMeet) {
      calendarUrl.searchParams.set("conferenceDataVersion", "1");
    }

    const createRes = await fetch(calendarUrl.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    });

    const eventData = await createRes.json();

    if (!createRes.ok) {
      throw new Error(`Calendar API error: ${JSON.stringify(eventData)}`);
    }

    // 10. Update last_synced_at (only if integration exists)
    if (integration?.id) {
      await supabase
        .from("integrations")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", integration.id);
    }

    // 11. Cleanup appointment holds (if from appointment field)
    if (appointmentFieldId && appointmentValue) {
      // Delete the hold for this slot
      await supabase
        .from("appointment_holds")
        .delete()
        .eq("form_id", form_id)
        .eq("field_id", appointmentFieldId)
        .eq("slot_start", appointmentValue.slot_start);

      // Best-effort: also clean expired holds
      supabase
        .from("appointment_holds")
        .delete()
        .lt("expires_at", new Date().toISOString())
        .then(() => {});
    }

    // Extract Meet link from conference data (if created)
    const meetLink = eventData.conferenceData?.entryPoints?.find(
      (ep: any) => ep.entryPointType === "video"
    )?.uri || null;

    return respond({
      created: true,
      event_id: eventData.id,
      html_link: eventData.htmlLink,
      meet_link: meetLink,
      calendar_id: calendarId,
      google_connection_id: effectiveConnectionId || null,
    });
  } catch (err: any) {
    console.error("create-calendar-event error:", err);
    return respond({ created: false, reason: "error", error: err.message }, 500);
  }
});
