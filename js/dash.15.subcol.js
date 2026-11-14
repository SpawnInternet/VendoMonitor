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
  // v4.21: a voided payment stays visible (struck through) but never counts
  const isVd = p => !!p.voided_at;
  async function fetchAudit(date){
    try{
      const s = new Date(date + 'T00:00:00+08:00').toISOString();
      const e = new Date(new Date(date + 'T00:00:00+08:00').getTime() + 86400000).toISOString();
      const a = await sb('spawn_collect_audit', `created_at=gte.${s}&created_at=lt.${e}&select=id,payment_id,action,collector,subscriber_name,area,amount,old_value,new_value,reason,created_at&order=created_at.desc`, 500);
      return Array.isArray(a) ? a : [];
    }catch(e){ return []; }
  }
  function auditHtml(list){
    const t = x => new Date(x).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'});
    return `<div class="cx-card"><div class="cx-head"><b>✏️ Edits & voids — Spawn Collect</b><span style="font-size:11px;color:#6b7280">every change the collector approved with his PIN</span></div>
      ${list.length ? `<div class="sc-scroll"><table class="sc-tbl"><thead><tr><th>Time</th><th>Collector</th><th>Subscriber</th><th class="n">Amount</th><th>What changed</th><th>Reason</th></tr></thead><tbody>
      ${list.map(a=>`<tr><td style="white-space:nowrap">${esc(t(a.created_at))}</td><td>${esc(cap(firstName(a.collector)))}</td><td>${esc(a.subscriber_name||'')}${a.area?` <span style="color:#9ca3af">${esc(a.area)}</span>`:''}</td><td class="n"><b>${peso(a.amount)}</b></td>
        <td>${a.action==='void'
          ? `<span class="sc-badge" style="background:#fee2e2;color:#d91934">VOIDED</span> <span class="sc-mono" style="color:#6b7280;text-decoration:line-through">${esc(a.old_value||'')}</span>`
          : `<span class="sc-badge" style="background:#fff1cc;color:#966500">OR FIXED</span> <span class="sc-mono">${esc(a.old_value||'—')} → <b>${esc(a.new_value||'')}</b></span>`}</td>
        <td style="color:#6b7280">${esc(a.reason||'—')}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="sc-empty">No edits or voids on this date</div>'}</div>`;
  }
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

  let rows = [], hrows = [], filt = '', curDate = '', arows = [];
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
      #col-summary{display:grid}
      @media(min-width:701px){#col-summary{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important}}
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
    HARVEST_IDS.forEach(id => { const e = document.getElementById(id); if (e) e.style.display = k === 'harvest' ? (id === 'col-summary' ? 'grid' : '') : 'none'; });
    const s = document.getElementById('cx-subs'), c = document.getElementById('cx-cols');
    if (s) s.style.display = k === 'subs' ? '' : 'none';
    if (c) c.style.display = k === 'cols' ? '' : 'none';
  }

  async function load(date){
    if (!hosts()) return;
    curDate = date;
    document.getElementById('cx-top').innerHTML = '<div class="sc-empty">Loading…</div>';
    const [pays, harv, aud] = await Promise.all([
      sb('subscriber_payments', `payment_date=eq.${date}&select=id,subscriber_id,subscriber_name,area,amount,collector,pay_method,paper_no,gcash_ref,invoice_no,note,created_at,voided_at,voided_by,void_reason&order=created_at.asc`, 2000),
      sb('harvests', `harvest_date=eq.${date}&select=collector,spawn_share,area`, 3000),
      fetchAudit(date)
    ]);
    if (curDate !== date) return;                      // a newer date was picked meanwhile
    rows = ordered(Array.isArray(pays) ? pays : []);
    try { await fillAreas(rows); } catch(e){}
    if (curDate !== date) return;
    hrows = Array.isArray(harv) ? harv : [];
    arows = Array.isArray(aud) ? aud : [];
    drawTop(date); drawSubs(date); drawCols(); setSeg(seg);
  }

  function drawTop(date){
    const rowsL = rows.filter(p=>!isVd(p));
    const h = hrows.reduce((s,r)=>s+Number(r.spawn_share||0),0);
    const t = rowsL.reduce((s,r)=>s+Number(r.amount||0),0);
    const by = {cash:0,gcash:0,unknown:0}; rowsL.forEach(p=>{ by[methodOf(p)] += Number(p.amount||0); });
    const top = document.getElementById('cx-top');
    top.innerHTML = `<div class="cx-top">
      <div class="cx-c" data-k="harvest" style="border-left:5px solid #15803d"><div class="l">🪙 Harvest · Spawn share</div><div class="v" style="color:#15803d">${peso(h)}</div><div class="s">${hrows.length} vendo${hrows.length===1?'':'s'} harvested</div></div>
      <div class="cx-c" data-k="subs" style="border-left:5px solid #025AC6"><div class="l">📶 Subscribers · paid</div><div class="v" style="color:#025AC6">${peso(t)}</div>
        <div class="s">${rowsL.length?`${rowsL.length} payment${rowsL.length===1?'':'s'} · cash ${peso(by.cash)} · GCash ${peso(by.gcash)}${by.unknown?' · ? '+peso(by.unknown):''}`:'no payments'}${arows.length?` · <b style="color:#d97706">${arows.length} edit${arows.length===1?'':'s'}/void${arows.length===1?'':'s'}</b>`:''}</div></div>
      <div class="cx-c tot"><div class="l">Harvest + Subscribers · ${esc(date)}</div><div class="v">${peso(h+t)}</div><div class="s">harvest share + subscribers · all areas</div></div>
    </div>`;
    top.querySelectorAll('.cx-c[data-k]').forEach(c => c.onclick = () => setSeg(c.dataset.k));
  }

  function drawSubs(date){
    const el = document.getElementById('cx-subs');
    if (!rows.length) { el.innerHTML = '<div class="cx-card"><div class="sc-empty">📭 No subscriber payments on this date</div></div>' + auditHtml(arows); return; }
    const by = {};
    rows.filter(p=>!isVd(p)).forEach(p => { const w = whoOf(p), m = methodOf(p);
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
        <div class="sc-scroll" id="cx-list"></div></div>`
      + auditHtml(arows);
    el.querySelectorAll('.cx-col').forEach(c => c.onclick = () => popup(c.dataset.who, date));
    el.querySelectorAll('#cx-chips .cx-chip').forEach(b => b.onclick = () => { filt = b.dataset.c; el.querySelectorAll('#cx-chips .cx-chip').forEach(x=>x.classList.toggle('on', x.dataset.c===filt)); drawList(); });
    drawList();
  }

  function table(list){
    const liveL = list.filter(p=>!isVd(p)), vN = list.length - liveL.length;
    const sum = liveL.reduce((s,p)=>s+Number(p.amount||0),0);
    return `<table class="sc-tbl"><thead><tr><th>Time</th><th>Collector</th><th>Subscriber</th><th>Area</th><th class="n">Amount</th><th>Paid by</th><th>OR / Ref</th><th>Note</th></tr></thead><tbody>`
      + list.map(p=>{ const m = methodOf(p), app = isApp(p), v = isVd(p);
          return `<tr style="${v?'opacity:.5':''}"><td style="white-space:nowrap">${esc(timeOf(p))}</td><td>${esc(whoOf(p))}</td>
            <td style="${v?'text-decoration:line-through':''}">${esc(p.subscriber_name||'')} ${v?`<span class="sc-badge" style="background:#fee2e2;color:#d91934;text-decoration:none">VOID</span>`:`<span class="sc-badge ${app?'sc-app':'sc-sheet'}">${app?'Collect':'Office sheet'}</span>`}</td><td>${esc(p.area||'—')}</td>
            <td class="n"><b style="${v?'text-decoration:line-through':''}">${peso(p.amount)}</b></td>
            <td><span class="sc-badge ${m==='cash'?'sc-cash':m==='gcash'?'sc-gcash':'sc-unk'}">${m==='cash'?'Cash':m==='gcash'?'GCash':'—'}</span></td>
            <td class="sc-mono" style="${v?'text-decoration:line-through':''}">${esc(refOf(p))}</td><td style="color:#6b7280">${v?esc(p.void_reason||'voided'):esc(cleanNote(p))}</td></tr>`; }).join('')
      + `<tr class="tot"><td colspan="4">${liveL.length} payment${liveL.length===1?'':'s'}${vN?` · ${vN} voided`:''}</td><td class="n">${peso(sum)}</td><td colspan="3"></td></tr></tbody></table>`;
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
    rows.forEach(p => { if (isVd(p)) return; add(whoOf(p), methodOf(p), Number(p.amount||0)); });
    const names = Object.keys(per).sort((a,b)=>{ const t=x=>x.harv+x.cash+x.gcash+x.unknown; return t(per[b])-t(per[a]); });
    const tot = names.reduce((a,n)=>{ const x=per[n]; a.h+=x.harv; a.c+=x.cash; a.g+=x.gcash; a.u+=x.unknown; return a; },{h:0,c:0,g:0,u:0});
    document.getElementById('cx-cols').innerHTML = `<div class="cx-card"><div class="cx-head"><b>👥 By collector — harvest + subscribers</b><span style="font-size:11px;color:#6b7280">Cash = to hand in · GCash goes to the GCash account</span></div>
      <div class="sc-scroll">${names.length?`<table class="sc-tbl"><thead><tr><th>Collector</th><th class="n">🪙 Harvest share</th><th class="n">📶 Subs cash</th><th class="n">📶 Subs GCash</th><th class="n">Method not written</th><th class="n">Harvest + Subscribers</th></tr></thead><tbody>
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
    const lv = list.filter(p=>!isVd(p));
    const sum = lv.reduce((s,p)=>s+Number(p.amount||0),0);
    const cash = lv.filter(p=>methodOf(p)==='cash').reduce((s,p)=>s+Number(p.amount||0),0);
    const gc = lv.filter(p=>methodOf(p)==='gcash').reduce((s,p)=>s+Number(p.amount||0),0);
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
  let live = [], liveAt = null, liveBusy = false, liveHarv = [], month = null, monthAt = 0;
  const sumF = (a,f) => a.reduce((s,r)=>s+Number(r[f]||0),0);
  async function allRows(table, params){
    if (typeof window.sbAll === 'function') { const r = await window.sbAll(table, params); return Array.isArray(r) ? r : []; }
    const r = await sb(table, params, 5000); return Array.isArray(r) ? r : [];
  }
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
      const d = todayPH(), m1 = d.slice(0,7) + '-01';
      const [pays, harv] = await Promise.all([
        sb('subscriber_payments', `payment_date=eq.${d}&select=id,subscriber_id,subscriber_name,area,amount,collector,pay_method,paper_no,gcash_ref,invoice_no,note,created_at,voided_at,voided_by,void_reason&order=created_at.asc`, 2000),
        sb('harvests', `harvest_date=eq.${d}&select=collector,spawn_share,area`, 3000)]);
      live = ordered(Array.isArray(pays) ? pays : []);
      liveHarv = Array.isArray(harv) ? harv : [];
      try { await fillAreas(live); } catch(e){}
      if (!month || Date.now() - monthAt > 300000 || month.m1 !== m1) {          // month totals every 5 minutes
        // 2026-10-31: same sources as the Dashboard cards — subscribers from sub_months (BASHANG + payment log + Spawn Collect),
        // harvest from the financial pack (app + BASHANG book, each once; cached, refreshed every 15 min)
        const [mp, mt, pk] = await Promise.all([
          allRows('sub_months', `paid_date=gte.${m1}&paid_date=lte.${d}&select=amount`),
          allRows('sub_months', `paid_date=eq.${d}&select=amount,received_by,source`),
          fetch(`${_SB}/rest/v1/rpc/spawn_financial_pack`, {method:'POST', headers:Object.assign({}, _HDR, {'Content-Type':'application/json'}), body:JSON.stringify({p_from: m1.slice(0,4)+'-01-01'})}).then(r=>r.json()).catch(()=>null)]);
        const hc = pk && Array.isArray(pk.harvest_check) ? pk.harvest_check.find(h => h.ym === d.slice(0,7)) : null;
        month = { m1, subs: sumF(mp,'amount'), subsN: mp.length, subsToday: sumF(mt,'amount'), subsTodayN: mt.length, todayRows: mt,
                  harv: hc ? Number(hc.spawn_share||0) : 0, harvN: hc ? Number(hc.harvests||0) : 0 }; monthAt = Date.now();
      }
      liveAt = new Date();
      if (stTab === 'subs' && book) { bookLoad(true).then(()=>{ if (stTab==='subs') { drawKpis(); drawBookTable(); } }); }
    } catch(e) {} finally { liveBusy = false; }
    liveDraw();
  }
  function chipsHtml(by, color, unit){
    return Object.keys(by).sort((a,b)=>by[b].total-by[a].total).map(n=>{ const x=by[n]; return `<div class="cx-col" data-who="${esc(n)}" style="min-width:132px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">${avatar(n)}<b style="font-size:12px;color:#1e293b">${esc(n)}</b></div>
      <div style="font-size:14px;font-weight:800;color:${color}">${peso(x.total)}</div>
      <div style="font-size:10px;color:#6b7280">${x.n} ${unit}${x.n!==1?'s':''} · ${[...x.areas].join(', ')||'—'}</div>
      ${x.cash!=null?`<div style="font-size:10px;margin-top:2px"><span style="color:#027e60">Cash ${peso(x.cash)}</span> · <span style="color:#025AC6">GCash ${peso(x.gcash)}</span></div>`:''}</div>`; }).join('');
  }
  function liveDraw(){
    const el = document.getElementById('sub-live'); if (!el) return;
    const d = todayPH();
    const when = liveAt ? 'updated ' + liveAt.toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}) : 'loading…';
    // subscribers today
    const lv = live.filter(p=>!isVd(p));
    const bs = {}; lv.forEach(p => { const w = whoOf(p), m = methodOf(p);
      bs[w] = bs[w] || {n:0,total:0,cash:0,gcash:0,unknown:0,areas:new Set()};
      bs[w].n++; bs[w].total += Number(p.amount||0); bs[w][m] += Number(p.amount||0); if (p.area) bs[w].areas.add(p.area); });
    // when the payment log has nothing yet but BASHANG does, build the per-person chips from the book rows
    if (!lv.length && month && Array.isArray(month.todayRows) && month.todayRows.length) {
      month.todayRows.forEach(p => { const w = cap(firstName(p.received_by || 'Office'));
        bs[w] = bs[w] || {n:0,total:0,cash:null,gcash:0,unknown:0,areas:new Set()};
        bs[w].n++; bs[w].total += Number(p.amount||0); bs[w].areas.add('BASHANG'); });
    }
    const logT = sumF(lv,'amount');
    const sT = (month && month.subsToday > logT) ? month.subsToday : logT;   // all sources (BASHANG + log + Spawn Collect)
    const sN = (month && month.subsTodayN > lv.length) ? month.subsTodayN : lv.length;
    // harvest today
    const bh = {}; liveHarv.forEach(r => { const w = cap(firstName(r.collector));
      bh[w] = bh[w] || {n:0,total:0,areas:new Set()}; bh[w].n++; bh[w].total += Number(r.spawn_share||0); if (r.area) bh[w].areas.add(r.area); });
    const hT = sumF(liveHarv,'spawn_share');
    const monthName = new Date(d+'T12:00:00').toLocaleDateString('en-PH',{month:'long'});
    el.innerHTML = `
      <div class="lv-grid">
        <div class="cx-card lv-h"><div class="cx-head"><b style="color:#15803d">🪙 Harvest today</b><span class="lv-amt" style="color:#15803d">${peso(hT)}</span></div>
          <div class="lv-sub">${liveHarv.length} vendo${liveHarv.length===1?'':'s'} harvested · Spawn share · entered in the app today</div>
          <div class="cx-cols">${liveHarv.length?chipsHtml(bh,'#15803d','vendo'):'<span class="lv-none">No harvest recorded yet today</span>'}</div></div>
        <div class="cx-card lv-s"><div class="cx-head"><b style="color:#025AC6">📶 Subscribers today</b><span class="lv-amt" style="color:#025AC6">${peso(sT)}</span></div>
          <div class="lv-sub">${sN} payment${sN===1?'':'s'}${sN>lv.length?' · '+lv.length+' in the payment log, the rest from BASHANG':''} · cash ${peso(sumF(lv.filter(p=>methodOf(p)==='cash'),'amount'))} · GCash ${peso(sumF(lv.filter(p=>methodOf(p)==='gcash'),'amount'))} · tap a name for the list</div>
          <div class="cx-cols">${Object.keys(bs).length?chipsHtml(bs,'#025AC6','payment'):'<span class="lv-none">No subscriber payment yet today</span>'}</div></div>
      </div>
      <div class="lv-month">
        <div><span>📅 Today · Harvest + Subscribers</span><b>${peso(hT+sT)}</b></div>
        <div><span>🪙 Harvest · ${esc(monthName)} so far <small style="color:#9ca3af">app + book, 15-min refresh</small></span><b style="color:#15803d">${month?peso(month.harv):'…'}</b></div>
        <div><span>📶 Subscribers · ${esc(monthName)} so far</span><b style="color:#025AC6">${month?peso(month.subs):'…'}</b></div>
        <div class="tot"><span>💰 Harvest + Subscribers · ${esc(monthName)} so far</span><b>${month?peso(month.harv+month.subs):'…'}</b></div>
        <button type="button" id="sl-r" title="Refresh">↻ ${esc(when)}</button>
      </div>`;
    el.querySelectorAll('.lv-s .cx-col').forEach(c => c.onclick = () => popup(c.dataset.who, d, live));
    el.querySelectorAll('.lv-h .cx-col').forEach(c => c.onclick = () => { const b = document.querySelector('[data-panel="harvest"]'); if (b) b.click(); });
    const r = document.getElementById('sl-r'); if (r) r.onclick = () => { monthAt = 0; liveLoad(); };
  }
  function liveStart(){
    const panel = document.getElementById('panel-subscribers'); if (!panel) return;
    new MutationObserver(() => { if (!document.getElementById('sub-live') || document.getElementById('sub-live').parentNode !== panel) { liveHost(); if (typeof stShell==='function' && stTab==='book') stShell(false); } })
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

  // ══════════════════════════════════════════════════════════
  // SUBSCRIBERS TAB — organized like the Harvest tab
  //   live card (above) → section bar → section content
  //   👥 Subscribers · ⏳ Late · 🧾 Payments · 📶 No internet · 📒 Old book
  // Numbers come from v_sub_book = the same month table Spawn Collect uses.
  // ══════════════════════════════════════════════════════════
  const ST_TABS_OLD = [['pck','📒 Payments'],['subs','👥 Subscribers'],['late','⏳ Late'],['pays','🧾 Payments'],['chk','✅ Office check'],['exc','⚠ Exceptions'],['rcp','📷 Receipts'],['gca','💳 GCash audit'],['gcu','💰 GCash not on record'],['gcd','📅 GCash per day'],['ded','📶 No internet'],['book','📒 Old book']];
  // 🔍 GCash review (2026-11-09): when it answers (switch gcash_review on + gateway line), it takes the GCash place and the
  // three older GCash lists move to the end (still there for history). Otherwise the bar is exactly as before.
  let gcrOk;   // undefined = not asked yet, null = asking, true/false = answer
  const ST_TABS_REVIEW = [['pck','📒 Payments'],['subs','👥 Subscribers'],['late','⏳ Late'],['pays','🧾 Payments'],['chk','✅ Office check'],['gcr','🔍 GCash review'],['exc','⚠ Exceptions'],['rcp','📷 Receipts'],['ded','📶 No internet'],['book','📒 Old book'],['gca','💳 GCash audit (all)'],['gcu','💰 Not on record (all)'],['gcd','📅 GCash per day']];
  const stTabs = () => gcrOk === true ? ST_TABS_REVIEW : ST_TABS_OLD;
  let stTab = (()=>{ try { return localStorage.getItem('sub_tab') || 'pck'; } catch(e){ return 'pck'; } })();   // 2026-11-14: the book opens first
  let book = null, bookAt = 0, bookBusy = false, textSide = null;   // textSide: v_sub_text rows by subscriber id (2026-11-07)
  let bf = {state:'', area:'', q:'', how:''};
  let payDate = '', payRows = [], payFilt = '';
  const STATE = {
    today:{l:'Paid today',c:'#0f766e',b:'#ccfbf1'},
    paid:{l:'Paid',c:'#027e60',b:'#e7f6f1'}, partial:{l:'Partly paid',c:'#966500',b:'#fff1cc'}, late:{l:'Late',c:'#d91934',b:'#fee2e2'},
    due_soon:{l:'Due within 5 days',c:'#b45309',b:'#fff7ed'}, upcoming:{l:'Not due yet',c:'#475569',b:'#f1f5f9'},
    disconnected:{l:'Disconnected',c:'#64748b',b:'#e2e8f0'}, free:{l:'Free',c:'#7c3aed',b:'#f3e8ff'},
    no_rate:{l:'No rate',c:'#64748b',b:'#f1f5f9'}, no_due_day:{l:'No due day',c:'#64748b',b:'#f1f5f9'} };
  const howOf = r => r.pay_mode==='gcash'?'GCash':r.pay_mode==='cash'?'Cash':r.pay_mode==='mixed'?'Mixed':r.pay_mode==='office'?'Office':'?';
  const short = d => d ? new Date(d+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'2-digit'}) : '—';

  function stCss(){
    if (document.getElementById('st-style')) return;
    const s = document.createElement('style'); s.id = 'st-style';
    s.textContent = `
      #st-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;margin:0 12px 12px}
      #st-bar .t{font-size:15px;font-weight:800;color:#025AC6;margin-right:6px}
      #st-bar button{padding:7px 12px;border:1px solid #e5e7eb;border-radius:9px;background:#fff;font-size:13px;font-weight:700;color:#334155;cursor:pointer;font-family:inherit}
      #st-bar button.on{background:#025AC6;border-color:#025AC6;color:#fff}
      #st-body{padding:0 12px 80px}
      .st-k{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-bottom:12px}
      @media(max-width:900px){.st-k{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:520px){.st-k{grid-template-columns:repeat(2,minmax(0,1fr))}}
      .st-k div{background:#fff;border:1px solid #e5e7eb;border-bottom:3px solid var(--c);border-radius:12px;padding:9px 12px;cursor:pointer}
      .st-k div.on{outline:2px solid var(--c)}
      .st-k b{display:block;font-size:20px;font-weight:800;color:var(--c);font-variant-numeric:tabular-nums}
      .st-k span{font-size:11px;color:#6b7280;line-height:1.35;display:block}
      .st-f{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
      .st-f select,.st-f input{padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:9px;font:inherit;font-size:13px;background:#fff}
      .st-f input{flex:1;min-width:180px}
      .st-badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
      .lv-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      @media(max-width:900px){.lv-grid{grid-template-columns:1fr}}
      .lv-grid .cx-card{margin-bottom:0}
      .lv-amt{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
      .lv-sub{padding:8px 14px 0;font-size:11.5px;color:#6b7280}
      .lv-none{font-size:12px;color:#9ca3af;padding:6px 0}
      .lv-h .cx-col{background:#f2fbf5;border-color:#c9ecd6}.lv-h .cx-col:hover{border-color:#15803d}
      .lv-month{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;gap:8px;margin:12px 0}
      @media(max-width:900px){.lv-month{grid-template-columns:1fr 1fr}}
      .lv-month>div{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:9px 12px}
      .lv-month span{display:block;font-size:11px;color:#6b7280;font-weight:600}
      .lv-month b{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}
      .lv-month .tot{color:#fff;border:0;background:radial-gradient(90% 70% at 10% -10%,rgba(255,255,255,.28),rgba(255,255,255,0) 60%),linear-gradient(135deg,#0146a0 0%,#025ac6 55%,#2b2295 100%)}
      .lv-month .tot span{color:rgba(255,255,255,.85)}
      .lv-month button{border:1px solid #e5e7eb;border-radius:12px;background:#fff;color:#6b7280;font-size:11px;cursor:pointer;padding:0 12px;font-family:inherit}`;
    document.head.appendChild(s);
  }
  function stShell(withBody){
    const panel = document.getElementById('panel-subscribers'); if (!panel) return null;
    css(); stCss();
    if (withBody) { panel.innerHTML = ''; }
    liveHost();
    let bar = document.getElementById('st-bar');
    if (!bar || bar.parentNode !== panel) {
      bar = document.createElement('div'); bar.id = 'st-bar';
      const live = document.getElementById('sub-live');
      panel.insertBefore(bar, live ? live.nextSibling : panel.firstChild);
    }
    bar.innerHTML = '<span class="t">📶 Subscribers</span>' + stTabs().map(([k,l])=>`<button type="button" data-k="${k}" class="${stTab===k?'on':''}">${l}</button>`).join('');
    bar.querySelectorAll('button').forEach(b => b.onclick = () => stGo(b.dataset.k));
    if (gcrOk === undefined) {   // once per page load: is the GCash review on? (no rows = off, or the gateway line is missing)
      gcrOk = null;
      sb('v_gcash_review_marked', 'select=item_key', 1).then(r => { gcrOk = Array.isArray(r) && r.length > 0; }).catch(() => { gcrOk = false; })
        .then(() => { if (gcrOk && document.getElementById('st-bar')) stShell(false); });
    }
    if (withBody) { const body = document.createElement('div'); body.id = 'st-body'; panel.appendChild(body); return body; }
    return null;
  }
  const origInit = window.subscribersInit;
  function stGo(k){
    stTab = k; try { localStorage.setItem('sub_tab', k); } catch(e){}
    if (k === 'book') { stShell(false); if (typeof origInit === 'function') origInit(); return; }
    const body = stShell(true);
    body.innerHTML = '<div class="sc-empty">Loading…</div>';
    if (k === 'subs' || k === 'late') bookLoad().then(()=>{ if (stTab===k) (k==='subs'?drawBook:drawLate)(); });
    else if (k === 'pays') payLoad(payDate || todayPH());
    else if (k === 'ded') dedLoad();
    else if (k === 'chk') chkLoad();
    else if (k === 'gcr') gcrLoad();
    else if (k === 'rcp') rcpLoad();
    else if (k === 'pck') { if (typeof window.pckTabLoad === 'function') window.pckTabLoad(); else body.innerHTML = '<div class="sc-empty">✔ The payments check script is not loaded.</div>'; }
    else if (k === 'exc') { if (typeof window.excTabLoad === 'function') window.excTabLoad(); else body.innerHTML = '<div class="sc-empty">⚠ The exceptions script is not loaded.</div>'; }
    else if (k === 'gca') gcaLoad();
    else if (k === 'gcu') gcuLoad();
    else if (k === 'gcd') gcdLoad();
  }
  async function bookLoad(force){
    if (book && !force && Date.now() - bookAt < 60000) return;
    if (bookBusy) return; bookBusy = true;
    try {
      const [r, t] = await Promise.all([sb('v_sub_book', 'select=*&order=name.asc', 3000), sb('v_sub_text', 'select=*', 3000).catch(() => null)]);
      if (Array.isArray(r)) { book = r; bookAt = Date.now(); }
      if (Array.isArray(t)) { textSide = {}; t.forEach(x => { textSide[x.subscriber_id] = x; }); }
    }
    finally { bookBusy = false; }
  }

  // 👥 Subscribers — who paid TODAY first (live), then late, partly paid, due soon…
  function paidToday(){
    const m = {}; live.forEach(p => { if (!p.subscriber_id || isVd(p)) return; const x = m[p.subscriber_id] = m[p.subscriber_id] || {amt:0, at:'', who:whoOf(p), how:methodOf(p)};
      x.amt += Number(p.amount||0); if (String(p.created_at||'') > x.at) x.at = String(p.created_at||''); }); return m;
  }
  function drawBook(){
    const body = document.getElementById('st-body'); if (!body || !book) return;
    const areas = [...new Set(book.map(r=>r.area||'—'))].sort();
    body.innerHTML = `<div class="st-k" id="st-k"></div>
      <div class="st-f"><select id="st-area"><option value="">All areas</option>${areas.map(a=>`<option${bf.area===a?' selected':''}>${esc(a)}</option>`).join('')}</select>
        <select id="st-how"><option value="">Any payment way</option>${['Cash','GCash','Mixed','Office','?'].map(x=>`<option${bf.how===x?' selected':''}>${x}</option>`).join('')}</select>
        <input id="st-q" type="search" placeholder="🔍 Search name, account no. or phone" value="${esc(bf.q)}"></div>
      <div class="cx-card"><div class="sc-scroll" id="st-tbl"></div></div>`;
    body.querySelector('#st-area').onchange = e => { bf.area = e.target.value; drawBookTable(); };
    body.querySelector('#st-how').onchange = e => { bf.how = e.target.value; drawBookTable(); };
    body.querySelector('#st-q').oninput = e => { bf.q = e.target.value.trim().toLowerCase(); drawBookTable(); };
    drawKpis(); drawBookTable();
  }
  function stateOf(r, pt){ return pt[r.id] ? 'today' : r.state; }
  // 📱 texting side of one subscriber (from v_sub_text): what Spawn Text's Month tab used to show
  const whenShort = ts => ts ? new Date(ts).toLocaleDateString('en-PH', { month:'short', day:'numeric', timeZone:'Asia/Manila' }) : '';
  function textCell(t, st){
    if (!t) return '<span style="color:#cbd5e1">—</span>';
    const bits = [];
    if (t.to_check) bits.push('<span class="st-badge" style="background:#e0ecff;color:#0146a0">💳 To check</span>');
    else if (t.promise_date) bits.push('<span class="st-badge" style="background:#fff7ed;color:#9a3412">🤝 Promised ' + esc(short(String(t.promise_date).slice(0,10))) + '</span>');
    if (Number(t.reminders_month) > 0) bits.push('Texted ' + Number(t.reminders_month) + '× · last ' + esc(whenShort(t.last_reminder_at)));
    else if (st === 'late' || st === 'due_soon' || st === 'partial') bits.push(t.can_text ? '<span style="color:#9a3412">not texted yet</span>' : '<span style="color:#b91c1c">📵 no number</span>');
    if (Number(t.failed_30d) > 0) bits.push('<span style="color:#b91c1c">' + Number(t.failed_30d) + ' failed</span>');
    if (Number(t.unanswered) > 0) bits.push('<span style="color:#0146a0">💬 ' + Number(t.unanswered) + ' waiting</span>');
    return bits.length ? bits.join('<br>') : '<span style="color:#9ca3af">—</span>';
  }
  function drawKpis(){
    const el = document.getElementById('st-k'); if (!el || !book) return;
    const pt = paidToday(), list = book.map(r => ({r, s: stateOf(r, pt)}));
    const n = k => list.filter(x=>x.s===k), owedSum = a => a.reduce((s,x)=>s+Number(x.r.owed||0),0);
    const todayAmt = n('today').reduce((s,x)=>s+(pt[x.r.id]?pt[x.r.id].amt:0),0);
    const K = [['today','✓ Paid today',n('today').length,peso(todayAmt)],
               ['paid','Paid this month',n('paid').length+n('today').length,'all paid in full'],
               ['partial','Partly paid',n('partial').length,'balance '+peso(n('partial').reduce((s,x)=>s+Number(x.r.this_balance||0),0))],
               ['late','Late',n('late').length,peso(owedSum(n('late')))+' to collect'],
               ['due_soon','Due within 5 days',n('due_soon').length,'remind them'],
               ['upcoming','Not due yet',n('upcoming').length,'later this month'],
               ['disconnected','Disconnected',n('disconnected').length,'no reminders']];
    el.innerHTML = K.map(([k,l,c,s])=>`<div data-k="${k}" class="${bf.state===k?'on':''}" style="--c:${STATE[k].c}" title="Click to show only these"><b>${c}</b><span>${l}${s?'<br>'+s:''}</span></div>`).join('');
    el.querySelectorAll('div').forEach(d => d.onclick = () => { bf.state = bf.state===d.dataset.k ? '' : d.dataset.k; drawKpis(); drawBookTable(); });
  }
  function drawBookTable(){
    const el = document.getElementById('st-tbl'); if (!el || !book) return;
    const pt = paidToday();
    const ORDER = ['today','late','partial','due_soon','upcoming','paid','free','no_rate','no_due_day','disconnected'];
    let list = book.filter(r => { const s = stateOf(r, pt);
      return (!bf.state || s===bf.state || (bf.state==='paid' && s==='today')) && (!bf.area || (r.area||'—')===bf.area) && (!bf.how || howOf(r)===bf.how)
        && (!bf.q || (String(r.name||'')+' '+String(r.acct_no||'')+' '+String(r.phone||'')).toLowerCase().includes(bf.q)); });
    list.sort((a,b)=>{ const sa=stateOf(a,pt), sb_=stateOf(b,pt);
      if (sa==='today' && sb_==='today') return String(pt[b.id].at).localeCompare(String(pt[a.id].at));     // newest payment first
      return (ORDER.indexOf(sa)-ORDER.indexOf(sb_)) || (Number(b.owed)-Number(a.owed)) || String(a.name).localeCompare(String(b.name)); });
    const shown = list.slice(0, 600);
    el.innerHTML = `<table class="sc-tbl"><thead><tr><th>Subscriber</th><th>Area</th><th class="n">Due day</th><th class="n">Monthly</th><th>This month</th><th>Still owes</th><th>Last paid</th>${textSide ? '<th>📱 Texting</th>' : ''}<th>Pays by</th><th>Collector</th></tr></thead><tbody>`
      + shown.map(r => { const st = stateOf(r, pt), s = STATE[st] || STATE.upcoming, t = pt[r.id];
          const tm = st==='today' ? `✓ Paid today ${t.at?new Date(t.at).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}):''} · ${peso(t.amt)} · ${esc(t.who)}`
                   : st==='paid' ? 'Paid '+peso(r.this_paid) : st==='partial' ? 'Paid '+peso(r.this_paid)+' · balance '+peso(r.this_balance) : s.l;
          const owes = Number(r.owed)>0 ? `<b style="color:#d91934">${peso(r.owed)}</b>${(r.unpaid_months||[]).length?' <span style="color:#6b7280">'+esc((r.unpaid_months||[]).join(', '))+'</span>':''}` : '<span style="color:#9ca3af">—</span>';
          return `<tr class="sd-row-click" onclick="window.subDetail&&window.subDetail(${r.id})"${st==='today'?' style="background:#f0fdfa"':''}><td><b class="sd-name" data-sd="${r.id}" style="color:#0146a0">${esc(r.name||'')}</b>${r.acct_no?` <span style="color:#9ca3af">#${esc(r.acct_no)}</span>`:''}</td><td>${esc(r.area||'—')}</td>
            <td class="n">${r.due_day||'—'}</td><td class="n">${r.rate?peso(r.rate):'—'}</td>
            <td><span class="st-badge" style="background:${s.b};color:${s.c}">${tm}</span></td><td>${owes}</td>
            <td style="white-space:nowrap">${r.last_paid?short(r.last_paid)+' · '+peso(r.last_amount)+(r.last_for?' <span style="color:#6b7280">for '+new Date(String(r.last_for).slice(0,10)+'T12:00:00').toLocaleDateString('en-PH',{month:'short'})+'</span>':''):'—'}</td>${textSide ? '<td style="font-size:12px">' + textCell(textSide[r.id], st) + '</td>' : ''}<td>${esc(howOf(r))}</td><td>${esc(r.usual_collector||'—')}</td></tr>`; }).join('')
      + `<tr class="tot"><td colspan="5">${list.length} subscriber${list.length===1?'':'s'}${list.length>shown.length?' (first '+shown.length+' shown)':''}</td><td>${peso(list.reduce((s,r)=>s+Number(r.owed||0),0))} still owed</td><td colspan="${textSide ? 4 : 3}"></td></tr></tbody></table>`;
  }

  // ── Subscriber detail (2026-11-03): tap a name → a page like the vendo one — Info · Ledger · Contact · Spawn Text
  // the name carries its own onclick (only the name cells in the Subscribers / Late tables have it)
  const mon = ym => new Date(String(ym).slice(0,10)+'T12:00:00').toLocaleDateString('en-PH',{month:'short',year:'2-digit'});
  const dt = ts => ts ? new Date(ts).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}) : '';
  const srcL = { bashang:'BASHANG only', log:'sheet only', app:'Spawn Collect', 'bashang+log':'BASHANG + sheet', 'bashang+app':'BASHANG + app' };
  let sdCssOn = false;
  function sdCss(){ if (sdCssOn) return; sdCssOn = true; const st = document.createElement('style'); st.textContent = `
    #sd-page{position:fixed;inset:0;z-index:20000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:14px;font-family:Inter,system-ui,sans-serif;color:#1f2937}
    #sd-page .sd-win{background:#eef2f8;border-radius:16px;width:100%;max-width:980px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,42,.35)}
    #sd-page .sd-scroll{overflow:auto;flex:1;min-height:0}
    #sd-page .sd-top{flex:none;background:linear-gradient(120deg,#0146a0 0%,#025ac6 70%,#1f74e0 100%);color:#fff;padding:14px 20px;display:flex;align-items:center;gap:12px}
    #sd-page .sd-top b{font-size:17px}#sd-page .sd-top small{display:block;font-size:12px;opacity:.9}
    #sd-page .sd-tabs{flex:none;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;gap:4px;padding:0 12px}
    #sd-page .sd-tabs button{border:0;background:none;padding:14px 16px;font:600 14px Inter,system-ui,sans-serif;color:#4b5563;cursor:pointer;border-bottom:2px solid transparent}
    #sd-page .sd-tabs button.on{color:#025ac6;border-bottom-color:#025ac6}
    #sd-page .sd-body{padding:14px 14px 24px}
    #sd-page .sd-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:14px}
    #sd-page .sd-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px 28px}@media(max-width:760px){#sd-page .sd-grid{grid-template-columns:1fr}}
    #sd-page .sd-h{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#374151;margin:4px 0 8px}
    #sd-page .sd-h.pink{background:#f3ecfb;border-left:3px solid #c01176;padding:6px 10px;color:#7c1a56;border-radius:4px}
    #sd-page .sd-h.green{background:#ecfdf5;border-left:3px solid #028867;padding:6px 10px;color:#065f46;border-radius:4px}
    #sd-page .sd-row{display:flex;align-items:center;gap:10px;border:1px solid #e5e7eb;border-radius:8px;padding:9px 12px;margin-bottom:8px;font-size:14px}
    #sd-page .sd-row span:first-child{flex:0 0 130px;color:#6b7280;font-size:13px}#sd-page .sd-row span:last-child{flex:1;min-width:0;overflow-wrap:anywhere;font-weight:600}
    #sd-page .sd-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px}
    #sd-page .sd-kpi div{background:#f8fafc;border-radius:10px;padding:10px 12px}#sd-page .sd-kpi b{display:block;font-size:20px;font-weight:800}#sd-page .sd-kpi small{color:#6b7280;font-size:11px}
    #sd-page .sd-tag{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700}
    #sd-page .sd-msg{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px}#sd-page .sd-msg .b{flex:1;min-width:0;overflow-wrap:anywhere;white-space:pre-wrap}
    #sd-page .sd-msg.in .b{background:#f1f5f9;border-radius:10px;padding:8px 10px}#sd-page .sd-msg.out .b{background:#e0ecff;border-radius:10px;padding:8px 10px}
    #sd-page .sd-msg small{flex:0 0 120px;color:#6b7280;font-size:11px;padding-top:8px}
    #sd-page a.sd-btn{background:rgba(255,255,255,.18);color:#fff;text-decoration:none;font-weight:800;font-size:12px;padding:7px 11px;border-radius:999px;white-space:nowrap}
    #sd-page .sd-notes{align-items:flex-start;padding:7px 12px}
    #sd-page .sd-notes .nt{font-size:12px;font-weight:500;color:#475569;line-height:1.35}
    #sd-page .sd-notes .nt div{padding:1px 0}#sd-page .sd-notes .nt div+div{border-top:1px dashed #e5e7eb}
    #sd-page .sd-notes .nt.fold div:nth-child(n+3){display:none}
    #sd-page .nt-more{border:0;background:none;color:#025ac6;font:700 11px Inter,system-ui,sans-serif;padding:2px 0 0;cursor:pointer}
    tr.sd-row-click{cursor:pointer}tr.sd-row-click:hover td{background:#eef4ff}
    #sd-page .sd-x{width:34px;height:34px;border-radius:999px;border:0;background:rgba(255,255,255,.2);color:#fff;font-size:16px;cursor:pointer}`; document.head.appendChild(st); }
  async function subDetail(id){
    if (document.getElementById('sd-page') && subDetail._busy) return;
    sdCss();
    let pg = document.getElementById('sd-page'); if (pg) pg.remove();
    pg = document.createElement('div'); pg.id = 'sd-page';
    pg.innerHTML = '<div class="sd-win"><div style="padding:40px;text-align:center;color:#6b7280">Loading subscriber…</div></div>';
    document.body.appendChild(pg);
    const close = () => { pg.remove(); document.removeEventListener('keydown', onKey); };
    pg.onclick = ev => { if (ev.target === pg) close(); };
    const onKey = ev => { if (ev.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const bk = (book||[]).find(r => r.id === id) || {};
    let sub, months = [], pays = [], deds = [], nums = [], msgs = [], proms = [], tasks = [], gcx = null, gca = null, evd = null;
    const q = (t, p, n) => sb(t, p, n).then(r => Array.isArray(r) ? r : []).catch(() => []);
    try {
      [sub, months, pays, deds, nums, msgs, proms, tasks, gcx, gca, evd] = await Promise.all([
        sb('subscribers', `id=eq.${id}&select=id,name,acct_no,area,address,phone,fb_name,due_day,pay_pref_day,monthly_amount,plan_type,plan_mbps,status,billing_status,billing_note,pay_mode,usual_collector,date_installed,installer,pppoe_username,pppoe_server,is_online,last_seen_online,lat,lng,gps_place,gps_updated_at,gps_source,is_vendo_owner,notes,photo_url`, 1),
        q('sub_months', `subscriber_id=eq.${id}&select=ym,paid_date,amount,or_no,received_by,source,check_flag,balance&order=ym.desc`, 36),
        q('subscriber_payments', `subscriber_id=eq.${id}&select=id,payment_date,amount,collector,pay_method,paper_no,gcash_ref,bank_ref,invoice_no,coverage_from,coverage_to,coverage_months,note,voided_at,void_reason&order=payment_date.desc,id.desc`, 60),
        q('sub_deductions', `subscriber_id=eq.${id}&select=ym,days,amount,reason,approved_by,voided_at&order=ym.desc`, 24),
        q('remind_contacts', `subscriber_id=eq.${id}&select=channel,address,is_primary,verified_at,verified_by,source,created_at&order=is_primary.desc,created_at.asc`, 20),
        q('remind_messages', `subscriber_id=eq.${id}&select=direction,address,body,intent,template,ym,status,error,created_at,sent_at&order=created_at.desc`, 40),
        q('remind_promises', `subscriber_id=eq.${id}&select=promised_date,amount,months,status,note,created_at,resolved_at&order=created_at.desc`, 10),
        q('remind_tasks', `subscriber_id=eq.${id}&select=kind,reason,status,created_by,created_at,done_by,done_at,note&order=created_at.desc`, 10),
        // (2026-11-06) 💳 GCash: every GCash ref they texted + its proof in the GCash statements (view v_sub_gcash). null = not connected yet
        sb('v_sub_gcash', `subscriber_id=eq.${id}&select=*&order=texted_at.desc`, 30).then(r => Array.isArray(r) ? r : null).catch(() => null),
        // every GCash ref in the system for them (payment record, payments, texted) checked against GCash (view v_sub_gcash_refs). null = not connected yet
        sb('v_sub_gcash_refs', `subscriber_id=eq.${id}&select=*&order=paid_date.desc.nullslast`, 200).then(r => Array.isArray(r) ? r : null).catch(() => null),
        // (2026-11-12) 📷 Evidence per month: every claim for them — book, app, text, Facebook screenshot — with the export's verdict and the recorder's note (view v_sub_evidence_v1). null = not connected yet
        sb('v_sub_evidence_v1', `subscriber_id=eq.${id}&select=*&order=claimed_on.desc.nullslast`, 100).then(r => Array.isArray(r) ? r : null).catch(() => null)
      ]);
      sub = Array.isArray(sub) ? sub[0] : sub;
    } catch (e) { pg.innerHTML = `<div class="sd-win"><div style="padding:24px;color:#d91934">Could not load: ${esc(e.message)}</div></div>`; return; }
    if (!sub) { pg.innerHTML = '<div class="sd-win"><div style="padding:24px;color:#d91934">Subscriber not found.</div></div>'; return; }
    const hasGps = sub.lat != null && sub.lng != null, gmaps = hasGps ? `https://www.google.com/maps?q=${sub.lat},${sub.lng}` : '';
    const stt = STATE[bk.state] || null;
    const row = (k, v) => `<div class="sd-row"><span>${k}</span><span>${v == null || v === '' ? '<span style="color:#9ca3af;font-weight:500">—</span>' : v}</span></div>`;
    // notes: small grey lines, one per entry (split on "|"), folded to 2 lines with a tap to open
    const notesRow = n => { const parts = String(n || '').split('|').map(x => x.trim()).filter(Boolean);
      if (!parts.length) return row('Notes', '');
      return `<div class="sd-row sd-notes"><span>Notes</span><span><div class="nt ${parts.length > 2 ? 'fold' : ''}">${parts.map(x => `<div>${esc(x)}</div>`).join('')}</div>${parts.length > 2 ? `<button type="button" class="nt-more" onclick="this.previousElementSibling.classList.toggle('fold');this.textContent=this.previousElementSibling.classList.contains('fold')?'show all ${parts.length}':'show less'">show all ${parts.length}</button>` : ''}</span></div>`; };
    const live = pays.filter(x => !x.voided_at), vd = pays.filter(x => x.voided_at);
    const lifetime = live.reduce((a,x)=>a+Number(x.amount||0),0);
    const dd = sub.due_day ? `every ${sub.due_day}${sub.pay_pref_day && sub.pay_pref_day !== sub.due_day ? ' · prefers the ' + sub.pay_pref_day : ''}` : '';
    const tabs = [['info','Info'],['ledger','Ledger'],['contact','Contact'],['text','📱 Spawn Text'],['gcash','💳 GCash' + (gca && gca.length ? ' ' + gca.length : gcx && gcx.length ? ' ' + gcx.length : '')]];
    // 💳 GCash proof for one texted ref — same reading as Spawn Text's badge
    const gcProof = g => {
      const when = g.tx_at ? ' · ' + dt(g.tx_at) : '';
      if (!g.given) return ['#fff7ed', '#9a3412', '⚠ No 13-digit ref was written'];
      if (g.match === 'several') return ['#fff7ed', '#9a3412', '⚠ Several GCash payments end in ' + g.given];
      if (!g.found) return ['#fef2f2', '#b91c1c', '✗ Not in the GCash statements'];
      if (g.direction !== 'in') return ['#fff7ed', '#9a3412', '⚠ Money sent OUT of GCash · ' + peso(g.amount) + when];
      const from = g.from_theirs ? ' · from their number' : g.from_last4 ? ' · from …' + g.from_last4 : '';
      if (!g.fits) return ['#fff7ed', '#9a3412', '⚠ In GCash: ' + peso(g.amount) + ' — monthly is ' + peso(g.due) + when + from];
      return ['#ecfdf5', '#065f46', '✓ In GCash: ' + peso(g.amount) + when + from];
    };
    const gcWho = g => g.status === 'open' ? ['#fff7ed', '#9a3412', 'To check'] : g.confirmed_how === 'system' ? ['#e0ecff', '#0146a0', 'Confirmed by the system']
      : g.confirmed_how === 'book' ? ['#ecfdf5', '#065f46', 'Confirmed — in BASHANG' + (g.confirmed_by ? ' (' + g.confirmed_by + ')' : '')]
      : g.status === 'broken' ? ['#fef2f2', '#b91c1c', 'Marked not found' + (g.confirmed_by ? ' by ' + g.confirmed_by : '')] : ['#ecfdf5', '#065f46', 'Confirmed' + (g.confirmed_by ? ' by ' + g.confirmed_by : '')];
    // one ref from the whole system: is it in the GCash statements?
    const GCV = { ok:['#ecfdf5','#065f46'], amount_diff:['#fff7ed','#9a3412'], money_out:['#fff7ed','#9a3412'], not_found:['#fef2f2','#b91c1c'], before:['#f1f5f9','#475569'], after:['#f1f5f9','#475569'], bank_ref:['#eef2ff','#3730a3'] };
    const gcAllProof = g => {
      const when = g.tx_at ? ' · ' + dt(g.tx_at) : '', from = g.from_last4 ? ' · from …' + g.from_last4 : '';
      const t = g.verdict === 'ok' ? '✓ In GCash: ' + peso(g.gcash_amount) + when + from
        : g.verdict === 'amount_diff' ? '⚠ In GCash: ' + peso(g.gcash_amount) + ' — recorded ' + peso(g.recorded_amount) + when + from
        : g.verdict === 'money_out' ? '⚠ This ref is money sent OUT of GCash · ' + peso(g.gcash_amount) + when
        : g.verdict === 'before' ? 'Paid before the GCash statements start (' + short(String(g.statements_from).slice(0,10)) + ') — cannot check'
        : g.verdict === 'after' ? '📄 No export file yet (last export covers up to ' + short(String(g.statements_to).slice(0,10)) + ')'
        : g.verdict === 'bank_ref' ? '🏦 Bank transfer ref — paid to the bank, not GCash; check it in the bank'
        : '✗ Not in the GCash statements';
      return [...(GCV[g.verdict] || GCV.not_found), t];
    };
    const gcChip = (b, c, t) => `<span class="sd-tag" style="background:${b};color:${c};margin:0 6px 6px 0">${t}</span>`;
    const gcNotes = g => gcNoteList(g).map(t => '<br><span style="font-size:11px;color:#6b7280">' + esc(t) + '</span>').join('');
    const gcAllT = () => {
      const n = k => gca.filter(g => g.verdict === k).length, shared = gca.filter(g => g.other_subs > 0).length, diff = n('amount_diff') + n('money_out'), out = n('before') + n('after'), bank = n('bank_ref');
      const chips = gcChip('#ecfdf5','#065f46','✓ ' + n('ok') + ' match') + (diff ? gcChip('#fff7ed','#9a3412','⚠ ' + diff + ' different') : '')
        + (n('not_found') ? gcChip('#fef2f2','#b91c1c','✗ ' + n('not_found') + ' not found') : '') + (out ? gcChip('#f1f5f9','#475569', out + ' outside the statements') : '') + (bank ? gcChip('#eef2ff','#3730a3', '🏦 ' + bank + ' bank ref' + (bank === 1 ? '' : 's')) : '')
        + (shared ? gcChip('#fef2f2','#b91c1c','⚠ ' + shared + ' also on another subscriber') : '');
      const rowsH = gca.map(g => {
        const [b, c, t] = gcAllProof(g);
        const where = [g.in_book || g.in_payments ? (g.sources ? String(g.sources).split(' + ').map(x => srcL[x] || x).join(' + ') : 'payment record') : '', g.texted ? '📱 texted' : ''].filter(Boolean).join(' · ');
        const digits = g.match === 'bank' ? ' <span style="color:#6b7280;font-size:11px">(bank ref)</span>' : g.match !== 'full' ? ' <span style="color:#6b7280;font-size:11px">(' + String(g.given).length + ' digits)</span>' : '';
        const rec = (g.recorded_amount ? peso(g.recorded_amount) : '—') + ((g.months || []).length ? ' <span style="color:#6b7280">for ' + g.months.map(mon).join(', ') + '</span>' : '')
          + (g.recorded_by ? '<br><span style="color:#6b7280;font-size:11px">' + esc(g.recorded_by) + '</span>' : '');
        const sharedTag = (g.other_subs > 0 ? '<br><span class="sd-tag" style="background:#fef2f2;color:#b91c1c;margin-top:4px">⚠ same ref on ' + g.other_subs + ' other subscriber' + (g.other_subs === 1 ? '' : 's') + '</span>' : '') + gcNotes(g);
        return '<tr><td style="white-space:nowrap">' + (g.paid_date ? short(String(g.paid_date).slice(0,10)) : '—') + '</td>'
          + '<td style="font-variant-numeric:tabular-nums;white-space:nowrap">…' + esc(String(g.given).slice(-4)) + digits + '</td>'
          + '<td style="white-space:nowrap">' + rec + '</td>'
          + '<td><span class="sd-tag" style="background:' + b + ';color:' + c + ';white-space:normal">' + esc(t) + '</span>' + sharedTag + '</td>'
          + '<td style="color:#4b5563;font-size:12px">' + esc(where) + '</td></tr>';
      }).join('');
      return '<div class="sd-card"><div class="sd-h">💳 Every GCash ref on record <span style="font-weight:500;text-transform:none;letter-spacing:0;color:#6b7280">· payment record, payments and Spawn Text texts · checked against the GCash owner\'s statements</span></div>'
        + '<div style="margin-bottom:8px">' + chips + '</div>'
        + (gca.length ? '<div class="sc-scroll"><table class="sc-tbl"><thead><tr><th>Paid</th><th>Ref</th><th>Recorded</th><th>In GCash?</th><th>Where</th></tr></thead><tbody>' + rowsH + '</tbody></table></div>'
          : '<div style="color:#9ca3af;font-size:13px;padding:6px 0">No GCash ref on record for this subscriber.</div>') + '</div>';
    };
    const gcSysT = () => { const sysPays = live.filter(x => x.collector === 'System · GCash' || x.collector === 'System · FB'); return sysPays.length ? `<div class="sd-card"><div class="sd-h green">🤖 Payments the system recorded from GCash</div>${sysPays.map(x => row(short(String(x.payment_date).slice(0,10)), peso(x.amount) + (x.coverage_from ? ' · for ' + mon(x.coverage_from) + (x.coverage_months > 1 ? ' + ' + (x.coverage_months - 1) + ' more' : '') : '') + (x.gcash_ref ? ' · ref …' + esc(String(x.gcash_ref).slice(-4)) : '') + (x.collector === 'System · FB' ? ' · <span style="color:#6b7280;font-weight:500">from a Facebook screenshot</span>' : ''))).join('')}</div>` : ''; };
    // (2026-11-12) 📷 Evidence per month — one row per claim that money arrived (book / app / texted / Facebook screenshot), the export's
    // verdict on it, and what the recorder would do with a screenshot (watch: "would add …"; on: "added …"). Read-only.
    const EV_SRC = { book:['📖', 'BASHANG'], app:['🧾', 'app record'], 'book+app':['📖', 'BASHANG + app'], sms:['📱', 'texted ref'], fb:['📷', 'screenshot'], other:['•', 'other'] };
    const EV_ST = { recorded:['#ecfdf5', '#065f46', '✓ recorded'], to_record:['#e0ecff', '#0146a0', '💡 confirmed, not yet recorded'], waiting_export:['#f1f5f9', '#475569', '⏳ waiting for the export'],
                    check:['#fff7ed', '#9a3412', '⚠ needs a look'], unreadable:['#fef2f2', '#b91c1c', '✗ ref not readable'] };
    const EV_VD = { ok:'in GCash', amount_diff:'amount differs', money_out:'money out', not_found:'not in GCash', after:'export not in yet', before:'before the statements', bank_ref:'bank ref', near_match:'near match', no_ref:'no ref', confirmed:'in GCash', wait:'export not in yet' };
    const evNote = n => !n ? '' : /^would add/.test(n) ? ['#e0ecff', '#0146a0', '🤖 ' + n] : /^added/.test(n) ? ['#ecfdf5', '#065f46', '🤖 ' + n] : /^office decides/.test(n) ? ['#fff7ed', '#9a3412', '🤖 ' + n] : /^already/.test(n) ? ['#f1f5f9', '#475569', '🤖 ' + n] : ['#fef2f2', '#b91c1c', '🤖 ' + n];
    const evidenceT = () => {
      if (evd === null) return '';   // view not connected yet → the card is simply absent
      const n = k => evd.filter(e => e.status === k).length, fb = evd.filter(e => e.source === 'fb').length;
      const chips = gcChip('#ecfdf5', '#065f46', '✓ ' + n('recorded') + ' recorded') + (n('to_record') ? gcChip('#e0ecff', '#0146a0', '💡 ' + n('to_record') + ' to record') : '')
        + (n('waiting_export') ? gcChip('#f1f5f9', '#475569', '⏳ ' + n('waiting_export') + ' waiting') : '') + (n('check') ? gcChip('#fff7ed', '#9a3412', '⚠ ' + n('check') + ' to check') : '')
        + (n('unreadable') ? gcChip('#fef2f2', '#b91c1c', '✗ ' + n('unreadable') + ' unreadable') : '') + (fb ? gcChip('#eef2ff', '#3730a3', '📷 ' + fb + ' screenshot' + (fb === 1 ? '' : 's')) : '');
      const rowsH = evd.map(e => {
        const [si, sl] = EV_SRC[e.source] || EV_SRC.other, [b, c, t] = EV_ST[e.status] || EV_ST.check;
        const forM = e.month_from ? mon(e.month_from) + (e.month_to && e.month_to !== e.month_from ? ' – ' + mon(e.month_to) : '') : '<span style="color:#9ca3af">—</span>';
        const amt = (e.gcash_amount != null ? '<b>' + peso(e.gcash_amount) + '</b> in GCash' : '') + (e.claimed_amount != null && e.claimed_amount !== e.gcash_amount ? (e.gcash_amount != null ? ' · ' : '') + peso(e.claimed_amount) + ' claimed' : '');
        const ref = e.ref ? '…' + esc(String(e.ref).slice(-4)) : e.given ? '…' + esc(String(e.given).slice(-4)) + ' <span style="color:#6b7280;font-size:11px">(' + String(e.given).length + ' digits)</span>' : '—';
        const who = e.source === 'fb' ? (e.poster ? 'posted by ' + esc(e.poster) : '') + (e.bubble_text ? '<br><span style="color:#6b7280;font-size:11px">“' + esc(e.bubble_text) + '”</span>' : '') + (e.name_status === 'conflict' ? '<br><span class="sd-tag" style="background:#fff7ed;color:#9a3412;margin-top:4px">⚡ name conflict</span>' : '')
          : (e.recorded_by ? esc(e.recorded_by) : '');
        const note = e.record_note ? (([nb, nc, nt]) => '<br><span class="sd-tag" style="background:' + nb + ';color:' + nc + ';margin-top:4px;white-space:normal">' + esc(nt) + '</span>')(evNote(e.record_note)) : '';
        return '<tr><td style="white-space:nowrap">' + (e.claimed_on ? short(String(e.claimed_on).slice(0,10)) : '—') + '</td><td style="white-space:nowrap">' + si + ' ' + sl + '</td><td style="white-space:nowrap">' + forM + '</td>'
          + '<td style="white-space:nowrap">' + amt + '</td><td style="font-variant-numeric:tabular-nums;white-space:nowrap">' + ref + '</td>'
          + '<td><span class="sd-tag" style="background:' + b + ';color:' + c + ';white-space:normal">' + esc(t) + '</span>' + (e.verdict && !/^(ok|confirmed)$/.test(e.verdict) ? ' <span style="color:#6b7280;font-size:11px">' + esc(EV_VD[e.verdict] || e.verdict) + '</span>' : '') + note + '</td>'
          + '<td style="color:#4b5563;font-size:12px">' + who + '</td></tr>';
      }).join('');
      return '<div class="sd-card"><div class="sd-h">📷 Evidence per month <span style="font-weight:500;text-transform:none;letter-spacing:0;color:#6b7280">· every claim that money arrived — BASHANG, app, texted ref, Facebook screenshot — checked against the GCash statements · what the system would record</span></div>'
        + '<div style="margin-bottom:8px">' + chips + '</div>'
        + (evd.length ? '<div class="sc-scroll"><table class="sc-tbl"><thead><tr><th>When</th><th>From</th><th>For</th><th>Amount</th><th>Ref</th><th>Status</th><th>Who / note</th></tr></thead><tbody>' + rowsH + '</tbody></table></div>'
          : '<div style="color:#9ca3af;font-size:13px;padding:6px 0">No payment evidence for this subscriber yet.</div>') + '</div>';
    };
    const gcashT = () => {
      if (gca !== null) return evidenceT() + gcAllT() + gcSysT();   // the full checker is connected
      if (gcx === null) return `<div class="sd-card"><div class="sd-h">💳 GCash</div><div style="color:#6b7280;font-size:13px">The GCash view is not connected to Vendo Monitor yet.</div></div>`;
      const sysPays = live.filter(x => x.collector === 'System · GCash');
      return `<div class="sd-card"><div class="sd-h">💳 GCash refs they texted <span style="font-weight:500;text-transform:none;letter-spacing:0;color:#6b7280">· checked against the GCash owner's statements · ${gcx.length}</span></div>
        ${gcx.length ? `<div class="sc-scroll"><table class="sc-tbl"><thead><tr><th>Texted</th><th>Ref</th><th>Status</th><th>In GCash?</th><th>Confirmed on</th></tr></thead><tbody>${gcx.map(g => { const [pb, pc, pt] = gcProof(g), [wb, wc, wt] = gcWho(g);
            return `<tr><td style="white-space:nowrap">${dt(g.texted_at)}</td><td style="font-variant-numeric:tabular-nums">${g.given ? '…' + esc(String(g.given).slice(-4)) : '—'}</td>
              <td><span class="sd-tag" style="background:${wb};color:${wc}">${esc(wt)}</span></td><td><span class="sd-tag" style="background:${pb};color:${pc};white-space:normal">${esc(pt)}</span></td>
              <td style="white-space:nowrap">${g.resolved_at ? dt(g.resolved_at) : '—'}</td></tr>`; }).join('')}</tbody></table></div>`
          : '<div style="color:#9ca3af;font-size:13px;padding:6px 0">No GCash ref texted to Spawn Text yet.</div>'}</div>
        ${sysPays.length ? `<div class="sd-card"><div class="sd-h green">🤖 Payments the system recorded from GCash</div>${sysPays.map(x => row(short(String(x.payment_date).slice(0,10)), peso(x.amount) + (x.coverage_from ? ' · for ' + mon(x.coverage_from) + (x.coverage_months > 1 ? ' + ' + (x.coverage_months - 1) + ' more' : '') : '') + (x.gcash_ref ? ' · ref …' + esc(String(x.gcash_ref).slice(-4)) : ''))).join('')}</div>` : ''}`;
    };
    const info = () => `<div class="sd-card"><div class="sd-grid">
        <div><div class="sd-h">Identity</div>
          ${row('Subscriber', esc(sub.name))}${row('Account no.', esc(sub.acct_no))}${row('Area', esc(sub.area))}${row('Plan', [sub.plan_type, sub.plan_mbps ? sub.plan_mbps + ' Mbps' : ''].filter(Boolean).map(esc).join(' · '))}
          ${row('Status', esc([sub.status, sub.billing_status].filter(Boolean).join(' · ')) + (sub.billing_note ? ' <span style="color:#6b7280;font-weight:500">' + esc(sub.billing_note) + '</span>' : ''))}
          ${row('PPPoE', esc([sub.pppoe_username, sub.pppoe_server].filter(Boolean).join(' @ ')))}
          ${row('Line', sub.is_online == null ? '' : sub.is_online ? '<span style="color:#027e60">online</span>' : '<span style="color:#d91934">offline</span>' + (sub.last_seen_online ? ' <span style="color:#6b7280;font-weight:500">last seen ' + dt(sub.last_seen_online) + '</span>' : ''))}
          ${row('Vendo owner', sub.is_vendo_owner ? 'yes' : '')}${notesRow(sub.notes)}
          <div class="sd-h pink" style="margin-top:14px">📍 Location &amp; contact</div>
          ${row('Address', esc(sub.address))}${row('Contact', esc(sub.phone))}${row('Facebook', esc(sub.fb_name))}
          ${row('GPS', hasGps ? `${sub.lat}, ${sub.lng} <a href="${gmaps}" target="_blank" rel="noopener" style="color:#025ac6">Maps ↗</a>${sub.gps_place ? ' <span style="color:#6b7280;font-weight:500">· ' + esc(sub.gps_place) + '</span>' : ''}` : '<span style="color:#b45309">none yet — pin it in Spawn Collect</span>')}
        </div>
        <div><div class="sd-h green">💳 Billing</div>
          ${row('Monthly', sub.monthly_amount ? peso(sub.monthly_amount) : '')}${row('Due', esc(dd))}${row('Pays by', esc(howOf(sub)) + (sub.usual_collector ? ' · ' + esc(sub.usual_collector) : ''))}
          ${row('This month', stt ? `<span class="sd-tag" style="background:${stt.b};color:${stt.c}">${esc(stt.l)}</span>${Number(bk.this_paid)>0?' paid '+peso(bk.this_paid):''}${Number(bk.this_balance)>0?' · balance '+peso(bk.this_balance):''}` : '')}
          ${row('Still owes', Number(bk.owed) > 0 ? `<span style="color:#d91934">${peso(bk.owed)}</span>${(bk.unpaid_months||[]).length ? ' <span style="color:#6b7280;font-weight:500">' + esc(bk.unpaid_months.join(', ')) + '</span>' : ''}` : '<span style="color:#027e60">nothing</span>')}
          ${row('Last paid', bk.last_paid ? `${short(bk.last_paid)} · ${peso(bk.last_amount)}${bk.last_for ? ' <span style="color:#6b7280;font-weight:500">for ' + mon(bk.last_for) + '</span>' : ''}${bk.last_or ? ' · OR ' + esc(bk.last_or) : ''}${bk.last_by ? ' · ' + esc(bk.last_by) : ''}` : '')}
          ${row('Installed', [sub.date_installed ? short(String(sub.date_installed).slice(0,10)) : '', sub.installer].filter(Boolean).map(esc).join(' · '))}
          <div class="sd-kpi"><div><small>Lifetime paid (${live.length} payment${live.length===1?'':'s'})</small><b style="color:#025ac6">${peso(lifetime)}</b></div><div><small>Months on record</small><b>${months.length}</b></div><div><small>Linked numbers</small><b>${nums.length}</b></div></div>
        </div></div></div>`;
    const ledger = () => `<div class="sd-card"><div class="sd-h">📅 Month ledger <span style="font-weight:500;text-transform:none;letter-spacing:0;color:#6b7280">· from BASHANG, the payment sheet and Spawn Collect</span></div>
        <div class="sc-scroll"><table class="sc-tbl"><thead><tr><th>For</th><th>Paid on</th><th class="n">Amount</th><th>OR / ref</th><th>Received by</th><th>Source</th></tr></thead><tbody>${months.map(m => `<tr><td><b>${mon(m.ym)}</b></td><td>${m.paid_date ? short(m.paid_date) : '<span style="color:#d91934">unpaid</span>'}</td><td class="n">${m.amount != null ? peso(m.amount) : '—'}</td><td>${esc(m.or_no || '—')}</td><td>${esc(m.received_by || '—')}</td><td style="color:#6b7280">${esc(srcL[m.source] || m.source || '')}${m.check_flag ? ' · <span style="color:#b45309">' + esc(String(m.check_flag).replace('_',' ')) + '</span>' : ''}${Number(m.balance) > 0 ? ' · <span style="color:#d91934">balance ' + peso(m.balance) + '</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="6" style="color:#9ca3af">No months on record.</td></tr>'}</tbody></table></div></div>
      <div class="sd-card"><div class="sd-h">🧾 Payments <span style="font-weight:500;text-transform:none;letter-spacing:0;color:#6b7280">· ${live.length} · ${peso(lifetime)}${vd.length ? ' · ' + vd.length + ' voided' : ''}</span></div>
        <div class="sc-scroll"><table class="sc-tbl"><thead><tr><th>Date</th><th class="n">Amount</th><th>For</th><th>OR / ref</th><th>Via</th><th>Collector</th><th>Note</th></tr></thead><tbody>${[...live.map(x=>[x,false]), ...vd.map(x=>[x,true])].map(([x, dim]) => `<tr${dim ? ' style="opacity:.55;text-decoration:line-through"' : ''}><td style="white-space:nowrap">${short(x.payment_date)}</td><td class="n"><b>${peso(x.amount)}</b></td><td>${x.coverage_from ? mon(x.coverage_from) + (x.coverage_months > 1 ? ' – ' + mon(x.coverage_to) : '') : '—'}</td><td>${esc(x.paper_no || x.gcash_ref || x.bank_ref || x.invoice_no || '—')}</td><td>${esc(x.pay_method ? cap(x.pay_method) : '—')}</td><td>${esc(x.collector || '—')}</td><td style="color:#6b7280;font-size:12px">${esc(dim ? ('voided: ' + (x.void_reason || '')) : (x.note || ''))}</td></tr>`).join('') || '<tr><td colspan="7" style="color:#9ca3af">No payments on record.</td></tr>'}</tbody></table></div></div>
      ${deds.length ? `<div class="sd-card"><div class="sd-h">📶 No-internet deductions</div><div class="sc-scroll"><table class="sc-tbl"><thead><tr><th>For</th><th class="n">Days</th><th class="n">Amount</th><th>Reason</th><th>Approved by</th></tr></thead><tbody>${deds.map(d=>`<tr${d.voided_at?' style="opacity:.5;text-decoration:line-through"':''}><td>${mon(d.ym)}</td><td class="n">${d.days}</td><td class="n">−${peso(d.amount)}</td><td>${esc(d.reason||'')}</td><td>${esc(d.approved_by||'')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    const contact = () => `<div class="sd-card"><div class="sd-grid"><div><div class="sd-h pink">📍 Location</div>
          ${row('Address', esc(sub.address))}${row('Area', esc(sub.area))}
          ${row('GPS', hasGps ? `${sub.lat}, ${sub.lng}` : '<span style="color:#b45309">none yet — pin it in Spawn Collect</span>')}${hasGps ? row('Pinned', [sub.gps_updated_at ? dt(sub.gps_updated_at) : '', sub.gps_source, sub.gps_place].filter(Boolean).map(esc).join(' · ')) : ''}
          ${hasGps ? `<a href="${gmaps}" target="_blank" rel="noopener" style="display:inline-block;margin-top:4px;background:#025ac6;color:#fff;text-decoration:none;font-weight:800;font-size:13px;padding:9px 14px;border-radius:10px">📍 Open in Google Maps</a>` : ''}
        </div><div><div class="sd-h">Contact</div>
          ${row('Phone', sub.phone ? `<a href="tel:${esc(sub.phone)}" style="color:#025ac6">${esc(sub.phone)}</a>` : '')}${row('Facebook', esc(sub.fb_name))}${row('Usual collector', esc(sub.usual_collector))}
          <div class="sd-h" style="margin-top:14px">Numbers linked for Spawn Text</div>
          ${nums.length ? nums.map(n => row(esc(n.channel || 'sms') + (n.is_primary ? ' · primary' : ''), esc(n.address) + (n.verified_at ? ' <span class="sd-tag" style="background:#e7f6f1;color:#027e60">verified</span>' : '') + (n.source ? ' <span style="color:#6b7280;font-weight:500">· ' + esc(n.source) + '</span>' : ''))).join('') : '<div style="color:#9ca3af;font-size:13px;padding:6px 0">No number linked yet. Spawn Text uses the phone above when there is one.</div>'}
        </div></div></div>`;
    const text = () => {
      const open = proms.filter(p => p.status === 'open' || p.status === 'pending');
      return `<div class="sd-card"><div class="sd-h">📱 Spawn Text <span style="font-weight:500;text-transform:none;letter-spacing:0;color:#6b7280">· ${msgs.length ? 'last ' + msgs.length + ' message' + (msgs.length===1?'':'s') : 'no messages yet'}</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">${nums.map(n => `<span class="sd-tag" style="background:#e0ecff;color:#0146a0">${esc(n.address)}${n.is_primary ? ' · primary' : ''}</span>`).join('') || (sub.phone ? `<span class="sd-tag" style="background:#f1f5f9;color:#475569">${esc(sub.phone)} · from the subscriber record</span>` : '<span style="color:#9ca3af;font-size:13px">no number on file</span>')}</div>
        ${open.length ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:13px"><b>Promised:</b> ${open.map(p => `${p.promised_date ? short(String(p.promised_date).slice(0,10)) : '?'}${p.amount ? ' · ' + peso(p.amount) : ''}${p.months ? ' · ' + esc(String(p.months)) : ''}`).join(' · ')}</div>` : ''}
        ${tasks.filter(t => t.status !== 'done').length ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:13px"><b>Open tasks:</b> ${tasks.filter(t => t.status !== 'done').map(t => esc(t.kind) + (t.reason ? ' · ' + esc(t.reason) : '')).join(' · ')}</div>` : ''}
        ${msgs.map(m => `<div class="sd-msg ${m.direction === 'in' ? 'in' : 'out'}"><small>${m.direction === 'in' ? '⬅ from them' : '➡ Spawn'}<br>${dt(m.sent_at || m.created_at)}${m.status ? '<br>' + esc(m.status) : ''}</small><div class="b">${esc(m.body || '')}${m.intent ? `<div style="margin-top:4px;color:#6b7280;font-size:11px">${esc(m.intent)}${m.ym ? ' · ' + esc(String(m.ym).slice(0,7)) : ''}${m.error ? ' · <span style="color:#d91934">' + esc(m.error) + '</span>' : ''}</div>` : ''}</div></div>`).join('') || '<div style="color:#9ca3af;font-size:13px;padding:6px 0">No reminders or replies yet for this subscriber.</div>'}
      </div>`; };
    const draw = k => { pg.querySelectorAll('.sd-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === k)); pg.querySelector('.sd-body').innerHTML = k === 'ledger' ? ledger() : k === 'contact' ? contact() : k === 'text' ? text() : k === 'gcash' ? gcashT() : info(); };
    pg.innerHTML = `<div class="sd-win"><div class="sd-top"><div style="flex:1;min-width:0"><b>${esc(sub.name)}${sub.acct_no ? ' <span style="opacity:.8;font-weight:600">#' + esc(sub.acct_no) + '</span>' : ''}</b><small>${esc(sub.area || '—')}${sub.monthly_amount ? ' · ' + peso(sub.monthly_amount) + '/mo' : ''}${dd ? ' · due ' + esc(dd) : ''}${stt ? ' · ' + esc(stt.l) : ''}${Number(bk.owed) > 0 ? ' · <b>owes ' + peso(bk.owed) + '</b>' : ''}</small></div>
        <a class="sd-btn" href="#" id="sd-chat">💬 Open chat</a>${hasGps ? `<a class="sd-btn" href="${gmaps}" target="_blank" rel="noopener">📍 Maps</a>` : ''}<button type="button" class="sd-x" id="sd-x" aria-label="Close">✕</button></div>
      <div class="sd-tabs">${tabs.map(([k, l]) => `<button type="button" data-t="${k}">${l}</button>`).join('')}</div><div class="sd-scroll"><div class="sd-body"></div></div></div>`;
    pg.querySelector('#sd-x').onclick = close;
    { const oc = pg.querySelector('#sd-chat'); if (oc) oc.onclick = ev => { ev.preventDefault(); close(); if (typeof window.spawnOpenChat === 'function') window.spawnOpenChat(sub.id); }; }   // 2026-11-07: opens their chat in the 💬 Spawn Text tab
    pg.querySelectorAll('.sd-tabs button').forEach(b => b.onclick = () => draw(b.dataset.t));
    draw('info');
  }

  window.subDetail = subDetail;
  sdCss();

  // ══════════════════════════════════════════════════════════
  // 📷 Receipts (2026-11-13) — every Messenger photo the GCash reader handled, newest first: what it read, what the export
  // says, who it named, and what the recorder would do. Read-only (view v_fb_receipts_v1 through the gateway). Decisions are
  // taken on the exceptions screen; this list shows the reader's work. Null = view not connected yet → "not connected" card.
  // ══════════════════════════════════════════════════════════
  let rcpRows = null, rcpErr = null, rcpF = 'all', rcpDays = 30, rcpQ = '';
  const RCP_M = { confirmed:['#ecfdf5','#065f46','✓ in GCash'], amount_diff:['#fff7ed','#9a3412','⚠ amount differs'], money_out:['#fff7ed','#9a3412','⚠ money out'],
                  near_match:['#eef2ff','#3730a3','≈ near match'], wait:['#f1f5f9','#475569','⏳ waiting for export'], not_found:['#fef2f2','#b91c1c','✗ not in GCash'],
                  no_ref:['#fef2f2','#b91c1c','✗ no ref read'], not_receipt:['#f1f5f9','#475569','not a receipt'], error:['#fef2f2','#b91c1c','error'] };
  const RCP_KIND = { gcash_send:'GCash', gcash_bills:'GCash bills', paper_or:'paper OR', bank:'bank', maya:'Maya', history_list:'history list', other:'other', none:'—' };
  const rcpNote = t => !t ? '' : /^would add/.test(t) ? ['#e0ecff','#0146a0'] : /^added/.test(t) ? ['#ecfdf5','#065f46'] : /^office/.test(t) ? ['#fff7ed','#9a3412'] : /^already/.test(t) ? ['#f1f5f9','#475569'] : ['#fef2f2','#b91c1c'];
  async function rcpLoad(){
    rcpErr = null;
    try { const r = await sb('v_fb_receipts_v1', `fb_ts=gte.${new Date(Date.now() - rcpDays * 86400000).toISOString()}&select=*&order=fb_ts.desc`, 1000); rcpRows = Array.isArray(r) ? r : null; }
    catch (e) { rcpRows = null; rcpErr = e.message; }
    drawRcp();
  }
  function drawRcp(){
    const body = document.getElementById('st-body'); if (!body) return;
    if (rcpRows === null) { body.innerHTML = `<div class="sc-empty">📷 The receipts view is not connected to Vendo Monitor yet${rcpErr ? ' (' + esc(rcpErr) + ')' : ''}.</div>`; return; }
    const rows = rcpRows, q = rcpQ.trim().toLowerCase();
    const isRec = r => r.status === 'read' && r.is_receipt !== false;
    const cnt = { all: rows.length, confirmed:0, check:0, unreadable:0, unnamed:0, conflict:0, not_receipt:0, would:0 };
    rows.forEach(r => { if (!isRec(r)) { cnt.not_receipt++; return; } if (r.match === 'confirmed') cnt.confirmed++; else if (r.match === 'no_ref') cnt.unreadable++; else cnt.check++;
                        if (!r.subscriber_id) cnt.unnamed++; if (r.name_status === 'conflict') cnt.conflict++; if (/^would add|^added/.test(r.record_note || '')) cnt.would++; });
    const pick = r => rcpF === 'all' ? true : rcpF === 'confirmed' ? isRec(r) && r.match === 'confirmed' : rcpF === 'check' ? isRec(r) && !['confirmed','no_ref'].includes(r.match)
      : rcpF === 'unreadable' ? isRec(r) && r.match === 'no_ref' : rcpF === 'unnamed' ? isRec(r) && !r.subscriber_id : rcpF === 'conflict' ? r.name_status === 'conflict'
      : rcpF === 'would' ? /^would add|^added/.test(r.record_note || '') : rcpF === 'not_receipt' ? !isRec(r) : true;
    const list = rows.filter(pick).filter(r => !q || [r.subscriber_name, r.poster, r.bubble_text, r.ref].some(v => String(v || '').toLowerCase().includes(q)));
    const chip = (k, l, c) => `<button type="button" data-f="${k}" style="padding:4px 10px;border-radius:999px;border:1px solid ${rcpF===k?'#025ac6':'#e5e7eb'};background:${rcpF===k?'#e0ecff':'#fff'};color:${rcpF===k?'#0146a0':'#374151'};font-size:12px;font-weight:600;cursor:pointer">${l} ${c}</button>`;
    const tag = (b, c, t) => `<span class="sd-tag" style="background:${b};color:${c};white-space:normal">${esc(t)}</span>`;
    const trs = list.map(r => {
      const [mb, mc, mt] = RCP_M[isRec(r) ? r.match : 'not_receipt'] || RCP_M.error;
      const nm = r.subscriber_name ? `<a href="#" onclick="window.subDetail&&window.subDetail(${r.subscriber_id});return false" style="color:#025ac6;font-weight:700">${esc(r.subscriber_name)}</a>`
               + (r.sub_source ? ` <span style="color:#6b7280;font-size:11px">· ${esc(r.sub_source)}</span>` : '') : '<span style="color:#b45309">unnamed</span>';
      const conflict = r.name_status === 'conflict' ? '<br>' + tag('#fff7ed', '#9a3412', '⚡ bubble says ' + (r.name_text || '?')) : '';
      const mon = r.months_from ? mon_(r.months_from) + (r.months_to && r.months_to !== r.months_from ? ' – ' + mon_(r.months_to) : '') : '—';
      const note = r.record_note ? (([b, c]) => '<br>' + tag(b, c, '🤖 ' + r.record_note))(rcpNote(r.record_note)) : '';
      const amt = r.gcash_amount != null ? '<b>' + peso(r.gcash_amount) + '</b>' : r.amount != null ? '<span style="color:#6b7280">' + peso(r.amount) + ' read</span>' : '—';
      return `<tr><td style="white-space:nowrap">${dt(r.fb_ts)}</td><td style="font-size:12px">${esc(r.poster || '—')}${r.bubble_text ? '<br><span style="color:#6b7280;font-size:11px">“' + esc(String(r.bubble_text).slice(0, 60)) + '”</span>' : ''}</td>
        <td style="font-variant-numeric:tabular-nums;white-space:nowrap">${r.ref ? '…' + esc(String(r.ref).slice(-4)) : '—'}${r.engine_agree === false ? ' <span title="the two OCR engines disagreed" style="color:#b45309">?</span>' : ''}${r.low_confidence ? ' <span title="low confidence" style="color:#b45309">⚠</span>' : ''}</td>
        <td style="white-space:nowrap">${amt}</td><td>${tag(mb, mc, mt)}${r.duplicate_photo ? '<br><span style="color:#6b7280;font-size:11px">📷 photographed twice</span>' : ''}</td>
        <td>${nm}${conflict}</td><td style="white-space:nowrap">${mon}${note}</td><td style="color:#6b7280;font-size:11px">${esc(RCP_KIND[r.receipt_kind] || r.receipt_kind || '')}</td></tr>`;
    }).join('');
    body.innerHTML = `<div class="cx-card"><div class="cx-head">📷 Receipts the reader handled <span style="font-weight:500;text-transform:none;letter-spacing:0;color:#6b7280">· last ${rcpDays} days · ${rows.length} photos · what it read, what the export says, who it named, what the recorder would do</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0">
        ${chip('all','All',cnt.all)}${chip('confirmed','✓ In GCash',cnt.confirmed)}${chip('check','⚠ Needs a look',cnt.check)}${chip('unreadable','✗ Unreadable',cnt.unreadable)}${chip('unnamed','Unnamed',cnt.unnamed)}${chip('conflict','⚡ Conflicts',cnt.conflict)}${chip('would','🤖 Would record',cnt.would)}${chip('not_receipt','Not a receipt',cnt.not_receipt)}
        <select id="rcp-days" style="font-size:12px;padding:4px 6px;border-radius:8px;border:1px solid #e5e7eb"><option value="7"${rcpDays===7?' selected':''}>7 days</option><option value="30"${rcpDays===30?' selected':''}>30 days</option><option value="90"${rcpDays===90?' selected':''}>90 days</option></select>
        <input id="rcp-q" type="search" placeholder="Search name, poster, bubble, ref" value="${esc(rcpQ)}" style="font-size:12px;padding:5px 9px;border-radius:8px;border:1px solid #e5e7eb;min-width:220px">
        <span style="font-size:11px;color:#6b7280">decide on the ⚠ Exceptions screen</span></div>
      ${list.length ? `<div class="sc-scroll"><table class="sc-tbl"><thead><tr><th>Posted</th><th>By · bubble</th><th>Ref</th><th>Amount</th><th>Export</th><th>Subscriber</th><th>Month · recorder</th><th>Kind</th></tr></thead><tbody>${trs}</tbody></table></div>`
                   : '<div class="sc-empty">Nothing here.</div>'}</div>`;
    body.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { rcpF = b.dataset.f; drawRcp(); });
    const dsel = body.querySelector('#rcp-days'); if (dsel) dsel.onchange = () => { rcpDays = +dsel.value; rcpLoad(); };
    const qi = body.querySelector('#rcp-q'); if (qi) qi.oninput = () => { rcpQ = qi.value; const pos = qi.selectionStart; drawRcp(); const q2 = body.querySelector('#rcp-q'); if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); } };
  }
  const mon_ = ym => new Date(String(ym).slice(0,10)+'T12:00:00').toLocaleDateString('en-PH',{month:'short',year:'2-digit'});

  // ⏳ Late — who owes, most owed first
  function drawLate(){
    const body = document.getElementById('st-body'); if (!body || !book) return;
    const list = book.filter(r => r.state==='late' || r.state==='partial' || (r.state!=='disconnected' && Number(r.owed)>0))
      .sort((a,b)=>(Number(b.months_behind)-Number(a.months_behind))||(Number(b.owed)-Number(a.owed)));
    const byArea = {}; list.forEach(r=>{ const a=r.area||'—'; byArea[a]=byArea[a]||{n:0,o:0}; byArea[a].n++; byArea[a].o+=Number(r.owed||0); });
    const tot = list.reduce((s,r)=>s+Number(r.owed||0),0);
    body.innerHTML = `<div class="cx-card"><div class="cx-head"><b>⏳ ${list.length} subscribers owe ${peso(tot)}</b><span style="font-size:11px;color:#6b7280">last 3 months · this month counts after its due day · disconnected not included</span></div>
      <div class="cx-chips" style="padding:10px 14px">${Object.entries(byArea).sort((a,b)=>b[1].o-a[1].o).map(([a,x])=>`<span class="cx-chip">${esc(a)} · ${x.n} · ${peso(x.o)}</span>`).join('')}</div></div>
      <div class="cx-card"><div class="sc-scroll"><table class="sc-tbl"><thead><tr><th>Subscriber</th><th>Area</th><th>Phone</th><th>Months owed (oldest first)</th><th class="n">Owes</th><th>Last paid</th><th>Pays by</th><th>Collector</th></tr></thead><tbody>
      ${list.map(r=>`<tr class="sd-row-click" onclick="window.subDetail&&window.subDetail(${r.id})"><td><b class="sd-name" data-sd="${r.id}" style="color:#0146a0">${esc(r.name||'')}</b>${r.acct_no?` <span style="color:#9ca3af">#${esc(r.acct_no)}</span>`:''}</td><td>${esc(r.area||'—')}</td><td>${esc(r.phone||'—')}</td>
        <td>${(r.unpaid_months||[]).length?esc(r.unpaid_months.join(', ')):(Number(r.this_balance)>0?'balance this month':'balance')}</td>
        <td class="n"><b style="color:#d91934">${peso(r.owed)}</b></td><td style="white-space:nowrap">${r.last_paid?short(r.last_paid)+' · '+peso(r.last_amount)+(r.last_for?' <span style="color:#6b7280">for '+new Date(String(r.last_for).slice(0,10)+'T12:00:00').toLocaleDateString('en-PH',{month:'short'})+'</span>':''):'—'}</td>
        <td>${esc(howOf(r))}</td><td>${esc(r.usual_collector||'—')}</td></tr>`).join('')}
      <tr class="tot"><td colspan="4">Total</td><td class="n">${peso(tot)}</td><td colspan="3"></td></tr></tbody></table></div></div>`;
  }

  // 🧾 Payments — any date, same list as COLLECTIONS → Subscribers
  async function payLoad(date){
    payDate = date;
    const body = document.getElementById('st-body'); if (!body) return;
    const pays = await sb('subscriber_payments', `payment_date=eq.${date}&select=id,subscriber_id,subscriber_name,area,amount,collector,pay_method,paper_no,gcash_ref,invoice_no,note,created_at,voided_at,voided_by,void_reason&order=created_at.asc`, 2000);
    if (payDate !== date || stTab !== 'pays') return;
    payRows = ordered(Array.isArray(pays) ? pays : []);
    try { await fillAreas(payRows); } catch(e){}
    const names = [...new Set(payRows.map(whoOf))].sort();
    if (payFilt && !names.includes(payFilt)) payFilt = '';
    const aud = await fetchAudit(date);
    if (payDate !== date || stTab !== 'pays') return;
    const payL = payRows.filter(p=>!isVd(p));
    const sum = payL.reduce((s,p)=>s+Number(p.amount||0),0);
    const by = {cash:0,gcash:0,unknown:0}; payL.forEach(p=>{ by[methodOf(p)] += Number(p.amount||0); });
    body.innerHTML = `<div class="cx-card"><div class="cx-head"><span class="cx-nav" id="sp-nav"><button type="button" data-d="-1">◀</button><button type="button" data-d="0">Today</button><button type="button" data-d="1">▶</button></span>
        <input type="date" id="sp-date" value="${esc(date)}" style="padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font:inherit;font-size:13px">
        <b style="margin-left:auto">${payL.length} payment${payL.length===1?'':'s'} · ${peso(sum)}</b><span style="font-size:11px;color:#6b7280">cash ${peso(by.cash)} · GCash ${peso(by.gcash)}${by.unknown?' · ? '+peso(by.unknown):''}</span></div>
      <div class="cx-chips" style="padding:10px 14px"><button class="cx-chip${payFilt===''?' on':''}" data-c="">All (${payRows.length})</button>${names.map(n=>`<button class="cx-chip${payFilt===n?' on':''}" data-c="${esc(n)}">${esc(n)} (${payRows.filter(p=>whoOf(p)===n).length})</button>`).join('')}</div>
      <div class="sc-scroll" id="sp-list"></div></div>` + auditHtml(aud);
    const draw = () => { const l = payRows.filter(p => !payFilt || whoOf(p)===payFilt); document.getElementById('sp-list').innerHTML = l.length ? table(l) : '<div class="sc-empty">📭 No subscriber payments on this date</div>'; };
    body.querySelectorAll('.cx-chip[data-c]').forEach(b => b.onclick = () => { payFilt = b.dataset.c; body.querySelectorAll('.cx-chip[data-c]').forEach(x=>x.classList.toggle('on', x.dataset.c===payFilt)); draw(); });
    body.querySelector('#sp-date').onchange = e => payLoad(e.target.value || todayPH());
    body.querySelectorAll('#sp-nav button').forEach(b => b.onclick = () => { if (b.dataset.d==='0') return payLoad(todayPH()); const t=new Date(payDate+'T12:00:00'); t.setDate(t.getDate()+Number(b.dataset.d)); payLoad(t.toLocaleDateString('en-CA')); });
    draw();
  }

  // 📶 No internet — deductions this month (applied automatically by Spawn Collect)
  async function dedLoad(){
    const body = document.getElementById('st-body'); if (!body) return;
    const m1 = todayPH().slice(0,7) + '-01';
    const [ded] = await Promise.all([sb('sub_deductions', `ym=eq.${m1}&select=id,subscriber_id,days,rate,amount,reason,approved_by,approved_at,voided_at,voided_by&order=approved_at.desc`, 1000), bookLoad()]);
    if (stTab !== 'ded') return;
    const names = {}; (book||[]).forEach(r => names[r.id] = r);
    const list = Array.isArray(ded) ? ded : [];
    const live = list.filter(d => !d.voided_at), tot = live.reduce((s,d)=>s+Number(d.amount||0),0);
    body.innerHTML = `<div class="cx-card"><div class="cx-head"><b>📶 No-internet deductions · ${esc(new Date(m1+'T12:00:00').toLocaleDateString('en-PH',{month:'long',year:'numeric'}))}</b>
        <span style="font-size:12px;color:#6b7280">${live.length} subscriber${live.length===1?'':'s'} · <b style="color:#966500">−${peso(tot)}</b> · applied automatically when the collector reports it</span></div>
      <div class="sc-scroll">${list.length?`<table class="sc-tbl"><thead><tr><th>Subscriber</th><th>Area</th><th class="n">Days</th><th class="n">Monthly</th><th class="n">Deducted</th><th>Reason</th><th>Reported by</th><th>When</th><th>Status</th></tr></thead><tbody>
        ${list.map(d=>{ const s=names[d.subscriber_id]||{}; return `<tr style="${d.voided_at?'opacity:.5;text-decoration:line-through':''}"><td><b>${esc(s.name||('#'+d.subscriber_id))}</b></td><td>${esc(s.area||'—')}</td>
          <td class="n">${d.days}</td><td class="n">${peso(d.rate)}</td><td class="n"><b style="color:#966500">−${peso(d.amount)}</b></td><td>${esc(d.reason||'')}</td>
          <td>${esc(String(d.approved_by||'').replace(/^auto:/,''))}</td><td style="white-space:nowrap">${d.approved_at?new Date(d.approved_at).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}):'—'}</td>
          <td>${d.voided_at?'Voided':'Applied'}</td></tr>`; }).join('')}</tbody></table>`:'<div class="sc-empty">No deductions this month</div>'}</div></div>`;
  }

  // ✅ Office check — transition period: Spawn Collect payment vs the row the office types in the sheet.
  //   confirmed = office typed the same OR / GCash ref and amount · waiting = not typed yet
  //   mismatch  = same OR / ref, different amount · typed_not_in_app = office row from an app collector with no app payment
  //   Plus the receipt-delay trail from the merged sheet-sync duplicates. Read-only.
  let chkRows = null, chkTrail = null, chkFilt = '';
  const CHK = {
    confirmed:        { l:'Confirmed',          c:'#15803d', bg:'#e7f6ec', d:'Office typed the same OR / ref and amount' },
    waiting_for_office:{ l:'Waiting for office', c:'#2563eb', bg:'#e6effd', d:'In the app, office has not typed it yet' },
    mismatch:         { l:'Amount differs',     c:'#d91934', bg:'#fde8eb', d:'Same OR / ref, but a different amount — check it' },
    typed_not_in_app: { l:'Typed, not in app',  c:'#966500', bg:'#fdf3dc', d:'Office has it from an app collector, the app does not' }
  };
  const chkKey = r => r.status in CHK ? r.status : 'waiting_for_office';
  const chkBadge = k => `<span class="st-badge" style="background:${CHK[k].bg};color:${CHK[k].c}">${CHK[k].l}</span>`;
  async function chkLoad(){
    const body = document.getElementById('st-body'); if (!body) return;
    const [rows, trail] = await Promise.all([
      allRows('v_collect_office_check', 'select=*&order=payment_date.desc,payment_id.desc'),
      allRows('subscriber_payments_merged', 'select=collector,first_logged_at,receipt_added_at,amount,merged_at')]);
    if (stTab !== 'chk') return;
    chkRows = rows; chkTrail = trail;
    drawChk();
  }
  function drawChk(){
    const body = document.getElementById('st-body'); if (!body || !chkRows) return;
    const cnt = k => chkRows.filter(r => chkKey(r)===k).length;
    const amt = k => chkRows.filter(r => chkKey(r)===k).reduce((s,r)=>s+Number(r.amount||0),0);
    const kpis = Object.keys(CHK).map(k => `<div data-k="${k}" class="${chkFilt===k?'on':''}" style="--c:${CHK[k].c}"><b>${cnt(k)}</b><span>${CHK[k].l}${amt(k)?' · '+peso(amt(k)):''}</span></div>`).join('');
    const list = chkRows.filter(r => !chkFilt || chkKey(r)===chkFilt);
    const short = d => d ? new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'}) : '—';
    const office = r => r.side === 'sheet' ? '<span style="color:#6b7280">this is the office row</span>'
      : (r.sheet_invoice ? `${esc(r.sheet_invoice)} · ${peso(r.sheet_amount)} · ${short(r.sheet_date)}` : '<span style="color:#9ca3af">not typed yet</span>');
    const table = list.length ? `<table class="sc-tbl"><thead><tr><th>Date</th><th>Subscriber</th><th>Collector</th><th class="n">Amount</th><th>OR / ref</th><th>Status</th><th>Office sheet row</th></tr></thead><tbody>
      ${list.map(r => { const k = chkKey(r); return `<tr><td style="white-space:nowrap">${short(r.payment_date)}</td><td><b>${esc(r.subscriber_name||'')}</b>${r.receipt?` <span style="color:#9ca3af">${esc(r.receipt)}</span>`:''}</td>
        <td>${esc(cap(firstName(r.collector)))}</td><td class="n">${peso(r.amount)}</td><td>${esc(r.ref||'—')}</td><td>${chkBadge(k)}</td><td>${office(r)}</td></tr>`; }).join('')}</tbody></table>`
      : `<div class="sc-empty">${chkRows.length ? 'Nothing in this group' : '📭 No Spawn Collect payments yet — this fills in once the collectors record payments in the app'}</div>`;
    const by = {}; (chkTrail||[]).forEach(t => { const c = cap(firstName(t.collector)); const x = by[c] = by[c] || {n:0, d:0, k:0};
      x.n++; if (t.first_logged_at && t.receipt_added_at) { x.d += (new Date(t.receipt_added_at) - new Date(t.first_logged_at)) / 86400000; x.k++; } });
    const trail = Object.entries(by).sort((a,b)=>b[1].n-a[1].n).map(([c,x]) => `<span class="cx-chip">${esc(c)} · ${x.n} · ${x.k ? (x.d/x.k).toFixed(1)+' days' : '—'}</span>`).join('');
    body.innerHTML = `<div class="st-k" id="chk-k" style="grid-template-columns:repeat(4,minmax(0,1fr))">${kpis}</div>
      <div class="cx-card"><div class="cx-head"><b>✅ Spawn Collect vs office sheet</b><span style="font-size:11px;color:#6b7280">${chkFilt ? esc(CHK[chkFilt].d) : 'Each app payment counts once — the office row is only a check'}</span></div>
        <div class="sc-scroll">${table}</div></div>
      ${trail ? `<div class="cx-card"><div class="cx-head"><b>🧾 Receipt no. delay</b><span style="font-size:11px;color:#6b7280">payments the office typed first and added the receipt no. later · per collector: count · average days</span></div>
        <div class="cx-chips" style="padding:10px 14px">${trail}</div></div>` : ''}`;
    body.querySelectorAll('#chk-k div[data-k]').forEach(d => d.onclick = () => { chkFilt = chkFilt === d.dataset.k ? '' : d.dataset.k; drawChk(); });
  }

  // 💳 GCash audit (2026-11-06): every GCash ref on record (payment record, payments, Spawn Text) that does not check out
  // against the GCash owner's statements — not found, a different amount, money out, or the same ref on two subscribers.
  // Read-only (view v_sub_gcash_refs). Tap a name → the subscriber page.
  let gcaRows = null, gcaFilt = '', gcaArea = '', gcaErr = '';
  const GCA = {
    not_found: { l:'✗ Not in GCash',       c:'#b91c1c', bg:'#fef2f2', d:'The ref is on record but no GCash payment has it (typo, another GCash account, or not paid)' },
    diff:      { l:'⚠ Different amount',   c:'#9a3412', bg:'#fff7ed', d:'GCash has the ref, but the amount differs from what is recorded (or it is money going out)' },
    shared:    { l:'⚠ Same ref, 2+ subs',  c:'#7c1a56', bg:'#f3ecfb', d:'One GCash payment is recorded on more than one subscriber' },
  };
  const gcaKey = r => r.other_subs > 0 ? 'shared' : (r.verdict === 'amount_diff' || r.verdict === 'money_out') ? 'diff' : 'not_found';
  // notes beside a ref (2026-11-07): a book row with several refs is a split payment, so each ref alone looks short; a future book date is a typo in the book
  function gcNoteList(r){ const n = []; if (Number(r.row_refs) > 1) n.push('✂ ' + r.row_refs + ' refs on one row (split payment' + (r.recorded_amount ? ', ' + peso(r.recorded_amount) + ' total' : '') + ')'); if (r.future_date) n.push('📅 book date is in the future'); return n; }
  window.gcNoteList = gcNoteList;
  async function gcaLoad(){
    const body = document.getElementById('st-body'); if (!body) return;
    gcaErr = '';
    try {
      const [rows] = await Promise.all([
        allRows('v_sub_gcash_refs', 'select=*&or=(verdict.in.(not_found,amount_diff,money_out),other_subs.gt.0)&order=paid_date.desc.nullslast'),
        bookLoad()]);
      gcaRows = rows;
    } catch (e) { gcaRows = null; gcaErr = e.message || String(e); }
    if (stTab !== 'gca') return;
    drawGca();
  }
  function drawGca(){
    const body = document.getElementById('st-body'); if (!body) return;
    if (!gcaRows) { body.innerHTML = `<div class="cx-card"><div class="sc-empty">💳 GCash audit did not load${gcaErr ? ' — ' + esc(gcaErr.slice(0, 120)) : ''}</div></div>`; return; }
    const who = {}; (book || []).forEach(b => { who[b.id] = b; });
    const byRef = {}; gcaRows.forEach(r => { if (r.ref && r.other_subs > 0) (byRef[r.ref] = byRef[r.ref] || []).push(r.subscriber_id); });
    const short = d => d ? new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'2-digit'}) : '—';
    const ym = m => new Date(String(m).slice(0,10)+'T12:00:00').toLocaleDateString('en-PH',{month:'short',year:'2-digit'});
    const nm = id => (who[id] && who[id].name) || ('#' + id);
    const areaOf = r => String((who[r.subscriber_id] && who[r.subscriber_id].area) || '—').toUpperCase();
    const areas = [...new Set(gcaRows.map(areaOf))].sort();
    const inArea = gcaRows.filter(r => !gcaArea || areaOf(r) === gcaArea);
    const cnt = k => inArea.filter(r => gcaKey(r) === k).length;
    const kpis = Object.keys(GCA).map(k => `<div data-k="${k}" class="${gcaFilt===k?'on':''}" style="--c:${GCA[k].c}"><b>${cnt(k)}</b><span>${GCA[k].l}</span></div>`).join('');
    const list = inArea.filter(r => !gcaFilt || gcaKey(r) === gcaFilt);
    const gc = r => r.found ? `${peso(r.gcash_amount)} · ${r.tx_at ? new Date(r.tx_at).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}) : ''}${r.from_last4 ? ' · from …' + esc(r.from_last4) : ''}${r.direction && r.direction !== 'in' ? ' · <b>money out</b>' : ''}` : '<span style="color:#9ca3af">not in the statements</span>';
    const where = r => [r.in_book || r.in_payments ? (r.sources ? String(r.sources).split(' + ').map(x => srcL[x] || x).join(' + ') : 'payment record') : '', r.texted ? '📱 texted' : ''].filter(Boolean).join(' · ');
    const others = r => (byRef[r.ref] || []).filter(id => id !== r.subscriber_id).map(id => `<a href="#" onclick="window.subDetail&&window.subDetail(${id});return false" style="color:#7c1a56">${esc(nm(id))}</a>`).join(', ');
    const table = list.length ? `<table class="sc-tbl"><thead><tr><th>Paid</th><th>Subscriber</th><th>Ref</th><th class="n">Recorded</th><th>In GCash</th><th>Problem</th><th>Where</th></tr></thead><tbody>
      ${list.map(r => { const k = gcaKey(r); return `<tr><td style="white-space:nowrap">${short(r.paid_date)}</td>
        <td><b class="sd-name" style="color:#0146a0;cursor:pointer" onclick="window.subDetail&&window.subDetail(${r.subscriber_id})">${esc(nm(r.subscriber_id))}</b> <span style="color:#9ca3af">${esc(areaOf(r))}</span></td>
        <td style="font-variant-numeric:tabular-nums;white-space:nowrap">…${esc(String(r.given).slice(-4))}${r.match === 'bank' ? ' <span style="color:#6b7280;font-size:11px">(bank ref)</span>' : r.match !== 'full' ? ` <span style="color:#6b7280;font-size:11px">(${String(r.given).length} digits)</span>` : ''}</td>
        <td class="n" style="white-space:nowrap">${r.recorded_amount ? peso(r.recorded_amount) : '—'}${(r.months||[]).length ? `<br><span style="color:#6b7280;font-size:11px">for ${r.months.map(ym).join(', ')}</span>` : ''}</td>
        <td>${gc(r)}</td>
        <td><span class="st-badge" style="background:${GCA[k].bg};color:${GCA[k].c}">${GCA[k].l}</span>${k === 'shared' ? `<br><span style="font-size:11px">also on ${others(r)}</span>` : ''}${gcNoteList(r).map(t => `<br><span style="font-size:11px;color:#6b7280">${esc(t)}</span>`).join('')}</td>
        <td style="color:#4b5563;font-size:12px">${esc(where(r))}${r.recorded_by ? `<br><span style="color:#9ca3af">${esc(r.recorded_by)}</span>` : ''}</td></tr>`; }).join('')}</tbody></table>`
      : `<div class="sc-empty">${gcaRows.length ? 'Nothing in this group 🎉' : '🎉 Every GCash ref on record checks out'}</div>`;
    const upto = gcaRows.find(r => r.statements_to), from = gcaRows.find(r => r.statements_from);
    body.innerHTML = `<div class="st-k" id="gca-k" style="grid-template-columns:repeat(3,minmax(0,1fr))">${kpis}</div>
      <div class="cx-card"><div class="cx-head"><b>💳 GCash refs that do not check out</b><span style="font-size:11px;color:#6b7280">${gcaFilt ? esc(GCA[gcaFilt].d) : 'payment record, payments and Spawn Text texts vs the GCash owner\'s statements' + (from && upto ? ' (' + short(from.statements_from) + ' – ' + short(upto.statements_to) + ')' : '') + ' · older payments cannot be checked'}</span>
        <select id="gca-area" style="margin-left:auto"><option value="">All areas</option>${areas.map(a => `<option${gcaArea===a?' selected':''}>${esc(a)}</option>`).join('')}</select></div>
        <div class="sc-scroll">${table}</div></div>`;
    body.querySelectorAll('#gca-k div[data-k]').forEach(d => d.onclick = () => { gcaFilt = gcaFilt === d.dataset.k ? '' : d.dataset.k; drawGca(); });
    const sel = body.querySelector('#gca-area'); if (sel) sel.onchange = () => { gcaArea = sel.value; drawGca(); };
  }

  // 🔍 GCash review (2026-11-09): systematic GCash checking starts Nov 1, 2026 (gcash_review_from). Every GCash payment in and
  // every GCash ref on record since then, one colour each, until accounted for: matched, or a person's decision with a note.
  // Same data as Spawn Text's 🔍 Review (view v_gcash_review_marked, rows only while gcash_review is on). Read-only here —
  // decisions are made in Spawn Text (its PIN; only Wendell clears a 🔴). Tap a name → the subscriber page.
  let gcrRows = null, gcrErr = '', gcrFilt = 'open', gcrArea = '';
  const GCR = {
    open:   { l:'Open',               c:'#025ac6', bg:'#e6effb' },
    red:    { l:'🔴 Possible fraud',  c:'#b91c1c', bg:'#fef2f2' },
    grey:   { l:'⚪ Not on record',   c:'#475569', bg:'#f1f5f9' },
    yellow: { l:'🟡 Needs a look',    c:'#9a3412', bg:'#fff7ed' },
    wait:   { l:'⏳ Waiting export',  c:'#6b7280', bg:'#f3f4f6' },
    fraud:  { l:'🚩 Marked fraud',    c:'#7c1a56', bg:'#f3ecfb' },
    done:   { l:'✅ Cleared',         c:'#027e60', bg:'#e7f6f1' },
    ok:     { l:'✅ Matches',         c:'#027e60', bg:'#e7f6f1' },
  };
  const GCR_WHY = {
    not_on_record:'GCash money in, not on record', texted_not_recorded:'Texted to Spawn Text, not recorded yet',
    recorded_more:'Recorded MORE than GCash received', gcash_more:'GCash received MORE than recorded',
    ref_typo:'Ref is 1–2 digits off a GCash payment (typo?)', ref_incomplete:'Ref incomplete — cannot be matched',
    bank_ref:'Bank transfer ref — check by hand', future_date:'Paid date is in the future', after_export:'Paid after the last GCash export',
    ref_not_in_gcash:'Ref on record is NOT in GCash', texted_ref_not_in_gcash:'Customer texted a ref that is NOT in GCash',
    ref_is_money_out:'Ref is money OUT of GCash, not a payment in', old_ref:'Ref is from an older GCash payment',
    old_ref_recorded_more:'Older GCash ref, recorded MORE than it paid', split:'One GCash payment for several accounts', matched:'Matches GCash' };
  const GCR_DEC = { fixed:'Fixed', explained:'Explained', not_customer:'Not a customer', fraud:'🚩 Fraud' };
  const gcrOpen = s => s === 'red' || s === 'grey' || s === 'yellow' || s === 'wait';
  async function gcrLoad(){
    const body = document.getElementById('st-body'); if (!body) return;
    gcrErr = '';
    try { gcrRows = await allRows('v_gcash_review_marked', 'select=*'); } catch (e) { gcrRows = null; gcrErr = e.message || String(e); }
    if (stTab !== 'gcr') return;
    drawGcr();
  }
  function drawGcr(){
    const body = document.getElementById('st-body'); if (!body) return;
    if (!gcrRows) { body.innerHTML = `<div class="cx-card"><div class="sc-empty">🔍 GCash review did not load${gcrErr ? ' — ' + esc(gcrErr.slice(0, 120)) : ''}</div></div>`; return; }
    if (!gcrRows.length) { body.innerHTML = `<div class="cx-card"><div class="sc-empty">🔍 GCash review is switched off.</div></div>`; return; }
    const short = d => d ? new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}) : '—';
    const when = ts => new Date(ts).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'});
    const areaOf = r => { const m = /\(([^)]+)\)$/.exec(String(r.names || '').split(' + ')[0]); return m ? m[1].toUpperCase() : '—'; };
    const areas = [...new Set(gcrRows.filter(r => r.names).map(areaOf))].sort();
    const inArea = gcrRows.filter(r => !gcrArea || areaOf(r) === gcrArea);
    const cnt = k => k === 'open' ? inArea.filter(r => gcrOpen(r.state)).length : inArea.filter(r => r.state === k).length;
    const all = gcrRows, acc = all.filter(r => r.state === 'ok' || r.state === 'done').length, open = all.filter(r => gcrOpen(r.state)).length;
    const red = all.filter(r => r.state === 'red').length, gin = all.filter(r => r.side === 'gcash');
    const f0 = all[0] || {}, from = f0.review_from, upto = f0.statements_upto;
    const rank = { red:0, fraud:1, grey:2, yellow:3, wait:4, done:5, ok:6 };
    const list = inArea.filter(r => gcrFilt === 'open' ? gcrOpen(r.state) : r.state === gcrFilt)
      .sort((a, b) => (rank[a.state] - rank[b.state]) || String(b.tx_at || b.paid_date || '').localeCompare(String(a.tx_at || a.paid_date || '')));
    const kpis = Object.keys(GCR).map(k => `<div data-k="${k}" class="${gcrFilt===k?'on':''}" style="--c:${GCR[k].c}"><b>${cnt(k)}</b><span>${GCR[k].l}</span></div>`).join('');
    const who = r => {
      const subs = (r.subs || []), names = String(r.names || '').split(' + ');
      if (subs.length && r.names) return subs.map((id, i) => `<b class="sd-name" style="color:#0146a0;cursor:pointer" onclick="window.subDetail&&window.subDetail(${Number(id)})">${esc(names[i] || '#' + id)}</b>`).join(' + ');
      const base = r.kind === 'bank' ? 'Bank transfer (sender not shown)' : 'Unknown sender' + (r.sender_last4 ? ' …' + esc(r.sender_last4) : '');
      return `<span style="color:#6b7280">${base}</span>` + (r.likely ? `<br><span style="font-size:11px">💡 Likely: ${r.likely_sub ? `<a href="#" onclick="window.subDetail&&window.subDetail(${Number(r.likely_sub)});return false" style="color:#0146a0">${esc(r.likely)}</a>` : esc(r.likely)}</span>` : '');
    };
    const table = list.length ? `<table class="sc-tbl"><thead><tr><th>Status</th><th>Date</th><th>Subscriber</th><th>Problem</th><th class="n">Recorded</th><th class="n">GCash</th><th>Ref</th><th>Decision</th></tr></thead><tbody>
      ${list.map(r => { const s = GCR[r.state] || GCR.open; return `<tr style="background:${r.state === 'red' || r.state === 'fraud' ? '#fff7f7' : ''}">
        <td><span class="st-badge" style="background:${s.bg};color:${s.c}">${s.l}</span></td>
        <td style="white-space:nowrap">${r.side === 'gcash' && r.tx_at ? when(r.tx_at) : short(r.paid_date)}</td>
        <td>${who(r)}</td>
        <td>${esc(GCR_WHY[r.reason] || r.reason)}${r.recorded_by ? `<br><span style="font-size:11px;color:#9ca3af">recorded by ${esc(r.recorded_by)}</span>` : ''}</td>
        <td class="n" style="white-space:nowrap">${r.recorded_amount != null ? peso(r.recorded_amount) : '—'}</td>
        <td class="n" style="white-space:nowrap">${r.gcash_amount != null ? peso(r.gcash_amount) : '—'}</td>
        <td style="font-variant-numeric:tabular-nums;white-space:nowrap">${esc(r.ref || r.given || '—')}</td>
        <td style="font-size:12px">${r.decision ? `<b>${esc(GCR_DEC[r.decision] || r.decision)}</b> · ${esc(r.marked_by || '')}${r.mark_note ? `<br><span style="color:#6b7280">“${esc(r.mark_note)}”</span>` : ''}` : '<span style="color:#9ca3af">—</span>'}</td></tr>`; }).join('')}</tbody></table>`
      : `<div class="sc-empty">${gcrFilt === 'open' ? '🎉 Everything is accounted for' : gcrFilt === 'red' ? '🎉 No possible fraud' : 'Nothing in this group'}</div>`;
    body.innerHTML = `<div class="cx-card" style="padding:12px 14px;margin-bottom:12px">
        <div style="font-size:18px"><b>${acc}</b> of <b>${all.length}</b> accounted for${open ? ` · <b>${open}</b> open` : ' ✓'}${red ? ` · <b style="color:#b91c1c">🔴 ${red}</b>` : ''}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Systematic GCash checking starts ${esc(short(from))}. Earlier months are not in this review.
          GCash in since then: ${gin.length} payments, ${peso(gin.reduce((t, r) => t + Number(r.gcash_amount || 0), 0))} — ${gin.filter(r => r.color === 'ok').length} on record. Statements up to ${esc(short(upto))}.</div>
        <div style="margin-top:8px"><button type="button" id="gcr-decide" style="padding:7px 12px;border:1px solid #025ac6;border-radius:9px;background:#025ac6;color:#fff;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">✍ Decide in Spawn Text</button>
          <span style="font-size:11px;color:#6b7280;margin-left:6px">Fixed / Explained / Not a customer / 🚩 Fraud — with your Spawn Text PIN; only Wendell clears a 🔴</span></div></div>
      <div class="st-k" id="gcr-k" style="grid-template-columns:repeat(8,minmax(0,1fr))">${kpis}</div>
      <div class="cx-card"><div class="cx-head"><b>🔍 Every GCash item since ${esc(short(from))}</b><span style="font-size:11px;color:#6b7280">worst first · tap a name for the subscriber page</span>
        <select id="gcr-area" style="margin-left:auto"><option value="">All areas</option>${areas.map(a => `<option${gcrArea===a?' selected':''}>${esc(a)}</option>`).join('')}</select></div>
        <div class="sc-scroll">${table}</div></div>`;
    body.querySelectorAll('#gcr-k div[data-k]').forEach(d => d.onclick = () => { gcrFilt = d.dataset.k; drawGcr(); });
    const sel = body.querySelector('#gcr-area'); if (sel) sel.onchange = () => { gcrArea = sel.value; drawGcr(); };
    const dec = body.querySelector('#gcr-decide'); if (dec) dec.onclick = () => { if (typeof window.spawnOpenReview === 'function') window.spawnOpenReview(); };
  }

  // 💰 GCash not on record (2026-11-06): incoming GCash payments whose ref is nowhere on record (payment record, payments,
  // Spawn Text) — money that came in but is not tied to a customer yet — with the likely customer (their phone number, a ref
  // that is 1–2 digits off, or the same amount recorded as GCash without a ref). Read-only (view v_gcash_unclaimed).
  let gcuRows = null, gcuErr = '', gcuDays = 30, gcuKind = 'pay', gcuOnly = false;
  async function gcuLoad(){
    const body = document.getElementById('st-body'); if (!body) return;
    gcuErr = '';
    try { const [rows] = await Promise.all([allRows('v_gcash_unclaimed', 'select=*&order=tx_at.desc'), bookLoad()]); gcuRows = rows; }
    catch (e) { gcuRows = null; gcuErr = e.message || String(e); }
    if (stTab !== 'gcu') return;
    drawGcu();
  }
  function drawGcu(){
    const body = document.getElementById('st-body'); if (!body) return;
    if (!gcuRows) { body.innerHTML = `<div class="cx-card"><div class="sc-empty">💰 This list did not load${gcuErr ? ' — ' + esc(gcuErr.slice(0, 120)) : ''}</div></div>`; return; }
    const who = {}; (book || []).forEach(b => { who[b.id] = b; });
    const since = gcuDays ? Date.now() - gcuDays * 864e5 : 0;
    const inPeriod = gcuRows.filter(r => new Date(r.tx_at).getTime() >= since);
    const kindOk = r => gcuKind === 'all' ? true : gcuKind === 'pay' ? (r.kind === 'transfer' || r.kind === 'bank' || r.kind === 'other') : r.kind === gcuKind;
    const shown = inPeriod.filter(r => kindOk(r) && (!gcuOnly || (r.suggestions || []).length));
    const sum = a => a.reduce((t, r) => t + Number(r.amount || 0), 0);
    const withSug = inPeriod.filter(r => kindOk(r) && (r.suggestions || []).length);
    const when = ts => new Date(ts).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'});
    const from = r => r.kind === 'transfer' ? (r.sender_last4 ? 'GCash …' + esc(r.sender_last4) : 'GCash') : r.kind === 'bank' ? 'a bank transfer' : r.kind === 'load' ? 'load' : 'other';
    const sug = r => (r.suggestions || []).map(x => `<div><a href="#" onclick="window.subDetail&&window.subDetail(${Number(x.sub)});return false" style="color:#0146a0;font-weight:700">${esc((who[x.sub] && who[x.sub].name) || '#' + x.sub)}</a>${who[x.sub] && who[x.sub].area ? ' <span style="color:#9ca3af">' + esc(who[x.sub].area) + '</span>' : ''}<br><span style="font-size:11px;color:#6b7280">${esc(x.why)}</span></div>`).join('')
      || '<span style="color:#9ca3af">no clue — not a known number, no near ref</span>';
    const chip = (on, attr, label) => `<button type="button" class="sub-chip${on ? ' on' : ''}" ${attr} style="margin:0 6px 6px 0;padding:5px 11px;border-radius:999px;border:1px solid ${on ? '#025ac6' : '#d6dbe6'};background:${on ? '#025ac6' : '#fff'};color:${on ? '#fff' : '#334155'};font-weight:700;font-size:12px;cursor:pointer">${label}</button>`;
    const table = shown.length ? `<table class="sc-tbl"><thead><tr><th>Came in</th><th class="n">Amount</th><th>From</th><th>GCash ref</th><th>Likely customer</th></tr></thead><tbody>
      ${shown.map(r => `<tr><td style="white-space:nowrap">${when(r.tx_at)}</td><td class="n"><b>${peso(r.amount)}</b></td><td>${from(r)}</td>
        <td style="font-variant-numeric:tabular-nums;white-space:nowrap">${esc(r.ref)}</td><td>${sug(r)}</td></tr>`).join('')}</tbody></table>`
      : `<div class="sc-empty">${inPeriod.length ? 'Nothing with these filters' : '🎉 Every GCash payment in this period is on record'}</div>`;
    body.innerHTML = `<div class="st-k" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div style="--c:#b45309"><b>${inPeriod.filter(kindOk).length}</b><span>GCash payments not on record · ${peso(sum(inPeriod.filter(kindOk)))}</span></div>
        <div style="--c:#025ac6"><b>${withSug.length}</b><span>with a likely customer · ${peso(sum(withSug))}</span></div>
        <div style="--c:#6b7280"><b>${inPeriod.filter(kindOk).length - withSug.length}</b><span>no clue yet</span></div></div>
      <div class="cx-card"><div class="cx-head" style="flex-wrap:wrap"><b>💰 GCash that came in but is not on anyone's record</b><span style="font-size:11px;color:#6b7280">ref not in BASHANG, the payment sheet, Spawn Collect or Spawn Text · check the likely customer, then record the ref in BASHANG</span></div>
        <div style="padding:10px 14px 4px">${[[7,'7 days'],[30,'30 days'],[90,'90 days'],[0,'All']].map(([d, l]) => chip(gcuDays === d, `data-gcud="${d}"`, l)).join('')}
          <span style="display:inline-block;width:10px"></span>${[['pay','Payments'],['transfer','GCash only'],['bank','Bank only'],['all','All, incl. load']].map(([k, l]) => chip(gcuKind === k, `data-gcuk="${k}"`, l)).join('')}
          ${chip(gcuOnly, 'data-gcuo="1"', 'Only with a likely customer')}</div>
        <div class="sc-scroll">${table}</div></div>`;
    body.querySelectorAll('[data-gcud]').forEach(b => b.onclick = () => { gcuDays = Number(b.dataset.gcud); drawGcu(); });
    body.querySelectorAll('[data-gcuk]').forEach(b => b.onclick = () => { gcuKind = b.dataset.gcuk; drawGcu(); });
    body.querySelectorAll('[data-gcuo]').forEach(b => b.onclick = () => { gcuOnly = !gcuOnly; drawGcu(); });
  }

  // 📅 GCash per day (2026-11-06): per day, what came into GCash (the statement) next to every GCash payment on record —
  // BASHANG, payment sheet, Spawn Collect, System · GCash — and the refs texted in Spawn Text that are not checked yet.
  // Read-only (view v_gcash_day_items). Tap a day for every item.
  let gcdRows = null, gcdErr = '', gcdDays = 14, gcdOpen = '';
  const GCD_SRC = ['BASHANG', 'payment sheet', 'Spawn Collect', 'System · GCash'];
  const GCD_ST = {
    on_record:['#ecfdf5','#065f46','✓ on record'], not_on_record:['#fef2f2','#b91c1c','❓ not on any record'],
    ok:['#ecfdf5','#065f46','✓ in GCash'], amount_diff:['#fff7ed','#9a3412','⚠ different amount in GCash'], money_out:['#fff7ed','#9a3412','⚠ money out'],
    not_found:['#fef2f2','#b91c1c','✗ not in GCash'], bank_ref:['#eef2ff','#3730a3','🏦 bank ref'], no_ref:['#f1f5f9','#475569','📝 no ref written'],
    before:['#f1f5f9','#475569','before the statements'], after:['#f1f5f9','#475569','📄 no export file yet'], not_checked:['#fff7ed','#9a3412','⏳ not checked yet'] };
  function gcdIso(d){ return new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10); }
  async function gcdLoad(){
    const body = document.getElementById('st-body'); if (!body) return;
    gcdErr = '';
    const from = gcdIso(new Date(Date.now() - (gcdDays - 1) * 864e5));
    body.innerHTML = '<div class="sc-empty">Loading GCash per day…</div>';
    try { const [rows] = await Promise.all([allRows('v_gcash_day_items', 'select=*&day=gte.' + from + '&order=day.desc'), bookLoad()]); gcdRows = rows; }
    catch (e) { gcdRows = null; gcdErr = e.message || String(e); }
    if (stTab !== 'gcd') return;
    drawGcd();
  }
  function drawGcd(){
    const body = document.getElementById('st-body'); if (!body) return;
    if (!gcdRows) { body.innerHTML = `<div class="cx-card"><div class="sc-empty">📅 GCash per day did not load${gcdErr ? ' — ' + esc(gcdErr.slice(0, 120)) : ''}</div></div>`; return; }
    const who = {}; (book || []).forEach(b => { who[b.id] = b; });
    const nm = id => id ? ((who[id] && who[id].name) || '#' + id) : '—';
    const P = n => peso(Math.round(Number(n) || 0));
    const dLab = d => new Date(String(d).slice(0,10) + 'T12:00:00').toLocaleDateString('en-PH', { weekday:'short', month:'short', day:'numeric' });
    const hasStmt = gcdRows.some(r => r.kind === 'statement');
    const lastStmt = gcdRows.filter(r => r.kind === 'statement').map(r => String(r.day)).sort().pop() || '';
    const byDay = {};
    gcdRows.forEach(r => { const d = String(r.day).slice(0, 10); (byDay[d] = byDay[d] || []).push(r); });
    const days = Object.keys(byDay).sort().reverse();
    const sum = a => a.reduce((t, r) => t + Number(r.amount || 0), 0);
    const cell = (a, extra) => a.length ? `<b>${a.length}</b> · ${P(sum(a))}${extra || ''}` : '<span style="color:#cbd5e1">—</span>';
    const tag = st => { const x = GCD_ST[st] || ['#f1f5f9','#475569', st]; return `<span class="st-badge" style="background:${x[0]};color:${x[1]}">${esc(x[2])}</span>`; };
    let tot = { st:0, rec:0 };
    const rowsH = days.map(d => {
      const it = byDay[d], st = it.filter(r => r.kind === 'statement' && r.source !== 'GCash load'), rec = it.filter(r => r.kind === 'record'), tx = it.filter(r => r.kind === 'texted');
      const covered = d <= lastStmt;
      const notOn = st.filter(r => r.status === 'not_on_record');
      const diff = covered ? sum(st) - sum(rec) : null;
      if (covered) { tot.st += sum(st); tot.rec += sum(rec); }
      const diffH = diff === null ? '<span style="color:#94a3b8">📄 no export file yet</span>'
        : Math.abs(diff) < 1 ? '<span style="color:#065f46;font-weight:800">✓ matches</span>'
        : diff > 0 ? `<span style="color:#9a3412;font-weight:800">${P(diff)} more in GCash</span>` : `<span style="color:#b91c1c;font-weight:800">${P(-diff)} more on record</span>`;
      const srcCells = GCD_SRC.map(sc => { const a = rec.filter(r => r.source === sc), bad = a.filter(r => r.status === 'not_found' || r.status === 'amount_diff').length;
        return `<td class="n">${cell(a, bad ? ` <span style="color:#b91c1c">· ${bad} ✗</span>` : '')}</td>`; }).join('');
      const head = `<tr class="sd-row-click" data-gcdd="${d}"><td style="white-space:nowrap"><b>${dLab(d)}</b> ${gcdOpen === d ? '▾' : '▸'}</td>
        <td class="n">${covered ? cell(st, notOn.length ? ` <span style="color:#b91c1c">· ${notOn.length} ❓</span>` : '') : '<span style="color:#94a3b8">⏳</span>'}</td>${srcCells}
        <td class="n">${tx.length ? `<b>${tx.length}</b>` : '<span style="color:#cbd5e1">—</span>'}</td><td>${diffH}</td></tr>`;
      if (gcdOpen !== d) return head;
      const order = { statement:0, record:1, texted:2 };
      const detail = it.slice().sort((a, b) => (order[a.kind] - order[b.kind]) || String(a.source).localeCompare(String(b.source)) || Number(b.amount || 0) - Number(a.amount || 0)).map(r => {
        const sug = r.kind === 'statement' && r.status === 'not_on_record' && (r.suggestions || []).length
          ? '<br><span style="font-size:11px;color:#6b7280">likely: ' + r.suggestions.map(x => `<a href="#" onclick="window.subDetail&&window.subDetail(${Number(x.sub)});return false" style="color:#0146a0">${esc(nm(x.sub))}</a> (${esc(x.why)})`).join(', ') + '</span>' : '';
        const name = r.subscriber_id ? `<a href="#" onclick="window.subDetail&&window.subDetail(${Number(r.subscriber_id)});return false" style="color:#0146a0;font-weight:700">${esc(nm(r.subscriber_id))}</a>` : '<span style="color:#9ca3af">—</span>';
        const when = r.tx_at ? new Date(r.tx_at).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}) : '';
        return `<tr style="background:#f8fafc"><td style="padding-left:22px;color:#6b7280">${r.kind === 'statement' ? '💰 GCash' : r.kind === 'texted' ? '📱 texted' : '📒 record'}</td>
          <td colspan="2">${name}${sug}</td><td>${esc(r.source)}${r.recorded_by && r.kind === 'record' ? '<br><span style="font-size:11px;color:#9ca3af">' + esc(r.recorded_by) + '</span>' : ''}</td>
          <td class="n">${r.amount != null ? P(r.amount) : '—'}</td><td style="font-variant-numeric:tabular-nums">${r.ref ? esc(r.ref) : '—'}${when && r.kind !== 'statement' ? '<br><span style="font-size:11px;color:#9ca3af">GCash ' + esc(when) + '</span>' : when ? '<br><span style="font-size:11px;color:#9ca3af">' + esc(when) + '</span>' : ''}</td>
          <td colspan="2">${tag(r.status)}</td></tr>`;
      }).join('');
      return head + detail;
    }).join('');
    const chip = (on, attr, label) => `<button type="button" ${attr} style="margin:0 6px 6px 0;padding:5px 11px;border-radius:999px;border:1px solid ${on ? '#025ac6' : '#d6dbe6'};background:${on ? '#025ac6' : '#fff'};color:${on ? '#fff' : '#334155'};font-weight:700;font-size:12px;cursor:pointer">${label}</button>`;
    const td = tot.st - tot.rec;
    body.innerHTML = `<div class="st-k" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div style="--c:#025ac6"><b>${P(tot.st)}</b><span>came into GCash (days with a statement)</span></div>
        <div style="--c:#065f46"><b>${P(tot.rec)}</b><span>recorded as GCash, same days (all sources)</span></div>
        <div style="--c:${Math.abs(td) < 1 ? '#065f46' : td > 0 ? '#b45309' : '#b91c1c'}"><b>${Math.abs(td) < 1 ? '✓' : P(Math.abs(td))}</b><span>${Math.abs(td) < 1 ? 'matches' : td > 0 ? 'more in GCash than on record' : 'more on record than in GCash'}</span></div></div>
      <div class="cx-card"><div class="cx-head" style="flex-wrap:wrap"><b>📅 GCash per day</b><span style="font-size:11px;color:#6b7280">GCash statement next to BASHANG, the payment sheet, Spawn Collect and the system · 📄 no export file yet = that day is not in any GCash export so far · ⏳ = not checked yet${hasStmt ? ' · statements up to ' + esc(dLab(lastStmt)) : ''} · a payment can be recorded a day after it came in · tap a day</span></div>
        <div style="padding:10px 14px 4px">${[[7,'7 days'],[14,'14 days'],[31,'31 days'],[62,'2 months']].map(([d2, l]) => chip(gcdDays === d2, `data-gcdn="${d2}"`, l)).join('')}</div>
        <div class="sc-scroll"><table class="sc-tbl"><thead><tr><th>Day</th><th class="n">💰 Into GCash</th><th class="n">📒 BASHANG</th><th class="n">Payment sheet</th><th class="n">Spawn Collect</th><th class="n">🤖 System</th><th class="n">⏳ Texted</th><th>Difference</th></tr></thead>
        <tbody>${rowsH || '<tr><td colspan="8" class="sc-empty">Nothing in this period</td></tr>'}</tbody></table></div></div>`;
    body.querySelectorAll('[data-gcdd]').forEach(tr => tr.onclick = () => { gcdOpen = gcdOpen === tr.dataset.gcdd ? '' : tr.dataset.gcdd; drawGcd(); });
    body.querySelectorAll('[data-gcdn]').forEach(b => b.onclick = () => { gcdDays = Number(b.dataset.gcdn); gcdOpen = ''; gcdLoad(); });
  }

  // The tab button calls subscribersInit(); route it through the sections.
  window.subscribersInit = function(){ stGo(stTab); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', liveStart); else liveStart();
})();
