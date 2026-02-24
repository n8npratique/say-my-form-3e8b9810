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

const FIELD_TYPES = [
  "short_text", "long_text", "email", "phone", "website",
  "number", "date", "multiple_choice", "dropdown",
  "yes_no", "legal", "checkbox", "nps", "opinion_scale", "rating",
  "ranking", "file_upload", "contact_info", "statement",
  "welcome_screen", "end_screen",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description } = await req.json() as { description: string };

    if (!description?.trim()) {
      return respond({ error: "description is required" }, 400);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return respond({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const prompt = `Você é um assistente que cria formulários conversacionais (estilo Typeform) a partir de descrições em linguagem natural.

Tipos de campo disponíveis: ${FIELD_TYPES.join(", ")}

Regras:
- Cada campo precisa de: id (UUID v4), type (um dos tipos acima), label (texto da pergunta em português), required (boolean)
- Para multiple_choice, dropdown, checkbox, ranking: inclua "options" (array de strings)
- Para contact_info: inclua "contact_fields" com array de: "first_name", "last_name", "email", "phone", "cpf", "cep", "address"
- Para rating: não precisa de options (sempre 1-5 estrelas)
- Para nps: não precisa de options (sempre 0-10)
- Para opinion_scale: inclua "options" de "1" a "5" ou "1" a "10"
- Comece com welcome_screen se fizer sentido
- Termine com end_screen com mensagem de agradecimento
- Gere entre 3 e 15 campos dependendo da complexidade
- Retorne SOMENTE um JSON válido com a estrutura: { "name": "Nome do formulário", "fields": [...] }
- Não inclua markdown fences, apenas JSON puro

Descrição do usuário:
${description}

JSON:`;

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
      return respond({ error: "AI generation failed" }, 502);
    }

    const data = await res.json();
    const text: string = data.content?.[0]?.text || "";

    const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const result = JSON.parse(jsonStr);

    return respond(result);
  } catch (err) {
    console.error("generate-form error:", err);
    return respond({ error: String(err) }, 500);
  }
});
