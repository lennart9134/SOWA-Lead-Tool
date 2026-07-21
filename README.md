# SOWA Lead-Tool (Web-App für Reps)

Ein-Klick-Leadgewinnung im Browser: Rep wählt eine Zielgruppe, klickt **Finden**
(kostenlos), hakt die gewünschten Leads an und klickt **Anreichern + zu HubSpot**
— E-Mail + Telefon werden angereichert und die Kontakte direkt in HubSpot angelegt.
Kein Terminal, kein API-Key, keine CSV.

```
Browser (Rep)
  │  Zielgruppe wählen → "Finden"              → /api/find   (BetterContact Lead Finder, gratis)
  │  Leads anhaken → "Anreichern + zu HubSpot" → /api/enrich (BetterContact + HubSpot-Upsert)
  ▼
Kontakte mit E-Mail + Telefon in HubSpot
```

## Aufbau

```
index.html        # Rep-Oberfläche (statisch, ohne Abhängigkeiten)
api/find.js       # POST: Preset → Lead Finder → Lead-Liste
api/enrich.js     # POST: ausgewählte Leads → Anreicherung → HubSpot-Upsert
lib/betterContact.js  # Lead Finder + Enrichment (verifizierter Vertrag)
lib/hubspot.js        # Kontakt-Upsert (v3)
lib/auth.js           # geteiltes Passwort
lib/presets.js        # ICP-Presets (im Dropdown)
vercel.json           # Function-Timeout 60s
```

## Deployment (einmalig, ~10 Min)

1. Ordner als **Vercel-Projekt** deployen (Vercel-CLI `vercel` oder Git-Import).
   Es ist zero-config: statische `index.html` + Serverless-Functions in `api/`.
2. In den **Vercel-Projekt-Settings → Environment Variables** die drei Werte aus
   [.env.example](.env.example) setzen:
   - `BETTERCONTACT_API_KEY` — treibt Suche **und** Anreicherung
   - `HUBSPOT_TOKEN` — HubSpot Private-App-Token (Scopes `crm.objects.contacts.read` + `write`)
   - `APP_PASSWORD` — das Passwort, das die Reps eingeben (frei wählbar)
3. Redeploy. Die URL an die Reps geben, das Passwort separat.
4. HubSpot: einmalig ein Custom-Contact-Property `linkedin_url` (einzeiliger Text)
   anlegen, damit die LinkedIn-URL mitgeschrieben wird (ohne läuft alles außer
   diesem Feld weiter).

**Sicherheit:** Alle drei Secrets liegen serverseitig in Vercel — sie erreichen
den Browser der Reps nie. Reps sehen nur die URL und das gemeinsame Passwort.

## Für die Reps (so einfach ist es)

1. URL öffnen → Passwort eingeben (bleibt im Browser gespeichert).
2. Zielgruppe wählen, **Finden** klicken.
3. Leads anhaken (oder „Alle"), **Anreichern + zu HubSpot** klicken.
4. Fertig — die Kontakte sind mit E-Mail + Telefon in HubSpot.

## Kosten & Grenzen

- **Suchen ist kostenlos.** Credits fallen nur beim Anreichern an (pay-per-valid,
  nur gültige Treffer). Reps sehen nach jedem Lauf das Restguthaben.
- **Max. 20 Leads pro Anreicherungs-Durchgang** (begrenzt Kosten und hält die
  Funktion unter dem 60-Sekunden-Timeout). Für größere Läufe die Auswahl in
  mehreren Durchgängen anreichern oder in Vercel **Pro** die `maxDuration` in
  `vercel.json` auf bis zu 300 erhöhen und das Limit in `api/enrich.js`
  (`MAX_SELECT`) anpassen.

## Compliance

Das Tool **findet und reichert an** — es **kontaktiert niemanden**. Der
Kontaktkanal folgt der grün/rot-Richtlinie: On-Platform/warm ok, DE-Kaltmail/
-anruf UWG-heikel. Lead-Finding ist keine Kontakt-Erlaubnis; mit dem HubSpot-
Import werdet ihr Verantwortlicher (Art.-14-Informationspflicht, Rechtsgrundlage).

## Verifikation Telefon-Feld

Der echte Telefon-Feldname in der BetterContact-Antwort ist im publizierten
Schema nicht belegt; `lib/betterContact.js` probt defensiv nur nummern-artige
Werte. Beim ersten echten Lauf ein Ergebnis prüfen und den Feldnamen bei Bedarf
in `pickEnriched()` fixieren.
