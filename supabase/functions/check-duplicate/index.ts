import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── Service Account handler (bypasses RLS via service_role_key) ──
async function handleServiceAccount(body: any): Promise<Response> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { sa_action, workspace_id, client_email, private_key, service_account_id, auth_token } = body;

  // Verify user is authenticated
  if (!auth_token) return respond({ error: "Not authenticated" }, 401);

  const { data: { user }, error: authErr } = await supabase.auth.getUser(auth_token);
  if (authErr || !user) return respond({ error: "Invalid token" }, 401);

  if (!workspace_id) return respond({ error: "workspace_id required" }, 400);

  // Verify user belongs to workspace
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) return respond({ error: "Not authorized" }, 403);

  // GET
  if (sa_action === "get") {
    const { data } = await supabase
      .from("google_service_accounts")
      .select("id, client_email, name")
      .eq("workspace_id", workspace_id)
      .maybeSingle();
    return respond({ service_account: data });
  }

  // Only owner/admin can save/delete
  if (!["owner", "admin"].includes(member.role)) {
    return respond({ error: "Not authorized" }, 403);
  }

  // SAVE
  if (sa_action === "save") {
    if (!client_email || !private_key) return respond({ error: "client_email and private_key required" }, 400);

    await supabase.from("google_service_accounts").delete().eq("workspace_id", workspace_id);

    const { data, error } = await supabase
      .from("google_service_accounts")
      .insert({ workspace_id, name: client_email, client_email, encrypted_key: private_key })
      .select("id, client_email, name")
      .single();

    if (error) {
      console.error("check-duplicate save error:", error);
      return respond({ error: "internal_error" }, 500);
    }
    return respond({ success: true, service_account: data });
  }

  // DELETE
  if (sa_action === "delete") {
    if (!service_account_id) return respond({ error: "service_account_id required" }, 400);
    await supabase.from("google_service_accounts").delete().eq("id", service_account_id);
    return respond({ success: true });
  }

  return respond({ error: "Invalid sa_action" }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Route: service account management
    if (body.action === "manage-service-account") {
      return await handleServiceAccount(body);
    }

    // Route: original check-duplicate logic
    const { form_id, checks } = body;

    if (!form_id || !Array.isArray(checks) || checks.length === 0) {
      return new Response(JSON.stringify({ duplicate: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // For each check, look for a completed response with the same value
    for (const check of checks) {
      const { field_key, value } = check;
      if (!field_key || !value) continue;

      const normalizedValue = String(value).trim().toLowerCase();
      if (!normalizedValue) continue;

      // Find response_answers where value_text matches (case-insensitive)
      // joined with responses that are completed for this form
      const { data, error } = await supabase
        .from("response_answers")
        .select("id, response_id, responses!inner(status, form_id)")
        .eq("field_key", field_key)
        .eq("responses.form_id", form_id)
        .eq("responses.status", "completed")
        .limit(1);

      if (error) {
        console.error("Query error:", error);
        continue;
      }

      // Check if any matching answer has the same normalized value
      if (data && data.length > 0) {
        // We need to do a more precise check with value_text
        const { data: matches } = await supabase
          .from("response_answers")
          .select("id, value_text, response_id")
          .eq("field_key", field_key)
          .in(
            "response_id",
            await getCompletedResponseIds(supabase, form_id)
          );

        if (matches) {
          const found = matches.find(
            (m) =>
              m.value_text &&
              m.value_text.trim().toLowerCase() === normalizedValue
          );
          if (found) {
            return new Response(
              JSON.stringify({ duplicate: true, field: field_key }),
              {
                headers: {
                  ...corsHeaders,
                  "Content-Type": "application/json",
                },
              }
            );
          }
        }
      }
    }

    return new Response(JSON.stringify({ duplicate: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-duplicate error:", err);
    return new Response(JSON.stringify({ duplicate: false, error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getCompletedResponseIds(
  supabase: any,
  formId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("responses")
    .select("id")
    .eq("form_id", formId)
    .eq("status", "completed");
  return (data || []).map((r: any) => r.id);
}
