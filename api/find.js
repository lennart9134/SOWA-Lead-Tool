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

    const collected = [];
    const seenKey = new Set();
    let offset = Math.max(Number(body.offset) || 0, 0);
    let pages = 0;
    let exhausted = false;

    while (collected.length < limit && pages < MAX_PAGES) {
      let page;
      try {
        page = await leadFinderSearch(filters, { limit, offset, timeoutMs: PAGE_TIMEOUT_MS });
      } catch (err) {
        if (collected.length > 0) break; // haben schon etwas — lieber Teilergebnis als Fehler
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
        collected.push(lead);
        if (collected.length >= limit) break;
      }

      if (page.length < limit) {
        exhausted = true; // BetterContact hatte keine volle Seite mehr → Ende erreicht
        break;
      }
    }

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
