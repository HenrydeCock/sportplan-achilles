// Bouwt de gecombineerde ASM-bibliotheek: de gecureerde, rijke oefeningen
// (asm_poc_50_oefeningen.json) + de bruikbare records uit een ruwe ASM-gallery-export.
//
// "Bruikbaar" = handball_relevance >= middel én ten minste één semantische tag
// (movement_components / coordination_abilities / asm_domains). Daarna titel-dedup
// (de export bevat veel dubbele/ruis-titels) en id-overlap met de gecureerde set
// eruit (die houden we als de rijkere versie).
//
// Gebruik: node scripts/build-asm-extra.mjs [export.json] [--out bestand.json]
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, relative } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const B = (f) => join(ROOT, "bronnen", f);

const argv = process.argv.slice(2);
const outFlag = argv.indexOf("--out");
const OUT = outFlag !== -1 ? join(ROOT, argv[outFlag + 1]) : B("asm-oefeningen.json");
// positioneel = niet een vlag en niet de waarde direct na --out
const positional = argv.find((a, i) => !a.startsWith("--") && i !== outFlag + 1);
const EXPORT = positional || B("asm_gallery_poc_500_metadata.json");

const curated = JSON.parse(readFileSync(B("asm_poc_50_oefeningen.json"), "utf8"));
const exportRaw = JSON.parse(readFileSync(EXPORT.startsWith("/") || EXPORT.match(/^[A-Za-z]:/) ? EXPORT : B(EXPORT), "utf8"));

const uniq = (arr) => [...new Set((arr || []).filter(Boolean))];
const isUsable = (o) =>
  (o.handball_relevance === "middel" || o.handball_relevance === "hoog") &&
  ((o.movement_components || []).length || (o.coordination_abilities || []).length || (o.asm_domains || []).length);

// Map een ruw export-record naar het ASM-record-schema (ontbrekende rijke velden leeg).
function toAsm(o) {
  const materials = uniq(o.materials);
  return {
    id: o.id,
    title: o.title,
    url: o.url,
    duration: o.duration || "",
    primary_goal: "", // niet af te leiden uit kaart-metadata
    asm_tags: uniq([...(o.movement_components || []), ...(o.coordination_abilities || []), ...(o.asm_domains || [])]),
    trainer_labels: uniq([
      "motoriek",
      "bewegingsbasis",
      "warming-up",
      ...(o.sport_tags || []),
      materials.length ? "met materiaal" : "zonder materiaal",
    ]),
    materials,
    age_band: [], // onbekend op kaart-niveau (ASM-motoriek is leeftijd-breed)
    query_terms: uniq(o.query_terms),
    why_match: "",
    handball_relevance: o.handball_relevance,
    metadata_quality: o.metadata_quality || "card_level_inferred",
  };
}

const curIds = new Set(curated.map((o) => o.id));
const seenTitle = new Set();
const extra = [];
for (const o of exportRaw) {
  if (!isUsable(o)) continue;
  const k = (o.title || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (seenTitle.has(k)) continue;
  seenTitle.add(k);
  if (curIds.has(o.id)) continue; // al aanwezig als rijke gecureerde versie
  extra.push(toAsm(o));
}

const merged = [...curated, ...extra];
writeFileSync(OUT, JSON.stringify(merged, null, 2));
console.log(
  `Gecureerd: ${curated.length} | bruikbaar+nieuw uit export: ${extra.length} | totaal: ${merged.length}\n-> ${relative(ROOT, OUT)}`
);
