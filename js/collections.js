// ── COLLECTIONS TAB ──────────────────────────────────────
async function colLoad() {
  const dateEl = document.getElementById('col-date');
  if (!dateEl) return;
  if (!dateEl.value) {
    const today = new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
    dateEl.value = today;
  }
  const date = dateEl.value;
  if (!date) {
    document.getElementById('col-list').innerHTML = '<div style="color:#9ca3af;text-align:center;padding:40px 0;">Select a date to load collections</div>';
    return;
  }
  const listEl   = document.getElementById('col-list');
  const sumEl    = document.getElementById('col-summary');
  const filterEl = document.getElementById('col-area-filter');
  listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;font-size:13px;"><span style="display:inline-block;width:20px;height:20px;border:2px solid #e5e7eb;border-top-color:#15803d;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:8px;"></span>Loading…</div>';
  try {
    // Try cache first — fast load from storage bucket
    let rows, packRows, expenses = [], reconRows = [];
    const cacheUrl = 'https://cviraqfhphhsonjmrtvu.supabase.co/storage/v1/object/public/harvest-history-cache/collections-${date}.json?t=${Math.floor(Date.now()/900000)}';
    let fromCache = false;
    try {
      const cr = await fetch(cacheUrl);
      if (cr.ok) {
        const cd = await cr.json();
        rows     = cd.harvests || [];
        packRows = cd.packs    || [];
        expenses = cd.expenses || [];
        reconRows= cd.reconciliations || [];
        fromCache = true;
      }
    } catch(e) {}

    // Fallback: fetch from DB if no cache
    if (!fromCache) {
      const [hr, pr, er, rr] = await Promise.all([
        sb('harvests', `harvest_date=eq.${date}&select=id,vendo_name,sheet_name,tg_name,area,collector,coins_total,net_collectible,spawn_share,harvested_at,collector_note&order=harvested_at.asc`, 2000),
        sb('harvest_pack_items', `harvest_date=eq.${date}&saved_by=eq.office&select=harvest_id,pack_type,amount`, 2000),
        sb('collector_expenses', `expense_date=eq.${date}&select=collector,category,description,amount,receipt_photo_url&order=created_at.asc`, 200),
        sb('harvest_reconciliations', `recon_date=eq.${date}&select=collector,confirmed_at,confirmed_by`, 50)
      ]);
      rows      = Array.isArray(hr) ? hr : [];
      packRows  = Array.isArray(pr) ? pr : [];
      expenses  = Array.isArray(er) ? er : [];
      reconRows = Array.isArray(rr) ? rr : [];
    }

    // Build pack totals map
    const packMap = {};
    if (Array.isArray(packRows)) {
      packRows.forEach(p => {
        if (!packMap[p.harvest_id]) packMap[p.harvest_id] = 0;
        packMap[p.harvest_id] += Number(p.amount||0);
      });
    }
    window._colPackMap = packMap;
    if (!rows || !rows.length) {
      if(sumEl) sumEl.innerHTML='';
      if(filterEl) filterEl.innerHTML='';
      listEl.innerHTML = '<div style="color:#9ca3af;text-align:center;padding:40px 0;">No collections recorded on this date</div>';
      return;
    }
    // Summary stats
    const totalCoins  = rows.reduce((s,r)=>s+Number(r.coins_total||0),0);
    const totalNet    = rows.reduce((s,r)=>s+Number(r.net_collectible||0),0);
    const totalSpawn  = rows.reduce((s,r)=>s+Number(r.spawn_share||0),0);
    const totalOwner  = rows.reduce((s,r)=>s+Number(r.customer_share||0),0);
    const byCollector = {};
    rows.forEach(r=>{ const c=r.collector||'Unknown'; if(!byCollector[c]) byCollector[c]={count:0,spawn:0,expenses:[]}; byCollector[c].count++; byCollector[c].spawn+=Number(r.spawn_share||0); });

    // Build recon + expense maps from already-loaded data
    window._colReconMap = {};
    reconRows.forEach(r=>{ window._colReconMap[r.collector]=r; });
    window._colExpMap = {};
    expenses.forEach(e=>{ const c=e.collector||'Unknown'; if(!window._colExpMap[c]) window._colExpMap[c]=[]; window._colExpMap[c].push(e); });
    expenses.forEach(e=>{ const c=e.collector||'Unknown'; if(byCollector[c]) byCollector[c].expenses.push(e); });
    const totalExpenses = expenses.reduce((s,e)=>s+Number(e.amount||0),0);

    if(sumEl) sumEl.innerHTML = `
      <div class="stat"><div class="sl">Vendos</div><div class="sv">${rows.length}</div></div>
      <div class="stat"><div class="sl">Total Coins</div><div class="sv">${_php(totalCoins)}</div></div>
      <div class="stat"><div class="sl">Net Collectible</div><div class="sv">${_php(totalNet)}</div></div>
      <div class="stat" style="border-bottom-color:#15803d"><div class="sl">Spawn Share</div><div class="sv" style="color:#15803d">${_php(totalSpawn)}</div></div>
      ${totalExpenses>0?`<div class="stat" style="border-bottom-color:#dc2626"><div class="sl">Expenses</div><div class="sv" style="color:#dc2626">${_php(totalExpenses)}</div></div>`:''}
    `;
    // Area filter buttons
    const areas = [...new Set(rows.map(r=>r.area||'—'))].sort();
    if(filterEl) filterEl.innerHTML =
      `<button onclick="colFilter('')" id="col-f-all" style="padding:4px 12px;border-radius:20px;border:1px solid #15803d;background:#15803d;color:white;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">All (${rows.length})</button>` +
      areas.map(a=>`<button onclick="colFilter('${a}')" data-col-area="${a}" style="padding:4px 12px;border-radius:20px;border:1px solid #e5e7eb;background:white;font-size:11px;cursor:pointer;font-family:inherit;">${a} (${rows.filter(r=>(r.area||'—')===a).length})</button>`).join('');
    // Render rows grouped by collector
    window._colAllRows = rows;
    window._colAreaFilter = '';
    listEl.innerHTML = `<div id="col-rows"></div>`;
    colRenderRows(rows);
  } catch(e) {
    listEl.innerHTML = '<div style="color:#dc2626;text-align:center;padding:40px 0;">Error: ' + e.message + '</div>';
  }
}

let _colMode = 'date';
function colSetMode(mode){
  _colMode = mode;
  const dateBtn=document.getElementById('colmode-date');
  const allBtn=document.getElementById('colmode-all');
  const dateView=document.getElementById('col-date-view');
  const allView=document.getElementById('col-all-view');
  const dateCtrl=document.getElementById('col-date-controls');
  if(mode==='date'){
    dateBtn.style.background='#15803d'; dateBtn.style.color='#fff';
    allBtn.style.background='transparent'; allBtn.style.color='#15803d';
    dateView.style.display=''; allView.style.display='none';
    if(dateCtrl) dateCtrl.style.display='';
  }else{
    allBtn.style.background='#15803d'; allBtn.style.color='#fff';
    dateBtn.style.background='transparent'; dateBtn.style.color='#15803d';
    dateView.style.display='none'; allView.style.display='';
    if(dateCtrl) dateCtrl.style.display='none';
    colLoadAll();
  }
}

let _colAllData = null;
async function colLoadAll(){
  const listEl=document.getElementById('col-all-list');
  const sumEl=document.getElementById('col-all-summary');
  const tabsEl=document.getElementById('col-all-tabs');
  listEl.innerHTML='<div style="text-align:center;padding:40px;color:#6b7280;font-size:13px;">⏳ Loading all collections…</div>';
  try{
    // Fetch ALL harvests (paginated) + packs + reconciliations regardless of date
    const [hr, pr, rr] = await Promise.all([
      sbAll('harvests', 'select=id,vendo_name,sheet_name,tg_name,area,collector,coins_total,net_collectible,spawn_share,harvest_date,harvested_at&order=harvest_date.desc'),
      sbAll('harvest_pack_items', 'saved_by=eq.office&select=harvest_id,amount'),
      sbAll('harvest_reconciliations', 'select=collector,recon_date,confirmed_at')
    ]);
    const rows=Array.isArray(hr)?hr:[];
    const packs=Array.isArray(pr)?pr:[];
    const recons=Array.isArray(rr)?rr:[];

    // Pack total per harvest
    const packMap={};
    packs.forEach(p=>{ packMap[p.harvest_id]=(packMap[p.harvest_id]||0)+Number(p.amount||0); });

    // Recon set: collector|date
    const reconSet=new Set();
    recons.forEach(r=>{ reconSet.add((r.collector||'')+'|'+(r.recon_date||'')); });

    // Classify each harvest
    const enriched=rows.map(r=>{
      const packTotal=packMap[r.id]||0;
      const spawn=Number(r.spawn_share||0);
      const counted=packTotal>0;
      const gap=counted?Math.round(packTotal-spawn):null;
      const reconciled=reconSet.has((r.collector||'')+'|'+(r.harvest_date||''));
      let status;
      if(!counted) status='uncounted';
      else if(gap===0) status='match';
      else if(gap<0) status='short';
      else status='surplus';
      return {...r, packTotal, gap, counted, reconciled, status};
    });

    _colAllData=enriched;

    // Summary
    const uncounted=enriched.filter(r=>r.status==='uncounted');
    const matched=enriched.filter(r=>r.status==='match');
    const shorts=enriched.filter(r=>r.status==='short');
    const surplus=enriched.filter(r=>r.status==='surplus');
    const reconciled=enriched.filter(r=>r.reconciled);

    sumEl.innerHTML=`
      <div class="stat" style="border-bottom-color:#6b7280;cursor:pointer;" onclick="colAllTab('uncounted')"><div class="sl">⏳ Uncounted</div><div class="sv" style="color:#6b7280">${uncounted.length}</div></div>
      <div class="stat" style="border-bottom-color:#15803d;cursor:pointer;" onclick="colAllTab('match')"><div class="sl">✓ Matched</div><div class="sv" style="color:#15803d">${matched.length}</div></div>
      <div class="stat" style="border-bottom-color:#dc2626;cursor:pointer;" onclick="colAllTab('short')"><div class="sl">🔴 Short</div><div class="sv" style="color:#dc2626">${shorts.length}</div></div>
      <div class="stat" style="border-bottom-color:#d97706;cursor:pointer;" onclick="colAllTab('surplus')"><div class="sl">🟡 Surplus</div><div class="sv" style="color:#d97706">${surplus.length}</div></div>`;

    tabsEl.innerHTML=[
      ['uncounted','⏳ Uncounted ('+uncounted.length+')','#6b7280'],
      ['match','✓ Matched ('+matched.length+')','#15803d'],
      ['short','🔴 Short ('+shorts.length+')','#dc2626'],
      ['surplus','🟡 Surplus ('+surplus.length+')','#d97706'],
      ['reconciled','🤝 Reconciled ('+reconciled.length+')','#1565c0'],
      ['all','📊 All ('+enriched.length+')','#374151'],
    ].map(([key,label,color])=>`<button data-colall-tab="${key}" onclick="colAllTab('${key}')" style="padding:5px 12px;border-radius:20px;border:1px solid ${color};background:white;color:${color};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">${label}</button>`).join('');

    colAllTab('uncounted');
  }catch(e){
    listEl.innerHTML='<div style="color:#dc2626;text-align:center;padding:40px 0;">Error: '+e.message+'</div>';
  }
}

