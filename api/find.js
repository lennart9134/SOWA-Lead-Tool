// POST /api/find — Lead Finder (kostenlos). Body: { preset, max, offset }.
// Gibt neue Leads zurück (ohne E-Mail/Telefon) — bereits im CRM vorhandene
// Kontakte (per LinkedIn-URL) werden automatisch übersprungen, und es wird bei
// Bedarf über mehrere BetterContact-Seiten nachgeladen, damit trotz Filterung
// möglichst `max` frische Leads zurückkommen. `offset`/`nextOffset` lassen den
// Client bei wiederholten Suchen im selben Preset weiterblättern statt immer
// die gleiche erste Seite zu bekommen.
import { checkPassword } from "../lib/auth.js";
import { PRESETS, toFilters } from "../lib/presets.js";
import { leadFinderSearch } from "../lib/betterContact.js";
import { findExistingLinkedinUrls } from "../lib/crm.js";

const MAX_PAGES = 4; // Sicherheitsgrenze gegen zu viele Nachlade-Runden
const PAGE_TIMEOUT_MS = 12_000; // pro BetterContact-Seite, damit MAX_PAGES sicher unter dem Vercel-Timeout bleibt
const MAX_PER_COMPANY = 3; // gegen Listen, die von einer einzigen Firma dominiert werden

function normalizeWords(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

// Wie gut passt der Jobtitel eines Leads zu den im Preset gesuchten Titeln?
// Wortüberdeckung (wie viele Wörter des Wunschtitels im echten Titel stecken)
// zählt am meisten, ein früher Preset-Eintrag bricht Gleichstände.
function jobTitleScore(jobTitle, wantedTitles) {
  const titleWords = new Set(normalizeWords(jobTitle));
  let best = 0;
  (wantedTitles || []).forEach((wanted, i) => {
    const wantedWords = normalizeWords(wanted);
    if (!wantedWords.length) return;
    const hits = wantedWords.filter((w) => titleWords.has(w)).length;
    const coverage = hits / wantedWords.length;
    if (coverage === 0) return;
    const priority = wantedTitles.length - i;
    best = Math.max(best, coverage * 1000 + priority);
  });
  return best;
}

function companyKey(lead) {
  const name = (lead.company || "").trim().toLowerCase();
  if (name) return `n:${name}`;
  const domain = (lead.companyDomain || "").trim().toLowerCase();
  if (domain) return `d:${domain}`;
  return `u:${(lead.linkedinUrl || `${lead.firstName}-${lead.lastName}`).toLowerCase()}`;
}

// Max. `maxPerCompany` Leads je Firma, Rest wird verworfen — pro Firma bleiben
// die mit dem am besten passenden Jobtitel übrig.
function capPerCompany(leads, maxPerCompany, wantedTitles) {
  const groups = new Map();
  for (const lead of leads) {
    const key = companyKey(lead);
    const scored = { lead, score: jobTitleScore(lead.jobTitle, wantedTitles) };
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(scored);
  }
  const kept = [];
  for (const group of groups.values()) {
    group.sort((a, b) => b.score - a.score);
    kept.push(...group.slice(0, maxPerCompany));
  }
  kept.sort((a, b) => b.score - a.score);
  return kept.map((item) => item.lead);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "method not allowed" });
      return;
    }
    if (!checkPassword(req)) {
      res.status(401).json({ ok: false, error: "Falsches oder fehlendes Passwort." });
      return;
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const spec = PRESETS[body.preset];
    if (!spec) {
      res.status(400).json({ ok: false, error: "Unbekanntes Preset." });
      return;
    }
    const limit = Math.min(Math.max(Number(body.max) || 25, 1), 50);
    const filters = toFilters(spec.filters);
    const wantedTitles = spec.filters.job_titles || [];

    const pool = []; // ungekappt — Firmen-Kappung läuft erst am Ende über den ganzen Pool
    const seenKey = new Set();
    let offset = Math.max(Number(body.offset) || 0, 0);
    let pages = 0;
    let exhausted = false;
    let collected = [];

    while (pages < MAX_PAGES) {
      collected = capPerCompany(pool, MAX_PER_COMPANY, wantedTitles);
      if (collected.length >= limit) break; // genug passende Leads nach Firmen-Kappung

      let page;
      try {
        page = await leadFinderSearch(filters, { limit, offset, timeoutMs: PAGE_TIMEOUT_MS });
      } catch (err) {
        if (pool.length > 0) break; // haben schon etwas — lieber Teilergebnis als Fehler
        throw err;
      }
      pages++;
      if (!page.length) {
        exhausted = true;
        break;
      }
      offset += page.length;

      let existing = new Set();
      try {
        existing = await findExistingLinkedinUrls(page.map((l) => l.linkedinUrl).filter(Boolean));
      } catch {
        /* Abgleich ist best effort — Suche funktioniert auch ohne */
      }

      for (const lead of page) {
        const key = (lead.linkedinUrl || `${lead.firstName} ${lead.lastName} @ ${lead.company}`).toLowerCase();
        if (seenKey.has(key)) continue;
        if (lead.linkedinUrl && existing.has(lead.linkedinUrl.toLowerCase())) continue; // schon im CRM
        seenKey.add(key);
        pool.push(lead);
      }

      if (page.length < limit) {
        exhausted = true; // BetterContact hatte keine volle Seite mehr → Ende erreicht
        break;
      }
    }

    collected = capPerCompany(pool, MAX_PER_COMPANY, wantedTitles).slice(0, limit);

    res.status(200).json({
      ok: true,
      leads: collected,
      preset: spec.label,
      nextOffset: offset,
      exhausted,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "Suche fehlgeschlagen." });
  }
}
