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
    .replace(/\\n/g, "")
    .replace(/\n/g, "")
    .replace(/\r/g, "")
    .trim();
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

// ── OAuth helper: get access token from OAuth connection (with auto-refresh) ──
async function getOAuthAccessToken(
  supabase: any,
  connectionId: string
): Promise<string> {
  const { data: conn } = await supabase
    .from("google_oauth_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();

  if (!conn) throw new Error("OAuth connection not found");

  // Check if token is still valid (5min buffer)
  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (Date.now() < expiresAt - 5 * 60 * 1000) {
    return conn.access_token;
  }

  // Refresh the token
  if (!conn.refresh_token) throw new Error("No refresh token available");

  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`OAuth refresh failed: ${JSON.stringify(tokenData)}`);
  }

  const newExpiresAt = new Date(
    Date.now() + (tokenData.expires_in || 3600) * 1000
  ).toISOString();

  await supabase
    .from("google_oauth_connections")
    .update({
      access_token: tokenData.access_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  return tokenData.access_token;
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
    const { form_id, response_id, batch_sync, create_only, fix_permissions, google_connection_id } = body;

    if (!form_id || (!response_id && !batch_sync && !create_only && !fix_permissions)) {
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

    // 2. Buscar form
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

    // 4. Autenticar com Google (OAuth ou Service Account)
    // Resolve qual connection usar: body > config > fallback SA
    const effectiveConnectionId =
      google_connection_id || (integration.config as any)?.google_connection_id;

    let accessToken: string;
    let usingOAuth = false;

    if (effectiveConnectionId) {
      // Tenta OAuth primeiro
      try {
        accessToken = await getOAuthAccessToken(supabase, effectiveConnectionId);
        usingOAuth = true;
      } catch (oauthErr: any) {
        console.warn("OAuth failed, falling back to Service Account:", oauthErr.message);
        // Fallback para Service Account
        const { data: serviceAccount } = await supabase
          .from("google_service_accounts")
          .select("*")
          .eq("workspace_id", form.workspace_id)
          .maybeSingle();
        if (!serviceAccount) {
          throw new Error(`OAuth failed and no Service Account available: ${oauthErr.message}`);
        }
        const scope = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive";
        accessToken = await getGoogleAccessToken(serviceAccount.client_email, serviceAccount.encrypted_key, scope);
      }
    } else {
      // Sem OAuth configurado — usa Service Account
      const { data: serviceAccount } = await supabase
        .from("google_service_accounts")
        .select("*")
        .eq("workspace_id", form.workspace_id)
        .maybeSingle();

      if (!serviceAccount) {
        return new Response(
          JSON.stringify({ synced: false, reason: "no_credentials" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const scope = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive";
      accessToken = await getGoogleAccessToken(serviceAccount.client_email, serviceAccount.encrypted_key, scope);
    }

    const config = (integration.config as any) || {};

    // ── Detect which meta columns are relevant ──
    const hasEmailField = fields.some((f: any) => {
      const t = (f.type || "").toLowerCase();
      return t === "email" || t === "email_input";
    });
    const hasScoring = !!schema.scoring?.enabled;
    const hasTagging = !!schema.tagging?.enabled;
    const hasOutcomes = !!schema.outcomes?.enabled;

    // Build dynamic meta columns: always Data/Hora, then only what's configured
    const metaCols: { header: string; getValue: (resp: any, meta: any) => string }[] = [
      { header: "Data/Hora", getValue: (resp) => formatDateBR(resp?.started_at || new Date().toISOString()) },
    ];
    if (hasEmailField) metaCols.push({ header: "Email", getValue: (_, m) => m.respondent_email || "" });
    if (hasScoring) {
      metaCols.push({ header: "Score", getValue: (_, m) => m.score !== undefined ? String(m.score) : "" });
      metaCols.push({ header: "Faixa", getValue: (_, m) => m.score_range || "" });
    }
    if (hasTagging) metaCols.push({ header: "Tags", getValue: (_, m) => Array.isArray(m.tags) ? m.tags.join(", ") : "" });
    if (hasOutcomes) metaCols.push({ header: "Resultado", getValue: (_, m) => m.outcome_label || "" });

    // ── Detect active integrations for status columns ──
    const { data: activeIntegrations } = await supabase
      .from("integrations")
      .select("type, config")
      .eq("form_id", form_id)
      .neq("type", "google_sheets");

    // Map DB integration type → display label + meta key
    const integrationMap: Record<string, { label: string; metaKey: string }> = {
      email: { label: "Email Enviado", metaKey: "email" },
      whatsapp: { label: "WhatsApp Enviado", metaKey: "whatsapp" },
      google_calendar: { label: "Agenda Criada", metaKey: "calendar" },
      unnichat: { label: "Unnichat Enviado", metaKey: "unnichat" },
    };

    // Only add status columns for integrations that are enabled
    const statusCols: { header: string; metaKey: string }[] = [];

    // Email: check email_templates OR appointment confirmation_email
    const emailTemplates: any[] = schema.email_templates || [];
    const hasAppointmentEmail = fields.some((f: any) =>
      (f.type || "").toLowerCase() === "appointment" &&
      f.appointment_config?.confirmation_email_enabled !== false
    );
    if (emailTemplates.length > 0 || hasAppointmentEmail) {
      statusCols.push({ header: "Email Enviado", metaKey: "email" });
    }

    // Calendar: check if any appointment field exists (always creates event)
    const hasAppointmentField = fields.some((f: any) => (f.type || "").toLowerCase() === "appointment");
    if (hasAppointmentField) {
      statusCols.push({ header: "Agenda Criada", metaKey: "calendar" });
    }

    for (const integ of activeIntegrations || []) {
      const cfg = (integ.config as any) || {};
      if (cfg.enabled === false) continue;
      const mapped = integrationMap[integ.type];
      if (!mapped) continue;
      // Skip calendar if already added from appointment field detection
      if (mapped.metaKey === "calendar" && hasAppointmentField) continue;
      statusCols.push({ header: mapped.label, metaKey: mapped.metaKey });
    }

    // ── Sanitizar valores para o Sheets não interpretar como fórmula ──
    function sanitize(v: string): string {
      if (v && /^[+=\-@]/.test(v)) return `'${v}`;
      return v;
    }

    // ── Labels para sub-campos de contact_info ──
    const CONTACT_SUB_LABELS: Record<string, string> = {
      first_name: "Nome",
      last_name: "Sobrenome",
      email: "E-mail",
      phone: "Telefone",
      cpf: "CPF",
      cep: "CEP",
      address: "Endereço",
    };

    // ── Helper: construir headers esperados (reutilizável) ──
    function buildExpectedHeaders(): string[] {
      const fieldHeaders: string[] = [];
      for (const f of fields) {
        if ((f.type || "").toLowerCase() === "contact_info") {
          const subFields: string[] = f.contact_fields || ["first_name", "email"];
          for (const sf of subFields) {
            fieldHeaders.push(`${f.label || f.id} - ${CONTACT_SUB_LABELS[sf] || sf}`);
          }
        } else {
          fieldHeaders.push(f.label || f.id);
        }
      }
      return [
        ...metaCols.map((col) => col.header),
        ...fieldHeaders,
        ...statusCols.map((col) => col.header),
      ];
    }

    // ── Helper: montar uma linha de dados ──
    function buildRow(resp: any, ans: any[]): string[] {
      const meta = (resp?.meta as any) || {};
      const answerMap: Record<string, any> = {};
      const rawAnswerMap: Record<string, any> = {};
      for (const a of ans) {
        answerMap[a.field_key] = a.value_text ?? a.value;
        rawAnswerMap[a.field_key] = a.value;
      }
      const fieldValues: string[] = [];
      for (const f of fields) {
        const ft = (f.type || "").toLowerCase();
        if (ft === "contact_info") {
          const parsed = tryParseJSON(rawAnswerMap[f.id]);
          const subFields: string[] = f.contact_fields || ["first_name", "email"];
          for (const sf of subFields) {
            let val = "";
            if (parsed && typeof parsed === "object") val = parsed[sf] || "";
            fieldValues.push(sanitize(String(val)));
          }
        } else {
          const val = answerMap[f.id];
          if (val === null || val === undefined) { fieldValues.push(""); continue; }
          if (typeof val === "object") { fieldValues.push(JSON.stringify(val)); continue; }
          fieldValues.push(sanitize(String(val)));
        }
      }
      // Integration status columns
      const integStatus = meta.integration_status || {};
      const statusValues = statusCols.map((col) => {
        const st = integStatus[col.metaKey];
        if (st === "ok") return "Sim";
        if (st === "erro") return "Erro";
        return "";
      });

      return [
        ...metaCols.map((col) => sanitize(col.getValue(resp, meta))),
        ...fieldValues,
        ...statusValues,
      ];
    }

    // ── Helper: parse JSON safely ──
    function tryParseJSON(val: any): any {
      if (typeof val === "object" && val !== null) return val;
      if (typeof val !== "string") return null;
      try { return JSON.parse(val); } catch { return null; }
    }

    // ── Helper: formatar valor de campo especial para Sheets ──
    function formatFieldForSheets(field: any, rawValue: any, textValue: string): string {
      const ft = (field.type || "").toLowerCase();

      // Appointment: show "25/02/2026 às 11:00" instead of raw pipe-separated ISO strings
      if (ft === "appointment") {
        const parsed = tryParseJSON(rawValue);
        if (parsed?.slot_start) {
          const dt = new Date(parsed.slot_start);
          return dt.toLocaleString("pt-BR", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          });
        }
      }

      // Contact info: show "Nome | email | telefone" in a readable way
      if (ft === "contact_info") {
        const parsed = tryParseJSON(rawValue);
        if (parsed && typeof parsed === "object") {
          const parts: string[] = [];
          const name = [parsed.first_name, parsed.last_name].filter(Boolean).join(" ");
          if (name) parts.push(name);
          if (parsed.email) parts.push(parsed.email);
          if (parsed.phone) parts.push(parsed.phone);
          if (parsed.cpf) parts.push(`CPF: ${parsed.cpf}`);
          return parts.join(" | ");
        }
      }

      // Default: use value_text as-is
      return textValue;
    }

    // ── Helper: montar linha na ordem dos headers da planilha ──
    function buildRowByHeaders(resp: any, ans: any[], headerOrder: string[]): string[] {
      const meta = (resp?.meta as any) || {};

      // Build map: headerName → value
      const valueMap: Record<string, string> = {};

      // Meta columns
      for (const col of metaCols) {
        valueMap[col.header] = sanitize(col.getValue(resp, meta));
      }

      // Field columns — use raw value for special field types
      const textMap: Record<string, string> = {};
      const rawMap: Record<string, any> = {};
      for (const a of ans) {
        textMap[a.field_key] = a.value_text ?? (a.value != null ? String(a.value) : "");
        rawMap[a.field_key] = a.value;
      }
      for (const f of fields) {
        const ft = (f.type || "").toLowerCase();
        const raw = rawMap[f.id];
        const text = textMap[f.id] ?? "";

        if (ft === "contact_info") {
          // Expand contact_info into separate sub-columns
          const parsed = tryParseJSON(raw);
          const subFields: string[] = f.contact_fields || ["first_name", "email"];
          for (const sf of subFields) {
            const header = `${f.label || f.id} - ${CONTACT_SUB_LABELS[sf] || sf}`;
            let val = "";
            if (parsed && typeof parsed === "object") {
              val = parsed[sf] || "";
            }
            valueMap[header] = sanitize(String(val));
          }
        } else {
          const header = f.label || f.id;
          if (raw == null && !text) {
            valueMap[header] = "";
          } else {
            const formatted = formatFieldForSheets(f, raw, text);
            valueMap[header] = sanitize(formatted);
          }
        }
      }

      // Status columns
      const integStatus = meta.integration_status || {};
      for (const col of statusCols) {
        const st = integStatus[col.metaKey];
        if (st === "ok") valueMap[col.header] = "Sim";
        else if (st === "erro") valueMap[col.header] = "Erro";
        else valueMap[col.header] = "";
      }

      // Return values in header order (empty string for unknown headers)
      return headerOrder.map((h) => valueMap[h] ?? "");
    }

    // ── Helper: criar planilha se não existir ──
    async function ensureSpreadsheet(currentSpreadsheetId: string | undefined): Promise<string> {
      if (currentSpreadsheetId) return currentSpreadsheetId;

      const headers = buildExpectedHeaders();

      const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          properties: { title: `TecForms — ${form!.name}` },
          sheets: [{
            properties: {
              title: "Respostas",
              gridProperties: { frozenRowCount: 1 },
            },
            data: [{
              startRow: 0, startColumn: 0,
              rowData: [{
                values: headers.map((h) => ({
                  userEnteredValue: { stringValue: h },
                  userEnteredFormat: {
                    backgroundColor: { red: 1, green: 1, blue: 1 },
                    textFormat: { foregroundColor: { red: 0.2, green: 0.2, blue: 0.2 }, bold: true, fontSize: 10 },
                    borders: { bottom: { style: "SOLID", width: 2, color: { red: 0.8, green: 0.8, blue: 0.8 } } },
                    horizontalAlignment: "CENTER",
                    verticalAlignment: "MIDDLE",
                    wrapStrategy: "CLIP",
                  },
                })),
              }],
            }],
          }],
        }),
      });
      const createData = await createRes.json();
      const newId = createData.spreadsheetId;
      if (!newId) throw new Error(`Sheets create failed: ${JSON.stringify(createData)}`);

      // Apply formatting: basic filter + auto-resize columns + row height
      const sheetId = createData.sheets?.[0]?.properties?.sheetId || 0;
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${newId}:batchUpdate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            // Basic filter (dropdown arrows on headers)
            {
              setBasicFilter: {
                filter: {
                  range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: headers.length },
                },
              },
            },
            // Header row height
            {
              updateDimensionProperties: {
                range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
                properties: { pixelSize: 40 },
                fields: "pixelSize",
              },
            },
            // Auto-resize columns to fit header content
            {
              autoResizeDimensions: {
                dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: headers.length },
              },
            },
          ],
        }),
      });

      // Busca config mais recente do banco antes de salvar para não perder campos
      const { data: freshInteg } = await supabase
        .from("integrations")
        .select("config")
        .eq("id", integration.id)
        .maybeSingle();
      const freshConfig = (freshInteg?.config as any) ?? config;

      await supabase.from("integrations")
        .update({ config: { ...freshConfig, spreadsheet_id: newId } })
        .eq("id", integration.id);

      // Se usando OAuth, planilha já está no Drive do usuário — pula sharing público
      // Se usando Service Account, compartilha publicamente
      if (!usingOAuth) {
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
          const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${newId}/permissions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ type: "anyone", role: "writer" }),
          });
          const permData = await permRes.json();
          if (permRes.ok) break;
          console.warn(`Attempt ${attempt + 1} to set permissions failed:`, JSON.stringify(permData));
        }
      }

      // Compartilhar com emails específicos configurados pelo usuário
      const shareEmails: string[] = freshConfig.share_emails || config.share_emails || [];
      for (const email of shareEmails) {
        try {
          await fetch(`https://www.googleapis.com/drive/v3/files/${newId}/permissions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ type: "user", role: "writer", emailAddress: email }),
          });
        } catch (e) {
          console.warn(`Failed to share with ${email}:`, e);
        }
      }

      return newId;
    }

    // ── Helper: sincronizar headers (detectar colunas novas) ──
    async function syncHeaders(
      spreadsheetId: string,
      expectedHeaders: string[]
    ): Promise<string[]> {
      // 1. Fetch current header row
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Respostas!1:1`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      const currentHeaders: string[] = data.values?.[0] || [];

      // 2. Find new headers (in expected but not in current sheet)
      const newHeaders = expectedHeaders.filter((h) => !currentHeaders.includes(h));

      // 3. If no changes, return current order
      if (newHeaders.length === 0) return currentHeaders;

      // 4. Append new headers to the end of header row
      const updatedHeaders = [...currentHeaders, ...newHeaders];
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Respostas!1:1?valueInputOption=RAW`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: [updatedHeaders] }),
        }
      );

      // 5. Apply purple formatting to new header cells + update filter range
      const startCol = currentHeaders.length;
      const endCol = updatedHeaders.length;

      // Get sheetId
      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const metaData = await metaRes.json();
      const sheetId = metaData.sheets?.[0]?.properties?.sheetId || 0;

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            // Format new header cells with purple background
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: startCol, endColumnIndex: endCol },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 1, green: 1, blue: 1 },
                    textFormat: { foregroundColor: { red: 0.2, green: 0.2, blue: 0.2 }, bold: true, fontSize: 10 },
                    borders: { bottom: { style: "SOLID", width: 2, color: { red: 0.8, green: 0.8, blue: 0.8 } } },
                    horizontalAlignment: "CENTER",
                    verticalAlignment: "MIDDLE",
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)",
              },
            },
            // Update basic filter to include new columns
            {
              setBasicFilter: {
                filter: {
                  range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: endCol },
                },
              },
            },
          ],
        }),
      });

      return updatedHeaders;
    }

    // ── MODO FIX PERMISSIONS: reaplicar permissões numa planilha já existente ──
    if (fix_permissions) {
      const spreadsheetId = config.spreadsheet_id;
      if (!spreadsheetId) {
        return new Response(
          JSON.stringify({ fixed: false, reason: "no_spreadsheet_id" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      let lastError = "";
      let fixed = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
        const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ type: "anyone", role: "writer" }),
        });
        const permData = await permRes.json();
        if (permRes.ok) { fixed = true; break; }
        lastError = JSON.stringify(permData);
      }
      return new Response(
        JSON.stringify({ fixed, spreadsheet_id: spreadsheetId, error: fixed ? undefined : lastError }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── MODO CREATE ONLY: criar planilha sem sincronizar respostas ──

    if (create_only) {
      if (config.spreadsheet_id) {
        return new Response(
          JSON.stringify({ synced: true, spreadsheet_id: config.spreadsheet_id, reason: "already_exists" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const spreadsheetId = await ensureSpreadsheet(undefined);
      return new Response(
        JSON.stringify({ synced: true, spreadsheet_id: spreadsheetId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── MODO BATCH: sincronizar todas as respostas ──
    if (batch_sync) {
      const { data: allResponses } = await supabase
        .from("responses")
        .select("*")
        .eq("form_id", form_id)
        .eq("status", "completed")
        .order("started_at", { ascending: true });

      const spreadsheetId = await ensureSpreadsheet(config.spreadsheet_id);

      if (!allResponses || allResponses.length === 0) {
        await supabase.from("integrations")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", integration.id);
        return new Response(
          JSON.stringify({ synced: true, count: 0, spreadsheet_id: spreadsheetId, reason: "no_completed_responses" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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

      // Batch reescreve tudo: atualizar header row + dados
      const expectedHeaders = buildExpectedHeaders();

      // PUT header row completo (substitui o antigo com headers atuais)
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Respostas!1:1?valueInputOption=RAW`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [expectedHeaders] }),
        }
      );

      // Apply full header formatting (purple, filter, frozen row)
      const batchMetaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const batchMetaData = await batchMetaRes.json();
      const batchSheetId = batchMetaData.sheets?.[0]?.properties?.sheetId || 0;

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              repeatCell: {
                range: { sheetId: batchSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: expectedHeaders.length },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 1, green: 1, blue: 1 },
                    textFormat: { foregroundColor: { red: 0.2, green: 0.2, blue: 0.2 }, bold: true, fontSize: 10 },
                    borders: { bottom: { style: "SOLID", width: 2, color: { red: 0.8, green: 0.8, blue: 0.8 } } },
                    horizontalAlignment: "CENTER",
                    verticalAlignment: "MIDDLE",
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)",
              },
            },
            {
              updateSheetProperties: {
                properties: { sheetId: batchSheetId, gridProperties: { frozenRowCount: 1 } },
                fields: "gridProperties.frozenRowCount",
              },
            },
            {
              setBasicFilter: {
                filter: {
                  range: { sheetId: batchSheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: expectedHeaders.length },
                },
              },
            },
            {
              updateDimensionProperties: {
                range: { sheetId: batchSheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
                properties: { pixelSize: 40 },
                fields: "pixelSize",
              },
            },
          ],
        }),
      });

      // Montar todas as linhas na ordem dos headers atuais
      const rows = allResponses.map((resp: any) =>
        buildRowByHeaders(resp, answersByResponse[resp.id] || [], expectedHeaders)
      );

      // Reescrever todas as rows (a partir da linha 2)
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

    // Sync headers: detecta colunas novas e retorna a ordem real da planilha
    const expectedHeaders = buildExpectedHeaders();
    const headerOrder = await syncHeaders(spreadsheetId, expectedHeaders);

    // Build row na ordem dos headers da planilha (não desalinha dados antigos)
    const row = buildRowByHeaders(response, answers || [], headerOrder);

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Respostas!A:ZZ:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
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
