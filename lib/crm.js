// CRM-Dispatcher — wählt HubSpot oder Twenty über CRM_PROVIDER (Standard:
// "hubspot"). api/find.js und api/enrich-save.js rufen nur die beiden
// Funktionen hier auf und müssen nicht wissen, welches CRM dahintersteckt.
import { upsertContact as hubspotUpsert, findExistingLinkedinUrls as hubspotFind } from "./hubspot.js";
import { upsertContact as twentyUpsert, findExistingLinkedinUrls as twentyFind } from "./twenty.js";

export function crmProvider() {
  return (process.env.CRM_PROVIDER || "hubspot").trim().toLowerCase();
}

/** Legt einen Kontakt an/aktualisiert ihn. Gibt immer { id } zurück. */
export async function upsertContact(contact) {
  return crmProvider() === "twenty"
    ? twentyUpsert(contact)
    : hubspotUpsert(contact, { token: process.env.HUBSPOT_TOKEN });
}

/** Prüft, welche der übergebenen LinkedIn-URLs schon als Kontakt existieren. */
export async function findExistingLinkedinUrls(urls) {
  return crmProvider() === "twenty"
    ? twentyFind(urls)
    : hubspotFind(urls, process.env.HUBSPOT_TOKEN);
}
