// Trainerchat backend voor sportplan-achilles.nl
// Proxyt chatberichten naar de OpenAI API. De API-key blijft op de server.
import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3100;
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const TOEGANGSCODE = (process.env.TOEGANGSCODE || "").trim(); // leeg = open
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || "4096", 10);

if (!API_KEY) {
  console.error("FOUT: zet OPENAI_API_KEY in .env");
  process.exit(1);
}

const SYSTEM_PROMPT = readFileSync(join(__dirname, "council-prompt.md"), "utf8");

// ASM-oefeningenbibliotheek (metadata + links) — wordt aan de systeemprompt geplakt
let ASM_BLOK = "";
try {
  const lijst = JSON.parse(readFileSync(join(__dirname, "asm-oefeningen.json"), "utf8"));
  if (Array.isArray(lijst) && lijst.length) {
    const regels = lijst
      .map((o) =>
        `- ${o.title} | ${o.url} | doel: ${o.primary_goal || ""} | tags: ${(o.asm_tags || []).join(", ")} | labels: ${(o.trainer_labels || []).join(", ")} | leeftijd: ${(o.age_band || []).join("/")} | ${o.duration || ""}`
      )
      .join("\n");
    ASM_BLOK =
      "\n\n══════════════════════\nASM-OEFENINGENBIBLIOTHEEK (echte oefeningen — serveer alleen links hieruit)\n══════════════════════\n" +
      regels;
    console.log(`ASM-bibliotheek geladen: ${lijst.length} oefeningen`);
  }
} catch (e) {
  console.error("ASM-bibliotheek niet geladen:", e.message);
}

const app = express();
app.set("trust proxy", 1); // achter nginx
app.use(express.json({ limit: "200kb" }));
app.use(express.static(join(__dirname, "public")));

// Vangnet tegen weglopen van kosten: max 20 vragen per kwartier per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Even rustig aan — probeer het over een kwartier opnieuw." },
});
app.use("/api/", limiter);

function checkToegang(req, res) {
  if (!TOEGANGSCODE) return true;
  const code = (req.headers["x-toegangscode"] || "").trim();
  if (code === TOEGANGSCODE) return true;
  res.status(401).json({ error: "Onjuiste toegangscode." });
  return false;
}

// Snelle check voor de frontend: is er een code nodig, en klopt de ingevulde?
app.post("/api/toegang", (req, res) => {
  if (!TOEGANGSCODE) return res.json({ vereist: false, ok: true });
  const code = ((req.body && req.body.code) || "").trim();
  res.json({ vereist: true, ok: code === TOEGANGSCODE });
});

app.post("/api/chat", async (req, res) => {
  if (!checkToegang(req, res)) return;

  const { messages, groep } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Geen berichten ontvangen." });
  }

  // Alleen role/content doorlaten, geschiedenis beperken tot laatste 12 beurten
  const history = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return res.status(400).json({ error: "Laatste bericht moet van de trainer zijn." });
  }

  // Groepsgegevens uit het instellingenpaneel als context aan het systeem toevoegen
  let system = SYSTEM_PROMPT + ASM_BLOK;
  if (groep && typeof groep === "object") {
    const g = (v) => (typeof v === "string" ? v.slice(0, 100) : "");
    const regels = [
      ["Aantal spelers", g(groep.aantal)],
      ["Leeftijdscategorie", g(groep.leeftijd)],
      ["Niveau", g(groep.niveau)],
      ["Samenstelling", g(groep.samenstelling)],
    ].filter(([, v]) => v);
    if (regels.length) {
      system +=
        "\n\n══════════════════════\nINVOER VAN DE TRAINER (huidige groep)\n══════════════════════\n" +
        regels.map(([k, v]) => `- ${k}: ${v}`).join("\n");
    }
  }

  // Streaming response (SSE) naar de browser
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // nginx: niet bufferen
  });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_completion_tokens: MAX_TOKENS,
        messages: [{ role: "system", content: system }, ...history],
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      console.error("OpenAI API-fout:", upstream.status, detail.slice(0, 500));
      send({ type: "error", error: "De assistent is even niet bereikbaar. Probeer het zo opnieuw." });
      return res.end();
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE-events van de API uitlezen, alleen tekst-deltas doorsturen
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          if (payload === "[DONE]") { send({ type: "klaar" }); continue; }
          try {
            const ev = JSON.parse(payload);
            const delta = ev.choices && ev.choices[0] && ev.choices[0].delta;
            if (delta && typeof delta.content === "string") {
              send({ type: "tekst", tekst: delta.content });
            }
            if (ev.error) {
              send({ type: "error", error: "Er ging iets mis bij het genereren." });
            }
          } catch {
            /* halve regel, volgende chunk maakt 'm af */
          }
        }
      }
    }
    send({ type: "klaar" });
  } catch (err) {
    console.error("Proxyfout:", err);
    send({ type: "error", error: "Verbinding met de assistent mislukt." });
  } finally {
    res.end();
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Trainerchat draait op http://127.0.0.1:${PORT}`);
  console.log(`Model: ${MODEL} — toegangscode ${TOEGANGSCODE ? "AAN" : "UIT (open!)"}`);
});
