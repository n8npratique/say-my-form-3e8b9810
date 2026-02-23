import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function fetchWithTimeout(url: string, init: RequestInit, ms = 10000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal }); }
  finally { clearTimeout(t); }
}

const respond = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
    throw new Error("OAuth credentials not configured");
  }

  const tokenRes = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
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
  if (!tokenData.access_token) throw new Error("OAuth refresh failed");

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

// ── Send via Gmail API ──
async function sendViaGmailAPI(
  accessToken: string,
  from: string,
  to: string,
  subject: string,
  html: string
) {
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

  const encoded = btoa(rawEmail)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetchWithTimeout("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) throw new Error("Gmail API send failed");
  return await res.json();
}

// ── Build invite email HTML ──
function buildInviteHtml(inviteUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="padding:32px 32px 24px;">
          <h1 style="margin:0 0 16px;font-size:22px;color:#111;">Convite para o TecForms</h1>
          <p style="margin:0 0 8px;font-size:15px;color:#444;line-height:1.6;">
            Você foi convidado para criar uma conta no <strong>TecForms</strong> — nossa plataforma de formulários inteligentes com agendamento integrado.
          </p>
          <p style="margin:0;font-size:15px;color:#444;line-height:1.6;">
            Clique no botão abaixo para criar sua conta. Este convite expira em 7 dias.
          </p>
          <div style="text-align:center;margin-top:28px;">
            <a href="${inviteUrl}" style="display:inline-block;background:#3B72D9;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:600;">Criar minha conta</a>
          </div>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #eee;">
          <p style="margin:0;font-size:12px;color:#999;">Se você não esperava este convite, pode ignorar este e-mail.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // 1. Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ error: "unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return respond({ error: "unauthorized" }, 401);

    // 2. Verify caller is admin
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .maybeSingle();

    if (!role) return respond({ error: "forbidden" }, 403);

    // 3. Parse request
    const body = await req.json();
    const { email, token: inviteToken } = body;

    if (!email || !inviteToken) {
      return respond({ error: "missing_fields" }, 400);
    }

    // 4. Build invite URL
    const siteUrl = Deno.env.get("SITE_URL") || Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app") || "";
    const inviteUrl = `${siteUrl}/auth?invite=${inviteToken}`;

    // 5. Try to find OAuth connection to send email
    // Look for any workspace the admin owns/belongs to, then check OAuth
    const { data: workspaces } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    let emailSent = false;

    if (workspaces && workspaces.length > 0) {
      const wsIds = workspaces.map((w: any) => w.workspace_id);

      // Check for OAuth connection in any of admin's workspaces
      const { data: oauthConn } = await supabaseAdmin
        .from("google_oauth_connections")
        .select("id, workspace_id")
        .in("workspace_id", wsIds)
        .limit(1)
        .maybeSingle();

      if (oauthConn) {
        try {
          const { accessToken, email: senderEmail } = await getOAuthAccessToken(
            supabaseAdmin,
            oauthConn.id
          );

          const subject = "Convite para o TecForms";
          const html = buildInviteHtml(inviteUrl);

          await sendViaGmailAPI(accessToken, senderEmail, email, subject, html);
          emailSent = true;
        } catch (e) {
          console.error("Gmail send failed, falling back:", e);
        }
      }
    }

    // 6. Fallback: try Resend if available
    if (!emailSent) {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (resendKey) {
        try {
          const res = await fetchWithTimeout("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "TecForms <noreply@tecforms.com.br>",
              to: email,
              subject: "Convite para o TecForms",
              html: buildInviteHtml(inviteUrl),
            }),
          });
          if (res.ok) emailSent = true;
        } catch (e) {
          console.error("Resend send failed:", e);
        }
      }
    }

    if (!emailSent) {
      // No email provider available — admin should copy link manually
      return respond({
        sent: false,
        reason: "no_email_provider",
        invite_url: inviteUrl,
      });
    }

    return respond({ sent: true });
  } catch (err) {
    console.error("send-invite error:", err);
    return respond({ error: "internal_error" }, 500);
  }
});
