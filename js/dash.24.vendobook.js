/* 📗 Vendo book — Harvest → Vendo book (2026-11-26; Wendell: "create a like this for vendo, combination of BASHANG and database
   record, it would be like the SPAWN VENDOS (Auto) sheet"). Same idea as Subscribers → ✔ Payments check: name column frozen,
   one block per month with Date · Spawn share · Collector · Check, newest month on the right.
   One call: spawn_vendo_book_v1 (read-only) — every vendo, every harvest since 6 months ago, the app record (harvests) paired
   with the BASHANG book (office_harvest_records): same vendo, within 3 days, closest date then amount.
   Check words: ✓ Both · ≠ amount · App only · BASHANG only · Not harvested · Overdue. Rows by area, then harvest group (route order),
   vendos with no group at the bottom of each area; a tag marks vendos not in BASHANG. Tap a name → the vendo card. */
(function(){
  const SB = () => (typeof _SB !== 'undefined' && _SB) || window.__SPAWN_SB || 'https://cviraqfhphhsonjmrtvu.supabase.co';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const num = n => Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 });
  const peso = n => '₱' + num(n);
  const d10 = d => String(d || '').slice(0, 10);
  const mdy = d => d ? new Date(d10(d) + 'T12:00:00').toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'2-digit' }) : '';
  const monL = ym => new Date(ym + '-15T12:00:00').toLocaleDateString('en-PH', { month:'long', year:'numeric' });
  const ymOf = d => d10(d).slice(0, 7);
  const lastDay = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
  const daysBetween = (a, b) => Math.round((new Date(d10(b) + 'T12:00:00') - new Date(d10(a) + 'T12:00:00')) / 86400000);
  const S = { data:null, err:'', busy:false, nMonths:3, month:'', area:'', grp:'', q:'', view:'all', at:0 };
  const host = () => document.getElementById('hvt-vbook');

  async function load(force){
    if (S.busy) return;
    if (S.data && !force && Date.now() - S.at < 5 * 60e3) { draw(); return; }
    S.busy = true; S.err = ''; if (!S.data) draw();
    try {
      const r = await fetch(`${SB()}/rest/v1/rpc/spawn_vendo_book_v1`, { method:'POST', headers:{ apikey:'gw', Authorization:'Bearer gw', 'Content-Type':'application/json' }, body:'{}' });
      const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
      if (!r.ok || !j || !j.vendos) throw new Error(/not allowed/.test(t) ? 'the gateway does not allow the vendo book yet' : ((j && (j.message || j.error)) || 'error ' + r.status));
      S.data = shape(j); S.at = Date.now();
      if (!S.month || !S.data.months.includes(S.month)) S.month = S.data.months[S.data.months.length - 1];
    } catch (e) { S.err = e.message || 'error'; }
    S.busy = false; draw();
  }

  // the raw arrays → vendos with their events grouped by month
  function shape(j){
    const today = d10(j.today), months = [];
    for (let d = new Date(d10(j.from) + 'T12:00:00'); ymOf(d.toISOString()) <= ymOf(today); d.setMonth(d.getMonth() + 1)) months.push(ymOf(d.toISOString()));
    const V = j.vendos.map(a => ({ id:a[0], name:a[1] || ('#' + a[0]), area:a[2] || 'UNKNOWN', status:a[3] || '', vlan:a[4], iv:a[5], di:a[6], po:a[7], lh:a[8], tab:a[9], row:a[10], gid:a[11], gcode:a[12] || '', glabel:a[13] || '', gcol:a[14] || '', ev:{} }));
    const byId = {}; V.forEach(v => { byId[v.id] = v; });
    const maxBook = j.ev.reduce((m, e) => e[5] && d10(e[5]) > m ? d10(e[5]) : m, '');   // how far BASHANG is encoded
    j.ev.forEach(e => { const v = byId[e[0]]; if (!v) return;
      const x = { d:d10(e[1]), app:e[2] == null ? null : Number(e[2]), book:e[3] == null ? null : Number(e[3]), who:e[4] || '', bookD:d10(e[5]), guessed:!!e[6] };
      x.amt = x.app != null ? x.app : x.book;
      x.kind = x.app != null && x.book != null ? (Math.abs(x.app - x.book) < 1 ? 'both' : 'diff') : x.app != null ? 'app' : 'book';
      x.fresh = x.kind === 'app' && (daysBetween(x.d, today) <= 5 || (maxBook && daysBetween(maxBook, x.d) > -3));     // BASHANG not encoded that far yet
      (v.ev[ymOf(x.d)] = v.ev[ymOf(x.d)] || []).push(x); });
    return { today, months, vendos:V, maxBook, unmatched:Number(j.book_unmatched || 0) };
  }

  // what one vendo's month says when it has no harvest
  function emptyState(v, ym, today){
    const end = lastDay(ym), start = ym + '-01';
    if (v.di && d10(v.di) > end) return ['', 'not installed yet'];
    if (v.po && d10(v.po) < start) return ['', 'pulled out'];
    if (v.status === 'inactive') return ['', 'inactive'];
    if (ym === ymOf(today)) {
      const iv = Number(v.iv) || 30, lh = v.lh ? d10(v.lh) : null, base = lh || (v.di ? d10(v.di) : null);   // a new vendo counts from its install day
      if (!base || daysBetween(base, today) > iv) return ['late', 'Overdue' + (lh ? ' · ' + daysBetween(lh, today) + 'd' : base ? ' · installed ' + daysBetween(base, today) + 'd ago' : '')];
      return ['', ''];
    }
    return ['miss', 'Not harvested'];
  }
  const WORD = { both:['✓ Both', '#e6f4ea', '#15803d'], diff:['≠ amount', '#fff4d6', '#92400e'], app:['App only', '#e0ecff', '#0146a0'], book:['BASHANG only', '#fdeede', '#9a3412'],
                 miss:['Not harvested', '#fde2e1', '#b91c1c'], late:['Overdue', '#fde2e1', '#b91c1c'] };
  const evTip = x => x.kind === 'both' ? 'app and BASHANG agree' : x.kind === 'diff' ? `app ${peso(x.app)} · BASHANG ${peso(x.book)} (${mdy(x.bookD)})` + ' · gap ' + peso(x.app - x.book)
    : x.kind === 'app' ? (x.fresh ? 'recorded in the app; BASHANG is usually encoded a few days later' : 'recorded in the app, not found in BASHANG within 3 days')
    : 'in BASHANG, no app record within 3 days' + (x.guessed ? ' · BASHANG date was guessed' : '');

  function monthFacts(v, ym, today){
    const ev = v.ev[ym] || [];
    if (ev.length) return { ev, problem: ev.some(x => x.kind === 'diff' || x.kind === 'book' || (x.kind === 'app' && !x.fresh)) };
    const [k] = emptyState(v, ym, today);
    return { ev, empty:k, problem: k === 'miss' || k === 'late' };
  }

  function css(){
    if (document.getElementById('vb-style')) return;
    const s = document.createElement('style'); s.id = 'vb-style';
    s.textContent = `
      #hvt-vbook .vb-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;margin-bottom:12px;overflow:hidden}
      #hvt-vbook .vb-tiles{display:flex;gap:8px;flex-wrap:wrap;padding:10px 12px}
      #hvt-vbook .vb-tile{background:#fff;border:1px solid #e5e7eb;border-bottom:3px solid var(--c);border-radius:12px;padding:7px 11px;min-width:100px;flex:1;cursor:pointer}
      #hvt-vbook .vb-tile.on{outline:2px solid var(--c)}
      #hvt-vbook .vb-tile b{display:block;font-size:19px;font-weight:800;color:var(--c);font-variant-numeric:tabular-nums}
      #hvt-vbook .vb-tile span{font-size:11px;color:#6b7280;line-height:1.3;display:block}
      #hvt-vbook .vb-f{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:9px 12px;border-bottom:1px solid #eef0f4}
      #hvt-vbook .vb-f select,#hvt-vbook .vb-f input{padding:6px 9px;border:1.5px solid #e5e7eb;border-radius:9px;font:inherit;font-size:12.5px;background:#fff}
      #hvt-vbook .vb-f button{padding:6px 11px;border-radius:999px;border:1px solid #e5e7eb;background:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;color:#374151}
      #hvt-vbook .vb-f button.on{border-color:#025ac6;background:#e0ecff;color:#0146a0}
      #hvt-vbook .vb-wrap{overflow:auto;max-height:calc(100vh - 290px);position:relative}
      #hvt-vbook .vb-grid{border-collapse:separate;border-spacing:0;font-size:12px;white-space:nowrap}
      #hvt-vbook .vb-grid th,#hvt-vbook .vb-grid td{border-right:1px solid #e5e7eb;border-bottom:1px solid #eef0f4;padding:4px 7px;background:#fff;vertical-align:top}
      #hvt-vbook .vb-grid thead th{position:sticky;top:0;z-index:2;background:#2d3547;color:#fff;font-weight:700;text-align:center}
      #hvt-vbook .vb-grid thead tr:nth-child(2) th{top:26px;background:#e3e8f0;color:#2d3547;font-size:11px}
      #hvt-vbook .vb-grid th.nm,#hvt-vbook .vb-grid td.nm{position:sticky;left:0;z-index:3;text-align:left;min-width:220px;max-width:280px;overflow:hidden;text-overflow:ellipsis;border-right:2px solid #2d3547}
      #hvt-vbook .vb-grid thead th.nm{z-index:4}
      #hvt-vbook .vb-grid td.nm a{color:#0146a0;font-weight:700;text-decoration:none;cursor:pointer}
      #hvt-vbook .vb-grid td.n{text-align:right;font-variant-numeric:tabular-nums}
      #hvt-vbook .vb-grid td.mend{border-right:2px solid #2d3547}
      #hvt-vbook .vb-grid td.c{font-weight:700;text-align:center;min-width:104px}
      #hvt-vbook .vb-grid td.who{min-width:80px;color:#374151}
      #hvt-vbook .vb-grid tr.ar td{background:#2d3547;color:#fff;font-weight:800;letter-spacing:.04em}
      #hvt-vbook .vb-grid tr.sub td{background:#f1f5f9;color:#475569;font-weight:700;font-size:11px}
      #hvt-vbook .vb-grid tr.dim td{color:#9ca3af}`;
    document.head.appendChild(s);
  }

  function draw(){
    const h = host(); if (!h) return; css();
    if (!S.data) { h.innerHTML = `<div class="vb-card" style="padding:24px;color:${S.err ? '#b91c1c' : '#6b7280'}">${S.err ? '📗 Could not load the vendo book: ' + esc(S.err) + ' <button type="button" id="vb-re" style="margin-left:8px">Try again</button>' : 'Loading the vendo book (app + BASHANG)…'}</div>`;
      const re = h.querySelector('#vb-re'); if (re) re.onclick = () => load(true); return; }
    const D = S.data, today = D.today;
    const shown = D.months.slice(-S.nMonths);
    const areas = [...new Set(D.vendos.map(v => v.area))].sort();
    const q = S.q.trim().toLowerCase();
    // tiles: the chosen month
    const M = S.month;
    const t = { harv:0, both:0, diff:0, app:0, book:0, miss:0, total:0, gap:0, pend:0 };
    D.vendos.forEach(v => { if (S.area && v.area !== S.area) return; if (S.grp && String(v.gid || 'none') !== S.grp) return; const f = monthFacts(v, M, today);
      if (f.ev.length) { t.harv++; f.ev.forEach(x => { if (x.kind === 'app' && x.fresh) t.pend++; else t[x.kind]++; t.total += x.amt || 0; if (x.kind === 'diff') t.gap += x.app - x.book; }); }
      else if (f.empty === 'miss' || f.empty === 'late') t.miss++; });
    const pass = v => {
      if (S.area && v.area !== S.area) return false;
      if (S.grp && String(v.gid || 'none') !== S.grp) return false;
      if (q && !(String(v.name).toLowerCase().includes(q) || String(v.vlan || '') === q || String(v.id) === q)) return false;
      if (S.view === 'all') return true;
      const f = monthFacts(v, M, today);
      if (S.view === 'problems') return shown.some(ym => monthFacts(v, ym, today).problem);
      if (S.view === 'miss') return !f.ev.length && (f.empty === 'miss' || f.empty === 'late');
      return f.ev.some(x => x.kind === S.view && !(x.kind === 'app' && x.fresh));
    };
    const list = D.vendos.filter(pass);
    const cells = (v, ym) => {
      const f = monthFacts(v, ym, today);
      if (!f.ev.length) {
        const [k, l] = emptyState(v, ym, today), w = WORD[k];
        return `<td></td><td class="n"></td><td class="who"></td><td class="c mend" style="${w ? `background:${w[1]};color:${w[2]}` : 'color:#9ca3af;font-weight:500'}">${esc(l)}</td>`;
      }
      const ev = f.ev;
      const word = x => { const w = x.kind === 'app' && x.fresh ? ['App · BASHANG pending', '#f1f5f9', '#475569'] : WORD[x.kind]; return `<div style="background:${w[1]};color:${w[2]};border-radius:5px;padding:1px 5px;margin:1px 0" title="${esc(evTip(x))}">${w[0]}${x.kind === 'diff' ? ' ' + (x.app - x.book > 0 ? '+' : '') + num(x.app - x.book) : ''}${x.guessed ? ' ?' : ''}</div>`; };
      return `<td>${ev.map(x => esc(mdy(x.d))).join('<br>')}</td><td class="n">${ev.map(x => num(x.amt)).join('<br>')}</td><td class="who">${ev.map(x => esc(x.who || (x.kind === 'book' ? 'BASHANG' : ''))).join('<br>')}</td><td class="c mend">${ev.map(word).join('')}</td>`;
    };
    const span = 1 + shown.length * 4;
    let rows = '', lastArea = null, lastG = null;
    const monTot = arr => arr.reduce((s, x) => s + (x.ev[M] || []).reduce((a, e) => a + (e.amt || 0), 0), 0);
    list.forEach(v => {
      if (v.area !== lastArea) {
        const inA = list.filter(x => x.area === v.area), n = inA.length, tot = monTot(inA);
        rows += `<tr class="ar"><td class="nm" style="background:#2d3547">${esc(v.area)} · ${n} vendo${n === 1 ? '' : 's'}</td><td colspan="${span - 1}" style="background:#2d3547;text-align:left">${esc(monL(M))}: ${peso(tot)} spawn share</td></tr>`;
        lastArea = v.area; lastG = null;
      }
      const gk = v.gid || 'none';
      if (gk !== lastG) {   // 2026-11-26: arranged by harvest group (owner's ask), route order inside the group
        const inG = list.filter(x => x.area === v.area && (x.gid || 'none') === gk);
        rows += `<tr class="sub"><td class="nm" style="background:#e8eefc;color:#1e3a8a">${v.gid ? '🧺 ' + esc(v.gcode) + ' · ' + esc(v.glabel) : '❔ No harvest group yet'}</td><td colspan="${span - 1}" style="background:#e8eefc;color:#1e3a8a;text-align:left">${v.gcol ? '👤 ' + esc(v.gcol) + ' · ' : ''}${inG.length} vendo${inG.length === 1 ? '' : 's'} · ${esc(monL(M))}: ${peso(monTot(inG))}</td></tr>`;
        lastG = gk;
      }
      const dim = v.status === 'inactive' || v.status === 'pulled_out';
      rows += `<tr class="${dim ? 'dim' : ''}"><td class="nm" title="${esc(v.name)}"><a data-vb="${v.id}">${esc(v.name)}</a>${v.vlan != null ? ` <span style="color:#9ca3af;font-size:11px">V${esc(v.vlan)}</span>` : ''}${v.tab ? '' : ' <span style="background:#fff7ed;color:#9a3412;border-radius:4px;padding:0 4px;font-size:10px" title="not in the BASHANG sheet">not in BASHANG</span>'}${v.status === 'pulled_out' ? ' <span style="color:#b91c1c;font-size:10px">pulled out</span>' : v.status === 'inactive' ? ' <span style="color:#9ca3af;font-size:10px">inactive</span>' : ''}</td>${shown.map(ym => cells(v, ym)).join('')}</tr>`;
    });
    const tile = (k, l, v, col, sub) => `<div class="vb-tile${S.view === k ? ' on' : ''}" data-v="${k}" style="--c:${col}" title="Tap to show only these"><b>${v}</b><span>${l}${sub ? '<br>' + sub : ''}</span></div>`;
    h.innerHTML = `<div class="vb-card"><div style="display:flex;align-items:center;gap:10px;padding:10px 12px 0;flex-wrap:wrap"><b style="font-size:15px;color:#0f2a5c">📗 Vendo book · ${esc(monL(M))}${S.area ? ' · ' + esc(S.area) : ''}${S.grp ? ' · ' + esc((D.vendos.find(v => String(v.gid || 'none') === S.grp) || {}).glabel || 'No harvest group') : ''}</b>
          <span style="font-size:11px;color:#6b7280">app records + BASHANG book, one line per harvest · like SPAWN VENDOS (Auto)${D.maxBook ? ' · BASHANG encoded up to ' + esc(mdy(D.maxBook)) : ''}${D.unmatched ? ' · ' + D.unmatched + ' BASHANG line' + (D.unmatched === 1 ? '' : 's') + ' not tied to a vendo' : ''}</span></div>
        <div class="vb-tiles">${tile('all', 'Harvested', t.harv, '#0f2a5c', peso(t.total) + ' spawn share')}${tile('both', '✓ App = BASHANG', t.both, '#15803d', '')}${tile('diff', '≠ Amount differs', t.diff, '#b45309', t.diff ? 'app − BASHANG ' + peso(t.gap) : '')}
          ${tile('app', 'App only', t.app, '#0146a0', 'not in BASHANG' + (t.pend ? '<br>+' + t.pend + ' new, BASHANG pending' : ''))}${tile('book', 'BASHANG only', t.book, '#9a3412', 'no app record')}${tile('miss', 'Not harvested', t.miss, '#b91c1c', M === ymOf(today) ? 'overdue now' : 'in ' + esc(monL(M)))}</div></div>
      <div class="vb-card"><div class="vb-f">
          <select id="vb-mon" title="Month for the tiles and filters">${D.months.map(m => `<option value="${m}"${m === M ? ' selected' : ''}>${esc(monL(m))}</option>`).join('')}</select>
          <select id="vb-n">${[2, 3, 4, 6].map(n => `<option value="${n}"${n === S.nMonths ? ' selected' : ''}>show ${n} months</option>`).join('')}</select>
          <select id="vb-area"><option value="">All areas</option>${areas.map(a => `<option${S.area === a ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>
          <select id="vb-grp"><option value="">All harvest groups</option>${[...new Map(D.vendos.filter(v => !S.area || v.area === S.area).map(v => [String(v.gid || 'none'), v.gid ? v.gcode + ' · ' + v.glabel : 'No harvest group yet'])).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([k, l]) => `<option value="${esc(k)}"${S.grp === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
          <button type="button" id="vb-prob" class="${S.view === 'problems' ? 'on' : ''}">⚠ Only problems</button>
          ${S.view !== 'all' && S.view !== 'problems' ? `<button type="button" id="vb-off" class="on">${esc((WORD[S.view] || ['filter'])[0])} ✕</button>` : ''}
          <input id="vb-q" type="search" placeholder="Search vendo, VLAN" value="${esc(S.q)}" style="flex:1;min-width:180px">
          <span style="font-size:11px;color:#6b7280">${list.length} vendo${list.length === 1 ? '' : 's'} · hover a Check for details</span>
          <button type="button" id="vb-re" title="Reload">↻</button></div>
        <div class="vb-wrap" id="vb-wrap"><table class="vb-grid"><thead>
          <tr><th class="nm" rowspan="2">Vendo</th>${shown.map(m => `<th colspan="4">${esc(monL(m)).toUpperCase()}</th>`).join('')}</tr>
          <tr>${shown.map(() => '<th>Date</th><th>Spawn share</th><th>Collector</th><th>Check</th>').join('')}</tr></thead>
          <tbody>${rows || `<tr><td class="nm" colspan="${span}" style="color:#6b7280;padding:14px">✅ Nothing to show${S.view !== 'all' ? ' for this filter' : ''}.</td></tr>`}</tbody></table></div></div>`;
    h.querySelectorAll('.vb-tile').forEach(x => x.onclick = () => { S.view = S.view === x.dataset.v ? 'all' : x.dataset.v; draw(); });
    h.querySelector('#vb-mon').onchange = e => { S.month = e.target.value; if (!D.months.slice(-S.nMonths).includes(S.month)) S.nMonths = Math.min(6, D.months.length - D.months.indexOf(S.month)); draw(); };
    h.querySelector('#vb-n').onchange = e => { S.nMonths = Number(e.target.value); draw(); };
    h.querySelector('#vb-area').onchange = e => { S.area = e.target.value; S.grp = ''; draw(); };
    h.querySelector('#vb-grp').onchange = e => { S.grp = e.target.value; draw(); };
    h.querySelector('#vb-prob').onclick = () => { S.view = S.view === 'problems' ? 'all' : 'problems'; draw(); };
    const off = h.querySelector('#vb-off'); if (off) off.onclick = () => { S.view = 'all'; draw(); };
    h.querySelector('#vb-re').onclick = () => load(true);
    const qi = h.querySelector('#vb-q'); qi.oninput = () => { S.q = qi.value; const p = qi.selectionStart; draw(); const q2 = h.querySelector('#vb-q'); if (q2) { q2.focus(); q2.setSelectionRange(p, p); } };
    h.querySelectorAll('a[data-vb]').forEach(a => a.onclick = ev => { ev.preventDefault(); const v = D.vendos.find(x => x.id === Number(a.dataset.vb)); if (v && typeof window.htShowVendoProfile === 'function') window.htShowVendoProfile(v.name, v.area, 'info', v.id); });
    const wrap = h.querySelector('#vb-wrap'); if (wrap) wrap.scrollLeft = wrap.scrollWidth;   // newest month on the right, like the sheet
  }

  window.vbLoad = () => load(false);
})();
