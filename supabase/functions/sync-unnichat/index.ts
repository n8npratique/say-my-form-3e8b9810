import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { form_id, response_id } = await req.json();

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

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
    .select("workspace_id, published_version_id")
    .eq("id", form_id)
    .maybeSingle();

  if (!form) return respond({ synced: false, reason: "form_not_found" });

  const { data: ws } = await supabase
    .from("workspaces")
    .select("settings")
    .eq("id", form.workspace_id)
    .maybeSingle();

  const wsSettings = (ws?.settings as any) ?? {};
  const unnichatCreds = wsSettings?.unnichat;

  if (!unnichatCreds?.url) {
    return respond({ synced: false, reason: "not_configured" });
  }

  // Resolve token: use phone_id from integration config, fallback to first phone, then legacy token
  const phones: any[] = unnichatCreds.phones || [];
  const selectedPhone = phones.find((p: any) => p.phone_id === integConfig.phone_id) || phones[0];
  const token = selectedPhone?.token || unnichatCreds.token; // backwards compat

  if (!token) {
    return respond({ synced: false, reason: "no_token" });
  }

  const baseUrl = unnichatCreds.url.replace(/\/$/, "");
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
        const searchRes = await fetch(`${baseUrl}/contact/search`, {
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
          const createRes = await fetch(`${baseUrl}/contact`, {
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
      if (!mapping.form_field_id || !mapping.unnichat_field_id) continue;
      const value = resolveField(mapping.form_field_id);
      if (!value) continue;
      try {
        await fetch(`${baseUrl}/contact/${contactId}/customFields`, {
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
          await fetch(`${baseUrl}/contact/${contactId}/tags`, {
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
      await fetch(`${baseUrl}/contact/${contactId}/crm`, {
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
});
