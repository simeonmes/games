// Regression checks for host-owned questions, dive IDs and delayed UI callbacks.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const dir = path.join(__dirname, '..', 'js');
const elements = new Map(), packets = [], rounds = [];
const element = id => {
  if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', className: '', value: '',
    classList: { toggle() {}, add() {} }, style: { setProperty() {} }, focus() {},
    querySelector: () => element('child'), querySelectorAll: () => [], addEventListener() {} });
  return elements.get(id);
};
let completeAnimation;
const ctx = vm.createContext({ console, URLSearchParams, location: { search: '', pathname: '/krillion/' }, history: { replaceState() {} },
  localStorage: { getItem: () => null }, window: {}, document: {}, navigator: {},
  ROUND_SECS: 25, COUNTDOWN: 3, METRES_PER_PT: 10, curRound: null, onQuit: null,
  clearTimers() {}, setTimeout: () => 1, clearTimeout() {},
  screen: element('screen'), $: element, esc: String, fmt: String, fmtM: n => `${n}m`,
  muteBtn: () => '', hudHTML: () => '', squaresHTML: () => '', Sound: { play() {} },
  Scene: { banners() {}, set() {}, zone: () => ({ name: 'Ocean' }) },
  playRound(options) { const r = { ...options, bank: { entries: [] } }; ctx.curRound = r; rounds.push(r); },
  revealSequence: () => new Promise(resolve => { completeAnimation = resolve; }),
});
vm.runInContext(fs.readFileSync(path.join(dir, 'data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'match.js'), 'utf8'), ctx);
vm.runInContext('function bankFor(pi) { return Match.build(tiersFor(pi)); } function drawPrompts() { return [0, 1]; }', ctx);
let source = fs.readFileSync(path.join(dir, 'room.js'), 'utf8');
source = source.replace('  return { open, leave, get active()', `  globalThis.test = { hostStart, hostNext, hostClose, hostReceive, onMsg, cleanup,
    seed(state) { H = state; role = "host"; me = "host"; ui = "lobby"; },
    get token() { return roundToken; }, get playing() { return playing; } };
  return { open, leave, get active()`);
vm.runInContext(source, ctx);
const { test } = ctx;
const state = { dive: 0, count: 2, secs: 25, phase: 'lobby', i: -1, prompts: [], answers: {}, players: [
  { id: 'host', name: 'Host', score: 0, color: '#fff', picks: [] },
  { id: 'guest', name: 'Guest', score: 0, color: '#aaa', picks: [], conn: { open: true, send: m => packets.push(structuredClone(m)) } },
] };
test.seed(state); test.hostStart();
const prompt = packets.find(p => p.t === 'prompt');
assert(prompt.question.text && prompt.question.category && prompt.question.tiers);
assert.equal(prompt.pi, undefined, 'the protocol must not depend on another browser\'s local prompt index');
assert.equal(rounds[0].prompt.text, prompt.question.text);
const answer = vm.runInContext('bankFor(0).entries[0].shown', ctx);
test.hostReceive('guest', { t: 'answer', dive: 0, i: 0, typed: answer });
assert(!state.answers.guest, 'answers from an earlier dive must be ignored');
for (const id of ['host', 'guest']) test.hostReceive(id, { t: 'answer', dive: 1, i: 0, typed: answer });
test.hostClose(0, 1);
assert(state.players.every(p => p.score > 0), 'both correct answers must earn points');
const reveal = packets.find(p => p.t === 'reveal');
assert.deepEqual(reveal.question, prompt.question);
test.hostNext(0, 1); test.hostNext(0, 1);
assert.equal(state.i, 1, 'a duplicate Next callback must not skip a question');
test.hostClose(1, 0); assert.equal(state.phase, 'prompt', 'a stale close timer must not end another dive');
(async () => {
  const round = rounds.at(-1);
  const pending = round.onResolve(null, '', round, 'pass');
  assert(test.playing);
  // A later prompt starts while this player's earlier reveal is still animating.
  test.onMsg({ ...prompt, dive: 2, i: 0 });
  const token = test.token;
  element('#bottom').innerHTML = 'new round controls';
  completeAnimation(); await pending;
  assert.equal(test.token, token);
  assert.equal(element('#bottom').innerHTML, 'new round controls', 'an old animation must not replace the new question controls');
  test.onMsg({ ...reveal, dive: 1, i: 1 });
  assert.equal(element('#bottom').innerHTML, 'new round controls', 'a delayed reveal from an old dive must be ignored');
  test.cleanup();
  console.log('Host question payloads, scoring, stale answers/timers/reveals, duplicate Next and animation cancellation pass.');
})().catch(error => { console.error(error); process.exitCode = 1; });
