import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Google Auth helpers ---

function base64url(data: Uint8Array): string {
  let str = "";
  for (const b of data) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = new TextEncoder();
  const headerB64 = base64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;

  // Import private key
  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsigned));
  const jwt = `${unsigned}.${base64url(new Uint8Array(signature))}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Failed to get Google access token");
  return tokenData.access_token;
}

// --- Sheets helpers ---

async function appendRows(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  values: string[][]
) {
  const range = encodeURIComponent(`${sheetName}!A1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API error: ${res.status} ${err}`);
  }
  return res.json();
}

async function clearAndWrite(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  values: string[][]
) {
  const range = encodeURIComponent(sheetName);
  // Clear
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: "{}",
    }
  );
  // Write
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API write error: ${res.status} ${err}`);
  }
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { form_id, response_id, sync_all } = await req.json();
    if (!form_id) {
      return new Response(JSON.stringify({ error: "Missing form_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountJson) {
      return new Response(JSON.stringify({ error: "Google Service Account not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const serviceAccount = JSON.parse(serviceAccountJson);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get integration config
    const { data: integration } = await supabase
      .from("integrations")
      .select("config")
      .eq("form_id", form_id)
      .eq("type", "google_sheets")
      .maybeSingle();

    if (!integration?.config) {
      return new Response(JSON.stringify({ error: "Google Sheets integration not configured for this form" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = integration.config as any;
    const spreadsheetId = config.spreadsheet_id;
    const sheetName = config.sheet_name || "Respostas";

    // Get form schema for headers
    const { data: form } = await supabase
      .from("forms")
      .select("published_version_id")
      .eq("id", form_id)
      .maybeSingle();

    let fieldHeaders: { id: string; label: string }[] = [];
    if (form?.published_version_id) {
      const { data: version } = await supabase
        .from("form_versions")
        .select("schema")
        .eq("id", form.published_version_id)
        .maybeSingle();
      if (version) {
        const schema = version.schema as any;
        if (schema?.fields) {
          fieldHeaders = schema.fields.map((f: any) => ({ id: f.id, label: f.label || f.type || f.id }));
        }
      }
    }

    const headers = ["Data", "Status", "Email", "Score", "Tags", "Outcome", ...fieldHeaders.map((f) => f.label)];

    const accessToken = await getAccessToken(serviceAccount);

    if (sync_all) {
      // Fetch all completed responses
      const { data: responses } = await supabase
        .from("responses")
        .select("id, started_at, completed_at, status, meta")
        .eq("form_id", form_id)
        .eq("status", "completed")
        .order("started_at", { ascending: true });

      if (!responses || responses.length === 0) {
        return new Response(JSON.stringify({ synced: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ids = responses.map((r: any) => r.id);
      const { data: allAnswers } = await supabase
        .from("response_answers")
        .select("response_id, field_key, value_text, value")
        .in("response_id", ids);

      const answerMap: Record<string, Record<string, string>> = {};
      (allAnswers || []).forEach((a: any) => {
        if (!answerMap[a.response_id]) answerMap[a.response_id] = {};
        answerMap[a.response_id][a.field_key] =
          a.value_text || (a.value != null ? (Array.isArray(a.value) ? a.value.join("; ") : String(a.value)) : "");
      });

      const rows = responses.map((r: any) => {
        const meta = r.meta || {};
        const ra = answerMap[r.id] || {};
        return [
          r.completed_at || r.started_at,
          "Completada",
          meta.respondent_email || meta.email || "",
          meta.score != null ? String(meta.score) : "",
          (meta.tags || []).join("; "),
          meta.outcome_label || "",
          ...fieldHeaders.map((f) => ra[f.id] || ""),
        ];
      });

      await clearAndWrite(accessToken, spreadsheetId, sheetName, [headers, ...rows]);

      return new Response(JSON.stringify({ synced: responses.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single response sync
    if (!response_id) {
      return new Response(JSON.stringify({ error: "Missing response_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: resp } = await supabase
      .from("responses")
      .select("id, started_at, completed_at, status, meta")
      .eq("id", response_id)
      .maybeSingle();

    if (!resp) {
      return new Response(JSON.stringify({ error: "Response not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: respAnswers } = await supabase
      .from("response_answers")
      .select("field_key, value_text, value")
      .eq("response_id", response_id);

    const ra: Record<string, string> = {};
    (respAnswers || []).forEach((a: any) => {
      ra[a.field_key] =
        a.value_text || (a.value != null ? (Array.isArray(a.value) ? a.value.join("; ") : String(a.value)) : "");
    });

    const meta = (resp as any).meta || {};
    const row = [
      (resp as any).completed_at || (resp as any).started_at,
      (resp as any).status === "completed" ? "Completada" : "Em andamento",
      meta.respondent_email || meta.email || "",
      meta.score != null ? String(meta.score) : "",
      (meta.tags || []).join("; "),
      meta.outcome_label || "",
      ...fieldHeaders.map((f) => ra[f.id] || ""),
    ];

    await appendRows(accessToken, spreadsheetId, sheetName, [row]);

    return new Response(JSON.stringify({ synced: 1 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
