# GHV Achilles — Technisch Beleidsplan & Trainerchat

Deze repo bevat twee onderdelen:

## 1. Technisch Beleidsplan Jeugd (de website)
[`index.html`](index.html) — de volledige, zelfstandige website met het technisch
beleidsplan van GHV Achilles (één bestand, geen build-stap).
🔗 Live: **https://sportplan-achilles.nl** (achter het sitewachtwoord).

## 2. Trainerchat — map [`trainerchat/`](trainerchat/)
Een chat-app waar trainers met hun **"supportteam"** (vier deskundigen) overleggen en
handbaloefeningen genereren, mét een **geanimeerd tactiekbord** (veld 30×20 m, spelers,
kegels, looplijnen).
🔗 Live: **https://sportplan-achilles.nl/trainerchat/chat.html**

👉 **Werkhandleiding** (installeren, bijwerken, **live zetten**, model wisselen,
veiligheid): zie **[`trainerchat/README.md`](trainerchat/README.md)**.

---

## Waar het draait
Alles draait op de VM **`ai-tools`**, in `/home/info/sportplan-achilles` (een clone van
deze repo). De website wordt door **nginx** geserveerd; de trainerchat draait als
**Node-service** (`achilles-chat`) achter nginx.

**Een wijziging live zetten** = op de VM:
```bash
cd /home/info/sportplan-achilles && git pull
sudo systemctl restart achilles-chat   # alleen nodig bij prompt-/server-wijzigingen
```
Daarna in de browser een hard refresh (`Ctrl+Shift+R`). Details in
[`trainerchat/README.md`](trainerchat/README.md).

## Geheimen
API-sleutels staan **alleen** in `trainerchat/.env` op de server — dat bestand staat in
[`.gitignore`](.gitignore) en komt **nooit** in git.
