import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchWithTimeout(url: string, init: RequestInit, ms = 10000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal }); }
  finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const respond = (obj: object, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
  const body = await req.json();
  const { form_id, response_id, test_mode, test_template, meet_link: bodyMeetLink, calendar_link: bodyCalendarLink } = body;

  // ── 1. Fetch WhatsApp integration ──
  const { data: integ } = await supabase
    .from("integrations")
    .select("*")
    .eq("form_id", form_id)
    .eq("type", "whatsapp")
    .maybeSingle();

  const integConfig: any = integ?.config ?? {};

  if (!test_mode && (!integ || integConfig.enabled === false)) {
    return respond({ sent: false, reason: "not_enabled" });
  }

  // ── 2. Fetch workspace WAHA config ──
  const { data: form } = await supabase
    .from("forms")
    .select("workspace_id, name, published_version_id")
    .eq("id", form_id)
    .maybeSingle();

  if (!form) return respond({ sent: false, reason: "form_not_found" });

  const { data: ws } = await supabase
    .from("workspaces")
    .select("settings")
    .eq("id", form.workspace_id)
    .maybeSingle();

  const wsSettings = (ws?.settings as any) ?? {};
  const waha = wsSettings?.waha;

  if (!waha?.url || !waha?.session) {
    return respond({ sent: false, reason: "waha_not_configured" });
  }

  const wahaUrl = waha.url.replace(/\/$/, "");
  const wahaSession = waha.session || "default";
  const defaultNumber = waha.default_number || "";

  // ── 3. Fetch response + answers (skip in test_mode) ──
  const answers: Record<string, any> = {};
  const meta: any = {};
  let formName = form.name;

  if (!test_mode && response_id) {
    const { data: response } = await supabase
      .from("responses")
      .select("*, response_answers(*)")
      .eq("id", response_id)
      .maybeSingle();

    if (!response) return respond({ sent: false, reason: "response_not_found" });

    for (const ans of response.response_answers ?? []) {
      answers[ans.field_key] = ans.value ?? ans.value_text;
    }
    Object.assign(meta, response.meta ?? {});
  }

  // Fetch schema for field labels
  let schemaFields: any[] = [];
  if (form.published_version_id) {
    const { data: version } = await supabase
      .from("form_versions")
      .select("schema")
      .eq("id", form.published_version_id)
      .maybeSingle();
    if (version) {
      const schema = version.schema as any;
      schemaFields = schema?.fields ?? [];
    }
  }

  // ── Extract appointment data ──
  let appointmentDatetime = "";
  let appointmentField: any = null;
  for (const f of schemaFields) {
    if (f.type === "appointment") {
      appointmentField = f;
      const raw = answers[f.id];
      const parsed = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
      if (parsed?.slot_start) {
        const dt = new Date(parsed.slot_start);
        appointmentDatetime = dt.toLocaleString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Sao_Paulo",
        });
      }
      break;
    }
  }

  // Build cancel URL
  const sessionToken = meta.session_token || "";
  const siteUrl = Deno.env.get("SITE_URL") || req.headers.get("origin") || "";
  const cancelUrl = (sessionToken && appointmentField && siteUrl)
    ? `${siteUrl}/cancel/${sessionToken}`
    : "";

  const meetLink = bodyMeetLink || meta.meet_link || "";

  // ── Helper: format phone → "5511999999999@c.us" ──
  const formatPhone = (raw: string): string => {
    // Strip @c.us if already present, then work with digits only
    const cleaned = raw.replace(/@c\.us$/i, "");
    const digits = cleaned.replace(/\D/g, "");
    if (!digits) return "";
    // 10-11 digits = Brazilian local (DDD + number) → prepend 55
    // 12-13 digits starting with 55 = already international
    const international = (digits.length <= 11) ? `55${digits}` : digits;
    return `${international}@c.us`;
  };

  // ── Helper: extract phone from field value ──
  const extractPhone = (val: any): string => {
    if (!val) return "";
    if (typeof val === "object" && val.phone) return val.phone;
    // Try parsing JSON string (contact_info stores as JSON)
    if (typeof val === "string" && val.startsWith("{")) {
      try {
        const parsed = JSON.parse(val);
        if (parsed.phone) return parsed.phone;
      } catch { /* not JSON */ }
    }
    return String(val);
  };

  // ── Helper: find phone field value from answers ──
  const getRespondentPhone = (): string => {
    for (const field of schemaFields) {
      if (field.type === "phone" || field.type === "contact_info") {
        const val = answers[field.id];
        if (val) {
          const phone = extractPhone(val);
          if (phone) return phone;
        }
      }
    }
    // fallback: any field with "phone" or "tel" in label
    for (const field of schemaFields) {
      const lbl = (field.label || "").toLowerCase();
      if (lbl.includes("phone") || lbl.includes("telefone") || lbl.includes("whatsapp") || lbl.includes("celular")) {
        const val = answers[field.id];
        if (val) return extractPhone(val);
      }
    }
    return "";
  };

  // ── Helper: substitute variables ──
  const substituteVars = (text: string): string => {
    const answersText = schemaFields
      .filter((f) => answers[f.id] != null && !["welcome_screen", "end_screen"].includes(f.type))
      .map((f) => {
        const val = answers[f.id];
        const label = f.label || f.type;
        const valStr = typeof val === "object" ? JSON.stringify(val) : String(val);
        return `*${label}:* ${valStr}`;
      })
      .join("\n");

    const tags: string[] = Array.isArray(meta.tags) ? meta.tags : [];

    let result = text
      .replace(/\{\{form_name\}\}/g, formName || "")
      .replace(/\{\{score\}\}/g, meta.score != null ? String(meta.score) : "")
      .replace(/\{\{outcome\}\}/g, meta.outcome_label || "")
      .replace(/\{\{tags\}\}/g, tags.join(", "))
      .replace(/\{\{respondent_email\}\}/g, String(
        Object.values(answers).find((v) =>
          typeof v === "string" && v.includes("@")
        ) || ""
      ))
      .replace(/\{\{answers\}\}/g, answersText)
      .replace(/\{\{appointment_datetime\}\}/g, appointmentDatetime)
      .replace(/\{\{meet_link\}\}/g, meetLink)
      .replace(/\{\{cancel_url\}\}/g, cancelUrl);

    // {{field:LABEL}} or {{field:LABEL.SUBFIELD}} → value of field
    const SUBFIELD_MAP: Record<string, string> = {
      nome: "first_name", sobrenome: "last_name",
      email: "email", telefone: "phone",
      cpf: "cpf", cep: "cep", "endereço": "address", endereco: "address",
      first_name: "first_name", last_name: "last_name", phone: "phone", address: "address",
    };

    result = result.replace(/\{\{field:([^}]+)\}\}/g, (_match, fullLabel: string) => {
      const dotIdx = fullLabel.indexOf(".");
      if (dotIdx > 0) {
        // {{field:Label.Subfield}} — contact_info subfield
        const parentLabel = fullLabel.substring(0, dotIdx);
        const subLabel = fullLabel.substring(dotIdx + 1).toLowerCase();
        const field = schemaFields.find(
          (f) => (f.label || "").toLowerCase() === parentLabel.toLowerCase()
        );
        if (!field) return "";
        const raw = answers[field.id];
        const parsed = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
        if (parsed && typeof parsed === "object") {
          const key = SUBFIELD_MAP[subLabel] || subLabel;
          return parsed[key] ?? "";
        }
        return typeof raw === "object" ? JSON.stringify(raw) : String(raw || "");
      }
      // {{field:LABEL}} — simple field
      const field = schemaFields.find(
        (f) => (f.label || "").toLowerCase() === fullLabel.toLowerCase()
      );
      if (!field) return "";
      const val = answers[field.id];
      if (!val) return "";
      return typeof val === "object" ? JSON.stringify(val) : String(val);
    });

    return result;
  };

  // ── Helper: send WAHA message ──
  const wahaApiKey = waha.api_key || "";

  const sendWaha = async (chatId: string, text: string): Promise<boolean> => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (wahaApiKey) headers["X-Api-Key"] = wahaApiKey;
      const res = await fetchWithTimeout(`${wahaUrl}/api/sendText`, {
        method: "POST",
        headers,
        body: JSON.stringify({ chatId, text, session: wahaSession }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  // ── 4. Test mode: send to default_number with given template ──
  if (test_mode && test_template) {
    if (!defaultNumber) return respond({ sent: false, reason: "no_default_number" });
    const message = substituteVars(test_template.message || "Teste de mensagem WhatsApp 🧪");
    const ok = await sendWaha(formatPhone(defaultNumber), message);
    return respond({ sent: ok });
  }

  // ── 5. Normal mode: iterate templates ──
  const templates: any[] = integConfig.templates ?? [];
  const activeTemplates = templates.filter((t: any) => t.enabled);

  if (activeTemplates.length === 0) {
    return respond({ sent: false, reason: "no_active_templates" });
  }

  let sentCount = 0;

  for (const tmpl of activeTemplates) {
    let chatId = "";

    if (tmpl.recipient === "respondent") {
      const phone = getRespondentPhone();
      if (!phone) continue; // no phone found, skip
      chatId = formatPhone(phone);
    } else {
      // owner
      if (!defaultNumber) continue;
      chatId = formatPhone(defaultNumber);
    }

    const message = substituteVars(tmpl.message || "");
    if (!message) continue;

    const ok = await sendWaha(chatId, message);
    if (ok) sentCount++;

    // Small delay between messages to avoid rate limit
    if (activeTemplates.length > 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return respond({ sent: sentCount > 0, count: sentCount });
  } catch (err: any) {
    console.error("send-whatsapp error:", err);
    return respond({ sent: false, reason: "internal_error" }, 500);
  }
});
