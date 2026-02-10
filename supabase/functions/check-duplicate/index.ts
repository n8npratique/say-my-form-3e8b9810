import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { form_id, checks } = await req.json();

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
    return new Response(JSON.stringify({ duplicate: false, error: String(err) }), {
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
