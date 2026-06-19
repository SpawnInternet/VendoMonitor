// ── VENDO POPUP — delegate to existing vendo profile ───────────────
function htShowVendoFromRow(tr) {
  const id   = tr.dataset.id;
  const name = tr.dataset.tg;
  const area = tr.dataset.area;
  htShowVendoById(id, name, area);
}

async function htShowVendoById(id, name, area) {
  let modal = document.getElementById('vp-modal');
  if (!modal) {
    // Create modal if not exists (same as htShowVendoProfile)
    htShowVendoProfile(name, area);
    return;
  }
  modal.style.display='flex';
  window._vpName=name; window._vpArea=area; window._vpEditMode=false; window._vpVendo=null; window._vpHarvests=null;
  document.getElementById('vp-title').textContent=name||'—';
  document.getElementById('vp-sub').textContent=area||'';
  document.getElementById('vp-edit-btn').textContent='Edit';
  document.getElementById('vp-body').innerHTML='<div style="padding:30px;text-align:center;color:#6b7280;font-size:13px;">Loading...</div>';
  // Activate Names tab by default
  document.querySelectorAll('.vp-tab').forEach(t=>{t.style.borderBottomColor='transparent';t.style.color='#6b7280';t.style.fontWeight='';});
  const namesBtn = document.getElementById('vp-tab-names');
  if(namesBtn){namesBtn.style.borderBottomColor='#1565c0';namesBtn.style.color='#1565c0';namesBtn.style.fontWeight='600';}
  try {
    // Look up by id (most reliable)
    const [vr, hr] = await Promise.all([
      id ? sb('vendos','id=eq.'+id+'&select=id,sheet_name,owner_name,tg_name,area,vlan,address,contact_number,lat,lng,last_harvest_date,date_installed,installer,status,admin_notes,harvest_interval_days',1)
         : sb('vendos','sheet_name=eq.'+encodeURIComponent(name)+'&select=id,sheet_name,owner_name,tg_name,area,vlan,address,contact_number,lat,lng,last_harvest_date,date_installed,installer,status,admin_notes,harvest_interval_days',1),
      sb('harvests','sheet_name=eq.'+encodeURIComponent(name)+'&select=harvest_date,coins_total,coins_free,coins_saloy,coins_old,net_collectible,spawn_share,customer_share,collector,source&order=harvest_date.desc',500)
    ]);
    window._vpVendo=vr[0]||null; window._vpHarvests=hr||[];
    vpRenderNames();
  } catch(e){document.getElementById('vp-body').innerHTML='<div style="padding:20px;text-align:center;color:#dc2626;">Error: '+e.message+'</div>';}
}


// ── HARVEST DETAIL POPUP ──────────────────────────────────────────
function lfShowDetail(idx) {
  const item = lfItems[idx];
  if (!item) return;
  const modal = document.getElementById('hd-modal');
  document.getElementById('hd-name').textContent = item.sheet_name||'(unmatched)';
  document.getElementById('hd-sub').textContent = (item.area||'') + (item.harvest_date?' · '+item.harvest_date:'') + (item.collector?' · '+item.collector:'');
  const rows = [
    ['Collector', item.collector||'—'],
    ['Area', item.area||'—'],
    ['Harvest Date', item.harvest_date||'—'],
    ['TG Name', item.tg_name||'—'],
    ['Coins Total', item.coins_total!=null?_php(item.coins_total):'—'],
    ['Free', item.coins_free!=null?_php(item.coins_free):'—'],
    ['Saloy', item.coins_saloy!=null?_php(item.coins_saloy):'—'],
    ['Old', item.coins_old!=null?_php(item.coins_old):'—'],
    ['Net Collectible', item.net_collectible!=null?'<b>'+_php(item.net_collectible)+'</b>':'—'],
    ['Spawn Share (75%)', item.spawn_share!=null?'<b style="color:#15803d;font-size:15px;">'+_php(item.spawn_share)+'</b>':'—'],
    ['Owner Share (25%)', item.customer_share!=null?_php(item.customer_share):'—'],
    ['Note', item.collector_note||'—'],
  ];
  let body = '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
  rows.forEach(([l,v])=>{
    body+=`<tr><td style="padding:7px 8px;color:#6b7280;font-size:11px;font-weight:500;width:140px;border-bottom:1px solid #f3f4f6;">${l}</td><td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;">${v}</td></tr>`;
  });
  body+='</table>';
  if(item.photo_url){
    body+=`<div style="margin-top:12px;text-align:center;"><img src="${item.photo_url}" style="max-width:100%;border-radius:10px;border:1px solid #e5e7eb;" onerror="this.style.display='none'"></div>`;
  }
  document.getElementById('hd-body').innerHTML = body;
  modal.style.display = 'flex';
}
// close modal on backdrop click
document.getElementById('hd-modal')?.addEventListener('click', function(e){ if(e.target===this) this.style.display='none'; });

