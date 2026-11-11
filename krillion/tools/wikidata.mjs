// Builds js/bank-wikidata.js: extra answers pulled from Wikidata for the prompts listed in
// SOURCES below, tiered by how many language editions of Wikipedia have an article on each
// item (a rough stand-in for how well known it is). It never adds Plankton or One in a
// Krillion answers, and it skips anything the bank already accepts.
//
//   node krillion/tools/wikidata.mjs                 all prompts
//   node krillion/tools/wikidata.mjs --only cheese   prompts whose text contains "cheese"
//   node krillion/tools/wikidata.mjs --dry-run       report only, write nothing
//   node krillion/tools/wikidata.mjs --rebuild       rebuild from cached source records
//   node krillion/tools/wikidata.mjs --refresh       refresh the source records
//
// Needs Node 18+ and access to www.wikidata.org and query.wikidata.org. Read the report it
// writes (tools/wikidata-report.txt) before committing the generated file.

import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const jsDir = path.join(here, "..", "js");
const OUT = path.join(jsDir, "bank-wikidata.js");
const CACHE = path.join(here, "wikidata-cache");
const REPORT = path.join(here, "wikidata-report.txt");
const UA = "KrillionBankBuilder/1.0 (fan word game; https://github.com/simeonmes/games)";

// Each source: the prompt it feeds, the class it is built from (checked by English label
// before use, so a wrong id is skipped rather than trusted), the SPARQL pattern that picks
// items, and the minimum number of Wikipedia editions an item needs to count.
const SOURCES = [
  { q: "Name a cheese", check: ["Q10943", "cheese"], where: "?item wdt:P279+ wd:Q10943.", min: 3 },
  { q: "Name a pasta shape", check: ["Q178", "pasta"], where: "?item wdt:P279+ wd:Q178.", min: 2 },
  { q: "Name a dog breed", check: ["Q39367", "dog breed"], where: "?item wdt:P31 wd:Q39367.", min: 4 },
  { q: "Name a musical instrument", check: ["Q34379", "musical instrument"], where: "?item wdt:P279+ wd:Q34379.", min: 8 },
  { q: "Name a sport", check: ["Q349", "sport"], where: "?item wdt:P279+ wd:Q349.", min: 10 },
  { q: "Name a board game", check: ["Q131436", "board game"], where: "?item wdt:P31 wd:Q131436.", min: 6 },
  { q: "Name a card game", check: ["Q142714", "card game"], where: "?item wdt:P31/wdt:P279* wd:Q142714.", min: 4 },
  { q: "Name a gemstone", check: ["Q83437", "gemstone"], where: "?item wdt:P279+ wd:Q83437.", min: 4 },
  { q: "Name a dessert", check: ["Q182940", "dessert"], where: "?item wdt:P31/wdt:P279* wd:Q182940.", min: 5 },
  { q: "Name a programming language", check: ["Q9143", "programming language"], where: "?item wdt:P31/wdt:P279* wd:Q9143.", min: 12 },
  { q: "Name a superhero", check: ["Q188784", "superhero"], where: "?item wdt:P31/wdt:P279* wd:Q188784.", min: 10 },
  { q: "Name a type of sandwich", check: ["Q28803", "sandwich"], where: "?item wdt:P279+ wd:Q28803.", min: 3 },
  { q: "Name a musical genre", check: ["Q188451", "music genre"], where: "?item wdt:P31 wd:Q188451.", min: 12 },
  { q: "Name a mythical creature", check: ["Q2239243", "mythical creature"], where: "?item wdt:P31/wdt:P279* wd:Q2239243.", min: 6 },
  { q: "Name a type of hat", check: ["Q80151", "hat"], where: "?item wdt:P279+ wd:Q80151.", min: 3 },
  { q: "Name a cocktail", check: ["Q134768", "cocktail"], where: "?item wdt:P31/wdt:P279* wd:Q134768.", min: 4 },
  { q: "Name a fabric", check: ["Q28823", "textile"], where: "?item wdt:P279+ wd:Q28823.", min: 5 },
  { q: "Name a martial art", check: ["Q11417", "martial arts"], where: "?item wdt:P31/wdt:P279* wd:Q11417.", min: 5 },
  { q: "Name a soup", check: ["Q41415", "soup"], where: "?item wdt:P31/wdt:P279* wd:Q41415.", min: 4 },
  { q: "Name a type of bread", check: ["Q7802", "bread"], where: "?item wdt:P31/wdt:P279* wd:Q7802.", min: 4 },
  { q: "Name a type of rock or mineral", check: ["Q7946", "mineral"], where: "?item wdt:P31 wd:Q7946.", min: 15 },
  { q: "Name a type of rock or mineral", check: ["Q8063", "rock"], where: "?item wdt:P279+ wd:Q8063.", min: 8 },
  { q: "Name a unit of measurement", check: ["Q47574", "unit of measurement"], where: "?item wdt:P279+ wd:Q47574.", min: 15 },
  { q: "Name a Pokémon", check: ["Q3966183", "Pokémon species"], where: "?item wdt:P31 wd:Q3966183.", min: 8 },
  { q: "Name a Greek god or goddess", check: ["Q22989102", "Greek deity"], where: "?item wdt:P31/wdt:P279* wd:Q22989102.", min: 6 },
  { q: "Name a famous river", check: ["Q4022", "river"], where: "?item wdt:P31 wd:Q4022.", min: 45 },
  { q: "Name a famous mountain", check: ["Q8502", "mountain"], where: "?item wdt:P31 wd:Q8502.", min: 40 },
  { q: "Name a famous ship", check: ["Q11446", "ship"], where: "?item wdt:P31/wdt:P279* wd:Q11446.", min: 25 },
  { q: "Name a capital city", check: ["Q3624078", "sovereign state"], where: "?country wdt:P31 wd:Q3624078; wdt:P36 ?item.", min: 1 },
  { q: "Name a Disney animated movie", check: ["Q1047410", "Walt Disney Animation Studios"], where: "?item wdt:P272 wd:Q1047410.", min: 5 },
  { q: "Name a Harry Potter character", check: ["Q8337", "Harry Potter"], where: "?item wdt:P1441 wd:Q8337.", min: 3 },
  { q: "Name a dinosaur", check: ["Q430", "dinosaur"], where: "?item wdt:P171+ wd:Q430; wdt:P105 wd:Q34740. FILTER NOT EXISTS { ?item wdt:P171* wd:Q5113. }", min: 6 },
  // People: also accept the surname on its own ("monet" for Claude Monet).
  { q: "Name a famous painter", check: ["Q1028181", "painter"], where: "?item wdt:P106 wd:Q1028181.", min: 60, surname: true },
  { q: "Name a famous composer", check: ["Q36834", "composer"], where: "?item wdt:P106 wd:Q36834.", min: 55, surname: true },
  { q: "Name a famous scientist", check: ["Q169470", "physicist"], where: "?item wdt:P106 wd:Q169470.", min: 70, surname: true },
  { q: "Name a famous scientist", check: ["Q593644", "chemist"], where: "?item wdt:P106 wd:Q593644.", min: 70, surname: true },
  { q: "Name a famous scientist", check: ["Q864503", "biologist"], where: "?item wdt:P106 wd:Q864503.", min: 70, surname: true },
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].toLowerCase() : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const { stdout } = await run("curl", ["-fLsS", "--max-time", "50", "-A", UA, "-H", "Accept: application/sparql-results+json, application/json", url], { maxBuffer: 20 * 1024 * 1024 });
      return JSON.parse(stdout);
    } catch (error) {
      if (i + 1 === tries) throw error;
      await sleep(3000);
    }
  }
}

