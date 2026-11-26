/* ⚡ SpawnFi vendo page (2026-11-27, SpawnFi everywhere). The same tiles as the Cloud device page, for a vendo whose coins come
   through SpawnFi: Total sales · Sessions · Avg/session · Biggest · Coin drops · Time sold, then TG / SpawnFi / Cloud income since the
   last harvest, Expected in box, Open since; a Daily table (bar per day) and a Sessions table (coins within 2 min from the same phone
   count as one session, as on the Cloud page). Reads v_spawnfi_vendo_daily_v1, v_spawnfi_vendo_sessions_v1, v_vendo_income_sources_v1
   (gateway v92). Switch spawn_settings.hq_vendo_page_spawnfi: off → openVendoById opens today's page for TG vendos and says the SpawnFi
   page is off for SpawnFi-only ones. window.openVendoById(id) is the one entry for every caller that knows the vendo's id.
   Spec: brain docs/superpowers/specs/2026-11-26-spawnfi-everywhere-design.md §7.2 */
(function(){
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 });
  const SBU = () => window.SB_URL || window.__SPAWN_SB || 'https://cviraqfhphhsonjmrtvu.supabase.co';
  const enabled = () => !!(window.__hqSwitches && String(window.__hqSwitches.hq_vendo_page_spawnfi || '').trim().toLowerCase() === 'on');
  const dOnly = iso => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); } catch (_) { return ''; } };
  const tOnly = iso => { try { return new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }); } catch (_) { return ''; } };
  const card = (label, val, color) => `<div class="stat" style="border-bottom-color:${color || '#025AC6'}"><div class="sl">${label}</div><div class="sv" style="color:${color || '#025AC6'}">${val}</div></div>`;

  /* ── pure parts (tests/spawnfi/page.test.mjs) ── */
  /* sales [{sold_at, amount, client_mac}] (any order) → sessions [{start, end, amount, n, mac}], oldest first.
     Same MAC within 2 minutes of the previous coin = same session; no MAC = its own session. */
  function sessionsOf(sales){
    const rows = (Array.isArray(sales) ? sales : []).map(s => ({ ...s, t: Date.parse(s.sold_at) })).filter(s => isFinite(s.t)).sort((a, b) => a.t - b.t);
    const out = [], last = {};   // mac → open session
    for (const s of rows) {
      const mac = s.client_mac || null;
      const cur = mac ? last[mac] : null;
      if (cur && s.t - cur.t <= 120000) { cur.end = s.sold_at; cur.t = s.t; cur.amount += Number(s.amount || 0); cur.n++; continue; }
      const ses = { start: s.sold_at, end: s.sold_at, amount: Number(s.amount || 0), n: 1, mac, t: s.t };
      out.push(ses); if (mac) last[mac] = ses;
    }
    return out.map(({ t, ...rest }) => rest);
  }
  /* daily = rows of v_spawnfi_vendo_daily_v1, sessions = sessionsOf(...) (for the 90-day list), sources = the vendo's row of
     v_vendo_income_sources_v1 or null. timeSold stays '—': SpawnFi sales carry no minutes today (validity_min is empty). */
  function tilesOf(daily, sessions, sources){
    daily = Array.isArray(daily) ? daily : [];
    const total = daily.reduce((a, d) => a + Number(d.pesos || 0), 0);
    const drops = daily.reduce((a, d) => a + Number(d.sales || 0), 0);
    const nSes = daily.reduce((a, d) => a + Number(d.sessions || 0), 0);
    const biggest = daily.reduce((a, d) => Math.max(a, Number(d.biggest || 0)), 0);
    const since = sources && sources.last_harvest_date ? String(sources.last_harvest_date).slice(0, 10) : null;
    return { total, sessions: nSes, avg: nSes ? Math.round(total / nSes) : 0, biggest, drops, timeSold: '—',
             expected: sources && sources.expected_in_box != null ? Number(sources.expected_in_box) : null, since,
             daysOpen: since ? Math.max(0, Math.round((Date.now() - Date.parse(since + 'T00:00:00+08:00')) / 86400000)) : null };
  }

  /* ── data ── */
  async function getJson(path){
    const r = await fetch(`${SBU()}/rest/v1/${path}`, { headers: Object.assign({}, window.HDR || {}) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  const VSEL = 'id,sheet_name,tg_name,owner_name,area,vlan,vendo_code,last_harvest_date,status';
  async function sourcesOf(id){ try { const r = await getJson(`v_vendo_income_sources_v1?vendo_id=eq.${Number(id)}&select=*&limit=1`); return r[0] || null; } catch (_) { return null; } }

  /* ── the block (tiles + Daily / Sessions) ── */
  const S = { id: null, tab: 'daily', sessions: [], raw: [], offset: 0, more: true, daily: [], src: null };
  function dailyTable(){
    const days = S.daily.slice().sort((a, b) => String(b.day).localeCompare(String(a.day)));
    if (!days.length) return '<div class="rc" style="padding:16px">No SpawnFi sales yet for this vendo.</div>';
    const mx = days.reduce((a, d) => Math.max(a, Number(d.pesos || 0)), 0);
    return `<div class="tw"><table><thead><tr><th>Date</th><th>Daily take</th><th style="text-align:right">Amount</th><th style="text-align:right">Sessions</th><th style="text-align:right">Coins</th><th>Source</th></tr></thead><tbody>`
      + days.map(d => { const w = mx ? Math.round(Number(d.pesos || 0) / mx * 100) : 0;
        return `<tr><td>${esc(String(d.day).slice(0, 10))}</td><td style="width:40%"><div style="background:#eef2fb;border-radius:4px;height:14px;overflow:hidden"><div style="width:${w}%;height:100%;background:#311A8E"></div></div></td>
          <td style="text-align:right;font-weight:700">${peso(d.pesos)}</td><td style="text-align:right;color:var(--mu)">${Number(d.sessions || 0)}</td><td style="text-align:right;color:var(--mu)">${Number(d.sales || 0)}</td>
          <td>${window.spawnIncome ? window.spawnIncome.chip('spawnfi', d.pesos) : '⚡ SpawnFi'}${Number(d.lines) > 1 ? ` <span style="color:var(--mu);font-size:10px">${Number(d.lines)} lines</span>` : ''}</td></tr>`; }).join('')
      + '</tbody></table></div>';
  }
  function sessionsTable(){
    const ses = S.sessions.slice().reverse();   // newest first
    if (!ses.length) return '<div class="rc" style="padding:16px">No sessions in the last 90 days.</div>';
    const lineOf = s => { const r = S.raw.find(x => x.sold_at === s.start); return r ? (r.site_name || (r.router_name + ' · VLAN ' + r.vlan)) : ''; };
    return `<div class="tw"><table><thead><tr><th>Date</th><th>Time</th><th>Amount</th><th>MAC</th><th style="text-align:center">Coins</th><th>Source</th></tr></thead><tbody>`
      + ses.map(s => `<tr><td>${esc(dOnly(s.start))}</td><td style="color:var(--mu)">${esc(tOnly(s.start))}${s.n > 1 ? ' – ' + esc(tOnly(s.end)) : ''}</td><td style="font-weight:700">${peso(s.amount)}</td>
          <td style="font-family:ui-monospace,monospace;font-size:11px;color:var(--mu)">${esc(s.mac || '—')}</td><td style="text-align:center">${s.n}</td>
          <td title="${esc(lineOf(s))}">${window.spawnIncome ? window.spawnIncome.chip('spawnfi', s.amount) : '⚡ SpawnFi'} <span style="color:var(--mu);font-size:10px">${esc(lineOf(s)).slice(0, 28)}</span></td></tr>`).join('')
      + '</tbody></table></div>'
      + (S.more ? '<div style="text-align:center;padding:10px"><button class="btn sm" onclick="window.spawnfiPage.more()">Load more sessions</button></div>' : '');
  }
  function paintTab(){
    const el = document.getElementById('sfp-tabbody'); if (!el) return;
    el.innerHTML = S.tab === 'daily' ? dailyTable() : sessionsTable();
  }
  function tab(t, btn){
    S.tab = t;
    const row = btn && btn.parentNode; if (row) row.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    paintTab();
  }
  async function more(){
    try {
      const rows = await getJson(`v_spawnfi_vendo_sessions_v1?vendo_id=eq.${Number(S.id)}&select=sold_at,amount,client_mac,router_name,vlan,site_name&order=sold_at.desc&limit=200&offset=${S.offset}`);
      S.offset += rows.length; S.more = rows.length === 200; S.raw = S.raw.concat(rows); S.sessions = sessionsOf(S.raw); paintTab();
    } catch (e) { if (typeof window.toast === 'function') window.toast('Could not load more: ' + e.message); }
  }
  function linesHtml(src){
    const lines = src && Array.isArray(src.spawnfi_lines) ? src.spawnfi_lines : [];
    const L = window.spawnLink;
    return lines.map(l => `<span style="display:inline-flex;gap:6px;align-items:center;font-size:12px;background:#f8f7ff;border:1px solid #e4e0f7;border-radius:8px;padding:3px 8px">
        <b style="color:#311A8E">⚡ ${esc(l.site || ('VLAN ' + l.vlan))}</b><span style="color:var(--mu)">${esc(l.router)} · VLAN ${Number(l.vlan)}${l.switch_date ? ' · from ' + esc(l.switch_date) : ''}</span>
        ${L ? L.button('Change ›', { router: l.router, vlan: l.vlan, site_name: l.site, from: 'page' }) : ''}</span>`).join(' ');
  }
  /* render the SpawnFi block for vendo id into host (tiles go to statsEl when given, as on the TG page) */
  async function render(id, host, statsEl){
    if (!host) return;
    S.id = id; S.tab = 'daily'; S.offset = 0; S.more = true; S.raw = []; S.sessions = []; S.daily = [];
    host.innerHTML = '<div class="rc" style="padding:16px">Loading SpawnFi sales…</div>';
    const [daily, ses, src] = await Promise.all([
      getJson(`v_spawnfi_vendo_daily_v1?vendo_id=eq.${Number(id)}&select=*&order=day.desc&limit=60`).catch(() => null),
      getJson(`v_spawnfi_vendo_sessions_v1?vendo_id=eq.${Number(id)}&select=sold_at,amount,client_mac,router_name,vlan,site_name&order=sold_at.desc&limit=200`).catch(() => null),
      sourcesOf(id),
    ]);
    if (S.id !== id) return;
    if (daily === null && ses === null) { host.innerHTML = '<div class="rc" style="padding:16px;color:var(--red)">SpawnFi tables not reachable (needs gateway v92 and the SpawnFi migration).</div>'; return; }
    S.daily = daily || []; S.raw = ses || []; S.offset = S.raw.length; S.more = S.raw.length === 200; S.sessions = sessionsOf(S.raw); S.src = src;
    const t = tilesOf(S.daily, S.sessions, src);
    const tiles = '<div class="stats">'
      + card('Total sales (60 d)', peso(t.total), '#025AC6') + card('Sessions', t.sessions.toLocaleString(), '#311A8E') + card('Avg/session', peso(t.avg), '#FFB725')
      + card('Biggest', peso(t.biggest), '#028867') + card('Coin drops', t.drops.toLocaleString(), '#311A8E') + card('Time sold', t.timeSold, '#C01176') + '</div>'
      + (src ? '<div class="stats">'
          + card('TG income', src.has_tg ? peso(src.expected_tg) : '—', '#025AC6') + card('⚡ SpawnFi income', peso(src.expected_spawnfi), '#311A8E')
          + card('Cloud income', src.has_cloud ? peso(src.expected_cloud) : '—', '#028867') + card('Expected in box', t.expected != null ? peso(t.expected) : '—', '#b45309')
          + card('Open since', t.since ? esc(t.since) + ' (' + t.daysOpen + 'd)' : 'never harvested', '#DF1A35') + '</div>'
          + '<div class="rc" style="margin-top:-4px;font-style:italic">income tiles count sales since the last harvest; TOTAL in the box = TG + Cloud + SpawnFi</div>'
        : '');
    if (statsEl) statsEl.innerHTML = tiles;
    host.innerHTML = (statsEl ? '' : tiles)
      + `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0 10px">${linesHtml(src) || '<span class="rc">no SpawnFi line linked</span>'}</div>`
      + '<div class="tab-row"><button class="tab-btn active" onclick="window.spawnfiPage.tab(\'daily\',this)">📈 Daily</button><button class="tab-btn" onclick="window.spawnfiPage.tab(\'sessions\',this)">📝 Sessions</button></div>'
      + '<div class="rc" style="font-style:italic">coins within 2 min from the same phone count as one session · last 60 days / 90 days of sessions</div>'
      + '<div id="sfp-tabbody"></div>';
    paintTab();
  }

  /* ── the one entry for callers that know the vendo id ── */
  async function openVendoById(id){
    if (id == null) return false;
    let v = null;
    try { const r = await getJson(`vendos?id=eq.${Number(id)}&select=${VSEL}&limit=1`); v = r[0] || null; } catch (_) {}
    if (!v) { if (typeof window.toast === 'function') window.toast('Vendo #' + id + ' not found'); return false; }
    const name = v.sheet_name || v.tg_name || v.owner_name || ('#' + v.id);
    const src = enabled() ? await sourcesOf(v.id) : null;
    const btn = document.getElementById('vt-spawnfi-btn');
    const hasTg = !!v.tg_name;
    if (hasTg && typeof window.openVendoDetail === 'function') {
      // today's page (Telegram transactions), plus the SpawnFi tab when the vendo also has SpawnFi lines
      if (btn) btn.style.display = 'none';
      await window.openVendoDetail(v.tg_name, v.area || '');
      if (src && src.has_spawnfi && btn) { btn.style.display = ''; render(v.id, document.getElementById('vt-spawnfi-content')); }
      return true;
    }
    if (!enabled()) {
      if (typeof window.toast === 'function') window.toast('SpawnFi page is off (switch hq_vendo_page_spawnfi)');
      if (typeof window.openVendoDetail === 'function') await window.openVendoDetail(name, v.area || '');
      return true;
    }
    // SpawnFi-only vendo: the detail view, with the SpawnFi tab in front. First drop the previous vendo's state in dash.4
    // (its pending downloads, currentVendo for the Harvest tab, the Monthly chart) so nothing of it can land under this name.
    if (typeof window.vtResetForExternal === 'function') window.vtResetForExternal();
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-bar button').forEach(b => b.classList.remove('active'));
    const pv = document.getElementById('panel-vendos'); if (pv) pv.classList.add('active');
    const nb = document.querySelector('.nav-bar button[data-panel="vendos"]'); if (nb) nb.classList.add('active');
    const vl = document.getElementById('view-vlist'), vt = document.getElementById('view-vtxns');
    if (vl) vl.style.display = 'none'; if (vt) vt.style.display = 'block';
    const title = document.getElementById('vtxn-title'), sub = document.getElementById('vtxn-sub'), stats = document.getElementById('vtxn-stats');
    if (title) title.textContent = name;
    if (sub) sub.textContent = (v.area || '—') + ' area · ⚡ SpawnFi vendo' + (v.vendo_code ? ' · ' + v.vendo_code : '') + ' · no Telegram name';
    ['vtxn-tbody', 'sus-list', 'vt-harvest-content'].forEach(i => { const e = document.getElementById(i); if (e) e.innerHTML = ''; });
    const rc = document.getElementById('vtxn-rc'); if (rc) rc.innerHTML = '<span>This vendo reports through SpawnFi — see the ⚡ SpawnFi tab</span>';
    if (btn) btn.style.display = '';
    if (typeof window.showVTab === 'function') window.showVTab('spawnfi', btn);
    if (typeof window.showBread === 'function' && typeof window.closeVendo === 'function') window.showBread('Vendos → ' + name, window.closeVendo);
    render(v.id, document.getElementById('vt-spawnfi-content'), stats);
    return true;
  }

  /* the "open the vendo page" buttons (Recon 📄, SpawnFi tab vendo link) follow the same switch as the page itself */
  const showOpenButtons = enabled;
  window.spawnfiPage = { sessionsOf, tilesOf, render, tab, more, enabled, showOpenButtons };
  window.openVendoById = openVendoById;
})();