function colAllTab(tabKey){
  if(!_colAllData) return;
  // highlight active tab
  document.querySelectorAll('[data-colall-tab]').forEach(b=>{
    const k=b.getAttribute('data-colall-tab');
    const active=k===tabKey;
    const color=b.style.color;
    if(active){ b.style.background=color; b.dataset._fg=color; b.style.color='#fff'; }
    else if(b.dataset._fg){ b.style.background='white'; b.style.color=b.dataset._fg; }
  });
  // re-fix colors (since we overwrote color)
  const colorMap={uncounted:'#6b7280',match:'#15803d',short:'#dc2626',surplus:'#d97706',reconciled:'#1565c0',all:'#374151'};
  document.querySelectorAll('[data-colall-tab]').forEach(b=>{
    const k=b.getAttribute('data-colall-tab');
    if(k===tabKey){ b.style.background=colorMap[k]; b.style.color='#fff'; b.style.borderColor=colorMap[k]; }
    else { b.style.background='white'; b.style.color=colorMap[k]; b.style.borderColor=colorMap[k]; }
  });

  let rows;
  if(tabKey==='all') rows=_colAllData;
  else if(tabKey==='reconciled') rows=_colAllData.filter(r=>r.reconciled);
  else rows=_colAllData.filter(r=>r.status===tabKey);

  const listEl=document.getElementById('col-all-list');
  if(!rows.length){ listEl.innerHTML='<div style="color:#9ca3af;text-align:center;padding:40px 0;">None in this category 🎉</div>'; return; }

  // Group by collector
  const byCol={};
  rows.forEach(r=>{ const c=r.collector||'Unknown'; if(!byCol[c])byCol[c]=[]; byCol[c].push(r); });

  const statusChip=(r)=>{
    if(r.status==='uncounted') return '<span style="background:#f3f4f6;color:#6b7280;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">⏳ Not counted</span>';
    if(r.status==='match') return '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">✓ Match</span>';
    if(r.status==='short') return '<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">Short '+_php(Math.abs(r.gap))+'</span>';
    return '<span style="background:#fef9c3;color:#92400e;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">Surplus '+_php(r.gap)+'</span>';
  };

  listEl.innerHTML=Object.entries(byCol).sort((a,b)=>a[0].localeCompare(b[0])).map(([col,hs])=>{
    const tCoins=hs.reduce((s,r)=>s+Number(r.coins_total||0),0);
    const tSpawn=hs.reduce((s,r)=>s+Number(r.spawn_share||0),0);
    const vendoRows=hs.sort((a,b)=>(b.harvest_date||'').localeCompare(a.harvest_date||'')).map((r,i)=>`
      <div style="display:grid;grid-template-columns:1fr 90px 90px 110px;gap:0;padding:9px 12px;border-bottom:1px solid #f3f4f6;align-items:center;${i%2===1?'background:#fafbff;':''}">
        <div>
          <div style="font-weight:700;font-size:13px;color:#1e293b;">${r.sheet_name||r.vendo_name||r.tg_name||'—'} ${r.reconciled?'<span title="Reconciled" style="font-size:10px;">🤝</span>':''}</div>
          <div style="font-size:10px;color:#9ca3af;">${r.area||'—'} · ${r.harvest_date||'—'}</div>
        </div>
        <div style="text-align:right;font-size:12px;font-weight:700;color:#15803d;">${_php(r.spawn_share)}</div>
        <div style="text-align:right;font-size:12px;color:${r.counted?'#1e3cb8':'#9ca3af'};">${r.counted?_php(r.packTotal):'—'}</div>
        <div style="text-align:right;">${statusChip(r)}</div>
      </div>`).join('');
    return `<div style="background:#fff;border:1.5px solid #e0e7ff;border-radius:12px;margin-bottom:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#1e3cb8,#1565c0);color:#fff;padding:11px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        ${collectorAvatar(col, 34)}
        <div style="font-size:15px;font-weight:700;">${col}</div>
        <span style="background:rgba(255,255,255,.2);padding:2px 10px;border-radius:10px;font-size:11px;">${hs.length} vendo${hs.length!==1?'s':''}</span>
        <div style="margin-left:auto;display:flex;gap:14px;text-align:right;font-size:12px;">
          <div><div style="opacity:.7;font-size:10px;">Coins</div><div style="font-weight:700;">${_php(tCoins)}</div></div>
          <div><div style="opacity:.7;font-size:10px;">Spawn</div><div style="font-weight:700;">${_php(tSpawn)}</div></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 90px 90px 110px;gap:0;padding:6px 12px;background:#f8fafc;border-bottom:2px solid #e5e7eb;">
        <div style="font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;">Vendo</div>
        <div style="font-size:10px;font-weight:800;color:#15803d;text-transform:uppercase;text-align:right;">Spawn</div>
        <div style="font-size:10px;font-weight:800;color:#1e3cb8;text-transform:uppercase;text-align:right;">Count</div>
        <div style="font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;text-align:right;">Status</div>
      </div>
      ${vendoRows}
    </div>`;
  }).join('');
}

function colFilter(area) {
  window._colAreaFilter = area;
  document.querySelectorAll('[data-col-area]').forEach(b=>{ b.style.background='white'; b.style.color='#374151'; b.style.borderColor='#e5e7eb'; });
  const allBtn = document.getElementById('col-f-all');
  if (!area) { if(allBtn){allBtn.style.background='#15803d';allBtn.style.color='white';} }
  else { const ab=document.querySelector(`[data-col-area="${area}"]`); if(ab){ab.style.background='#15803d';ab.style.color='white';ab.style.borderColor='#15803d';} if(allBtn){allBtn.style.background='white';allBtn.style.color='#374151';} }
  const rows = area ? (window._colAllRows||[]).filter(r=>(r.area||'—')===area) : (window._colAllRows||[]);
  colRenderRows(rows);
}

