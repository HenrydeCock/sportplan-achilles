# Trainerchat — projectstatus & handoff

> Doel van dit document: in één keer alle context voor een **nieuwe chat / nieuwe sessie**.
> Lees hiernaast ook `trainerchat/council-prompt.md`, `trainerchat/server.js` en `trainerchat/README.md`.

## Wat het is
Een chat-app waarin handbaltrainers van GHV Achilles met hun **"supportteam"** (vier
interne adviseurs, één woordvoerder) overleggen, **echte oefeningen** uit bibliotheken
krijgen, en handbaloefeningen op een **geanimeerd tactiekbord** kunnen laten genereren.

🔗 Live: `https://sportplan-achilles.nl/trainerchat/chat.html` (achter het sitewachtwoord / nginx basic-auth)
🖥️ VM: **ai-tools** (Debian), map `/home/info/sportplan-achilles` = clone van deze repo
🧠 Model: **gpt-5.2** (instelbaar via `OPENAI_MODEL` in `.env`; `MAX_TOKENS=16000`)
🔓 GitHub-repo is **PUBLIEK** → geen geheimen of betaalde content in git.

## Architectuur
- **`server.js`** — Node/Express-proxy naar de OpenAI API (chat/completions, streaming).
  Bouwt de systeemprompt op uit: `council-prompt.md` + `beleidsplan.txt` +
  `YSP_BLOK` + `ASM_BLOK`, en plakt per request de groepsgegevens eraan. Luistert op `127.0.0.1:3100`.
- **`council-prompt.md`** — het supportteam. Bevat: werkwijze (één woordvoerder, gesprek
  eerst, zoeken/maken pas op verzoek), spelvisie (samengevat), **spelregels per leeftijd
  F/E/D**, NHV-didactiek & **veiligheid/ethiek**, de **oefeningen-flow** (top ~5 per bron →
  trainer kiest → daarna pas zelf genereren), en het tactiekbord-OUTPUT-FORMAT (FILMPJE-JSON).
- **`public/chat.html`** — chatpagina + tactiekbord (canvas, 30×20 m veld, kegels, looplijnen).
  Tijdens streamen een placeholder i.p.v. ruwe JSON; bord verschijnt aan het eind.
- **`beleidsplan.txt`** (committed) — volledige beleidsplan-tekst, geëxtraheerd uit `index.html`.

## Bronnen / datab. Schema = uitwisselbaar
Alle oefeningen-indexen zijn JSON-arrays met per item o.a.: `title`, `url`, leeftijd
(`age_band`/`levels`), tags/technieken, `trainer_labels`, `query_terms`, `why_match`.
`server.js` bouwt per bron een compacte tekstregel (`title | url | tags | niveau | labels`)
en plakt die als blok aan de systeemprompt. Nieuwe bronnen moeten **hetzelfde patroon** volgen.

- `bronnen/asm-oefeningen.json` — 162 ASM-bewegingsoefeningen: 50 gecureerd+rijk (bewaard in `asm_poc_50_oefeningen.json`) + 112 uit de ASM-gallery-export (`asm_gallery_poc_500_metadata.json`), gefilterd op handball_relevance≥middel + tags, ontdubbeld. **gitignored, server-side.** Herbouwen: `node scripts/build-asm-extra.mjs`. ⚠️ De 112 zijn kaart-niveau-metadata (geen `age_band`/`why_match`); voor échte schaal (1000en) is een retrieval-voorfilter nodig i.p.v. alles in de prompt plakken.
- `bronnen/yoursportplanner-handbal.json` — 50 handbaloefeningen. **gitignored, server-side.**
- `bronnen/nhv-trainingen.json` — ~410 complete NHV-jeugdtrainingen (F/E/D), geïndexeerd uit de PDF's. **gitignored, server-side.** De PDF's zelf staan in `trainerchat/trainingen/` op de VM en worden via nginx gehost (zie Deployen), zodat elke training een echte `url` heeft.
- `bronnen/*.pdf` + `Spelregels-*.docx` — NHV-samenvattingen + spelregels; **gedistilleerd in de prompt** (de bestanden zelf hoeven niet naar de VM).
- **Indexeer-script:** `scripts/index-nhv.mjs` (Node, geen npm-deps). Per training-PDF: `pdftotext` → OpenAI (`gpt-5.2`) normaliseert naar hetzelfde schema → `bronnen/nhv-trainingen.json`. Resumebaar, parallel (`NHV_CONCURRENCY`, default 6). Gebruik: `NHV_INDEX_MODEL=gpt-5.2 node scripts/index-nhv.mjs trainingen --out bronnen/nhv-trainingen.json`.