// ── COLLECTOR PERFORMANCE ─────────────────────────────────────────
async function perfLoad() {
  const el = document.getElementById('perf-content');
  el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--mu);">Loading…</div>';
  try {
    const monthSel = document.getElementById('perf-month')?.value||'';
    let perfUrl = `${_SB}/rest/v1/harvests?select=collector,net_collectible,spawn_share,coins_total,harvest_date,area,sheet_name,tg_name&order=harvest_date.desc&limit=1000`;
    if(monthSel){
      // Get first and last day of selected month properly
      const [yr,mo] = monthSel.split('-').map(Number);
      const firstDay = `${yr}-${String(mo).padStart(2,'0')}-01`;
      const lastDay = new Date(yr,mo,0).toISOString().slice(0,10); // last day of month
      perfUrl += `&harvest_date=gte.${firstDay}&harvest_date=lte.${lastDay}`;
    }
    const r = await fetch(perfUrl, {headers: _HDR});
    const rows = await r.json();
    if (!Array.isArray(rows)||!rows.length) { el.innerHTML='<div style="padding:20px;text-align:center;color:var(--mu);">No data for this period.</div>'; return; }

    // Group by collector
    const byCol = {};
    rows.forEach(r => {
      const c = r.collector||'Unknown';
      if (!byCol[c]) byCol[c] = { count:0, net:0, spawn:0, coins:0, dates:new Set() };
      byCol[c].count++;
      byCol[c].net   += parseFloat(r.net_collectible||0);
      byCol[c].spawn += parseFloat(r.spawn_share||0);
      byCol[c].coins += parseFloat(r.coins_total||0);
      byCol[c].dates.add(r.harvest_date);
    });

    // Sort by spawn share desc
    const sorted = Object.entries(byCol).sort((a,b)=>b[1].spawn-a[1].spawn);
    const medals = ['🥇','🥈','🥉'];

    el.innerHTML = `
      <div style="margin-bottom:12px;font-size:11px;color:var(--mu);">Based on all ${rows.length} harvest records · ranked by Spawn Share</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;">
        ${sorted.map(([name,s],i)=>{
          const days = s.dates.size;
          const avg = days ? (s.spawn/s.count).toFixed(0) : 0;
          const medal = medals[i]||'';
          // Build harvest rows for breakdown
          const harvestRows = rows.filter(r=>r.collector===name).sort((a,b)=>b.harvest_date.localeCompare(a.harvest_date));
          const breakdownId = 'perf-bd-'+name.replace(/[^a-z0-9]/gi,'_');
          const harvestHtml = harvestRows.map(h=>`
            <div style="display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid #f3f4f6;font-size:11px;">
              <span style="color:#475569;">${h.harvest_date}</span>
              <span style="color:#6b7280;">${h.sheet_name||h.tg_name||'—'}</span>
              <span style="color:#475569;">${h.area||'—'}</span>
              <span style="font-weight:600;color:#15803d;">${_php(h.spawn_share)}</span>
            </div>`).join('');
          return `<div style="background:#fff;border:1px solid var(--bd);border-radius:12px;padding:14px 16px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <div style="font-size:22px;">${medal||'🏅'}</div>
              <div>
                <div style="font-weight:700;font-size:14px;">${name}</div>
                <div style="font-size:10px;color:var(--mu);">${s.count} harvests · ${days} days active</div>
              </div>
              <div style="margin-left:auto;text-align:right;">
                <div style="font-size:16px;font-weight:700;color:#15803d;">${_php(s.spawn)}</div>
                <div style="font-size:9px;color:var(--mu);">total spawn</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:11px;margin-bottom:10px;">
              <div style="background:#f0fdf4;border-radius:6px;padding:6px 8px;">
                <div style="font-weight:700;color:#15803d;">${_php(s.net)}</div>
                <div style="color:var(--mu);font-size:9px;">Total net</div>
              </div>
              <div style="background:#eff6ff;border-radius:6px;padding:6px 8px;">
                <div style="font-weight:700;color:#1565c0;">${_php(s.coins)}</div>
                <div style="color:var(--mu);font-size:9px;">Total coins</div>
              </div>
              <div style="background:#f5f3ff;border-radius:6px;padding:6px 8px;">
                <div style="font-weight:700;color:#7c3aed;">${_php(avg)}</div>
                <div style="color:var(--mu);font-size:9px;">Avg per harvest</div>
              </div>
            </div>
            <button onclick="perfShowPopup('${breakdownId}')"
              style="width:100%;padding:5px;border:1px solid #e5e7eb;border-radius:6px;background:#f8faff;font-size:11px;cursor:pointer;color:#1565c0;">
              📋 View ${harvestRows.length} harvests
            </button>
            <div id="${breakdownId}" style="display:none;">${harvestHtml}</div>
          </div>`;
        }).join('')}
      </div>`;
  } catch(e) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:#dc2626;">Error: '+e.message+'</div>';
  }
}

