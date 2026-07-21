// POST /api/enrich-save — führt Leads + Enrichment-Ergebnisse zusammen und legt
// sie in HubSpot an. Body: { leads, data, creditsLeft }.
import { checkPassword } from "../lib/auth.js";
import { mergeEnriched } from "../lib/betterContact.js";
import { upsertContact } from "../lib/hubspot.js";

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
    const data = Array.isArray(req.body?.data) ? req.body.data : [];
    if (!leads.length) {
      res.status(400).json({ ok: false, error: "Keine Leads." });
      return;
    }

    const contacts = mergeEnriched(leads, data);
    const token = process.env.HUBSPOT_TOKEN;
    const results = await Promise.all(
      contacts.map(async (c) => {
        const name = `${c.firstName} ${c.lastName}`.trim();
        try {
          const hs = await upsertContact(
            {
              email: c.email, firstName: c.firstName, lastName: c.lastName,
              company: c.company, phone: c.phone, jobTitle: c.jobTitle, linkedinUrl: c.linkedinUrl,
            },
            { token }
          );
          return { name, company: c.company, email: c.email, emailStatus: c.emailStatus, phone: c.phone, hubspotId: hs.id, error: null };
        } catch (e) {
          return { name, company: c.company, email: c.email, emailStatus: c.emailStatus, phone: c.phone, hubspotId: null, error: e?.message || "HubSpot-Fehler" };
        }
      })
    );

    res.status(200).json({ ok: true, results, creditsLeft: req.body?.creditsLeft ?? null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "Speichern fehlgeschlagen." });
  }
}
