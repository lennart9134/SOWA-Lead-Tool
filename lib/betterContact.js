// BetterContact-Client für die Web-App: Lead Finder (Suche) + Enrichment.
// Vertrag verifiziert gegen die funktionierende OpenOutreach-Referenz.
// API-Key kommt aus process.env (serverseitig) — nie zum Client.

const LEADFINDER_URL = "https://app.bettercontact.rocks/api/v2/lead_finder/async";
const ENRICH_URL = "https://app.bettercontact.rocks/api/v2/async";
// Cloudflare blockt Nicht-Browser-UAs (403/1010) — Browser-UA vortäuschen.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const POLL_MS = 4000;
// Unter der Vercel-Function-maxDuration (60s) bleiben — lieber sauberer Fehler
// als serverseitiger Kill. Für größere Läufe maxDuration erhöhen (Pro: 300s).
const DEFAULT_TIMEOUT_MS = 45_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function requireKey() {
  const k = process.env.BETTERCONTACT_API_KEY;
  if (!k) throw new Error("BETTERCONTACT_API_KEY ist serverseitig nicht gesetzt.");
  return k;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      "X-API-Key": requireKey(),
      "User-Agent": UA,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`BetterContact ${res.status}: ${text}`);
  }
  return res.json();
}

async function submitAndPoll(url, body, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const submit = await api("POST", url, body);
  const id = submit.request_id || submit.id;
  if (!id) throw new Error(`keine request id: ${JSON.stringify(submit)}`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const b = await api("GET", `${url}/${encodeURIComponent(id)}`);
    if (b.status === "terminated") return b;
  }
  throw new Error("BetterContact: Zeitüberschreitung (Job lief zu lange).");
}

// ── Lead Finder (Suche, kostenlos) ──
function mapLead(l) {
  return {
    firstName: l.contact_first_name || "",
    lastName: l.contact_last_name || "",
    company: l.company_name || "",
    companyDomain: l.company_domain || "",
    linkedinUrl: l.contact_linkedin_profile_url || "",
    jobTitle: l.contact_job_title || "",
    country: l.contact_location_country || "",
    industry: l.contact_industry || l.company_industry || "",
    headline: l.contact_headline || "",
  };
}

export async function leadFinderSearch(filters, { limit = 25, offset = 0, timeoutMs } = {}) {
  const body = await submitAndPoll(LEADFINDER_URL, { filters, limit, offset }, timeoutMs);
  const leads = (body.leads || []).map(mapLead);
  // Dedup über LinkedIn-URL bzw. Name@Firma
  const seen = new Set();
  return leads.filter((l) => {
    const key = (l.linkedinUrl || `${l.firstName} ${l.lastName} @ ${l.company}`).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Enrichment (E-Mail + Telefon, kostenpflichtig) ──
const looksLikePhone = (v) => v != null && /[0-9]{6,}/.test(String(v));
function pickEnriched(rec) {
  let phone = [rec.contact_phone_number, rec.contact_phone, rec.phone_number].find(looksLikePhone) ?? "";
  if (!phone) {
    const hit = Object.entries(rec).find(
      ([k, v]) =>
        /phone|mobile/i.test(k) &&
        !/status|type|valid|verified|score|country|code|provider/i.test(k) &&
        looksLikePhone(v)
    );
    phone = hit?.[1] ?? "";
  }
  return {
    email: rec.contact_email_address ?? "",
    emailStatus: rec.contact_email_address_status ?? "",
    phone: phone ? String(phone) : "",
  };
}

export async function enrichContacts(items, { timeoutMs } = {}) {
  const data = items.map((it, i) => ({
    first_name: it.firstName || "",
    last_name: it.lastName || "",
    company: it.company || "",
    company_domain: it.companyDomain || "",
    linkedin_url: it.linkedinUrl || "",
    custom_fields: { uuid: String(i), list_name: "sowa-lead-app" },
  }));
  const body = await submitAndPoll(ENRICH_URL, {
    data,
    enrich_email_address: true,
    enrich_phone_number: true,
  }, timeoutMs);
  const results = body.data || [];
  const contacts = items.map((it, i) => ({ ...it, ...pickEnriched(results[i] || {}) }));
  return { contacts, creditsLeft: body.credits_left ?? null };
}
