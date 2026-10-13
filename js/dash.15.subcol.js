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
        @media(max-width:700px){.sc-grand{grid-template-columns:repeat(2,minmax(0,1fr))}}
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

  function methodOf(p){
    if (p.pay_method === 'cash' || p.pay_method === 'gcash') return p.pay_method;
    const n = String(p.note||'').toLowerCase();
    if (/g-?cash/.test(n)) return 'gcash';
    return 'unknown';
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
    subcolRows = Array.isArray(pays) ? pays : [];
    const hrows = Array.isArray(harv) ? harv : [];

    // ── grand totals ──
    const harvTotal = hrows.reduce((s,r)=>s+Number(r.spawn_share||0),0);
    const subTotal  = subcolRows.reduce((s,r)=>s+Number(r.amount||0),0);
    const by = {cash:0,gcash:0,unknown:0};
    subcolRows.forEach(p=>{ by[methodOf(p)] += Number(p.amount||0); });
    grand.innerHTML = `<div class="sc-grand">
      <div class="sc-g"><div class="l">Harvest Spawn share</div><div class="v" style="color:#15803d">${peso(harvTotal)}</div><div class="s">${hrows.length} vendo${hrows.length===1?'':'s'}</div></div>
      <div class="sc-g"><div class="l">Subscriber payments</div><div class="v" style="color:#025AC6">${peso(subTotal)}</div><div class="s">${subcolRows.length} payment${subcolRows.length===1?'':'s'}</div></div>
      <div class="sc-g"><div class="l">Subscribers: cash / GCash</div><div class="v" style="font-size:16px">${peso(by.cash)} <span style="color:#9ca3af;font-weight:600">/</span> <span style="color:#025AC6">${peso(by.gcash)}</span></div><div class="s">${by.unknown?peso(by.unknown)+' method not written':'all with method'}</div></div>
      <div class="sc-g total"><div class="l">Total collected</div><div class="v">${peso(harvTotal+subTotal)}</div><div class="s">harvest share + subscribers</div></div>
    </div>`;

    // ── per collector: harvest + subscribers ──
    const per = {};
    const add = (name, k, v) => { const c = cap(firstName(name)); per[c] = per[c] || {harv:0,cash:0,gcash:0,unknown:0,n:0}; per[c][k] += v; };
    hrows.forEach(r => add(r.collector, 'harv', Number(r.spawn_share||0)));
    subcolRows.forEach(p => { add(p.collector, methodOf(p), Number(p.amount||0)); per[cap(firstName(p.collector))].n++; });
    const names = Object.keys(per).sort((a,b)=>{
      const ta = per[a].harv+per[a].cash+per[a].gcash+per[a].unknown, tb = per[b].harv+per[b].cash+per[b].gcash+per[b].unknown; return tb-ta; });
    const perRows = names.map(c=>{ const x=per[c], t=x.harv+x.cash+x.gcash+x.unknown;
      return `<tr><td><b>${esc(c)}</b></td><td class="n">${x.harv?peso(x.harv):'—'}</td><td class="n">${x.cash?peso(x.cash):'—'}</td><td class="n">${x.gcash?peso(x.gcash):'—'}</td><td class="n">${x.unknown?peso(x.unknown):'—'}</td><td class="n"><b>${peso(t)}</b></td></tr>`; }).join('');
    const tot = names.reduce((a,c)=>{ const x=per[c]; a.h+=x.harv; a.c+=x.cash; a.g+=x.gcash; a.u+=x.unknown; return a; },{h:0,c:0,g:0,u:0});

    // ── subscriber payment list ──
    const collectors = [...new Set(subcolRows.map(p=>cap(firstName(p.collector))))].sort();
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
            .concat(collectors.map(c=>`<button class="sc-chip${subcolFilter===c?' on':''}" data-c="${esc(c)}">${esc(c)} (${subcolRows.filter(p=>cap(firstName(p.collector))===c).length})</button>`)).join(''):''}</div></div>
        <div class="sc-scroll" id="sc-list"></div>
      </div>`;
    host.querySelectorAll('#sc-chips .sc-chip').forEach(b=>b.onclick=()=>{ subcolFilter=b.dataset.c; subcolRenderList(); host.querySelectorAll('#sc-chips .sc-chip').forEach(x=>x.classList.toggle('on',x.dataset.c===subcolFilter)); });
    if (subcolFilter && !collectors.includes(subcolFilter)) subcolFilter = '';
    subcolRenderList();
  }

  function subcolRenderList(){
    const el = document.getElementById('sc-list'); if (!el) return;
    const rows = subcolRows.filter(p => !subcolFilter || cap(firstName(p.collector)) === subcolFilter);
    if (!rows.length) { el.innerHTML = '<div class="sc-empty">No subscriber payments on this date</div>'; return; }
    const sum = rows.reduce((s,p)=>s+Number(p.amount||0),0);
    el.innerHTML = `<table class="sc-tbl"><thead><tr><th>Time</th><th>Collector</th><th>Subscriber</th><th>Area</th><th class="n">Amount</th><th>Paid by</th><th>OR / Ref</th><th>Note</th></tr></thead><tbody>`
      + rows.map(p=>{
          const m = methodOf(p), t = p.created_at ? new Date(p.created_at).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}) : '';
          const app = String(p.invoice_no||'').startsWith('SC-');
          return `<tr><td style="white-space:nowrap">${esc(t)}</td><td>${esc(cap(firstName(p.collector)))}</td>
            <td>${esc(p.subscriber_name||'')}${app?' <span class="sc-badge sc-app">Collect</span>':''}</td><td>${esc(p.area||'')}</td>
            <td class="n"><b>${peso(p.amount)}</b></td>
            <td><span class="sc-badge ${m==='cash'?'sc-cash':m==='gcash'?'sc-gcash':'sc-unk'}">${m==='cash'?'Cash':m==='gcash'?'GCash':'—'}</span></td>
            <td class="sc-mono">${esc(refOf(p))}</td><td style="color:#6b7280">${esc(p.note||'')}</td></tr>`; }).join('')
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
})();
