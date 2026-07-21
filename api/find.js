// POST /api/find — Lead Finder (kostenlos). Body: { preset, max }.
// Gibt die gefundenen Leads zurück (ohne E-Mail/Telefon).
import { checkPassword } from "../lib/auth.js";
import { PRESETS, toFilters } from "../lib/presets.js";
import { leadFinderSearch } from "../lib/betterContact.js";

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
    const leads = await leadFinderSearch(toFilters(spec.filters), { limit });
    res.status(200).json({ ok: true, leads, preset: spec.label });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "Suche fehlgeschlagen." });
  }
}
