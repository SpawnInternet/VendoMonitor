// ── OFFICE ACCOUNTS ─────────────────────────────────────────
async function oaLoad() {
  try {
    const accounts = await sb('office_accounts', 'select=id,name,pin,role,active&order=name.asc', 50);
    oaRenderList(accounts);
  } catch(e) {
    document.getElementById('oa-list').innerHTML = '<div style="padding:12px 16px;color:#dc2626;font-size:13px;">Error: '+e.message+'</div>';
  }
}

function oaRenderList(accounts) {
  const el = document.getElementById('oa-list');
  if(!accounts||!accounts.length){el.innerHTML='<div style="padding:12px 16px;text-align:center;color:#9ca3af;font-size:13px;">No office accounts found</div>';return;}
  el.innerHTML = accounts.map(a=>`
    <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #f3f4f6;">
      <div style="width:36px;height:36px;background:${a.active?'#dcfce7':'#f3f4f6'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:${a.active?'#15803d':'#9ca3af'};">${(a.name||'?').substring(0,2).toUpperCase()}</div>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;color:#1e293b;">${a.name}</div>
        <div style="font-size:11px;color:#6b7280;">
          ${a.role||'Staff'} · PIN: <span id="oa-pin-val-${a.id}">●●●●</span>
          <button onclick="var s=document.getElementById('oa-pin-val-${a.id}');s.textContent=s.textContent==='${a.pin||'????'}'?'●●●●':'${a.pin||'????'}'" 
            style="border:none;background:none;cursor:pointer;padding:0 3px;font-size:12px;" title="Show/hide PIN">👁</button>
        </div>
      </div>
      <span style="background:${a.active?'#dcfce7':'#f3f4f6'};color:${a.active?'#15803d':'#6b7280'};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;">${a.active?'Active':'Inactive'}</span>
      <button onclick="oaChangePin(${a.id},'${(a.name||'').replace(/'/g,"\'")}','${a.pin||''}','${a.role||'Staff'}')" style="height:28px;padding:0 10px;border:1px solid #d1d5db;border-radius:6px;font-size:11px;cursor:pointer;background:white;color:#374151;">Edit</button>
      <button onclick="oaRemove(${a.id},'${(a.name||'').replace(/'/g,"\'")}','${a.active}')" style="height:28px;padding:0 10px;border:1px solid #fca5a5;border-radius:6px;font-size:11px;cursor:pointer;background:white;color:#dc2626;">${a.active?'Remove':'Restore'}</button>
    </div>`).join('');
}

function oaShowAdd() {
  document.getElementById('oa-add-form').style.display = 'block';
  document.getElementById('oa-new-name').focus();
}

async function oaSaveNew() {
  const name = document.getElementById('oa-new-name').value.trim();
  const pin  = document.getElementById('oa-new-pin').value.trim();
  const role = document.getElementById('oa-new-role').value.trim() || 'Staff';
  const pw   = document.getElementById('oa-new-pw').value.trim();
  if(pw!=='101510'){toast('Wrong admin password');return;}
  if(!name){toast('Name required');return;}
  if(pin&&(pin.length!==4||isNaN(pin))){toast('PIN must be 4 digits');return;}
  try{
    const r=await fetch(SB_URL+'/rest/v1/office_accounts',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({name,pin:pin||'0000',role,active:true})});
    if(r.ok){document.getElementById('oa-add-form').style.display='none';['oa-new-name','oa-new-pin','oa-new-role','oa-new-pw'].forEach(id=>{document.getElementById(id).value='';});toast('Office account added!');oaLoad();}
    else toast('Save failed');
  }catch(e){toast('Error: '+e.message);}
}

async function oaChangePin(id, name, currentPin, currentRole) {
  const pw = prompt('Admin password:');
  if(pw!=='101510'){toast('Wrong password');return;}
  const newPin = prompt('New PIN for '+name+' (4 digits):\nCurrent: '+currentPin);
  if(newPin===null) return;
  if(!newPin||newPin.length!==4||isNaN(newPin)){toast('PIN must be 4 digits');return;}
  try{
    const r=await fetch(SB_URL+'/rest/v1/office_accounts?id=eq.'+id,{method:'PATCH',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({pin:newPin,updated_at:new Date().toISOString()})});
    if(r.ok){toast('PIN updated for '+name);oaLoad();}
    else toast('Update failed');
  }catch(e){toast('Error: '+e.message);}
}

