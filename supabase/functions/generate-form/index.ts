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

    const systemPrompt = `Você é um especialista em criar formulários conversacionais (estilo Typeform) para a plataforma TecForms.
Você recebe uma descrição do usuário e retorna SOMENTE um JSON válido (sem markdown fences, sem explicações).

## TIPOS DE CAMPO DISPONÍVEIS E QUANDO USAR CADA UM:

### Contato e dados pessoais:
- "contact_info" — Use quando pedirem nome, sobrenome, dados pessoais, informações de contato. Inclua "contact_fields" com array dos sub-campos necessários: "first_name", "last_name", "email", "phone", "cpf", "cep", "address". Exemplo: se pedirem nome e sobrenome, use contact_info com contact_fields: ["first_name", "last_name"]
- "email" — Use APENAS quando precisar de um campo de email isolado (sem outros dados de contato)
- "phone" — Use APENAS quando precisar de um campo de telefone isolado
- "address" — Endereço completo como campo separado
- "website" — URL de site

### Texto:
- "short_text" — Respostas curtas (nome de empresa, cargo, cidade, etc.)
- "long_text" — Respostas longas (comentários, sugestões, descrições, feedback aberto)
- "statement" — Texto informativo exibido ao respondente, sem campo de input (instruções, avisos)

### Escolhas:
- "multiple_choice" — Escolha UMA opção de várias. Inclua "options" (array de strings). Use para perguntas como "Como nos conheceu?", "Qual sua área?"
- "dropdown" — Menu suspenso para listas longas (estados, cidades, horários). Inclua "options"
- "checkbox" — Múltiplas opções selecionáveis (pode marcar várias). Inclua "options"
- "yes_no" — Pergunta de Sim/Não
- "legal" — Aceite de termos/condições
- "image_choice" — Escolha com imagens (para opções visuais)

### Avaliação e pesquisa:
- "nps" — Net Promoter Score (0-10). Use quando pedirem NPS ou "probabilidade de recomendar". NÃO inclua options.
- "opinion_scale" — Escala numérica configurável. Inclua "options" de "1" a "5" ou "1" a "10"
- "rating" — Estrelas (1-5). Use para avaliações gerais (atendimento, qualidade, etc.). NÃO inclua options.
- "ranking" — Classificação por arrastar itens em ordem de preferência. Inclua "options"
- "matrix" — Matriz de opções (linhas × colunas)

### Números e datas:
- "number" — Campo numérico (idade, quantidade, valor)
- "date" — Seletor de data

### Agendamento:
- "appointment" — Campo de AGENDAMENTO com calendário integrado ao Google Calendar. Use SEMPRE que o formulário envolver agendamento, reserva, marcação de horário, consulta, reunião. Este campo mostra um calendário visual com horários disponíveis.

### Outros:
- "file_upload" — Upload de arquivo (currículo, documento, foto)
- "welcome_screen" — Tela de boas-vindas no início
- "end_screen" — Tela final de agradecimento
- "question_group" — Agrupar perguntas relacionadas
- "redirect_url" — Redirecionar para URL externa ao final

## LÓGICA CONDICIONAL (BRANCHING / JUMPS):

Quando a descrição do formulário indicar perguntas condicionais (ex: "Se sim, pergunte X", "Se marcou Outras, pergunte qual", "Se não, pule para Y"), você DEVE gerar regras de lógica condicional.

A lógica é um array de objetos FieldLogic:
{
  "field_id": "id-do-campo-que-dispara-a-regra",
  "rules": [
    {
      "condition": { "op": "equals", "value": "valor-que-ativa" },
      "action": { "type": "jump_to", "target": "id-do-campo-destino" }
    }
  ],
  "default_action": { "type": "next" }
}

### Operadores disponíveis para "op":
- "equals" — resposta é igual ao valor
- "not_equals" — resposta é diferente do valor
- "contains" — resposta contém o valor (para checkbox/texto)
- "greater_than" — maior que (para números/nps/rating)
- "less_than" — menor que
- "is_set" — campo foi preenchido (não precisa de value)
- "is_not_set" — campo não foi preenchido

### Tipos de action:
- { "type": "next" } — ir para a próxima pergunta (padrão)
- { "type": "jump_to", "target": "campo-id" } — pular para um campo específico
- { "type": "end" } — encerrar o formulário

### Exemplos de lógica:
1. Se "Sim" → mostrar pergunta de detalhe, Se "Não" → pular para seção seguinte:
   - field_id do campo yes_no
   - rules: [{ condition: { op: "equals", value: "Não" }, action: { type: "jump_to", target: "id-da-proxima-secao" } }]
   - default_action: { type: "next" } (Se Sim, segue normalmente)

2. Se marcou "Outras oportunidades" → mostrar campo "qual?", senão pular:
   - field_id do campo multiple_choice
   - rules: [{ condition: { op: "not_equals", value: "Outras oportunidades" }, action: { type: "jump_to", target: "id-do-campo-apos-qual" } }]
   - default_action: { type: "next" }

## REGRAS IMPORTANTES:

1. Cada campo DEVE ter: id (UUID v4 válido), type, label (em português), required (boolean)
2. Para multiple_choice, dropdown, checkbox, ranking: OBRIGATÓRIO incluir "options" (array de strings)
3. Para contact_info: OBRIGATÓRIO incluir "contact_fields" com os sub-campos relevantes
4. PREFIRA contact_info quando o usuário pedir nome + sobrenome + telefone + email juntos, em vez de campos separados
5. PREFIRA appointment quando mencionarem agendamento, horário, consulta, reserva, marcação
6. PREFIRA nps quando mencionarem NPS ou "recomendar"
7. PREFIRA rating quando mencionarem estrelas ou avaliação simples
8. Comece com welcome_screen se fizer sentido para o contexto
9. SEMPRE termine com end_screen
10. Gere entre 3 e 25 campos dependendo da complexidade
11. Labels devem ser perguntas naturais em português (ex: "Qual é o seu nome completo?" em vez de "Nome")
12. SEMPRE gere logic quando houver perguntas condicionais ("se sim", "se marcou X", "se não")
13. Os IDs nos targets do logic DEVEM ser os mesmos IDs dos campos no array fields
14. Retorne SOMENTE JSON puro: { "name": "...", "fields": [...], "logic": [...] }
15. Se não houver lógica condicional, retorne "logic": []`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: description }],
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
