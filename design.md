# API Playground — Product Design

## Name and repository

**Recommended product name:** API Fieldnotes  
**Recommended repository:** `api-fieldnotes`

The name suggests a practical place to inspect APIs and record what they return before choosing one for a project. Other candidates: `api-playground`, `api-atlas`, and `open-api-explorer`. Check repository and domain availability before adopting the name publicly.

## Purpose

API Fieldnotes is a personal, browser-based API discovery playground. It helps a developer browse a large catalog, inspect what an API actually returns, understand its authentication and access limits, and decide whether it fits a project.

The initial catalog comes from [marcelscruz/public-apis](https://github.com/marcelscruz/public-apis), which publishes generated category and resource JSON. The catalog supplies API name, category, description, auth type, CORS indicator, and provider link. It does not supply reliable quota data or a universal key-provisioning mechanism.

## Audience and primary task

For one developer evaluating APIs. The central task is:

1. Find an API by category, keyword, auth requirement, or browser accessibility.
2. Open its detail page and understand the data it exposes.
3. Run a safe sample request (or view a curated example when direct calls are blocked).
4. Inspect the response and request metadata.
5. Check documented quota, pricing, and credential requirements before using it elsewhere.

## Product principles

- Show real response data where a safe, documented sample call is available.
- Distinguish source-catalog facts, provider-documented facts, and unverified observations.
- Never imply a quota is universal when the provider varies it by plan, account, or endpoint.
- Never expose private API credentials in the GitHub Pages bundle or browser storage.
- Make failures informative: CORS, missing credentials, rate limiting, network errors, and provider outages are different outcomes.
- Start with no-auth APIs; add authenticated providers only through explicit, secure credential setup.

## Information architecture

### Catalog / home

- Search field with instant filtering.
- Category navigation and result count.
- Filters: auth (`None`, `API key`, `OAuth`, `Other`), CORS (`Yes`, `No`, `Unknown`), a live-demo-only shortcut, quota data available, and recently tested. “No key needed” means the catalog says the provider does not require auth; it does not guarantee a browser-ready example.
- Result cards show name, category, concise description, auth/live-demo badge, CORS badge, and quota confidence/source status.
- Sort by name, category, auth simplicity, or recent activity.

### API detail / explorer

- Identity: name, category, catalog description, provider documentation link, catalog source link, and last catalog refresh.
- Access summary: auth method, CORS status from catalog, known quotas, pricing notes, and citations/checked date.
- Request composer for supported adapters: method, endpoint/path, query parameters, headers, and example input. Default to a read-only sample request; block arbitrary destinations and unsafe methods in the first release.
- “Try example” button for a provider-reviewed sample. Show a note when the app uses a curated fixture instead of a live call.
- Response panel with formatted JSON/text, status, elapsed time, response headers where available, and copy/download controls.
- Data guide: inferred field paths and types from the returned sample, clearly marked as observed from this response rather than a provider schema.
- Useful follow-up links to official docs, terms, and key registration.

### Credentials

- A “Connect provider” flow takes the user to the provider’s own registration or OAuth consent page. The app cannot mint credentials for arbitrary third-party APIs.
- Credentials are added by the account owner and scoped to the selected provider. Show only masked values after saving; support replace and revoke.
- Start with APIs requiring no credentials. For APIs requiring keys, enable only providers for which an explicit adapter and secure storage path have been implemented.

### Activity

- Recent requests list with API, date, status, and duration.
- Store minimal metadata by default; do not persist response bodies or user-supplied parameters unless the user opts in.

## Request limits and quota display

Every API detail should present quota as one of:

- **Documented:** provider documentation states the limit, with plan/endpoint scope, source URL, and checked date.
- **Observed:** a response header or provider response reported a limit/remaining count during a test. Display the exact header and timestamp; do not extrapolate a daily allowance.
- **Unknown:** no reliable current quota has been verified.

Quota fields: requests/units allowed, period, plan, endpoint scope, burst/concurrency constraints, cost or free-tier notes, source URL, checked date, and confidence/status. Model units as text or structured values (for example, requests per minute or monthly credits) rather than assuming every limit is a request count. Parse standard rate-limit headers when present, but treat them as ephemeral observations.

The upstream public-apis catalog has no quota field. Quotas must be researched per provider and can change; they should not be fabricated or silently inferred from a successful sample call.

## Proposed technical shape

- **Frontend:** static single-page app hosted with GitHub Pages. Users sign in before accessing personal features. The public catalog may be readable without an account, but credential entry and authenticated provider calls require a signed-in account.
- **Catalog:** fetch upstream generated `db/categories.json` and `db/resources.json` at build time or through a cached refresh job; keep a last-known-good snapshot so the playground remains browsable if GitHub is unavailable. Normalize the upstream fields and retain source metadata.
- **Supabase:** authentication, user-specific provider connection metadata, protected credential storage through a server-side mechanism, and optional request metadata. Supabase Edge Functions act as the only proxy for credentials or providers blocked by CORS.
- **Adapters:** provider-specific request builders and response handling. Do not offer an unrestricted URL proxy: allowlist hosts, constrain methods, validate input, and apply per-user throttling to prevent SSRF and abuse.
- **Login:** Supabase Auth with email magic link or OAuth. Restrict sign-in to the owner account(s) during the personal MVP; a hidden URL or frontend route is not access control. Configure GitHub Pages origins and redirect URLs in Supabase Auth, and require verified sessions for credential-related functions.
- **Credential vault:** The user enters a provider key in an authenticated settings screen. The browser sends it over HTTPS to a Supabase Edge Function; the function validates the session and stores it encrypted using a server-side encryption key held only in Supabase function secrets (or a vetted managed secret store). The database stores ciphertext, provider identifier, masked suffix, timestamps, and provider-reported expiry where available. Only the Edge Function decrypts credentials for outbound requests. Never return raw keys to the browser after save.
- **Secrets:** GitHub Pages is public and cannot contain secrets. Never place Supabase `service_role`, encryption keys, or provider keys in frontend code, repository history, or public build variables. The Supabase anon/publishable key is expected to be visible in the frontend and is safe only when paired with strict RLS and server-side authorization; it is not a secret. A database field alone is not secret storage unless encryption and access policies are correctly implemented.
- **Session security:** use secure Supabase sessions with refresh handled by the supported client; sign out clears local session state. Enforce account ownership, rate limits, payload limits, and provider host allowlists in every Edge Function. Never log keys, authorization headers, or decrypted request data.
- **Personal MVP assumption:** single-user access protected by Supabase Auth; catalog can be public; credential management and proxy functions require the owner’s authenticated session. No public arbitrary API proxy.

## Key generation and expiry

Third-party API keys are issued by their respective providers, not generated by this app. The app may link to registration pages and guide the user through adding a key. OAuth tokens must use the provider’s consent flow and refresh-token rules.

For providers that issue keys with expiration, use the longest expiry the provider explicitly permits only when the user chooses that credential setup. Store the actual expiry and renewal state; never claim a key is permanent unless the provider documents that. Begin with no-auth APIs as requested, then add key-based providers one at a time.

## Initial scope

### Phase 1: catalog and no-auth exploration

- Import and search the upstream catalog.
- Show category, description, auth, CORS, and provider link.
- Enable curated read-only examples for a small set of no-auth APIs.
- Display live JSON responses and observed HTTP status/duration.
- Explain CORS and present a documentation/fixture fallback when browser requests are blocked.
- Add quota status as Unknown until a provider-specific source is verified.

### Phase 2: verified quotas and API adapters

- Add a reviewed quota record and source/check date for selected APIs.
- Add reusable adapter definitions, example parameters, and response previews.
- Detect rate-limit headers and report observed values separately from documented limits.

### Phase 3: login and user credentials

- Add Supabase Auth login and owner-only access policies.
- Add a credential settings screen to enter, replace, and delete keys; show provider name, masked suffix, and expiry where known.
- Implement server-side encrypted storage and calls through Edge Functions for a deliberately selected set of providers.
- Add expiry tracking, rate limiting, and request history controls. Never put provider keys in `localStorage`, URLs, logs, or static site configuration.

## Non-goals for the first release

- Automatically signing up for third-party services or accepting their terms on the user’s behalf.
- Generating keys for providers that require account registration or manual approval.
- Supporting every API in the upstream list with a working request composer.
- Claiming a uniform quota or expiry policy across providers.
- Arbitrary URL fetching, writes, or destructive API operations.
- Publishing user credentials or private response data in a public demo.

## Safety, privacy, and licensing

- Treat API descriptions and endpoints imported from the catalog as untrusted input; render descriptions as text and validate all request destinations.
- Respect each provider’s terms, attribution requirements, rate limits, and data retention rules.
- Apply Supabase Row Level Security to all user data; keep service credentials server-side.
- Provide a delete-connection action and avoid logging authorization headers, secrets, or sensitive response payloads.
- Keep attribution and license notices for the upstream catalog. Verify the repository’s current license and required notices when implementation begins.
- Keep credential settings and proxy operations behind authenticated access; public visitors may browse the catalog only.

## Success criteria

- A user can find an API from the source catalog and quickly identify its category, auth type, and CORS indicator.
- A supported no-auth API can be tried and its actual response inspected without leaving the playground.
- A blocked or failed call explains the likely cause and offers an appropriate next step.
- Quota information always includes scope, evidence/source, and date, or explicitly says Unknown.
- No private key is shipped to the browser or committed to the repository.

## Open implementation decisions

- Choose a frontend framework and catalog refresh strategy.
- Select the initial handful of no-auth APIs and create provider-checked example requests.
- Decide whether the first deployed version is private or a public read-only showcase.
- Verify Supabase’s current secrets and encryption options before storing user API credentials.
- Confirm the final product/repository name and check availability.