async function oaRemove(id, name, isActive) {
  const pw = prompt('Admin password to '+(isActive==='true'?'remove':'restore')+' '+name+':');
  if(pw!=='101510'){toast('Wrong password');return;}
  try{
    const r=await fetch(SB_URL+'/rest/v1/office_accounts?id=eq.'+id,{method:'PATCH',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({active:isActive!=='true',updated_at:new Date().toISOString()})});
    if(r.ok){toast(name+' '+(isActive==='true'?'deactivated':'restored'));oaLoad();}
    else toast('Update failed');
  }catch(e){toast('Error: '+e.message);}
}


// ── RESTORED: rcMode + rcSetMode (lost in 824a commit) ──
let rcMode = 'recent';

function rcSetMode(mode){
  rcMode = mode;
  const isRecent = mode==='recent';
  const rp = document.getElementById('rc-panel-recent');
  const hp = document.getElementById('rc-panel-history');
  if(rp) rp.style.display = isRecent?'':'none';
  if(hp) hp.style.display = isRecent?'none':'';
  const br = document.getElementById('rc-mode-recent');
  const bh = document.getElementById('rc-mode-history');
  if(br){ br.style.borderBottomColor=isRecent?'#1565c0':'transparent'; br.style.color=isRecent?'#1565c0':'#6b7280'; }
  if(bh){ bh.style.borderBottomColor=isRecent?'transparent':'#1565c0'; bh.style.color=isRecent?'#6b7280':'#1565c0'; }
  if(mode==='history') rcLoadHistory();
}

async function rcLoadHistory(){
  const el = document.getElementById('rc-history-list');
  if(!el) return;
  el.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;">Loading…</div>';
  try {
    const r = await fetch(`${_SB}/rest/v1/harvests?select=harvest_date,sheet_name,collector,coins_total,tg_income,recon_gap,recon_flag&order=harvest_date.desc&limit=1000`,{headers:_HDR});
    const rows = await r.json();
    const byDate = {};
    rows.forEach(h=>{
      const d = h.harvest_date;
      if(!byDate[d]) byDate[d]={date:d,count:0,coins:0,tg:0,gap:0,collectors:new Set(),alerts:0,warns:0,nodata:0};
      byDate[d].count++;
      byDate[d].coins+=Number(h.coins_total||0);
      byDate[d].tg+=Number(h.tg_income||0);
      byDate[d].gap+=Number(h.recon_gap||0);
      byDate[d].collectors.add(h.collector||'?');
      if(h.recon_flag==='alert') byDate[d].alerts++;
      else if(h.recon_flag==='warn') byDate[d].warns++;
      else if(!h.tg_income) byDate[d].nodata++;
    });
    const dates = Object.values(byDate).sort((a,b)=>b.date.localeCompare(a.date));
    if(!dates.length){el.innerHTML='<div style="padding:20px;text-align:center;color:#6b7280;">No harvest dates found</div>';return;}
    el.innerHTML = dates.map(d=>{
      const flagColor = d.alerts>0?'#dc2626':d.warns>0?'#d97706':'#15803d';
      const flagLabel = d.alerts>0?`🔴 ${d.alerts} alerts`:d.warns>0?`🟡 ${d.warns} warnings`:'✅ OK';
      return `<div onclick="document.getElementById('rc-from').value='${d.date}';document.getElementById('rc-to').value='${d.date}';rcSetMode('recent');rcRun();"
        style="padding:12px 16px;border-bottom:1px solid #f3f4f6;cursor:pointer;display:flex;align-items:center;gap:12px;"
        onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background=''">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:#1e293b;">${d.date}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">${d.count} vendos · ${[...d.collectors].join(', ')}</div>
        </div>
        <div style="text-align:right;font-size:12px;color:${flagColor};font-weight:600;">${flagLabel}</div>
      </div>`;
    }).join('');
  } catch(e){
    el.innerHTML=`<div style="padding:20px;text-align:center;color:#dc2626;">Error: ${e.message}</div>`;
  }
}

// ── RESTORED: Names Match functions (lost in 824a commit) ──
let _nmRows = [];
let _nmFilter = 'all';