## Beveiliging
- `.env` (OpenAI-sleutel) en **alle bronnen-data** staan in `.gitignore` → nooit in de publieke git.
- App op `127.0.0.1`; nginx ervoor met **basic-auth** (`/etc/nginx/.htpasswd-achilles`) + TLS (Certbot).
- nginx-blok: `location ^~ /trainerchat/ { proxy_pass http://127.0.0.1:3100/; proxy_buffering off; ... }`.

## Deployen
- **Code** (`server.js`, `council-prompt.md`, `chat.html`, `beleidsplan.txt`): via git.
  Op de VM: `cd /home/info/sportplan-achilles && git pull` daarna:
  - prompt/`server.js`/`.env` veranderd → `sudo systemctl restart achilles-chat`
  - alleen `chat.html` → geen restart, browser **hard refresh** (Ctrl+Shift+R)
- **Data** (de gitignored json's in `bronnen/`): handmatig naar de VM, want gitignored:
  `scp "<lokaal pad>" info@ai-tools:/home/info/sportplan-achilles/trainerchat/bronnen/`
- **NHV-trainings-PDF's** (gehost, ~410 stuks): staan in `trainerchat/trainingen/` op de VM (plat, namen genormaliseerd naar koppeltekens). nginx serveert ze statisch achter dezelfde basic-auth via een **`location ^~ /trainerchat/trainingen/`-blok** (alias naar die map) in `/etc/nginx/sites-available/sportplan-achilles` — staat vóór het `^~ /trainerchat/`-proxyblok zodat de langere prefix wint. Backup: `…-achilles.bak.nhv`. Na config-wijziging: `sudo nginx -t && sudo systemctl reload nginx`. URL-vorm: `https://sportplan-achilles.nl/trainerchat/trainingen/<bestandsnaam>.pdf`.
- Logs: `sudo journalctl -u achilles-chat -n 20 --no-pager` → zoek "… geladen".

## Wat werkt (live & geverifieerd)
- Gesprek als **één woordvoerder** (geen losse "stemmen"/kopjes).
- **Retrieval-first**: bij een oefeningvraag top ~5 uit **ASM** + top ~5 uit **YourSportPlanner**, met links + waarom; trainer kiest; **daarna pas** zelf een oefening met tactiekbord.
- Tactiekbord-generatie (spelers, kegels, looplijnen, animatie).
- Grounding: volledig beleidsplan, NHV-didactiek, veiligheid/ethiek (vertrouwenscontactpersoon), spelregels F/E/D in de prompt.

## ➡️ VOLGENDE KLUS: NHV-trainingen als 3e bron (uitwisselbaar met ASM/YSP)
Besluit van de gebruiker: **A = PDF's hosten** (zodat trainers ze kunnen openen) én
**B = een index met DEZELFDE zoekstructuur als de andere twee** (uitwisselbaar).

- Bron: `bronnen/OneDrive_2026-06-11.zip` (~159 MB, honderden complete trainings-PDF's,
  geordend `Oefenstof Jeugd/<leeftijd>/Jaar X/Periode Y/<...>-training-N.pdf`, met een geneste zip erin).
- Te bouwen:
  1. Zip → VM, **uitpakken**, en de PDF's **hosten** achter dezelfde basic-auth (bv. onder `/trainerchat/trainingen/...`) zodat elke training een **url** krijgt.
  2. **Extractie-/indexeer-script** (Node op de VM, gebruikt de OpenAI-sleutel): per training de tekst uit de PDF halen en een **genormaliseerd record** maken — `title`, `url` (gehoste PDF), `levels`/leeftijd, `techniques`, `trainer_labels`, `query_terms`, `why_match` — exact het schema van ASM/YSP. → `bronnen/nhv-trainingen.json`.
  3. `server.js`: laad `nhv-trainingen.json` als **NHV_BLOK** (zelfde patroon als ASM/YSP) en voeg toe aan `system`.
  4. `council-prompt.md`: in de oefeningen-sectie "NHV-TRAININGEN" activeren als 3e bron (top ~5).
- Open punten: exacte schaal (aantal PDF's tellen via `unzip -l`), hostingpad kiezen, kosten van de extractie (gebruik een goedkoop model per PDF).

## Stijl-/werkafspraken
- Eén woordvoerder; geen stem-voor-stem opsomming.
- Uitsluitend handbal; verzin geen links — alleen echte URL's uit de bibliotheken.
- Kinderveiligheid voorop; bij gedrags-/veiligheidszorg wijzen op vertrouwenscontactpersoon/bestuur.
- Secrets en betaalde data: nooit in de publieke git.
