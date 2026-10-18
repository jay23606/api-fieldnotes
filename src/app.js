const UPSTREAM = "https://raw.githubusercontent.com/marcelscruz/public-apis/main/db";
const PAGE_SIZE = 24;
const EXAMPLES = {
  "Cat Facts": { url: "https://catfact.ninja/fact", note: "One random cat fact. A compact example of a simple JSON response." },
  "Dog Pics": { url: "https://dog.ceo/api/breeds/image/random", note: "One random dog image URL and a status field." },
  "RandomDog": { url: "https://random.dog/woof.json", note: "A randomly selected dog image URL." },
  "RandomFox": { url: "https://randomfox.ca/floof/", note: "A random fox image URL and image number." },
  "RandomDuck": { url: "https://random-d.uk/api/v2/random", note: "A random duck image URL." },
  "HTTP Cat": { url: "https://http.cat/200.json", note: "An example status-code response (provider may return image content instead)." },
  "HTTP Dog": { url: "https://http.dog/200.json", note: "An example status-code response (provider may return image content instead)." },
  "MeowFacts": { url: "https://meowfacts.herokuapp.com/", note: "A random cat fact in a small JSON array." },
  "Jikan": { url: "https://api.jikan.moe/v4/anime?q=naruto&limit=3", note: "Three anime search results, useful for inspecting nested metadata." },
  "PokéAPI": { url: "https://pokeapi.co/api/v2/pokemon/pikachu", note: "A detailed Pokémon object with types, stats, and sprite links." },
  "Art Institute of Chicago": { url: "https://api.artic.edu/api/v1/artworks/search?q=monet&limit=3&fields=id,title,artist_title,date_display,image_id", note: "A small art search response with selected artwork fields." },
  "Dictionary": { url: "https://api.dictionaryapi.dev/api/v2/entries/en/serendipity", note: "Definitions, phonetics, and examples for one English word." },
  "Open-Meteo": { url: "https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.006&current=temperature_2m,relative_humidity_2m,wind_speed_10m", note: "Current weather readings for New York (coordinates are in the URL)." },
};
const liveExampleNames = new Set(Object.keys(EXAMPLES));

let supabaseConfig = { supabaseUrl: "", supabaseAnonKey: "" };
try { const module = await import("../config.js"); supabaseConfig = { ...supabaseConfig, ...module.config }; } catch { /* Local config is optional. */ }

const state = { entries: [], categories: [], filtered: [], visible: PAGE_SIZE, selectedCategory: "", preset: "", session: null, credentials: [], client: null, online: true, demoCatalogDate: "", demoSource: "" };
const el = (id) => document.getElementById(id);
const apiGrid = el("api-grid");
const apiDialog = el("api-dialog");
const authDialog = el("auth-dialog");

function esc(value = "") { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function slug(value = "") { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 120) || "api"; }
function noAuth(auth) { return !auth || String(auth).trim().toLowerCase() === "no"; }
function corsValue(cors) { return String(cors || "unknown").trim().toLowerCase(); }
function authLabel(auth) { return noAuth(auth) ? "NO KEY" : String(auth).toLowerCase() === "apikey" ? "API KEY" : String(auth).toLowerCase() === "oauth" ? "OAUTH" : String(auth).toUpperCase(); }
function authClass(auth) { return noAuth(auth) ? "no-key" : String(auth).toLowerCase() === "apikey" ? "key" : String(auth).toLowerCase() === "oauth" ? "oauth" : ""; }
function notify(message) { const toast = el("toast"); toast.textContent = message; toast.classList.add("visible"); clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove("visible"), 3300); }

