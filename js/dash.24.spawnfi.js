/* ── Vendos → SpawnFi tab v2 (2026-11-26): laid out like Spawn Cloud / Telegram vendos — total cards, area + link filters,
   one row per SpawnFi line (router + VLAN) with its vendo, and a line page with every sale and a daily chart.
   Reads only the totals table (gateway v101: v_spawnfi_feed_v2, v_spawnfi_sites_v2, v_spawnfi_daily_v2, v_spawnfi_tx_v2),
   so it opens fast however many sales pile up. Switch spawn_settings.spawnfi_tab_v2 (default off); while off, or while the
   v2 views are not reachable, the 2026-11-19 tab (dash.19) shows as before. Test link: add ?sfi2=1 to the dashboard URL.
   Linking a line to a vendo stays in the vendo card (🔑 Links & keys), which this page opens. ── */
(function(){
  const SB = window.__SPAWN_SB || 'https://cviraqfhphhsonjmrtvu.supabase.co';
  const H = { apikey: 'gw' };
  const TIMEOUT_MS = 20000;
  const v1 = window.spawnfiTabShown;   // the 2026-11-19 tab (dash.19 loads first)
  const S = { sites: null, feed: null, area: 'all', link: 'all', q: '', sort: 'd7', cur: null, tab: 'sales', tx: [], txPage: 1, from: '', to: '', txq: '', seq: 0 };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 });
  const num = n => Number(n || 0).toLocaleString('en-PH');
  const PH = { timeZone: 'Asia/Manila' };
  const tm = t => t ? new Date(t).toLocaleString('en-PH', Object.assign({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }, PH)) : '—';
  const dOnly = t => t ? new Date(t).toLocaleDateString('en-CA', PH) : '';
  const tOnly = t => t ? new Date(t).toLocaleTimeString('en-PH', Object.assign({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }, PH)) : '';
  const ago = t => { if (!t) return 'never'; const m = Math.round((Date.now() - new Date(t)) / 60000); return m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const todayPH = () => new Date().toLocaleDateString('en-CA', PH);
  const addDays = (ymd, n) => { const d = new Date(ymd + 'T00:00:00+08:00'); d.setUTCDate(d.getUTCDate() + n); return d.toLocaleDateString('en-CA', PH); };
  const vname = r => r.sheet_name || r.tg_name || r.owner_name || '';
  const host = () => document.getElementById('spawnfi-root');
  const msg = (t, color) => '<div class="rc" style="padding:20px;' + (color ? 'color:' + color + ';' : '') + '">' + t + '</div>';
  function card(label, val, color, sub){
    return '<div class="stat" style="border-bottom-color:' + (color || '#025AC6') + ';cursor:default"><div class="sl">' + label + '</div>'
      + '<div class="sv" style="color:' + (color || '#025AC6') + '">' + val + '</div>' + (sub ? '<div style="font-size:10px;color:var(--mu)">' + sub + '</div>' : '') + '</div>';
  }
  const chip = (attr, key, label, on) => `<button ${attr}="${esc(key)}" style="padding:4px 10px;border:1px solid ${on ? '#025AC6' : '#dbe3f4'};border-radius:999px;background:${on ? '#025AC6' : '#fff'};color:${on ? '#fff' : '#334155'};font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">${label}</button>`;

  // every read ends in data or an error message: never an endless "Loading…"
  async function q(path){
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(SB + '/rest/v1/' + path, { headers: H, signal: ctl.signal });
      const text = await r.text();
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + text.slice(0, 160));
      const j = text ? JSON.parse(text) : [];
      if (!Array.isArray(j)) throw new Error((j && (j.error || j.message)) || 'unexpected answer');
      return j;
    } catch (e) { throw new Error(e && e.name === 'AbortError' ? 'no answer after ' + TIMEOUT_MS / 1000 + ' s' : (e && e.message) || String(e)); }
    finally { clearTimeout(timer); }
  }

  async function wantV2(){
    if (/[?&]sfi2=1\b/.test(location.search)) return true;
    try { const f = await q('v_spawnfi_feed_v2?select=tab_switch&limit=1'); return !!(f[0] && String(f[0].tab_switch).trim().toLowerCase() === 'on'); }
    catch (_) { return false; }   // views not reachable yet (gateway < v101): keep the old tab
  }

  window.spawnfiTabShown = async function(){
    const el = host(); if (!el) return;
    if (await wantV2()) return load(false);
    try { if (typeof v1 === 'function') await v1(); else el.innerHTML = msg('SpawnFi tab code missing (dash.19).', '#D81E2C'); }
    catch (e) { el.innerHTML = msg('SpawnFi could not be shown: ' + esc(e && e.message || e) + ' · <a href="#" onclick="spawnfiTabShown();return false">try again</a>', '#D81E2C'); }
  };

  async function load(keepPage){
    const el = host(); if (!el) return;
    const my = ++S.seq;
    if (!keepPage) S.cur = null;
    el.innerHTML = msg('Loading SpawnFi…');
    try {
      const [feed, sites] = await Promise.all([ q('v_spawnfi_feed_v2?select=*&limit=1'), q('v_spawnfi_sites_v2?select=*&limit=2000') ]);
      if (my !== S.seq) return;
      S.feed = feed[0] || null; S.sites = sites;
      if (S.cur) { const c = sites.find(r => r.router_name === S.cur.router_name && r.vlan === S.cur.vlan); if (c) { S.cur = c; return openLine(c, true); } }
      renderList();
    } catch (e) {
      if (my !== S.seq) return;
      el.innerHTML = msg('SpawnFi did not load: ' + esc(e.message) + ' · <a href="#" onclick="spawnfiV2Refresh();return false">try again</a>', '#D81E2C');
    }
  }
  window.spawnfiV2Refresh = () => load(true);

  function headBar(){
    const f = S.feed || {};
    const off = String(f.totals_switch || '').toLowerCase() !== 'on';
    const quiet = f.newest_sale && (Date.now() - new Date(f.newest_sale)) > 3 * 3600e3;
    const light = off ? ['#F5A623', 'Totals switch off'] : f.last_error ? ['#D81E2C', 'Feed error'] : quiet ? ['#F5A623', 'Feed quiet'] : ['#0E8A5F', 'Feed live'];
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <span style="font-weight:800;color:#025AC6;font-size:15px">📶 SpawnFi</span>
      <span style="font-size:11px;color:var(--mu)">coin sales from the SpawnFi routers</span>
      <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700"><span style="width:9px;height:9px;border-radius:50%;background:${light[0]};display:inline-block"></span>${light[1]}</span>
      <span style="font-size:11px;color:var(--mu)">newest sale ${esc(tm(f.newest_sale))} (${esc(ago(f.newest_sale))})${f.last_error ? ' · <b style="color:#D81E2C">' + esc(String(f.last_error).slice(0, 80)) + '</b>' : ''}</span>
      <span style="flex:1"></span>
      <button class="btn sm" onclick="spawnfiV2Refresh()">↻ Refresh</button>
    </div>`;
  }

  function filtered(){
    const ql = S.q.trim().toLowerCase();
    const cut3 = addDays(todayPH(), -3);
    return (S.sites || []).filter(r =>
      (S.area === 'all' || r.area === S.area) &&
      (S.link === 'all' || (S.link === 'linked' ? r.link_status === 'linked' : S.link === 'unlinked' ? r.link_status !== 'linked'
        : S.link === 'today' ? Number(r.today_pesos) > 0 : (!r.last_sale || dOnly(r.last_sale) < cut3))) &&
      (!ql || [r.vlan, r.site_name, vname(r), r.tg_name, r.owner_name, r.vendo_code, r.vendo_id].some(x => String(x == null ? '' : x).toLowerCase().includes(ql))));
  }

  function renderList(){
    const el = host(); if (!el) return;
    const all = S.sites || [], f = S.feed || {};
    const sum = k => all.reduce((a, r) => a + Number(r[k] || 0), 0);
    const linked = all.filter(r => r.link_status === 'linked').length;
    const areas = [...new Set(all.map(r => r.area))].sort();
    const cards = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:12px">'
      + card('Today', peso(sum('today_pesos')), '#025AC6', num(sum('today_n')) + ' sales')
      + card('Yesterday', peso(sum('yday_pesos')), '#475569')
      + card('7 days', peso(sum('d7_pesos')), '#0E8A5F')
      + card('30 days', peso(sum('d30_pesos')), '#7c3aed')
      + card('Lines', num(all.length), '#025AC6')
      + card('Linked', num(linked), '#028867')
      + card('Not linked', num(all.length - linked), '#F5A623') + '</div>';
    const rows = filtered();
    const key = { d7: 'd7_pesos', today: 'today_pesos', d30: 'd30_pesos', last: 'last_sale', vlan: 'vlan' }[S.sort] || 'd7_pesos';
    rows.sort((a, b) => key === 'vlan' ? (a.area + a.vlan).localeCompare(b.area + b.vlan, undefined, { numeric: true })
      : key === 'last_sale' ? String(b.last_sale || '').localeCompare(String(a.last_sale || '')) : Number(b[key] || 0) - Number(a[key] || 0));
    const tools = `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
        ${chip('data-sfa', 'all', 'All areas', S.area === 'all')}${areas.map(a => chip('data-sfa', a, esc(a) + ' <span style="opacity:.7">' + all.filter(r => r.area === a).length + '</span>', S.area === a)).join('')}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
        ${[['all', 'All'], ['linked', 'Linked'], ['unlinked', 'Not linked'], ['today', 'Sold today'], ['quiet', 'No sale 3+ days']].map(([k, l]) => chip('data-sfl', k, l, S.link === k)).join('')}
        <span style="flex:1"></span>
        <input id="sfi2-q" type="text" placeholder="🔍 Vendo, VLAN, panel name…" value="${esc(S.q)}" style="padding:5px 10px;border:1px solid var(--bd);border-radius:8px;font-size:12px;min-width:200px;font-family:inherit">
        <select id="sfi2-sort" style="padding:5px 8px;border:1px solid var(--bd);border-radius:8px;font-size:12px;font-family:inherit">
          ${[['d7', 'Sort: 7 days'], ['today', 'Sort: today'], ['d30', 'Sort: 30 days'], ['last', 'Sort: last sale'], ['vlan', 'Sort: area + VLAN']].map(([k, l]) => `<option value="${k}"${S.sort === k ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>`;
    const tbl = `<div class="rc">${num(rows.length)} of ${num(all.length)} lines · ${peso(rows.reduce((a, r) => a + Number(r.d7_pesos || 0), 0))} in 7 days · click a row for its sales</div>
      <div class="tw" style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="text-align:left;color:var(--mu)"><th style="padding:6px 8px">VLAN</th><th>Vendo</th><th>Panel name</th><th>Area</th><th style="text-align:right">Today</th><th style="text-align:right">7 d</th><th style="text-align:right">30 d</th><th>Last sale</th><th>Link</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr data-sfrow="${i}" style="border-top:1px solid var(--bd);cursor:pointer">
        <td style="padding:6px 8px;font-weight:700">${esc(r.vlan)}</td>
        <td style="font-weight:600">${r.link_status === 'linked' ? esc(vname(r) || '#' + r.vendo_id) : '<span style="color:var(--mu)">—</span>'}</td>
        <td title="${esc(r.site_name)}" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mu)">${esc(r.site_name)}</td>
        <td>${esc(r.area)}</td>
        <td style="text-align:right;font-weight:${Number(r.today_pesos) > 0 ? 700 : 400}">${peso(r.today_pesos)}</td>
        <td style="text-align:right">${peso(r.d7_pesos)}</td>
        <td style="text-align:right">${peso(r.d30_pesos)}</td>
        <td style="white-space:nowrap">${esc(tm(r.last_sale))}</td>
        <td>${r.link_status === 'linked' ? '<span class="pill ok">LINKED</span>' : '<span class="pill" style="background:#fff7e6;color:#b45309">NOT LINKED</span>'}</td></tr>`).join('')
        || '<tr><td colspan="9" style="padding:12px;color:var(--mu)">Nothing in this filter.</td></tr>'}</tbody></table></div>`;
    el.innerHTML = '<div style="padding:10px 12px">' + headBar() + cards + tools + tbl + '</div>';
    el.querySelectorAll('[data-sfa]').forEach(b => b.onclick = () => { S.area = b.dataset.sfa; renderList(); });
    el.querySelectorAll('[data-sfl]').forEach(b => b.onclick = () => { S.link = b.dataset.sfl; renderList(); });
    el.querySelectorAll('[data-sfrow]').forEach(tr => tr.onclick = () => openLine(rows[Number(tr.dataset.sfrow)]));
    const qi = el.querySelector('#sfi2-q');
    if (qi) qi.oninput = () => { S.q = qi.value; clearTimeout(S.qt); S.qt = setTimeout(() => { renderList(); const n = host().querySelector('#sfi2-q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
    const so = el.querySelector('#sfi2-sort'); if (so) so.onchange = () => { S.sort = so.value; renderList(); };
  }

  // ── one line's page: cards, Sales (every sale, date range), Daily (last 60 days) ──
  function openLine(r, keepTab){
    S.cur = r; if (!keepTab) { S.tab = 'sales'; S.txPage = 1; S.txq = ''; S.to = todayPH(); S.from = addDays(S.to, -6); }
    const el = host(); if (!el) return;
    const linked = r.link_status === 'linked';
    const title = linked ? (vname(r) || '#' + r.vendo_id) : (r.site_name || 'VLAN ' + r.vlan);
    const sub = [r.area, r.router_name, 'VLAN ' + r.vlan, linked && r.site_name ? 'panel: ' + r.site_name : ''].filter(Boolean).join(' · ');
    const linkLine = linked
      ? `<span class="pill ok">LINKED</span> <span style="font-size:12px">vendo #${esc(r.vendo_id)}${r.tg_name ? ' · TG ' + esc(r.tg_name) : ''}${r.switch_date ? ' · on SpawnFi since ' + esc(r.switch_date) : ''}</span>
         <button class="btn sm" data-sfcard="${esc(r.vendo_id)}">Open vendo card ↗</button>`
      : `<span class="pill" style="background:#fff7e6;color:#b45309">NOT LINKED</span>
         <span style="font-size:12px;color:var(--mu)">${r.suggested_vendo_id ? 'The agent suggests vendo #' + esc(r.suggested_vendo_id) + (r.suggest_grade ? ' (' + esc(r.suggest_grade) + ')' : '') + '. Open it and link this line in 🔑 Links &amp; keys.' : 'Link it from the vendo card (🔑 Links &amp; keys) of the right vendo.'}</span>
         ${r.suggested_vendo_id ? `<button class="btn sm" data-sfcard="${esc(r.suggested_vendo_id)}">Open suggested vendo ↗</button>` : ''}`;
    const cards = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin:10px 0">'
      + card('Today', peso(r.today_pesos), '#025AC6', num(r.today_n) + ' sales')
      + card('Yesterday', peso(r.yday_pesos), '#475569')
      + card('7 days', peso(r.d7_pesos), '#0E8A5F')
      + card('30 days', peso(r.d30_pesos), '#7c3aed')
      + card('All time', peso(r.all_pesos), '#025AC6', num(r.all_n) + ' sales since ' + esc(r.first_day || '—'))
      + card('Last sale', esc(ago(r.last_sale)), Number(r.d7_pesos) > 0 ? '#0E8A5F' : '#D81E2C', esc(tm(r.last_sale))) + '</div>';
    const tabs = `<div class="tab-row">
      <button class="tab-btn${S.tab === 'sales' ? ' active' : ''}" data-sftab="sales">📝 Sales</button>
      <button class="tab-btn${S.tab === 'daily' ? ' active' : ''}" data-sftab="daily">📊 Daily</button></div>
      <div id="sfi2-body">${msg('Loading…')}</div>`;
    el.innerHTML = `<div style="padding:10px 12px">
      <button class="btn sm" id="sfi2-back" style="margin-bottom:10px">← All SpawnFi lines</button>
      <div style="font-size:18px;font-weight:700;color:#1565c0">${esc(title)}</div>
      <div style="font-size:12px;color:var(--mu);margin-top:2px">${esc(sub)}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">${linkLine}</div>
      ${cards}${tabs}</div>`;
    el.querySelector('#sfi2-back').onclick = () => { S.cur = null; renderList(); };
    el.querySelectorAll('[data-sfcard]').forEach(b => b.onclick = () => {
      if (typeof window.htShowVendoProfile === 'function') window.htShowVendoProfile(linked ? vname(r) : '', linked ? r.vendo_area : '', 'info', Number(b.dataset.sfcard));
    });
    el.querySelectorAll('[data-sftab]').forEach(b => b.onclick = () => { S.tab = b.dataset.sftab; openLine(r, true); });
    return S.tab === 'daily' ? loadDaily(r) : loadSales(r);
  }

  const lineFilter = r => 'router_name=eq.' + encodeURIComponent(r.router_name) + '&vlan=eq.' + encodeURIComponent(r.vlan);
  const body = () => document.getElementById('sfi2-body');

  async function loadSales(r){
    const my = ++S.seq;
    const b = body(); if (!b) return;
    b.innerHTML = msg('Loading sales…');
    try {
      const from = new Date(S.from + 'T00:00:00+08:00').toISOString(), to = new Date(addDays(S.to, 1) + 'T00:00:00+08:00').toISOString();
      const rows = await q('v_spawnfi_tx_v2?select=sold_at,amount,kind,validity_min,lane,sale_source,client_mac,client_ip&' + lineFilter(r)
        + '&sold_at=gte.' + encodeURIComponent(from) + '&sold_at=lt.' + encodeURIComponent(to) + '&order=sold_at.desc&limit=1000');
      if (my !== S.seq || S.cur !== r) return;
      S.tx = rows; renderSales(rows.length >= 1000);
    } catch (e) { if (my === S.seq && body()) body().innerHTML = msg('Sales did not load: ' + esc(e.message), '#D81E2C'); }
  }

  function renderSales(capped){
    const b = body(); if (!b) return;
    const ql = S.txq.trim().toLowerCase();
    const rows = S.tx.filter(t => !ql || [t.client_mac, t.client_ip, t.amount, t.kind, t.lane].some(x => String(x == null ? '' : x).toLowerCase().includes(ql)));
    const PER = 100, pages = Math.max(1, Math.ceil(rows.length / PER)); S.txPage = Math.min(S.txPage, pages);
    const page = rows.slice((S.txPage - 1) * PER, S.txPage * PER);
    const tot = rows.reduce((a, t) => a + Number(t.amount || 0), 0);
    b.innerHTML = `<div class="tb" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0">
        <input type="text" id="sfi2-txq" placeholder="🔍 MAC, IP, amount…" value="${esc(S.txq)}" style="padding:5px 10px;border:1px solid var(--bd);border-radius:8px;font-size:12px;font-family:inherit">
        <span style="font-size:12px;color:var(--mu)">From:</span><input type="date" id="sfi2-from" value="${esc(S.from)}" max="${esc(todayPH())}">
        <span style="font-size:12px;color:var(--mu)">To:</span><input type="date" id="sfi2-to" value="${esc(S.to)}" max="${esc(todayPH())}">
        ${[['Today', 0], ['7 days', 6], ['30 days', 29]].map(([l, n]) => `<button class="btn sm" data-sfrange="${n}">${l}</button>`).join('')}
      </div>
      <div class="rc">${num(rows.length)} sales · ${peso(tot)}${capped ? ' · showing the newest 1,000: pick fewer days to see the rest' : ''}</div>
      <div class="tw" style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="text-align:left;color:var(--mu)"><th style="padding:6px 8px">#</th><th>Date</th><th>Time</th><th style="text-align:right">Amount</th><th>Kind</th><th>Time bought</th><th>MAC</th><th>IP</th></tr></thead>
        <tbody>${page.map((t, i) => `<tr style="border-top:1px solid var(--bd)">
          <td style="padding:5px 8px;color:var(--mu)">${(S.txPage - 1) * PER + i + 1}</td><td>${esc(dOnly(t.sold_at))}</td><td>${esc(tOnly(t.sold_at))}</td>
          <td style="text-align:right;font-weight:700">${peso(t.amount)}</td><td>${esc(t.kind || t.lane || '')}</td>
          <td>${t.validity_min != null ? esc(t.validity_min >= 60 ? (t.validity_min / 60).toFixed(t.validity_min % 60 ? 1 : 0) + ' h' : t.validity_min + ' min') : ''}</td>
          <td style="font-family:monospace;font-size:11px">${esc(t.client_mac)}</td><td style="font-family:monospace;font-size:11px">${esc(t.client_ip)}</td></tr>`).join('')
          || '<tr><td colspan="8" style="padding:12px;color:var(--mu)">No sales in these dates.</td></tr>'}</tbody></table></div>
      <div class="pg"><button id="sfi2-pp"${S.txPage <= 1 ? ' disabled' : ''}>← Prev</button><span>Page ${S.txPage} of ${pages}</span><button id="sfi2-pn"${S.txPage >= pages ? ' disabled' : ''}>Next →</button></div>`;
    const r = S.cur;
    const ti = b.querySelector('#sfi2-txq');
    ti.oninput = () => { S.txq = ti.value; S.txPage = 1; clearTimeout(S.tq); S.tq = setTimeout(() => { renderSales(capped); const n = document.getElementById('sfi2-txq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
    b.querySelector('#sfi2-from').onchange = e => { if (e.target.value) { S.from = e.target.value; if (S.from > S.to) S.to = S.from; S.txPage = 1; loadSales(r); } };
    b.querySelector('#sfi2-to').onchange = e => { if (e.target.value) { S.to = e.target.value; if (S.to < S.from) S.from = S.to; S.txPage = 1; loadSales(r); } };
    b.querySelectorAll('[data-sfrange]').forEach(x => x.onclick = () => { S.to = todayPH(); S.from = addDays(S.to, -Number(x.dataset.sfrange)); S.txPage = 1; loadSales(r); });
    b.querySelector('#sfi2-pp').onclick = () => { S.txPage--; renderSales(capped); };
    b.querySelector('#sfi2-pn').onclick = () => { S.txPage++; renderSales(capped); };
  }

  async function loadDaily(r){
    const my = ++S.seq;
    const b = body(); if (!b) return;
    b.innerHTML = msg('Loading days…');
    try {
      const from = addDays(todayPH(), -59);
      const rows = await q('v_spawnfi_daily_v2?select=day,pesos,n,last_sale&' + lineFilter(r) + '&day=gte.' + from + '&order=day.desc&limit=100');
      if (my !== S.seq || S.cur !== r) return;
      const byDay = new Map(rows.map(x => [x.day, x]));
      const days = []; for (let i = 0; i < 60; i++) days.push(addDays(todayPH(), -i));
      const max = Math.max(1, ...rows.map(x => Number(x.pesos || 0)));
      const tot = rows.reduce((a, x) => a + Number(x.pesos || 0), 0), sold = rows.filter(x => Number(x.n) > 0).length;
      b.innerHTML = `<div class="rc" style="margin-top:8px">Last 60 days · ${peso(tot)} · sales on ${sold} of 60 days · average ${peso(tot / 60)} a day</div>
        <div class="tw" style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="text-align:left;color:var(--mu)"><th style="padding:5px 8px">Day</th><th style="text-align:right">Sales</th><th style="text-align:right">Pesos</th><th style="width:50%"></th></tr></thead>
        <tbody>${days.map(d => { const x = byDay.get(d) || { pesos: 0, n: 0 }; const w = Math.round(Number(x.pesos || 0) / max * 100);
          const wd = new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-PH', Object.assign({ weekday: 'short' }, PH));
          return `<tr style="border-top:1px solid var(--bd)"><td style="padding:4px 8px;white-space:nowrap">${esc(d)} <span style="color:var(--mu)">${esc(wd)}</span></td>
            <td style="text-align:right">${num(x.n)}</td><td style="text-align:right;font-weight:${Number(x.pesos) > 0 ? 700 : 400};color:${Number(x.pesos) > 0 ? 'inherit' : '#D81E2C'}">${peso(x.pesos)}</td>
            <td><div style="height:10px;border-radius:5px;background:#025AC6;width:${w}%;min-width:${w ? 2 : 0}px"></div></td></tr>`; }).join('')}</tbody></table></div>`;
    } catch (e) { if (my === S.seq && body()) body().innerHTML = msg('Days did not load: ' + esc(e.message), '#D81E2C'); }
  }
})();
