// POST /api/enrich-start — startet den Anreicherungs-Job (kurz). Body: { leads }.
// Gibt { requestId } zurück; der Browser pollt danach /api/enrich-status.
import { checkPassword } from "../lib/auth.js";
import { enrichSubmit } from "../lib/betterContact.js";

const MAX_SELECT = 20;

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
    const leads = Array.isArray(req.body?.leads) ? req.body.leads : [];
    if (!leads.length) {
      res.status(400).json({ ok: false, error: "Keine Leads ausgewählt." });
      return;
    }
    if (leads.length > MAX_SELECT) {
      res.status(400).json({ ok: false, error: `Bitte höchstens ${MAX_SELECT} Leads pro Durchgang.` });
      return;
    }
    // Auswahl des Reps: "both" (Standard) | "email".
    // E-Mail ist immer dabei — HubSpot dedupliziert Kontakte über die E-Mail.
    const mode = req.body?.mode;
    const opts = mode === "email" ? { email: true, phone: false } : { email: true, phone: true };
    const requestId = await enrichSubmit(leads, opts);
    res.status(200).json({ ok: true, requestId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "Start fehlgeschlagen." });
  }
}
