// Task 3: income by source helpers (window.spawnIncome). Convention (Recon tab): gap = income − coins;
// |gap| ≤ 20 ok; gap > 20 alert (deficit: coins less than income); gap < −20 warn (surplus).
import { stubWindow, load, assert } from './_load.mjs';

const g = stubWindow({ __hqSwitches: { hq_recon_spawnfi: 'on' } });
load('js/dash.25.income.js');
const I = g.window.spawnIncome;
assert(I && typeof I.incomeOf === 'function', 'window.spawnIncome exists');

const row = { tg_income_live: 100, cloud_income_live: 50, spawnfi_income_live: 25, tg_name: 'x' };
let r = I.incomeOf(row);
assert(r.tg === 100 && r.cloud === 50 && r.spawnfi === 25 && r.total === 175, 'incomeOf sums three sources when the switch is on');
assert(JSON.stringify(r.sources) === JSON.stringify(['tg', 'cloud', 'spawnfi']), 'incomeOf lists the sources present');

const rowV23 = { tg_income_live: 100, cloud_income_live: 50, tg_name: 'x' };          // v23 cache file: no spawnfi key
r = I.incomeOf(rowV23);
assert(r.spawnfi === null && r.total === 150 && !r.sources.includes('spawnfi'), 'incomeOf: missing spawnfi key = no data, not zero');

g.window.__hqSwitches.hq_recon_spawnfi = 'off';
r = I.incomeOf(row);
assert(r.spawnfi === null && r.total === 150, 'incomeOf ignores spawnfi when the switch is off (today\'s maths)');
g.window.__hqSwitches.hq_recon_spawnfi = 'on';

// verdict
let v = I.verdict(row, 200);           // income 175, coins 200 → gap −25 → surplus
assert(v.gap === -25 && v.flag === 'warn', 'verdict: surplus when coins exceed income by > 20');
v = I.verdict(row, 100);               // gap +75 → deficit
assert(v.gap === 75 && v.flag === 'alert', 'verdict: deficit when coins are short of income by > 20');
v = I.verdict(row, 170);               // gap 5 → ok
assert(v.flag === 'ok', 'verdict: ok within ±20');
v = I.verdict({ ...row, spawnfi_overlap_days: 2 }, 170);
assert(v.overlap === 2, 'verdict carries overlap days');
v = I.verdict({ tg_name: null }, 150);
assert(v.gap === null && v.flag === 'nodata', 'verdict: no source at all → nodata');
v = I.verdict({ ...row, book_inside: [{ date: '2026-11-01', amount: 100 }] }, 170);
assert(v.flag === 'paused', 'verdict: a book-only harvest inside the window pauses the check');

// cache decision
let c = I.cacheDecision('2026-11-26T10:00:00Z', '2026-11-26T10:14:00Z', 15);
assert(c.useCache === true && c.ageMin === 14 && c.notice === '', 'cacheDecision: 14 min old → use cache, no notice');
c = I.cacheDecision('2026-11-26T10:00:00Z', '2026-11-26T10:16:00Z', 15);
assert(c.useCache === false && c.notice === 'Live numbers — cache is 16 min old', 'cacheDecision: 16 min old → live + notice');
c = I.cacheDecision(null, '2026-11-26T10:16:00Z', 15);
assert(c.useCache === false && /no cache/.test(c.notice), 'cacheDecision: no generated_at → live');

// html
const cell = I.cell(row);
assert(/TG ₱100/.test(cell) && /☁ Cloud ₱50/.test(cell) && /⚡ SpawnFi ₱25/.test(cell), 'cell shows a chip per source');
assert(/#311A8E/.test(I.chip('spawnfi', 25)) && /#025AC6/.test(I.chip('tg', 1)) && /#028867/.test(I.chip('cloud', 1)), 'chip colours per source');
assert(!/⚡/.test(I.cell(rowV23)), 'cell omits the SpawnFi chip when there is no SpawnFi data');