async function loadCatalog() {
  try {
    const [categoriesRes, resourcesRes] = await Promise.all([fetch(`${UPSTREAM}/categories.json`), fetch(`${UPSTREAM}/resources.json`)]);
    if (!categoriesRes.ok || !resourcesRes.ok) throw new Error("Catalog is temporarily unavailable");
    const [categories, resources] = await Promise.all([categoriesRes.json(), resourcesRes.json()]);
    state.categories = categories.entries || [];
    state.entries = (resources.entries || []).map((item) => ({ ...item, slug: slug(item.API), quota: null }));
    await mergeLiveDemoCatalog();
    state.online = true;
    sessionStorage.setItem("af-catalog-cache", JSON.stringify({ savedAt: Date.now(), categories: state.categories, entries: state.entries }));
  } catch (error) {
    state.online = false;
    try {
      const cached = JSON.parse(sessionStorage.getItem("af-catalog-cache") || "null");
      if (cached?.entries?.length) { state.categories = cached.categories || []; state.entries = cached.entries; }
      else throw error;
    } catch {
      el("result-count").textContent = "Catalog unavailable";
      el("results-label").textContent = "Could not load the API catalog";
      el("api-grid").innerHTML = `<div class="empty-state"><h3>Couldn’t reach the catalog</h3><p>${esc(error.message)}. Check your connection and try again.</p><button id="retry-catalog">Retry</button></div>`;
      document.getElementById("retry-catalog")?.addEventListener("click", loadCatalog);
      return;
    }
  }
  renderCategories();
  await loadQuotaNotes();
  const liveCount = state.entries.filter((entry) => noAuth(entry.Auth) && getExamples(entry).length > 0).length;
  el("live-demo-count").textContent = `(${liveCount})`;
  el("result-count").textContent = `${state.entries.length.toLocaleString()} APIs`;
  el("category-count").textContent = state.categories.length;
  el("catalog-updated").textContent = state.online ? `Catalog fetched just now · ${new Date().toLocaleDateString()}` : "Showing saved catalog · offline";
  populateCategories();
  applyFilters();
}

function normalizedName(value) { return String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, ""); }
const demoAliases = {
  artinstitutechicago: "Art Institute of Chicago", dogceo: "Dog Pics", randomuser: "RandomUser",
  opentriviadb: "Open Trivia", openlibrarysearch: "Open Library", nominatimosm: "Nominatim",
  openmeteoairquality: "Open-Meteo", openmeteomarine: "Open-Meteo", openmeteoflood: "Open-Meteo",
  openmeteohistorical: "Open-Meteo", openmeteoclimate: "Open-Meteo", openmeteoensemble: "Open-Meteo",
  openmeteogeocoding: "Open-Meteo", opentriviacategories: "Open Trivia", cocktaildbcategories: "TheCocktailDB",
  cocktaildbsearch: "TheCocktailDB", freedictionary: "Free Dictionary", usgsearthquakes: "USGS",
};
const demoCategoryAliases = { Art: "Art & Design", Books: "Books", Calendar: "Calendar", Dev: "Development", Food: "Food & Drink", Games: "Games & Comics", Geo: "Geocoding", Language: "Dictionaries", Literature: "Books", Science: "Science & Math", Trivia: "Entertainment", Weather: "Weather", Animals: "Animals", Fun: "Personality", Music: "Music", Health: "Health", Finance: "Currency Exchange", Images: "Photography", Network: "Development", Social: "Personality" };

async function mergeLiveDemoCatalog() {
  try {
    const response = await fetch("./data/keyless-examples.json");
    if (!response.ok) return;
    const source = await response.json();
    state.demoCatalogDate = source.generated || "";
    state.demoSource = source.source || "";
    for (const demo of source.entries || []) {
      let url;
      try { url = new URL(demo.test_url); } catch { continue; }
      if (url.protocol !== "https:") continue;
      const targetName = demoAliases[normalizedName(demo.name)] || demo.name;
      let entry = state.entries.find((item) => normalizedName(item.API) === normalizedName(targetName));
      if (!entry) {
        entry = { API: demo.name, Description: "No-key sample request curated for live API exploration.", Auth: "", Cors: "yes", Category: demoCategoryAliases[demo.category] || demo.category || "Open Data", Link: demo.docs_url, slug: slug(`demo-${demo.id}`), quota: null, catalogSupplement: true };
        state.entries.push(entry);
      }
      if (!noAuth(entry.Auth)) continue;
      entry.liveExamples ||= [];
      if (!entry.liveExamples.some((sample) => sample.url === url.href)) entry.liveExamples.push({ title: demo.name, url: url.href, note: "A safe, read-only sample response. Open the provider docs to explore other endpoints and inputs.", docs: demo.docs_url, checkedAt: demo.last_checked, responseMs: demo.response_ms, source: state.demoSource });
    }
  } catch { /* Curated live examples are an optional enhancement. */ }
}

async function loadQuotaNotes() {
  const client = await getSupabase().catch(() => null);
  if (!client) return;
  const { data, error } = await client.from("af_quota_notes").select("provider_slug,quota_summary,scope,source_url,checked_at,confidence");
  if (error || !data) return;
  const notes = new Map(data.map((note) => [note.provider_slug, note]));
  state.entries = state.entries.map((entry) => ({ ...entry, quota: notes.get(entry.slug) ?? null }));
}

