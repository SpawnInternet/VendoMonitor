/* ✔ Payments check — the subscriber book inside Vendo Monitor, with ONE answer per paid month: was this reference actually received?
   (2026-11-14; Wendell: "the auto sheet layout, put it in Vendo Monitor instead… I only use this"; "simple, accurate, spot the problem
   without overloading the screen"). Same layout as the SPAWN Subscribers (Auto) sheet: name column frozen, one block per month with
   Date paid · Amount · OR / Ref · Received by · Comment, same colours, the reason on hover, a tap on the name opens the subscriber.
   Reads v_pay_check_v2 (the check from ALL sources: book ref, Spawn Collect, FB receipts, texted refs, shared sends; falls back to v1) and
   v_pay_day_v1 (per exported day: GCash in, unclaimed, recorded, received, NOT received) through the admin gateway. Five words only:
   Received · NOT received · To check · No exported file · No OR / ref; cash ORs blank. Default = only the subscribers with a problem. Read-only. */
(function(){
  const SB = () => window.__SPAWN_SB || 'https://cviraqfhphhsonjmrtvu.supabase.co';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 });
  const d10 = d => String(d || '').slice(0, 10);
  const mdy = d => d ? new Date(d10(d) + 'T12:00:00').toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'2-digit' }) : '';
  const dayL = d => d ? new Date(d10(d) + 'T12:00:00').toLocaleDateString('en-PH', { weekday:'short', month:'short', day:'numeric' }) : '';
  const monL = ym => new Date(d10(ym) + 'T12:00:00').toLocaleDateString('en-PH', { month:'long', year:'numeric' });
  const monS = ym => new Date(d10(ym) + 'T12:00:00').toLocaleDateString('en-PH', { month:'short', year:'2-digit' });
  // the five words and their colours (same as the sheet)
  // cell colours by the word's first letters (2026-11-14: 'To check' is gone — Received keeps its observation on the cell; ref problems say what they are)
  const cellColor = w => /^Received —/.test(w) ? ['#eef7f0','#166534'] : /^Received/.test(w) ? ['#e6f4ea','#15803d'] : /^NOT received/.test(w) ? ['#fde2e1','#b91c1c']
    : /^No exported file/.test(w) ? ['#eceff1','#475569'] : w ? ['#fff4d6','#92400e'] : ['', '#374151'];
  const S = { rows:null, err:'', days:null, dayErr:'', names:null, months:[], month:'', area:'', q:'', onlyProblems:true, day:'', src:'v2' };
  const body = () => document.getElementById('st-body');

  async function get(path){   // through the gateway (apikey 'gw' is rewritten by dash.0.core.js); pages past 1,000 rows
    const out = [];
    for (let off = 0; off < 30000; off += 1000) {
      const r = await fetch(`${SB()}/rest/v1/${path}&limit=1000&offset=${off}`, { headers:{ apikey:'gw' } });
      if (!r.ok) { const t = await r.text(); const e = new Error(/not allowed/i.test(t) ? 'the gateway does not allow this view yet' : 'error ' + r.status); e.status = r.status; e.notAllowed = /not allowed/i.test(t); throw e; }
      const j = await r.json(); if (!Array.isArray(j)) throw new Error('unexpected answer');
      out.push(...j); if (j.length < 1000) break;
    }
    return out;
  }
  const SEL = '*';   // v2 adds note and refreshed_at over time; v1 lacks them — take whatever the view has
  // 2026-11-14 (speed): keep the last answer in this tab's sessionStorage for 5 minutes — coming back to the book is instant; ↻ forces a reload
  const CK = 'vm_pck_cache', TTL = 5 * 60e3;
  function cacheGet(){ try { const j = JSON.parse(sessionStorage.getItem(CK) || 'null'); if (j && Date.now() - j.t < TTL) return j; } catch (e) {} return null; }
  function cachePut(){ try { sessionStorage.setItem(CK, JSON.stringify({ t: Date.now(), rows: S.rows, names: S.names, days: S.days, src: S.src })); } catch (e) {} }
  async function load(force){
    const c = !force && cacheGet();
    if (c) { S.rows = c.rows; S.names = c.names; S.days = c.days; S.src = c.src; S.err = ''; S.months = [...new Set(S.rows.map(r => d10(r.ym)))].sort(); if (!S.month || !S.months.includes(S.month)) S.month = S.months[S.months.length - 1] || ''; draw(); return; }
    S.err = ''; S.rows = null; S.days = null; draw();
    const from = new Date(); from.setMonth(from.getMonth() - 5, 1);
    const ym0 = from.toLocaleDateString('en-CA').slice(0, 7) + '-01';
    const q = `ym=gte.${ym0}&select=${SEL}&order=ym.asc,paid_date.asc`;
    try {
      let rows;
      try { rows = await get(`v_pay_check_v2?${q}`); S.src = 'v2'; }
      catch (e) { if (!e.notAllowed) throw e; rows = await get(`v_pay_check_v1?${q.replace(',gcash_ref,gcash_amount,gcash_at', ',gcash_ref,gcash_amount,gcash_at')}`); S.src = 'v1'; }
      S.rows = rows.filter(r => Number(r.amount) > 0);
      S.months = [...new Set(S.rows.map(r => d10(r.ym)))].sort();
      if (!S.month || !S.months.includes(S.month)) S.month = S.months[S.months.length - 1] || '';
    } catch (e) { S.err = e.message || 'error'; }
    try { const nm = await get('v_sub_book?select=id,name,area,acct_no,status'); S.names = {}; nm.forEach(x => { S.names[x.id] = x; }); } catch (e) { S.names = S.names || {}; }
    draw();
    try { const since = new Date(Date.now() - 21 * 86400000).toLocaleDateString('en-CA'); S.days = await get(`v_pay_day_v1?day=gte.${since}&select=*&order=day.desc`); }
    catch (e) { S.days = null; S.dayErr = e.message || 'error'; }
    draw();
    if (S.rows && !S.err) cachePut();
  }
  function counts(list){
    const c = { ok:0, no:0, check:0, wait:0, cash:0, n:0, noAmt:0, noted:0 };
    list.forEach(r => { if (!r.state) return; c[r.state] = (c[r.state] || 0) + 1; c.n++; if (r.state === 'no') c.noAmt += Number(r.amount || 0); if (r.note || /^Received —/.test(r.label || '')) c.noted++; });
    return c;
  }
  function css(){
    if (document.getElementById('pck-style')) return;
    const s = document.createElement('style'); s.id = 'pck-style';
    s.textContent = `
      .pck-tiles{display:flex;gap:8px;flex-wrap:wrap;padding:10px 14px}
      .pck-tile{background:#fff;border:1px solid #e5e7eb;border-bottom:3px solid var(--c);border-radius:12px;padding:8px 12px;min-width:104px;flex:1}
      .pck-tile b{display:block;font-size:20px;font-weight:800;color:var(--c);font-variant-numeric:tabular-nums}
      .pck-tile span{font-size:11px;color:#6b7280;line-height:1.3;display:block}
      .pck-days{display:flex;gap:6px;overflow-x:auto;padding:8px 14px 12px;scrollbar-width:thin}
      .pck-day{flex:0 0 auto;border:1px solid #e5e7eb;border-radius:10px;padding:6px 9px;background:#fff;font-size:11px;line-height:1.45;cursor:pointer;min-width:108px}
      .pck-day.on{outline:2px solid #025ac6}
      .pck-day b{display:block;font-size:11.5px;color:#0f2a5c}
      .pck-day .no{color:#b91c1c;font-weight:700}.pck-day .un{color:#92400e;font-weight:700}.pck-day .ok{color:#15803d}
      .pck-f{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 14px;border-bottom:1px solid #eef0f4}
      .pck-f select,.pck-f input{padding:6px 9px;border:1.5px solid #e5e7eb;border-radius:9px;font:inherit;font-size:12.5px;background:#fff}
      .pck-f button{padding:6px 11px;border-radius:999px;border:1px solid #e5e7eb;background:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;color:#374151}
      .pck-f button.on{border-color:#025ac6;background:#e0ecff;color:#0146a0}
      .pck-wrap{overflow:auto;max-height:72vh;position:relative}
      .pck-grid{border-collapse:separate;border-spacing:0;font-size:12px;white-space:nowrap}
      .pck-grid th,.pck-grid td{border-right:1px solid #e5e7eb;border-bottom:1px solid #eef0f4;padding:4px 7px;background:#fff}
      .pck-grid thead th{position:sticky;top:0;z-index:2;background:#2d3547;color:#fff;font-weight:700;text-align:center}
      .pck-grid thead tr:nth-child(2) th{top:27px;background:#e3e8f0;color:#2d3547;font-size:11px}
      .pck-grid th.nm,.pck-grid td.nm{position:sticky;left:0;z-index:3;text-align:left;min-width:210px;max-width:260px;overflow:hidden;text-overflow:ellipsis;border-right:2px solid #2d3547}
      .pck-grid thead th.nm{z-index:4}
      .pck-grid td.nm a{color:#0146a0;font-weight:700;text-decoration:none}
      .pck-grid td.n{text-align:right;font-variant-numeric:tabular-nums}
      .pck-grid td.mend{border-right:2px solid #2d3547}
      .pck-grid td.c{font-weight:700;text-align:center;min-width:112px}
      .pck-grid tr.cut td{background:#c9e7c3;color:#1e5631}
      .pck-grid td.ref{font-variant-numeric:tabular-nums;min-width:100px}
      .pck-grid td.by{min-width:88px;color:#374151}
      .pck-grid td.dt{min-width:64px}`;
    document.head.appendChild(s);
  }
  function draw(){
    const b = body(); if (!b) return; css();
    if (S.rows === null && !S.err) { b.innerHTML = '<div class="sc-empty">Loading the book…</div>'; return; }
    if (S.err) { b.innerHTML = `<div class="sc-empty">📒 The payments check is not connected to Vendo Monitor yet (${esc(S.err)}).</div>`; return; }
    const nm = S.names || {};
    const fresh = (S.rows.find(r => r.refreshed_at) || {}).refreshed_at;
    const inMonth = S.rows.filter(r => d10(r.ym) === S.month), c = counts(inMonth);
    const tile = (l, v, col, sub) => `<div class="pck-tile" style="--c:${col}"><b>${v}</b><span>${l}${sub ? '<br>' + sub : ''}</span></div>`;
    // per exported day (last 21 days); a tap filters the book to the months paid that day
    const days = S.days === null ? `<div class="lv-none" style="padding:4px 14px 10px">${S.dayErr ? 'Per-day summary not connected yet (' + esc(S.dayErr) + ').' : 'Loading the days…'}</div>`
      : !S.days.length ? '<div class="lv-none" style="padding:4px 14px 10px">No exported day in the last 3 weeks.</div>'
      : `<div class="pck-days">${S.days.map(d => `<div class="pck-day${S.day === d10(d.day) ? ' on' : ''}" data-day="${d10(d.day)}"><b>${esc(dayL(d.day))}</b>
           GCash in <b style="display:inline;color:#0f2a5c">${d.gcash_in}</b> · ${peso(d.gcash_in_pesos)}<br>
           recorded ${d.recorded} · <span class="ok">received ${d.received}</span><br>
           ${Number(d.not_received) ? `<span class="no">NOT received ${d.not_received}</span>` : '<span style="color:#9ca3af">NOT received 0</span>'} · ${Number(d.unclaimed) ? `<span class="un">unclaimed ${d.unclaimed} · ${peso(d.unclaimed_pesos)}</span>` : '<span style="color:#9ca3af">unclaimed 0</span>'}</div>`).join('')}</div>`;
    // the book: one row per subscriber, one block per month
    const byId = {}; S.rows.forEach(r => { (byId[r.subscriber_id] = byId[r.subscriber_id] || {})[d10(r.ym)] = r; });
    const q = S.q.trim().toLowerCase();
    let ids = Object.keys(byId).map(Number);
    if (S.area) ids = ids.filter(id => (nm[id] && nm[id].area || '—') === S.area);
    if (S.day) ids = ids.filter(id => Object.values(byId[id]).some(r => d10(r.paid_date) === S.day));
    else if (S.onlyProblems) ids = ids.filter(id => Object.values(byId[id]).some(r => r.state === 'no' || r.state === 'check'));
    if (q) ids = ids.filter(id => [nm[id] && nm[id].name, nm[id] && nm[id].acct_no].concat(Object.values(byId[id]).map(r => r.or_no)).some(v => String(v || '').toLowerCase().includes(q)));
    ids.sort((a, b2) => String(nm[a] && nm[a].area || 'zz').localeCompare(String(nm[b2] && nm[b2].area || 'zz')) || String(nm[a] && nm[a].name || '').localeCompare(String(nm[b2] && nm[b2].name || '')));
    const areas = [...new Set(Object.keys(byId).map(id => nm[id] && nm[id].area || '—'))].sort();
    const cell = r => {
      if (!r) return '<td class="dt"></td><td class="n"></td><td class="ref"></td><td class="by"></td><td class="c mend"></td>';
      const w = r.label || ''; const [bg, fg] = cellColor(w);
      const why = r.comment && r.comment !== w ? r.comment : (w === 'Received' && r.gcash_at ? 'GCash ' + peso(r.gcash_amount) + ' on ' + mdy(r.gcash_at) : '');
      const hit = S.day && d10(r.paid_date) === S.day ? ';outline:2px solid #025ac6;outline-offset:-2px' : '';
      return `<td class="dt" style="${hit}">${esc(mdy(r.paid_date))}</td><td class="n">${Number(r.amount).toLocaleString('en-PH')}</td><td class="ref">${esc(r.or_no || '')}</td><td class="by">${esc(r.received_by || '')}</td>
        <td class="c mend" style="background:${bg};color:${fg}" title="${esc(why)}">${esc(w)}</td>`;
    };
    const trs = ids.map(id => { const s = nm[id] || {}; return `<tr class="${s.status === 'cutoff' ? 'cut' : ''}"><td class="nm"><a href="#" onclick="window.subDetail&&window.subDetail(${id});return false">${esc(s.name || ('#' + id))}</a>${s.area ? ` <span style="color:#9ca3af;font-size:10.5px">${esc(s.area)}</span>` : ''}</td>${S.months.map(m => cell(byId[id][m])).join('')}</tr>`; }).join('');
    b.innerHTML = `<div class="cx-card"><div class="cx-head"><b>📒 Payments · ${esc(monL(S.month))}</b><span style="font-size:11px;color:#6b7280">one answer per paid month, from all sources${S.src === 'v1' ? ' (book refs only until the gateway allows v2)' : ''} · same words as the sheet${fresh ? ' · computed ' + new Date(fresh).toLocaleTimeString('en-PH', { hour:'numeric', minute:'2-digit', timeZone:'Asia/Manila' }) : ''}</span></div>
        <div class="pck-tiles">${tile('Received', c.ok, '#15803d', c.noted ? c.noted + ' with a note (amount / date)' : '')}${tile('NOT received', c.no, '#b91c1c', c.noAmt ? peso(c.noAmt) : '')}${tile('Ref cannot be checked', c.check, '#b45309', 'incomplete · unreadable · bank')}${tile('Cannot check', c.wait, '#64748b', 'no ref / no export')}${tile('Cash OR', c.cash, '#94a3b8')}</div>
        <div style="padding:0 14px;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Per exported day · GCash in vs recorded</div>${days}</div>
      <div class="cx-card"><div class="pck-f">
          <select id="pck-mon">${S.months.map(m => `<option value="${m}"${m === S.month ? ' selected' : ''}>${esc(monL(m))}</option>`).join('')}</select>
          <select id="pck-area"><option value="">All areas</option>${areas.map(a => `<option${S.area === a ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>
          <button type="button" id="pck-prob" class="${S.onlyProblems && !S.day ? 'on' : ''}">${S.onlyProblems ? 'Only the problems' : 'All subscribers'}</button>
          ${S.day ? `<button type="button" id="pck-dayoff" class="on">📅 ${esc(dayL(S.day))} ✕</button>` : ''}
          <input id="pck-q" type="search" placeholder="Search name, account no., ref" value="${esc(S.q)}" style="flex:1;min-width:200px">
          <span style="font-size:11px;color:#6b7280">${ids.length} subscriber${ids.length === 1 ? '' : 's'} · hover a Comment for the reason</span>
          <button type="button" id="pck-re" title="Reload">↻</button></div>
        <div class="pck-wrap" id="pck-wrap"><table class="pck-grid"><thead>
          <tr><th class="nm" rowspan="2">Subscriber's Name</th>${S.months.map(m => `<th colspan="5">${esc(monL(m)).toUpperCase()}</th>`).join('')}</tr>
          <tr>${S.months.map(() => '<th>Date Paid</th><th>Amount</th><th>OR / Ref</th><th>Received By</th><th>Comment</th>').join('')}</tr></thead>
          <tbody>${trs || `<tr><td class="nm" colspan="${1 + S.months.length * 5}" style="text-align:left;color:#6b7280;padding:14px">✅ Nothing needs a hand${S.area ? ' in ' + esc(S.area) : ''}.</td></tr>`}</tbody></table></div></div>`;
    b.querySelector('#pck-mon').onchange = e => { S.month = e.target.value; draw(); };
    b.querySelector('#pck-area').onchange = e => { S.area = e.target.value; draw(); };
    b.querySelector('#pck-prob').onclick = () => { S.onlyProblems = !S.onlyProblems; S.day = ''; draw(); };
    const off = b.querySelector('#pck-dayoff'); if (off) off.onclick = () => { S.day = ''; draw(); };
    b.querySelector('#pck-re').onclick = () => load(true);
    b.querySelectorAll('.pck-day').forEach(d => d.onclick = () => { S.day = S.day === d.dataset.day ? '' : d.dataset.day; draw(); });
    const qi = b.querySelector('#pck-q'); qi.oninput = () => { S.q = qi.value; const pos = qi.selectionStart; draw(); const q2 = b.querySelector('#pck-q'); if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); } };
    const wrap = b.querySelector('#pck-wrap'); if (wrap) wrap.scrollLeft = wrap.scrollWidth;   // newest months on the right, like the sheet; start there
  }
  window.pckTabLoad = () => { if (S.rows && !S.err) draw(); else load(); };
})();
