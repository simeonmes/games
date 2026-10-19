// Checks the answer bank: every prompt has exactly one krillion answer, lists answers that
// sit in two tiers, and runs a few matcher cases. Run: node krillion/tools/verify.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const dir = path.join(__dirname, "..", "js");
const ctx = { console };
vm.createContext(ctx);
// The same files, in the same order, as index.html loads them.
const promptFiles = fs.existsSync(path.join(dir, "prompts")) ? fs.readdirSync(path.join(dir, "prompts")).filter(f => f.endsWith(".js")).sort().map(f => "prompts/" + f) : [];
const files = ["data.js", ...promptFiles, "bank-extra.js", "bank-wikidata.js", "match.js"].filter(f => fs.existsSync(path.join(dir, f)));
const html = fs.readFileSync(path.join(dir, "..", "index.html"), "utf8");
for (const f of promptFiles) if (!html.includes(`js/${f}`)) { console.log(`✗ index.html doesn't load js/${f}`); process.exitCode = 1; }
const src = files.map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
vm.runInContext(src + "\n;this.PROMPTS = PROMPTS; this.Match = Match; this.tiersFor = tiersFor;", ctx);
const { PROMPTS, Match, tiersFor } = ctx;

let bad = 0, total = 0;
const small = [];
for (const [pi, [q]] of PROMPTS.entries()) {
  const bank = Match.build(tiersFor(pi));
  total += bank.entries.length;
  const ks = bank.entries.filter(e => e.tier === "k");
  if (ks.length !== 1) { bad++; console.log(`✗ ${q}: ${ks.length} krillion answers`); }
  if (bank.clashes.length) console.log(`  ${q}: in two tiers → ${bank.clashes.join(", ")}`);
  // "io moon" next to "io", or "feta cheese" next to "feta", should be one answer.
  const SUFFIXES = ["moon", "dwarfplanet", "cheese", "bone", "bones", "nut", "nuts", "pasta", "fish", "vertebra", "noodle", "fruit", "hat", "cap", "bonnet", "lizard", "shark", "spider", "dog", "root", "gland", "glands", "stone", "steak", "cut", "lettuce", "squash", "mushroom", "bean", "beans", "pepper", "onion", "potato", "apple", "orange", "lemon", "berry", "tree", "frog", "turtle", "snake", "bird", "parrot", "owl", "eagle", "wombat", "possum", "kangaroo", "wallaby", "terrier", "hound", "spaniel", "retriever", "shepherd", "mastiff", "pointer", "setter", "sheepdog", "drum", "drums", "guitar", "horn", "flute", "pipe", "pipes", "harp", "organ", "piano", "saxophone", "karate", "kungfu", "jitsu", "wrestling", "boxing", "sword"];
  const NOT_DOUBLES = new Set(["grapefruit", "top hat", "bass drum", "eardrum", "chess boxing", "t-bone steak", "australian shepherd",
    "butternut squash", "cashew apple", "top sirloin cap", "rump cap", "vanilla bean", "grape nut",
    "catfish", "bullfrog", "eagle owl", "hawk eagle", "hawk owl",
    "ringtail possum", "wolf spider", "rat terrier", "ghost spider"]);
  const keyOf = new Map(bank.entries.filter(e => !NOT_DOUBLES.has(e.shown)).map(e => [Match.key(e.shown), e]));
  const dupes = [];
  for (const [k, e] of keyOf) for (const sfx of SUFFIXES) {
    if (k.length > sfx.length && k.endsWith(sfx) && keyOf.has(k.slice(0, -sfx.length))) dupes.push(e.shown);
  }
  if (dupes.length) { bad++; console.log(`✗ ${q}: doubled answers → ${dupes.join(", ")}`); }
  if (bank.entries.length < 150) small.push(`${bank.entries.length} ${q}`);
}
console.log(`under 150 answers: ${small.length}`);
console.log(`${PROMPTS.length} prompts, ${total} answers`);
const texts = PROMPTS.map(p => p[0]);
const twice = texts.filter((q, i) => texts.indexOf(q) !== i);
if (twice.length) { bad++; console.log(`✗ prompts listed twice: ${twice.join(", ")}`); }

const bankOf = q => Match.build(tiersFor(PROMPTS.findIndex(p => p[0] === q)));
const cases = [
  ["Name a cheese", "Mozarella", "mozzarella"], ["Name a cheese", "the moon", "moon"],
  ["Name a fruit", "Peaches", "peach"], ["Name a fruit", "kiwis", "kiwi"],
  ["Name a programming language", "C++", "c++"], ["Name a programming language", "C#", "c#"],
  ["Name a programming language", "c", "c"], ["Name a candy", "M&Ms", "m&ms"],
  ["Name a Shakespeare play", "A Midsummer Night's Dream", "a midsummer night s dream"],
  ["Name a US state", "Missisippi", "mississippi"], ["Name a dinosaur", "T-Rex", "t rex"],
  ["Name a cheese", "zzzzz", null], ["Name a word that rhymes with 'cat'", "dog", null],
  ["Name a vegetable", "tomatoes", "tomato"], ["Name a capital city", "Bogotá", "bogota"],
];
for (const [q, typed, want] of cases) {
  const got = Match.find(bankOf(q), typed);
  const ok = (got ? got.shown : null) === want;
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${q}: "${typed}" → ${got ? got.shown + " (" + got.tier + ")" : "no match"}`);
}
process.exit(bad ? 1 : 0);
