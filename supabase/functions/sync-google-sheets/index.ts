import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── JWT manual para Google Service Account ──
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64url(data: ArrayBuffer | string): string {
  let str: string;
  if (typeof data === "string") {
    str = btoa(data);
  } else {
    str = btoa(String.fromCharCode(...new Uint8Array(data)));
  }
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getGoogleAccessToken(
  clientEmail: string,
  privateKey: string,
  scope: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64url(signature)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Google token error: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

// ── Formatar data BR ──
function formatDateBR(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const { form_id, response_id, batch_sync } = body;

    if (!form_id || (!response_id && !batch_sync)) {
      return new Response(
        JSON.stringify({ synced: false, reason: "missing_params" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Buscar integração ativa
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("form_id", form_id)
      .eq("type", "google_sheets")
      .maybeSingle();

    if (!integration || (integration.config as any)?.enabled === false) {
      return new Response(
        JSON.stringify({ synced: false, reason: "not_configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar service account do workspace
    const { data: form } = await supabase
      .from("forms")
      .select("workspace_id, name")
      .eq("id", form_id)
      .maybeSingle();

    if (!form) {
      return new Response(
        JSON.stringify({ synced: false, reason: "form_not_found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: serviceAccount } = await supabase
      .from("google_service_accounts")
      .select("*")
      .eq("workspace_id", form.workspace_id)
      .maybeSingle();

    if (!serviceAccount) {
      return new Response(
        JSON.stringify({ synced: false, reason: "no_service_account" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Buscar schema para labels dos campos
    const { data: version } = await supabase
      .from("form_versions")
      .select("schema")
      .eq("form_id", form_id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const schema = (version?.schema as any) || {};
    const fields: any[] = schema.fields || [];

    // 4. Autenticar com Google
    const scope =
      "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive";
    const accessToken = await getGoogleAccessToken(
      serviceAccount.client_email,
      serviceAccount.encrypted_key,
      scope
    );

    const config = (integration.config as any) || {};

    // ── Helper: montar uma linha de dados ──
    function buildRow(resp: any, ans: any[]): string[] {
      const meta = (resp?.meta as any) || {};
      const answerMap: Record<string, any> = {};
      for (const a of ans) {
        answerMap[a.field_key] = a.value_text ?? a.value;
      }
      const fieldValues = fields.map((f: any) => {
        const val = answerMap[f.id];
        if (val === null || val === undefined) return "";
        if (typeof val === "object") return JSON.stringify(val);
        return String(val);
      });
      return [
        formatDateBR(resp?.started_at || new Date().toISOString()),
        resp?.status || "completed",
        meta.respondent_email || "",
        meta.score !== undefined ? String(meta.score) : "",
        meta.score_range || "",
        Array.isArray(meta.tags) ? meta.tags.join(", ") : "",
        meta.outcome_label || "",
        ...fieldValues,
      ];
    }

    // ── Helper: criar planilha se não existir ──
    async function ensureSpreadsheet(currentSpreadsheetId: string | undefined): Promise<string> {
      if (currentSpreadsheetId) return currentSpreadsheetId;

      const fieldHeaders = fields.map((f: any) => f.label || f.id);
      const headers = [
        "Data/Hora", "Status", "Email Respondente",
        "Score", "Score Range", "Tags", "Outcome",
        ...fieldHeaders,
      ];

      const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          properties: { title: `TecForms — ${form.name}` },
          sheets: [{
            properties: { title: "Respostas" },
            data: [{
              startRow: 0, startColumn: 0,
              rowData: [{
                values: headers.map((h) => ({
                  userEnteredValue: { stringValue: h },
                  userEnteredFormat: {
                    backgroundColor: { red: 0.23, green: 0.47, blue: 0.85 },
                    textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
                  },
                })),
              }],
            }],
          }],
        }),
      });
      const createData = await createRes.json();
      const newId = createData.spreadsheetId;

      await supabase.from("integrations")
        .update({ config: { ...config, spreadsheet_id: newId } })
        .eq("id", integration.id);

      // Compartilhar (acesso público de escrita)
      await fetch(`https://www.googleapis.com/drive/v3/files/${newId}/permissions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "anyone", role: "writer" }),
      });

      return newId;
    }

    // ── MODO BATCH: sincronizar todas as respostas ──
    if (batch_sync) {
      const { data: allResponses } = await supabase
        .from("responses")
        .select("*")
        .eq("form_id", form_id)
        .eq("status", "completed")
        .order("started_at", { ascending: true });

      if (!allResponses || allResponses.length === 0) {
        return new Response(
          JSON.stringify({ synced: true, count: 0, reason: "no_completed_responses" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const spreadsheetId = await ensureSpreadsheet(config.spreadsheet_id);

      // Buscar todas as respostas de uma vez
      const responseIds = allResponses.map((r: any) => r.id);
      const { data: allAnswers } = await supabase
        .from("response_answers")
        .select("*")
        .in("response_id", responseIds);

      // Agrupar respostas por response_id
      const answersByResponse: Record<string, any[]> = {};
      for (const ans of allAnswers || []) {
        if (!answersByResponse[ans.response_id]) answersByResponse[ans.response_id] = [];
        answersByResponse[ans.response_id].push(ans);
      }

      // Montar todas as linhas
      const rows = allResponses.map((resp: any) =>
        buildRow(resp, answersByResponse[resp.id] || [])
      );

      // Limpar planilha (manter apenas o cabeçalho) e reescrever tudo
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Respostas!A2:ZZ?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: rows }),
        }
      );

      await supabase.from("integrations")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", integration.id);

      return new Response(
        JSON.stringify({ synced: true, count: rows.length, spreadsheet_id: spreadsheetId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── MODO SINGLE: sincronizar uma resposta ──
    const { data: response } = await supabase
      .from("responses")
      .select("*")
      .eq("id", response_id)
      .maybeSingle();

    const { data: answers } = await supabase
      .from("response_answers")
      .select("*")
      .eq("response_id", response_id);

    const spreadsheetId = await ensureSpreadsheet(config.spreadsheet_id);
    const row = buildRow(response, answers || []);

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Respostas!A:ZZ:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [row] }),
      }
    );

    await supabase.from("integrations")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", integration.id);

    return new Response(
      JSON.stringify({ synced: true, spreadsheet_id: spreadsheetId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("sync-google-sheets error:", err);
    return new Response(
      JSON.stringify({ synced: false, reason: "error", error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
