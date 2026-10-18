export function corsHeaders(origin: string | null): Record<string, string> {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const allowedOrigin = origin && configured.includes(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

export function ownerAllowed(email: string | undefined): boolean {
  const allowed = (Deno.env.get("OWNER_EMAILS") ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}

export async function encryptionKey(): Promise<CryptoKey> {
  const encoded = Deno.env.get("CREDENTIAL_ENCRYPTION_KEY");
  if (!encoded) throw new Error("Credential encryption key is not configured");
  const raw = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  if (raw.length !== 32) throw new Error("Credential encryption key must be 32 bytes encoded as base64");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string): Promise<string> {
  const key = await encryptionKey(); const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  const joined = new Uint8Array(iv.length + encrypted.byteLength); joined.set(iv); joined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...joined));
}

export async function decryptSecret(value: string): Promise<string> {
  const joined = Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); const iv = joined.slice(0, 12); const payload = joined.slice(12);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await encryptionKey(), payload);
  return new TextDecoder().decode(clear);
}

export async function authorize(request: Request): Promise<{ user: { id: string; email?: string }; admin: any } | Response> {
  const origin = request.headers.get("origin"); const headers = corsHeaders(origin);
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (origin && !allowedOrigins.includes(origin)) return json({ error: "Origin not allowed" }, 403, headers);
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Sign-in required" }, 401, headers);
  const projectUrl = Deno.env.get("SUPABASE_URL")!; const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!; const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const userClient = createClient(projectUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user || !ownerAllowed(user.email)) return json({ error: "Not authorized" }, 403, headers);
  const admin = createClient(projectUrl, serviceKey, { auth: { persistSession: false } });
  return { user: { id: user.id, email: user.email }, admin };
}