async function nmLoad(){
  document.getElementById('nm-tbody').innerHTML = '<tr><td colspan="5" style="padding:30px;text-align:center;color:#6b7280;">Loading…</td></tr>';
  try {
    let all = [], off = 0;
    while(true){
      const r = await fetch(`${_SB}/rest/v1/vendos?sheet_name=not.is.null&select=id,sheet_name,tg_name,status,pulled_out_at,area,vlan,tg_match_confirmed&order=sheet_name.asc&limit=1000&offset=${off}`,{headers:_HDR});
      const batch = await r.json();
      if(!Array.isArray(batch)||!batch.length) break;
      all.push(...batch);
      if(batch.length<1000) break;
      off+=1000;
    }
    _nmRows = all;
    const matched = all.filter(v=>v.tg_name).length;
    const unmatched = all.length - matched;
    const statsEl = document.getElementById('nm-stats');
    if(statsEl) statsEl.innerHTML =
      `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 14px;font-size:12px;"><span style="font-weight:700;color:#15803d;font-size:16px;">${matched}</span> <span style="color:#6b7280;">matched</span></div>`+
      `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 14px;font-size:12px;"><span style="font-weight:700;color:#b45309;font-size:16px;">${unmatched}</span> <span style="color:#6b7280;">unmatched</span></div>`+
      `<div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:8px;padding:8px 14px;font-size:12px;"><span style="font-weight:700;color:#1565c0;font-size:16px;">${all.length}</span> <span style="color:#6b7280;">total</span></div>`;
    nmRender();
  } catch(e){
    document.getElementById('nm-tbody').innerHTML = `<tr><td colspan="5" style="padding:20px;text-align:center;color:#dc2626;">Error: ${e.message}</td></tr>`;
  }
}

function nmSetFilter(f){
  _nmFilter = f;
  ['all','matched','unmatched'].forEach(x=>{
    const btn = document.getElementById('nm-filter-'+x);
    if(!btn) return;
    const active = x===f;
    btn.style.background = active?'#1565c0':'#fff';
    btn.style.color = active?'#fff':'#6b7280';
    btn.style.borderColor = active?'#1565c0':'#e5e7eb';
  });
  nmRender();
}

function nmRender(){
  const q = (document.getElementById('nm-search')?.value||'').toLowerCase().trim();
  let rows = _nmRows;
  if(_nmFilter==='matched') rows = rows.filter(v=>v.tg_name);
  if(_nmFilter==='unmatched') rows = rows.filter(v=>!v.tg_name);
  if(q) rows = rows.filter(v=>(v.sheet_name||'').toLowerCase().includes(q)||(v.tg_name||'').toLowerCase().includes(q)||(v.area||'').toLowerCase().includes(q));
  const countEl = document.getElementById('nm-count');
  if(countEl) countEl.textContent = rows.length + ' vendos';
  if(!rows.length){
    document.getElementById('nm-tbody').innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:#6b7280;">No results</td></tr>';
    return;
  }
  document.getElementById('nm-tbody').innerHTML = rows.map(v=>{
    const matched = !!v.tg_name;
    const statusBadge = matched
      ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;">✅ Matched</span>'
      : '<span style="background:#fef9c3;color:#b45309;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;">⚠ Unmatched</span>';
    const tgDisplay = v.tg_name
      ? `<span style="color:#15803d;font-size:11px;">${v.tg_name}</span>`
      : `<span style="color:#d1d5db;font-style:italic;font-size:11px;">Not linked</span>`;
    return `<tr style="border-bottom:1px solid #f3f4f6;" onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background=''">
      <td style="padding:8px 12px;font-weight:600;color:#1e293b;">${v.sheet_name}</td>
      <td style="padding:8px 12px;" id="nm-tgcell-${v.id}">
        <div style="display:flex;align-items:center;gap:6px;">
          ${tgDisplay}
          <button onclick="nmEditRow(${v.id})" style="padding:2px 8px;border-radius:5px;border:1px solid #e5e7eb;background:#fff;font-size:10px;cursor:pointer;color:#6b7280;flex-shrink:0;">✏️</button>
        </div>
      </td>
      <td style="padding:8px 12px;color:#6b7280;font-size:11px;">${v.area||'—'}</td>
      <td style="padding:8px 12px;text-align:center;">${statusBadge}</td>
      <td style="padding:8px 12px;text-align:center;">
        ${matched?`<button onclick="nmUnlink(${v.id})" style="padding:2px 8px;border-radius:5px;border:1px solid #fee2e2;background:#fff;font-size:10px;cursor:pointer;color:#dc2626;">Unlink</button>`:''}
      </td>
    </tr>`;
  }).join('');
}