function colRenderRows(rows) {
  const el = document.getElementById('col-rows');
  if (!el) return;

  // Group by collector
  const byCol = {};
  rows.forEach(r => {
    const c = r.collector||'Unknown';
    if (!byCol[c]) byCol[c] = [];
    byCol[c].push(r);
  });

  const reconMap = window._colReconMap || {};
  const expMap   = window._colExpMap   || {};

  el.innerHTML = Object.entries(byCol).map(([col, harvests]) => {
    const totalSpawn = harvests.reduce((s,r)=>s+Number(r.spawn_share||0),0);
    const totalCoins = harvests.reduce((s,r)=>s+Number(r.coins_total||0),0);
    const exps       = expMap[col] || [];
    const totalExp   = exps.reduce((s,e)=>s+Number(e.amount||0),0);
    const netRemit   = totalSpawn - totalExp;
    const recon      = reconMap[col];
    const reconTime  = recon ? new Date(recon.confirmed_at).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit'}) : '';

    // Table header
    const tableHeader = `
      <div style="display:grid;grid-template-columns:1fr 110px 110px 100px;gap:0;padding:6px 12px;background:#f8fafc;border-bottom:2px solid #e5e7eb;">
        <div style="font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Vendo</div>
        <div style="font-size:10px;font-weight:800;color:#15803d;text-transform:uppercase;letter-spacing:.05em;text-align:right;">Spawn Harvest</div>
        <div style="font-size:10px;font-weight:800;color:#1e3cb8;text-transform:uppercase;letter-spacing:.05em;text-align:right;">Spawn Count</div>
        <div style="font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;text-align:right;">Status</div>
      </div>`;

    // Vendo rows
    const vendoRows = tableHeader + harvests.map((r,i) => {
      const t = r.harvested_at ? new Date(r.harvested_at).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit'}) : '—';
      const packTotal = (window._colPackMap||{})[r.id]||0;
      const packGap   = packTotal > 0 ? Math.round(packTotal - Number(r.spawn_share||0)) : null;
      let statusChip, statusBg;
      if (packTotal === 0) {
        statusChip = '⏳ Not counted'; statusBg = 'background:#f3f4f6;color:#6b7280;';
      } else if (packGap === 0) {
        statusChip = '✓ Match'; statusBg = 'background:#dcfce7;color:#15803d;';
      } else if (packGap < 0) {
        statusChip = 'Short '+_php(Math.abs(packGap)); statusBg = 'background:#fee2e2;color:#dc2626;';
      } else {
        statusChip = 'Surplus '+_php(packGap); statusBg = 'background:#fef9c3;color:#92400e;';
      }
      return `<div style="display:grid;grid-template-columns:1fr 110px 110px 100px;gap:0;padding:9px 12px;border-bottom:1px solid #f3f4f6;align-items:center;${i%2===1?'background:#fafafa':''}">
        <div>
          <div style="font-weight:700;font-size:13px;color:#1e293b;">${r.vendo_name||r.sheet_name||r.tg_name||'—'}</div>
          <div style="font-size:10px;color:#9ca3af;">${r.area||'—'} · ${t}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:13px;font-weight:800;color:#15803d;">${_php(r.spawn_share)}</div>
          <div style="font-size:10px;color:#9ca3af;">Coins ${_php(r.coins_total)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:13px;font-weight:800;color:${packTotal>0?'#1e3cb8':'#9ca3af'};">${packTotal>0?_php(packTotal):'—'}</div>
        </div>
        <div style="text-align:right;">
          <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;${statusBg}">${statusChip}</span>
        </div>
      </div>`;
    }).join('');

    // Expense rows with receipt photo
    const expSection = exps.length ? `
      <div style="background:#fff8f8;border-top:2px dashed #fecaca;">
        <div style="padding:6px 12px 4px;font-size:10px;font-weight:800;color:#dc2626;text-transform:uppercase;letter-spacing:.06em;">💸 Expenses</div>
        ${exps.map(e=>`
          <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #fee2e2;">
            ${e.receipt_photo_url
              ? `<img src="${e.receipt_photo_url}" onclick="window.open('${e.receipt_photo_url}')"
                  style="width:48px;height:36px;object-fit:cover;border-radius:6px;cursor:pointer;border:1.5px solid #fca5a5;flex-shrink:0"
                  title="Tap to view receipt">`
              : `<div style="width:48px;height:36px;background:#fee2e2;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">🧾</div>`
            }
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:700;color:#374151;">${e.category}</div>
              ${e.description?`<div style="font-size:11px;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.description}</div>`:''}
            </div>
            <div style="font-size:14px;font-weight:900;color:#dc2626;flex-shrink:0;">−${_php(e.amount)}</div>
          </div>`).join('')}
        <div style="display:flex;justify-content:space-between;padding:6px 12px 8px;font-size:12px;">
          <span style="color:#9ca3af">${exps.length} expense${exps.length>1?'s':''}</span>
          <span style="font-weight:800;color:#dc2626;">Total −${_php(exps.reduce((s,e)=>s+Number(e.amount||0),0))}</span>
        </div>
      </div>` : '';
    const expRows = expSection;

    const colId = 'col-body-'+col.replace(/\s+/g,'_');
    return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:12px;overflow:hidden;">
      <!-- Collector header -->
      <div style="background:linear-gradient(135deg,#1e3cb8,#2563eb);color:#fff;padding:12px 14px;cursor:pointer;" onclick="var b=document.getElementById('${colId}');b.style.display=b.style.display==='none'?'block':'none';">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div style="display:flex;align-items:center;gap:10px;">
            ${collectorAvatar(col, 38)}
            <div>
              <div style="font-size:15px;font-weight:900;">${col}</div>
              <div style="font-size:11px;opacity:.8;margin-top:2px;">${harvests.length} vendo${harvests.length>1?'s':''}</div>
            </div>
          </div>
          <div style="text-align:right;">
            ${recon
              ? `<div style="background:rgba(255,255,255,.2);border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;">✅ Reconciled ${reconTime}</div>`
              : `<div style="background:rgba(255,200,0,.2);border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;color:#fde68a;">⏳ Pending</div>`
            }
          </div>
        </div>
        <!-- Stats row -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px;">
          <div style="background:rgba(255,255,255,.12);border-radius:6px;padding:6px;text-align:center;">
            <div style="font-size:13px;font-weight:900;">${_php(totalCoins)}</div>
            <div style="font-size:9px;opacity:.75;text-transform:uppercase;">Coins</div>
          </div>
          <div style="background:rgba(255,255,255,.12);border-radius:6px;padding:6px;text-align:center;">
            <div style="font-size:13px;font-weight:900;">${_php(totalSpawn)}</div>
            <div style="font-size:9px;opacity:.75;text-transform:uppercase;">Spawn</div>
          </div>
          <div style="background:rgba(255,255,255,.12);border-radius:6px;padding:6px;text-align:center;">
            <div style="font-size:13px;font-weight:900;color:#fca5a5;">${totalExp>0?'−'+_php(totalExp):'₱0'}</div>
            <div style="font-size:9px;opacity:.75;text-transform:uppercase;">Expenses</div>
          </div>
          <div style="background:rgba(255,255,255,.2);border-radius:6px;padding:6px;text-align:center;">
            <div style="font-size:13px;font-weight:900;">${_php(netRemit)}</div>
            <div style="font-size:9px;opacity:.75;text-transform:uppercase;">Net Remit</div>
          </div>
        </div>
      </div>
      <!-- Toggle hint -->
      <div style="text-align:center;padding:4px;font-size:10px;opacity:.6;cursor:pointer;" onclick="var b=document.getElementById('${colId}');b.style.display=b.style.display==='none'?'block':'none';">▼ tap to expand / collapse</div>
      <!-- Vendo rows (collapsed by default) -->
      <div id="${colId}" style="display:none;">
        ${vendoRows}
        ${expRows}
      </div>
    </div>`;
  }).join('') || '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">No records</div>';
}


async function csLoad() {
  try {
    const [collectors, todayHarvests] = await Promise.all([
      sb('collectors', 'select=id,name,pin,area,active&order=name.asc', 100),
      sb('harvests', 'select=collector,net_collectible,spawn_share,harvest_date&order=harvest_date.desc', 2000)
    ]);
    csRenderList(collectors);
    csRenderPerf(collectors, todayHarvests);
  } catch(e) {
    document.getElementById('cs-list').innerHTML = '<div style="padding:12px 16px;color:#dc2626;font-size:13px;">Error: '+e.message+'</div>';
  }
}

function csRenderList(collectors) {
  const el = document.getElementById('cs-list');
  if(!collectors||!collectors.length){el.innerHTML='<div style="padding:12px 16px;text-align:center;color:#9ca3af;font-size:13px;">No collectors found</div>';return;}
  el.innerHTML = collectors.map(c=>`
    <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #f3f4f6;">
      <div style="width:36px;height:36px;background:${c.active?'#dbeafe':'#f3f4f6'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:${c.active?'#1565c0':'#9ca3af'};">${(c.name||'?')[0].toUpperCase()}</div>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;color:#1e293b;">${c.name}</div>
        <div style="font-size:11px;color:#6b7280;">
          ${c.area||'—'} · PIN: <span id="pin-val-${c.id}">●●●●</span>
          <button onclick="var s=document.getElementById('pin-val-${c.id}');s.textContent=s.textContent==='${c.pin||'????'}'?'●●●●':'${c.pin||'????'}';" 
            style="border:none;background:none;cursor:pointer;padding:0 3px;font-size:12px;" title="Show/hide PIN">👁</button>
        </div>
      </div>
      <span style="background:${c.active?'#dcfce7':'#f3f4f6'};color:${c.active?'#15803d':'#6b7280'};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;">${c.active?'Active':'Inactive'}</span>
      <button onclick="csChangePin(${c.id},'${(c.name||'').replace(/'/g,"\'")}')" style="height:28px;padding:0 10px;border:1px solid #d1d5db;border-radius:6px;font-size:11px;cursor:pointer;background:white;color:#374151;">Change PIN</button>
      <button onclick="csRemove(${c.id},'${(c.name||'').replace(/'/g,"\'")}')" style="height:28px;padding:0 10px;border:1px solid #fca5a5;border-radius:6px;font-size:11px;cursor:pointer;background:white;color:#dc2626;">Remove</button>
    </div>`).join('');
}

function csRenderPerf(collectors, harvests) {
  const el = document.getElementById('cs-perf');
  const byCollector = {};
  (harvests||[]).forEach(h => {
    const col = h.harvest_groups?.collector || '—';
    if(!byCollector[col]) byCollector[col] = {count:0, net:0};
    byCollector[col].count++;
    byCollector[col].net += Number(h.net_collectible||0);
  });
  const sorted = Object.entries(byCollector).sort((a,b)=>b[1].count-a[1].count);
  if(!sorted.length){el.innerHTML='<div style="padding:12px 16px;text-align:center;color:#9ca3af;font-size:13px;">No harvests today yet</div>';return;}
  const maxCount = sorted[0][1].count||1;
  el.innerHTML = sorted.map(([name,d],i)=>`
    <div style="padding:10px 16px;border-bottom:1px solid #f3f4f6;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:13px;font-weight:600;color:#1e293b;">${i===0?'🏆 ':''}${name}</span>
        <span style="font-size:12px;color:#15803d;font-weight:600;">${d.count} harvested · ${_php(d.net)}</span>
      </div>
      <div style="background:#f3f4f6;border-radius:4px;height:6px;overflow:hidden;">
        <div style="background:${i===0?'#15803d':i===1?'#1565c0':'#d97706'};height:100%;width:${Math.round(d.count/maxCount*100)}%;border-radius:4px;transition:width .3s;"></div>
      </div>
    </div>`).join('');
}

function csShowAdd() {
  document.getElementById('cs-add-form').style.display = 'block';
  document.getElementById('cs-new-name').focus();
}

async function csSaveNew() {
  const name = document.getElementById('cs-new-name').value.trim();
  const pin  = document.getElementById('cs-new-pin').value.trim();
  const area = document.getElementById('cs-new-area').value.trim();
  const pw   = document.getElementById('cs-new-pw').value.trim();
  if(pw!=='101510'){toast('Wrong admin password');return;}
  if(!name){toast('Name required');return;}
  if(pin&&(pin.length!==4||isNaN(pin))){toast('PIN must be 4 digits');return;}
  try{
    const r=await fetch(SB_URL+'/rest/v1/collectors',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({name,pin:pin||'0000',area:area||null,active:true})});
    if(r.ok){document.getElementById('cs-add-form').style.display='none';document.getElementById('cs-new-name').value='';document.getElementById('cs-new-pin').value='';document.getElementById('cs-new-area').value='';document.getElementById('cs-new-pw').value='';toast('Collector added!');csLoad();}
    else toast('Save failed — check table exists');
  }catch(e){toast('Error: '+e.message);}
}

async function csChangePin(id, name) {
  const pw = prompt('Admin password:');
  if(pw!=='101510'){toast('Wrong password');return;}
  const newPin = prompt('New PIN for '+name+' (4 digits):');
  if(!newPin||newPin.length!==4||isNaN(newPin)){toast('PIN must be 4 digits');return;}
  try{
    const r=await fetch(SB_URL+'/rest/v1/collectors?id=eq.'+id,{method:'PATCH',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({pin:newPin})});
    if(r.ok){toast('PIN updated for '+name);csLoad();}
    else toast('Update failed');
  }catch(e){toast('Error: '+e.message);}
}

async function csRemove(id, name) {
  const pw = prompt('Admin password to remove '+name+':');
  if(pw!=='101510'){toast('Wrong password');return;}
  if(!confirm('Remove collector '+name+'? This cannot be undone.'))return;
  try{
    const r=await fetch(SB_URL+'/rest/v1/collectors?id=eq.'+id,{method:'PATCH',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({active:false})});
    if(r.ok){toast(name+' deactivated');csLoad();}
    else toast('Update failed');
  }catch(e){toast('Error: '+e.message);}
}

async function loadDashboard() {
  // Update cache indicator immediately
  if (typeof updateCacheIndicator === 'function') updateCacheIndicator();
  // Load modular overview tab (uses cache)
  if (typeof overviewLoad === 'function') {
    overviewLoad();
  }
  // Always hide harvest overlays when loading dashboard
  ['hv-tab-audited','hv-overlay-recon','hv-overlay-records'].forEach(function(oid){
    var el=document.getElementById(oid); if(el) el.style.display='none';
  });
  document.getElementById("dash-stats").innerHTML = '<div style="padding:20px;color:var(--mu)">Loading...</div>';
  try {
    // Load from storage cache — no DB queries for overview data
    const _apiData = await apiLoad();
    const areas  = (_apiData && _apiData.areas)   || await sb("summary_by_area","order=total_sales.desc",20);
    const trend  = (_apiData && _apiData.trend)   || await sb("trend_7day_mat","order=date.asc",7);
    const hacked = (_apiData && _apiData.suspicious) || await sb("hacked_summary_mat","order=txn_count.desc",1000);
    const recent = (_apiData && _apiData.recent)  || await sb("transactions","select=date,time,vendo,area,amount,created_at&order=created_at.desc",30);
    const vendos = (_apiData && _apiData.all_vendos) || await sb("summary_by_vendo","order=sales.desc&select=vendo,sheet_name,area,sales,txn_count,today_sales,last_date",2000);
    console.log("[VENDOS DEBUG]", "apiData:", !!_apiData, "all_vendos len:", _apiData&&_apiData.all_vendos&&_apiData.all_vendos.length, "vendos len:", vendos&&vendos.length);
    console.log('[VENDOS]', '_apiData keys:', _apiData ? Object.keys(_apiData) : 'null', 'all_vendos:', _apiData?.all_vendos?.length, 'vendos:', vendos?.length);

    // Prefer storage cache all_vendos (no DB query needed)
    const _cached = await apiLoad();
    if(_cached && _cached.all_vendos && _cached.all_vendos.length) {
      allVendos = _cached.all_vendos;
    } else if(vendos && vendos.length) {
      allVendos = vendos;
    } else if(_cached && _cached.top20 && _cached.top20.length) {
      allVendos = _cached.top20.map(v=>({vendo:v.tg_name||v.sheet_name,area:v.area,sales:v.total_amount||v.total_sales,txn_count:0,today_sales:0}));
    }
    suspMap   = {};
    hacked.forEach(h => { suspMap[h.vendo] = parseInt(h.txn_count||0); });

    // Use storage cache stats — no DB query needed
    const _stats     = _cached && _cached.stats ? _cached.stats : {};
    const totalTx    = _stats.total_txns   || areas.reduce((s,a)=>s+parseInt(a.txn_count||0),0);
    const totalSales = _stats.total_sales  || areas.reduce((s,a)=>s+parseFloat(a.total_sales||0),0);
    const todaySales = _stats.today_sales  || areas.reduce((s,a)=>s+parseFloat(a.today_sales||0),0);
    const totalVendos= _stats.total_vendos || allVendos.length;
    const hackedCnt  = hacked.reduce((s,h)=>s+parseInt(h.txn_count||0),0);

    sbFailCount = 0; sbOffline = false; const _banner = document.getElementById("conn-error-banner"); if(_banner) _banner.remove();
    document.getElementById("dash-stats").innerHTML = `
      <div class="stat" style="border-bottom-color:#7c3aed" onclick="openVendoModal()"><div class="sl">Active Vendos</div><div class="sv pur">${totalVendos.toLocaleString()}</div><div style="font-size:9px;color:var(--mu);margin-top:2px">click to view all</div></div>
      <div class="stat" style="border-bottom-color:#1565c0"><div class="sl">Total Transactions</div><div class="sv blue">${totalTx.toLocaleString()}</div></div>
      <div class="stat" style="border-bottom-color:#1565c0"><div class="sl">Total Sales</div><div class="sv blue">${fmt(totalSales)}</div></div>
      <div class="stat" style="border-bottom-color:#16a34a"><div class="sl">Today's Sales</div><div class="sv green">${fmt(todaySales)}</div></div>
      <div class="stat" style="border-bottom-color:#dc2626;border-color:rgba(220,38,38,.15)" onclick="showP('suspicious',document.querySelector('[data-panel="suspicious"]'));loadSuspicious()"><div class="sl" style="color:#dc2626">Suspicious Txns</div><div class="sv red">${hackedCnt.toLocaleString()}</div></div>
    `;

    if(hackedCnt>0){
      document.getElementById("suspicious-alert").style.display="flex";
      document.getElementById("alert-detail").textContent=`${hackedCnt} suspicious transactions detected`;
      document.getElementById("susp-count").textContent=hackedCnt;
      const nb=document.getElementById("nav-sus-badge");
      if(nb)nb.textContent=hackedCnt>999?Math.round(hackedCnt/1000)+'k':hackedCnt;
    }

    // 7-day trend
    const tDates = trend.map(t=>{ const d=new Date(t.date); return d.toLocaleDateString("en-PH",{month:"short",day:"numeric"}); });
    if(trendChart) trendChart.destroy();
    try{ Chart.getChart(document.getElementById("trend-chart"))?.destroy(); }catch(e){}
    trendChart = new Chart(document.getElementById("trend-chart"),{
      type:"bar",
      data:{labels:tDates,datasets:[{label:"Sales",data:trend.map(t=>parseFloat(t.total_sales||0)),backgroundColor:"#1565c0",borderRadius:4}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>"₱"+v.toLocaleString()}}}}
    });
    if(trend.length) document.getElementById("trend-range").textContent=`${trend[0].date} — ${trend[trend.length-1].date}`;

    // Area chart handled by overviewLoad() — skip duplicate chart creation here

    // Today by area — show all areas with today_sales > 0, MIX AREAS at bottom labeled separately
    const todayByArea = areas.filter(a=>parseFloat(a.today_sales||0)>0)
      .sort((a,b)=>parseFloat(b.today_sales||0)-parseFloat(a.today_sales||0));
    document.getElementById("today-strip").innerHTML = todayByArea.length
      ? todayByArea.map(a=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--bd);font-size:12px;">
          <span style="color:${a.area==='MIX AREAS'?'#d97706':'var(--mu)'};font-size:11px;">${a.area}${a.area==='MIX AREAS'?' 📡':''}</span>
          <span style="font-weight:700;color:${a.area==='MIX AREAS'?'#d97706':'#1565c0'};">${fmt(a.today_sales)}</span>
        </div>`).join("")
      : '<div style="font-size:11px;color:var(--mu);padding:4px 0;">No sales yet today</div>';
    // Area grid — exclude MIX AREAS from main grid, show it separately
    const mainAreaList = areas.filter(a=>a.area!=='MIX AREAS');
    const mixArea = areas.find(a=>a.area==='MIX AREAS');
    document.getElementById("area-grid").innerHTML = mainAreaList.map(a=>`
      <div onclick="showAreaVendos('${a.area}')" style="background:#f8faff;border:1px solid rgba(30,60,200,.09);border-top:2px solid #1565c0;border-radius:6px;padding:6px 8px;cursor:pointer;transition:box-shadow .12s;" onmouseover="this.style.boxShadow='0 2px 8px rgba(30,60,200,.12)'" onmouseout="this.style.boxShadow=''">
        <div style="font-size:8px;color:#6b7394;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:1px">${a.area}</div>
        <div style="font-size:13px;font-weight:700;color:#1565c0">${fmt(a.total_sales)}</div>
        <div style="font-size:8px;color:#6b7394;margin-top:1px">${parseInt(a.txn_count).toLocaleString()} txns</div>
        <div style="font-size:9px;color:#16a34a;margin-top:1px">↑ ${fmt(a.today_sales)}</div>
      </div>`).join("")
    + (mixArea ? `
      <div onclick="showAreaVendos('MIX AREAS')" style="background:#fff8f0;border:1px solid rgba(217,119,6,.2);border-top:2px solid #d97706;border-radius:6px;padding:6px 8px;cursor:pointer;transition:box-shadow .12s;" onmouseover="this.style.boxShadow='0 2px 8px rgba(217,119,6,.12)'" onmouseout="this.style.boxShadow=''">
        <div style="font-size:8px;color:#92400e;text-transform:uppercase;letter-spacing:.04em;margin-bottom:1px">📡 MIX AREAS <span style="font-size:7px;opacity:.7">(outside GC)</span></div>
        <div style="font-size:13px;font-weight:700;color:#d97706">${fmt(mixArea.total_sales)}</div>
        <div style="font-size:8px;color:#92400e;margin-top:1px">${parseInt(mixArea.txn_count).toLocaleString()} txns</div>
        <div style="font-size:9px;color:#16a34a;margin-top:1px">↑ ${fmt(mixArea.today_sales)}</div>
      </div>` : '');

    // Top 20 — use vendos directly (already loaded from storage above)
    try {
    console.log('[TOP20 DEBUG] vendos:', vendos?.length, 'allVendos:', allVendos?.length, '_apiData.all_vendos:', _apiData?.all_vendos?.length);
    const _vendorList = (vendos && vendos.length) ? vendos : allVendos;
    const top20h = (_vendorList||[]).slice(0,20);
    const top20l = [...(_vendorList||[])].sort((a,b)=>parseFloat(a.sales||0)-parseFloat(b.sales||0)).slice(0,20);
    if (_vendorList && _vendorList.length) allVendos = _vendorList;
    const mkItem = (v,i,isLow) => `
      <div class="top10-item" onclick="openVendoFromSearch('${esc(v.vendo)}','${v.area}')">
        <span style="font-weight:700;color:${!isLow&&i<3?'#d97706':'var(--mu)'};min-width:18px;font-size:11px">${i+1}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px">${v.vendo}</div>
          <div style="font-size:9px;color:var(--mu)">${v.area}</div>
        </div>
        <span style="font-weight:700;color:${isLow?'var(--red)':'var(--ok)'};font-size:12px;flex-shrink:0">${fmt(v.sales)}</span>
      </div>`;
    document.getElementById("top10-high").innerHTML = top20h.map((v,i)=>mkItem(v,i,false)).join("");
    document.getElementById("top10-low").innerHTML  = top20l.map((v,i)=>mkItem(v,i,true)).join("");
    } catch(top20err) { console.error('[TOP20 CRASH]', top20err); }

    // Suspicious sidebar
    document.getElementById("suspicious-sidebar").innerHTML = hacked.slice(0,15).map(h=>`
      <div class="lr" onclick="openVendoFromSearch('${esc(h.vendo)}','${h.area}')">
        <div><div class="lrn" style="color:#dc2626">${h.vendo}</div><div class="lrm">${h.area} · ${h.txn_count} txns</div></div>
        <span style="font-weight:700;color:#dc2626">${fmt(h.total_amount)}</span>
      </div>`).join("") || '<div style="padding:20px;text-align:center;color:var(--mu);font-size:12px">No suspicious transactions</div>';

    // Recent — initial render (refreshRecentTxns takes over every 10s)
    document.getElementById("recent-txns").innerHTML = recent.map((t,i)=>{
      const phTime = t.created_at ? new Date(t.created_at).toLocaleString("en-PH",{timeZone:"Asia/Manila",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}) : "";
      return `<div onclick="openVendoFromSearch('${esc(t.vendo)}','${t.area}')" style="padding:7px 10px;border-bottom:1px solid #dbeafe;cursor:pointer;background:${i===0?'#dbeafe':'#f0f4ff'};display:flex;justify-content:space-between;align-items:center;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='${i===0?'#dbeafe':'#f0f4ff'}'">
        <div style="min-width:0;flex:1;">
          <div style="font-weight:700;font-size:13px;color:#1a1d2e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${i===0?'🆕 ':''}${t.vendo}</div>
          <div style="font-size:10px;color:#6b7394;margin-top:1px;">${t.area} · ${phTime}</div>
        </div>
        <div style="font-weight:800;font-size:14px;color:#1565c0;margin-left:8px;flex-shrink:0;">${fmt(t.amount)}</div>
      </div>`;
    }).join("");

  } catch(e) {
    if (e.message !== 'undefined')
      if(!e.message||!e.message.includes("Canvas"))document.getElementById("dash-stats").innerHTML=`<div style="padding:20px;color:red;">Error: ${e.message}</div>`;
  }
}

