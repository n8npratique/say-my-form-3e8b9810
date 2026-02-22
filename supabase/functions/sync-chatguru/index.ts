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

  // 1. Fetch ChatGuru integration config
  const { data: integ } = await supabase
    .from("integrations")
    .select("*")
    .eq("form_id", form_id)
    .eq("type", "chatguru")
    .maybeSingle();

  const integConfig: any = integ?.config ?? {};

  if (!integ || integConfig.enabled === false) {
    return respond({ synced: false, reason: "not_enabled" });
  }

  // 2. Fetch workspace ChatGuru credentials
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
  const chatguruCreds = wsSettings?.chatguru;

  if (!chatguruCreds?.key || !chatguruCreds?.account_id) {
    return respond({ synced: false, reason: "not_configured" });
  }

  // 3. Fetch response answers
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

  // 4. Extract phone and name from mapped fields
  const getPhone = (fieldId: string): string => {
    const raw = answers[fieldId];
    if (raw == null) return "";
    if (typeof raw === "object" && raw.phone) return raw.phone;
    return String(raw).replace(/\D/g, "");
  };

  const getName = (fieldId: string): string => {
    const raw = answers[fieldId];
    if (raw == null) return "";
    if (typeof raw === "object") {
      if (raw.first_name || raw.last_name) {
        return `${raw.first_name ?? ""} ${raw.last_name ?? ""}`.trim();
      }
      return JSON.stringify(raw);
    }
    return String(raw);
  };

  const chatNumber = integConfig.chat_number_field_id
    ? getPhone(integConfig.chat_number_field_id)
    : "";

  if (!chatNumber) {
    return respond({ synced: false, reason: "no_phone" });
  }

  const name = integConfig.name_field_id
    ? getName(integConfig.name_field_id)
    : chatNumber;

  // 5. Call ChatGuru API
  const params = new URLSearchParams({
    key: chatguruCreds.key,
    account_id: chatguruCreds.account_id,
    phone_id: integConfig.phone_id || "",
    chat_number: chatNumber,
    action: "chat_add",
    name: name,
    dialog_id: integConfig.dialog_id || "",
    text: integConfig.text || " ",
  });

  try {
    const apiRes = await fetch(`https://app5.zap.guru/api/v1?${params.toString()}`, {
      method: "POST",
    });

    const apiData = await apiRes.json().catch(() => ({}));

    if (!apiRes.ok) {
      console.error("ChatGuru API error:", apiRes.status, apiData);
      return respond({ synced: false, reason: "api_error", status: apiRes.status, detail: apiData });
    }

    return respond({ synced: true, chat_number: chatNumber, api_response: apiData });
  } catch (e) {
    console.error("ChatGuru fetch error:", e);
    return respond({ synced: false, reason: "fetch_error", detail: String(e) }, 500);
  }
});
