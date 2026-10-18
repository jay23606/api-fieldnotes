import { authorize, corsHeaders, encryptSecret, json } from "../_shared/security.ts";

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get("origin"));
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, headers);
  try {
    const access = await authorize(request); if (access instanceof Response) return access;
    const body = await request.json();
    const provider = String(body.provider ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 120);
    const apiKey = String(body.apiKey ?? "");
    if (!provider || apiKey.length < 8 || apiKey.length > 4096) return json({ error: "Provider and a valid key are required" }, 400, headers);
    const expiresAt = body.expiresAt ? new Date(body.expiresAt).toISOString() : null;
    if (body.expiresAt && (!expiresAt || Number.isNaN(Date.parse(expiresAt)))) return json({ error: "Expiry date is invalid" }, 400, headers);
    const encrypted = await encryptSecret(apiKey);
    const { error } = await access.admin.from("af_api_credentials").upsert({ user_id: access.user.id, provider_slug: provider, encrypted_secret: encrypted, masked_suffix: apiKey.slice(-4), expires_at: expiresAt, updated_at: new Date().toISOString() }, { onConflict: "user_id,provider_slug" });
    if (error) return json({ error: "Could not save credential" }, 500, headers);
    return json({ ok: true }, 200, headers);
  } catch (error) {
    console.error("save-api-key failed", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Credential service unavailable" }, 500, headers);
  }
});