function nmEditRow(id){
  const cell = document.getElementById('nm-tgcell-'+id);
  if(!cell) return;
  const v = _nmRows.find(r=>r.id===id);
  if(!v) return;
  cell.innerHTML = `<div style="position:relative;display:flex;gap:4px;align-items:center;">
    <div style="position:relative;flex:1;">
      <input id="nm-inp-${id}" value="${(v.tg_name||'').replace(/"/g,'&quot;')}" placeholder="Search TG name…"
        oninput="nmTgSearch(${id},this.value)"
        style="width:100%;padding:4px 8px;border:1px solid #1565c0;border-radius:6px;font-size:11px;font-family:inherit;">
      <div id="nm-dd-${id}" style="display:none;position:absolute;top:30px;left:0;right:0;background:#fff;border:1px solid #1565c0;border-radius:6px;max-height:150px;overflow-y:auto;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,.1);"></div>
    </div>
    <button onclick="nmSaveRow(${id})" style="padding:3px 8px;border-radius:5px;border:none;background:#15803d;color:#fff;font-size:10px;cursor:pointer;font-weight:700;flex-shrink:0;">Save</button>
    <button onclick="nmRender()" style="padding:3px 8px;border-radius:5px;border:1px solid #e5e7eb;background:#fff;font-size:10px;cursor:pointer;flex-shrink:0;">✕</button>
  </div>`;
  document.getElementById('nm-inp-'+id)?.focus();
}

async function nmTgSearch(id, q){
  const dd = document.getElementById('nm-dd-'+id);
  if(!dd) return;
  q = (q||'').trim();
  if(!q){dd.style.display='none';return;}
  dd.style.display='';
  dd.innerHTML='<div style="padding:6px 8px;color:#6b7280;font-size:11px;">Searching…</div>';
  try{
    const r = await fetch(`${_SB}/rest/v1/vendos?tg_name=ilike.*${encodeURIComponent(q)}*&select=id,tg_name,sheet_name,area&limit=15&order=tg_name.asc`,{headers:_HDR});
    const rows = await r.json();
    window._nmDdResults = window._nmDdResults||{};
    window._nmDdResults[id] = rows;
    if(!rows.length){dd.innerHTML='<div style="padding:6px 8px;color:#6b7280;font-size:11px;">No matches</div>';return;}
    dd.innerHTML = rows.map((row,i)=>`
      <div onclick="nmTgPick(${id},${i})" style="padding:6px 10px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:11px;"
        onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background=''">
        <div style="font-weight:600;">${row.tg_name}</div>
        <div style="font-size:10px;color:#6b7280;">${row.sheet_name||''} · ${row.area||''}</div>
      </div>`).join('');
  }catch(e){dd.innerHTML='<div style="padding:6px 8px;color:#dc2626;font-size:11px;">Error</div>';}
}

function nmTgPick(id, i){
  const row = (window._nmDdResults||{})[id]?.[i];
  if(!row) return;
  const inp = document.getElementById('nm-inp-'+id);
  if(inp) inp.value = row.tg_name;
  const dd = document.getElementById('nm-dd-'+id);
  if(dd) dd.style.display='none';
}

async function nmSaveRow(id){
  const inp = document.getElementById('nm-inp-'+id);
  if(!inp) return;
  const tgName = inp.value.trim();
  const pw = prompt('Admin password:');
  if(pw!=='101510'){toast('Wrong password');return;}
  try{
    const r = await fetch(`${_SB}/rest/v1/vendos?id=eq.${id}`,{
      method:'PATCH',
      headers:{..._HDR,'Prefer':'return=minimal'},
      body: JSON.stringify({tg_name:tgName||null, tg_match_confirmed:!!tgName})
    });
    if(r.ok){
      const v = _nmRows.find(r=>r.id===id);
      if(v) v.tg_name = tgName||null;
      toast('✅ Saved!');
      nmRender();
    } else toast('Save failed');
  }catch(e){toast('Error: '+e.message);}
}

async function nmUnlink(id){
  if(!confirm('Remove TG link for this vendo?')) return;
  const pw = prompt('Admin password:');
  if(pw!=='101510'){toast('Wrong password');return;}
  try{
    const r = await fetch(`${_SB}/rest/v1/vendos?id=eq.${id}`,{
      method:'PATCH',
      headers:{..._HDR,'Prefer':'return=minimal'},
      body: JSON.stringify({tg_name:null, tg_match_confirmed:false})
    });
    if(r.ok){
      const v = _nmRows.find(r=>r.id===id);
      if(v) v.tg_name = null;
      toast('Unlinked');
      nmRender();
    } else toast('Unlink failed');
  }catch(e){toast('Error: '+e.message);}
}

