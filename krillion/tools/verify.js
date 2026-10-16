// Checks the answer bank: every prompt has exactly one krillion answer, lists answers that
// sit in two tiers, and runs a few matcher cases. Run: node krillion/tools/verify.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const dir = path.join(__dirname, "..", "js");
const ctx = { console };
vm.createContext(ctx);
const src = ["data.js", "match.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
vm.runInContext(src + "\n;this.PROMPTS = PROMPTS; this.Match = Match;", ctx);
const { PROMPTS, Match } = ctx;

let bad = 0, total = 0;
for (const [q, tiers] of PROMPTS) {
  const bank = Match.build(tiers);
  total += bank.entries.length;
  const ks = bank.entries.filter(e => e.tier === "k");
  if (ks.length !== 1) { bad++; console.log(`✗ ${q}: ${ks.length} krillion answers`); }
  if (bank.clashes.length) console.log(`  ${q}: in two tiers → ${bank.clashes.join(", ")}`);
}
console.log(`${PROMPTS.length} prompts, ${total} answers`);

const bankOf = q => Match.build(PROMPTS.find(p => p[0] === q)[1]);
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
