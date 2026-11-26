// Task 5: the link widget's pure parts (window.spawnLink). The modal itself is DOM and is checked by hand on the preview link.
import { stubWindow, load, assert } from './_load.mjs';

const g = stubWindow({ __hqSwitches: { hq_link_widget: 'on' } });
load('js/dash.24.link.js');
const L = g.window.spawnLink;
assert(L && typeof L.open === 'function', 'window.spawnLink exists');

let p = L.payload({ router: 'Spawnfi-Dicayas', vlan: 191, vendo_id: 597, user: 'spawn', switch_date: '2026-11-01' });
assert(JSON.stringify(p) === JSON.stringify({ p_router: 'Spawnfi-Dicayas', p_vlan: 191, p_vendo: 597, p_by: 'dashboard: spawn', p_switch_date: '2026-11-01', p_msg: null }), 'payload: link, by dashboard: <user>, switch date, no msg');
p = L.payload({ router: 'Spawnfi-Dicayas', vlan: '191', vendo_id: null, user: 'spawn' });
assert(p.p_vendo === null && p.p_vlan === 191 && p.p_switch_date === null, 'payload: unlink → p_vendo null; vlan coerced to a number; no date → null');

assert(L.needsConfirm({ current_vendo_id: 111, vendo_id: 597 }) === true, 'needsConfirm: linked to another vendo → confirm the move');
assert(L.needsConfirm({ current_vendo_id: null, vendo_id: 597 }) === false, 'needsConfirm: not linked yet → no confirm');
assert(L.needsConfirm({ current_vendo_id: 597, vendo_id: 597 }) === false, 'needsConfirm: same vendo → no confirm');
assert(L.needsConfirm({ current_vendo_id: 597, vendo_id: null }) === false, 'needsConfirm: unlink is its own button, not a move');

assert(L.defaultSwitchDate('2026-10-30T02:11:00Z') === '2026-10-30', 'defaultSwitchDate: Manila date of the first sale');
assert(L.defaultSwitchDate('2026-10-29T17:30:00Z') === '2026-10-30', 'defaultSwitchDate: 17:30Z is already the next day in Manila');
assert(L.defaultSwitchDate(null) === '' && L.defaultSwitchDate('garbage') === '', 'defaultSwitchDate: nothing known → empty (all sales count)');

const q = L.fromQuestionText('SpawnFi Spawnfi-Dicayas · VLAN 358 · panel name "Elizabeth G. Baros - Crossing"\nBest match: #3484 …');
assert(q && q.router === 'Spawnfi-Dicayas' && q.vlan === 358, 'fromQuestionText: router + VLAN from the Name matcher question');
assert(L.fromQuestionText('Which vendo was pulled out?') === null, 'fromQuestionText: other questions → null');

assert(L.enabled() === true, 'enabled: switch on');
g.window.__hqSwitches.hq_link_widget = 'off';
assert(L.enabled() === false, 'enabled: switch off → widget hidden everywhere');
assert(L.open({ router: 'x', vlan: 1 }) === false, 'open: returns false (does nothing) while the switch is off');
