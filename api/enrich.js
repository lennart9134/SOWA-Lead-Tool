// POST /api/enrich — reichert die AUSGEWÄHLTEN Leads an (E-Mail + Telefon,
// kostenpflichtig) und schreibt sie in HubSpot. Body: { leads: [...] }.
import { checkPassword } from "../lib/auth.js";
import { enrichContacts } from "../lib/betterContact.js";
import { upsertContact } from "../lib/hubspot.js";

const MAX_SELECT = 20; // pro Durchgang — begrenzt Kosten und Laufzeit

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  if (!checkPassword(req)) {
    res.status(401).json({ ok: false, error: "Falsches oder fehlendes Passwort." });
    return;
  }
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const leads = Array.isArray(body.leads) ? body.leads : [];
    if (!leads.length) {
      res.status(400).json({ ok: false, error: "Keine Leads ausgewählt." });
      return;
    }
    if (leads.length > MAX_SELECT) {
      res.status(400).json({ ok: false, error: `Bitte höchstens ${MAX_SELECT} Leads pro Durchgang.` });
      return;
    }

    // 1) Anreichern (ein Batch, ≤ MAX_SELECT)
    const { contacts, creditsLeft } = await enrichContacts(leads);

    // 2) In HubSpot upserten (parallel — kleine Menge)
    const token = process.env.HUBSPOT_TOKEN;
    const results = await Promise.all(
      contacts.map(async (c) => {
        const name = `${c.firstName} ${c.lastName}`.trim();
        try {
          const hs = await upsertContact(
            {
              email: c.email,
              firstName: c.firstName,
              lastName: c.lastName,
              company: c.company,
              phone: c.phone,
              jobTitle: c.jobTitle,
              linkedinUrl: c.linkedinUrl,
            },
            { token }
          );
          return { name, company: c.company, email: c.email, emailStatus: c.emailStatus, phone: c.phone, hubspotId: hs.id, error: null };
        } catch (e) {
          return { name, company: c.company, email: c.email, emailStatus: c.emailStatus, phone: c.phone, hubspotId: null, error: e?.message || "HubSpot-Fehler" };
        }
      })
    );

    res.status(200).json({ ok: true, results, creditsLeft });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "Anreicherung fehlgeschlagen." });
  }
}