function getExamples(entry) {
  const examples = [...(entry.liveExamples || [])];
  const legacy = EXAMPLES[entry.API];
  if (legacy && !examples.some((sample) => sample.url === legacy.url)) examples.push({ title: "Curated sample", ...legacy });
  return examples;
}

function populateCategories() {
  const select = el("category-filter");
  const sorted = [...state.categories].sort((a, b) => a.name.localeCompare(b.name));
  select.innerHTML = `<option value="">All categories</option>${sorted.map((category) => `<option value="${esc(category.name)}">${esc(category.name)}</option>`).join("")}`;
}
function renderCategories() {
  const popular = ["AI", "Animals", "Anime", "Art & Design", "Books", "Development", "Food & Drink", "Games & Comics", "Government", "Music", "Open Data", "Science & Math", "Weather"];
  const available = new Set(state.entries.map((x) => x.Category));
  const categories = state.categories.filter((c) => popular.includes(c.name) && available.has(c.name)).sort((a,b) => popular.indexOf(a.name)-popular.indexOf(b.name));
  el("category-list").innerHTML = categories.map((category) => {
    const count = state.entries.filter((entry) => entry.Category === category.name).length;
    return `<button class="category-button ${state.selectedCategory === category.name ? "active" : ""}" data-category="${esc(category.name)}">${esc(category.name)}<span>${count}</span></button>`;
  }).join("");
  el("category-list").querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => { state.selectedCategory = state.selectedCategory === button.dataset.category ? "" : button.dataset.category; el("category-filter").value = state.selectedCategory; renderCategories(); applyFilters(); }));
}

function applyFilters() {
  const query = el("search").value.trim().toLowerCase();
  const auth = el("auth-filter").value;
  const category = el("category-filter").value || state.selectedCategory;
  const sort = el("sort-select").value;
  let entries = state.entries.filter((entry) => {
    const matchQuery = !query || [entry.API, entry.Description, entry.Category].some((field) => String(field || "").toLowerCase().includes(query));
    const matchAuth = !auth || (auth === "No" ? noAuth(entry.Auth) : String(entry.Auth).toLowerCase() === String(auth).toLowerCase());
    const matchCategory = !category || entry.Category === category;
    const matchPreset = state.preset === "noauth" ? noAuth(entry.Auth) : state.preset === "live" ? noAuth(entry.Auth) && getExamples(entry).length > 0 : state.preset === "cors" ? corsValue(entry.Cors) === "yes" : state.preset === "quota" ? Boolean(entry.quota) : true;
    return matchQuery && matchAuth && matchCategory && matchPreset;
  });
  if (sort === "category") entries.sort((a,b) => a.Category.localeCompare(b.Category) || a.API.localeCompare(b.API));
  else if (sort === "simple") entries.sort((a,b) => Number(noAuth(b.Auth)) - Number(noAuth(a.Auth)) || a.API.localeCompare(b.API));
  else entries.sort((a,b) => a.API.localeCompare(b.API));
  state.filtered = entries; state.visible = PAGE_SIZE;
  renderCards();
}
function renderCards() {
  const rows = state.filtered.slice(0, state.visible);
  apiGrid.innerHTML = rows.map((entry) => { const cors = corsValue(entry.Cors); const hasLive = noAuth(entry.Auth) && getExamples(entry).length > 0; const access = hasLive ? "NO KEY · LIVE" : authLabel(entry.Auth); return `<article class="api-card" tabindex="0" role="button" aria-label="Explore ${esc(entry.API)}" data-slug="${esc(entry.slug)}"><div class="card-top"><span class="category-tag">${esc(entry.Category || "Uncategorized")}</span><span class="auth-tag ${noAuth(entry.Auth) ? "no-key" : authClass(entry.Auth)}">${access}</span></div><h3>${esc(entry.API)}</h3><p>${esc(entry.Description || "No description provided.")}</p><div class="card-bottom"><span class="cors-indicator ${cors === "no" ? "no" : ""}"><i></i>${cors === "yes" ? "BROWSER READY" : cors === "no" ? "CORS BLOCKED" : "CORS UNKNOWN"}</span><span class="card-arrow">↗</span></div></article>`; }).join("");
  apiGrid.querySelectorAll(".api-card").forEach((card) => { const open = () => openApi(state.entries.find((entry) => entry.slug === card.dataset.slug)); card.addEventListener("click", open); card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } }); });
  el("result-count").textContent = `${state.filtered.length.toLocaleString()} APIs`;
  el("results-label").textContent = state.filtered.length ? `Showing ${rows.length} of ${state.filtered.length.toLocaleString()} APIs` : "No APIs match these filters";
  el("empty-state").hidden = state.filtered.length > 0;
  el("load-more").hidden = state.visible >= state.filtered.length;
}

