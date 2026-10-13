// ══════════════════════════════════════════════════════════
// COLLECTIONS TAB — SUBSCRIBER PAYMENTS (add-on, v1)
// Adds subscriber payments (Spawn Collect + payment sheet) to the
// "By Date" view, next to the harvest collections, with one grand total:
//   Harvest Spawn share + Subscriber payments = Total collected.
// Read-only. It wraps colLoad() and never changes the harvest, recon,
// pack or cache logic in dash.4.map.js. Data goes through the admin
// gateway via sb() like the rest of the dashboard.
// ══════════════════════════════════════════════════════════
(function(){
  if (typeof window === 'undefined') return;

  const peso = n => '\u20b1' + Number(n||0).toLocaleString('en-PH', {maximumFractionDigits: 2});
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const firstName = s => String(s||'').trim().split(/\s+/)[0] || 'Office';
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
  let subcolRows = [], subcolFilter = '', subcolDate = '';

  function ensureHosts(){
    const view = document.getElementById('col-date-view');
    if (!view) return false;
    if (!document.getElementById('col-grand')) {
      const g = document.createElement('div'); g.id = 'col-grand';
      view.insertBefore(g, view.firstChild);
    }
    if (!document.getElementById('col-subs')) {
      const s = document.createElement('div'); s.id = 'col-subs';
      view.appendChild(s);
    }
    if (!document.getElementById('subcol-style')) {
      const st = document.createElement('style'); st.id = 'subcol-style';
      st.textContent = `
        .sc-grand{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}
        @media(max-width:700px){.sc-grand{grid-template-columns:repeat(2,minmax(0,1fr))}#col-summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
        .sc-cap{font-size:11px;color:#6b7280;margin:-4px 0 8px}
        .sc-sheet{background:#f1f5f9;color:#475569}
        .sc-g{position:relative;overflow:hidden;padding:12px 14px;border-radius:14px;background:#fff;border:1px solid #e5e7eb}
        .sc-g .l{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6b7280}
        .sc-g .v{font-size:20px;font-weight:800;margin-top:2px;font-variant-numeric:tabular-nums}
        .sc-g .s{font-size:11px;color:#6b7280;margin-top:2px}
        .sc-g.total{color:#fff;border:0;background:radial-gradient(90% 70% at 10% -10%,rgba(255,255,255,.28),rgba(255,255,255,0) 60%),linear-gradient(135deg,#0146a0 0%,#025ac6 55%,#2b2295 100%);box-shadow:0 10px 22px rgba(1,70,160,.25)}
        .sc-g.total .l,.sc-g.total .s{color:rgba(255,255,255,.85)}
        .sc-card{margin-top:16px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden}
        .sc-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:12px 14px;border-bottom:1px solid #eef0f4}
        .sc-head b{font-size:14px;color:#0f2a5c}
        .sc-chips{display:flex;gap:6px;flex-wrap:wrap}
        .sc-chip{padding:4px 12px;border-radius:20px;border:1px solid #e5e7eb;background:#fff;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit}
        .sc-chip.on{background:#025AC6;border-color:#025AC6;color:#fff}
        .sc-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
        .sc-tbl th{text-align:left;font-size:11px;font-weight:700;color:#6b7280;padding:8px 10px;background:#f8fafc;border-bottom:1px solid #eef0f4;white-space:nowrap}
        .sc-tbl td{padding:8px 10px;border-bottom:1px solid #f1f3f7;vertical-align:top}
        .sc-tbl td.n,.sc-tbl th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
        .sc-tbl tr.tot td{font-weight:800;background:#f8fafc}
        .sc-badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:10.5px;font-weight:700}
        .sc-cash{background:#e7f6f1;color:#027e60}.sc-gcash{background:#e8f0ff;color:#025AC6}.sc-unk{background:#f1f5f9;color:#64748b}
        .sc-app{background:#fff1cc;color:#966500}
        .sc-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
        .sc-scroll{overflow-x:auto}
        .sc-empty{padding:18px;text-align:center;color:#9ca3af;font-size:13px}
      `;
      document.head.appendChild(st);
    }
    return true;
  }

  const isGcashWord = s => /^\s*g[\s-]?cash\s*$/i.test(String(s||''));
  function methodOf(p){
    if (p.pay_method === 'cash' || p.pay_method === 'gcash') return p.pay_method;
    if (isGcashWord(p.collector)) return 'gcash';                 // office sheet writes "G-cash" as the collector
    const n = String(p.note||'').toLowerCase();
    if (/g-?cash/.test(n)) return 'gcash';
    if (/\bcash\b/.test(n)) return 'cash';
    return 'unknown';
  }
  function whoOf(p){ return isGcashWord(p.collector) ? 'Office' : cap(firstName(p.collector)); }
  const isApp = p => String(p.invoice_no||'').startsWith('SC-');
  // note without the OR / GCash ref that is already shown in its own column
  const cleanNote = p => String(p.note||'').replace(/\s*OR\s+\d+/i,'').replace(/\s*GCash( ref [0-9 ]+)?/i,'').trim();
  // fill a missing area from the subscriber record
  async function fillAreas(rows){
    const ids=[...new Set(rows.filter(p=>!p.area&&p.subscriber_id).map(p=>p.subscriber_id))];
    if(!ids.length) return;
    const subs = await sb('subscribers', `id=in.(${ids.join(',')})&select=id,area`, 1000);
    const m={}; (Array.isArray(subs)?subs:[]).forEach(s=>m[s.id]=s.area);
    rows.forEach(p=>{ if(!p.area&&m[p.subscriber_id]) p.area=m[p.subscriber_id]; });
  }
  // app payments in time order first, office-sheet rows after (their time is the import time)
  function ordered(rows){
    return rows.slice().sort((a,b)=>{ const x=isApp(a), y=isApp(b);
      if(x!==y) return x?-1:1;
      return String(a.created_at||'').localeCompare(String(b.created_at||'')) || (a.id-b.id); });
  }
  function refOf(p){
    if (p.paper_no) return 'OR ' + p.paper_no;
    if (p.gcash_ref) return 'GC ' + p.gcash_ref;
    return p.invoice_no || '';
  }

  async function subcolLoad(date){
    if (!ensureHosts()) return;
    subcolDate = date;
    const grand = document.getElementById('col-grand');
    const host  = document.getElementById('col-subs');
    host.innerHTML = '<div class="sc-card"><div class="sc-empty">Loading subscriber payments…</div></div>';
    const [pays, harv] = await Promise.all([
      sb('subscriber_payments', `payment_date=eq.${date}&select=id,subscriber_id,subscriber_name,area,amount,collector,pay_method,paper_no,gcash_ref,invoice_no,note,created_at&order=created_at.asc`, 2000),
      sb('harvests', `harvest_date=eq.${date}&select=collector,spawn_share`, 3000)
    ]);
    if (subcolDate !== date) return;           // a newer date was picked meanwhile
    subcolRows = ordered(Array.isArray(pays) ? pays : []);
    try { await fillAreas(subcolRows); } catch(e){}
    if (subcolDate !== date) return;
    const hrows = Array.isArray(harv) ? harv : [];

    // ── grand totals ──
    const harvTotal = hrows.reduce((s,r)=>s+Number(r.spawn_share||0),0);
    const subTotal  = subcolRows.reduce((s,r)=>s+Number(r.amount||0),0);
    const by = {cash:0,gcash:0,unknown:0};
    subcolRows.forEach(p=>{ by[methodOf(p)] += Number(p.amount||0); });
    grand.innerHTML = `<div class="sc-cap">All areas · harvest + subscriber payments for ${esc(date)}</div><div class="sc-grand">
      <div class="sc-g"><div class="l">Harvest Spawn share</div><div class="v" style="color:#15803d">${peso(harvTotal)}</div><div class="s">${hrows.length} vendo${hrows.length===1?'':'s'}</div></div>
      <div class="sc-g"><div class="l">Subscriber payments</div><div class="v" style="color:#025AC6">${peso(subTotal)}</div><div class="s">${subcolRows.length} payment${subcolRows.length===1?'':'s'}</div></div>
      <div class="sc-g"><div class="l">Subscribers: cash / GCash</div><div class="v" style="font-size:16px">${peso(by.cash)} <span style="color:#9ca3af;font-weight:600">/</span> <span style="color:#025AC6">${peso(by.gcash)}</span></div><div class="s">${!subcolRows.length?'no payments':(by.unknown?peso(by.unknown)+' method not written':'all with method')}</div></div>
      <div class="sc-g total"><div class="l">Total collected</div><div class="v">${peso(harvTotal+subTotal)}</div><div class="s">harvest share + subscribers</div></div>
    </div>`;

    // ── per collector: harvest + subscribers ──
    const per = {};
    const add = (name, k, v) => { const c = cap(firstName(name)); per[c] = per[c] || {harv:0,cash:0,gcash:0,unknown:0,n:0}; per[c][k] += v; };
    hrows.forEach(r => add(r.collector, 'harv', Number(r.spawn_share||0)));
    subcolRows.forEach(p => { const w=whoOf(p); per[w] = per[w] || {harv:0,cash:0,gcash:0,unknown:0,n:0}; per[w][methodOf(p)] += Number(p.amount||0); per[w].n++; });
    const names = Object.keys(per).sort((a,b)=>{
      const ta = per[a].harv+per[a].cash+per[a].gcash+per[a].unknown, tb = per[b].harv+per[b].cash+per[b].gcash+per[b].unknown; return tb-ta; });
    const perRows = names.map(c=>{ const x=per[c], t=x.harv+x.cash+x.gcash+x.unknown;
      return `<tr><td><b>${esc(c)}</b></td><td class="n">${x.harv?peso(x.harv):'—'}</td><td class="n">${x.cash?peso(x.cash):'—'}</td><td class="n">${x.gcash?peso(x.gcash):'—'}</td><td class="n">${x.unknown?peso(x.unknown):'—'}</td><td class="n"><b>${peso(t)}</b></td></tr>`; }).join('');
    const tot = names.reduce((a,c)=>{ const x=per[c]; a.h+=x.harv; a.c+=x.cash; a.g+=x.gcash; a.u+=x.unknown; return a; },{h:0,c:0,g:0,u:0});

    // ── subscriber payment list ──
    const collectors = [...new Set(subcolRows.map(whoOf))].sort();
    if (subcolFilter && !collectors.includes(subcolFilter)) subcolFilter = '';
    host.innerHTML = `
      <div class="sc-card">
        <div class="sc-head"><b>👥 By collector — harvest + subscribers</b><span style="font-size:11px;color:#6b7280">Cash = to hand in · GCash goes to the GCash account</span></div>
        <div class="sc-scroll">${names.length?`<table class="sc-tbl"><thead><tr><th>Collector</th><th class="n">Harvest Spawn share</th><th class="n">Subscribers cash</th><th class="n">Subscribers GCash</th><th class="n">Method not written</th><th class="n">Total</th></tr></thead>
          <tbody>${perRows}<tr class="tot"><td>Total</td><td class="n">${peso(tot.h)}</td><td class="n">${peso(tot.c)}</td><td class="n">${peso(tot.g)}</td><td class="n">${peso(tot.u)}</td><td class="n">${peso(tot.h+tot.c+tot.g+tot.u)}</td></tr></tbody></table>`
          :'<div class="sc-empty">Nothing collected on this date</div>'}</div>
      </div>
      <div class="sc-card">
        <div class="sc-head"><b>📶 Subscriber payments · ${esc(date)}</b>
          <div class="sc-chips" id="sc-chips">${subcolRows.length?[`<button class="sc-chip${subcolFilter===''?' on':''}" data-c="">All (${subcolRows.length})</button>`]
            .concat(collectors.map(c=>`<button class="sc-chip${subcolFilter===c?' on':''}" data-c="${esc(c)}">${esc(c)} (${subcolRows.filter(p=>whoOf(p)===c).length})</button>`)).join(''):''}</div></div>
        <div class="sc-scroll" id="sc-list"></div>
      </div>`;
    host.querySelectorAll('#sc-chips .sc-chip').forEach(b=>b.onclick=()=>{ subcolFilter=b.dataset.c; subcolRenderList(); host.querySelectorAll('#sc-chips .sc-chip').forEach(x=>x.classList.toggle('on',x.dataset.c===subcolFilter)); });
    subcolRenderList();
  }

  function subcolRenderList(){
    const el = document.getElementById('sc-list'); if (!el) return;
    const rows = subcolRows.filter(p => !subcolFilter || whoOf(p) === subcolFilter);
    if (!rows.length) { el.innerHTML = '<div class="sc-empty">No subscriber payments on this date</div>'; return; }
    const sum = rows.reduce((s,p)=>s+Number(p.amount||0),0);
    el.innerHTML = `<table class="sc-tbl"><thead><tr><th>Time</th><th>Collector</th><th>Subscriber</th><th>Area</th><th class="n">Amount</th><th>Paid by</th><th>OR / Ref</th><th>Note</th></tr></thead><tbody>`
      + rows.map(p=>{
          const m = methodOf(p), app = isApp(p);
          const t = app && p.created_at ? new Date(p.created_at).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}) : '—';
          return `<tr><td style="white-space:nowrap">${esc(t)}</td><td>${esc(whoOf(p))}</td>
            <td>${esc(p.subscriber_name||'')} <span class="sc-badge ${app?'sc-app':'sc-sheet'}">${app?'Collect':'Office sheet'}</span></td><td>${esc(p.area||'—')}</td>
            <td class="n"><b>${peso(p.amount)}</b></td>
            <td><span class="sc-badge ${m==='cash'?'sc-cash':m==='gcash'?'sc-gcash':'sc-unk'}">${m==='cash'?'Cash':m==='gcash'?'GCash':'—'}</span></td>
            <td class="sc-mono">${esc(refOf(p))}</td><td style="color:#6b7280">${esc(cleanNote(p))}</td></tr>`; }).join('')
      + `<tr class="tot"><td colspan="4">${rows.length} payment${rows.length===1?'':'s'}</td><td class="n">${peso(sum)}</td><td colspan="3"></td></tr></tbody></table>`;
  }

  // Wrap colLoad once its file has defined it (scripts are deferred, in order).
  function wrap(){
    if (typeof window.colLoad !== 'function' || window.colLoad._subcol) return !!(window.colLoad && window.colLoad._subcol);
    const orig = window.colLoad;
    const wrapped = async function(){
      const r = await orig.apply(this, arguments);
      try { const d = document.getElementById('col-date'); if (d && d.value) await subcolLoad(d.value); }
      catch(e){ const h=document.getElementById('col-subs'); if(h) h.innerHTML='<div class="sc-card"><div class="sc-empty" style="color:#dc2626">Subscriber payments did not load: '+esc(e.message)+'</div></div>'; }
      return r;
    };
    wrapped._subcol = true;
    window.colLoad = wrapped;
    return true;
  }
  if (!wrap()) document.addEventListener('DOMContentLoaded', wrap);
  window.subcolLoad = subcolLoad;

  // ══════════════════════════════════════════════════════════
  // HARVEST TAB — "Today's Subscriber Collection" card
  // Sits right under "Today's Harvest Summary", same look. One chip per
  // collector (e.g. Mark ₱X · N payments); tap a chip for his list.
  // Refreshes when the Harvest tab loads and every 60 s while visible.
  // ══════════════════════════════════════════════════════════
  let stRows = [], stLoading = false, stObs = null;
  const todayPH = () => new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Manila'});
  const avatar = (name) => (typeof window.collectorAvatar === 'function') ? window.collectorAvatar(name, 26)
    : `<span style="width:26px;height:26px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:#e0e7ff;color:#1e3a8a;font-size:12px;font-weight:800">${esc(String(name||'?').charAt(0).toUpperCase())}</span>`;

  function stHost(){
    const hs = document.getElementById('harvest-collector-summary');
    if (!hs) return null;
    let el = document.getElementById('sub-today-summary');
    if (!el) {
      el = document.createElement('div'); el.id = 'sub-today-summary';
      el.style.cssText = 'padding:0 12px 0 12px';
      hs.parentNode.insertBefore(el, hs.nextSibling);
    }
    return el;
  }
  async function stLoad(){
    const el = stHost(); if (!el || stLoading) return;
    stLoading = true;
    try {
      const d = todayPH();
      const pays = await sb('subscriber_payments', `payment_date=eq.${d}&select=id,subscriber_id,subscriber_name,area,amount,collector,pay_method,paper_no,gcash_ref,invoice_no,note,created_at&order=created_at.asc`, 2000);
      stRows = ordered(Array.isArray(pays) ? pays : []);
      try { await fillAreas(stRows); } catch(e){}
      stRender();
    } catch(e) {
      el.innerHTML = '<div style="font-size:11px;color:#dc2626;padding:4px 0">Error loading today\u2019s subscriber collection</div>';
    } finally { stLoading = false; }
  }
  function stRender(){
    const el = stHost(); if (!el) return;
    if (!stRows.length) {
      el.innerHTML = `<div style="background:#fff;border:1px solid var(--bd,#e5e7eb);border-radius:10px;padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="font-size:12px;font-weight:700;color:#025AC6;">📶 Today's Subscriber Collection</div>
        <div style="display:flex;gap:10px;align-items:center"><span style="font-size:12px;color:var(--mu,#6b7280)">📭 No subscriber payments recorded today yet</span>
        <button onclick="subTodayLoad()" style="padding:2px 8px;border:1px solid var(--bd,#e5e7eb);border-radius:5px;background:#fff;font-size:11px;cursor:pointer;color:var(--mu,#6b7280)">↻</button></div></div>`;
      return;
    }
    const by = {};
    stRows.forEach(p => { const w = whoOf(p), m = methodOf(p);
      by[w] = by[w] || {n:0,total:0,cash:0,gcash:0,unknown:0,areas:new Set()};
      by[w].n++; by[w].total += Number(p.amount||0); by[w][m] += Number(p.amount||0); if (p.area) by[w].areas.add(p.area); });
    const total = stRows.reduce((s,p)=>s+Number(p.amount||0),0);
    const cash = Object.values(by).reduce((s,x)=>s+x.cash,0), gc = Object.values(by).reduce((s,x)=>s+x.gcash,0);
    const entries = Object.entries(by).sort((a,b)=>b[1].total-a[1].total);
    el.innerHTML = `
      <div style="background:#fff;border:1px solid var(--bd,#e5e7eb);border-radius:10px;padding:10px 14px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
          <div style="font-size:12px;font-weight:700;color:#025AC6;">📶 Today's Subscriber Collection</div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <span style="font-size:11px;color:var(--mu,#6b7280);">${stRows.length} payment${stRows.length===1?'':'s'} · cash ${peso(cash)} · GCash ${peso(gc)}</span>
            <span style="font-size:14px;font-weight:700;color:#025AC6;">${peso(total)} collected</span>
            <button onclick="subTodayLoad()" style="padding:2px 8px;border:1px solid var(--bd,#e5e7eb);border-radius:5px;background:#fff;font-size:11px;cursor:pointer;color:var(--mu,#6b7280)">↻</button>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${entries.map(([name,x])=>`
            <div data-who="${esc(name)}" class="st-chip" style="background:#f5f8ff;border:1px solid #dbe5ff;border-radius:8px;padding:7px 12px;min-width:140px;cursor:pointer;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">${avatar(name)}<span style="font-size:12px;font-weight:700;color:#1e293b;">${esc(name)}</span></div>
              <div style="font-size:13px;font-weight:700;color:#025AC6;">${peso(x.total)}</div>
              <div style="font-size:10px;color:var(--mu,#6b7280);margin-top:1px;">${x.n} payment${x.n!==1?'s':''} · ${[...x.areas].join(', ')||'—'} <span style="color:#025AC6">▸</span></div>
              <div style="font-size:10px;margin-top:2px;"><span style="color:#027e60">Cash ${peso(x.cash)}</span> · <span style="color:#025AC6">GCash ${peso(x.gcash)}</span>${x.unknown?` · <span style="color:#64748b">? ${peso(x.unknown)}</span>`:''}</div>
            </div>`).join('')}
        </div>
      </div>`;
    el.querySelectorAll('.st-chip').forEach(c => {
      c.onmouseover = () => c.style.borderColor = '#025AC6';
      c.onmouseout  = () => c.style.borderColor = '#dbe5ff';
      c.onclick = () => stPopup(c.dataset.who);
    });
  }
  function stPopup(who){
    const rows = stRows.filter(p => whoOf(p) === who);
    let ov = document.getElementById('st-popup'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'st-popup';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:12px;';
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    const sum = rows.reduce((s,p)=>s+Number(p.amount||0),0);
    const cash = rows.filter(p=>methodOf(p)==='cash').reduce((s,p)=>s+Number(p.amount||0),0);
    const gc = rows.filter(p=>methodOf(p)==='gcash').reduce((s,p)=>s+Number(p.amount||0),0);
    ov.innerHTML = `<div style="background:#fff;border-radius:16px;width:100%;max-width:760px;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(15,23,42,.35);overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;color:#fff;background:linear-gradient(120deg,#0146a0 0%,#025ac6 70%,#1f74e0 100%)">
        ${avatar(who)}<div style="flex:1"><div style="font-weight:800;font-size:15px">${esc(who)} — subscribers today</div>
        <div style="font-size:12px;opacity:.9">${rows.length} payment${rows.length===1?'':'s'} · ${peso(sum)} · cash ${peso(cash)} (to hand in) · GCash ${peso(gc)}</div></div>
        <button id="st-x" style="width:34px;height:34px;border-radius:999px;border:0;background:rgba(255,255,255,.2);color:#fff;font-size:16px;cursor:pointer">✕</button></div>
      <div style="overflow:auto"><table class="sc-tbl"><thead><tr><th>Time</th><th>Subscriber</th><th>Area</th><th class="n">Amount</th><th>Paid by</th><th>OR / Ref</th></tr></thead><tbody>
        ${rows.map(p=>{ const m=methodOf(p), app=isApp(p);
          const t = app && p.created_at ? new Date(p.created_at).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}) : '—';
          return `<tr><td style="white-space:nowrap">${esc(t)}</td><td>${esc(p.subscriber_name||'')} <span class="sc-badge ${app?'sc-app':'sc-sheet'}">${app?'Collect':'Office sheet'}</span></td><td>${esc(p.area||'—')}</td>
            <td class="n"><b>${peso(p.amount)}</b></td><td><span class="sc-badge ${m==='cash'?'sc-cash':m==='gcash'?'sc-gcash':'sc-unk'}">${m==='cash'?'Cash':m==='gcash'?'GCash':'—'}</span></td><td class="sc-mono">${esc(refOf(p))}</td></tr>`; }).join('')}
        <tr class="tot"><td colspan="3">Total</td><td class="n">${peso(sum)}</td><td colspan="2"></td></tr></tbody></table></div>
      <div style="padding:10px 16px;border-top:1px solid #eef0f4;text-align:right"><button id="st-open" style="padding:8px 14px;border-radius:8px;border:1px solid #025AC6;background:#fff;color:#025AC6;font-weight:700;cursor:pointer;font-family:inherit">Open in COLLECTIONS ▸</button></div></div>`;
    document.body.appendChild(ov);
    ensureHosts();                                   // styles for the table
    ov.querySelector('#st-x').onclick = () => ov.remove();
    ov.querySelector('#st-open').onclick = () => {
      ov.remove();
      const btn = document.querySelector('[data-panel="joborders"]');
      if (btn) btn.click();
      setTimeout(()=>{ const d=document.getElementById('col-date'); if(d) d.value=todayPH(); subcolFilter=who; if (typeof window.colSetMode==='function') window.colSetMode('date'); if (typeof window.colLoad==='function') window.colLoad(); }, 150);
    };
  }
  function stStart(){
    const hs = document.getElementById('harvest-collector-summary'); if (!hs) return;
    // the harvest summary redraws whenever the Harvest tab opens or refreshes → refresh ours too
    if (!stObs) { let t=null; stObs = new MutationObserver(()=>{ clearTimeout(t); t=setTimeout(()=>{ if (hs.offsetParent!==null) stLoad(); },400); }); stObs.observe(hs, {childList:true}); }
    setInterval(()=>{ if (hs.offsetParent!==null && document.visibilityState==='visible') stLoad(); }, 60000);
    if (hs.offsetParent!==null) stLoad();
  }
  window.subTodayLoad = stLoad;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stStart); else stStart();
})();
