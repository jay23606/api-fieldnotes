# API Fieldnotes

An API discovery playground for browsing the [marcelscruz/public-apis](https://github.com/marcelscruz/public-apis) catalog, trying safe examples, and inspecting returned data.

## Run locally

This is a build-free static app. Open `index.html` directly, or serve this folder with any static file server (for example, `npx serve .`). The catalog is fetched from the upstream repository's generated JSON files when the app loads.

## Supabase setup

1. Copy `config.example.js` to `config.js` and set the Supabase project URL and public anon/publishable key.
2. Apply `supabase/migrations/202610180001_api_fieldnotes.sql` to your Supabase project.
3. Deploy the `save-api-key`, `list-api-keys`, and `delete-api-key` Edge Functions and configure `OWNER_EMAILS` and `ALLOWED_ORIGINS` in function secrets. `OWNER_EMAILS` is a comma-separated allowlist; `ALLOWED_ORIGINS` is a comma-separated list containing the exact local/deployed app origins. Set the GitHub Pages URL in Supabase Auth redirect URLs and site URL.
4. Add an Edge Function encryption key as a Supabase function secret (`CREDENTIAL_ENCRYPTION_KEY`, 32 random bytes encoded as base64). Back it up securely. Provider credentials are encrypted by the function before database storage; Supabase TLS and encryption at rest also apply. This is not end-to-end encryption.

The static site only uses the public anon key. Do not add the service role key, encryption key, or third-party API keys to `config.js`, GitHub Pages variables, or source control. Sign-in is owner-restricted in the Edge Function, but also disable public user sign-ups in Supabase Auth for a personal deployment. Supabase Auth email links can be used for login.

Key entry and persistence are disabled until configuration is present. Saved keys are encrypted by the Edge Function using AES-GCM with a server-only 256-bit key, and list responses expose only provider name, masked suffix, and expiry. Provider-specific proxy functions are not enabled yet. Never call a provider directly with a saved private key from browser code. Supabase `service_role` remains server-side and is accessed only by the Edge Functions after validating the user JWT and owner email.

## Deploy to GitHub Pages

In the repository settings, enable Pages with **GitHub Actions** (or publish the repository root as a static site). Because this app is build-free, no compilation step is required. Configure the Supabase Auth site URL and redirect allowlist to include the deployed Pages URL.

## Catalog and quotas

The upstream catalog provides name, category, description, auth, CORS, and provider link. The app also includes a curated snapshot of HTTPS sample URLs from [tgeissel/keyless-apis](https://github.com/tgeissel/keyless-apis) and [Manavarya09/public-apis-live](https://github.com/Manavarya09/public-apis-live). The first source reports endpoint and browser CORS checks; the second tracks reachability and whether some no-auth endpoints returned data. Their check dates appear in API details and are not a guarantee that an endpoint still works. The app makes a fresh request only after you click **Run request**. The imported sample index supplements the upstream list when a matching API entry is not present. All imported calls use HTTPS GET URLs.

The source catalog does not provide verified rate limits. The app labels quota as unknown unless a provider-specific quota record is independently documented. No-key does not guarantee CORS, uptime, or a stable endpoint.

## Upstream attribution

Catalog metadata comes from [marcelscruz/public-apis](https://github.com/marcelscruz/public-apis). Live sample metadata comes from [tgeissel/keyless-apis](https://github.com/tgeissel/keyless-apis) and [Manavarya09/public-apis-live](https://github.com/Manavarya09/public-apis-live) (both identify as MIT licensed). Preserve attribution and recheck source licenses before distributing a built catalog snapshot.
