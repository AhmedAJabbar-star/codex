// Upload a file to Google Drive using OAuth refresh token.
// Body: { file_base64, file_name, mime_type, folder_id? }
// Returns: { url, id, name, webViewLink }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLIENT_ID = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET") || "";
const REFRESH_TOKEN = Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN") || "";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error("Google Drive credentials are not configured");
  }
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`OAuth refresh failed: ${JSON.stringify(data)}`);
  cached = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return cached.token;
}

/** Extract folder ID from either a plain ID or a Drive URL. */
function extractFolderId(input: string): string {
  const s = (input || "").trim();
  if (!s) return "";
  const m1 = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return s.replace(/[^a-zA-Z0-9_-]/g, "");
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const fileName = String(body.file_name || "upload.bin");
    const mimeType = String(body.mime_type || "application/octet-stream");
    const b64 = String(body.file_base64 || "");
    const folderId = extractFolderId(String(body.folder_id || ""));
    if (!b64) return json({ error: "file_base64 is required" }, 400);

    const bytes = base64ToBytes(b64);
    const token = await accessToken();

    const boundary = `----lovable-${Date.now()}`;
    const metadata: any = { name: fileName };
    if (folderId) metadata.parents = [folderId];

    const enc = new TextEncoder();
    const pre = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    );
    const post = enc.encode(`\r\n--${boundary}--`);
    const payload = new Uint8Array(pre.length + bytes.length + post.length);
    payload.set(pre, 0);
    payload.set(bytes, pre.length);
    payload.set(post, pre.length + bytes.length);

    const upRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: payload,
      },
    );
    const upData = await upRes.json();
    if (!upRes.ok) {
      return json({ error: "Drive upload failed", details: upData }, upRes.status);
    }

    // Make the file readable via link (anyone with the link can view).
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${upData.id}/permissions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      });
    } catch { /* ignore permission errors — file still uploaded */ }

    const url = upData.webViewLink || `https://drive.google.com/file/d/${upData.id}/view`;
    return json({ url, id: upData.id, name: upData.name, webViewLink: upData.webViewLink });
  } catch (e) {
    return json({ error: (e as Error).message || "Unexpected error" }, 500);
  }
});
