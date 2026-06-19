// ── Auto-load dashboard on first open ────────────────────

/* ─── ANALYTICS (fast+cached) ─── */
let _anlC=null;
async function loadAnalytics(){
  if(_anlC){_anlR(_anlC);return;}
  try{
    const [ms,aD]=await Promise.all([
      sb('monthly_summary_mat','order=month.asc',48),
      sb('summary_by_area','order=total_sales.desc',20)
    ]);
    const mm={};
    (ms||[]).forEach(r=>{ if(r.month) mm[r.month]=(mm[r.month]||0)+parseFloat(r.total_sales||0); });
    _anlC={mm,aD};_anlR(_anlC);
  }catch(e){console.error('loadAnalytics:',e);}
}
function _anlR({mm,aD}){
  const labels=Object.keys(mm).sort(),data=labels.map(m=>mm[m]),colors=labels.map(l=>l.startsWith('2026')?'#16a34a':'#1565c0');
  const dl=labels.map(k=>{try{return new Date(k+'-01').toLocaleDateString('en-PH',{month:'short',year:'2-digit'});}catch{return k;}});
  if(monthlyChart)monthlyChart.destroy();
  const mc=document.getElementById('monthly-chart');
  if(mc)monthlyChart=new Chart(mc,{type:'bar',data:{labels:dl,datasets:[{label:'Sales',data,backgroundColor:colors,borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'₱'+c.raw.toLocaleString()}}},scales:{y:{ticks:{callback:v=>'₱'+(v>=1000000?(v/1000000).toFixed(1)+'M':v>=1000?(v/1000).toFixed(0)+'K':v)}}}}});
  const te=document.getElementById('monthly-table');
  if(te)te.innerHTML=[...labels].sort((a,b)=>b.localeCompare(a)).map(m=>{const disp=(()=>{try{return new Date(m+'-01').toLocaleDateString('en-PH',{month:'long',year:'numeric'});}catch{return m;}})();return `<div style="display:flex;justify-content:space-between;padding:5px 8px;border-bottom:1px solid var(--bd);font-size:12px"><span style="color:var(--mu)">${disp}</span><span style="font-weight:700;color:#1565c0">₱${mm[m].toLocaleString('en-PH',{minimumFractionDigits:2})}</span></div>`;}).join('');
  if(analyticsAreaChart)analyticsAreaChart.destroy();
  const ac=document.getElementById('analytics-area-chart');
  if(ac&&aD&&aD.length){const c8=['#1565c0','#1D9E75','#F5C518','#7B5EA7','#E85D24','#4A90D9','#d97706','#dc2626'];analyticsAreaChart=new Chart(ac,{type:'doughnut',data:{labels:aD.map(a=>a.area),datasets:[{data:aD.map(a=>parseFloat(a.total_sales||0)),backgroundColor:c8}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:10}}},tooltip:{callbacks:{label:c=>c.label+': ₱'+c.raw.toLocaleString()}}}}});}
}


/* ════════════════════════════════════
   SETTINGS TAB FUNCTIONS
════════════════════════════════════ */
const SET_KEY = 'spawn_settings';
function setGetSettings() {
  try { return JSON.parse(localStorage.getItem(SET_KEY) || '{}'); } catch(e) { return {}; }
}
function setInitSettings() {
  const s = setGetSettings();
  const lat = s.startLat || 8.5912285;
  const lng = s.startLng || 123.3539253;
  const lbl = s.startLabel || 'Gfour Minimart, Lalawan Dicayas';
  const latInp = document.getElementById('set-lat');
  const lngInp = document.getElementById('set-lng');
  const lblInp = document.getElementById('set-start-label');
  const cur = document.getElementById('set-start-current');
  if (latInp) latInp.value = lat;
  if (lngInp) lngInp.value = lng;
  if (lblInp) lblInp.value = lbl;
  if (cur) cur.innerHTML = 'Current: <b>' + lbl + '</b> (' + lat + ', ' + lng + ')';
}
function setStartingPoint() {
  const lat = parseFloat(document.getElementById('set-lat').value);
  const lng = parseFloat(document.getElementById('set-lng').value);
  const lbl = (document.getElementById('set-start-label').value || '').trim();
  const msg = document.getElementById('set-start-msg');
  if (isNaN(lat) || isNaN(lng)) { if (msg) { msg.textContent = '⚠ Enter valid coordinates'; msg.style.color = '#dc2626'; } return; }
  const s = setGetSettings();
  s.startLat = lat; s.startLng = lng; s.startLabel = lbl || 'Starting point';
  localStorage.setItem(SET_KEY, JSON.stringify(s));
  const cur = document.getElementById('set-start-current');
  if (cur) cur.innerHTML = 'Current: <b>' + (lbl||'Starting point') + '</b> (' + lat + ', ' + lng + ')';
  if (msg) { msg.textContent = '✅ Saved! Reload harvest.html to apply'; msg.style.color = '#15803d'; setTimeout(() => { msg.textContent = ''; }, 3000); }
}

