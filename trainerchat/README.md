# Trainerchat — sportplan-achilles.nl

Een chat-app waar trainers vragen stellen aan een **"council"** van vier deskundigen
(didactiek, spelervaring, Achilles-spelvisie, groepskenmerken). Antwoorden met een
oefening bevatten een FILMPJE-JSON die de pagina automatisch herkent en afspeelt als
**geanimeerd tactiekbord** (veld 30×20 m, spelers, kegels, looplijnen, passes).

🔗 **Live:** https://sportplan-achilles.nl/trainerchat/chat.html (achter het sitewachtwoord)
🖥️ **Draait op:** de VM `ai-tools`, map `/home/info/sportplan-achilles` (= clone van deze repo)

---

## ⚡ Een update live zetten — de normale gang van zaken

Nieuwe code staat in GitHub. Live zetten op de VM:

```bash
cd /home/info/sportplan-achilles
git pull
```

Daarna hangt het ervan af wát er veranderde:

| Wat veranderde | Wat je doet |
|---|---|
| `council-prompt.md` of `server.js` | **Service herstarten:** `sudo systemctl restart achilles-chat` |
| `.env` (sleutel / model / instellingen) | **Service herstarten** |
| `public/chat.html` (de pagina + het bord) | **Geen herstart** — alleen in de browser **hard refreshen** |

> 🤔 **Twijfel je?** Een herstart kan altijd en is veilig: `sudo systemctl restart achilles-chat`.
> Doe daarna in de browser **altijd** een hard refresh (`Ctrl+Shift+R`), zodat je de nieuwste
> pagina ziet en niet een oude uit de cache.

**Draait hij goed?**
```bash
sudo systemctl status achilles-chat --no-pager        # actief?
sudo journalctl -u achilles-chat -n 30 --no-pager     # logs — kijk hier bij problemen
```

---

## 🎛️ Veelvoorkomende aanpassingen

### Het model wisselen (zwaarder of lichter)
1. Bekijk welke modellen je account heeft (toont alleen namen, **niet** de sleutel):
   ```bash
   cd /home/info/sportplan-achilles/trainerchat
   KEY=$(grep -E '^OPENAI_API_KEY=' .env | cut -d= -f2- | tr -d '"')
   curl -s https://api.openai.com/v1/models -H "Authorization: Bearer $KEY" | tr ',' '\n' | grep '"id"' | sort -u
   ```
2. Zet in `.env`: `OPENAI_MODEL=<gekozen model>` (bij een zwaar model `MAX_TOKENS=16000`).
3. `sudo systemctl restart achilles-chat`

> Vermijd `-pro`-modellen en de `o`-reeks als eerste keus: die lopen vaak via een andere
> API en kunnen de streaming breken. Kies een vlaggenschip-chatmodel.

### De council bijsturen (toon, regels, accenten)
Bewerk `council-prompt.md` en herstart de service. Het volledige beleidsplan kun je
onderaan dat bestand plakken voor maximale trouw aan de visie.

> 💡 Kleine, eenmalige wensen ("competitiever", "minder kegels") hoef je niet in de prompt
> te zetten — zeg ze gewoon in de chat. Het model onthoudt het lopende gesprek en stuurt bij.

---

## 🔐 Veiligheid (belangrijk)

- De **echte API-sleutel** staat alleen in `trainerchat/.env` op de VM. Dat bestand staat in
  `.gitignore` en komt **nooit** in GitHub. `.env.example` is alleen een sjabloon (placeholder).
- De chat zit achter de **site-basic-auth** (zelfde wachtwoord als het beleidsplan); de
  Node-app luistert alleen op `127.0.0.1` — dus enkel via nginx bereikbaar.
- Pas je de **nginx-config** aan? Altijd eerst testen, dan pas herladen:
  ```bash
  sudo nginx -t && sudo systemctl reload nginx
  ```
  Faalt de test, dan reload je **niet** en blijven alle sites gewoon draaien.

---

## 🧱 Hoe het in elkaar zit

- `server.js` — Node/Express-proxy naar de OpenAI API (sleutel blijft op de server), met
  rate limit en streaming. Luistert op `127.0.0.1:3100`.
- `council-prompt.md` — de systeemprompt (de "council"). Wordt bij het **opstarten** ingelezen
  → daarom is een herstart nodig na een wijziging.
- `public/chat.html` — de complete chatpagina + tactiekbord (één bestand, geen build-stap).
- `.env` — sleutel + instellingen (niet in git). `.env.example` is de sjabloon.
- **nginx** proxyt `/trainerchat/` → `127.0.0.1:3100`. **systemd**-service `achilles-chat`
  houdt de app draaiend en herstart hem na een reboot.

Lokaal proberen kan ook:
```bash
npm install
cp .env.example .env       # vul je OPENAI_API_KEY in
node server.js             # open http://127.0.0.1:3100/chat.html
```

---

## 🆕 Eerste keer opzetten (eenmalig — al gedaan)

<details>
<summary>Klik open voor de installatiestappen</summary>

```bash
cd /home/info/sportplan-achilles && git pull
cd trainerchat && npm install
cp .env.example .env && nano .env        # vul OPENAI_API_KEY in
which node                               # pad voor de service
```

**systemd-service** — `/etc/systemd/system/achilles-chat.service`:
```ini
[Unit]
Description=Trainerchat sportplan-achilles
After=network.target

[Service]
Type=simple
User=info
WorkingDirectory=/home/info/sportplan-achilles/trainerchat
ExecStart=__NODE__ server.js          # __NODE__ = uitvoer van `which node` (bijv. /usr/bin/node)
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now achilles-chat
```

**nginx** — back-up maken, dan dit blok toevoegen ín het 443-server-blok van
`/etc/nginx/sites-available/sportplan-achilles`:
```bash
sudo cp /etc/nginx/sites-available/sportplan-achilles{,.bak}
```
```nginx
    # ── Trainerchat (Node-app op 127.0.0.1:3100) ──
    location ^~ /trainerchat/ {
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
sudo nginx -t && sudo systemctl reload nginx
```

De `^~` zorgt dat nginx onder `/trainerchat/` nooit losse bestanden serveert, dus `.env`
is onbereikbaar via de browser.

</details>

---

## ⚙️ Instellingen in `.env`

| Variabele | Betekenis |
|---|---|
| `OPENAI_API_KEY` | Je OpenAI-sleutel (alleen hier, nooit in git of chat) |
| `OPENAI_MODEL` | Welk model (bijv. `gpt-5.2`). Zwaarder = beter maar trager/duurder |
| `MAX_TOKENS` | Max lengte antwoord (8192 standaard; 16000 bij zware modellen) |
| `TOEGANGSCODE` | Extra code; **leeg** = geen tweede prompt (chat zit al achter site-basic-auth) |
| `PORT` | Poort van de Node-app (standaard 3100) |
