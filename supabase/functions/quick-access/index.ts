// Quick-access: exchanges a shared secret key for a ready-to-use Supabase session.
// GET /quick-access?key=<ACCESS_LINK_SECRET>
// Returns { access_token, refresh_token, expires_in, token_type, user }
// The client calls supabase.auth.setSession(...) locally — no browser POST to
// /auth/v1/token, so it works even when the preview iframe's fetch proxy
// interferes with Supabase auth endpoints.
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const email = Deno.env.get("ACCESS_LINK_EMAIL") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!secret || !email || !supabaseUrl || !serviceRoleKey || !anonKey) {
      return json(500, { error: "Server not configured" });
    }

    if (!providedKey || !safeEqual(providedKey, secret)) {
      return json(401, { error: "Invalid access key" });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Mint a one-time magic link — we only need the hashed_token from it.
    const { data: linkData, error: linkErr } = await admin.auth.admin
      .generateLink({ type: "magiclink", email });

    if (linkErr || !linkData?.properties?.hashed_token) {
      return json(500, {
        error: linkErr?.message ?? "Failed to generate access token",
      });
    }

    const hashedToken = linkData.properties.hashed_token;

    // 2) Redeem the hashed token server-side via verifyOtp to obtain a real
    // access_token + refresh_token. This is the same call the browser would
    // make when following the magic link, but done here so the client never
    // has to hit /auth/v1/token itself.
    const verifyClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: verified, error: verifyErr } = await verifyClient.auth
      .verifyOtp({ type: "magiclink", token_hash: hashedToken });

    if (verifyErr || !verified?.session) {
      return json(500, {
        error: verifyErr?.message ?? "Failed to redeem access token",
      });
    }

    const { access_token, refresh_token, expires_in, token_type } =
      verified.session;

    return json(200, {
      access_token,
      refresh_token,
      expires_in,
      token_type,
      user: verified.user,
    });
  } catch (e) {
    return json(500, { error: (e as Error).message ?? "Unknown error" });
  }
});