// ── FIX hvNewTab to include perf ─────────────────────────────────
// DASHBOARD SEARCH
// ══════════════════════════════════════════════════════════
let _dashSearchTimer = null;
async function dashSearch(q) {
  clearTimeout(_dashSearchTimer);
  const area = document.getElementById('dash-area-filter')?.value || '';
  const el = document.getElementById('dash-search-results');
  q = (q || '').trim();
  if (!q && !area) { el.style.display = 'none'; el.innerHTML = ''; return; }
  _dashSearchTimer = setTimeout(async () => {
    el.style.display = '';
    el.innerHTML = '<div style="padding:10px 14px;color:var(--mu);font-size:12px;">Searching…</div>';
    try {
      let params = `select=id,sheet_name,tg_name,owner_name,area,vlan,last_harvest_date&limit=30&order=last_harvest_date.desc.nullslast`;
      const filters = [];
      if (area) filters.push(`area=eq.${encodeURIComponent(area)}`);
      if (q) filters.push(`or=(sheet_name.ilike.*${encodeURIComponent(q)}*,tg_name.ilike.*${encodeURIComponent(q)}*,owner_name.ilike.*${encodeURIComponent(q)}*)`);
      if (filters.length) params = filters.join('&') + '&' + params;
      const r = await fetch(`${_SB}/rest/v1/vendos?${params}`, { headers: _HDR });
      const rows = await r.json();
      if (!rows.length) {
        el.innerHTML = '<div style="padding:12px 14px;color:var(--mu);font-size:12px;">No vendos found.</div>';
        return;
      }
      el.innerHTML = rows.map(v => {
        const days = v.last_harvest_date ? Math.floor((Date.now() - new Date(v.last_harvest_date)) / 86400000) : null;
        const daysStr = days === null ? '<span style="color:#9ca3af">Never</span>'
          : days > 30 ? `<span style="color:#dc2626;font-weight:700">${days}d ago</span>`
          : `<span style="color:#15803d">${days}d ago</span>`;
        return `<div onclick="showVendoFromDash(${JSON.stringify(v.sheet_name||v.tg_name||'').replace(/</g,'&lt;')},${JSON.stringify(v.area||'')})"
          style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #f3f4f6;cursor:pointer;transition:background .1s"
          onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background=''">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.sheet_name||v.tg_name||'—'}</div>
            <div style="font-size:10px;color:var(--mu);margin-top:1px">${v.owner_name||''} ${v.area?'· '+v.area:''} ${v.vlan?'· VLAN '+v.vlan:''}</div>
          </div>
          <div style="font-size:10px;text-align:right">${daysStr}</div>
        </div>`;
      }).join('');
    } catch(e) {
      el.innerHTML = '<div style="padding:10px 14px;color:#dc2626;font-size:12px;">Search failed.</div>';
    }
  }, 300);
}
function showVendoFromDash(name, area) {
  document.getElementById('dash-search-results').style.display = 'none';
  // Switch to vendos tab and show profile
  showP('vendos', document.querySelector('.nav-bar button:nth-child(2)'));
  setTimeout(() => {
    const s = document.getElementById('v-search');
    if (s) { s.value = name; filterVendos(); }
  }, 200);
}
// Close search on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#dash-search') && !e.target.closest('#dash-search-results') && !e.target.closest('#dash-area-filter')) {
    const el = document.getElementById('dash-search-results');
    if (el) el.style.display = 'none';
  }
});

