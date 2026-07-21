// POST /api/enrich-status — ein Status-Check des Anreicherungs-Jobs (kurz).
// Body: { requestId }. Gibt { done, data?, creditsLeft? } zurück.
import { checkPassword } from "../lib/auth.js";
import { enrichPoll } from "../lib/betterContact.js";

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
    const requestId = req.body?.requestId;
    if (!requestId) {
      res.status(400).json({ ok: false, error: "requestId fehlt." });
      return;
    }
    const r = await enrichPoll(requestId);
    res.status(200).json({ ok: true, ...r });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "Status-Abfrage fehlgeschlagen." });
  }
}
