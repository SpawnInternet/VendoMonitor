/* 💰 Income by source (2026-11-27, SpawnFi everywhere). One place for "how much income did this harvest window have"
   across Telegram, Cloud and SpawnFi, and the verdict the Recon tab shows (deficit / surplus / ok). Nothing here writes.
   Switch spawn_settings.hq_recon_spawnfi (read from window.__hqSwitches, set by dash.23): off = SpawnFi ignored, i.e. today's
   maths exactly; on = TOTAL INCOME = TG + Cloud + SpawnFi (Wendell 2026-11-26: add them), overlap days reported.
   Convention (unchanged): gap = income − coins; |gap| ≤ 20 ok; gap > 20 alert (deficit); gap < −20 warn (surplus).
   Spec: brain docs/superpowers/specs/2026-11-26-spawnfi-everywhere-design.md */
(function(){
  const COLOR = { tg: '#025AC6', cloud: '#028867', spawnfi: '#311A8E' };
  const LABEL = { tg: 'TG', cloud: '☁ Cloud', spawnfi: '⚡ SpawnFi' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const php = v => '₱' + Number(v || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 });
  const num = v => (v === null || v === undefined || v === '') ? null : Number(v);
  const spawnfiOn = () => !!(window.__hqSwitches && String(window.__hqSwitches.hq_recon_spawnfi || '').trim().toLowerCase() === 'on');

  /* income per source for one Recon row. null = no data for that source (not zero). */
  function incomeOf(row){
    row = row || {};
    // TG: the cache writer's live figure, else the saved figure only when the row has a TG name (orphan guard as the Recon does)
    const tg = row.tg_income_live != null ? num(row.tg_income_live)
             : (row.tg_income != null && row.tg_name) ? num(row.tg_income) : null;
    const cloud = row.cloud_income_live != null ? num(row.cloud_income_live) : (row.cloud_income != null ? num(row.cloud_income) : null);
    const spawnfi = spawnfiOn() && row.spawnfi_income_live != null ? num(row.spawnfi_income_live) : null;
    const sources = [];
    if (tg != null) sources.push('tg');
    if (cloud != null) sources.push('cloud');
    if (spawnfi != null) sources.push('spawnfi');
    const total = sources.length ? (tg || 0) + (cloud || 0) + (spawnfi || 0) : null;
    return { tg, cloud, spawnfi, total, sources };
  }

  /* the verdict the Recon tab shows. coins = coins_total of the harvest. */
  function verdict(row, coins){
    row = row || {};
    const inc = incomeOf(row);
    const overlap = spawnfiOn() ? Number(row.spawnfi_overlap_days || 0) : 0;
    if (Array.isArray(row.book_inside) && row.book_inside.length) return { gap: null, flag: 'paused', overlap, total: inc.total, sources: inc.sources };
    if (inc.total == null) return { gap: null, flag: 'nodata', overlap, total: null, sources: inc.sources };
    const gap = inc.total - Number(coins || 0);
    const flag = Math.abs(gap) <= 20 ? 'ok' : gap > 20 ? 'alert' : 'warn';
    return { gap, flag, overlap, total: inc.total, sources: inc.sources };
  }

  /* cache or live? generatedAt = the file's generated_at; maxAgeMin from hq_recon_cache_max_age_min (default 15). */
  function cacheDecision(generatedAtISO, nowISO, maxAgeMin){
    const max = Number(maxAgeMin) > 0 ? Number(maxAgeMin) : 15;
    const t = generatedAtISO ? Date.parse(generatedAtISO) : NaN;
    const now = nowISO ? Date.parse(nowISO) : Date.now();
    if (!isFinite(t)) return { useCache: false, ageMin: null, notice: 'Live numbers — no cache file' };
    const ageMin = Math.round((now - t) / 60000);
    if (ageMin <= max) return { useCache: true, ageMin, notice: '' };
    return { useCache: false, ageMin, notice: 'Live numbers — cache is ' + ageMin + ' min old' };
  }

  /* everything one Recon row needs, in the row's own field names — the one helper the Recon tab's three verdict sites call
     (cache row, saved harvests row, live build). useSavedGap (default true): a row with no income at all keeps the recon_gap an
     earlier run saved, as the cache / saved paths always did; the live path passes false (phase 2 never shows saved figures).
     Switch off ⇒ exactly the old inline maths (tests/spawnfi/recon.test.mjs proves it against rows from the live cache file). */
  function figures(row, useSavedGap){
    row = row || {};
    const coins = Number(row.coins_total || 0);
    const inc = incomeOf(row);
    let gap = inc.total != null ? inc.total - coins
            : (useSavedGap !== false && row.recon_gap != null) ? Number(row.recon_gap) : null;
    const paused = Array.isArray(row.book_inside) && row.book_inside.length > 0 && gap != null;
    const flag = paused ? 'paused' : gap == null ? 'nodata' : Math.abs(gap) <= 20 ? 'ok' : gap > 20 ? 'alert' : 'warn';
    const gap_pct = (coins > 0 && gap != null) ? Math.abs(gap) / coins * 100 : null;
    return { tg_income: inc.tg, cloud_income: inc.cloud, spawnfi_income: inc.spawnfi, total_income: inc.total,
             gap, gap_pct, flag, spawnfi_overlap_days: spawnfiOn() ? Number(row.spawnfi_overlap_days || 0) : 0, sources: inc.sources };
  }

  function chip(source, pesos){
    const c = COLOR[source] || '#6b7280';
    return `<span style="display:inline-block;white-space:nowrap;color:${c};font-weight:700">${esc(LABEL[source] || source)} ${php(pesos)}</span>`;
  }
  /* the income cell: one chip per source present, total when more than one */
  function cell(row){
    const inc = incomeOf(row);
    if (!inc.sources.length) return '<span style="color:#d7dcea;">—</span>';
    const chips = inc.sources.map(s => chip(s, inc[s])).join(' <span style="color:#c7cedb">·</span> ');
    return inc.sources.length > 1
      ? `<div style="font-size:11px;line-height:1.35">${chips}</div><div style="font-weight:800">${php(inc.total)}</div>`
      : `<div style="font-size:11px;line-height:1.35">${chips}</div>`;
  }

  window.spawnIncome = { incomeOf, verdict, figures, cell, cacheDecision, chip, COLOR, LABEL, spawnfiOn };
})();
