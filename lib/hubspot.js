// Minimaler HubSpot-CRM-v3-Client — Kontakt upserten.
// Private-App-Token (Authorization: Bearer). Token kommt aus process.env.
// Upsert: bei vorhandener E-Mail per Suche finden und PATCHen, sonst anlegen.
// LinkedIn-URL → Custom-Property `linkedin_url` (siehe README); fehlt es, wird
// der Write ohne dieses Feld wiederholt, damit nichts verloren geht.

const BASE = "https://api.hubapi.com";

function authHeaders(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function readError(res) {
  let body = "";
  try {
    body = JSON.stringify(await res.json());
  } catch {
    /* ignore */
  }
  return `HubSpot ${res.status}: ${body}`;
}

function cleanProps(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== "") out[k] = v;
  }
  return out;
}

async function searchByEmail(email, token) {
  const res = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      properties: ["email"],
      limit: 1,
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json();
  return json.results?.[0] ?? null;
}

async function writeContact({ id, properties, token }) {
  const url = id ? `${BASE}/crm/v3/objects/contacts/${id}` : `${BASE}/crm/v3/objects/contacts`;
  const method = id ? "PATCH" : "POST";
  const attempt = (props) =>
    fetch(url, { method, headers: authHeaders(token), body: JSON.stringify({ properties: props }) });

  let res = await attempt(properties);
  if (!res.ok && res.status === 400 && "linkedin_url" in properties) {
    const msg = await res.clone().text();
    if (/linkedin_url/i.test(msg)) {
      const { linkedin_url, ...rest } = properties; // eslint-disable-line no-unused-vars
      res = await attempt(rest);
    }
  }
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function upsertContact(contact, { token } = {}) {
  if (!token) throw new Error("HUBSPOT_TOKEN ist serverseitig nicht gesetzt.");
  const properties = cleanProps({
    email: contact.email,
    firstname: contact.firstName,
    lastname: contact.lastName,
    company: contact.company,
    phone: contact.phone,
    jobtitle: contact.jobTitle,
    linkedin_url: contact.linkedinUrl,
  });
  let existingId = null;
  if (contact.email) {
    const found = await searchByEmail(contact.email, token);
    existingId = found?.id ?? null;
  }
  return writeContact({ id: existingId, properties, token });
}