// ══════════════════════════════════════════════════════════
// VENDO MODAL
// ══════════════════════════════════════════════════════════
function openVendoModal() {
  document.getElementById("vendo-modal").classList.add("open");
  document.getElementById("modal-search").value = "";
  filterModalVendos("");
}
function closeVendoModal() { document.getElementById("vendo-modal").classList.remove("open"); }

function filterModalVendos(q) {
  const lower = q.toLowerCase();
  const filtered = allVendos.filter(v =>
    !q || v.vendo.toLowerCase().includes(lower)
  );

  document.getElementById("modal-count").textContent =
    `Showing ${filtered.length} of ${allVendos.length} vendos`;

  document.getElementById("modal-vlist").innerHTML = filtered.map(v=>`
    <div class="vlist-row" onclick="closeVendoModal();openVendoFromSearch('${esc(v.vendo)}','${v.area}')">
      <div>
        <div style="font-weight:600;font-size:13px">${v.vendo}</div>
        <div style="font-size:11px;color:var(--mu)">${v.area}</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700;color:#1565c0">${fmt(v.sales)}</div>
        <div style="font-size:11px;color:var(--mu)">${parseInt(v.txn_count||v.txns||0).toLocaleString()} txns</div>
      </div>
    </div>`).join("") || '<div style="padding:20px;text-align:center;color:var(--mu)">No vendos found</div>';
}

// ══════════════════════════════════════════════════════════
// VENDOS
// ══════════════════════════════════════════════════════════
async function loadVendos() {
  if(!allVendos.length) {
    const v = await sb("summary_by_vendo","order=sales.desc&select=vendo,sheet_name,area,sales,txn_count,today_sales,last_date",2000);
    allVendos = v;
  }
  const totalSales = allVendos.reduce((s,v)=>s+parseFloat(v.sales||0),0);
  // vendo_summary view returns txn_count (not txns) — handle both field names
  const totalTxns  = allVendos.reduce((s,v)=>s+parseInt(v.txn_count||v.txns||0),0);
  const totalVendos= allVendos.length;
  document.getElementById("vendo-totals").innerHTML = `
    <div class="stat"><div class="sl">Total Vendos</div><div class="sv pur">${totalVendos.toLocaleString()}</div></div>
    <div class="stat"><div class="sl">Total Sales</div><div class="sv blue">${fmt(totalSales)}</div></div>
    <div class="stat"><div class="sl">Total Transactions</div><div class="sv blue">${totalTxns.toLocaleString()}</div></div>
    <div class="stat"><div class="sl">Avg per Vendo</div><div class="sv amber">${fmt(Math.round(totalSales/totalVendos))}</div></div>
  `;
  filterVendos();
}

