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
    const { form_id, response_id, test_mode, test_email, test_template } = body;

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

    // Em modo teste usa o template passado
    const templates = test_mode
      ? [{ ...test_template, enabled: true }]
      : allTemplates.filter((t: any) => t.enabled);

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

    const emailConfig = (workspace?.settings as any)?.email;
    if (!emailConfig?.provider) {
      return new Response(
        JSON.stringify({ sent: false, reason: "not_configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Validar config Gmail se necessário
    if (emailConfig.provider === "gmail") {
      if (!emailConfig.gmail_email || !emailConfig.gmail_app_password) {
        return new Response(
          JSON.stringify({ sent: false, reason: "gmail_not_configured" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 4. Buscar resposta (se não for teste)
    let meta: any = {};
    let answerMap: Record<string, string> = {};
    const fields: any[] = schema.fields || [];

    if (!test_mode && response_id) {
      const { data: response } = await supabase
        .from("responses")
        .select("*")
        .eq("id", response_id)
        .maybeSingle();
      meta = (response?.meta as any) || {};

      const { data: answers } = await supabase
        .from("response_answers")
        .select("*")
        .eq("response_id", response_id);

      for (const ans of answers || []) {
        answerMap[ans.field_key] = ans.value_text || String(ans.value || "");
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

    // Montar HTML de respostas
    const answersHtml = fields
      .map((f: any) => {
        const val = answerMap[f.id] || "(sem resposta)";
        return `<strong>${f.label}:</strong> ${val}`;
      })
      .join("<br>");

    const vars: Record<string, string> = {
      form_name: form.name,
      score: String(meta.score ?? "N/A"),
      score_range: meta.score_range || "",
      outcome: meta.outcome_label || "",
      tags: Array.isArray(meta.tags) ? meta.tags.join(", ") : "",
      respondent_email: meta.respondent_email || "",
      date: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      answers: answersHtml,
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

      const html = buildEmailHtml(template, vars);
      const subject = replaceVars(template.subject || form.name, vars);
      const senderEmail = emailConfig.provider === "gmail" ? emailConfig.gmail_email : (emailConfig.sender_email || "noreply@tecforms.com");

      try {
        if (emailConfig.provider === "resend") {
          await sendViaResend(emailConfig.resend_api_key, senderEmail, recipientEmail, subject, html);
        } else if (emailConfig.provider === "gmail") {
          await sendViaGmailSMTP(emailConfig.gmail_email, emailConfig.gmail_app_password, recipientEmail, subject, html);
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