async function labelOf(qid) {
  const data = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels&languages=en&format=json`);
  return data.entities?.[qid]?.labels?.en?.value || "";
}

function query(src) {
  const surname = src.surname ? `OPTIONAL { ?item wdt:P734 ?fam. ?fam rdfs:label ?surname. FILTER(LANG(?surname) = "en") }` : "";
  return `SELECT ?item ?label ?links (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) (SAMPLE(?surname) AS ?sur) WHERE {
    ${src.where}
    ?item wikibase:sitelinks ?links. FILTER(?links >= ${src.min})
    ?item rdfs:label ?label. FILTER(LANG(?label) = "en")
    OPTIONAL { ?item skos:altLabel ?alt. FILTER(LANG(?alt) = "en") }
    ${surname}
  } GROUP BY ?item ?label ?links ORDER BY DESC(?links) LIMIT 1200`;
}

// Keeps names a player could plausibly type: no digits, brackets or long phrases.
function clean(s) {
  s = String(s || "").trim().toLowerCase();
  if (!s || s.length > 40 || /[0-9()\[\],;:"]/.test(s) || s.split(/\s+/).length > 4) return null;
  return s.replace(/\|/g, " ").replace(/\//g, " ");
}

// The bank as the game sees it, to skip answers it already accepts.
function loadBank() {
  const ctx = {};
  vm.createContext(ctx);
  const prompts = fs.readdirSync(path.join(jsDir, "prompts")).filter(f => f.endsWith(".js")).sort().map(f => "prompts/" + f);
  const files = ["data.js", ...prompts, "bank-extra.js", "bank-clever.js", "bank-more.js", "match.js"].map(f => fs.readFileSync(path.join(jsDir, f), "utf8"));
  vm.runInContext(files.join("\n") + ";this.PROMPTS = PROMPTS; this.Match = Match; this.tiersFor = tiersFor;", ctx);
  return ctx;
}

async function main() {
  const { PROMPTS, Match, tiersFor } = loadBank();
  const out = {}, report = [];
  if (fs.existsSync(OUT) && !args.includes("--rebuild")) {
    const previous = { BANK_SOURCES: [] };
    vm.runInNewContext(fs.readFileSync(OUT, "utf8"), previous);
    for (const source of previous.BANK_SOURCES) for (const [q, tiers] of Object.entries(source)) {
      out[q] = Object.fromEntries(Object.entries(tiers).map(([t, answers]) => [t, answers.split("|")]));
    }
  }
  for (const src of SOURCES) {
    if (only && !src.q.toLowerCase().includes(only)) continue;
    // These superclasses also contain finished objects, events, currencies or people.
    // Use reviewed supplements until a more precise query is available.
    if (["Name a pasta shape", "Name a musical instrument", "Name a sport", "Name a fabric", "Name a unit of measurement", "Name a mythical creature", "Name a dinosaur"].includes(src.q)) continue;
    const pi = PROMPTS.findIndex(p => p[0] === src.q);
    if (pi < 0) { report.push(`!! ${src.q}: no such prompt`); continue; }
    const [qid, expect] = src.check;
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query(src))}`;
    const cacheFile = path.join(CACHE, `${pi}-${qid}.json`);
    const cached = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : null;
    let label;
    try { label = cached?.url === url ? expect : await labelOf(qid); }
    catch (error) { console.log(`!! ${src.q}: label lookup failed`); report.push(`!! ${src.q}: ${error.message}`); continue; }
    if (label.toLowerCase() !== expect.toLowerCase()) {
      report.push(`!! ${src.q}: ${qid} is "${label}", expected "${expect}". Skipped.`);
      continue;
    }
    if (!cached) await sleep(500);
    let rows;
    try {
      if (cached?.url === url && !args.includes("--refresh")) rows = cached.rows;
      else {
        rows = (await getJSON(url)).results.bindings;
        if (!dryRun) {
          fs.mkdirSync(CACHE, { recursive: true });
          fs.writeFileSync(cacheFile, JSON.stringify({ source: "Wikidata (CC0)", url, retrieved: new Date().toISOString(), rows }, null, 2) + "\n");
        }
      }
    }
    catch (e) { report.push(`!! ${src.q}: query failed (${e.message})`); continue; }
    if (!cached) await sleep(1500);

    const previous = out[src.q] || {};
    const tiers = tiersFor(pi);
    for (const [t, values] of Object.entries(previous)) if (values.length) tiers[t] = [tiers[t], values.join("|")].filter(Boolean).join("|");
    const bank = Match.build(tiers);
    const known = s => bank.index.has(Match.key(s));
    const items = rows.map(r => ({
      name: clean(r.label.value.replace(/ (pdo|pat)$/i, "")),
      alts: (r.alts?.value || "").split("|").map(clean).filter(Boolean),
      sur: src.surname ? clean(r.sur?.value) : null,
      links: +r.links.value,
    })).filter(it => it.name);
    // Rank among everything Wikidata returned, so tiers reflect fame within the category.
    const sorted = items.map(it => it.links).sort((a, b) => b - a);
    const tierOf = links => {
      const rank = sorted.indexOf(links) / Math.max(1, sorted.length);
      return rank < 0.12 ? "s" : rank < 0.45 ? "r" : "d";
    };
    const add = { s: [], r: [], d: [] }, added = [];
    for (const it of items) {
      if (["kturtle", "precious stone", "abbey of westmalle", "cheese horses"].includes(it.name)) continue;
      if (/^(manufacture of|list of|history of|cheese in|cheeses of|cheeses from) /.test(it.name)) continue;
      const short = it.name.replace(/ (cheese|dog|shepherd|cap|guitar|turtle|stones)$/, "");
      if (short !== it.name && known(short)) continue;
      const spellings = [it.name, ...it.alts.slice(0, 4), it.sur].filter(Boolean);
      if (spellings.some(known)) continue;          // the bank already has it (or a name for it)
      const t = tierOf(it.links);
      add[t].push([...new Set(spellings)].join("/"));
      added.push(`${t} ${it.links} ${it.name}`);
      spellings.forEach(s => bank.index.set(Match.key(s), true));
    }
    out[src.q] = out[src.q] || {};
    for (const t of ["s", "r", "d"]) out[src.q][t] = [...(out[src.q][t] || []), ...add[t]];
    console.log(`${src.q}: ${rows.length} database records, ${added.length} new answers`);
    report.push(`${src.q} (${qid}): ${rows.length} from Wikidata, ${added.length} new`);
    report.push(...added.slice(0, 40).map(a => `    ${a}`));
    if (added.length > 40) report.push(`    …and ${added.length - 40} more`);
  }

  const body = Object.fromEntries(Object.entries(out).map(([q, t]) => [q,
    Object.fromEntries(Object.entries(t).filter(([, v]) => v.length).map(([k, v]) => [k, v.join("|")]))]));
  const js = `"use strict";
// Generated by tools/wikidata.mjs on ${new Date().toISOString().slice(0, 10)} from Wikidata (CC0).
// Answers here were tiered automatically by how many Wikipedias cover them; review
// tools/wikidata-report.txt before committing. Re-run the script to regenerate.

BANK_SOURCES.push(${JSON.stringify(body, null, 2)});
`;
  if (!dryRun) fs.writeFileSync(REPORT, report.join("\n") + "\n");
  if (!dryRun) {
    fs.writeFileSync(OUT, js);
    // Load the generated file in the game, right after the hand-written extras.
    const html = path.join(here, "..", "index.html");
    const page = fs.readFileSync(html, "utf8");
    if (!page.includes("bank-wikidata.js")) {
      fs.writeFileSync(html, page.replace(/(<script src="js\/bank-more\.js[^"]*"><\/script>)/, `$1\n<script src="js/bank-wikidata.js?v=${Date.now() % 100000}"></script>`));
    }
  }
  console.log(report.filter(l => !l.startsWith("    ")).join("\n"));
  console.log(dryRun ? "\n(dry run: nothing written)" : `\nwrote ${path.relative(process.cwd(), OUT)} and ${path.relative(process.cwd(), REPORT)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
