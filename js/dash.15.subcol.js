// ══════════════════════════════════════════════════════════
// COLLECTIONS TAB — one organized place for HARVEST + SUBSCRIBERS (add-on, v3)
//   Top (always): date with ◀ Today ▶, then Harvest · Subscribers · Total collected.
//   Sections: 🪙 Harvest (the existing harvest view, untouched)
//             📶 Subscribers (collector cards like the harvest ones + payment list)
//             👥 By collector (harvest + subscribers per collector)
// Read-only. Wraps colLoad(); the harvest/recon/pack/cache logic in
// dash.4.map.js is not changed. Data goes through sb() / the admin gateway.
// The HARVEST tab stays harvest-only.
// ══════════════════════════════════════════════════════════
(function(){
  if (typeof window === 'undefined') return;

  const peso = n => '\u20b1' + Number(n||0).toLocaleString('en-PH', {maximumFractionDigits: 2});
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const firstName = s => String(s||'').trim().split(/\s+/)[0] || 'Office';
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
  const todayPH = () => new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Manila'});
  const isGcashWord = s => /^\s*g[\s-]?cash\s*$/i.test(String(s||''));
  const isApp = p => String(p.invoice_no||'').startsWith('SC-');
  function methodOf(p){
    if (p.pay_method === 'cash' || p.pay_method === 'gcash') return p.pay_method;
    if (isGcashWord(p.collector)) return 'gcash';             // office sheet writes "G-cash" as the collector
    const n = String(p.note||'').toLowerCase();
    if (/g-?cash/.test(n)) return 'gcash';
    if (/\bcash\b/.test(n)) return 'cash';
    return 'unknown';
  }
  const whoOf = p => isGcashWord(p.collector) ? 'Office' : cap(firstName(p.collector));
  const refOf = p => p.paper_no ? 'OR ' + p.paper_no : (p.gcash_ref ? 'GC ' + p.gcash_ref : (p.invoice_no || ''));
  const cleanNote = p => String(p.note||'').replace(/\s*OR\s+\d+/i,'').replace(/\s*GCash( ref [0-9 ]+)?/i,'').trim();
  const timeOf = p => isApp(p) && p.created_at ? new Date(p.created_at).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}) : '—';
  const avatar = (name) => (typeof window.collectorAvatar === 'function') ? window.collectorAvatar(name, 26)
    : `<span style="width:26px;height:26px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:#e0e7ff;color:#1e3a8a;font-size:12px;font-weight:800">${esc(String(name||'?').charAt(0).toUpperCase())}</span>`;
  function ordered(rows){
    return rows.slice().sort((a,b)=>{ const x=isApp(a), y=isApp(b);
      if(x!==y) return x?-1:1;
      return String(a.created_at||'').localeCompare(String(b.created_at||'')) || (a.id-b.id); });
  }
  async function fillAreas(rows){
    const ids=[...new Set(rows.filter(p=>!p.area&&p.subscriber_id).map(p=>p.subscriber_id))];
    if(!ids.length) return;
    const subs = await sb('subscribers', `id=in.(${ids.join(',')})&select=id,area`, 1000);
    const m={}; (Array.isArray(subs)?subs:[]).forEach(s=>m[s.id]=s.area);
    rows.forEach(p=>{ if(!p.area&&m[p.subscriber_id]) p.area=m[p.subscriber_id]; });
  }

  let rows = [], hrows = [], filt = '', curDate = '';
  let seg = (()=>{ try { return localStorage.getItem('col_seg') || 'harvest'; } catch(e){ return 'harvest'; } })();
  const HARVEST_IDS = ['col-summary','col-area-filter','col-list'];

  function css(){
    if (document.getElementById('subcol-style')) return;
    const st = document.createElement('style'); st.id = 'subcol-style';
    st.textContent = `
      .cx-top{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px}
      .cx-c{position:relative;padding:12px 14px;border-radius:14px;background:#fff;border:1px solid #e5e7eb;cursor:pointer}
      .cx-c .l{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6b7280}
      .cx-c .v{font-size:21px;font-weight:800;margin-top:2px;font-variant-numeric:tabular-nums}
      .cx-c .s{font-size:11px;color:#6b7280;margin-top:2px}
      .cx-c.tot{color:#fff;border:0;cursor:default;background:radial-gradient(90% 70% at 10% -10%,rgba(255,255,255,.28),rgba(255,255,255,0) 60%),linear-gradient(135deg,#0146a0 0%,#025ac6 55%,#2b2295 100%);box-shadow:0 10px 22px rgba(1,70,160,.25)}
      .cx-c.tot .l,.cx-c.tot .s{color:rgba(255,255,255,.85)}
      .cx-seg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;border-radius:12px;background:#f1f5f9;border:1px solid #e2e8f0;margin-bottom:12px}
      .cx-seg button{padding:9px 6px;border:0;border-radius:9px;background:transparent;color:#334155;font-weight:700;font-size:13px;font-family:inherit;cursor:pointer}
      .cx-seg button.on{background:#fff;color:#0f2a5c;box-shadow:0 2px 6px rgba(15,23,42,.1)}
      .cx-seg button.on.h{color:#15803d}.cx-seg button.on.s{color:#025AC6}
      .cx-nav{display:inline-flex;gap:4px}
      .cx-nav button{padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;background:#fff;font-weight:700;font-size:13px;font-family:inherit;cursor:pointer;color:#334155}
      @media(max-width:700px){.cx-top{grid-template-columns:repeat(2,minmax(0,1fr))}.cx-top .tot{grid-column:1/-1}#col-summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
      .cx-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;margin-bottom:12px}
      .cx-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:12px 14px;border-bottom:1px solid #eef0f4}
      .cx-head b{font-size:14px;color:#0f2a5c}
      .cx-chips{display:flex;gap:6px;flex-wrap:wrap}
      .cx-chip{padding:4px 12px;border-radius:20px;border:1px solid #e5e7eb;background:#fff;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit}
      .cx-chip.on{background:#025AC6;border-color:#025AC6;color:#fff}
      .cx-cols{display:flex;gap:8px;flex-wrap:wrap;padding:12px 14px}
      .cx-col{background:#f5f8ff;border:1px solid #dbe5ff;border-radius:10px;padding:8px 12px;min-width:150px;cursor:pointer}
      .cx-col:hover{border-color:#025AC6}
      .sc-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
      .sc-tbl th{text-align:left;font-size:11px;font-weight:700;color:#6b7280;padding:8px 10px;background:#f8fafc;border-bottom:1px solid #eef0f4;white-space:nowrap}
      .sc-tbl td{padding:8px 10px;border-bottom:1px solid #f1f3f7;vertical-align:top}
      .sc-tbl td.n,.sc-tbl th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
      .sc-tbl tr.tot td{font-weight:800;background:#f8fafc}
      .sc-badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:10.5px;font-weight:700}
      .sc-cash{background:#e7f6f1;color:#027e60}.sc-gcash{background:#e8f0ff;color:#025AC6}.sc-unk{background:#f1f5f9;color:#64748b}
      .sc-app{background:#fff1cc;color:#966500}.sc-sheet{background:#f1f5f9;color:#475569}
      .sc-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
      .sc-scroll{overflow-x:auto}
      .sc-empty{padding:18px;text-align:center;color:#9ca3af;font-size:13px}`;
    document.head.appendChild(st);
  }

  function hosts(){
    const view = document.getElementById('col-date-view'); if (!view) return false;
    css();
    if (!document.getElementById('cx-top')) {
      const top = document.createElement('div'); top.id = 'cx-top';
      const segEl = document.createElement('div'); segEl.id = 'cx-seg'; segEl.className = 'cx-seg';
      segEl.innerHTML = '<button type="button" data-k="harvest" class="h">🪙 Harvest</button><button type="button" data-k="subs" class="s">📶 Subscribers</button><button type="button" data-k="cols">👥 By collector</button>';
      view.insertBefore(segEl, view.firstChild);
      view.insertBefore(top, segEl);
      segEl.querySelectorAll('button').forEach(b => b.onclick = () => setSeg(b.dataset.k));
      const subs = document.createElement('div'); subs.id = 'cx-subs'; view.appendChild(subs);
      const cols = document.createElement('div'); cols.id = 'cx-cols'; view.appendChild(cols);
    }
    const ctl = document.getElementById('col-date-controls');
    if (ctl && !document.getElementById('cx-nav')) {
      const nav = document.createElement('div'); nav.id = 'cx-nav'; nav.className = 'cx-nav';
      nav.innerHTML = '<button type="button" data-d="-1" aria-label="Previous day">◀</button><button type="button" data-d="0">Today</button><button type="button" data-d="1" aria-label="Next day">▶</button>';
      ctl.insertBefore(nav, ctl.firstChild);
      nav.querySelectorAll('button').forEach(b => b.onclick = () => {
        const d = document.getElementById('col-date'); if (!d) return;
        if (b.dataset.d === '0') d.value = todayPH();
        else { const t = new Date((d.value || todayPH()) + 'T12:00:00'); t.setDate(t.getDate() + Number(b.dataset.d)); d.value = t.toLocaleDateString('en-CA'); }
        if (typeof window.colLoad === 'function') window.colLoad();
      });
    }
    // remove the earlier subscriber card from the HARVEST tab — that tab is harvest-only again
    const old = document.getElementById('sub-today-summary'); if (old) old.remove();
    return true;
  }

  function setSeg(k){
    seg = k; try { localStorage.setItem('col_seg', k); } catch(e){}
    document.querySelectorAll('#cx-seg button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    HARVEST_IDS.forEach(id => { const e = document.getElementById(id); if (e) e.style.display = k === 'harvest' ? '' : 'none'; });
    const s = document.getElementById('cx-subs'), c = document.getElementById('cx-cols');
    if (s) s.style.display = k === 'subs' ? '' : 'none';
    if (c) c.style.display = k === 'cols' ? '' : 'none';
  }

  async function load(date){
    if (!hosts()) return;
    curDate = date;
    document.getElementById('cx-top').innerHTML = '<div class="sc-empty">Loading…</div>';
    const [pays, harv] = await Promise.all([
      sb('subscriber_payments', `payment_date=eq.${date}&select=id,subscriber_id,subscriber_name,area,amount,collector,pay_method,paper_no,gcash_ref,invoice_no,note,created_at&order=created_at.asc`, 2000),
      sb('harvests', `harvest_date=eq.${date}&select=collector,spawn_share,area`, 3000)
    ]);
    if (curDate !== date) return;                      // a newer date was picked meanwhile
    rows = ordered(Array.isArray(pays) ? pays : []);
    try { await fillAreas(rows); } catch(e){}
    if (curDate !== date) return;
    hrows = Array.isArray(harv) ? harv : [];
    drawTop(date); drawSubs(date); drawCols(); setSeg(seg);
  }

  function drawTop(date){
    const h = hrows.reduce((s,r)=>s+Number(r.spawn_share||0),0);
    const t = rows.reduce((s,r)=>s+Number(r.amount||0),0);
    const by = {cash:0,gcash:0,unknown:0}; rows.forEach(p=>{ by[methodOf(p)] += Number(p.amount||0); });
    const top = document.getElementById('cx-top');
    top.innerHTML = `<div class="cx-top">
      <div class="cx-c" data-k="harvest"><div class="l">🪙 Harvest · Spawn share</div><div class="v" style="color:#15803d">${peso(h)}</div><div class="s">${hrows.length} vendo${hrows.length===1?'':'s'} harvested</div></div>
      <div class="cx-c" data-k="subs"><div class="l">📶 Subscribers · paid</div><div class="v" style="color:#025AC6">${peso(t)}</div>
        <div class="s">${rows.length?`${rows.length} payment${rows.length===1?'':'s'} · cash ${peso(by.cash)} · GCash ${peso(by.gcash)}${by.unknown?' · ? '+peso(by.unknown):''}`:'no payments'}</div></div>
      <div class="cx-c tot"><div class="l">Total collected · ${esc(date)}</div><div class="v">${peso(h+t)}</div><div class="s">harvest share + subscribers · all areas</div></div>
    </div>`;
    top.querySelectorAll('.cx-c[data-k]').forEach(c => c.onclick = () => setSeg(c.dataset.k));
  }

  function drawSubs(date){
    const el = document.getElementById('cx-subs');
    if (!rows.length) { el.innerHTML = '<div class="cx-card"><div class="sc-empty">📭 No subscriber payments on this date</div></div>'; return; }
    const by = {};
    rows.forEach(p => { const w = whoOf(p), m = methodOf(p);
      by[w] = by[w] || {n:0,total:0,cash:0,gcash:0,unknown:0,areas:new Set()};
      by[w].n++; by[w].total += Number(p.amount||0); by[w][m] += Number(p.amount||0); if (p.area) by[w].areas.add(p.area); });
    const names = Object.keys(by).sort((a,b)=>by[b].total-by[a].total);
    if (filt && !names.includes(filt)) filt = '';
    el.innerHTML = `
      <div class="cx-card"><div class="cx-head"><b>📶 Who collected · ${esc(date)}</b><span style="font-size:11px;color:#6b7280">Tap a collector for his list</span></div>
        <div class="cx-cols">${names.map(n=>{ const x=by[n]; return `<div class="cx-col" data-who="${esc(n)}">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">${avatar(n)}<b style="font-size:12px;color:#1e293b">${esc(n)}</b></div>
          <div style="font-size:14px;font-weight:800;color:#025AC6">${peso(x.total)}</div>
          <div style="font-size:10px;color:#6b7280">${x.n} payment${x.n!==1?'s':''} · ${[...x.areas].join(', ')||'—'} <span style="color:#025AC6">▸</span></div>
          <div style="font-size:10px;margin-top:2px"><span style="color:#027e60">Cash ${peso(x.cash)}</span> · <span style="color:#025AC6">GCash ${peso(x.gcash)}</span>${x.unknown?` · <span style="color:#64748b">? ${peso(x.unknown)}</span>`:''}</div></div>`; }).join('')}</div></div>
      <div class="cx-card"><div class="cx-head"><b>Payments</b><div class="cx-chips" id="cx-chips">
        <button class="cx-chip${filt===''?' on':''}" data-c="">All (${rows.length})</button>
        ${names.map(n=>`<button class="cx-chip${filt===n?' on':''}" data-c="${esc(n)}">${esc(n)} (${by[n].n})</button>`).join('')}</div></div>
        <div class="sc-scroll" id="cx-list"></div></div>`;
    el.querySelectorAll('.cx-col').forEach(c => c.onclick = () => popup(c.dataset.who, date));
    el.querySelectorAll('#cx-chips .cx-chip').forEach(b => b.onclick = () => { filt = b.dataset.c; el.querySelectorAll('#cx-chips .cx-chip').forEach(x=>x.classList.toggle('on', x.dataset.c===filt)); drawList(); });
    drawList();
  }

  function table(list){
    const sum = list.reduce((s,p)=>s+Number(p.amount||0),0);
    return `<table class="sc-tbl"><thead><tr><th>Time</th><th>Collector</th><th>Subscriber</th><th>Area</th><th class="n">Amount</th><th>Paid by</th><th>OR / Ref</th><th>Note</th></tr></thead><tbody>`
      + list.map(p=>{ const m = methodOf(p), app = isApp(p);
          return `<tr><td style="white-space:nowrap">${esc(timeOf(p))}</td><td>${esc(whoOf(p))}</td>
            <td>${esc(p.subscriber_name||'')} <span class="sc-badge ${app?'sc-app':'sc-sheet'}">${app?'Collect':'Office sheet'}</span></td><td>${esc(p.area||'—')}</td>
            <td class="n"><b>${peso(p.amount)}</b></td>
            <td><span class="sc-badge ${m==='cash'?'sc-cash':m==='gcash'?'sc-gcash':'sc-unk'}">${m==='cash'?'Cash':m==='gcash'?'GCash':'—'}</span></td>
            <td class="sc-mono">${esc(refOf(p))}</td><td style="color:#6b7280">${esc(cleanNote(p))}</td></tr>`; }).join('')
      + `<tr class="tot"><td colspan="4">${list.length} payment${list.length===1?'':'s'}</td><td class="n">${peso(sum)}</td><td colspan="3"></td></tr></tbody></table>`;
  }
  function drawList(){
    const el = document.getElementById('cx-list'); if (!el) return;
    const list = rows.filter(p => !filt || whoOf(p) === filt);
    el.innerHTML = list.length ? table(list) : '<div class="sc-empty">No payments</div>';
  }

  function drawCols(){
    const per = {};
    const add = (w,k,v) => { per[w] = per[w] || {harv:0,cash:0,gcash:0,unknown:0}; per[w][k] += v; };
    hrows.forEach(r => add(cap(firstName(r.collector)), 'harv', Number(r.spawn_share||0)));
    rows.forEach(p => add(whoOf(p), methodOf(p), Number(p.amount||0)));
    const names = Object.keys(per).sort((a,b)=>{ const t=x=>x.harv+x.cash+x.gcash+x.unknown; return t(per[b])-t(per[a]); });
    const tot = names.reduce((a,n)=>{ const x=per[n]; a.h+=x.harv; a.c+=x.cash; a.g+=x.gcash; a.u+=x.unknown; return a; },{h:0,c:0,g:0,u:0});
    document.getElementById('cx-cols').innerHTML = `<div class="cx-card"><div class="cx-head"><b>👥 By collector — harvest + subscribers</b><span style="font-size:11px;color:#6b7280">Cash = to hand in · GCash goes to the GCash account</span></div>
      <div class="sc-scroll">${names.length?`<table class="sc-tbl"><thead><tr><th>Collector</th><th class="n">🪙 Harvest share</th><th class="n">📶 Subs cash</th><th class="n">📶 Subs GCash</th><th class="n">Method not written</th><th class="n">Total</th></tr></thead><tbody>
        ${names.map(n=>{ const x=per[n]; return `<tr><td><b>${esc(n)}</b></td><td class="n">${x.harv?peso(x.harv):'—'}</td><td class="n">${x.cash?peso(x.cash):'—'}</td><td class="n">${x.gcash?peso(x.gcash):'—'}</td><td class="n">${x.unknown?peso(x.unknown):'—'}</td><td class="n"><b>${peso(x.harv+x.cash+x.gcash+x.unknown)}</b></td></tr>`; }).join('')}
        <tr class="tot"><td>Total</td><td class="n">${peso(tot.h)}</td><td class="n">${peso(tot.c)}</td><td class="n">${peso(tot.g)}</td><td class="n">${peso(tot.u)}</td><td class="n">${peso(tot.h+tot.c+tot.g+tot.u)}</td></tr></tbody></table>`
        :'<div class="sc-empty">Nothing collected on this date</div>'}</div></div>`;
  }

  function popup(who, date, src){
    const list = (src || rows).filter(p => whoOf(p) === who);
    let ov = document.getElementById('cx-popup'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'cx-popup';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:12px;';
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    const sum = list.reduce((s,p)=>s+Number(p.amount||0),0);
    const cash = list.filter(p=>methodOf(p)==='cash').reduce((s,p)=>s+Number(p.amount||0),0);
    const gc = list.filter(p=>methodOf(p)==='gcash').reduce((s,p)=>s+Number(p.amount||0),0);
    ov.innerHTML = `<div style="background:#fff;border-radius:16px;width:100%;max-width:820px;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(15,23,42,.35);overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;color:#fff;background:linear-gradient(120deg,#0146a0 0%,#025ac6 70%,#1f74e0 100%)">
        ${avatar(who)}<div style="flex:1"><div style="font-weight:800;font-size:15px">${esc(who)} — subscriber payments · ${esc(date)}</div>
        <div style="font-size:12px;opacity:.9">${list.length} payment${list.length===1?'':'s'} · ${peso(sum)} · cash ${peso(cash)} (to hand in) · GCash ${peso(gc)}</div></div>
        <button type="button" id="cx-x" aria-label="Close" style="width:34px;height:34px;border-radius:999px;border:0;background:rgba(255,255,255,.2);color:#fff;font-size:16px;cursor:pointer">✕</button></div>
      <div style="overflow:auto">${table(list)}</div></div>`;
    document.body.appendChild(ov);
    ov.querySelector('#cx-x').onclick = () => ov.remove();
  }

  // Wrap colLoad once dash.4.map.js has defined it (scripts are deferred, in order).
  function wrap(){
    if (typeof window.colLoad !== 'function') return false;
    if (window.colLoad._subcol) return true;
    const orig = window.colLoad;
    const wrapped = async function(){
      hosts(); setSeg(seg);
      const r = await orig.apply(this, arguments);
      try { const d = document.getElementById('col-date'); if (d && d.value) await load(d.value); }
      catch(e){ const t=document.getElementById('cx-top'); if(t) t.innerHTML='<div class="sc-empty" style="color:#dc2626">Subscriber payments did not load: '+esc(e.message)+'</div>'; }
      setSeg(seg);
      return r;
    };
    wrapped._subcol = true;
    window.colLoad = wrapped;
    return true;
  }
  if (!wrap()) document.addEventListener('DOMContentLoaded', wrap);
  window.subcolLoad = load;
  window.colSeg = setSeg;

  // ══════════════════════════════════════════════════════════
  // SUBSCRIBERS TAB — live "Today's Subscriber Collection" card
  // Same idea as "Today's Harvest Summary" on the Harvest tab: always on top,
  // one chip per collector (tap for his list), refreshes every 60 s.
  // The Subscribers tab redraws its whole panel, so the card re-attaches itself.
  // ══════════════════════════════════════════════════════════
  let live = [], liveAt = null, liveBusy = false;
  function liveHost(){
    const panel = document.getElementById('panel-subscribers'); if (!panel) return null;
    css();
    let el = document.getElementById('sub-live');
    if (!el || el.parentNode !== panel) {
      el = document.createElement('div'); el.id = 'sub-live'; el.style.cssText = 'padding:12px 12px 0 12px;max-width:1200px;margin:0 auto';
      panel.insertBefore(el, panel.firstChild);
      liveDraw();
    }
    return el;
  }
  async function liveLoad(){
    if (liveBusy) return; liveBusy = true;
    try {
      const d = todayPH();
      const pays = await sb('subscriber_payments', `payment_date=eq.${d}&select=id,subscriber_id,subscriber_name,area,amount,collector,pay_method,paper_no,gcash_ref,invoice_no,note,created_at&order=created_at.asc`, 2000);
      live = ordered(Array.isArray(pays) ? pays : []);
      try { await fillAreas(live); } catch(e){}
      liveAt = new Date();
    } catch(e) {} finally { liveBusy = false; }
    liveDraw();
  }
  function liveDraw(){
    const el = document.getElementById('sub-live'); if (!el) return;
    const d = todayPH();
    const btn = 'padding:2px 8px;border:1px solid #e5e7eb;border-radius:5px;background:#fff;font-size:11px;cursor:pointer;color:#6b7280;font-family:inherit';
    const when = liveAt ? 'updated ' + liveAt.toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}) : 'loading…';
    if (!live.length) {
      el.innerHTML = `<div class="cx-card" style="padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <b style="font-size:12px;color:#025AC6">📶 Today's Subscriber Collection</b>
        <span style="display:flex;gap:10px;align-items:center;font-size:12px;color:#6b7280">${liveAt?'📭 No subscriber payments recorded today yet':'Loading…'} <button type="button" id="sl-r" style="${btn}">↻</button></span></div>`;
    } else {
      const by = {};
      live.forEach(p => { const w = whoOf(p), m = methodOf(p);
        by[w] = by[w] || {n:0,total:0,cash:0,gcash:0,unknown:0,areas:new Set()};
        by[w].n++; by[w].total += Number(p.amount||0); by[w][m] += Number(p.amount||0); if (p.area) by[w].areas.add(p.area); });
      const total = live.reduce((s,p)=>s+Number(p.amount||0),0);
      const cash = Object.values(by).reduce((s,x)=>s+x.cash,0), gc = Object.values(by).reduce((s,x)=>s+x.gcash,0);
      const names = Object.keys(by).sort((a,b)=>by[b].total-by[a].total);
      el.innerHTML = `<div class="cx-card">
        <div class="cx-head"><b style="font-size:12px;color:#025AC6">📶 Today's Subscriber Collection</b>
          <span style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <span style="font-size:11px;color:#6b7280">${live.length} payment${live.length===1?'':'s'} · cash ${peso(cash)} · GCash ${peso(gc)} · ${when}</span>
            <span style="font-size:15px;font-weight:800;color:#025AC6">${peso(total)}</span>
            <button type="button" id="sl-r" style="${btn}">↻</button></span></div>
        <div class="cx-cols">${names.map(n=>{ const x=by[n]; return `<div class="cx-col" data-who="${esc(n)}">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">${avatar(n)}<b style="font-size:12px;color:#1e293b">${esc(n)}</b></div>
          <div style="font-size:14px;font-weight:800;color:#025AC6">${peso(x.total)}</div>
          <div style="font-size:10px;color:#6b7280">${x.n} payment${x.n!==1?'s':''} · ${[...x.areas].join(', ')||'—'} <span style="color:#025AC6">▸</span></div>
          <div style="font-size:10px;margin-top:2px"><span style="color:#027e60">Cash ${peso(x.cash)}</span> · <span style="color:#025AC6">GCash ${peso(x.gcash)}</span>${x.unknown?` · <span style="color:#64748b">? ${peso(x.unknown)}</span>`:''}</div></div>`; }).join('')}</div></div>`;
      el.querySelectorAll('.cx-col').forEach(c => c.onclick = () => popup(c.dataset.who, d, live));
    }
    const r = document.getElementById('sl-r'); if (r) r.onclick = () => liveLoad();
  }
  function liveStart(){
    const panel = document.getElementById('panel-subscribers'); if (!panel) return;
    new MutationObserver(() => { if (!document.getElementById('sub-live') || document.getElementById('sub-live').parentNode !== panel) liveHost(); })
      .observe(panel, {childList: true});
    const visible = () => panel.offsetParent !== null || panel.classList.contains('active') || getComputedStyle(panel).display !== 'none';
    // load when the tab opens, then every minute while it is on screen
    new MutationObserver(() => { if (visible() && (!liveAt || Date.now() - liveAt > 30000)) { liveHost(); liveLoad(); } })
      .observe(panel, {attributes: true, attributeFilter: ['class','style']});
    setInterval(() => { if (visible() && document.visibilityState === 'visible') liveLoad(); }, 60000);
    liveHost();
    if (visible()) liveLoad();
  }
  window.subLiveLoad = liveLoad;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', liveStart); else liveStart();
})();