function filterVendos() {
  const q    = (document.getElementById("v-search")?.value||"").toLowerCase();
  const area = document.getElementById("v-area")?.value||"";
  const sort = document.getElementById("v-sort")?.value||"desc";

  filteredVendos = allVendos.filter(v=>{
    if(q && !v.vendo.toLowerCase().includes(q) && !v.area.toLowerCase().includes(q) && !(v.sheet_name||'').toLowerCase().includes(q)) return false;
    if(area && v.area!==area) return false;
    return true;
  });

  if(sort==="recent")      filteredVendos.sort((a,b)=>(b.last_date||'').localeCompare(a.last_date||''));
  else if(sort==="asc")    filteredVendos.sort((a,b)=>(a.sales||0)-(b.sales||0));
  else if(sort==="desc")   filteredVendos.sort((a,b)=>(b.sales||0)-(a.sales||0));
  else if(sort==="name")   filteredVendos.sort((a,b)=>a.vendo.localeCompare(b.vendo));
  else if(sort==="suspicious") filteredVendos.sort((a,b)=>(suspMap[b.vendo]||0)-(suspMap[a.vendo]||0));

  // Update filtered totals
  const fSales = filteredVendos.reduce((s,v)=>s+parseFloat(v.sales||0),0);
  const fTxns  = filteredVendos.reduce((s,v)=>s+parseInt(v.txn_count||v.txns||0),0);
  document.getElementById("vendo-totals").innerHTML = `
    <div class="stat"><div class="sl">Showing Vendos</div><div class="sv pur">${filteredVendos.length.toLocaleString()}</div></div>
    <div class="stat"><div class="sl">Filtered Sales</div><div class="sv blue">${fmt(fSales)}</div></div>
    <div class="stat"><div class="sl">Filtered Txns</div><div class="sv blue">${fTxns.toLocaleString()}</div></div>
    <div class="stat"><div class="sl">Total Vendos</div><div class="sv amber">${allVendos.length.toLocaleString()}</div></div>
  `;

  vPage_n = 1;
  renderVendos();
}

function renderVendos() {
  const PG=50, total=filteredVendos.length, start=(vPage_n-1)*PG;
  const page=filteredVendos.slice(start,start+PG);
  document.getElementById("v-rc").textContent=`${total.toLocaleString()} vendos found`;
  document.getElementById("vp-l").textContent=`Page ${vPage_n} of ${Math.ceil(total/PG)||1}`;
  document.getElementById("vp-p").disabled=vPage_n===1;
  document.getElementById("vp-n").disabled=start+PG>=total;
  document.getElementById("v-tbody").innerHTML=page.map((v,i)=>{
    const susp=suspMap[v.vendo]||0;
    const dispName = v.sheet_name || v.vendo;
    const subName  = v.sheet_name ? `<div style="font-size:9px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${v.vendo}</div>` : '';
    return `<tr onclick="openVendoDetail('${esc(v.vendo)}','${v.area}')">
      <td style="color:var(--mu)">${start+i+1}</td>
      <td style="font-weight:500;color:#1565c0">${dispName}${subName}</td>
      <td><span class="pill info">${v.area}</span></td>
      <td style="font-weight:700">${fmt(v.sales)}</td>
      <td>${parseInt(v.txn_count||v.txns||0).toLocaleString()}</td>
      <td style="color:var(--mu)">${v.last_date||"—"}</td>
      <td>${susp?`<span class="pill red">⚠️ ${susp}</span>`:`<span class="pill ok">✓ OK</span>`}</td>
    </tr>`;
  }).join("")||'<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--mu)">No vendos found</td></tr>';
}
function vPage(d){vPage_n+=d;renderVendos();}

function showAreaVendos(area) {
  showP("vendos",document.querySelector(".nav-bar button:nth-child(2)"));
  document.getElementById("v-area").value=area;
  filterVendos();
}

// ══════════════════════════════════════════════════════════
// VENDO DETAIL
// ══════════════════════════════════════════════════════════
async function openVendoDetail(vendo, area) {
  currentVendo=vendo; vtPage_n=1;
  // Make sure we're on vendos panel
  document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".nav-bar button").forEach(b=>b.classList.remove("active"));
  document.getElementById("panel-vendos").classList.add("active");
  document.querySelector(".nav-bar button:nth-child(2)").classList.add("active");
  document.getElementById("view-vlist").style.display="none";
  document.getElementById("view-vtxns").style.display="block";
  // Reset to Transactions tab (default)
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  const txnTabBtn = document.querySelector('.tab-btn[onclick*="txns"]');
  if(txnTabBtn) txnTabBtn.classList.add('active');
  document.querySelectorAll('.subpanel').forEach(p=>p.classList.remove('active'));
  const txnPanel = document.getElementById('vt-txns');
  if(txnPanel) txnPanel.classList.add('active');
  document.getElementById("vtxn-title").textContent=vendo;
  document.getElementById("vtxn-sub").textContent=area+" area";
  document.getElementById("vtxn-stats").innerHTML="<div style='color:#9ca3af;font-size:11px;padding:4px 0'>Loading…</div>";
  showBread(`Vendos → ${vendo}`, closeVendo);

  // No default date filter — load ALL transactions
  document.getElementById("vtxn-to").value="";
  document.getElementById("vtxn-from").value="";

  await Promise.all([loadVendoTxns(), loadVendoMonthly(vendo), loadVendoSuspicious(vendo)]);
}

