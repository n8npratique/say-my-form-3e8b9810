import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return respond({ synced: false, reason: "invalid_body" }, 400);
  }

  const { form_id, response_id, action } = body;

  if (!form_id) {
    return respond({ synced: false, reason: "missing_form_id" }, 400);
  }

  try {

  // ── Helper: resolve Unnichat credentials for a form ──
  const resolveUnnichatCreds = async (fId: string) => {
    const { data: f } = await supabase.from("forms").select("workspace_id").eq("id", fId).maybeSingle();
    if (!f) return null;
    const { data: w } = await supabase.from("workspaces").select("settings").eq("id", f.workspace_id).maybeSingle();
    const s = (w?.settings as any) ?? {};
    const local = s?.unnichat ?? {};
    let global: any = {};
    if (!local?.url || !local?.phones?.length) {
      const { data: gs } = await supabase.rpc("get_global_settings");
      if (gs) { const g = typeof gs === "string" ? JSON.parse(gs) : gs; global = g?.unnichat ?? {}; }
    }
    return { ...global, ...Object.fromEntries(Object.entries(local).filter(([_, v]) => v != null && v !== "")) };
  };

  // ── Proxy actions: list_fields, list_tags (avoids CORS) ──
  if (action === "list_fields" || action === "list_tags") {
    const creds = await resolveUnnichatCreds(form_id);
    if (!creds?.url) return respond({ error: "not_configured" }, 400);

    // Resolve token from phone_id or first phone
    const phones: any[] = creds.phones || [];
    const phoneToken = body.phone_token || phones[0]?.token || creds.token;
    if (!phoneToken) return respond({ error: "no_token" }, 400);

    let baseUrl = creds.url.replace(/\/$/, "");
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`;
    const hdrs = { "Authorization": `Bearer ${phoneToken}`, "Content-Type": "application/json" };

    const endpoint = action === "list_fields" ? "/customFields/search" : "/tags/search";

    // Unnichat search filters by name substring — search multiple chars to get all results
    const searchChars = "abcdefghijklmnopqrstuvwxyz0123456789_ -".split("");
    const seen = new Set<string>();
    const allItems: any[] = [];

    for (const c of searchChars) {
      const payload = action === "list_tags"
        ? { type: "contact", name: c }
        : { name: c };
      try {
        const res = await fetchWithTimeout(`${baseUrl}${endpoint}`, {
          method: "POST", headers: hdrs, body: JSON.stringify(payload),
        });
        const json = await res.json();
        for (const item of (json?.data ?? [])) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            allItems.push(item);
          }
        }
      } catch { /* skip failed char */ }
    }

    return respond({ success: true, data: allItems });
  }

  // ── Normal sync flow ──
  // 1. Fetch Unnichat integration config
  const { data: integ } = await supabase
    .from("integrations")
    .select("*")
    .eq("form_id", form_id)
    .eq("type", "unnichat")
    .maybeSingle();

  const integConfig: any = integ?.config ?? {};

  if (!integ || integConfig.enabled === false) {
    return respond({ synced: false, reason: "not_enabled" });
  }

  // 2. Fetch workspace Unnichat credentials
  const { data: form } = await supabase
    .from("forms")
    .select("workspace_id, published_version_id, name")
    .eq("id", form_id)
    .maybeSingle();

  if (!form) return respond({ synced: false, reason: "form_not_found" });

  const { data: ws } = await supabase
    .from("workspaces")
    .select("settings")
    .eq("id", form.workspace_id)
    .maybeSingle();

  const wsSettings = (ws?.settings as any) ?? {};
  const localUnnichat = wsSettings?.unnichat ?? {};

  // Global fallback: merge owner's settings with workspace overrides
  let globalUnnichat: any = {};
  if (!localUnnichat?.url || !localUnnichat?.phones?.length) {
    const { data: globalSettings } = await supabase.rpc("get_global_settings");
    if (globalSettings) {
      const global = typeof globalSettings === "string" ? JSON.parse(globalSettings) : globalSettings;
      globalUnnichat = global?.unnichat ?? {};
    }
  }

  const unnichatCreds = {
    ...globalUnnichat,
    ...Object.fromEntries(
      Object.entries(localUnnichat).filter(([_, v]) => v != null && v !== "")
    ),
  };

  if (!unnichatCreds?.url) {
    return respond({ synced: false, reason: "not_configured" });
  }

  // Resolve token: phone_id stores the token value directly, fallback to first phone
  const phones: any[] = unnichatCreds.phones || [];
  const selectedPhone = phones.find((p: any) => p.token === integConfig.phone_id) || phones[0];
  const token = selectedPhone?.token || unnichatCreds.token; // backwards compat

  if (!token) {
    return respond({ synced: false, reason: "no_token" });
  }

  let baseUrl = unnichatCreds.url.replace(/\/$/, "");
  if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 3. Fetch response + answers + form schema
  const { data: response } = await supabase
    .from("responses")
    .select("*, response_answers(*)")
    .eq("id", response_id)
    .maybeSingle();

  if (!response) return respond({ synced: false, reason: "response_not_found" });

  const answers: Record<string, any> = {};
  for (const ans of (response.response_answers ?? [])) {
    answers[ans.field_key] = ans.value ?? ans.value_text;
  }

  const meta: any = response.meta ?? {};

  // Fetch form version schema
  const versionId = form.published_version_id;
  let schemaFields: any[] = [];
  if (versionId) {
    const { data: version } = await supabase
      .from("form_versions")
      .select("schema")
      .eq("id", versionId)
      .maybeSingle();
    if (version) {
      const schema = version.schema as any;
      schemaFields = schema?.fields ?? schema?.blocks ?? [];
    }
  }

  // Supports "fieldId::subkey" notation for explicit sub-field access,
  // with heuristic fallback for legacy configs without "::"
  const resolveField = (fieldId: string): string => {
    const [id, subkey] = fieldId.split("::");
    const raw = answers[id];
    if (raw == null) return "";
    if (subkey && typeof raw === "object") return String(raw[subkey] ?? "");
    if (typeof raw === "object") {
      if (raw.first_name || raw.last_name) return `${raw.first_name ?? ""} ${raw.last_name ?? ""}`.trim();
      if (raw.phone) return raw.phone;
      return JSON.stringify(raw);
    }
    return String(raw);
  };

  // ── substituteVars: resolve {{}} templates ──
  const substituteVars = (text: string): string => {
    const answersText = schemaFields
      .filter((f) => answers[f.id] != null && !["welcome_screen", "end_screen"].includes(f.type))
      .map((f) => {
        const val = answers[f.id];
        const label = f.label || f.type;
        const valStr = typeof val === "object" ? JSON.stringify(val) : String(val);
        return `${label}: ${valStr}`;
      })
      .join("\n");

    const tags: string[] = Array.isArray(meta.tags) ? meta.tags : [];

    let result = text
      .replace(/\{\{form_name\}\}/g, form.name || "")
      .replace(/\{\{score\}\}/g, meta.score != null ? String(meta.score) : "")
      .replace(/\{\{outcome\}\}/g, meta.outcome_label || "")
      .replace(/\{\{tags\}\}/g, tags.join(", "))
      .replace(/\{\{respondent_email\}\}/g, String(
        Object.values(answers).find((v) => typeof v === "string" && v.includes("@")) || ""
      ))
      .replace(/\{\{answers\}\}/g, answersText);

    // {{field:LABEL}} → value of field by label
    result = result.replace(/\{\{field:([^}]+)\}\}/g, (_match, label: string) => {
      const field = schemaFields.find(
        (f) => (f.label || "").toLowerCase() === label.toLowerCase()
      );
      if (!field) return "";
      const val = answers[field.id];
      if (!val) return "";
      if (typeof val === "object") {
        if (val.first_name || val.last_name) return `${val.first_name ?? ""} ${val.last_name ?? ""}`.trim();
        if (val.phone) return val.phone;
        return JSON.stringify(val);
      }
      return String(val);
    });

    return result;
  };

  const stepsCompleted: string[] = [];
  let contactId: string | null = null;

  // ── STEP A: Create contact ──
  if (integConfig.create_contact && integConfig.contact_phone_field_id) {
    const phone = resolveField(integConfig.contact_phone_field_id).replace(/\D/g, "");
    const name = integConfig.contact_name_field_id
      ? resolveField(integConfig.contact_name_field_id)
      : phone;
    const email = integConfig.contact_email_field_id
      ? resolveField(integConfig.contact_email_field_id)
      : "";

    if (phone) {
      try {
        // Try to search existing contact first
        const searchRes = await fetchWithTimeout(`${baseUrl}/contact/search`, {
          method: "POST",
          headers,
          body: JSON.stringify({ phone }),
        });
        const searchJson = await searchRes.json();
        const existing = searchJson?.data?.[0] ?? searchJson?.contact;

        if (existing?.id) {
          contactId = existing.id;
          stepsCompleted.push("contact_found");
        } else {
          const contactBody: any = { name, phone };
          if (email) contactBody.email = email;
          const createRes = await fetchWithTimeout(`${baseUrl}/contact`, {
            method: "POST",
            headers,
            body: JSON.stringify(contactBody),
          });
          const createJson = await createRes.json();
          contactId = createJson?.data?.id ?? createJson?.id ?? null;
          if (contactId) stepsCompleted.push("contact");
        }
      } catch (e) {
        console.error("Error creating contact:", e);
      }
    }
  }

  if (!contactId) {
    return respond({ synced: false, reason: "no_contact_id", steps_completed: stepsCompleted });
  }

  // ── STEP B: Custom fields ──
  if (integConfig.send_custom_fields && integConfig.custom_field_mappings?.length) {
    for (const mapping of integConfig.custom_field_mappings) {
      if (!mapping.unnichat_field_id) continue;
      // Support new template format (value_template) and legacy (form_field_id)
      const value = mapping.value_template
        ? substituteVars(mapping.value_template)
        : mapping.form_field_id ? resolveField(mapping.form_field_id) : "";
      if (!value) continue;
      try {
        await fetchWithTimeout(`${baseUrl}/contact/${contactId}/customFields`, {
          method: "POST",
          headers,
          body: JSON.stringify({ field_id: mapping.unnichat_field_id, field_value: value }),
        });
        await new Promise((r) => setTimeout(r, 500)); // rate limit
      } catch (e) {
        console.error("Error setting custom field:", e);
      }
    }
    stepsCompleted.push("fields");
  }

  // ── STEP C: Tags ──
  if (integConfig.add_tags) {
    // Fixed tags
    if (integConfig.fixed_tags?.length) {
      for (const tagId of integConfig.fixed_tags) {
        if (!tagId) continue;
        try {
          await fetchWithTimeout(`${baseUrl}/contact/${contactId}/tags`, {
            method: "POST",
            headers,
            body: JSON.stringify({ tag_id: tagId }),
          });
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error("Error adding fixed tag:", e);
        }
      }
    }

    // Conditional tags
    if (integConfig.conditional_tags?.length) {
      for (const rule of integConfig.conditional_tags) {
        if (!rule.unnichat_tag_id) continue;
        let matches = false;

        if (rule.condition_type === "outcome") {
          matches = meta.outcome_label === rule.condition_value;
        } else if (rule.condition_type === "score_range") {
          matches = meta.score_range === rule.condition_value;
        } else if (rule.condition_type === "form_tag") {
          const tags: string[] = meta.tags ?? [];
          matches = tags.includes(rule.condition_value);
        }

        if (matches) {
          try {
            await fetch(`${baseUrl}/contact/${contactId}/tags`, {
              method: "POST",
              headers,
              body: JSON.stringify({ tag_id: rule.unnichat_tag_id }),
            });
            await new Promise((r) => setTimeout(r, 300));
          } catch (e) {
            console.error("Error adding conditional tag:", e);
          }
        }
      }
    }
    stepsCompleted.push("tags");
  }

  // ── STEP D: CRM Deal ──
  if (integConfig.create_deal && integConfig.pipeline_id && integConfig.column_id) {
    let dealValue = integConfig.deal_value_fixed ?? 0;
    if (integConfig.deal_value_field_id) {
      const raw = answers[integConfig.deal_value_field_id];
      if (raw != null) dealValue = Number(raw) || 0;
    }
    try {
      await fetchWithTimeout(`${baseUrl}/contact/${contactId}/crm`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          pipeline_id: integConfig.pipeline_id,
          column_id: integConfig.column_id,
          value: dealValue,
        }),
      });
      stepsCompleted.push("deal");
    } catch (e) {
      console.error("Error creating CRM deal:", e);
    }
  }

  return respond({ synced: true, contact_id: contactId, steps_completed: stepsCompleted });
  } catch (err: any) {
    console.error("sync-unnichat error:", err);
    return respond({ synced: false, reason: "internal_error" }, 500);
  }
});
