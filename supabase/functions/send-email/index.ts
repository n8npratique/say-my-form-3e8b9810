import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── JWT para Google Service Account ──
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

// ── Substituir variáveis no template ──
function replaceVars(
  text: string,
  vars: Record<string, string>
): string {
  let result = text;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
  }
  return result;
}

// ── Resolver {{field:LABEL}} e {{field:LABEL.SUBFIELD}} ──
const SUBFIELD_MAP: Record<string, string> = {
  nome: "first_name", sobrenome: "last_name",
  email: "email", telefone: "phone",
  cpf: "cpf", cep: "cep", "endereço": "address", endereco: "address",
  first_name: "first_name", last_name: "last_name", phone: "phone", address: "address",
};

function resolveFieldVars(
  text: string,
  fields: any[],
  answerMap: Record<string, string>,
  rawAnswerMap: Record<string, any>,
): string {
  return text.replace(/\{\{field:([^}]+)\}\}/g, (_m, expr: string) => {
    const dotIdx = expr.indexOf(".");
    if (dotIdx > 0) {
      const fieldLabel = expr.slice(0, dotIdx);
      const subLabel = expr.slice(dotIdx + 1).toLowerCase();
      const field = fields.find(
        (f: any) => (f.label || "").toLowerCase() === fieldLabel.toLowerCase()
      );
      if (!field) return "";
      const raw = rawAnswerMap[field.id];
      const parsed = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
      if (parsed && typeof parsed === "object") {
        const key = SUBFIELD_MAP[subLabel] || subLabel;
        return parsed[key] ?? "";
      }
      return answerMap[field.id] ?? "";
    }
    const field = fields.find(
      (f: any) => (f.label || "").toLowerCase() === expr.toLowerCase()
    );
    if (!field) return "";
    return answerMap[field.id] ?? "";
  });
}

// ── Montar HTML do email ──
function buildEmailHtml(
  template: any,
  vars: Record<string, string>
): string {
  const subject = replaceVars(template.subject || "", vars);
  const body = replaceVars(template.body || "", vars).replace(/\n/g, "<br>");
  const footer = replaceVars(template.footer || "", vars);
  const ctaText = replaceVars(template.cta_text || "", vars);
  const ctaUrl = replaceVars(template.cta_url || "", vars);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        ${template.header_image_url ? `
        <tr><td>
          <img src="${template.header_image_url}" alt="Header" style="width:100%;display:block;max-height:200px;object-fit:cover;">
        </td></tr>` : ""}
        <tr><td style="padding:32px 32px 24px;">
          <h1 style="margin:0 0 16px;font-size:22px;color:#111;">${subject}</h1>
          <p style="margin:0;font-size:15px;color:#444;line-height:1.6;">${body}</p>
          ${ctaText && ctaUrl ? `
          <div style="text-align:center;margin-top:28px;">
            <a href="${ctaUrl}" style="display:inline-block;background:#3B72D9;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:600;">${ctaText}</a>
          </div>` : ""}
        </td></tr>
        ${footer ? `
        <tr><td style="padding:16px 32px;border-top:1px solid #eee;">
          <p style="margin:0;font-size:12px;color:#999;">${footer}</p>
        </td></tr>` : ""}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Enviar via Resend ──
async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string
) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
  return await res.json();
}

// ── Enviar via Gmail SMTP (App Password) ──
async function sendViaGmailSMTP(
  gmailEmail: string,
  appPassword: string,
  to: string,
  subject: string,
  html: string
) {
  const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: gmailEmail, password: appPassword },
    },
  });
  await client.send({
    from: gmailEmail,
    to,
    subject,
    content: "auto",
    html,
  });
  await client.close();
}