async function loadVendoHarvestRecords() {
  const vendo = currentVendo;
  const content = document.getElementById('vt-harvest-content');
  if (!vendo) return;
  content.innerHTML = '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px;">Loading harvest records...</div>';

  try {
    const r = await fetch(`${SB_URL}/rest/v1/harvests?tg_name=eq.${encodeURIComponent(vendo)}&order=harvest_date.desc&limit=50`, {
      headers: HDR
    });
    let rows = await r.json();

    // Also try by vendo_name if tg_name returns nothing
    if (!rows.length) {
      const r2 = await fetch(`${SB_URL}/rest/v1/harvests?vendo_name=eq.${encodeURIComponent(vendo)}&order=harvest_date.desc&limit=50`, {
        headers: HDR
      });
      rows = await r2.json();
    }

    if (!rows.length) {
      content.innerHTML = `
        <div style="text-align:center;padding:30px 10px;">
          <div style="font-size:32px;margin-bottom:8px;">📭</div>
          <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:4px;">No PWA harvest records yet</div>
          <div style="font-size:11px;color:#9ca3af;">Once this vendo is harvested via the PWA, records will appear here.</div>
        </div>`;
      return;
    }

    const totalNet   = rows.reduce((s,h) => s+(parseFloat(h.net_collectible)||0), 0);
    const totalSpawn = rows.reduce((s,h) => s+(parseFloat(h.spawn_share)||0), 0);
    const totalOwner = rows.reduce((s,h) => s+(parseFloat(h.customer_share)||0), 0);

    content.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">
        <div style="background:#f0fdf4;border-radius:8px;padding:10px;border-left:3px solid #16a34a;">
          <div style="font-size:9px;color:#16a34a;text-transform:uppercase;font-weight:700;">Total net</div>
          <div style="font-size:16px;font-weight:700;color:#15803d;">₱${totalNet.toLocaleString('en-PH',{minimumFractionDigits:2})}</div>
        </div>
        <div style="background:#eef2ff;border-radius:8px;padding:10px;border-left:3px solid #1e3cb8;">
          <div style="font-size:9px;color:#1e3cb8;text-transform:uppercase;font-weight:700;">Spawn 75%</div>
          <div style="font-size:16px;font-weight:700;color:#1e3cb8;">₱${totalSpawn.toLocaleString('en-PH',{minimumFractionDigits:2})}</div>
        </div>
        <div style="background:#fdf4ff;border-radius:8px;padding:10px;border-left:3px solid #7c3aed;">
          <div style="font-size:9px;color:#7c3aed;text-transform:uppercase;font-weight:700;">Owner 25%</div>
          <div style="font-size:16px;font-weight:700;color:#7c3aed;">₱${totalOwner.toLocaleString('en-PH',{minimumFractionDigits:2})}</div>
        </div>
      </div>
      <div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">${rows.length} harvest record${rows.length>1?'s':''}</div>
      ${rows.map(h => {
        const net    = parseFloat(h.net_collectible||0);
        const spawn  = parseFloat(h.spawn_share||0);
        const owner  = parseFloat(h.customer_share||0);
        const total  = parseFloat(h.coins_total||0);
        const free   = parseFloat(h.coins_free||0);
        const old    = parseFloat(h.coins_old||0);
        const saloy  = parseFloat(h.coins_saloy||0);
        const winStart = h.harvest_window_start || '—';
        return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
            <div>
              <div style="font-size:13px;font-weight:700;color:#374151;">${h.harvest_date}</div>
              <div style="font-size:10px;color:#9ca3af;">👤 ${h.collector||'—'} · Route: <b>${h.route_code||'—'}</b> ${ahSourceBadge(h.route_code)}</div>
              <div style="font-size:10px;color:#9ca3af;">Window: ${winStart} → ${h.harvest_date}</div>
            </div>
            <div style="font-size:16px;font-weight:700;color:#16a34a;">₱${net.toLocaleString('en-PH',{minimumFractionDigits:2})}</div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;font-size:10px;">
            <div style="background:#f9fafb;border-radius:4px;padding:4px 6px;"><div style="color:#9ca3af;">Total</div><div style="font-weight:600;">₱${total.toLocaleString()}</div></div>
            <div style="background:#fef2f2;border-radius:4px;padding:4px 6px;"><div style="color:#dc2626;">Free</div><div style="font-weight:600;">₱${free.toLocaleString()}</div></div>
            <div style="background:#fffbeb;border-radius:4px;padding:4px 6px;"><div style="color:#d97706;">Old</div><div style="font-weight:600;">₱${old.toLocaleString()}</div></div>
            ${saloy ? `<div style="background:#fff7ed;border-radius:4px;padding:4px 6px;"><div style="color:#ea580c;">Saloy</div><div style="font-weight:600;">₱${saloy.toLocaleString()}</div></div>` : ''}
            <div style="background:#f0fdf4;border-radius:4px;padding:4px 6px;"><div style="color:#16a34a;">Spawn</div><div style="font-weight:600;">₱${spawn.toLocaleString()}</div></div>
          </div>
          ${h.admin_notes ? `<div style="margin-top:6px;font-size:10px;color:#92400e;background:#fffbeb;border-radius:4px;padding:4px 8px;">📝 ${h.admin_notes}</div>` : ''}
        </div>`;
      }).join('')}`;
  } catch(e) {
    content.innerHTML = `<div style="padding:20px;text-align:center;color:#dc2626;font-size:12px;">Error: ${e.message}</div>`;
  }
}

async function loadVendoTxns() {
  const vendo=currentVendo;
  if(!vendo) return;
  const from=document.getElementById("vtxn-from").value;
  const to=document.getElementById("vtxn-to").value;
  vtPage_n=1;
  document.getElementById("vtxn-tbody").innerHTML='<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--mu)">Loading transactions...</td></tr>';
  let params=`select=id,date,time,amount,voucher,ip,mac,total_time,extended,is_skipped,area&vendo=eq.${encodeURIComponent(vendo)}&is_skipped=eq.false&order=date.desc,time.desc`;
  if(from) params+=`&date=gte.${from}`;
  if(to)   params+=`&date=lte.${to}`;
  try {
    vtxnAll = await sbAll("transactions", params);
    const hacked=vtxnAll.filter(r=>(r.total_time||"").includes("w")&&r.extended==='1').length;
    document.getElementById("sus-tab-btn").textContent=`⚠️ Suspicious (${hacked})`;
    filterVTxns();
  } catch(e) {
    document.getElementById("vtxn-tbody").innerHTML=`<tr><td colspan="8" style="text-align:center;padding:20px;color:red;">Error: ${e.message}</td></tr>`;
  }
}

function filterVTxns() {
  const q=(document.getElementById("vtxn-q")?.value||"").toLowerCase();
  let filtered=vtxnAll;
  if(q) filtered=filtered.filter(r=>(r.ip||"").includes(q)||(r.mac||"").toLowerCase().includes(q)||(r.voucher||"").toLowerCase().includes(q)||String(r.amount||"").includes(q));
  const total=filtered.filter(r=>!(r.total_time?.includes('w')&&r.extended==='1')).reduce((s,r)=>s+parseFloat(r.amount||0),0);
  const hacked=filtered.filter(r=>(r.total_time||"").includes("w")&&r.extended==='1').length;
  const avg=filtered.length?total/filtered.length:0;
  const max=filtered.length?Math.max(...filtered.map(r=>parseFloat(r.amount||0))):0;
  const isF=q||document.getElementById("vtxn-from").value||document.getElementById("vtxn-to").value;
  document.getElementById("vtxn-stats").innerHTML=`
    <div class="stat" style="padding:8px 12px;min-width:120px"><div class="sl">${isF?"Filtered Sales":"Total Sales"}</div><div class="sv blue" style="font-size:16px">${fmt(total)}</div></div>
    <div class="stat" style="padding:8px 12px;min-width:100px"><div class="sl">${isF?"Filtered Txns":"Total Txns"}</div><div class="sv pur" style="font-size:16px">${filtered.length.toLocaleString()}</div></div>
    <div class="stat" style="padding:8px 12px;min-width:90px"><div class="sl">Avg/Txn</div><div class="sv amber" style="font-size:16px">${fmt(Math.round(avg))}</div></div>
    <div class="stat" style="padding:8px 12px;min-width:90px"><div class="sl">Max</div><div class="sv green" style="font-size:16px">${fmt(max)}</div></div>
    <div class="stat" style="padding:8px 12px;min-width:90px"><div class="sl">Suspicious</div><div class="sv red" style="font-size:16px">${hacked}</div></div>
    ${isF?`<div class="stat" style="padding:8px 12px;min-width:120px;border-color:#1565c0"><div class="sl" style="color:#1565c0">All Time Total</div><div class="sv blue" style="font-size:16px">${fmt(vtxnAll.reduce((s,r)=>s+parseFloat(r.amount||0),0))}</div></div>`:""}
  `;
  renderVTxns(filtered);
}

function renderVTxns(rows) {
  const PG=100,total=rows.length,start=(vtPage_n-1)*PG,page=rows.slice(start,start+PG);
  const rcTotal = rows.reduce((s,r)=>s+parseFloat(r.amount||0),0);
  document.getElementById("vtxn-rc").innerHTML=`<span>Showing <strong>${total.toLocaleString()}</strong> transactions &nbsp;|&nbsp; Total Amount: <strong style="color:#1565c0">₱${rcTotal.toLocaleString()}</strong></span>`;
  document.getElementById("vtp-l").textContent=`Page ${vtPage_n} of ${Math.ceil(total/PG)||1}`;
  document.getElementById("vtp-p").disabled=vtPage_n===1;
  document.getElementById("vtp-n").disabled=start+PG>=total;
  document.getElementById("vtxn-tbody").innerHTML=page.map((t,i)=>{
    const isHack=(t.total_time||"").includes("w")&&t.extended==='1';
    return `<tr class="${isHack?"txn-row-hack":""}">
      <td style="color:var(--mu)">${start+i+1}</td>
      <td>${t.date||""}</td><td style="color:var(--mu)">${t.time||""}</td>
      <td style="font-weight:700;color:${isHack?"#dc2626":"#1565c0"}">${fmt(t.amount)}</td>
      <td style="font-family:monospace;font-size:11px">${t.ip||"—"}</td>
      <td style="font-family:monospace;font-size:11px;color:var(--mu)">${t.mac||"—"}</td>
      <td style="font-family:monospace;font-size:11px">${t.voucher||"—"}</td>
      <td style="color:${isHack?"#dc2626":"var(--mu)"}">${t.total_time||"—"}${isHack?" ⚠️":""}</td>
    </tr>`;
  }).join("") ||
  '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--mu)">No transactions found</td></tr>';
}

function vtPage(d){vtPage_n+=d;filterVTxns();}
function clearVFilter(){
  document.getElementById("vtxn-from").value="";
  document.getElementById("vtxn-to").value="";
  document.getElementById("vtxn-q").value="";
  loadVendoTxns();
}

async function loadVendoMonthly(vendo) {
  // Full history — gray=2024, blue=2025, green=2026
  const rows=await sbAll("transactions",`select=date,amount,total_time,extended&vendo=eq.${encodeURIComponent(vendo)}&is_skipped=eq.false&order=date.asc`);
  const cleanRows=rows.filter(r=>!(r.total_time?.includes('w')&&r.extended==='1'));
  const mmap={};
  cleanRows.forEach(r=>{ const m=(r.date||"").slice(0,7); if(m) mmap[m]=(mmap[m]||0)+parseFloat(r.amount||0); });
  const rawLabels=Object.keys(mmap).sort();
  const displayLabels=rawLabels.map(k=>{try{return new Date(k+"-01").toLocaleDateString("en-PH",{month:"short",year:"2-digit"});}catch{return k;}});
  const data=rawLabels.map(m=>mmap[m]);
  const colors=rawLabels.map(l=>l.startsWith('2026')?'#16a34a':l.startsWith('2025')?'#1565c0':'#94a3b8');
  if(vendoChart) vendoChart.destroy();
  vendoChart=new Chart(document.getElementById("vendo-chart"),{
    type:"bar",
    data:{labels:displayLabels,datasets:[{label:"Monthly Sales",data,backgroundColor:colors,borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>"₱"+c.raw.toLocaleString()}}},
      scales:{y:{ticks:{callback:v=>"₱"+v.toLocaleString()}}}}
  });
}

async function loadVendoSuspicious(vendo) {
  document.getElementById("sus-list").innerHTML='<div style="padding:16px;text-align:center;color:var(--mu)">Loading suspicious transactions...</div>';
  const rows=await sbAll("transactions",`select=id,date,time,amount,voucher,ip,mac,total_time,extended&vendo=eq.${encodeURIComponent(vendo)}&total_time=like.*w*&is_skipped=eq.false&order=date.desc`);
  const notes=JSON.parse(localStorage.getItem("hacked_notes_"+vendo)||"{}");
  const done=JSON.parse(localStorage.getItem("hacked_done_"+vendo)||"[]");
  document.getElementById("sus-list").innerHTML=rows.length
    ?`<div class="tw"><table><thead><tr><th>Date</th><th>Time</th><th>Amount</th><th>IP</th><th>MAC</th><th>Total Time</th><th>Note</th><th>Action</th></tr></thead><tbody>
      ${rows.map(t=>{
        const isDone=done.includes(t.id);
        return `<tr class="txn-row-hack${isDone?" done":""}">
          <td>${t.date}</td><td>${t.time}</td>
          <td style="font-weight:700;color:#dc2626">${fmt(t.amount)}</td>
          <td style="font-family:monospace;font-size:11px">${t.ip||"—"}</td>
          <td style="font-family:monospace;font-size:11px">${t.mac||"—"}</td>
          <td style="color:#dc2626">${t.total_time} ⚠️</td>
          <td><input class="note-input" value="${(notes[t.id]||"").replace(/"/g,"&quot;")}" placeholder="Add note..." onchange="saveNote(${t.id},'${esc(vendo)}',this.value)"></td>
          <td style="display:flex;gap:4px;">
            <button class="btn sm ${isDone?"":"p"}" onclick="toggleDone(${t.id},'${esc(vendo)}',this)">${isDone?"↩ Undo":"✓ Done"}</button>
            <button class="btn sm danger" onclick="markLegitimate(${t.id},this)">Not Hacked</button>
          </td>
        </tr>`;
      }).join("")}
      </tbody></table></div>`
    :'<div style="padding:20px;text-align:center;color:var(--ok)">✅ No suspicious transactions found</div>';
}

function saveNote(id, vendo, val) {
  const notes=JSON.parse(localStorage.getItem("hacked_notes_"+vendo)||"{}");
  notes[id]=val;
  localStorage.setItem("hacked_notes_"+vendo,JSON.stringify(notes));
}
function toggleDone(id, vendo, btn) {
  let done=JSON.parse(localStorage.getItem("hacked_done_"+vendo)||"[]");
  const isDone=done.includes(id);
  if(isDone) done=done.filter(x=>x!==id);
  else done.push(id);
  localStorage.setItem("hacked_done_"+vendo,JSON.stringify(done));
  const row=btn.closest("tr");
  row.classList.toggle("done",!isDone);
  btn.textContent=isDone?"✓ Done":"↩ Undo";
  btn.classList.toggle("p",isDone);
}
async function markLegitimate(id, btn) {
  if(!confirm("Mark this transaction as NOT hacked (free time)?")) return;
  await fetch(`${SB_URL}/rest/v1/transactions?id=eq.${id}`,{
    method:"PATCH",headers:{...HDR,"Content-Type":"application/json",Prefer:"return=minimal"},
    body:JSON.stringify({extended:"1"})
  });
  btn.closest("tr").remove();
}

function showVTab(tab,btn) {
  document.querySelectorAll(".subpanel").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
  document.getElementById("vt-"+tab).classList.add("active");
  if(btn) btn.classList.add("active");
}

function closeVendo() {
  document.getElementById("view-vlist").style.display="block";
  document.getElementById("view-vtxns").style.display="none";
  currentVendo="";
  hideBread();
  // Re-render vendo list to restore rows
  if(typeof renderVendos==='function') renderVendos();
}

// ══════════════════════════════════════════════════════════
// HARVEST
// ══════════════════════════════════════════════════════════


async function loadHarvests() {
  window._hvLoading = false;

  // Ensure route-tab elements are visible — remove any hv-hidden class and set display directly
  [['hv-area-tabs','flex'],['hv-filters','flex'],['hv-route-page','grid']].forEach(function(pair) {
    var el = document.getElementById(pair[0]);
    if (!el) return;
    el.classList.remove('hv-hidden');
    el.style.removeProperty('display');
    el.style.setProperty('display', pair[1], 'important');
  });

  // Hide all non-route sub-tabs
  ['hv-tab-schedule','hv-tab-recon',
   'hv-tab-vnames','hv-tab-addharvest','hv-tab-newvendo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('hv-hidden'); el.style.display = 'none'; }
  });
  // Hide fixed overlays
  const _reco = document.getElementById('hv-overlay-records');
  const _aud  = document.getElementById('hv-tab-audited');
  const _rov2 = document.getElementById('hv-overlay-recon');
  if (_reco) _reco.style.display = 'none';
  if (_aud)  _aud.style.display  = 'none';
  if (_rov2) _rov2.style.display = 'none';

  // Mark route button active
  document.querySelectorAll('#panel-harvest .hv-hvtab').forEach(b => b.classList.remove('on'));
  const hbtnRoute = document.getElementById('hbtn-route');
  if (hbtnRoute) hbtnRoute.classList.add('on');

  const elFab = document.getElementById('hv-refresh-fab');
  if (elFab) elFab.classList.add('visible');

  // Reset loading flag and clear stale content to force fresh load
  window._hvLoading = false;
  const _vcScroll = document.getElementById('vc-scroll');
  if (_vcScroll) _vcScroll.innerHTML = '<div style="padding:20px;text-align:center;color:var(--mu);font-size:12px;">Loading vendos…</div>';

  setTimeout(() => {
    if (typeof htLoad === 'function') htLoad();
    setTimeout(() => {
      if (typeof harvestTabLoad === 'function') harvestTabLoad();
    }, 800);
  }, 50);
}