function openApi(entry) {
  if (!entry) return;
  const examples = getExamples(entry);
  let selectedExample = examples[0];
  const quota = entry.quota;
  const quotaMarkup = quota ? `<div class="quota-panel"><b>REQUEST LIMITS · ${esc(quota.confidence.toUpperCase())}${quota.checked_at ? ` · CHECKED ${esc(quota.checked_at)}` : ""}</b><p>${esc(quota.quota_summary)}${quota.scope ? ` · ${esc(quota.scope)}` : ""}${quota.source_url ? ` · <a href="${safeUrl(quota.source_url)}" target="_blank" rel="noreferrer">Source ↗</a>` : ""}</p></div>` : `<div class="quota-panel"><b>REQUEST LIMITS · NOT VERIFIED</b><p>The source catalog does not include quotas. Check the provider’s plan and rate-limit documentation before building against it.</p></div>`;
  const anonymous = noAuth(entry.Auth); const corsBlocked = corsValue(entry.Cors) === "no";
  const picker = examples.length > 1 ? `<label class="sort-control">SAMPLE <select id="example-select">${examples.map((sample, index) => `<option value="${index}">${esc(sample.title || `Sample ${index + 1}`)}</option>`).join("")}</select></label>` : "";
  const sourceNote = (sample) => sample?.checkedAt ? `<div class="response-meta">Browser CORS check by <a href="${safeUrl(sample.source)}" target="_blank" rel="noreferrer">keyless-apis</a> · ${new Date(sample.checkedAt).toLocaleDateString()}. <a href="${safeUrl(sample.docs)}" target="_blank" rel="noreferrer">Sample docs ↗</a> · Run request to check it again.</div>` : "";
  el("api-detail").innerHTML = `<div class="detail-content"><div class="detail-eyebrow">${esc(entry.Category || "API")} · ${entry.catalogSupplement ? "LIVE SAMPLE INDEX" : "CATALOG ENTRY"}</div><h2>${esc(entry.API)}</h2><p class="detail-desc">${esc(entry.Description || "No description provided by the source catalog.")}</p><div class="detail-badges"><span>${authLabel(entry.Auth)}</span><span>CORS: ${esc(entry.Cors || "Unknown")}</span><span>QUOTA: ${quota ? esc(quota.confidence.toUpperCase()) : "UNKNOWN"}</span></div><div class="detail-links"><a href="${safeUrl(entry.Link)}" target="_blank" rel="noreferrer">Provider documentation ↗</a><a href="https://github.com/marcelscruz/public-apis" target="_blank" rel="noreferrer">Catalog source ↗</a></div>${quotaMarkup}${selectedExample && anonymous ? `<div class="try-panel"><div class="try-head"><strong>TRY A LIVE EXAMPLE</strong>${picker}<button id="run-example">Run request ↗</button></div><div class="try-body"><p id="example-note">${esc(selectedExample.note)}</p><div class="endpoint-line"><span class="method">GET</span><span id="example-url">${esc(selectedExample.url)}</span></div><div id="example-source-note">${sourceNote(selectedExample)}</div><div id="response-out"></div></div></div>` : `<div class="quota-panel"><b>${anonymous ? "EXPLORATION NOTE" : "CONNECT TO EXPLORE"}</b><p>${anonymous ? (corsBlocked ? "This provider blocks browser requests. We’ll add a server-side adapter after Supabase is configured; meanwhile, open the provider documentation." : "A live adapter for this API is not included yet. Check the provider docs for endpoints and sample data.") : "This API requires credentials or OAuth. Add your own provider key after configuring Supabase. The app does not generate third-party keys."}</p></div>`}</div>`;
  apiDialog.showModal();
  document.getElementById("run-example")?.addEventListener("click", (event) => runExample(entry, event.currentTarget, selectedExample));
  document.getElementById("example-select")?.addEventListener("change", (event) => {
    selectedExample = examples[Number(event.currentTarget.value)];
    document.getElementById("example-note").textContent = selectedExample.note;
    document.getElementById("example-url").textContent = selectedExample.url;
    document.getElementById("example-source-note").innerHTML = sourceNote(selectedExample);
    document.getElementById("response-out").innerHTML = "";
  });
}
function safeUrl(value = "") { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? esc(url.href) : "#"; } catch { return "#"; } }
async function runExample(entry, button, example = getExamples(entry)[0]) {
  const output = document.getElementById("response-out");
  button.disabled = true; button.textContent = "Requesting…"; output.innerHTML = `<div class="response-meta">CONTACTING PROVIDER…</div>`;
  const started = performance.now();
  try {
    const response = await fetch(example.url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    const contentType = response.headers.get("content-type") || "";
    if (contentType.startsWith("image/")) {
      if (runExample.objectUrl) URL.revokeObjectURL(runExample.objectUrl);
      runExample.objectUrl = URL.createObjectURL(await response.blob());
      output.innerHTML = `<div class="response-box"><img alt="Live API response image" src="${runExample.objectUrl}" style="display:block;max-width:100%;max-height:340px;margin:auto;border-radius:3px" /></div><div class="response-meta">HTTP ${response.status} · ${Math.round(performance.now()-started)} ms · ${esc(contentType)} · ${response.ok ? "SUCCESS" : "PROVIDER ERROR"}</div>`;
    } else {
      const text = await response.text();
      let formatted; try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch { formatted = text; }
      output.innerHTML = `<div class="response-box">${esc(formatted.slice(0, 18000))}</div><div class="response-meta">HTTP ${response.status} · ${Math.round(performance.now()-started)} ms · ${esc(contentType || "response") } · observed just now · ${response.ok ? "SUCCESS" : "PROVIDER ERROR"}</div>`;
    }
  } catch (error) {
    const cors = error instanceof TypeError;
    output.innerHTML = `<div class="response-box">${cors ? "The browser could not read this provider response. This is commonly caused by CORS; it does not necessarily mean the API is down." : esc(error.message)}</div><div class="response-meta">REQUEST FAILED · No quota could be observed</div>`;
  } finally { button.disabled = false; button.textContent = "Run again ↗"; }
}

async function getSupabase() {
  if (!supabaseConfig.supabaseUrl || !supabaseConfig.supabaseAnonKey) return null;
  if (!state.client) {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    state.client = createClient(supabaseConfig.supabaseUrl, supabaseConfig.supabaseAnonKey);
    const { data } = await state.client.auth.getSession(); state.session = data.session;
    state.client.auth.onAuthStateChange((_event, session) => { state.session = session; updateLogin(); if (session) loadCredentialMetadata(); else state.credentials = []; });
  }
  return state.client;
}
function updateLogin() { el("login-label").textContent = state.session ? "Account" : "Sign in"; }
async function openAuth() {
  const client = await getSupabase().catch(() => null);
  if (!client) {
    el("auth-content").innerHTML = `<div class="auth-content"><div class="detail-eyebrow">ACCOUNT & KEYS</div><h2>Connect your workspace.</h2><p>Sign in to save provider keys securely and use supported authenticated APIs. Authentication is not configured for this local prototype yet.</p><div class="auth-note">Add a Supabase project URL and public anon/publishable key to <code>config.js</code> (see <code>config.example.js</code>). The public catalog works without login. Never add a provider key to browser config.</div><button class="auth-action" id="auth-close">Got it</button></div>`;
    authDialog.showModal(); document.getElementById("auth-close").addEventListener("click", () => authDialog.close()); return;
  }
  if (state.session) {
    await loadCredentialMetadata();
    const rows = state.credentials.length ? state.credentials.map((item) => `<div class="key-row"><div><b>${esc(item.provider_slug)}</b><span>••••${esc(item.masked_suffix || "••••")} · ${item.expires_at ? `expires ${new Date(item.expires_at).toLocaleDateString()}` : "expiry not specified"}</span></div><button data-delete-key="${esc(item.provider_slug)}">Remove</button></div>`).join("") : `<div class="auth-note">No provider keys saved yet. Add one below. The raw value is sent to an authenticated server function and is never returned after saving.</div>`;
    el("auth-content").innerHTML = `<div class="auth-content"><div class="detail-eyebrow">SIGNED IN</div><h2>Your connections.</h2><p>${esc(state.session.user.email || "Signed-in account")}</p>${rows}<form class="auth-form" id="key-form"><label for="provider">Provider</label><input id="provider" required maxlength="120" placeholder="For example, OpenWeather" /><label for="provider-key">API key</label><input id="provider-key" required type="password" autocomplete="new-password" placeholder="Paste your provider key" /><label for="key-expiry">Expiry date (optional)</label><input id="key-expiry" type="date" /><button type="submit">Save key securely</button></form><div class="auth-note">Keys are protected by Supabase Auth, TLS, row-level access controls, and server-side handling. Never share this account. Remove a key to revoke its stored copy; revoke it with the provider too.</div><button class="auth-action" id="signout-button">Sign out</button></div>`;
    authDialog.showModal();
    el("key-form").addEventListener("submit", saveCredential);
    document.querySelectorAll("[data-delete-key]").forEach((button) => button.addEventListener("click", () => deleteCredential(button.dataset.deleteKey)));
    el("signout-button").addEventListener("click", async () => { await client.auth.signOut(); authDialog.close(); });
  } else {
    el("auth-content").innerHTML = `<div class="auth-content"><div class="detail-eyebrow">PRIVATE WORKSPACE</div><h2>Sign in to your fieldnotes.</h2><p>We’ll email you a one-time sign-in link. Access to keys is restricted by your Supabase project’s owner policy.</p><form class="auth-form" id="login-form"><label for="email">Email address</label><input id="email" type="email" autocomplete="email" required placeholder="you@example.com" /><button type="submit">Email me a sign-in link</button></form><div id="login-feedback" class="auth-note">Use an email address allowed by your Supabase project. For a personal deployment, disable public sign-ups and invite only your account.</div></div>`;
    authDialog.showModal();
    el("login-form").addEventListener("submit", async (event) => { event.preventDefault(); const email = el("email").value.trim(); const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0] } }); el("login-feedback").textContent = error ? error.message : "Check your inbox for the sign-in link."; });
  }
}
async function loadCredentialMetadata() {
  const client = await getSupabase(); if (!client || !state.session) return;
  const { data, error } = await client.functions.invoke("list-api-keys");
  state.credentials = error ? [] : (data?.credentials || []);
}
async function saveCredential(event) {
  event.preventDefault(); const client = await getSupabase(); const button = event.currentTarget.querySelector("button[type=submit]");
  const provider = el("provider").value.trim(); const key = el("provider-key").value; const expiresAt = el("key-expiry").value || null;
  button.disabled = true; button.textContent = "Saving securely…";
  try {
    const { error } = await client.functions.invoke("save-api-key", { body: { provider, apiKey: key, expiresAt } });
    if (error) throw error; el("provider-key").value = ""; notify("Provider key saved securely"); await openAuth();
  } catch (error) { notify(`Couldn’t save key: ${error.message || "function unavailable"}`); button.disabled = false; button.textContent = "Save key securely"; }
}
async function deleteCredential(provider) {
  const client = await getSupabase();
  try { const { error } = await client.functions.invoke("delete-api-key", { body: { provider } }); if (error) throw error; notify("Saved key removed"); await openAuth(); }
  catch (error) { notify(`Couldn’t remove key: ${error.message || "function unavailable"}`); }
}

