import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function hmacSign(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { form_id, response_id } = await req.json();
    if (!form_id || !response_id) {
      return new Response(JSON.stringify({ error: "Missing form_id or response_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch enabled webhooks
    const { data: webhooks } = await supabase
      .from("webhooks")
      .select("url, secret")
      .eq("form_id", form_id)
      .eq("is_enabled", true);

    if (!webhooks || webhooks.length === 0) {
      return new Response(JSON.stringify({ fired: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch response + answers
    const { data: response } = await supabase
      .from("responses")
      .select("*, response_answers(*)")
      .eq("id", response_id)
      .single();

    const payload = JSON.stringify({
      event: "response.completed",
      form_id,
      response_id,
      response,
    });

    // Fire all webhooks
    const results = await Promise.allSettled(
      webhooks.map(async (wh) => {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (wh.secret) {
          headers["X-Webhook-Signature"] = await hmacSign(wh.secret, payload);
        }
        return fetch(wh.url, { method: "POST", headers, body: payload });
      })
    );

    return new Response(
      JSON.stringify({ fired: webhooks.length, results: results.map((r) => r.status) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
