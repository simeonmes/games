// No network required: coverage, old scores, new matches, and unrelated-answer rejection.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/src="(js\/[^"?]+\.js)/g)].map(m => m[1])
  .filter(f => !['main', 'room', 'audio', 'scene'].some(n => f === `js/${n}.js`));
const ctx = vm.createContext({ console });
vm.runInContext(scripts.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n') + ';this.api={PROMPTS,Match,tiersFor};', ctx);
const { PROMPTS, Match, tiersFor } = ctx.api;
const before = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/answer-baseline.json'), 'utf8'));
const banks = new Map();
let total = 0, oldTotal = 0;
for (const [i, [q]] of PROMPTS.entries()) {
  const bank = Match.build(tiersFor(i)); banks.set(q, bank);
  assert(before[q], `Missing baseline: ${q}`);
  assert([...bank.index.keys()].some(k => !before[q].keys.includes(k)), `${q} needs additional accepted names`);
  assert.equal(bank.entries.filter(e => e.tier === 'k').length, 1, `${q} must retain one Krillion answer`);
  for (const old of before[q].entries) {
    const entry = bank.index.get(Match.key(old.shown));
    assert.equal(entry?.shown, old.shown, `${q}: renamed ${old.shown}`);
    assert.equal(entry?.tier, old.tier, `${q}: score changed for ${old.shown}`);
  }
  total += bank.entries.length; oldTotal += before[q].answers;
}
for (const [q, answer] of [
  ['Name a fruit', 'blue java banana'], ['Name a Pokémon', 'pecharunt'],
  ['Name something in a kitchen', 'chamber vacuum sealer'], ['Name a video game', '1000xresist'],
  ['Name a US state', 'commonwealth of virginia'], ['Name a NATO phonetic alphabet word', 'nato foxtrot'],
  ['Name a Pixar movie', 'lamp life'], ['Name a constellation', 'the charioteer'],
]) assert(Match.find(banks.get(q), answer), `${q} should accept ${answer}`);
for (const [q, answer] of [
  ['Name a musical instrument', 'Adobe Illustrator'], ['Name a fabric', 'mattress'],
  ['Name a dinosaur', 'Cygnus'], ['Name a sport', 'National Basketball Association'],
  ['Name a pasta shape', 'egg tart'], ['Name a unit of measurement', 'non-fungible token'],
]) assert.equal(Match.find(banks.get(q), answer), null, `${q} must reject ${answer}`);
console.log(`PASS: all ${PROMPTS.length} prompts expanded; ${oldTotal} → ${total} answers; original names and tiers preserved; new answers and invalid database categories checked.`);