let _setVendoTimer = null;
function setVendoSearch(q) {
  clearTimeout(_setVendoTimer);
  _setVendoTimer = setTimeout(() => _setVendoDoSearch(q), 400);
}
async function _setVendoDoSearch(q) {
  const box = document.getElementById('set-vendo-results');
  if (!q || q.length < 2) { box.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:11px;">Type at least 2 characters to search</div>'; return; }
  box.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:11px;">Searching…</div>';
  try {
    const r = await fetch(_SB + '/rest/v1/vendos?or=(tg_name.ilike.*' + encodeURIComponent(q) + '*,sheet_name.ilike.*' + encodeURIComponent(q) + '*)&select=id,tg_name,sheet_name,area,vlan&limit=10', {
      headers: {'apikey':_KEY,'Authorization':'Bearer '+_KEY}
    });
    const rows = await r.json();
    if (!rows.length) { box.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:11px;">No vendos found</div>'; return; }
    box.innerHTML = rows.map(v => `
      <div style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
          <div>
            <div style="font-size:9px;font-weight:700;color:#6b7280;margin-bottom:2px;">TG NAME</div>
            <input id="sv-tg-${v.id}" value="${(v.tg_name||'').replace(/"/g,'&quot;')}" placeholder="TG name..."
              style="width:100%;padding:5px 7px;border:1px solid #c7d2fe;border-radius:5px;font-size:11px;font-family:inherit;outline:none;box-sizing:border-box;">
          </div>
          <div>
            <div style="font-size:9px;font-weight:700;color:#6b7280;margin-bottom:2px;">SHEET NAME</div>
            <input id="sv-sh-${v.id}" value="${(v.sheet_name||'').replace(/"/g,'&quot;')}" placeholder="Sheet name..."
              style="width:100%;padding:5px 7px;border:1px solid #c7d2fe;border-radius:5px;font-size:11px;font-family:inherit;outline:none;box-sizing:border-box;">
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:10px;color:#6b7280;">${v.area||'—'} · VLAN ${v.vlan||'—'}</span>
          <div style="display:flex;gap:4px;align-items:center;">
            <span id="sv-msg-${v.id}" style="font-size:10px;"></span>
            <button onclick="setVendoSave(${JSON.stringify(v.id)})" style="padding:4px 10px;background:#1e3cb8;color:#fff;border:none;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit;">💾 Save</button>
          </div>
        </div>
      </div>`).join('');
  } catch(e) { box.innerHTML = '<div style="padding:12px;color:#dc2626;font-size:11px;">Error: ' + e.message + '</div>'; }
}
async function setVendoSave(id) {
  const tg = (document.getElementById('sv-tg-' + id)?.value || '').trim();
  const sh = (document.getElementById('sv-sh-' + id)?.value || '').trim();
  const msg = document.getElementById('sv-msg-' + id);
  if (msg) { msg.textContent = 'Saving…'; msg.style.color = '#6b7280'; }
  try {
    const r = await fetch(_SB + '/rest/v1/vendos?id=eq.' + id, {
      method: 'PATCH',
      headers: {'apikey':_KEY,'Authorization':'Bearer '+_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body: JSON.stringify({ tg_name: tg||null, sheet_name: sh||null })
    });
    if (r.ok) { if (msg) { msg.textContent = '✅ Saved'; msg.style.color = '#15803d'; setTimeout(()=>{if(msg)msg.textContent='';},2000); } }
    else { if (msg) { msg.textContent = '❌ Failed'; msg.style.color = '#dc2626'; } }
  } catch(e) { if (msg) { msg.textContent = '❌ ' + e.message; msg.style.color = '#dc2626'; } }
}

let _setHarvestTimer = null;
function setHarvestSearch(q) {
  clearTimeout(_setHarvestTimer);
  _setHarvestTimer = setTimeout(() => _setHarvestDoSearch(q), 400);
}
async function _setHarvestDoSearch(q) {
  const box = document.getElementById('set-harvest-results');
  if (!q || q.length < 2) { box.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:11px;">Type at least 2 characters</div>'; return; }
  box.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:11px;">Searching…</div>';
  try {
    const r = await fetch(_SB + '/rest/v1/harvests?or=(vendo_name.ilike.*' + encodeURIComponent(q) + '*,tg_name.ilike.*' + encodeURIComponent(q) + '*)&select=id,vendo_name,tg_name,harvest_date,coins_total,coins_free,coins_old,coins_saloy,net_collectible,spawn_share,customer_share,collector,route_code&order=harvest_date.desc&limit=10', {
      headers: {'apikey':_KEY,'Authorization':'Bearer '+_KEY}
    });
    const rows = await r.json();
    if (!rows.length) { box.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:11px;">No harvest records found</div>'; return; }
    box.innerHTML = rows.map(h => {
      const net = parseFloat(h.net_collectible||0);
      return `<div style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">
        <div style="font-size:12px;font-weight:700;color:#1e3cb8;margin-bottom:2px;">${h.vendo_name||h.tg_name||'—'}</div>
        <div style="font-size:10px;color:#6b7280;margin-bottom:8px;">${h.harvest_date} · ${h.collector||'—'} · Route: ${h.route_code||'—'} · Net: <b style="color:#15803d;">₱${net.toLocaleString('en-PH',{minimumFractionDigits:2})}</b></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:8px;">
          <div><div style="font-size:9px;font-weight:700;color:#374151;margin-bottom:2px;">Total coins</div>
            <input id="sh-tot-${h.id}" type="number" value="${h.coins_total||0}" style="width:100%;padding:5px;border:1px solid #bbf7d0;border-radius:5px;font-size:12px;font-family:inherit;outline:none;text-align:right;" oninput="setCalcNet('${h.id}')"></div>
          <div><div style="font-size:9px;font-weight:700;color:#374151;margin-bottom:2px;">Free time</div>
            <input id="sh-free-${h.id}" type="number" value="${h.coins_free||0}" style="width:100%;padding:5px;border:1px solid #bbf7d0;border-radius:5px;font-size:12px;font-family:inherit;outline:none;text-align:right;" oninput="setCalcNet('${h.id}')"></div>
          <div><div style="font-size:9px;font-weight:700;color:#374151;margin-bottom:2px;">Old coins</div>
            <input id="sh-old-${h.id}" type="number" value="${h.coins_old||0}" style="width:100%;padding:5px;border:1px solid #bbf7d0;border-radius:5px;font-size:12px;font-family:inherit;outline:none;text-align:right;" oninput="setCalcNet('${h.id}')"></div>
          <div><div style="font-size:9px;font-weight:700;color:#ea580c;margin-bottom:2px;">Saloy</div>
            <input id="sh-sal-${h.id}" type="number" value="${h.coins_saloy||0}" style="width:100%;padding:5px;border:1px solid #fed7aa;border-radius:5px;font-size:12px;font-family:inherit;outline:none;text-align:right;" oninput="setCalcNet('${h.id}')"></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:#f0fdf4;border-radius:6px;padding:6px 10px;margin-bottom:8px;">
          <span style="font-size:11px;color:#6b7280;">Net → Spawn (75%) → Owner (25%)</span>
          <span id="sh-net-${h.id}" style="font-size:13px;font-weight:700;color:#15803d;">₱${net.toLocaleString('en-PH',{minimumFractionDigits:2})}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button onclick="setHarvestSave('${h.id}')" style="flex:1;padding:7px;background:#15803d;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">💾 Save changes</button>
          <span id="sh-msg-${h.id}" style="font-size:10px;"></span>
        </div>
      </div>`;
    }).join('');
  } catch(e) { box.innerHTML = '<div style="padding:12px;color:#dc2626;font-size:11px;">Error: ' + e.message + '</div>'; }
}
function setCalcNet(id) {
  const tot  = parseFloat(document.getElementById('sh-tot-' + id)?.value) || 0;
  const free = parseFloat(document.getElementById('sh-free-' + id)?.value) || 0;
  const old  = parseFloat(document.getElementById('sh-old-' + id)?.value) || 0;
  const sal  = parseFloat(document.getElementById('sh-sal-' + id)?.value) || 0;
  const net  = Math.max(0, tot - free - old - sal);
  const el   = document.getElementById('sh-net-' + id);
  if (el) el.textContent = '₱' + net.toLocaleString('en-PH',{minimumFractionDigits:2}) + ' → ₱' + (net*0.75).toLocaleString('en-PH',{minimumFractionDigits:2}) + ' → ₱' + (net*0.25).toLocaleString('en-PH',{minimumFractionDigits:2});
}
async function setHarvestSave(id) {
  const tot  = parseFloat(document.getElementById('sh-tot-' + id)?.value) || 0;
  const free = parseFloat(document.getElementById('sh-free-' + id)?.value) || 0;
  const old  = parseFloat(document.getElementById('sh-old-' + id)?.value) || 0;
  const sal  = parseFloat(document.getElementById('sh-sal-' + id)?.value) || 0;
  const net  = Math.max(0, tot - free - old - sal);
  const msg  = document.getElementById('sh-msg-' + id);
  if (msg) { msg.textContent = 'Saving…'; msg.style.color = '#6b7280'; }
  try {
    const r = await fetch(_SB + '/rest/v1/harvests?id=eq.' + id, {
      method: 'PATCH',
      headers: {'apikey':_KEY,'Authorization':'Bearer '+_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body: JSON.stringify({ coins_total:tot, coins_free:free, coins_old:old, coins_saloy:sal, net_collectible:net, spawn_share:net*0.75, customer_share:net*0.25 })
    });
    if (r.ok) {
      if (msg) { msg.textContent = '✅ Saved — refresh Reconciliation to see updated TG income window'; msg.style.color = '#15803d'; setTimeout(()=>{if(msg)msg.textContent='';},4000); }
    } else { if (msg) { msg.textContent = '❌ Save failed'; msg.style.color = '#dc2626'; } }
  } catch(e) { if (msg) { msg.textContent = '❌ ' + e.message; msg.style.color = '#dc2626'; } }
}

/* ════════════════════════════════════
   HARVEST DETAIL POPUP (Reconciliation vendo click)
════════════════════════════════════ */
function rcShowHarvestDetail(h) {
  // Remove existing popup
  const ex = document.getElementById('rc-harvest-detail-pop');
  if (ex) ex.remove();

  const tgIncome = _rcTG && _rcTG[h.tg_name] ? _rcTA(h.tg_name, h.harvest_window_start, h.harvest_date, h.harvest_window_end) : null;
  const coin = parseFloat(h.coins_total||0);
  const free = parseFloat(h.coins_free||0);
  const old  = parseFloat(h.coins_old||0);
  const sal  = parseFloat(h.coins_saloy||0);
  const tot  = parseFloat(h.coins_total||0);
  const spawn = parseFloat(h.spawn_share||0);
  const cust  = parseFloat(h.customer_share||0);
  const fmt = v => '₱' + parseFloat(v||0).toLocaleString('en-PH',{minimumFractionDigits:2});
  const fmtDT = ts => ts ? new Date(ts).toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}) : '—';

  const pop = document.createElement('div');
  pop.id = 'rc-harvest-detail-pop';
  pop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
  pop.innerHTML = `
    <div style="background:#fff;border-radius:14px;width:min(500px,96vw);max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.3);">
      <div style="background:#1e3cb8;padding:14px 16px;border-radius:14px 14px 0 0;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2;">
        <div>
          <div style="font-size:15px;font-weight:700;color:#fff;">${h.vendo_name||h.tg_name||'—'}</div>
          <div style="font-size:10px;color:rgba(255,255,255,.7);margin-top:2px;">${h.tg_name||'—'}</div>
        </div>
        <button onclick="document.getElementById('rc-harvest-detail-pop').remove()" style="width:28px;height:28px;border-radius:50%;border:1.5px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);color:#fff;font-size:16px;cursor:pointer;">×</button>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">

        <!-- Collector + timing -->
        <div style="background:#f8faff;border-radius:10px;padding:12px 14px;">
          <div style="font-size:10px;font-weight:700;color:#1e3cb8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">👤 Collector Info</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;">
            <div><span style="color:#6b7280;">Collector:</span> <b>${h.collector||'—'}</b></div>
            <div><span style="color:#6b7280;">Route:</span> <b>${h.route_code||'—'}</b></div>
            <div style="grid-column:1/-1;"><span style="color:#6b7280;">Harvest date:</span> <b>${h.harvest_date||'—'}</b></div>
            <div style="grid-column:1/-1;"><span style="color:#6b7280;">Time submitted:</span> <b style="color:#1e3cb8;">${fmtDT(h.harvest_window_end||h.created_at)}</b></div>
            <div style="grid-column:1/-1;"><span style="color:#6b7280;">Window start:</span> <b>${h.harvest_window_start||'—'}</b></div>
          </div>
        </div>

        <!-- Coin breakdown -->
        <div style="background:#f0fdf4;border-radius:10px;padding:12px 14px;">
          <div style="font-size:10px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">💰 Coin Breakdown</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;">
            <div><span style="color:#6b7280;">Total coins:</span> <b>${fmt(tot)}</b></div>
            <div><span style="color:#6b7280;">Free time:</span> <b>-${fmt(free)}</b></div>
            <div><span style="color:#6b7280;">Old coins:</span> <b>-${fmt(old)}</b></div>
            ${sal>0?`<div><span style="color:#ea580c;">Saloy:</span> <b style="color:#ea580c;">-${fmt(sal)}</b></div>`:'<div></div>'}
            <div style="grid-column:1/-1;border-top:1px solid #86efac;padding-top:6px;margin-top:2px;">
              <span style="color:#6b7280;">Net collectible:</span> <b style="color:#15803d;font-size:14px;">${fmt(coin)}</b>
            </div>
          </div>
        </div>

        <!-- Share breakdown -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="background:#eef2ff;border-radius:10px;padding:10px 12px;text-align:center;">
            <div style="font-size:10px;color:#6b7280;margin-bottom:2px;">Spawn share (75%)</div>
            <div style="font-size:16px;font-weight:700;color:#1e3cb8;">${fmt(spawn)}</div>
          </div>
          <div style="background:#f5f3ff;border-radius:10px;padding:10px 12px;text-align:center;">
            <div style="font-size:10px;color:#6b7280;margin-bottom:2px;">Owner share (25%)</div>
            <div style="font-size:16px;font-weight:700;color:#7c3aed;">${fmt(cust)}</div>
          </div>
        </div>

        ${h.collector_note ? `<div style="background:#fef3c7;border-left:3px solid #d97706;border-radius:0 8px 8px 0;padding:8px 12px;font-size:12px;color:#92400e;">📝 <b>Note:</b> ${h.collector_note}</div>` : ''}
      </div>
    </div>`;
  pop.addEventListener('click', e => { if (e.target === pop) pop.remove(); });
  document.body.appendChild(pop);
}

/* ════════════════════════════════════
   COLLECTOR DEFICIT POPUP (click collector card)
════════════════════════════════════ */
function rcShowCollectorDeficits(collector, date) {
  const ex = document.getElementById('rc-deficit-pop');
  if (ex) ex.remove();

  const hs = _rcH.filter(h => h.harvest_date === date && (h.collector||'Unknown').trim() === collector);
  const deficits = hs.map(h => {
    const tg = _rcTA(h.tg_name, h.harvest_window_start, date, h.harvest_window_end);
    const coin = parseFloat(h.coins_total||0);
    return { ...h, tg_income: tg, gap: coin - tg };
  }).filter(h => h.gap < -10).sort((a,b) => a.gap - b.gap);

  const fmt = v => '₱' + Math.abs(parseFloat(v||0)).toLocaleString('en-PH',{minimumFractionDigits:2});

  const pop = document.createElement('div');
  pop.id = 'rc-deficit-pop';
  pop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';

  if (!deficits.length) {
    pop.innerHTML = `<div style="background:#fff;border-radius:14px;padding:24px 28px;text-align:center;width:min(400px,90vw);">
      <div style="font-size:32px;margin-bottom:8px;">✅</div>
      <div style="font-size:14px;font-weight:700;color:#15803d;">No deficits for ${collector} on ${date}</div>
      <button onclick="document.getElementById('rc-deficit-pop').remove()" style="margin-top:16px;padding:8px 24px;background:#1e3cb8;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">Close</button>
    </div>`;
  } else {
    const totalGap = deficits.reduce((s,h) => s + h.gap, 0);
    pop.innerHTML = `<div style="background:#fff;border-radius:14px;width:min(520px,96vw);max-height:88vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.3);">
      <div style="background:#dc2626;padding:14px 16px;border-radius:14px 14px 0 0;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2;">
        <div>
          <div style="font-size:14px;font-weight:700;color:#fff;">🔴 Deficits — ${collector}</div>
          <div style="font-size:10px;color:rgba(255,255,255,.8);margin-top:2px;">${date} · ${deficits.length} vendo(s) · Total gap: ${fmt(totalGap)}</div>
        </div>
        <button onclick="document.getElementById('rc-deficit-pop').remove()" style="width:28px;height:28px;border-radius:50%;border:1.5px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);color:#fff;font-size:16px;cursor:pointer;">×</button>
      </div>
      <div style="padding:14px;display:flex;flex-direction:column;gap:8px;">
        ${deficits.map(h => `
          <div style="border:1.5px solid #fca5a5;border-radius:10px;padding:10px 12px;background:#fef2f2;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
              <div>
                <div style="font-size:13px;font-weight:700;color:#1e3cb8;">${h.vendo_name||h.tg_name||'—'}</div>
                <div style="font-size:10px;color:#6b7280;">${h.tg_name||'—'}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:14px;font-weight:700;color:#dc2626;">${fmt(h.gap)}</div>
                <div style="font-size:9px;color:#6b7280;">deficit</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;">
              <div style="background:#fff;border-radius:6px;padding:5px 8px;"><div style="color:#6b7280;font-size:9px;">Coin net</div><b style="color:#15803d;">${fmt(h.net_collectible)}</b></div>
              <div style="background:#fff;border-radius:6px;padding:5px 8px;"><div style="color:#6b7280;font-size:9px;">TG income</div><b style="color:#7c3aed;">${fmt(h.tg_income)}</b></div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
  }
  pop.addEventListener('click', e => { if (e.target === pop) pop.remove(); });
  document.body.appendChild(pop);
}

window.addEventListener('load', () => { loadCollectorPhotos(); setTimeout(() => loadDashboard(), 500); ['hv-tab-audited','hv-overlay-recon','hv-overlay-records'].forEach(function(oid){ var el=document.getElementById(oid); if(el) el.style.display='none'; }); });

// Full dashboard refresh every 5 min
setInterval(()=>{
  if(document.getElementById("panel-dash").classList.contains("active")) loadDashboard();
},5*60*1000);

// ══════════════════════════════════════════════════════════
// NOT SUSPICIOUS
// ══════════════════════════════════════════════════════════
async function loadNotSuspicious() {
  // Reads from localStorage - vendos marked as not suspicious
  const notsus = JSON.parse(localStorage.getItem("not_suspicious_vendos") || "[]");
  
  document.getElementById("notsus-stats") && (document.getElementById("notsus-stats").innerHTML = `
    <div class="stat"><div class="sl">Not Suspicious Vendos</div><div class="sv green">${notsus.length}</div></div>
    <div class="stat"><div class="sl">Cleared from Suspicious</div><div class="sv green">✅ Legitimate</div></div>
  `);

  const tbody = document.getElementById("notsus-tbody");
  if(!tbody) return;
  tbody.innerHTML = notsus.length ? notsus.map((v,i) => `
    <tr>
      <td style="color:var(--mu)">${i+1}</td>
      <td style="font-weight:500;color:var(--ok)">${v.vendo}</td>
      <td>${v.area||"—"}</td>
      <td style="color:var(--mu)">${v.cleared_at||"—"}</td>
      <td><button class="btn sm danger" onclick="removeFromNotSuspicious('${esc(v.vendo)}')">Remove</button></td>
    </tr>`).join("") 
    : '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--mu)">No vendos marked as not suspicious yet</td></tr>';
}

function removeFromNotSuspicious(vendo) {
  let notsus = JSON.parse(localStorage.getItem("not_suspicious_vendos") || "[]");
  notsus = notsus.filter(v => v.vendo !== vendo);
  localStorage.setItem("not_suspicious_vendos", JSON.stringify(notsus));
  loadNotSuspicious();
}


async function removeNotSuspicious(id, vendo, btn) {
  if(!confirm(`Restore "${vendo}" back to suspicious list?`)) return;
  // Use localStorage only - no not_suspicious table in DB
  let notsus = JSON.parse(localStorage.getItem("not_suspicious_vendos") || "[]");
  notsus = notsus.filter(v => v.vendo !== vendo);
  localStorage.setItem("not_suspicious_vendos", JSON.stringify(notsus));
  btn.closest("tr").remove();
  showAlert(`↩ ${vendo} restored to suspicious list!`,"ok");
}

// ══════════════════════════════════════════════════════════
// SKIPPED — TODO LIST
// ══════════════════════════════════════════════════════════
let skippedByVendo = {};

async function loadSkipped() {
  document.getElementById("skipped-stats").innerHTML='<div style="padding:8px;color:var(--mu);font-size:12px">⏳ Loading count...</div>';
  document.getElementById("skipped-todo").innerHTML='<div style="padding:20px;text-align:center;color:var(--mu)">⏳ Loading skipped summary...</div>';

  // Step 1: Fast count
  try {
    const cr = await fetch(`${SB_URL}/rest/v1/transactions?select=id&is_skipped=eq.true&limit=1`, {
      headers: {...HDR, "Prefer":"count=exact"}, signal: AbortSignal.timeout(8000)
    });
    const range = cr.headers.get("content-range") || "";
    const cnt = parseInt(range.split("/")[1] || "0");
    const nb = document.getElementById("nav-skipped-badge");
    if(nb) nb.textContent = cnt > 999 ? Math.round(cnt/1000)+'k' : cnt;
    document.getElementById("skipped-stats").innerHTML=`
      <div class="stat"><div class="sl">Total Skipped</div><div class="sv amber">${cnt.toLocaleString()}</div></div>
      <div class="stat"><div class="sl">Status</div><div class="sv blue" style="font-size:12px;">⏳ Loading summary...</div></div>`;
  } catch(e) {}

  // Step 2: Use skipped_by_vendo view — one row per vendo, fast
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/skipped_by_vendo_mat?select=vendo,area,skipped_count,total_amount,last_date&order=skipped_count.desc&limit=1000`,
      { headers: HDR, signal: AbortSignal.timeout(10000) }
    );
    const vendoRows = r.ok ? await r.json() : [];

    // Build skippedByVendo from summary view
    skippedByVendo = {};
    vendoRows.forEach(v => {
      skippedByVendo[v.vendo] = {
        vendo: v.vendo,
        area: v.area || "",
        rows: Array(parseInt(v.skipped_count||0)).fill({amount:0}), // placeholder for count
        total: parseFloat(v.total_amount||0),
        last_date: v.last_date || "—",
        skipped_count: parseInt(v.skipped_count||0)
      };
    });

    const total_amt = vendoRows.reduce((s,v)=>s+parseFloat(v.total_amount||0),0);
    const total_cnt = vendoRows.reduce((s,v)=>s+parseInt(v.skipped_count||0),0);

    document.getElementById("skipped-stats").innerHTML=`
      <div class="stat"><div class="sl">Affected Vendos</div><div class="sv amber">${vendoRows.length.toLocaleString()}</div></div>
      <div class="stat"><div class="sl">Total Skipped</div><div class="sv amber">${total_cnt.toLocaleString()}</div></div>
      <div class="stat"><div class="sl">Total Amount</div><div class="sv amber">${fmt(total_amt)}</div></div>
      <div class="stat"><div class="sl">Status</div><div class="sv blue" style="font-size:10px">✅ Dedup active</div></div>
    `;
    filterSkipped();
  } catch(e) {
    document.getElementById("skipped-todo").innerHTML=`<div style="padding:20px;text-align:center;color:#dc2626">⚠️ Error loading skipped data: ${e.message}</div>`;
  }
}

function filterSkipped() {
  const q    = (document.getElementById("sk-search")?.value||"").toLowerCase();
  const area = document.getElementById("sk-area")?.value||"";
  const vendoList = Object.values(skippedByVendo).filter(v =>
    (!q || v.vendo.toLowerCase().includes(q)) &&
    (!area || v.area === area)
  );
  renderSkippedTodo(vendoList);
}

function renderSkippedTodo(vendoList) {
  document.getElementById("skipped-todo").innerHTML = vendoList.map(v => {
    const done     = JSON.parse(localStorage.getItem("skipped_done_"+v.vendo)||"false");
    const note     = localStorage.getItem("skipped_note_"+v.vendo)||"";
    const total    = v.total || v.rows.reduce((s,r)=>s+parseFloat(r.amount||0),0);
    const count    = v.skipped_count || v.rows.length;
    const lastDate = v.last_date || v.rows[0]?.date || "—";
    return `<div class="todo-item${done?" done":""}" id="sk-${btoa(encodeURIComponent(v.vendo)).replace(/=/g,"")}">
      <input type="checkbox" ${done?"checked":""} onchange="toggleSkippedVendo('${esc(v.vendo)}',this.checked)" style="margin-top:3px;cursor:pointer;width:16px;height:16px;">
      <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="todo-text${done?" done":""}" style="font-weight:600;color:#d97706;cursor:pointer" onclick="openSkippedDetail('${esc(v.vendo)}','${v.area}')">${v.vendo}</span>
          <span class="pill info">${v.area||"—"}</span>
          <span class="pill" style="background:#fef3c7;color:#92400e">⏭ ${count.toLocaleString()} skipped txns</span>
          <span style="font-weight:700;color:#d97706">${fmt(total)}</span>
          <span style="font-size:11px;color:var(--mu)">Last: ${lastDate}</span>
        </div>
        <div style="margin-top:6px;display:flex;align-items:center;gap:6px;">
          <span style="font-size:11px;color:var(--mu)">Note:</span>
          <input class="note-input" value="${note.replace(/"/g,"&quot;")}" placeholder="Add note..."
            onchange="localStorage.setItem('skipped_note_${esc(v.vendo)}',this.value)" style="flex:1;max-width:300px;">
          <button class="btn sm p" onclick="openSkippedDetail('${esc(v.vendo)}','${v.area}')">View Transactions →</button>
          <button class="btn sm" style="background:#16a34a;color:white;border-color:#16a34a" onclick="markSkippedLegitimate('${esc(v.vendo)}','${v.area}')">✅ Legitimate → Add to Transactions</button>
        </div>
      </div>
    </div>`;
  }).join("") || '<div style="padding:30px;text-align:center;color:var(--mu);font-size:14px;">✅ No skipped transactions!</div>';
}

function toggleSkippedVendo(vendo, checked) {
  localStorage.setItem("skipped_done_"+vendo, JSON.stringify(checked));
  const id = "sk-"+btoa(encodeURIComponent(vendo)).replace(/=/g,"");
  const item = document.getElementById(id);
  if(item) {
    item.classList.toggle("done", checked);
    item.querySelector(".todo-text")?.classList.toggle("done", checked);
  }
}

async function markSkippedLegitimate(vendo, area) {
  if(!confirm(`Mark ALL skipped transactions for "${vendo}" as legitimate? They will appear in vendo transactions!`)) return;
  const vdata = skippedByVendo[vendo];
  if(!vdata) return;

  // Set is_skipped=FALSE for all transactions of this vendo
  const res = await fetch(`${SB_URL}/rest/v1/transactions?vendo=eq.${encodeURIComponent(vendo)}&is_skipped=eq.true`, {
    method: "PATCH",
    headers: {...HDR, "Content-Type":"application/json", Prefer:"return=minimal"},
    body: JSON.stringify({is_skipped: false})
  });

  if(res.ok) {
    alert(`✅ ${vdata.rows.length} transactions for ${vendo} are now active!`);
    loadSkipped();
  } else {
    const err = await res.text();
    alert("Error: " + err);
  }
}

async function addSingleToTransactions(r) {
  const res = await fetch(`${SB_URL}/rest/v1/transactions?id=eq.${r.id}`, {
    method: "PATCH",
    headers: {...HDR, "Content-Type":"application/json", Prefer:"return=minimal"},
    body: JSON.stringify({is_skipped: false})
  });
  if(res.ok) {
    alert("✅ Transaction is now active in vendo transactions!");
    openSkippedDetail(r.vendo, r.area);
    loadSkipped();
  }
}

// ══════════════════════════════════════════════════════════
// LIVE RECENT TRANSACTIONS — polls every 10 seconds
// ══════════════════════════════════════════════════════════
async function refreshRecentTxns() {
  try {
    const recent = await sb("transactions","select=date,time,vendo,area,amount,created_at&order=created_at.desc",20);
    if(!recent?.length) return;
    
    // Check if new data arrived
    const newestTime = recent[0].created_at;
    const isNew = newestTime !== lastTxnTime;
    if(isNew) lastTxnTime = newestTime;
    
    const el = document.getElementById("recent-txns");
    if(!el) return;
    el.innerHTML = recent.map((t,i)=>{
      const phTime = t.created_at ? new Date(t.created_at).toLocaleString("en-PH",{timeZone:"Asia/Manila",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}) : "";
      const isLatest = i===0 && isNew;
      return `<div onclick="openVendoFromSearch('${esc(t.vendo)}','${t.area}')" style="padding:7px 10px;border-bottom:1px solid #dbeafe;cursor:pointer;background:${isLatest?'#dbeafe':'#f0f4ff'};display:flex;justify-content:space-between;align-items:center;transition:background .12s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='${isLatest?'#dbeafe':'#f0f4ff'}'">
        <div style="min-width:0;flex:1;">
          <div style="font-weight:700;font-size:13px;color:#1a1d2e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${isLatest?'🆕 ':''}${t.vendo}</div>
          <div style="font-size:10px;color:#6b7394;margin-top:1px;">${t.area} · ${phTime}</div>
        </div>
        <div style="font-weight:800;font-size:14px;color:#1565c0;margin-left:8px;flex-shrink:0;">${fmt(t.amount)}</div>
      </div>`;
    }).join("");
    
    // Update live dot color — green if received in last 5 min
    const lastReceived = new Date(newestTime);
    const minsAgo = (Date.now() - lastReceived.getTime()) / 60000;
    const dot = document.querySelector(".sdot");
    if(dot) dot.style.background = minsAgo < 5 ? "#9FE1CB" : minsAgo < 30 ? "#fcd34d" : "#ef4444";
    
    // Update status
    const status = document.getElementById("top-status");
    if(status) {
      const ago = minsAgo < 1 ? "just now" : minsAgo < 60 ? `${Math.floor(minsAgo)}m ago` : `${Math.floor(minsAgo/60)}h ago`;
      status.textContent = `Live · last ${ago}`;
      status.style.color = minsAgo < 5 ? "#9FE1CB" : "#fcd34d";
    }
  } catch(e) { 
    // Don't log every 10 seconds — sb() already handles and shows banner
  }
}

// ══════════════════════════════════════════════════════════
// SKIPPED — TODO LIST
// ══════════════════════════════════════════════════════════

async function moveToLegitimate(vendo) {
  if(!confirm(`Move all skipped transactions for "${vendo}" to legitimate transactions?`)) return;
  const rows = skippedVendos.find(v=>v.vendo===vendo)?.rows || [];
  if(!rows.length) return;
  
  // Insert skipped rows into transactions table
  const txns = rows.map(r => ({
    vendo: r.vendo, area: r.area, ip: r.ip, mac: r.mac||"",
    amount: r.amount, date: r.date, time: r.time||"",
    voucher: r.mac||"", month: r.month||"", extended: "1"
  }));
  
  const res = await fetch(`${SB_URL}/rest/v1/transactions`, {
    method:"POST", headers:{...HDR,"Content-Type":"application/json",Prefer:"resolution=ignore-duplicates,return=minimal"},
    body: JSON.stringify(txns)
  });
  
  if(res.ok) {
    alert(`✅ ${rows.length} transactions moved to legitimate for ${vendo}!`);
    loadSkipped();
  }
}

async function openSkippedDetail(vendo, area) {
  skCurrentVendo = vendo;
  skTxPage_n = 1;
  document.getElementById("skipped-vlist").style.display="none";
  document.getElementById("skipped-detail").style.display="block";
  document.getElementById("sk-detail-title").textContent = "⏭ "+vendo;
  document.getElementById("sk-detail-sub").textContent = area+" area · Skipped (duplicate) transactions";
  showBread(`Skipped → ${vendo}`, closeSkippedDetail);
  document.getElementById("sk-txn-tbody").innerHTML='<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--mu)">⏳ Loading...</td></tr>';

  // Fetch full detail rows for this specific vendo on-demand (not pre-loaded)
  const rows = await sbAll("transactions",
    `select=id,date,time,amount,ip,mac,voucher,reason,created_at&vendo=eq.${encodeURIComponent(vendo)}&is_skipped=eq.true&order=date.desc,time.desc`
  );
  skTxnAll = rows;

  const total = rows.reduce((s,r)=>s+parseFloat(r.amount||0),0);
  document.getElementById("sk-detail-stats").innerHTML=`
    <div class="stat" style="padding:8px 12px;min-width:120px"><div class="sl">Skipped Txns</div><div class="sv amber" style="font-size:16px">${rows.length.toLocaleString()}</div></div>
    <div class="stat" style="padding:8px 12px;min-width:120px"><div class="sl">Total Amount</div><div class="sv amber" style="font-size:16px">${fmt(total)}</div></div>
  `;
  filterSkTxns();
}

function filterSkTxns() {
  const q = (document.getElementById("sk-txn-search")?.value||"").toLowerCase();
  const filtered = skTxnAll.filter(r=>
    !q || (r.ip||"").includes(q) || (r.mac||"").toLowerCase().includes(q) || String(r.amount||"").includes(q)
  );
  document.getElementById("sk-txn-rc").textContent = `Showing ${filtered.length.toLocaleString()} | Total: ${fmt(filtered.reduce((s,r)=>s+parseFloat(r.amount||0),0))}`;
  renderSkTxns(filtered);
}

function renderSkTxns(rows) {
  const PG=100, total=rows.length, start=(skTxPage_n-1)*PG, page=rows.slice(start,start+PG);
  document.getElementById("skp-l").textContent=`Page ${skTxPage_n} of ${Math.ceil(total/PG)||1}`;
  document.getElementById("skp-p").disabled=skTxPage_n===1;
  document.getElementById("skp-n").disabled=start+PG>=total;
  document.getElementById("sk-txn-tbody").innerHTML=page.map((r,i)=>`
    <tr>
      <td style="color:var(--mu)">${start+i+1}</td>
      <td>${r.date||"—"}</td><td style="color:var(--mu)">${r.time||"—"}</td>
      <td style="font-weight:700;color:#d97706">${fmt(r.amount)}</td>
      <td style="font-family:monospace;font-size:11px">${r.ip||"—"}</td>
      <td style="font-family:monospace;font-size:11px;color:var(--mu)">${r.mac||"—"}</td>
      <td style="font-family:monospace;font-size:11px">${r.voucher||r.mac||"—"}</td>
      <td><button class="btn sm p" onclick="moveSingleToLegit(${r.id},'${esc(skCurrentVendo)}')">✅ Legitimate</button></td>
    </tr>`).join("") || '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--mu)">No skipped transactions</td></tr>';
}

function skTxPage(d){skTxPage_n+=d;filterSkTxns();}

async function moveSingleToLegit(id, vendo) {
  const row = skTxnAll.find(r=>r.id===id);
  if(!row) return;
  const res = await fetch(`${SB_URL}/rest/v1/transactions`, {
    method:"POST", headers:{...HDR,"Content-Type":"application/json",Prefer:"resolution=ignore-duplicates,return=minimal"},
    body: JSON.stringify([{vendo:row.vendo,area:row.area,ip:row.ip,mac:row.mac||"",amount:row.amount,date:row.date,time:row.time||"",voucher:row.mac||"",month:row.month||"",extended:"1"}])
  });
  if(res.ok) { alert("✅ Moved to legitimate transactions!"); loadSkipped(); closeSkippedDetail(); }
}

function closeSkippedDetail() {
  document.getElementById("skipped-vlist").style.display="block";
  document.getElementById("skipped-detail").style.display="none";
  skCurrentVendo="";
}

// ── Hacked detail pagination and search ────────
let hkTxns = [];

function filterHkTxns() {
  const q = (document.getElementById("hk-txn-search")?.value||"").toLowerCase();
  const filtered = hkTxnAll.filter(r=>
    !q || (r.ip||"").includes(q)||(r.mac||"").toLowerCase().includes(q)||String(r.amount||"").includes(q)
  );
  document.getElementById("hk-txn-rc").textContent=`Showing ${filtered.length.toLocaleString()} | Total: ${fmt(filtered.reduce((s,r)=>s+parseFloat(r.amount||0),0))}`;
  renderHkTxns(filtered);
}

function renderHkTxns(rows) {
  const PG=100,total=rows.length,start=(hkTxPage_n-1)*PG,page=rows.slice(start,start+PG);
  document.getElementById("hkp-l").textContent=`Page ${hkTxPage_n} of ${Math.ceil(total/PG)||1}`;
  document.getElementById("hkp-p").disabled=hkTxPage_n===1;
  document.getElementById("hkp-n").disabled=start+PG>=total;
  const notes=JSON.parse(localStorage.getItem("hacked_notes_"+hkCurrentVendo)||"{}");
  const done=JSON.parse(localStorage.getItem("hacked_done_"+hkCurrentVendo)||"[]");
  document.getElementById("sus-txn-tbody").innerHTML=page.map((t,i)=>{
    const isDone=done.includes(t.id);
    return `<tr class="txn-row-hack${isDone?" done":""}">
      <td style="color:var(--mu)">${start+i+1}</td>
      <td>${t.date}</td><td>${t.time}</td>
      <td style="font-weight:700;color:#dc2626">${fmt(t.amount)}</td>
      <td style="font-family:monospace;font-size:11px">${t.ip||"—"}</td>
      <td style="font-family:monospace;font-size:11px">${t.mac||"—"}</td>
      <td style="color:#dc2626">${t.total_time||"—"}</td>
      <td style="display:flex;gap:3px;flex-wrap:wrap;">
        <button class="btn sm ${isDone?"":"p"}" onclick="toggleDone(${t.id},'${esc(hkCurrentVendo)}',this)">${isDone?"↩ Undo":"✓ Done"}</button>
        <button class="btn sm danger" onclick="markLegitimate(${t.id},this)">✅ Legitimate</button>
      </td>
    </tr>`;
  }).join("")||'<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--ok)">No suspicious transactions</td></tr>';
}

function hkTxPage(d){hkTxPage_n+=d;filterHkTxns();}

// ══════════════════════════════════════════════════════════
// WEBHOOK HEALTH CHECKER — DISABLED (Railway replaced webhook)
// ══════════════════════════════════════════════════════════
const WORKER_URL = "";
const BOT_TOKEN  = "";

async function checkWebhookHealth() {
  // Railway Telethon replaced the webhook — nothing to check
  const btn = document.getElementById("webhook-btn");
  if (btn) { btn.style.display = "none"; }
}

function showAlert(msg, type) {
  let el = document.getElementById('_global-alert');
  if (!el) {
    el = document.createElement('div');
    el.id = '_global-alert';
    el.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:9999;padding:9px 20px;border-radius:8px;font-size:13px;font-weight:700;font-family:system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.2);pointer-events:none;transition:opacity .3s;';
    document.body.appendChild(el);
  }
  el.style.background = type === 'ok' ? '#16a34a' : type === 'err' ? '#dc2626' : '#1565c0';
  el.style.color = '#fff';
  el.style.opacity = '1';
  el.textContent = msg;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

function showWebhookAlert(type, msg="") {
  let existing = document.getElementById("webhook-alert");
  if (!existing) {
    existing = document.createElement("div");
    existing.id = "webhook-alert";
    existing.style.cssText = "position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:999;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:12px;box-shadow:0 4px 20px rgba(0,0,0,.3);";
    document.body.appendChild(existing);
  }
  if (type === "DOWN") {
    existing.style.background = "#dc2626";
    existing.style.color = "white";
    existing.innerHTML = `🚨 <strong>WEBHOOK IS DOWN!</strong> — Transactions are not being collected! <button onclick="resetWebhook()" style="padding:4px 12px;background:white;color:#dc2626;border:none;border-radius:4px;cursor:pointer;font-weight:700;margin-left:8px;">Fix Now →</button> <button onclick="hideWebhookAlert()" style="background:none;border:none;color:white;cursor:pointer;font-size:16px;margin-left:4px;">✕</button>`;
  } else if (type === "SLOW") {
    existing.style.background = "#d97706";
    existing.style.color = "white";
    existing.innerHTML = `⚠️ Webhook is slow — ${msg} messages pending <button onclick="hideWebhookAlert()" style="background:none;border:none;color:white;cursor:pointer;font-size:16px;margin-left:8px;">✕</button>`;
  } else if (type === "ERROR") {
    existing.style.background = "#d97706";
    existing.style.color = "white";
    existing.innerHTML = `⚠️ Webhook error: ${msg} <button onclick="resetWebhook()" style="padding:4px 12px;background:white;color:#d97706;border:none;border-radius:4px;cursor:pointer;font-weight:700;margin-left:8px;">Reset →</button> <button onclick="hideWebhookAlert()" style="background:none;border:none;color:white;cursor:pointer;font-size:16px;">✕</button>`;
  }
}

function hideWebhookAlert() {
  const el = document.getElementById("webhook-alert");
  if (el) el.remove();
}

async function resetWebhook() {
  const btn = document.getElementById("webhook-btn");
  if (btn) btn.textContent = "⏳ Resetting...";
  try {
    // First delete
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);
    // Wait 1 second
    await new Promise(r => setTimeout(r, 1000));
    // Set again
    const res  = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(WORKER_URL+"/")}`);
    const data = await res.json();
    if (data.ok) {
      if (btn) {
        btn.textContent = "✅ Webhook Reset!";
        btn.style.background = "rgba(22,163,74,.6)";
      }
      hideWebhookAlert();
      alert("✅ Webhook successfully reset! Transactions will now be collected.");
    } else {
      alert("❌ Reset failed: " + JSON.stringify(data));
    }
  } catch(e) {
    alert("❌ Error: " + e.message);
  }
  // Re-check after 3 seconds
  setTimeout(checkWebhookHealth, 3000);
}

