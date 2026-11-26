// Task 6: SpawnFi vendo page — the pure parts (window.spawnfiPage). Sessions = coins within 2 min from the same phone (as the Cloud page).
import { stubWindow, load, assert } from './_load.mjs';

const g = stubWindow({ __hqSwitches: { hq_vendo_page_spawnfi: 'on' } });
load('js/dash.26.spawnfi-page.js');
const P = g.window.spawnfiPage;
assert(P && typeof P.render === 'function' && typeof g.window.openVendoById === 'function', 'spawnfiPage + openVendoById exist');

const sales = [
  { sold_at: '2026-11-20T10:00:00+08:00', amount: 5, client_mac: 'aa:bb' },
  { sold_at: '2026-11-20T10:01:00+08:00', amount: 5, client_mac: 'aa:bb' },
  { sold_at: '2026-11-20T10:05:00+08:00', amount: 10, client_mac: 'aa:bb' },
];
let s = P.sessionsOf(sales);
assert(s.length === 2, 'sessionsOf: 10:00 + 10:01 one session, 10:05 another (2-minute rule)');
assert(s[0].n === 2 && s[0].amount === 10 && s[1].n === 1 && s[1].amount === 10, 'sessionsOf: counts and pesos per session');
assert(s[0].start === '2026-11-20T10:00:00+08:00' && s[0].end === '2026-11-20T10:01:00+08:00' && s[0].mac === 'aa:bb', 'sessionsOf: start / end / mac');
s = P.sessionsOf([{ sold_at: '2026-11-20T10:00:00+08:00', amount: 5, client_mac: null }, { sold_at: '2026-11-20T10:00:30+08:00', amount: 5, client_mac: null }]);
assert(s.length === 2, 'sessionsOf: no MAC → every sale is its own session');
s = P.sessionsOf([{ sold_at: '2026-11-20T10:00:00+08:00', amount: 5, client_mac: 'a' }, { sold_at: '2026-11-20T10:00:30+08:00', amount: 5, client_mac: 'b' }]);
assert(s.length === 2, 'sessionsOf: different phones never share a session');
assert(P.sessionsOf([]).length === 0 && P.sessionsOf(null).length === 0, 'sessionsOf: empty / null → []');

const daily = [{ day: '2026-11-01', pesos: 6000, sales: 300, sessions: 290, biggest: 100 }, { day: '2026-11-02', pesos: 7262, sales: 427, sessions: 400, biggest: 588 }];
const t = P.tilesOf(daily, P.sessionsOf(sales), { expected_in_box: 6888, last_harvest_date: '2026-11-05', has_tg: false, has_spawnfi: true, expected_tg: 0, expected_spawnfi: 6888 });
assert(t.total === 13262 && t.drops === 727 && t.timeSold === '—', 'tilesOf: total, drops from the daily view, time sold unknown (validity_min is empty)');
assert(t.sessions === 690 && t.biggest === 588, 'tilesOf: sessions and biggest from the daily view');
assert(t.avg === Math.round(13262 / 690), 'tilesOf: avg per session');
assert(t.expected === 6888 && t.since === '2026-11-05', 'tilesOf: expected in box and open-since from the sources view');
const t0 = P.tilesOf([], [], null);
assert(t0.total === 0 && t0.avg === 0 && t0.biggest === 0 && t0.expected === null && t0.since === null, 'tilesOf: nothing yet → zeros, no expected');

assert(P.enabled() === true, 'enabled: switch on');
g.window.__hqSwitches.hq_vendo_page_spawnfi = 'off';
assert(P.enabled() === false, 'enabled: switch off');
