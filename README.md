# SOWA Lead-Tool (Web-App für Reps)

Ein-Klick-Leadgewinnung im Browser: Rep wählt eine Zielgruppe, klickt **Finden**
(kostenlos), hakt die gewünschten Leads an, wählt **E-Mail + Telefon** oder
**Nur E-Mail**, und klickt **Anreichern + ins CRM** — die Kontakte werden
angereichert und direkt im CRM angelegt. Kein Terminal, kein API-Key, keine CSV.

Funktioniert wahlweise mit **HubSpot** oder **Twenty CRM** — umschaltbar über
eine einzige Umgebungsvariable, siehe [CRM-Auswahl](#crm-auswahl-hubspot-oder-twenty).

```
Browser (Rep)
  │  Zielgruppe wählen → "Finden"                → /api/find          (BetterContact Lead Finder, gratis;
  │                                                                     bereits im CRM vorhandene Kontakte
  │                                                                     werden automatisch übersprungen)
  │  Leads anhaken + Modus wählen
  │  → "Anreichern + ins CRM"                    → /api/enrich-start   (Job starten, kurz)
  │                                               → /api/enrich-status (Browser pollt, bis fertig)
  │                                               → /api/enrich-save   (CRM-Upsert: HubSpot oder Twenty)
  ▼
Kontakte mit E-Mail (+ Telefon) im CRM
```

## Aufbau

```
index.html            # Rep-Oberfläche (statisch, ohne Abhängigkeiten)
api/find.js            # POST: Preset → Lead Finder → Lead-Liste (offset-paginiert, CRM-Dedup)
api/enrich-start.js     # POST: ausgewählte Leads + Modus → BetterContact-Job starten
api/enrich-status.js    # POST: Job-Status pollen (kein Server-Timeout, egal wie lange BetterContact braucht)
api/enrich-save.js      # POST: Ergebnis + Leads zusammenführen → CRM-Upsert
lib/betterContact.js   # Lead Finder + Enrichment (verifizierter BetterContact-Vertrag)
lib/crm.js              # Dispatcher: wählt lib/hubspot.js oder lib/twenty.js über CRM_PROVIDER
lib/hubspot.js          # HubSpot-Adapter (Contacts v3, Custom-Property linkedin_url)
lib/twenty.js           # Twenty-Adapter (REST-API, eingebautes linkedinLink-Feld)
lib/auth.js             # geteiltes Passwort
lib/presets.js          # ICP-Presets (im Dropdown)
vercel.json             # Function-Timeout 60s
```

## Deployment (einmalig, ~10 Min)

1. Ordner als **Vercel-Projekt** deployen (Vercel-CLI `vercel` oder Git-Import).
   Es ist zero-config: statische `index.html` + Serverless-Functions in `api/`.
2. In den **Vercel-Projekt-Settings → Environment Variables** die Werte aus
   [.env.example](.env.example) setzen — mindestens:
   - `BETTERCONTACT_API_KEY` — treibt Suche **und** Anreicherung
   - `APP_PASSWORD` — das Passwort, das die Reps eingeben (frei wählbar)
   - `CRM_PROVIDER` — `hubspot` (Standard) oder `twenty`
   - je nach `CRM_PROVIDER` zusätzlich `HUBSPOT_TOKEN` **oder** `TWENTY_API_URL` + `TWENTY_API_KEY`
     (siehe [CRM-Auswahl](#crm-auswahl-hubspot-oder-twenty))
3. Redeploy. Die URL an die Reps geben, das Passwort separat.

**Sicherheit:** Alle Secrets liegen serverseitig in Vercel — sie erreichen den
Browser der Reps nie. Reps sehen nur die URL und das gemeinsame Passwort.

## CRM-Auswahl: HubSpot oder Twenty

Eine Umgebungsvariable entscheidet, welches CRM `lib/crm.js` anspricht — der
Rest der App (`index.html`, `api/find.js`, `api/enrich-*.js`) merkt davon
nichts, weil beide Adapter dieselbe Form zurückgeben (`{ id }` bzw. eine Menge
gefundener LinkedIn-URLs).

### Option A — HubSpot (`CRM_PROVIDER=hubspot`, Standard)

1. HubSpot → Einstellungen → Integrationen → **Private Apps** → App erstellen.
2. Scopes: `crm.objects.contacts.read` + `crm.objects.contacts.write`.
3. Token kopieren → `HUBSPOT_TOKEN`.
4. Einmalig ein Custom-Contact-Property `linkedin_url` (einzeiliger Text)
   anlegen, damit die LinkedIn-URL mitgeschrieben wird. Fehlt es, läuft alles
   andere trotzdem — nur dieses eine Feld bleibt leer.

### Option B — Twenty CRM (`CRM_PROVIDER=twenty`)

1. `TWENTY_API_URL` setzen — **ohne** `/rest`:
   - Twenty Cloud: `https://api.twenty.com`
   - Selbst gehostet: `https://deine-domain.tld`
2. In Twenty: **Einstellungen → API & Webhooks → „+ Create key"** → Key sofort
   kopieren (wird nur einmal angezeigt) → `TWENTY_API_KEY`.
3. **Kein Custom-Field nötig** — Twenty hat ein eingebautes LinkedIn-Feld
   (`linkedinLink`), anders als bei HubSpot.
4. Firmen werden als eigenes, verknüpftes Objekt angelegt (nicht als Text-
   Property wie bei HubSpot): mit Firmen-Domain wird die Firma per Domain
   dedupliziert (native Twenty-Eindeutigkeit), ohne Domain wird zuerst per
   Name gesucht und sonst neu angelegt.
5. Bekannte Einschränkung: BetterContact liefert Telefonnummern als fertigen
   internationalen String (z. B. `+491701234567`) ohne Länder-Code getrennt.
   Twenty hat dafür eigene Felder (`primaryPhoneCountryCode`/
   `-CallingCode`), die bleiben leer — die Nummer selbst wird trotzdem
   vollständig gespeichert, nur ohne Twentys Format-Aufbereitung (Flagge/
   hübsche Darstellung).

**Vertrag verifiziert gegen den Twenty-Quellcode** (`lib/twenty.js`
dokumentiert die genauen Dateien), da Twenty keine statische öffentliche
API-Referenz führt — die Doku wird pro Workspace dynamisch erzeugt. Ein Live-
Test gegen eine echte Twenty-Instanz stand beim Bau nicht zur Verfügung; beim
ersten echten Lauf einmal einen angelegten Kontakt in Twenty gegenprüfen.

## Für die Reps (so einfach ist es)

1. URL öffnen → Passwort eingeben (bleibt im Browser gespeichert).
2. Zielgruppe wählen, **Finden** klicken.
3. Leads anhaken (oder „Alle"), Anreicherungs-Modus wählen (**E-Mail + Telefon**
   oder **Nur E-Mail**), **Anreichern + ins CRM** klicken.
4. Fertig — die Kontakte sind im CRM.

Bereits im CRM vorhandene Kontakte (per LinkedIn-URL) werden bei der Suche
automatisch übersprungen; jeder erneute Klick auf „Finden" zeigt neue statt
derselben Leads. „Von vorne suchen" setzt das für die aktuelle Zielgruppe
zurück.

## Kosten & Grenzen

- **Suchen ist kostenlos.** Credits fallen nur beim Anreichern an (pay-per-valid,
  nur gültige Treffer). Reps sehen nach jedem Lauf das Restguthaben.
- **„Nur E-Mail"** ist schneller und günstiger als „E-Mail + Telefon" (kein
  langsamer Telefon-Waterfall). E-Mail ist immer dabei, weil beide CRMs
  darüber deduplizieren.
- **Max. 20 Leads pro Anreicherungs-Durchgang** (Kostengrenze). Die
  Anreicherung selbst läuft über Client-Polling ohne Server-Timeout-Risiko,
  unabhängig davon, wie lange BetterContact braucht.

## Compliance

Das Tool **findet und reichert an** — es **kontaktiert niemanden**. Der
Kontaktkanal folgt der grün/rot-Richtlinie: On-Platform/warm ok, DE-Kaltmail/
-anruf UWG-heikel. Lead-Finding ist keine Kontakt-Erlaubnis; mit dem CRM-Import
werdet ihr Verantwortlicher (Art.-14-Informationspflicht, Rechtsgrundlage).

## Verifikation Telefon-Feld (BetterContact)

Der echte Telefon-Feldname in der BetterContact-Antwort ist im publizierten
Schema nicht belegt; `lib/betterContact.js` probt defensiv nur nummern-artige
Werte. Beim ersten echten Lauf ein Ergebnis prüfen und den Feldnamen bei Bedarf
in `pickEnriched()` fixieren.
