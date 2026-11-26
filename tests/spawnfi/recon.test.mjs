// Task 4: spawnIncome.figures(row, useSavedGap) — the one helper the Recon tab's three verdict sites call.
// Switch OFF ⇒ identical to the maths that lived inline in dash.1.harvest.js (mapCached / _rcFromSaved / live build).
import fs from 'fs';
import { stubWindow, load, assert } from './_load.mjs';

const g = stubWindow({ __hqSwitches: { hq_recon_spawnfi: 'off' } });
load('js/dash.25.income.js');
const I = g.window.spawnIncome;
assert(typeof I.figures === 'function', 'spawnIncome.figures exists');

// the old inline maths of mapCached (dash.1.harvest.js, pre-SpawnFi), verbatim in spirit
function oldMapCached(row){
  const tgInc = row.tg_income_live!=null ? Number(row.tg_income_live) : (row.tg_income!=null && row.tg_name) ? Number(row.tg_income) : null;
  const cloudInc = row.cloud_income_live!=null ? Number(row.cloud_income_live) : null;
  const totalInc = (tgInc!=null||cloudInc!=null) ? Number(tgInc||0)+Number(cloudInc||0) : null;
  const coins = Number(row.coins_total||0);
  const gap = totalInc!=null ? totalInc-coins : (row.recon_gap!=null?Number(row.recon_gap):null);
  const gap_pct = (coins>0&&gap!=null)?Math.abs(gap)/coins*100:null;
  const paused = Array.isArray(row.book_inside) && row.book_inside.length>0 && gap!=null;
  const flag = paused ? 'paused' : gap==null ? 'nodata' : Math.abs(gap)<=20 ? 'ok' : gap>20 ? 'alert' : 'warn';
  return { tg_income:tgInc, cloud_income:cloudInc, total_income:totalInc, gap, gap_pct, flag };
}
const same = (a, b, keys) => keys.every(k => (a[k] == null && b[k] == null) || a[k] === b[k]);
const KEYS = ['tg_income', 'cloud_income', 'total_income', 'gap', 'gap_pct', 'flag'];

const live = JSON.parse(fs.readFileSync(new URL('./fixtures/recon_rows_sample.json', import.meta.url), 'utf8'));
assert(live.length >= 3, 'fixture has rows copied from the live recon_cache.json (v23)');
// a row with no income at all but a gap saved by an earlier run (none in the sample today, so synthetic)
const savedOnly = { id: 1, coins_total: 300, tg_name: null, tg_income: 454000, recon_gap: -120, recon_flag: 'warn' };
for (const row of [...live, savedOnly]) {
  const o = oldMapCached(row), n = I.figures(row);
  assert(same(o, n, KEYS), `switch off: figures == old maths for row ${row.id} (${JSON.stringify(o)} vs ${JSON.stringify(n)})`);
  assert(n.spawnfi_income === null && n.spawnfi_overlap_days === 0, `switch off: no SpawnFi figures on row ${row.id}`);
}
// the live path never falls back to the saved gap (phase 2 replaces phase 1's saved figures)
let f = I.figures(savedOnly, false);
assert(f.gap === null && f.flag === 'nodata', 'useSavedGap=false: no income → nodata, saved recon_gap ignored');
// orphan guard: saved tg_income with no tg_name is never used
f = I.figures({ coins_total: 100, tg_income: 454000, tg_name: null }, false);
assert(f.tg_income === null && f.total_income === null, 'orphan guard: saved tg_income without a TG name is not income');

// switch ON: SpawnFi joins the total, overlap rides along
g.window.__hqSwitches.hq_recon_spawnfi = 'on';
f = I.figures({ coins_total: 500, tg_name: 'x', tg_income_live: 100, cloud_income_live: 50, spawnfi_income_live: 400, spawnfi_overlap_days: 3 });
assert(f.total_income === 550 && f.gap === 50 && f.flag === 'alert' && f.spawnfi_income === 400 && f.spawnfi_overlap_days === 3, 'switch on: TG+Cloud+SpawnFi, gap = income − coins, overlap carried');
f = I.figures({ coins_total: 500, tg_name: null, spawnfi_income_live: 480 });
assert(f.total_income === 480 && f.flag === 'ok' && JSON.stringify(f.sources) === '["spawnfi"]', 'switch on: SpawnFi-only vendo gets a verdict');
f = I.figures(live[0]);
assert(f.spawnfi_income === null && f.total_income === oldMapCached(live[0]).total_income, 'switch on, v23 row (no spawnfi key): total unchanged');
