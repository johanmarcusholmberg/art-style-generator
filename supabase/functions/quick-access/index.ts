// Quick-access: validates a shared secret and issues a signed app-only access
// token. It deliberately does NOT call the backend auth endpoints. The token is
// only used by the frontend route guard to open generator pages without the
// regular login flow; privileged admin/data paths still require real auth.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sign(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

async function issueToken(secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 30;
  const payload = base64UrlEncode(
    encoder.encode(
      JSON.stringify({ v: 1, kind: "quick_access", iat: now, exp }),
    ),
  );
  return {
    token: `${payload}.${await sign(payload, secret)}`,
    expires_at: new Date(exp * 1000).toISOString(),
  };
}

async function verifyToken(token: string, secret: string) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = await sign(payload, secret);
  if (!safeEqual(signature, expected)) return false;
  const decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
  const now = Math.floor(Date.now() / 1000);
  return decoded?.kind === "quick_access" && decoded?.exp > now;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const providedKey =
      url.searchParams.get("key") ?? req.headers.get("x-access-key") ?? "";

    const secret = Deno.env.get("ACCESS_LINK_SECRET") ?? "";
    if (!secret) {
      return json(500, { error: "Quick access is not configured" });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const token =
        typeof body?.token === "string"
          ? body.token
          : req.headers.get("x-quick-access-token") ?? "";
      if (!token) return json(401, { error: "Missing quick-access token" });
      const ok = await verifyToken(token, secret).catch(() => false);
      return ok
        ? json(200, { ok: true, mode: "quick_access" })
        : json(401, { error: "Quick-access token is invalid or expired" });
    }

    if (!providedKey || !safeEqual(providedKey, secret)) {
      return json(401, { error: "Invalid access key" });
    }

    const issued = await issueToken(secret);
    return json(200, { ok: true, mode: "quick_access", ...issued });
  } catch (e) {
    return json(500, { error: (e as Error).message ?? "Unknown error" });
  }
});
