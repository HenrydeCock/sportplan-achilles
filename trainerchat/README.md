# Trainerchat — sportplan-achilles.nl

Chat-app waar trainers vragen stellen aan een "council" van vier deskundigen
(didactiek, spelervaring, Achilles-spelvisie, groepskenmerken). Antwoorden met
een oefening bevatten een FILMPJE-JSON die de pagina automatisch herkent en
afspeelt als **geanimeerd tactiekbord** (veld 30×20 m, fases, looplijnen, passes).

## Inhoud

- `server.js` — Node/Express-proxy naar de **OpenAI API** (key blijft op de server), met toegangscode en rate limit (20 vragen per kwartier per IP). Luistert alleen op `127.0.0.1`.
- `council-prompt.md` — de systeemprompt; pas dit bestand aan en herstart om de council bij te sturen. Het volledige beleidsplan kun je onderaan plakken.
- `public/chat.html` — de complete chatpagina (chat + tactiekbord), geen build-stap nodig. Gebruikt relatieve `api/`-paden, dus werkt onder `/trainerchat/`.
- `.env.example` — kopieer naar `.env` en vul in

## Lokaal proberen

```bash
npm install
cp .env.example .env       # vul je echte OPENAI_API_KEY in
node server.js
# open http://127.0.0.1:3100/chat.html
```

De groepsgegevens (aantal, leeftijd, niveau, samenstelling) uit het zijpaneel
gaan automatisch als "INVOER VAN DE TRAINER" mee met elke vraag.

## Op de ai-tools-VM zetten

`/home/info/sportplan-achilles` is een clone van de GitHub-repo, dus deployen =
`git pull` + de app installeren en starten.

```bash
cd /home/info/sportplan-achilles && git pull        # haalt trainerchat/ binnen
cd trainerchat && npm install
cp .env.example .env && nano .env                    # vul OPENAI_API_KEY in
which node                                           # pad voor de service
```

### Service (systemd)

```ini
# /etc/systemd/system/achilles-chat.service
[Unit]
Description=Trainerchat sportplan-achilles
After=network.target

[Service]
Type=simple
User=info
WorkingDirectory=/home/info/sportplan-achilles/trainerchat
ExecStart=__NODE__ server.js          # __NODE__ = uitvoer van `which node`
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now achilles-chat
sudo systemctl status achilles-chat --no-pager
```

De andere apps op deze VM draaien onder **PM2**; systemd hierboven werkt prima
ernaast. Wil je het consistent houden, dan kan ook:
`cd trainerchat && pm2 start server.js --name achilles-chat && pm2 save`.

### nginx

Maak eerst een back-up, voeg dan dit blok toe **ín** het bestaande 443-server-blok
van `/etc/nginx/sites-available/sportplan-achilles`:

```bash
sudo cp /etc/nginx/sites-available/sportplan-achilles{,.bak}
```

```nginx
    # ── Trainerchat (Node-app op 127.0.0.1:3100) ──
    location ^~ /trainerchat/ {
        # Zelfde sitewachtwoord als de rest (dit blok weglaten = chat zonder basic-auth):
        auth_basic "Technisch Beleidsplan - GHV Achilles";
        auth_basic_user_file /etc/nginx/.htpasswd-achilles;

        proxy_pass http://127.0.0.1:3100/;
        proxy_http_version 1.1;
        proxy_buffering off;          # essentieel voor live streamen
        proxy_read_timeout 120s;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

```bash
sudo nginx -t && sudo systemctl reload nginx   # faalt -t? dan NIET reloaden — niets stuk
```

Daarna live op `https://sportplan-achilles.nl/trainerchat/chat.html`. De `^~`
zorgt dat nginx onder `/trainerchat/` nooit losse bestanden serveert, dus `.env`
is onbereikbaar via de browser.

## Kosten en toegang

- `TOEGANGSCODE` in `.env` is de gedeelde code voor trainers. **Leeg laten = open
  voor iedereen die bij `/trainerchat/` kan — en dus op jouw API-rekening.** Houd
  hem gezet, of zet basic-auth op het nginx-blok (zie hierboven).
- De rate limit (20/kwartier/IP) en `MAX_TOKENS` begrenzen het verbruik verder.
- Model wisselen kan via `OPENAI_MODEL` in `.env`; zet daar het sterkste model dat
  je account heeft. Actuele modellen: https://platform.openai.com/docs/models
- Krijg je een foutmelding over `max_completion_tokens`, dan accepteert dat model
  alleen `max_tokens` — wissel die naam in `server.js`.

## Aanpassing aan de prompt

Bij het FILMPJE staat expliciet "Lever de JSON in een ```json codeblok", zodat de
pagina het tactiekbord betrouwbaar herkent. De sectie "INVOER VAN DE TRAINER —
vul in" is uit de prompt gehaald omdat de app die gegevens zelf meestuurt vanuit
het zijpaneel.