function wireUI() {
  ["search", "auth-filter", "category-filter", "sort-select"].forEach((id) => el(id).addEventListener(id === "search" ? "input" : "change", () => { if (id === "category-filter") { state.selectedCategory = el(id).value; renderCategories(); } applyFilters(); }));
  el("load-more").addEventListener("click", () => { state.visible += PAGE_SIZE; renderCards(); });
  el("clear-filters").addEventListener("click", () => { el("search").value = ""; el("auth-filter").value = ""; el("category-filter").value = ""; state.selectedCategory = ""; state.preset = ""; document.querySelectorAll("[data-preset]").forEach((button) => button.classList.remove("active")); renderCategories(); applyFilters(); });
  el("all-categories").addEventListener("click", () => { el("category-filter").focus(); el("category-filter").click(); });
  document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => { state.preset = state.preset === button.dataset.preset ? "" : button.dataset.preset; document.querySelectorAll("[data-preset]").forEach((item) => item.classList.toggle("active", item === button && Boolean(state.preset))); el("auth-filter").value = state.preset === "noauth" || state.preset === "live" ? "No" : ""; applyFilters(); }));
  el("login-trigger").addEventListener("click", openAuth);
  document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); el("search").focus(); } });
}

wireUI();
await getSupabase().catch(() => null);
updateLogin();
await loadCatalog();
