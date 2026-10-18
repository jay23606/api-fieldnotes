import { authorize, corsHeaders, json } from "../_shared/security.ts";

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get("origin"));
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, headers);
  try {
    const access = await authorize(request); if (access instanceof Response) return access;
    const body = await request.json(); const provider = String(body.provider ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 120);
    if (!provider) return json({ error: "Provider is required" }, 400, headers);
    const { error } = await access.admin.from("af_api_credentials").delete().eq("user_id", access.user.id).eq("provider_slug", provider);
    if (error) return json({ error: "Could not remove credential" }, 500, headers);
    return json({ ok: true }, 200, headers);
  } catch (error) {
    console.error("delete-api-key failed", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Credential service unavailable" }, 500, headers);
  }
});