function renderHarvests(rows){ }
function hPage(d){ }

// ══════════════════════════════════════════════════════════
// HACKED — TODO LIST
// ══════════════════════════════════════════════════════════
async function loadSuspicious() {
  const rows=await sb("hacked_summary_mat","order=txn_count.desc",1000);
  hackedAll=rows;
  const total_txns=rows.reduce((s,h)=>s+parseInt(h.txn_count||0),0);
  const total_amt=rows.reduce((s,h)=>s+parseFloat(h.total_amount||0),0);
  document.getElementById("suspicious-stats").innerHTML=`
    <div class="stat"><div class="sl">Affected Vendos</div><div class="sv red">${rows.length}</div></div>
    <div class="stat"><div class="sl">Suspicious Txns</div><div class="sv red">${total_txns.toLocaleString()}</div></div>
    <div class="stat"><div class="sl">Total Amount</div><div class="sv red">${fmt(total_amt)}</div></div>
  `;
  filteredHacked=rows;
  renderSuspiciousTodo(rows);
}

function filterSuspicious() {
  const q=(document.getElementById("sus-search")?.value||"").toLowerCase();
  const area=document.getElementById("sus-area")?.value||"";
  filteredHacked=hackedAll.filter(h=>(!q||(h.vendo||"").toLowerCase().includes(q))&&(!area||h.area===area));
  renderSuspiciousTodo(filteredHacked);
}

function renderSuspiciousTodo(rows) {
  document.getElementById("suspicious-todo").innerHTML = rows.map(h=>{
    const note=localStorage.getItem("hacked_note_vendo_"+h.vendo)||"";
    return `<div class="todo-item" id="hack-${(h.vendo||"").replace(/[^a-zA-Z0-9]/g,"_").slice(0,30)}">
      <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-weight:600;color:#dc2626;cursor:pointer;font-size:14px;" onclick="openSuspiciousDetail('${esc(h.vendo)}','${h.area}')">${h.vendo}</span>
          <span class="pill info">${h.area}</span>
          <span class="pill red">⚠️ ${h.txn_count} txns</span>
          <span style="font-weight:700;color:#dc2626">${fmt(h.total_amount)}</span>
          <span style="font-size:11px;color:var(--mu)">Last: ${h.last_date||"—"}</span>
        </div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-size:11px;color:var(--mu)">Note:</span>
          <input class="note-input" value="${note.replace(/"/g,"&quot;")}" placeholder="e.g. MAC blocked, owner notified"
            onchange="localStorage.setItem('hacked_note_vendo_${esc(h.vendo)}',this.value)" style="flex:1;max-width:280px;">
          <button class="btn sm p" onclick="openSuspiciousDetail('${esc(h.vendo)}','${h.area}')">📊 View →</button>
          <button class="btn sm" style="background:#10b981;color:white;border-color:#10b981;" onclick="markVendoNotSuspicious('${esc(h.vendo)}','${h.area}',this)">✓ Not Suspicious</button>
        </div>
      </div>
    </div>`;
  }).join("")||'<div style="padding:30px;text-align:center;color:var(--ok);font-size:14px;">✅ No suspicious transactions found!</div>';
}

async function markVendoNotSuspicious(vendo, area, btn) {
  if(!confirm(`Mark "${vendo}" as NOT suspicious? It will be removed from the suspicious list.`)) return;
  
  // Save to localStorage
  let notsus = JSON.parse(localStorage.getItem("not_suspicious_vendos") || "[]");
  if (!notsus.find(v => v.vendo === vendo)) {
    notsus.push({ vendo, area, cleared_at: new Date().toLocaleString("en-PH",{timeZone:"Asia/Manila"}) });
    localStorage.setItem("not_suspicious_vendos", JSON.stringify(notsus));
  }
  
  // Mark all transactions as extended=1 (legitimate)
  await fetch(`${SB_URL}/rest/v1/transactions?vendo=eq.${encodeURIComponent(vendo)}&extended=eq.0`, {
    method: "PATCH",
    headers: {...HDR, "Content-Type":"application/json", Prefer:"return=minimal"},
    body: JSON.stringify({extended: "1"})
  });
  
  // Remove from todo list
  const itemId = "hack-"+btoa(encodeURIComponent(vendo)).replace(/[^a-zA-Z0-9]/g,"");
  const item = document.getElementById(itemId);
  if(item) item.remove();
  
  alert(`✅ ${vendo} marked as Not Suspicious!`);
}


async function openSuspiciousDetail(vendo, area) {
  hkCurrentVendo = vendo;
  hkTxPage_n = 1;
  document.getElementById("suspicious-vlist").style.display="none";
  document.getElementById("suspicious-detail").style.display="block";
  document.getElementById("sus-detail-title").textContent="⚠️ "+vendo;
  document.getElementById("sus-detail-sub").textContent=area+" area · Suspicious transactions breakdown";
  showBread(`Suspicious → ${vendo}`, closeHackedDetail);
  document.getElementById("sus-txn-tbody").innerHTML='<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--mu)">⏳ Loading suspicious transactions...</td></tr>';

  // Query ONLY suspicious rows: total_time contains 'w' AND extended='0' AND not skipped
  const rows = await sbAll("transactions",
    `select=id,date,time,amount,voucher,ip,mac,total_time,extended&vendo=eq.${encodeURIComponent(vendo)}&is_skipped=eq.false&total_time=like.*w*&extended=eq.0&order=date.desc,time.desc`
  );
  hkTxns = rows;
  hkTxnAll = rows;

  const total = rows.reduce((s,r)=>s+parseFloat(r.amount||0),0);
  document.getElementById("hk-detail-stats").innerHTML=`
    <div class="stat" style="padding:8px 12px;min-width:120px"><div class="sl">Suspicious Txns</div><div class="sv red" style="font-size:16px">${rows.length.toLocaleString()}</div></div>
    <div class="stat" style="padding:8px 12px;min-width:120px"><div class="sl">Total Amount</div><div class="sv red" style="font-size:16px">${fmt(total)}</div></div>
  `;
  filterHkTxns();
}

function closeSuspiciousDetail() {
  document.getElementById("suspicious-vlist").style.display="block";
  document.getElementById("suspicious-detail").style.display="none";
}

// ══════════════════════════════════════════════════════════
// DEVICES / RECONCILIATION
// ══════════════════════════════════════════════════════════

const RC_DEFAULT_START = '2026-03-01';

