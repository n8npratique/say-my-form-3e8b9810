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
    const { form_id, response_id } = await req.json();
    if (!form_id || !response_id) {
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

    // 3. Buscar resposta completa
    const { data: response } = await supabase
      .from("responses")
      .select("*")
      .eq("id", response_id)
      .maybeSingle();

    const { data: answers } = await supabase
      .from("response_answers")
      .select("*")
      .eq("response_id", response_id);

    // 4. Buscar schema para labels dos campos
    const { data: version } = await supabase
      .from("form_versions")
      .select("schema")
      .eq("form_id", form_id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const schema = (version?.schema as any) || {};
    const fields: any[] = schema.fields || [];

    // 5. Autenticar com Google
    const scope =
      "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive";
    const accessToken = await getGoogleAccessToken(
      serviceAccount.client_email,
      serviceAccount.encrypted_key,
      scope
    );

    const meta = (response?.meta as any) || {};
    const config = (integration.config as any) || {};

    // 6. Criar planilha se não existir
    let spreadsheetId = config.spreadsheet_id;

    if (!spreadsheetId) {
      // Criar headers
      const fieldHeaders = fields.map((f: any) => f.label || f.id);
      const headers = [
        "Data/Hora",
        "Status",
        "Email Respondente",
        "Score",
        "Score Range",
        "Tags",
        "Outcome",
        ...fieldHeaders,
      ];

      const createRes = await fetch(
        "https://sheets.googleapis.com/v4/spreadsheets",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            properties: { title: `TecForms — ${form.name}` },
            sheets: [
              {
                properties: { title: "Respostas" },
                data: [
                  {
                    startRow: 0,
                    startColumn: 0,
                    rowData: [
                      {
                        values: headers.map((h) => ({
                          userEnteredValue: { stringValue: h },
                          userEnteredFormat: {
                            backgroundColor: { red: 0.23, green: 0.47, blue: 0.85 },
                            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
                          },
                        })),
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        }
      );
      const createData = await createRes.json();
      spreadsheetId = createData.spreadsheetId;

      // Salvar spreadsheet_id na integração
      await supabase
        .from("integrations")
        .update({ config: { ...config, spreadsheet_id: spreadsheetId } })
        .eq("id", integration.id);

      // Compartilhar com o workspace owner (buscar email)
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("owner_id")
        .eq("id", form.workspace_id)
        .maybeSingle();

      if (workspace?.owner_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", workspace.owner_id)
          .maybeSingle();

        // Compartilhar usando Drive API
        await fetch(
          `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              type: "anyone",
              role: "writer",
            }),
          }
        );
      }
    }

    // 7. Montar linha de dados
    const answerMap: Record<string, any> = {};
    for (const ans of answers || []) {
      answerMap[ans.field_key] = ans.value_text || ans.value;
    }

    const fieldValues = fields.map((f: any) => {
      const val = answerMap[f.id];
      if (val === null || val === undefined) return "";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    });

    const row = [
      formatDateBR(response?.started_at || new Date().toISOString()),
      response?.status || "completed",
      meta.respondent_email || "",
      meta.score !== undefined ? String(meta.score) : "",
      meta.score_range || "",
      Array.isArray(meta.tags) ? meta.tags.join(", ") : "",
      meta.outcome_label || "",
      ...fieldValues,
    ];

    // 8. Append na planilha
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Respostas!A:ZZ:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [row] }),
      }
    );

    // 9. Atualizar last_synced_at
    await supabase
      .from("integrations")
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
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