// Check webhook health every 5 minutes — no-op since Railway replaced it
setInterval(checkWebhookHealth, 5 * 60 * 1000);

// ── Auto Telegram Session Health Check every 3 minutes ───
let _tgAutoChecking = false;
async function autoCheckTgSession() {
  if (_tgAutoChecking) return;
  _tgAutoChecking = true;
  try {
    const url = getTgUrl();
    if (!url) return;
    const r = await fetch(`${url}/api/tg_status`, { signal: AbortSignal.timeout(8000) });
    const data = await r.json();
    const banner = document.getElementById('tg-auto-alert');
    const pill   = document.getElementById('tg-status-pill');

    if (data.status === 'ok') {
      // Session healthy — hide alert if showing
      if (banner) banner.style.display = 'none';
      if (pill) { pill.textContent = '● Session Active'; pill.style.background='#dcfce7'; pill.style.color='#16a34a'; }
    } else {
      // Session problem — show top alert
      if (pill) { pill.textContent = '❌ Session Error'; pill.style.background='#fee2e2'; pill.style.color='#dc2626'; }
      if (!banner) {
        const el = document.createElement('div');
        el.id = 'tg-auto-alert';
        el.style.cssText = 'position:fixed;top:52px;left:0;right:0;background:#d97706;color:white;padding:10px 16px;font-size:13px;font-weight:700;z-index:1000;display:flex;justify-content:space-between;align-items:center;gap:10px;';
        el.innerHTML = `⚠️ Telegram session problem detected: <b>${data.status}</b> — Go to SYSTEM tab to fix.
          <button onclick="showP('status',document.querySelector('.nav-bar button[data-panel=status]'));document.getElementById('tg-auto-alert').style.display='none';"
            style="padding:4px 12px;background:white;color:#d97706;border:none;border-radius:4px;cursor:pointer;font-weight:700;white-space:nowrap;">
            Fix Now →
          </button>`;
        document.body.appendChild(el);
      } else {
        banner.style.display = 'flex';
        banner.querySelector('b').textContent = data.status;
      }
    }
  } catch(e) {
    // Railway unreachable — show subtle warning only if bot was previously ok
  } finally {
    _tgAutoChecking = false;
  }
}
// Run once on load after 10s, then every 3 minutes
setTimeout(autoCheckTgSession, 10000);
setInterval(autoCheckTgSession, 3 * 60 * 1000);

