// Twenty CRM REST-Client — Alternative zu lib/hubspot.js, ausgewählt über
// CRM_PROVIDER=twenty (siehe lib/crm.js). Funktioniert mit Twenty Cloud und
// selbst gehosteten Instanzen.
//
// Twentys REST-API wird pro Workspace dynamisch generiert — es gibt keine
// statische öffentliche Doku. Dieser Client ist deshalb gegen den Twenty-
// Quellcode verifiziert (twentyhq/twenty, github.com):
//   - person.workspace-entity.ts / company.workspace-entity.ts (Feldnamen)
//   - composite-types/{full-name,emails,phones,links}.composite-type.ts
//     (Struktur der verschachtelten Unterfelder)
//   - engine/api/rest/input-request-parsers/filter-parser-utils (Filter-DSL:
//     `feld[operator]:"wert"`, kombinierbar mit or(...)/and(...)/not(...);
//     ein einzelnes Prädikat braucht KEINE Klammer)
//   - engine/api/rest/input-request-parsers/upsert-parser-utils +
//     rest-api-create-one.handler.ts (POST .../?upsert=true matcht auf das
//     unique-constrained Unterfeld, z. B. emails.primaryEmail; Antwort-Hülle
//     { data: { create<Objekt>: {...} } })
//   - rest-api-find-many.handler.ts (Antwort-Hülle bei Listen:
//     { data: { <objektPlural>: [...] }, totalCount, pageInfo })
//
// Vorteil gegenüber HubSpot: linkedinLink ist ein eingebautes Feld — anders
// als bei HubSpot ist kein manuell anzulegendes Custom-Property nötig.
//
// Telefon-Ländervorwahl (primaryPhoneCountryCode/-CallingCode) wird bewusst
// leer gelassen: BetterContact liefert bereits internationale Nummern
// (z. B. "+491701234567") als einzelnen String, ohne Länder-Code-Zerlegung —
// das Zerlegen bräuchte eine Telefonnummern-Bibliothek. Die Nummer selbst
// wird trotzdem vollständig gespeichert, nur ohne Twentys Format-Aufbereitung.

function baseUrl() {
  const apiUrl = process.env.TWENTY_API_URL;
  if (!apiUrl) throw new Error("TWENTY_API_URL ist serverseitig nicht gesetzt.");
  return apiUrl.replace(/\/$/, "") + "/rest";
}

function authHeaders() {
  const apiKey = process.env.TWENTY_API_KEY;
  if (!apiKey) throw new Error("TWENTY_API_KEY ist serverseitig nicht gesetzt.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
}

async function readError(res) {
  let body = "";
  try {
    body = JSON.stringify(await res.json());
  } catch {
    /* ignore */
  }
  return `Twenty ${res.status}: ${body}`;
}

// Wert für die Filter-DSL in Anführungszeichen setzen (erlaubt Sonderzeichen
// wie ":" und "/" in URLs); ein " im Wert selbst wird entfernt statt escaped
// — kommt in LinkedIn-URLs/Namen praktisch nie vor.
function filterValue(v) {
  return `"${String(v).replace(/"/g, "")}"`;
}

// Mehrere Prädikate: bei genau einem reicht das nackte Prädikat (so auch in
// Twentys eigenem Beispiel belegt: `emails.primaryEmail[eq]:foo99@example.com`
// ohne or(...)); bei mehreren müssen sie mit or(...) verbunden werden.
function orFilter(predicates) {
  return predicates.length > 1 ? `or(${predicates.join(",")})` : predicates[0];
}

// ── Company: per Domain upserten oder per Name suchen/anlegen → companyId ──
async function resolveCompanyId(company, companyDomain) {
  const headers = authHeaders();
  if (companyDomain) {
    const url = /^https?:\/\//i.test(companyDomain) ? companyDomain : `https://${companyDomain}`;
    const res = await fetch(`${baseUrl()}/companies?upsert=true`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: company || companyDomain,
        domainName: { primaryLinkLabel: company || companyDomain, primaryLinkUrl: url, secondaryLinks: null },
      }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const json = await res.json();
    return json?.data?.createCompany?.id ?? null;
  }
  if (!company) return null;
  // Keine Domain vorhanden — kein unique-constrained Feld zum Upserten.
  // Erst per Name suchen, um Dubletten zu vermeiden, sonst neu anlegen.
  const found = await fetch(
    `${baseUrl()}/companies?filter=${encodeURIComponent(`name[eq]:${filterValue(company)}`)}&limit=1`,
    { headers }
  );
  if (found.ok) {
    const j = await found.json();
    const existing = j?.data?.companies?.[0];
    if (existing?.id) return existing.id;
  }
  const res = await fetch(`${baseUrl()}/companies`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: company }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json();
  return json?.data?.createCompany?.id ?? null;
}

/**
 * Legt eine Person an oder aktualisiert sie (Upsert über emails.primaryEmail).
 * Gibt { id } zurück — dieselbe Form wie lib/hubspot.js#upsertContact.
 */
export async function upsertContact(contact) {
  let companyId = null;
  if (contact.company || contact.companyDomain) {
    try {
      companyId = await resolveCompanyId(contact.company, contact.companyDomain);
    } catch {
      /* Firmen-Verknüpfung ist best effort — die Person soll trotzdem angelegt werden */
    }
  }

  const body = {
    name: { firstName: contact.firstName || "", lastName: contact.lastName || "" },
    jobTitle: contact.jobTitle || null,
  };
  if (contact.email) body.emails = { primaryEmail: contact.email, additionalEmails: null };
  if (contact.phone) {
    body.phones = {
      primaryPhoneNumber: contact.phone,
      primaryPhoneCountryCode: "",
      primaryPhoneCallingCode: "",
      additionalPhones: null,
    };
  }
  if (contact.linkedinUrl) {
    body.linkedinLink = { primaryLinkLabel: "LinkedIn", primaryLinkUrl: contact.linkedinUrl, secondaryLinks: null };
  }
  if (companyId) body.companyId = companyId;

  const res = await fetch(`${baseUrl()}/people?upsert=true`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json();
  const person = json?.data?.createPerson;
  if (!person?.id) throw new Error(`Twenty: unerwartete Antwort beim Anlegen: ${JSON.stringify(json)}`);
  return { id: person.id };
}

/**
 * Prüft in einem Aufruf, welche der übergebenen LinkedIn-URLs schon als
 * Person in Twenty existieren. Best effort: Fehler liefern eine leere Menge,
 * statt die Suche zu blockieren (Config fehlt, Netzwerkfehler etc.).
 */
export async function findExistingLinkedinUrls(urls) {
  const clean = [...new Set((urls || []).filter(Boolean))];
  if (!clean.length) return new Set();
  try {
    const predicates = clean.map((u) => `linkedinLink.primaryLinkUrl[eq]:${filterValue(u)}`);
    const filter = orFilter(predicates);
    const res = await fetch(`${baseUrl()}/people?filter=${encodeURIComponent(filter)}&limit=200`, {
      headers: authHeaders(),
    });
    if (!res.ok) return new Set();
    const json = await res.json();
    const found = new Set();
    for (const p of json?.data?.people || []) {
      const link = p?.linkedinLink?.primaryLinkUrl;
      if (link) found.add(String(link).toLowerCase());
    }
    return found;
  } catch {
    return new Set();
  }
}