async function loadReconciliation() {
  const content = document.getElementById('dev-rc-content');
  const grandStats = document.getElementById('dev-rc-stats');
  const statusBar = document.getElementById('dev-rc-status');
  if (!content) return;
  content.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;">⏳ Loading harvest records…</div>';
  if (grandStats) grandStats.innerHTML = '';
  if (statusBar) statusBar.innerHTML = '';
  try {
    // 1. Load all harvests
    const rh = await fetch(SB_URL + '/rest/v1/harvests?select=*&order=harvest_date.desc,created_at.desc&limit=1000', { headers: HDR });
    const allHarvests = await rh.json() || [];
    if (!allHarvests.length) {
      content.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;">No harvest records yet. Complete a harvest route first.</div>';
      return;
    }

    // 2. Build window map (tg_name → harvest_window_start)
    const windowMap = {};
    allHarvests.forEach(h => { if (h.tg_name && h.harvest_window_start) windowMap[h.tg_name] = h.harvest_window_start; });

    // 3. Fetch TG income per vendo (paginated)
    const allTgNames = [...new Set(allHarvests.map(h => h.tg_name).filter(Boolean))];
    content.innerHTML = `<div style="text-align:center;padding:40px;color:#9ca3af;">⏳ Fetching TG income for ${allTgNames.length} vendos…</div>`;
    const tgMap = {};

    await Promise.all(allTgNames.map(async tgName => {
      const start = windowMap[tgName] || RC_DEFAULT_START;
      const vendoHarvests = allHarvests.filter(h => h.tg_name === tgName);
      const latestDate = vendoHarvests.map(h => h.harvest_date).sort().pop();
      if (!latestDate) return;
      let allRows = [], page = 0, pageSize = 1000;
      while (true) {
        try {
          const r = await fetch(
            `${SB_URL}/rest/v1/transactions?vendo=eq.${encodeURIComponent(tgName)}&date=gte.${start}&date=lte.${latestDate}&is_skipped=eq.false&not.and=(total_time.like.*w*,extended.eq.1)&select=amount,date`,
            { headers: { ...HDR, 'Range': `${page*pageSize}-${(page+1)*pageSize-1}`, 'Prefer': 'count=none' } }
          );
          const rows = await r.json() || [];
          allRows = allRows.concat(rows);
          if (rows.length < pageSize) break;
          page++;
        } catch(e) { break; }
      }
      tgMap[tgName] = {};
      allRows.forEach(tx => {
        if (!tgMap[tgName][tx.date]) tgMap[tgName][tx.date] = 0;
        tgMap[tgName][tx.date] += parseFloat(tx.amount) || 0;
      });
      tgMap[tgName]._total = allRows.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
    }));

    // 4. Group by harvest_date → collector → route_code
    const byDate = {};
    allHarvests.forEach(h => {
      const d = h.harvest_date;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(h);
    });
    const dates = Object.keys(byDate).sort((a,b) => b.localeCompare(a));

    // 5. Render
    const fmtP = v => '₱' + Number(v||0).toLocaleString('en-PH', {minimumFractionDigits:2});
    let html = '';
    let grandCoinNet = 0, grandTgTotal = 0;

    dates.forEach(date => {
      const harvests = byDate[date];
      const byCollector = {};
      harvests.forEach(h => {
        const col = h.collector || '—';
        if (!byCollector[col]) byCollector[col] = {};
        const rc = h.route_code || 'No route';
        if (!byCollector[col][rc]) byCollector[col][rc] = [];
        byCollector[col][rc].push(h);
      });

      const getTgAmt = (h) => {
        // Prefer stored system_total when available (manually corrected via SQL)
        if (h.system_total !== null && h.system_total !== undefined) return parseFloat(h.system_total) || 0;
        if (!h.tg_name || !tgMap[h.tg_name]) return 0;
        // Use per-harvest window_start, not the last-write-wins windowMap
        const win = h.harvest_window_start || windowMap[h.tg_name] || RC_DEFAULT_START;
        let amt = 0;
        Object.entries(tgMap[h.tg_name]).forEach(([d, v]) => { 
          if (d !== '_total' && d >= win && d <= date) amt += v; 
        });
        return amt;
      };

      const dateCoinNet = harvests.reduce((s,h) => s + (parseFloat(h.coins_total)||0), 0);
      const dateTgTotal = harvests.reduce((s,h) => s + getTgAmt(h), 0);
      grandCoinNet += dateCoinNet;
      grandTgTotal += dateTgTotal;

      const diff = dateCoinNet - dateTgTotal;
      const diffCls = Math.abs(diff)<200 ? 'diff-ok' : diff>0 ? 'diff-warn' : 'diff-bad';
      const diffTxt = Math.abs(diff)<200 ? '✅ Match' : diff>0 ? `⚠ Coins +${fmtP(Math.abs(diff))}` : `🔴 TG +${fmtP(Math.abs(diff))}`;

      html += `<div class="rc-date-block">
        <div class="rc-date-hdr">
          <div>
            <div style="font-size:16px;font-weight:700;color:#1a1d2e;">📅 ${date}</div>
            <div style="font-size:10px;color:#6b7280;margin-top:2px;">${harvests.length} record${harvests.length!==1?'s':''} · ${Object.keys(byCollector).length} collector${Object.keys(byCollector).length!==1?'s':''}</div>
          </div>
          <div style="text-align:right;">
            <div class="${diffCls}" style="font-size:14px;font-weight:700;">${diffTxt}</div>
            <div style="font-size:10px;color:#6b7280;">Coin ${fmtP(dateCoinNet)} vs TG ${fmtP(dateTgTotal)}</div>
          </div>
        </div>`;

      Object.entries(byCollector).forEach(([collector, routes]) => {
        const allItems = Object.values(routes).flat();
        const colCoin = allItems.reduce((s,h) => s + (parseFloat(h.coins_total)||0), 0);
        const colTg   = allItems.reduce((s,h) => s + getTgAmt(h), 0);
        const colDiff = colCoin - colTg;
        const colDiffCls = Math.abs(colDiff)<200 ? 'diff-ok' : colDiff>0 ? 'diff-warn' : 'diff-bad';

        html += `<div class="rc-collector-block">
          <div class="rc-collector-hdr">
            <div class="rc-collector-name">👤 ${collector}</div>
            <div class="${colDiffCls}" style="font-weight:700;font-size:13px;">Coin ${fmtP(colCoin)} · TG ${fmtP(colTg)} · ${Math.abs(colDiff)<200?'✅ Match':colDiff>0?'⚠ +'+fmtP(Math.abs(colDiff)):'🔴 -'+fmtP(Math.abs(colDiff))}</div>
          </div>`;

        Object.entries(routes).forEach(([rc, items]) => {
          const routeCoin = items.reduce((s,h) => s + (parseFloat(h.coins_total)||0), 0);
          const routeTg   = items.reduce((s,h) => s + getTgAmt(h), 0);
          const routeDiff = routeCoin - routeTg;
          const rdCls = Math.abs(routeDiff)<100 ? 'diff-ok' : routeDiff>0 ? 'diff-warn' : 'diff-bad';
          const isAdmin = !rc || rc === 'No route' || rc.toUpperCase() === 'ADMIN';
          const srcBadge = isAdmin
            ? '<span class="rc-pill amber" style="font-size:8px;">🔧 Admin</span>'
            : '<span class="rc-pill blue" style="font-size:8px;">📱 PWA</span>';

          html += `<div class="rc-route-block">
            <div class="rc-route-hdr">
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="rc-route-code">🧾 ${rc}</span>${srcBadge}
              </div>
              <div class="${rdCls}" style="font-weight:700;font-size:12px;">${Math.abs(routeDiff)<100?'✅ Match':routeDiff>0?'⚠ Coins +'+fmtP(Math.abs(routeDiff)):'🔴 TG +'+fmtP(Math.abs(routeDiff))}</div>
            </div>
            <div class="rc-grid">
              <div class="rc-box" style="background:#f0fdf4;"><div class="val" style="color:#15803d;">${fmtP(routeCoin)}</div><div class="lbl">Total Coins</div></div>
              <div class="rc-box" style="background:#eef2ff;"><div class="val" style="color:#1e3cb8;">${fmtP(routeTg)}</div><div class="lbl">TG income</div></div>
              <div class="rc-box" style="background:#fafbff;"><div class="val ${rdCls}">${fmtP(Math.abs(routeDiff))}</div><div class="lbl">${routeDiff>=0?'Surplus':'Deficit'}</div></div>
            </div>
            <div style="overflow-x:auto;">
            <table>
              <thead><tr>
                <th>Vendo</th><th>TG Name</th><th>Window</th>
                <th>Total Coins</th><th>TG Income</th><th>Diff</th>
              </tr></thead>
              <tbody>${items.map(h => {
                const coin = parseFloat(h.coins_total||0);
                const tgAmt = getTgAmt(h);
                const gap = coin - tgAmt;
                const gapCls = Math.abs(gap)<50 ? 'diff-ok' : gap>0 ? 'diff-warn' : 'diff-bad';
                const rowBg = Math.abs(gap)<50 ? '' : gap>0 ? 'background:#fffbeb;' : 'background:#fef2f2;';
                const win = windowMap[h.tg_name] || RC_DEFAULT_START;
                return `<tr style="${rowBg}">
                  <td><b>${h.vendo_name||h.tg_name||'—'}</b>${h.admin_notes?`<div style="font-size:9px;color:#92400e;">📝 ${h.admin_notes}</div>`:''}</td>
                  <td style="color:#6b7280;font-size:10px;">${h.tg_name||'—'}</td>
                  <td style="color:#6b7280;font-size:10px;">${win} → ${date}</td>
                  <td style="font-weight:700;color:#15803d;">${fmtP(coin)}</td>
                  <td style="color:${tgAmt>0?'#1a1d2e':'#9ca3af'};">${fmtP(tgAmt)}</td>
                  <td class="${gapCls}" style="font-weight:700;">${Math.abs(gap)<50?'✅':gap>0?'+'+fmtP(Math.abs(gap)):'-'+fmtP(Math.abs(gap))}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
            </div>
          </div>`;
        });
        html += '</div>';
      });
      html += '</div>';
    });

    // Grand stats
    const grandDiff = grandCoinNet - grandTgTotal;
    const grandCls = Math.abs(grandDiff)<500 ? 'diff-ok' : grandDiff>0 ? 'diff-warn' : 'diff-bad';
    if (grandStats) grandStats.innerHTML = `
      <div class="rc-stat"><div class="sl">Harvest Dates</div><div class="sv" style="color:#1565c0;">${dates.length}</div></div>
      <div class="rc-stat"><div class="sl">Total Records</div><div class="sv" style="color:#1565c0;">${allHarvests.length}</div></div>
      <div class="rc-stat"><div class="sl">Grand Total Coins</div><div class="sv" style="color:#15803d;">${fmtP(grandCoinNet)}</div></div>
      <div class="rc-stat"><div class="sl">Grand TG Total</div><div class="sv" style="color:#1565c0;">${fmtP(grandTgTotal)}</div></div>
      <div class="rc-stat"><div class="sl">Net Difference</div><div class="sv ${grandCls}">${fmtP(Math.abs(grandDiff))}</div></div>
    `;
    if (statusBar) statusBar.innerHTML = `<div style="font-size:10px;color:#6b7280;">✅ Loaded ${allHarvests.length} harvests · ${allTgNames.length} vendos fetched</div>`;
    content.innerHTML = html;

  } catch(e) {
    if (content) content.innerHTML = `<div style="text-align:center;padding:40px;color:#dc2626;">❌ Error: ${e.message}</div>`;
  }
}


function searchAnalyticsVendo(q) {
  const area=document.getElementById("analytics-vendo-area")?.value||"";
  const lower=q.toLowerCase();
  const filtered=allVendos.filter(v=>
    (!q||v.vendo.toLowerCase().includes(lower)||v.area.toLowerCase().includes(lower))&&
    (!area||v.area===area)
  ).slice(0,20);

  const list=document.getElementById("analytics-vendo-list");
  if(!q&&!area){list.style.display="none";return;}
  list.style.display="block";
  list.innerHTML=filtered.map(v=>`
    <div class="vlist-row" onclick="loadVendoAnalytics('${esc(v.vendo)}','${v.area}')">
      <div><div style="font-weight:600;font-size:13px">${v.vendo}</div><div style="font-size:11px;color:var(--mu)">${v.area}</div></div>
      <div style="font-weight:700;color:#1565c0">${fmt(v.sales)}</div>
    </div>`).join("")||'<div style="padding:12px;text-align:center;color:var(--mu)">No vendos found</div>';
}

async function loadVendoAnalytics(vendo, area) {
  document.getElementById("analytics-vendo-list").style.display="none";
  document.getElementById("analytics-vendo-search").value=vendo;
  document.getElementById("analytics-vendo-placeholder").style.display="none";
  document.getElementById("analytics-vendo-chart-wrap").style.display="block";
  document.getElementById("analytics-vendo-name").textContent=`${vendo} — ${area}`;
  try{
    const r=await fetch(`${SB_URL}/rest/v1/transactions?select=date,amount&vendo=eq.${encodeURIComponent(vendo)}&is_skipped=eq.false&order=date.asc`,{headers:{...HDR,'Range':'0-49999','Prefer':'count=none'}});
    const rows=r.ok?await r.json():[];
    const mm={};rows.forEach(r=>{const m=(r.date||'').slice(0,7);if(m)mm[m]=(mm[m]||0)+parseFloat(r.amount||0);});
    const labels=Object.keys(mm).sort(),data=labels.map(m=>mm[m]),total=data.reduce((s,v)=>s+v,0),avg=data.length?total/data.length:0,max=data.length?Math.max(...data):0;
    document.getElementById("analytics-vendo-stats").innerHTML=`<div class="stat"><div class="sl">All-Time Sales</div><div class="sv blue">${fmt(total)}</div></div><div class="stat"><div class="sl">Total Txns</div><div class="sv pur">${rows.length.toLocaleString()}</div></div><div class="stat"><div class="sl">Avg/Month</div><div class="sv amber">${fmt(Math.round(avg))}</div></div><div class="stat"><div class="sl">Best Month</div><div class="sv green">${fmt(max)}</div></div>`;
    const colors=labels.map(l=>l.startsWith('2026')?'#16a34a':l.startsWith('2025')?'#1565c0':'#94a3b8');
    if(vendoAnalyticsChart)vendoAnalyticsChart.destroy();
    vendoAnalyticsChart=new Chart(document.getElementById("vendo-analytics-chart"),{type:"bar",data:{labels,datasets:[{label:"Monthly Sales",data,backgroundColor:colors,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>"₱"+c.raw.toLocaleString()}}},scales:{y:{ticks:{callback:v=>"₱"+(v>=1000000?(v/1000000).toFixed(1)+"M":v>=1000?(v/1000).toFixed(0)+"K":v)}}}}});
  }catch(e){console.error('loadVendoAnalytics:',e);}
}

function clearAnalyticsVendo() {
  document.getElementById("analytics-vendo-search").value="";
  document.getElementById("analytics-vendo-chart-wrap").style.display="none";
  document.getElementById("analytics-vendo-placeholder").style.display="block";
  document.getElementById("analytics-vendo-list").style.display="none";
  if(vendoAnalyticsChart){vendoAnalyticsChart.destroy();vendoAnalyticsChart=null;}
}

// ══════════════════════════════════════════════════════════
// AUTO REFRESH
// ══════════════════════════════════════════════════════════
// Refresh recent transactions every 10 seconds
setInterval(()=>{ if(document.getElementById("panel-dash").classList.contains("active")) refreshRecentTxns(); }, 10000);
refreshRecentTxns();