// DASHBOARD
// ══════════════════════════════════════════════════════════

// ── DEVICE APPROVALS ─────────────────────────────────────
async function daLoad() {
  const el = document.getElementById('da-list');
  if (!el) return;
  el.innerHTML = '<div style="color:#6b7280;font-size:12px;text-align:center;padding:10px;">Loading…</div>';
  try {
    const rows = await sb('device_approvals', 'select=id,device_id,device_name,browser,status,requested_at,approved_at,approved_by&order=requested_at.desc', 100);
    if (!rows || !rows.length) {
      el.innerHTML = '<div style="padding:12px;color:#6b7280;font-size:12px;text-align:center;">No pending device approvals</div>';
      return;
    }
    const pending = rows.filter(r => r.status === 'pending');
    const others  = rows.filter(r => r.status !== 'pending');
    const renderRow = r => {
      const isPending = r.status === 'pending';
      const dt = r.requested_at ? new Date(r.requested_at).toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #f3f4f6;flex-wrap:wrap;">
        <div style="flex:1;min-width:180px;">
          <div style="font-size:13px;font-weight:600;color:#1e293b;">${r.device_name||'Unknown Device'}</div>
          <div style="font-size:10px;color:#9ca3af;margin-top:2px;">${(r.device_id||'').slice(0,20)}… · ${r.browser||'—'}</div>
          <div style="font-size:10px;color:#9ca3af;">${dt}</div>
        </div>
        <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${isPending?'#fef9c3':r.status==='approved'?'#dcfce7':'#fee2e2'};color:${isPending?'#92400e':r.status==='approved'?'#15803d':'#dc2626'};">${r.status.toUpperCase()}</span>
        ${isPending ? `
          <button onclick="daApprove(${r.id},'${(r.device_id||'').replace(/'/g,"\\'")}')" style="height:28px;padding:0 12px;background:#15803d;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">✓ Approve</button>
          <button onclick="daDeny(${r.id})" style="height:28px;padding:0 10px;border:1px solid #fca5a5;border-radius:6px;font-size:12px;cursor:pointer;background:white;color:#dc2626;">✕ Deny</button>
        ` : `<button onclick="daDelete(${r.id})" style="height:28px;padding:0 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:11px;cursor:pointer;background:white;color:#6b7280;">Remove</button>`}
      </div>`;
    };
    el.innerHTML = (pending.length ? `<div style="padding:6px 14px;background:#fef9c3;font-size:11px;font-weight:700;color:#92400e;">⏳ ${pending.length} pending</div>` + pending.map(renderRow).join('') : '') +
      (others.length ? `<div style="padding:6px 14px;background:#f9fafb;font-size:11px;color:#6b7280;">History</div>` + others.map(renderRow).join('') : '');
  } catch(e) {
    el.innerHTML = '<div style="padding:12px;color:#dc2626;font-size:12px;">Error: ' + e.message + '</div>';
  }
}

async function daApprove(id, deviceId) {
  try {
    await fetch(`${SB_URL}/rest/v1/device_approvals?id=eq.${id}`, {
      method:'PATCH', headers:{...HDR,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({status:'approved',approved_at:new Date().toISOString(),approved_by:'admin'})
    });
    toast('✅ Device approved'); daLoad();
  } catch(e) { toast('Error: '+e.message); }
}

async function daDeny(id) {
  if(!confirm('Deny this device?')) return;
  try {
    await fetch(`${SB_URL}/rest/v1/device_approvals?id=eq.${id}`, {
      method:'PATCH', headers:{...HDR,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({status:'denied'})
    });
    toast('Device denied'); daLoad();
  } catch(e) { toast('Error: '+e.message); }
}

async function daDelete(id) {
  try {
    await fetch(`${SB_URL}/rest/v1/device_approvals?id=eq.${id}`, {
      method:'DELETE', headers:{...HDR,Prefer:'return=minimal'}
    });
    toast('Removed'); daLoad();
  } catch(e) { toast('Error: '+e.message); }
}