// Also check last transaction time every minute (silent — uses sb() error handling)
setInterval(async () => {
  if (sbOffline) return; // don't pile on when already offline
  try {
    const res  = await fetch(`${SB_URL}/rest/v1/transactions?select=created_at&is_skipped=eq.false&order=created_at.desc&limit=1`, { headers: HDR });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.length > 0) {
      const lastTxn  = new Date(data[0].created_at);
      const minsAgo  = Math.floor((Date.now() - lastTxn.getTime()) / 60000);
      const statusEl = document.getElementById("top-status");
      if (minsAgo > 30 && statusEl) {
        statusEl.textContent = `⚠️ Last txn ${minsAgo}m ago`;
        statusEl.style.color = "#fca5a5";
      } else if (statusEl) {
        statusEl.style.color = "";
      }
    }
  } catch(e) {}
}, 60 * 1000);

// ══════════════════════════════════════════════════════════
// SYSTEM STATUS
// ══════════════════════════════════════════════════════════
async function loadSystemStatus() {
  const warnings = [];

  // 1. Test Supabase connection
  try {
    const r = await fetch(`${SB_URL}/rest/v1/transactions?select=id&limit=1`, { headers: HDR });
    if (r.ok) {
      document.getElementById("sys-supabase").innerHTML = '<span style="color:var(--ok)">✅ Connected</span>';
    } else {
      document.getElementById("sys-supabase").innerHTML = '<span style="color:var(--red)">❌ Error '+r.status+'</span>';
      warnings.push("⚠️ Supabase returned error " + r.status);
    }
  } catch(e) {
    document.getElementById("sys-supabase").innerHTML = '<span style="color:var(--red)">❌ Offline</span>';
    warnings.push("❌ Cannot reach Supabase: " + e.message);
  }

  // 2. Last transaction time
  try {
    const r = await fetch(`${SB_URL}/rest/v1/transactions?select=created_at,vendo,area,amount&is_skipped=eq.false&order=created_at.desc&limit=10`, { headers: HDR });
    const rows = await r.json();
    if (rows?.length > 0) {
      const last = new Date(rows[0].created_at);
      const minsAgo = Math.floor((Date.now() - last.getTime()) / 60000);
      const timeStr = last.toLocaleString("en-PH", {timeZone:"Asia/Manila",hour:"2-digit",minute:"2-digit",hour12:true});

      let railColor = "var(--ok)", railText = "✅ Live";
      if (minsAgo > 60) { railColor = "var(--red)"; railText = "❌ Stopped?"; warnings.push(`❌ No transactions for ${minsAgo} minutes — Railway may be down!`); }
      else if (minsAgo > 30) { railColor = "var(--amber)"; railText = "⚠️ Slow"; warnings.push(`⚠️ No transactions for ${minsAgo} minutes`); }

      // Telegram session check — if no txns for 2+ hours, show session alert
      const tgAlert = document.getElementById("tg-session-alert");
      const tgMsg   = document.getElementById("tg-session-msg");
      if (minsAgo > 120) {
        const hoursAgo = Math.floor(minsAgo / 60);
        tgAlert.style.display = "block";
        tgMsg.textContent = `No transactions received for ${hoursAgo} hour${hoursAgo>1?'s':''} (last was ${timeStr}). This could mean: Railway is down, OR your Telegram session has expired and needs re-authentication. Check Railway logs immediately.`;
        warnings.push(`🔐 Telegram session may be expired — no data for ${hoursAgo}h. Check Railway logs!`);
      } else if (minsAgo > 60) {
        tgAlert.style.display = "block";
        tgMsg.textContent = `No transactions for ${minsAgo} minutes. Monitor closely — if this continues past 2 hours, your Telegram session may have expired.`;
      } else {
        tgAlert.style.display = "none";
      }

      document.getElementById("sys-railway").innerHTML = `<span style="color:${railColor}">${railText}</span>`;
      document.getElementById("sys-last").innerHTML = `<span style="font-size:14px;color:${minsAgo>30?'var(--red)':'var(--ok)'}">${minsAgo}m ago</span><div style="font-size:10px;color:var(--mu)">${timeStr}</div>`;

      // Update topbar status
      const statusEl = document.getElementById("top-status");
      if (statusEl) {
        if (minsAgo > 120) {
          statusEl.textContent = "⚠️ Session?";
          statusEl.style.color = "#fcd34d";
          document.querySelector(".sdot").style.background = "#ef4444";
        } else if (minsAgo > 30) {
          statusEl.textContent = `⚠️ ${minsAgo}m ago`;
          statusEl.style.color = "#fcd34d";
          document.querySelector(".sdot").style.background = "#fcd34d";
        } else {
          statusEl.textContent = `Live · ${minsAgo}m ago`;
          statusEl.style.color = "";
          document.querySelector(".sdot").style.background = "#4ade80";
        }
      }

      // Recent 10
      document.getElementById("sys-recent").innerHTML = rows.map(r => {
        const t = new Date(r.created_at);
        const mins = Math.floor((Date.now()-t.getTime())/60000);
        const ts = t.toLocaleString("en-PH",{timeZone:"Asia/Manila",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:true});
        return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--bd);align-items:center">
          <div><span style="font-weight:500">${r.vendo}</span> <span style="color:var(--mu);font-size:11px">${r.area}</span></div>
          <div style="text-align:right"><span style="color:#1565c0;font-weight:600">${fmt(r.amount)}</span><div style="font-size:10px;color:var(--mu)">${ts} · ${mins}m ago</div></div>
        </div>`;
      }).join("");

      // Feed status
      const feedColor = minsAgo > 30 ? "var(--red)" : "var(--ok)";
      document.getElementById("sys-feed").innerHTML = `
        <div>🟢 <b>Railway Telethon</b>: <span style="color:${feedColor}">${minsAgo <= 30 ? 'Running' : 'May be down'}</span></div>
        <div>📡 <b>Last received</b>: ${minsAgo}m ago at ${timeStr}</div>
        <div>🗄️ <b>Supabase writes</b>: <span style="color:var(--ok)">Working</span></div>
        <div>🔄 <b>Auto-import on restart</b>: <span style="color:var(--ok)">Enabled</span></div>
        <div>👁️ <b>Groups monitored</b>: <span style="color:#1565c0">339 groups</span></div>
      `;
    }
  } catch(e) {
    warnings.push("❌ Error fetching transactions: " + e.message);
  }

  // 3. Today's stats
  try {
    const today = new Date().toLocaleDateString("en-CA", {timeZone:"Asia/Manila"});
    const r = await fetch(`${SB_URL}/rest/v1/transactions?select=amount,area&is_skipped=eq.false&date=eq.${today}`, { headers: HDR });
    const rows = await r.json();
    if (rows?.length > 0) {
      const total = rows.reduce((s,r) => s+parseFloat(r.amount||0), 0);
      document.getElementById("sys-today").textContent = rows.length.toLocaleString();
      document.getElementById("sys-sales").textContent = fmt(total);

      // By area
      const byArea = {};
      rows.forEach(r => { byArea[r.area] = (byArea[r.area]||0) + parseFloat(r.amount||0); });
      document.getElementById("sys-area-today").innerHTML = Object.entries(byArea)
        .sort((a,b) => b[1]-a[1])
        .map(([area, amt]) => `
          <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--bd);font-size:12px">
            <span style="font-weight:500">${area}</span>
            <span style="color:#1565c0;font-weight:600">${fmt(amt)}</span>
          </div>`).join("");
    } else {
      document.getElementById("sys-today").textContent = "0";
      document.getElementById("sys-sales").textContent = "₱0";
      document.getElementById("sys-area-today").innerHTML = '<div style="padding:12px;color:var(--mu);font-size:12px">No transactions today yet</div>';
    }
  } catch(e) {
    warnings.push("❌ Error fetching today's stats: " + e.message);
  }

  // 4. Storage - accurate live count + alert
  try {
    const r = await fetch(`${SB_URL}/rest/v1/transactions?select=id&limit=1`, {
      headers: {...HDR, "Prefer": "count=exact"},
      signal: AbortSignal.timeout(10000)
    });
    const range = r.headers.get("content-range") || "";
    const total = parseInt(range.split("/")[1] || "0");
    const skippedR = await fetch(`${SB_URL}/rest/v1/transactions?select=id&is_skipped=eq.true&limit=1`, {
      headers: {...HDR, "Prefer": "count=exact"},
      signal: AbortSignal.timeout(10000)
    });
    const skRange = skippedR.headers.get("content-range") || "";
    const skTotal = parseInt(skRange.split("/")[1] || "0");
    const active = total - skTotal;

    // Get real DB size from get_db_size() RPC function
    let realDbSize = '—';
    let realDbMB = 0;
    try {
      const dbSizeR = await fetch(`${SB_URL}/rest/v1/rpc/get_db_size`, {
        method: 'POST',
        headers: { ...HDR, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: '{}'
      });
      if (dbSizeR.ok) {
        const dbSizeRaw = await dbSizeR.text();
        realDbSize = dbSizeRaw.replace(/^"|"$/g, '').trim(); // strip JSON quotes e.g. "221 MB" -> 221 MB
        // Parse MB number from string like "221 MB" or "1.2 GB"
        const sizeMatch = realDbSize.match(/([\d.]+)\s*(MB|GB|KB)/i);
        if (sizeMatch) {
          const num = parseFloat(sizeMatch[1]);
          const unit = sizeMatch[2].toUpperCase();
          realDbMB = unit === 'GB' ? Math.round(num * 1024) : unit === 'KB' ? Math.round(num / 1024) : Math.round(num);
        }
      }
    } catch(e) { realDbSize = '—'; }

    const limitMB = 8192; // 8 GB pro plan
    const usedPct = realDbMB > 0 ? Math.round((realDbMB / limitMB) * 100) : 0;

    // Color based on usage
    const storColor = usedPct >= 90 ? "var(--red)" : usedPct >= 75 ? "var(--amber)" : "var(--ok)";
    const barColor  = usedPct >= 90 ? "#dc2626"    : usedPct >= 75 ? "#d97706"    : "#16a34a";

    document.getElementById("sys-storage").innerHTML =
      `<span style="font-size:14px;color:${storColor};font-weight:700">${realDbSize} / 8 GB</span>
       <div style="background:#f0f4ff;border-radius:4px;height:6px;margin:4px 0;overflow:hidden;">
         <div style="background:${barColor};height:6px;width:${Math.min(usedPct,100)}%;border-radius:4px;transition:width .5s;"></div>
       </div>
       <div style="font-size:10px;color:${storColor};font-weight:600">${usedPct}% used</div>
       <div style="font-size:10px;color:var(--mu)">${total.toLocaleString()} total rows</div>
       <div style="font-size:10px;color:var(--ok)">${active.toLocaleString()} active</div>
       <div style="font-size:10px;color:var(--amber)">${skTotal.toLocaleString()} skipped</div>`;

    // Storage alert banner
    const storAlert = document.getElementById("storage-alert");
    if (storAlert) {
      if (usedPct >= 90) {
        storAlert.style.display = "flex";
        storAlert.style.background = "#fee2e2";
        storAlert.style.borderColor = "#dc2626";
        document.getElementById("storage-alert-icon").textContent = "🔴";
        document.getElementById("storage-alert-msg").innerHTML =
          `<b>CRITICAL: Storage at ${usedPct}% (${realDbSize} / 8 GB)!</b><br>
           Approaching limit. Do a Full Backup NOW and consider archiving old data.`;
        document.getElementById("storage-alert-msg").style.color = "#dc2626";
        warnings.push(`🔴 CRITICAL: Supabase storage at ${usedPct}% — ${realDbSize} of 8 GB used!`);
      } else if (usedPct >= 75) {
        storAlert.style.display = "flex";
        storAlert.style.background = "#fef3c7";
        storAlert.style.borderColor = "#d97706";
        document.getElementById("storage-alert-icon").textContent = "🟡";
        document.getElementById("storage-alert-msg").innerHTML =
          `<b>Warning: Storage at ${usedPct}% (${realDbSize} / 8 GB)</b><br>
           Getting full. Consider doing a backup and archiving old data soon.`;
        document.getElementById("storage-alert-msg").style.color = "#92400e";
        warnings.push(`⚠️ Storage at ${usedPct}% — ${realDbSize} of 8 GB used`);
      } else if (usedPct >= 50) {
        storAlert.style.display = "flex";
        storAlert.style.background = "#f0f9ff";
        storAlert.style.borderColor = "#0284c7";
        document.getElementById("storage-alert-icon").textContent = "🔵";
        document.getElementById("storage-alert-msg").innerHTML =
          `Storage at ${usedPct}% (${realDbSize} / 8 GB) — healthy, keep monitoring.`;
        document.getElementById("storage-alert-msg").style.color = "#0369a1";
      } else {
        storAlert.style.display = "none";
      }
      // Update topbar dot color if critical
      if (usedPct >= 90) {
        document.querySelector(".sdot").style.background = "#ef4444";
        document.getElementById("top-status").textContent = "⚠️ Storage Full!";
      }
    }
  } catch(e) {}

  // 5. Show warnings
  const warnEl = document.getElementById("sys-warnings");
  if (warnings.length === 0) {
    warnEl.innerHTML = '<div style="color:var(--ok);padding:8px 0">✅ All systems normal — no issues detected</div>';
  } else {
    warnEl.innerHTML = warnings.map(w => `<div style="padding:6px 0;border-bottom:1px solid #fecaca;color:#dc2626">${w}</div>`).join("");
  }
}

// ── closeHackedDetail alias (used in breadcrumb) ──────────
function closeHackedDetail() { closeSuspiciousDetail(); }

// ══════════════════════════════════════════════════════════
// BACKUP — Export full transactions to CSV
// ══════════════════════════════════════════════════════════
async function backupData() {
  const btn = document.getElementById('backup-txn-btn') || event?.target;
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.textContent = "⏳ Fetching..."; btn.disabled = true; }

  try {
    let all = [], offset = 0, page = 1000;
    while (true) {
      if (btn) btn.textContent = `⏳ ${all.length.toLocaleString()} rows...`;
      const r = await fetch(
        `${SB_URL}/rest/v1/transactions?select=id,date,time,vendo,area,amount,ip,mac,voucher,total_time,extended,is_skipped,created_at&is_skipped=eq.false&order=date.desc,time.desc&limit=${page}&offset=${offset}`,
        { headers: HDR }
      );
      const rows = await r.json();
      if (!rows?.length) break;
      all.push(...rows);
      if (rows.length < page) break;
      offset += page;
    }

    if (btn) btn.textContent = "⏳ Building CSV...";
    const headers = ["id","date","time","vendo","area","amount","ip","mac","voucher","total_time","extended","is_skipped","created_at"];
    const csvRows = [headers.join(",")];
    all.forEach(r => {
      csvRows.push(headers.map(h => {
        const val = r[h] ?? "";
        const s = String(val).replace(/"/g, '""');
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
      }).join(","));
    });

    const csv = csvRows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    a.href = url;
    a.download = `spawn_transactions_backup_${dateStr}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const now = new Date().toLocaleString("en-PH",{timeZone:"Asia/Manila",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:true});
    localStorage.setItem("last_backup", now);
    const lbt = document.getElementById("last-backup-time");
    if (lbt) lbt.textContent = `Last backup: ${now} — ${all.length.toLocaleString()} rows`;

    if (btn) { btn.textContent = `✅ Done! (${all.length.toLocaleString()} rows)`; btn.style.background="#0d9488"; }
    setTimeout(() => { if(btn){btn.textContent=origText||"⬇ Download CSV";btn.disabled=false;btn.style.background="";} }, 4000);
    return all.length;
  } catch(e) {
    if (btn) { btn.textContent = "❌ Failed"; btn.disabled = false; }
    alert("Backup error: " + e.message);
    return 0;
  }
}

async function backupAppPy() {
  const msg = document.getElementById('apypy-msg');
  if (msg) msg.textContent = '⏳ Fetching…';
  try {
    // Try raw GitHub (public) first
    const urls = [
      'https://raw.githubusercontent.com/SpawnInternet/VendoMonitor-Cloud/main/app.py',
      'https://raw.githubusercontent.com/SpawnInternet/VendoMonitor-Cloud/master/app.py',
    ];
    let text = null;
    for (const url of urls) {
      try {
        const r = await fetch(url);
        if (r.ok) { text = await r.text(); break; }
      } catch(e) {}
    }
    if (!text) throw new Error('Repo is private or app.py not found. Make repo public to enable this download.');
    const blob = new Blob([text], {type:'text/plain'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'app.py';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    if (msg) { msg.textContent = '✅ Downloaded!'; setTimeout(()=>msg.textContent='', 3000); }
  } catch(e) {
    if (msg) msg.textContent = '❌ ' + e.message;
    // Fallback: open GitHub page
    window.open('https://github.com/SpawnInternet/VendoMonitor-Cloud', '_blank');
  }
}

function backupDashboard() {
  // Download the current page HTML
  const html = document.documentElement.outerHTML;
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  a.href = url;
  a.download = `dashboard_backup_${dateStr}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showAlert("✅ Dashboard HTML downloaded!", "ok");
}

async function runFullBackup() {
  const btn = document.getElementById("full-backup-btn");
  const prog = document.getElementById("backup-progress");
  const progMsg = document.getElementById("backup-progress-msg");
  const progBar = document.getElementById("backup-progress-bar");

  btn.textContent = "⏳ Running..."; btn.disabled = true;
  prog.style.display = "block";

  // Step 1 — Transactions CSV
  progMsg.textContent = "Step 1/3 — Downloading transactions CSV...";
  progBar.style.width = "10%";
  const rows = await backupData();
  progBar.style.width = "60%";

  // Step 2 — Dashboard HTML
  await new Promise(r => setTimeout(r, 800));
  progMsg.textContent = "Step 2/3 — Downloading dashboard HTML...";
  progBar.style.width = "70%";
  backupDashboard();

  // Step 3 — Remind about GitHub ZIPs
  await new Promise(r => setTimeout(r, 800));
  progMsg.textContent = "Step 3/3 — Opening GitHub ZIP downloads...";
  progBar.style.width = "90%";
  await new Promise(r => setTimeout(r, 500));

  // Open GitHub ZIP downloads in new tabs
  window.open("https://github.com/SpawnInternet/VendoMonitor-Cloud/archive/refs/heads/main.zip", "_blank");

  progBar.style.width = "100%";
  const now = new Date().toLocaleString("en-PH",{timeZone:"Asia/Manila",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:true});
  localStorage.setItem("last_backup", now);
  progMsg.textContent = `✅ Full backup complete! ${rows.toLocaleString()} rows + HTML + code ZIP downloaded.`;
  progMsg.style.color = "#16a34a";

  const lbt = document.getElementById("last-backup-time");
  if (lbt) lbt.textContent = `Last backup: ${now}`;

  btn.textContent = "✅ Backup Complete!"; btn.style.background="#0d9488";
  setTimeout(() => {
    btn.textContent = "⬇ Full Backup (All Files)";
    btn.disabled = false; btn.style.background = "";
    prog.style.display = "none";
    progMsg.style.color = "";
    progBar.style.width = "0%";
  }, 6000);
}

// ══════════════════════════════════════════════════════════
// TELEGRAM SESSION AUTH
// ══════════════════════════════════════════════════════════
function getTgUrl() {
  return localStorage.getItem("railway_url") || "https://vendomonitor-cloud-production.up.railway.app";
}
function saveTgUrl() {
  const url = (document.getElementById("railway-url")?.value||"").trim().replace(/\/$/,"");
  if (!url) { alert("Please enter your Railway URL first"); return; }
  localStorage.setItem("railway_url", url);
  document.getElementById("railway-url").value = url;
  showAlert("✅ Railway URL saved!", "ok");
}

async function checkTgSession() {
  const url  = getTgUrl();
  const pill = document.getElementById("tg-status-pill");
  const msg  = document.getElementById("tg-status-msg");
  const panel= document.getElementById("tg-auth-panel");
  const lbl  = document.getElementById("tg-auth-label");

  if (!url) {
    pill.style.background="#fee2e2"; pill.style.color="#dc2626"; pill.textContent="⚠ No URL set";
    msg.textContent = "Enter your Railway URL below and click Save first.";
    return;
  }
  pill.style.background="#e0f2fe"; pill.style.color="#1565c0"; pill.textContent="⏳ Checking...";

  try {
    const r = await fetch(`${url}/api/tg_status`, { signal: AbortSignal.timeout(8000) });
    const data = await r.json();
    if (data.status === "ok") {
      pill.style.background="#dcfce7"; pill.style.color="#16a34a"; pill.textContent="● Session Active";
      msg.textContent = "✅ Telegram session is active — collecting transactions normally.";
      panel.style.display="none";
      document.getElementById("tg-session-alert").style.display="none";
    } else if (data.status === "waiting_code") {
      pill.style.background="#fef3c7"; pill.style.color="#d97706"; pill.textContent="📱 Code Required";
      msg.textContent = "⚠️ Telegram sent a verification code to your phone. Enter it below.";
      lbl.textContent = "📱 Enter Telegram Verification Code";
      const inp = document.getElementById("tg-code-input");
      inp.type="text"; inp.placeholder="Enter code e.g. 12345";
      panel.style.display="block";
    } else if (data.status === "waiting_password") {
      pill.style.background="#fef3c7"; pill.style.color="#d97706"; pill.textContent="🔒 2FA Required";
      msg.textContent = "⚠️ Two-factor authentication password required.";
      lbl.textContent = "🔒 Enter Your 2FA Password";
      const inp = document.getElementById("tg-code-input");
      inp.type="password"; inp.placeholder="Enter 2FA password";
      panel.style.display="block";
    } else {
      pill.style.background="#fee2e2"; pill.style.color="#dc2626"; pill.textContent="❌ Error";
      msg.textContent = "❌ " + (data.message||"Unknown status");
      panel.style.display="none";
    }
  } catch(e) {
    pill.style.background="#fee2e2"; pill.style.color="#dc2626"; pill.textContent="❌ Unreachable";
    msg.innerHTML = `Cannot reach Railway at <b>${url}</b> — check the URL or ensure app.py has the auth patch applied.`;
    panel.style.display="none";
  }
}

async function submitTgCode() {
  const url  = getTgUrl();
  const inp  = document.getElementById("tg-code-input");
  const code = (inp?.value||"").trim();
  const btn  = document.getElementById("tg-submit-btn");
  const res  = document.getElementById("tg-code-result");

  if (!code) { res.style.color="#dc2626"; res.textContent="⚠ Please enter the code."; return; }
  if (!url)  { res.style.color="#dc2626"; res.textContent="⚠ No Railway URL saved."; return; }

  btn.textContent="⏳ Submitting..."; btn.disabled=true;
  const isPassword = inp.type==="password";
  const body = isPassword ? {password:code} : {code:code};

  try {
    const r = await fetch(`${url}/api/tg_auth`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body), signal:AbortSignal.timeout(10000)
    });
    const data = await r.json();
    if (data.ok) {
      res.style.color="#16a34a";
      res.textContent = "✅ " + data.message + " Checking session in 3 seconds...";
      inp.value="";
      setTimeout(checkTgSession, 3000);
    } else {
      res.style.color="#dc2626";
      res.textContent = "❌ " + (data.error||"Failed — try again");
    }
  } catch(e) {
    res.style.color="#dc2626"; res.textContent="❌ Error: "+e.message;
  }
  btn.textContent="Submit →"; btn.disabled=false;
}

// Auto-restore saved Railway URL
(function(){
  const saved = localStorage.getItem("railway_url") || "https://vendomonitor-cloud-production.up.railway.app";
  if (saved) { const el=document.getElementById("railway-url"); if(el)el.value=saved; }
  // Restore last backup time
  const lb = localStorage.getItem("last_backup");
  const lbt = document.getElementById("last-backup-time");
  if (lb && lbt) lbt.textContent = `Last backup: ${lb} — click to backup again`;
})();

// ══════════════════════════════════════════════════════════
// FULL BACKUP — ZIP with all data + code files
// ══════════════════════════════════════════════════════════
async function fullBackup() {
  const panel = document.getElementById('backup-panel');
  const stepsEl = document.getElementById('backup-steps');
  const bar = document.getElementById('backup-bar');
  const pct = document.getElementById('backup-pct');
  panel.style.display = 'block';
  panel.scrollIntoView({behavior:'smooth'});

  const log = (msg, done=false) => {
    const icon = done ? '✅' : '⏳';
    stepsEl.innerHTML += `<div>${icon} ${msg}</div>`;
  };
  const setProgress = (p) => {
    bar.style.width = p + '%';
    pct.textContent = Math.round(p) + '%';
  };

  stepsEl.innerHTML = '';
  setProgress(0);

  try {
    const zip = new JSZip();
    const dateStr = new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
    const timeStr = new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila',hour12:true});

    // ── STEP 1: Transactions CSV ──────────────────────────
    log('Fetching all transactions from Supabase...');
    let txns = [], offset = 0;
    while(true) {
      const r = await fetch(
        `${SB_URL}/rest/v1/transactions?select=id,date,time,vendo,area,amount,ip,mac,voucher,total_time,extended,is_skipped,reason,created_at&order=date.desc,time.desc&limit=1000&offset=${offset}`,
        { headers: HDR }
      );
      const rows = await r.json();
      if (!rows?.length) break;
      txns.push(...rows);
      setProgress(Math.min(35, (txns.length / 340000) * 35));
      if (rows.length < 1000) break;
      offset += 1000;
    }
    const txnHeaders = ['id','date','time','vendo','area','amount','ip','mac','voucher','total_time','extended','is_skipped','reason','created_at'];
    const txnCsv = [txnHeaders.join(','), ...txns.map(r =>
      txnHeaders.map(h => { const v=String(r[h]??'').replace(/"/g,'""'); return v.includes(',')||v.includes('"')?`"${v}"`:v; }).join(',')
    )].join('\n');
    zip.file(`data/transactions_${dateStr}.csv`, txnCsv);
    log(`Transactions: ${txns.length.toLocaleString()} rows saved`, true);
    setProgress(40);

    // ── STEP 2: Vendo Summary CSV ─────────────────────────
    log('Fetching vendo summary...');
    const vsR = await fetch(`${SB_URL}/rest/v1/summary_by_vendo?select=vendo,area,sales,txn_count&order=sales.desc&limit=2000`, { headers: HDR });
    const vs = await vsR.json();
    if (vs?.length) {
      const vsCsv = ['vendo,area,sales,txn_count', ...vs.map(r => `"${r.vendo}","${r.area}",${r.sales},${r.txn_count}`)].join('\n');
      zip.file(`data/vendo_summary_${dateStr}.csv`, vsCsv);
      log(`Vendo summary: ${vs.length} vendos saved`, true);
    }
    setProgress(45);

    // ── STEP 2b: Vendos table ─────────────────────────────
    log('Fetching vendos table...');
    const vendosR = await fetch(`${SB_URL}/rest/v1/vendos?select=*&order=id.asc&limit=2000`, { headers: HDR });
    const vendos = await vendosR.json();
    if (vendos?.length) {
      const vKeys = Object.keys(vendos[0]);
      const vCsv = [vKeys.join(','), ...vendos.map(r =>
        vKeys.map(k => { const val=String(r[k]??'').replace(/"/g,'""'); return (val.includes(',')||val.includes('"')||val.includes('\n'))?'"'+val+'"':val; }).join(',')
      )].join('\n');
      zip.file(`data/vendos_${dateStr}.csv`, vCsv);
      log(`Vendos: ${vendos.length} rows saved`, true);
    }
    setProgress(52);

    // ── STEP 2c: Harvests table ───────────────────────────
    log('Fetching harvests table...');
    const harvR = await fetch(`${SB_URL}/rest/v1/harvests?select=*&order=harvest_date.desc&limit=5000`, { headers: HDR });
    const harvs = await harvR.json();
    if (harvs?.length) {
      const hKeys = Object.keys(harvs[0]);
      const hCsv = [hKeys.join(','), ...harvs.map(r =>
        hKeys.map(k => { const val=String(r[k]??'').replace(/"/g,'""'); return (val.includes(',')||val.includes('"')||val.includes('\n'))?'"'+val+'"':val; }).join(',')
      )].join('\n');
      zip.file(`data/harvests_${dateStr}.csv`, hCsv);
      log(`Harvests: ${harvs.length} rows saved`, true);
    }
    setProgress(57);

    // ── STEP 2d: Routes table ─────────────────────────────
    log('Fetching routes table...');
    const routesR = await fetch(`${SB_URL}/rest/v1/routes?select=*&order=created_at.desc&limit=500`, { headers: HDR });
    const routes = await routesR.json();
    if (routes?.length) {
      const rKeys = Object.keys(routes[0]);
      const rCsv = [rKeys.join(','), ...routes.map(r =>
        rKeys.map(k => { const val=String(r[k]??'').replace(/"/g,'""'); return (val.includes(',')||val.includes('"')||val.includes('\n'))?'"'+val+'"':val; }).join(',')
      )].join('\n');
      zip.file(`data/routes_${dateStr}.csv`, rCsv);
      log(`Routes: ${routes.length} rows saved`, true);
    }
    setProgress(60);

    // ── STEP 2e: Route Items table ────────────────────────
    log('Fetching route items...');
    const riR = await fetch(`${SB_URL}/rest/v1/route_items?select=*&order=id.asc&limit=5000`, { headers: HDR });
    const ris = await riR.json();
    if (ris?.length) {
      const riKeys = Object.keys(ris[0]);
      const riCsv = [riKeys.join(','), ...ris.map(r =>
        riKeys.map(k => { const val=String(r[k]??'').replace(/"/g,'""'); return (val.includes(',')||val.includes('"')||val.includes('\n'))?'"'+val+'"':val; }).join(',')
      )].join('\n');
      zip.file(`data/route_items_${dateStr}.csv`, riCsv);
      log(`Route items: ${ris.length} rows saved`, true);
    }
    setProgress(65);

    // ── STEP 2f: Remaining tables ────────────────────────
    const extraTables = [
      { name: 'skipped',      file: `data/skipped_${dateStr}.csv`,      limit: 10000 },
      { name: 'devices',      file: `data/devices_${dateStr}.csv`,       limit: 5000  },
      { name: 'admin_notes',  file: `data/admin_notes_${dateStr}.csv`,   limit: 2000  },
      { name: 'collections',  file: `data/collections_${dateStr}.csv`,   limit: 5000  },
      { name: 'route_vendos', file: `data/route_vendos_${dateStr}.csv`,  limit: 5000  },
    ];
    for (const tbl of extraTables) {
      try {
        log(`Fetching ${tbl.name}...`);
        const r = await fetch(`${SB_URL}/rest/v1/${tbl.name}?select=*&limit=${tbl.limit}`, { headers: HDR });
        const rows = await r.json();
        if (Array.isArray(rows) && rows.length) {
          const keys = Object.keys(rows[0]);
          const csv = [keys.join(','), ...rows.map(row =>
            keys.map(k => { const val=String(row[k]??'').replace(/"/g,'""'); return (val.includes(',')||val.includes('"')||val.includes('\n'))?'"'+val+'"':val; }).join(',')
          )].join('\n');
          zip.file(tbl.file, csv);
          log(`${tbl.name}: ${rows.length} rows saved`, true);
        } else {
          log(`${tbl.name}: empty or no data`, false);
        }
      } catch(e) { log(`⚠️ ${tbl.name}: ${e.message}`, false); }
    }
    setProgress(73);

    // ── STEP 3: Code files ───────────────────────────────
    log('Saving dashboard.html...');
    try {
      // Save current page HTML directly — no network needed
      const pageHtml = document.documentElement.outerHTML;
      zip.file('code/dashboard.html', pageHtml);
      log('dashboard.html saved', true);
    } catch(e) { log('⚠️ Could not save dashboard.html: ' + e.message, false); }

    // Try app.py from GitHub (skip gracefully if private/missing)
    log('Trying app.py from GitHub...');
    try {
      const apyR = await fetch('https://raw.githubusercontent.com/SpawnInternet/VendoMonitor-Cloud/main/app.py');
      if (apyR.ok) {
        zip.file('code/app.py', await apyR.text());
        log('app.py saved', true);
      } else {
        log('⚠️ app.py skipped — repo is private or not found', false);
      }
    } catch(e) { log('⚠️ app.py skipped: ' + e.message, false); }
    setProgress(75);

    // ── STEP 4: Backup info file ──────────────────────────
    const info = [
      `SPAWN INTERNETAN — VendoMonitor Backup`,
      `=====================================`,
      `Backup Date : ${timeStr}`,
      `Transactions: ${txns.length.toLocaleString()} rows`,
      `Vendos      : ${vs?.length || 0} active`,
      `Supabase URL: ${SB_URL}`,
      `Dashboard   : spawninternet.github.io/VendoMonitor/dashboard.html`,
      `Railway     : worker-production-43ce.up.railway.app`,
      ``,
      `FILES IN THIS BACKUP:`,
      `  data/transactions_${dateStr}.csv  — all transactions`,
      `  data/vendo_summary_${dateStr}.csv — vendo totals`,
      `  data/vendos_${dateStr}.csv        — vendos table (names, GPS, VLAN, etc.)`,
      `  data/harvests_${dateStr}.csv      — all harvest records`,
      `  data/routes_${dateStr}.csv        — all routes`,
      `  data/route_items_${dateStr}.csv   — route vendo assignments`,
      `  data/skipped_${dateStr}.csv        — skipped transactions`,
      `  data/devices_${dateStr}.csv        — devices table`,
      `  data/admin_notes_${dateStr}.csv    — admin notes`,
      `  data/collections_${dateStr}.csv    — collections table`,
      `  data/route_vendos_${dateStr}.csv   — route vendos table`,
      `  code/app.py                       — Railway Telethon listener`,
      `  code/dashboard.html               — web dashboard`,
      `  backup_info.txt                   — this file`,
    ].join('\n');
    zip.file('backup_info.txt', info);
    setProgress(85);

    // ── STEP 5: Generate ZIP ──────────────────────────────
    log('Building ZIP file...');
    const blob = await zip.generateAsync({type:'blob', compression:'DEFLATE', compressionOptions:{level:6}},
      (meta) => setProgress(85 + meta.percent * 0.1)
    );
    setProgress(95);

    // ── STEP 6: Download ──────────────────────────────────
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SpawnInternetan_Backup_${dateStr}.zip`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setProgress(100);
    log(`ZIP downloaded: SpawnInternetan_Backup_${dateStr}.zip`, true);

    // ── STEP 7: Open Google Drive ─────────────────────────
    stepsEl.innerHTML += `
      <div style="margin-top:12px;padding:10px;background:#e0f2fe;border:1px solid #0284c7;border-radius:7px;">
        <div style="font-size:12px;font-weight:700;color:#0369a1;margin-bottom:6px;">📁 Upload to Google Drive</div>
        <div style="font-size:11px;color:#0369a1;margin-bottom:8px;">Your ZIP is downloaded. Drag and drop it into Google Drive:</div>
        <a href="https://drive.google.com/drive/my-drive" target="_blank"
          style="display:inline-block;padding:7px 16px;background:#0369a1;color:#fff;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">
          📂 Open Google Drive →
        </a>
      </div>`;

    // Save backup record
    const now = new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:true});
    localStorage.setItem('last_backup', `${now} — ${txns.length.toLocaleString()} rows`);

  } catch(e) {
    stepsEl.innerHTML += `<div style="color:#dc2626;">❌ Backup error: ${e.message}</div>`;
    console.error('Backup error:', e);
  }
}

