import { authorize, corsHeaders, json } from "../_shared/security.ts";

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get("origin"));
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, headers);
  try {
    const access = await authorize(request); if (access instanceof Response) return access;
    const { data, error } = await access.admin.from("af_api_credentials").select("provider_slug,masked_suffix,expires_at,created_at,updated_at").eq("user_id", access.user.id).order("provider_slug");
    if (error) return json({ error: "Could not list credentials" }, 500, headers);
    return json({ credentials: data ?? [] }, 200, headers);
  } catch (error) {
    console.error("list-api-keys failed", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Credential service unavailable" }, 500, headers);
  }
});
