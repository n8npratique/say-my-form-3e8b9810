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
    .replace(/\n/g, "");
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
    const { form_id, response_id } = await req.json();

    // 1. Fetch integration
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("form_id", form_id)
      .eq("type", "google_calendar")
      .maybeSingle();

    const cfg: any = integration?.config ?? {};
    if (!integration || cfg.enabled === false) {
      return respond({ created: false, reason: "not_enabled" });
    }

    // 2. Fetch form + service account
    const { data: form } = await supabase
      .from("forms")
      .select("workspace_id, name, published_version_id")
      .eq("id", form_id)
      .maybeSingle();

    if (!form) return respond({ created: false, reason: "form_not_found" });

    const { data: serviceAccount } = await supabase
      .from("google_service_accounts")
      .select("*")
      .eq("workspace_id", form.workspace_id)
      .maybeSingle();

    if (!serviceAccount) {
      return respond({ created: false, reason: "no_service_account" });
    }

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
    for (const ans of answersRaw ?? []) {
      answers[ans.field_key] = ans.value_text ?? (typeof ans.value === "object" ? JSON.stringify(ans.value) : ans.value);
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

    // 5. Google auth — calendar scope
    const accessToken = await getGoogleAccessToken(
      serviceAccount.client_email,
      serviceAccount.encrypted_key,
      "https://www.googleapis.com/auth/calendar"
    );

    // 6. Substitute variables in text
    const substituteVars = (text: string): string => {
      let result = text.replace(/\{\{form_name\}\}/g, form.name || "");
      // {{field:LABEL}} — look up field by label
      result = result.replace(/\{\{field:([^}]+)\}\}/g, (_m, label: string) => {
        const field = schemaFields.find(
          (f: any) => (f.label || "").toLowerCase() === label.toLowerCase()
        );
        if (!field) return "";
        return answers[field.id] ?? "";
      });
      return result;
    };

    // 7. Build event datetime
    const calendarId = cfg.calendar_id || "primary";
    const dateFieldId: string = cfg.date_field_id || "";
    const timeFieldId: string = cfg.time_field_id || "";
    const durationMinutes: number = cfg.duration_minutes ?? 60;

    // Get date string from field
    let dateStr = "";
    if (dateFieldId && answers[dateFieldId]) {
      // Could be ISO string or dd/mm/yyyy etc
      const raw = String(answers[dateFieldId]);
      // Try to parse common formats
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        dateStr = raw.substring(0, 10);
      } else if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
        const [d, m, y] = raw.split("/");
        dateStr = `${y}-${m}-${d}`;
      } else {
        dateStr = raw.substring(0, 10);
      }
    } else {
      // Default to today + 1 day
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateStr = tomorrow.toISOString().substring(0, 10);
    }

    // Get time string from field
    let timeStr = "09:00";
    if (timeFieldId && answers[timeFieldId]) {
      const raw = String(answers[timeFieldId]).trim();
      // Match HH:MM pattern
      const match = raw.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        timeStr = `${match[1].padStart(2, "0")}:${match[2]}`;
      }
    }

    const startDt = new Date(`${dateStr}T${timeStr}:00`);
    const endDt = new Date(startDt.getTime() + durationMinutes * 60 * 1000);

    const startIso = startDt.toISOString();
    const endIso = endDt.toISOString();

    // 8. Build attendees
    const attendees: { email: string }[] = [];
    if (cfg.add_respondent) {
      // Collect all email-looking values from answers
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
      // Also check meta for respondent_email
      const meta: any = response?.meta ?? {};
      if (meta.respondent_email && String(meta.respondent_email).includes("@")) {
        const already = attendees.some((a) => a.email === meta.respondent_email);
        if (!already) attendees.push({ email: meta.respondent_email });
      }
    }

    // 9. Create event
    const eventBody: any = {
      summary: substituteVars(cfg.event_title || form.name),
      description: substituteVars(cfg.event_description || ""),
      start: { dateTime: startIso, timeZone: "America/Sao_Paulo" },
      end: { dateTime: endIso, timeZone: "America/Sao_Paulo" },
    };

    if (attendees.length > 0) {
      eventBody.attendees = attendees;
    }

    const createRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      }
    );

    const eventData = await createRes.json();

    if (!createRes.ok) {
      throw new Error(`Calendar API error: ${JSON.stringify(eventData)}`);
    }

    // 10. Update last_synced_at
    await supabase
      .from("integrations")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", integration.id);

    return respond({ created: true, event_id: eventData.id, html_link: eventData.htmlLink });
  } catch (err: any) {
    console.error("create-calendar-event error:", err);
    return respond({ created: false, reason: "error", error: err.message }, 500);
  }
});
