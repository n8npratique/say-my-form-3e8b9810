import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

// SSRF protection: block requests to private/internal networks
function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const h = parsed.hostname.toLowerCase();
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/.test(h)) return false;
    if (h === '::1' || h === '[::1]') return false;
    return true;
  } catch { return false; }
}

// Fetch with timeout to prevent hanging connections
async function fetchWithTimeout(url: string, init: RequestInit, ms = 10000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal }); }
  finally { clearTimeout(t); }
}

// UUID v4 format validation
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { form_id, response_id, session_token, event = "response.completed" } = body;

    // Input validation
    if (!form_id || typeof form_id !== "string" || !UUID_RE.test(form_id)) {
      return new Response(JSON.stringify({ error: "Invalid or missing form_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (response_id && (typeof response_id !== "string" || !UUID_RE.test(response_id))) {
      return new Response(JSON.stringify({ error: "Invalid response_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!session_token || typeof session_token !== "string" || !UUID_RE.test(session_token)) {
      return new Response(JSON.stringify({ error: "Invalid or missing session_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowedEvents = ["response.started", "response.completed"];
    if (!allowedEvents.includes(event)) {
      return new Response(JSON.stringify({ error: "Invalid event type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify ownership: the caller must provide the correct session_token for this response
    if (response_id) {
      const { data: validResponse } = await supabase
        .from("responses")
        .select("id")
        .eq("id", response_id)
        .eq("form_id", form_id)
        .eq("session_token", session_token)
        .maybeSingle();

      if (!validResponse) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch enabled webhooks that listen to this event
    const { data: webhooks } = await supabase
      .from("webhooks")
      .select("url, secret, events")
      .eq("form_id", form_id)
      .eq("is_enabled", true);

    // Filter webhooks by event
    const matched = (webhooks || []).filter((wh: any) => {
      const events = Array.isArray(wh.events) ? wh.events : ["response.completed"];
      return events.includes(event);
    });

    if (matched.length === 0) {
      return new Response(JSON.stringify({ fired: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch form name
    const { data: form } = await supabase
      .from("forms")
      .select("name, slug")
      .eq("id", form_id)
      .maybeSingle();

    // Fetch form version schema for field labels
    const { data: version } = await supabase
      .from("form_versions")
      .select("schema")
      .eq("form_id", form_id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const schema = (version?.schema as any) || {};
    const fieldMap: Record<string, { label: string; type: string }> = {};
    if (schema.fields) {
      for (const f of schema.fields) {
        fieldMap[f.id] = { label: f.label || f.id, type: f.type || "unknown" };
      }
    }

    // Build payload based on event
    let responseData: any = null;
    let structuredAnswers: any = null;

    if (response_id) {
      const { data: response } = await supabase
        .from("responses")
        .select("*, response_answers(*)")
        .eq("id", response_id)
        .single();

      if (response) {
        responseData = {
          id: response.id,
          status: response.status,
          started_at: response.started_at,
          completed_at: response.completed_at,
          meta: response.meta,
        };

        // Build structured answers with field labels
        if (response.response_answers) {
          structuredAnswers = {};
          for (const ans of response.response_answers) {
            const fieldInfo = fieldMap[ans.field_key];
            const key = fieldInfo?.label || ans.field_key;
            structuredAnswers[key] = {
              field_id: ans.field_key,
              field_type: fieldInfo?.type || "unknown",
              value: ans.value,
              value_text: ans.value_text,
            };
          }
        }
      }
    }

    const meta = responseData?.meta || {};

    const payloadObj: any = {
      event,
      timestamp: new Date().toISOString(),
      form: {
        id: form_id,
        name: form?.name || null,
        slug: form?.slug || null,
      },
    };

    if (response_id) {
      payloadObj.response = responseData;
      payloadObj.answers = structuredAnswers;
    }

    // Include scoring/tagging/outcome if available
    if (meta.score !== undefined) {
      payloadObj.scoring = {
        score: meta.score,
        range_label: meta.score_range || null,
      };
    }
    if (meta.tags) {
      payloadObj.tags = meta.tags;
    }
    if (meta.outcome_id) {
      payloadObj.outcome = {
        id: meta.outcome_id,
        label: meta.outcome_label || null,
      };
    }
    if (meta.respondent_email) {
      payloadObj.respondent_email = meta.respondent_email;
    }

    const payload = JSON.stringify(payloadObj);

    // Fire all matched webhooks (with SSRF + timeout protection)
    const results = await Promise.allSettled(
      matched.map(async (wh: any) => {
        if (!isValidWebhookUrl(wh.url)) {
          throw new Error("blocked_url");
        }
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (wh.secret) {
          headers["X-Webhook-Signature"] = await hmacSign(wh.secret, payload);
        }
        return fetchWithTimeout(wh.url, { method: "POST", headers, body: payload });
      })
    );

    return new Response(
      JSON.stringify({ fired: matched.length, results: results.map((r) => r.status) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("fire-webhooks error:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
