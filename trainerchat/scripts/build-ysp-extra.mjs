// Bouwt de gecombineerde YourSportPlanner-bibliotheek: de gecureerde, rijke 50
// (yoursportplanner_handbal_poc_50.json — mét trainer_labels/why_match) +
// de overige records uit de rijkere detail-page-export.
//
// De export is hoogwaardig (metadata_quality "detail_page_parsed"): echte
// description/levels/techniques. We dedupliceren op ID (niet titel: er zijn
// legitieme gelijknamige oefeningen) en houden voor overlappende id's de
// gecureerde versie.
//
// Gebruik: node scripts/build-ysp-extra.mjs [export.json] [--out bestand.json]
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, relative, isAbsolute } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const B = (f) => join(ROOT, "bronnen", f);

const argv = process.argv.slice(2);
const outFlag = argv.indexOf("--out");
const OUT = outFlag !== -1 ? join(ROOT, argv[outFlag + 1]) : B("yoursportplanner-handbal.json");
const positional = argv.find((a, i) => !a.startsWith("--") && i !== outFlag + 1);
const EXPORT = positional ? (isAbsolute(positional) || positional.match(/^[A-Za-z]:/) ? positional : B(positional)) : B("yoursportplanner_handbal_poc_500_metadata.json");

const curated = JSON.parse(readFileSync(B("yoursportplanner_handbal_poc_50.json"), "utf8"));
const exportRaw = JSON.parse(readFileSync(EXPORT, "utf8"));

const uniq = (arr) => [...new Set((arr || []).filter(Boolean))];

// Map een export-record naar het YSP-record-schema; leid lichte trainer_labels af.
function toYsp(o) {
  return {
    description: o.description || "",
    description_sections: o.description_sections || [],
    id: o.id,
    levels: o.levels || [],
    materials: o.materials || [],
    max_players: o.max_players ?? null,
    min_players: o.min_players ?? null,
    query_terms: uniq(o.query_terms),
    source: o.source || "YourSportplanner",
    sport: o.sport || "handbal",
    techniques: o.techniques || [],
    trainer_labels: uniq([...(o.training_phase || []), ...(o.handball_skills || [])].map((s) => String(s).toLowerCase())),
    title: o.title,
    url: o.url,
    why_match: "",
    handball_skills: o.handball_skills || [],
    training_phase: o.training_phase || [],
    metadata_quality: o.metadata_quality || "detail_page_parsed",
  };
}

const curIds = new Set(curated.map((o) => o.id));
const extra = exportRaw.filter((o) => o.id && !curIds.has(o.id)).map(toYsp);
const merged = [...curated, ...extra];
writeFileSync(OUT, JSON.stringify(merged, null, 2));
console.log(`Gecureerd: ${curated.length} | nieuw uit export: ${extra.length} | totaal: ${merged.length}\n-> ${relative(ROOT, OUT)}`);
