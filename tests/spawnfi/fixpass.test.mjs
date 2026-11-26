// Final-review fix pass (2026-11-26): the pure parts behind each fix.
import { stubWindow, load, assert } from './_load.mjs';

const g = stubWindow({ __hqSwitches: { hq_recon_spawnfi: 'on', hq_vendo_page_spawnfi: 'off', hq_link_widget: 'on' } });
load('js/dash.25.income.js');
load('js/dash.24.link.js');
load('js/dash.26.spawnfi-page.js');
const I = g.window.spawnIncome, L = g.window.spawnLink, P = g.window.spawnfiPage;

// Important 1 — what the live path writes back to harvests.recon_gap / recon_flag never includes SpawnFi
const row = { coins_total: 500, tg_name: 'x', tg_income_live: 100, cloud_income_live: 50, spawnfi_income_live: 400, spawnfi_overlap_days: 1 };
let f = I.figures(row, false);
assert(f.total_income === 550 && f.gap === 50, 'figures (shown): TG+Cloud+SpawnFi with the switch on');
let s = I.storedFigures(row);
assert(s.total_income === 150 && s.gap === -350 && s.flag === 'warn' && s.spawnfi_income === null, 'storedFigures: TG + Cloud only, even with the switch on');
s = I.storedFigures({ coins_total: 100, tg_name: null, tg_income: 454000, recon_gap: -5 });
assert(s.gap === null && s.flag === 'nodata', 'storedFigures: live rules — orphan guard, no saved-gap fallback');

// Important 5 — which cache to use: small fresh → small; small stale but big fresh → big (no notice); both stale → live + notice;
// small missing → big by its own age; nothing → live
const now = '2026-11-26T10:30:00Z';
let c = I.pickCache('2026-11-26T10:20:00Z', '2026-11-26T10:20:00Z', now, 15);
assert(c.use === 'small' && c.notice === '', 'pickCache: small fresh → small');
c = I.pickCache('2026-11-26T09:00:00Z', '2026-11-26T10:25:00Z', now, 15);
assert(c.use === 'big' && c.notice === '', 'pickCache: small stale (writer rolled back), big fresh → big, no notice');
c = I.pickCache('2026-11-26T09:00:00Z', '2026-11-26T09:10:00Z', now, 15);
assert(c.use === 'live' && c.notice === 'Live numbers — cache is 80 min old', 'pickCache: both stale → live, notice names the newest file age');
c = I.pickCache(null, '2026-11-26T10:25:00Z', now, 15);
assert(c.use === 'big' && c.notice === '', 'pickCache: no small file (v24 not deployed) → big');
c = I.pickCache(null, null, now, 15);
assert(c.use === 'live' && /no cache/.test(c.notice), 'pickCache: no file at all → live');

// Minor 1 pulled in — the link widget's password gate fails closed
assert(L.canGate() === false, 'canGate: no askAdminPw and no spawnAdminPwOk → refuse (old cached dash.1 / dash.0 not loaded)');
g.window.askAdminPw = async () => '1';
assert(L.canGate() === false, 'canGate: prompt but no checker → still refuse');
g.window.spawnAdminPwOk = pw => pw === '1';
assert(L.canGate() === true, 'canGate: prompt + checker → ask');

// Important 2 — the open-vendo-page buttons follow hq_vendo_page_spawnfi
assert(P.showOpenButtons() === false, 'showOpenButtons: switch off → no 📄 / no vendo link on the SpawnFi tab');
g.window.__hqSwitches.hq_vendo_page_spawnfi = 'on';
assert(P.showOpenButtons() === true, 'showOpenButtons: switch on');