// ── OAuth helper: get access token (with auto-refresh) ──
async function getOAuthAccessToken(
  supabase: any,
  connectionId: string
): Promise<{ accessToken: string; email: string }> {
  const { data: conn } = await supabase
    .from("google_oauth_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();

  if (!conn) throw new Error("OAuth connection not found");

  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (Date.now() < expiresAt - 5 * 60 * 1000) {
    return { accessToken: conn.access_token, email: conn.google_email };
  }

  if (!conn.refresh_token) throw new Error("No refresh token");

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

  await supabase
    .from("google_oauth_connections")
    .update({
      access_token: tokenData.access_token,
      token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  return { accessToken: tokenData.access_token, email: conn.google_email };
}

// ── Send via Gmail API (OAuth) ──
async function sendViaGmailAPI(
  accessToken: string,
  from: string,
  to: string,
  subject: string,
  html: string
) {
  // Build RFC 2822 email
  const boundary = `boundary_${crypto.randomUUID()}`;
  const rawEmail = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(html))),
    `--${boundary}--`,
  ].join("\r\n");

  // Base64url encode
  const encoded = btoa(rawEmail)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API error (${res.status}): ${err}`);
  }
  return await res.json();
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
    const { form_id, response_id, test_mode, test_email, test_template, calendar_link, meet_link } = body;

    if (!form_id) {
      return new Response(
        JSON.stringify({ sent: false, reason: "missing_form_id" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Buscar schema do formulário
    const { data: form } = await supabase
      .from("forms")
      .select("workspace_id, name")
      .eq("id", form_id)
      .maybeSingle();

    if (!form) {
      return new Response(
        JSON.stringify({ sent: false, reason: "form_not_found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: version } = await supabase
      .from("form_versions")
      .select("schema")
      .eq("form_id", form_id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const schema = (version?.schema as any) || {};
    const allTemplates: any[] = schema.email_templates || [];
    const fields: any[] = schema.fields || [];

    // Check for appointment field and its confirmation_email config
    const appointmentField = fields.find((f: any) => f.type === "appointment");
    const appointmentConfig = appointmentField?.appointment_config;

    // Em modo teste usa o template passado
    let templates = test_mode
      ? [{ ...test_template, enabled: true }]
      : allTemplates.filter((t: any) => t.enabled);

    // Unified email: if email_templates has auto_appointment, it's the new unified approach.
    // If not, fall back to legacy: build template from appointment_config fields.
    const hasAutoAppointmentTemplate = templates.some((t: any) => t.id === "auto_appointment");

    if (!test_mode && appointmentField && !hasAutoAppointmentTemplate) {
      // Legacy fallback: build appointment email from appointment_config
      const confirmationEmailEnabled = appointmentConfig?.confirmation_email_enabled !== false;
      if (confirmationEmailEnabled) {
        const subject = appointmentConfig?.confirmation_email_subject || "Confirmação de agendamento - {{form_name}}";
        const customBody = appointmentConfig?.confirmation_email_body || "";
        const bodyParts = ["Olá!\n\nSeu agendamento no formulário {{form_name}} foi confirmado com sucesso.\n\nData: {{appointment_datetime}}"];
        if (customBody.trim()) {
          bodyParts.push(customBody.trim());
        }
        bodyParts.push("{{event_links}}Caso precise cancelar, clique no link abaixo:\n{{cancel_url}}\n\nObrigado!");
        const legacyTemplate = {
          id: "legacy_appointment_confirmation",
          enabled: true,
          recipient: "respondent",
          subject,
          body: bodyParts.join("\n\n"),
          footer: "Enviado automaticamente via TecForms",
        };
        templates = [legacyTemplate, ...templates];
      }
    }

    if (templates.length === 0) {
      return new Response(
        JSON.stringify({ sent: false, reason: "no_templates" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar config de email do workspace
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("settings, owner_id")
      .eq("id", form.workspace_id)
      .maybeSingle();

    const emailConfig = (workspace?.settings as any)?.email || {};

    // 3. Determine email sending method
    // Priority: Google OAuth (always try first) → Resend (fallback)
    let oauthConnection: { accessToken: string; email: string } | null = null;

    // Always try OAuth first (most common case)
    const { data: oauthConn } = await supabase
      .from("google_oauth_connections")
      .select("id, scopes")
      .eq("workspace_id", form.workspace_id)
      .limit(1)
      .maybeSingle();

    if (oauthConn) {
      try {
        oauthConnection = await getOAuthAccessToken(supabase, oauthConn.id);
      } catch (oauthErr: any) {
        console.warn("OAuth email failed:", oauthErr.message);
      }
    }

    // If no OAuth and no alternative provider configured, fail
    if (!oauthConnection && emailConfig.provider !== "resend") {
      return new Response(
        JSON.stringify({ sent: false, reason: "not_configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Buscar resposta (se não for teste)
    let meta: any = {};
    let sessionToken = "";
    let answerMap: Record<string, string> = {};
    let rawAnswerMap: Record<string, any> = {};

    if (!test_mode && response_id) {
      const { data: response } = await supabase
        .from("responses")
        .select("*")
        .eq("id", response_id)
        .maybeSingle();
      meta = (response?.meta as any) || {};
      sessionToken = (response as any)?.session_token || "";

      const { data: answers } = await supabase
        .from("response_answers")
        .select("*")
        .eq("response_id", response_id);

      for (const ans of answers || []) {
        answerMap[ans.field_key] = ans.value_text || String(ans.value || "");
        rawAnswerMap[ans.field_key] = ans.value;
      }
    } else {
      // Valores de exemplo para teste
      meta = {
        respondent_email: test_email,
        score: 85,
        score_range: "Alto",
        outcome_label: "Perfil A",
        tags: ["lead", "qualificado"],
      };
    }

    // Extract respondent email from form answers (priority over meta.respondent_email)
    // The email field answer is the explicit contact email the respondent entered
    let emailFromAnswers = "";
    for (const f of fields) {
      const ft = (f.type || "").toLowerCase();
      if (ft === "email" || ft === "email_input") {
        const val = answerMap[f.id];
        if (val && val.includes("@")) {
          emailFromAnswers = val;
          break;
        }
      } else if (ft === "contact_info") {
        const raw = rawAnswerMap[f.id];
        const parsed = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
        if (parsed && typeof parsed === "object" && parsed.email && String(parsed.email).includes("@")) {
          emailFromAnswers = String(parsed.email);
          break;
        }
        const text = answerMap[f.id] || "";
        const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
        if (emailMatch) {
          emailFromAnswers = emailMatch[0];
          break;
        }
      }
    }
    if (emailFromAnswers) {
      meta.respondent_email = emailFromAnswers;
    }

    // Montar HTML de respostas
    const answersHtml = fields
      .map((f: any) => {
        const val = answerMap[f.id] || "(sem resposta)";
        return `<strong>${f.label}:</strong> ${val}`;
      })
      .join("<br>");

    // Extract appointment datetime from answers
    let appointmentDatetime = "";
    for (const f of fields) {
      if (f.type === "appointment") {
        const raw = rawAnswerMap[f.id];
        const parsed = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
        if (parsed?.slot_start) {
          const dt = new Date(parsed.slot_start);
          appointmentDatetime = dt.toLocaleString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          });
          break;
        }
      }
    }

    // Build cancel URL (for appointment forms, always include — event will exist by the time user clicks)
    const siteUrl = Deno.env.get("SITE_URL") || req.headers.get("origin") || "";
    const cancelUrl = (sessionToken && appointmentField && siteUrl)
      ? `${siteUrl}/cancel/${sessionToken}`
      : "";

    const vars: Record<string, string> = {
      form_name: form.name,
      score: String(meta.score ?? "N/A"),
      score_range: meta.score_range || "",
      outcome: meta.outcome_label || "",
      tags: Array.isArray(meta.tags) ? meta.tags.join(", ") : "",
      respondent_email: meta.respondent_email || "",
      date: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      answers: answersHtml,
      cancel_url: cancelUrl,
      appointment_datetime: appointmentDatetime,
      calendar_link: calendar_link || "",
      meet_link: meet_link || "",
      event_links: (() => {
        const parts: string[] = [];
        if (calendar_link) parts.push(`Ver no Google Calendar: ${calendar_link}`);
        if (meet_link) parts.push(`Link do Google Meet: ${meet_link}`);
        return parts.length > 0 ? parts.join("\n") + "\n\n" : "";
      })(),
    };

    // Buscar email do owner
    let ownerEmail = "";
    if (workspace?.owner_id) {
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", workspace.owner_id)
        .maybeSingle();
      // Tentar pegar o email via auth admin
      const { data: authUser } = await supabase.auth.admin.getUserById(
        workspace.owner_id
      );
      ownerEmail = authUser?.user?.email || "";
    }

    const details: any[] = [];

    // 5. Enviar cada template
    for (const template of templates) {
      let recipientEmail = "";

      if (test_mode) {
        recipientEmail = test_email;
      } else if (template.recipient === "respondent") {
        recipientEmail = meta.respondent_email || "";
        if (!recipientEmail) {
          details.push({ template_id: template.id, status: "skipped", reason: "no_respondent_email" });
          continue;
        }
      } else if (template.recipient === "owner") {
        recipientEmail = ownerEmail;
        if (!recipientEmail) {
          details.push({ template_id: template.id, status: "skipped", reason: "no_owner_email" });
          continue;
        }
      }

      // Resolve {{field:...}} variables in all text fields before building HTML
      const resolvedTemplate = {
        ...template,
        subject: resolveFieldVars(template.subject || "", fields, answerMap, rawAnswerMap),
        body: resolveFieldVars(template.body || "", fields, answerMap, rawAnswerMap),
        footer: resolveFieldVars(template.footer || "", fields, answerMap, rawAnswerMap),
        cta_text: resolveFieldVars(template.cta_text || "", fields, answerMap, rawAnswerMap),
        cta_url: resolveFieldVars(template.cta_url || "", fields, answerMap, rawAnswerMap),
      };

      const html = buildEmailHtml(resolvedTemplate, vars);
      const subject = replaceVars(resolvedTemplate.subject || form.name, vars);
      try {
        if (oauthConnection) {
          // Use Gmail API via OAuth (primary)
          await sendViaGmailAPI(oauthConnection.accessToken, oauthConnection.email, recipientEmail, subject, html);
        } else if (emailConfig.provider === "resend") {
          const senderEmail = emailConfig.sender_email || "noreply@tecforms.com";
          await sendViaResend(emailConfig.resend_api_key, senderEmail, recipientEmail, subject, html);
        }
        details.push({ template_id: template.id, recipient: recipientEmail, status: "sent" });
      } catch (err: any) {
        details.push({ template_id: template.id, recipient: recipientEmail, status: "error", error: err.message });
      }
    }

    return new Response(
      JSON.stringify({ sent: true, count: details.filter((d) => d.status === "sent").length, details }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-email error:", err);
    return new Response(
      JSON.stringify({ sent: false, reason: "error", error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
