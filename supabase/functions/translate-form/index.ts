const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const LOCALE_NAMES: Record<string, string> = {
  "pt-BR": "Brazilian Portuguese",
  "es-AR": "Argentinian Spanish",
  "en-US": "American English",
};

interface FieldInput {
  id: string;
  label: string;
  placeholder?: string;
  options?: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fields, target_locale, source_locale } = await req.json() as {
      fields: FieldInput[];
      target_locale: string;
      source_locale: string;
    };

    if (!fields?.length || !target_locale) {
      return respond({ error: "fields and target_locale required" }, 400);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return respond({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const sourceName = LOCALE_NAMES[source_locale] || source_locale || "Portuguese";
    const targetName = LOCALE_NAMES[target_locale] || target_locale;

    // Build compact input for the prompt — only translatable content
    const input = fields.map((f) => ({
      id: f.id,
      label: f.label || "",
      ...(f.placeholder ? { placeholder: f.placeholder } : {}),
      ...(f.options?.length ? { options: f.options } : {}),
    }));

    const prompt = `Translate the following form fields from ${sourceName} to ${targetName}.
Return ONLY a JSON object mapping each field "id" to its translation.
Each value must have: "label" (string), and optionally "placeholder" (string) and "options" (string[]) if they exist in the input.
Keep the same number of options in the same order. Do not translate proper nouns, URLs, or technical identifiers.

Input:
${JSON.stringify(input, null, 2)}

Output (JSON only, no markdown fences):`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Claude API error:", err);
      return respond({ error: "Translation API error" }, 502);
    }

    const data = await res.json();
    const text: string = data.content?.[0]?.text || "";

    // Parse JSON from response (strip markdown fences if present)
    const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const translations = JSON.parse(jsonStr);

    return respond({ translations });
  } catch (err) {
    console.error("translate-form error:", err);
    return respond({ error: String(err) }, 500);
  }
});
