
/* ══ HARVEST PANEL v8 — Harvest Table + Live Feed + Reconciliation ══ */
const DASH_VERSION = '2026-06-15-v1';
(function(){
  const saved = localStorage.getItem('dash_version');
  if(saved !== DASH_VERSION){
    Object.keys(localStorage).filter(k=>k.startsWith('spawn_')).forEach(k=>localStorage.removeItem(k));
    localStorage.setItem('dash_version', DASH_VERSION);
    if(saved) location.reload(true);
  }
})();

// Aliases — var to avoid redeclaration errors
var _SB  = "https://cviraqfhphhsonjmrtvu.supabase.co";
var _KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2aXJhcWZocGhoc29uam1ydHZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY5NjYxOSwiZXhwIjoyMDkxMjcyNjE5fQ.qLPX_TW2U6W51nbOiotRdjUoofXnoWHi3oNfcIDmsek";
var _HDR = {'apikey':_KEY,'Authorization':'Bearer '+_KEY,'Content-Type':'application/json'};

const _php = v => v==null?'—':'₱'+Math.round(Number(v)).toLocaleString();
const _fmt = ts => ts ? new Date(ts).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}) : '—';
const _fmtT = ts => ts ? new Date(ts).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true}) : '—';

let hvNewActiveTab = 'htable';

function hvNewTab(id, btn){
  document.querySelectorAll('#panel-harvest .hv-hvtab').forEach(b=>b.classList.remove('on'));
  ['htable','livefeed','recon','receipt','settings','perf','progress','names','ledger','gps','keys'].forEach(t=>{
    const el = document.getElementById('hvt-'+t);
    if(el) el.style.display = t===id ? 'block' : 'none';
  });
  // destroy leaflet map when leaving progress tab
  const pmap = document.getElementById('progress-map');
  if(id !== 'progress'){
    if(typeof _progressMap !== 'undefined' && _progressMap){ _progressMap.remove(); _progressMap = null; }
    if(pmap) pmap.innerHTML = '';
  }
  btn.classList.add('on');
  hvNewActiveTab = id;
  if(id==='htable'){ htLoad(); }
  if(id==='livefeed'){ lfConnect(); lfLoadToday(); lfSetMode('today'); }
  if(id==='recon'){ rcInitDates(); rcSetMode('recent'); setTimeout(rcRun, 50); }
  if(id==='receipt'){ rcptInit(); }
  if(id==='settings'){ csLoad(); daLoad(); oaLoad(); }
  if(id==='names'){ if(!_nmRows.length) nmLoad(); else nmRender(); }
  if(id==='progress'){ loadProgress(); }
  if(id==='ledger'){ elLoad(); }
  if(id==='gps'){ gpsTraceLoad(); }
  if(id==='keys'){ klLoad(); }
  if(id!=='progress'&&id!=='ledger'){ if(_progressMap){ _progressMap.remove(); _progressMap=null; } }
  if(id!=='gps'){ if(typeof _gpsMap!=='undefined'&&_gpsMap){ _gpsMap.remove(); _gpsMap=null; } }
}



async function vpTgSearch(q) {
  const el = document.getElementById('vp-tg-results');
  if (!el) return;
  q = (q || '').trim();
  if (!q) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = '<div style="padding:8px 10px;color:var(--mu);font-size:12px;">Searching…</div>';
  try {
    const r = await fetch(
      `${_SB}/rest/v1/vendos?tg_name=ilike.*${encodeURIComponent(q)}*&select=tg_name,sheet_name,area&limit=20&order=tg_name.asc`,
      {headers: _HDR}
    );
    const rows = await r.json();
    if (!rows.length) { el.innerHTML = '<div style="padding:8px 10px;color:var(--mu);font-size:12px;">No matches</div>'; return; }
    el.innerHTML = rows.map(v =>
      `<div onclick="vpTgSelect('${(v.tg_name||'').replace(/'/g,"\'")}')"
        style="padding:7px 10px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:12px;"
        onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background=''">
        <div style="font-weight:600">${v.tg_name}</div>
        <div style="font-size:10px;color:var(--mu)">${v.sheet_name||''} · ${v.area||''}</div>
      </div>`
    ).join('');
  } catch(e) {
    el.innerHTML = '<div style="padding:8px 10px;color:#dc2626;font-size:12px;">Search failed</div>';
  }
}
function vpTgSelect(tgName) {
  const inp = document.getElementById('vp-f-tg_name');
  const el = document.getElementById('vp-tg-results');
  if (inp) inp.value = tgName;
  if (el) el.style.display = 'none';
}
async function htShowVendoProfile(name, area) {
  let modal = document.getElementById('vp-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'vp-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = '<div id="vp-inner" style="background:#fff;border-radius:12px;width:100%;max-width:860px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.18);position:relative;">'
      +'<div style="padding:14px 18px;background:linear-gradient(135deg,#1565c0,#1976d2);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">'
      +'<div><div id="vp-title" style="font-size:16px;font-weight:700;color:#fff;"></div><div id="vp-sub" style="font-size:11px;color:rgba(255,255,255,.75);margin-top:2px;"></div></div>'
      +'<div style="display:flex;gap:8px;align-items:center;">'
      +'<button id="vp-edit-btn" onclick="vpToggleEdit()" style="height:30px;padding:0 12px;font-size:12px;border:1px solid rgba(255,255,255,.4);border-radius:6px;background:rgba(255,255,255,.15);cursor:pointer;color:#fff;">Edit</button>'
      +'<button onclick="document.getElementById(\'vp-modal\').style.display=\'none\'" style="background:none;border:none;font-size:20px;cursor:pointer;color:rgba(255,255,255,.8);line-height:1;">&#x2715;</button>'
      +'</div></div>'
      +'<div id="vp-tabs" style="display:flex;border-bottom:1px solid #e5e7eb;flex-shrink:0;background:#f8faff;">'
      +'<button class="vp-tab" onclick="vpTab(\'info\',this)" style="padding:8px 18px;font-size:12px;border:none;background:none;cursor:pointer;border-bottom:2px solid #1565c0;color:#1565c0;font-weight:600;">Info</button>'
      +'<button class="vp-tab" onclick="vpTab(\'ledger\',this)" style="padding:8px 18px;font-size:12px;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;color:#6b7280;">Ledger</button>'
      +'<button class="vp-tab" onclick="vpTab(\'recon\',this)" style="padding:8px 18px;font-size:12px;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;color:#6b7280;">Reconciliation</button>'
      +'<button class="vp-tab" onclick="vpTab(\'names\',this)" id="vp-tab-names" style="padding:8px 18px;font-size:12px;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;color:#6b7280;">🔗 Names</button>'
      +'</div>'
      +'<div id="vp-body" style="overflow-y:auto;flex:1;padding:16px;"></div>'
      +'</div>';
    modal.addEventListener('click', e => { if(e.target===modal) modal.style.display='none'; });
    document.body.appendChild(modal);
  }
  modal.style.display='flex';
  window._vpName=name; window._vpArea=area; window._vpEditMode=false; window._vpVendo=null; window._vpHarvests=null;
  document.getElementById('vp-title').textContent=name||'—';
  document.getElementById('vp-sub').textContent=area||'';
  document.getElementById('vp-edit-btn').textContent='Edit';
  document.getElementById('vp-body').innerHTML='<div style="padding:30px;text-align:center;color:#6b7280;font-size:13px;">Loading...</div>';
  document.querySelectorAll('.vp-tab').forEach((t,i)=>{t.style.borderBottomColor=i===0?'#1565c0':'transparent';t.style.color=i===0?'#1565c0':'#6b7280';t.style.fontWeight=i===0?'600':'';});
  try {
    const enc=encodeURIComponent(name);
    const [vr,hr]=await Promise.all([
      sb('vendos','sheet_name=eq.'+enc+'&select=id,sheet_name,owner_name,tg_name,area,vlan,address,contact_number,lat,lng,last_harvest_date,date_installed,installer,status,admin_notes,harvest_interval_days,photo_url',1),
      sb('harvests','sheet_name=eq.'+enc+'&select=id,harvest_date,harvest_window_start,coins_total,coins_free,coins_saloy,coins_old,net_collectible,spawn_share,customer_share,collector,source&order=harvest_date.desc',500)
    ]);
    window._vpVendo=vr[0]||null; window._vpHarvests=hr||[];
    vpRenderInfo();
  } catch(e){document.getElementById('vp-body').innerHTML='<div style="padding:20px;text-align:center;color:#dc2626;">Error: '+e.message+'</div>';}
}
function vpCancelPullout(){const ov=document.getElementById('vp-po-ov');if(ov)ov.remove();}
function vpTab(tab,btn){
  document.querySelectorAll('.vp-tab').forEach(t=>{t.style.borderBottomColor='transparent';t.style.color='#6b7280';t.style.fontWeight='';});
  btn.style.borderBottomColor='#1565c0';btn.style.color='#1565c0';btn.style.fontWeight='600';
  if(tab==='info')vpRenderInfo();else if(tab==='ledger')vpRenderLedger();else if(tab==='names')vpRenderNames();else vpRenderRecon();
}
function vpToggleEdit(){window._vpEditMode=!window._vpEditMode;document.getElementById('vp-edit-btn').textContent=window._vpEditMode?'Cancel':'Edit';vpRenderInfo();}
function _vf(label,value,key,edit){
  if(edit&&key)return '<div style="margin-bottom:10px;"><div style="font-size:11px;color:#374151;font-weight:500;margin-bottom:3px;">'+label+'</div><input id="vp-f-'+key+'" value="'+(value||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;')+'" style="width:100%;height:32px;padding:0 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;"></div>';
  return '<div style="margin-bottom:6px;display:flex;gap:8px;padding:5px 8px;border-radius:5px;background:#fff;border:0.5px solid #e5e7eb;"><div style="font-size:11px;color:#6b7280;width:110px;flex-shrink:0;padding-top:1px;font-weight:500;">'+label+'</div><div style="font-size:13px;color:#1e293b;flex:1;font-weight:500;">'+(value||'<span style="color:#d1d5db;">&#8212;</span>')+'</div></div>';
}
function vpRenderInfo(){
  const v=window._vpVendo,h=window._vpHarvests||[],edit=window._vpEditMode;
  const days=v&&v.last_harvest_date?Math.floor((Date.now()-new Date(v.last_harvest_date))/86400000):null;
  const dc=days===null?'#6b7280':days>46?'#dc2626':days>30?'#d97706':'#15803d';
  const tgB=v&&v.tg_name?'<span style="background:#dcfce7;color:#15803d;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:6px;">matched</span>':'<span style="background:#fef9c3;color:#b45309;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:6px;">unmatched</span>';
  const gpsL=v&&v.lat&&v.lng?'&nbsp;<a href="https://www.google.com/maps?q='+v.lat+','+v.lng+'" target="_blank" style="color:#1565c0;font-size:11px;">Maps &#x2197;</a>':'';
  // Profile photo block
  const photoUrl = v&&v.photo_url ? v.photo_url : '';
  const photoBlock = '<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;padding:12px;background:#f8faff;border-radius:10px;border:1px solid #e5e7eb;">'
    + (photoUrl
        ? '<img id="vp-photo-img" src="'+photoUrl+'" style="width:72px;height:72px;border-radius:10px;object-fit:cover;flex-shrink:0;border:1px solid #e5e7eb;cursor:zoom-in;" onclick="vpPhotoZoom(\''+photoUrl+'\')">'
        : '<div id="vp-photo-img" style="width:72px;height:72px;border-radius:10px;background:#eef2ff;display:flex;align-items:center;justify-content:center;font-size:30px;flex-shrink:0;border:1px solid #e5e7eb;">🏪</div>')
    + '<div style="flex:1;">'
    + '<div style="font-size:11px;color:#6b7280;font-weight:600;margin-bottom:6px;">📷 Vendo Photo</div>'
    + '<input type="file" id="vp-photo-file" accept="image/*" style="display:none;" onchange="vpUploadPhoto(this)">'
    + '<button onclick="document.getElementById(\'vp-photo-file\').click()" style="height:30px;padding:0 14px;background:#1565c0;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">'+(photoUrl?'Change Photo':'Upload Photo')+'</button>'
    + (photoUrl?'<button onclick="vpRemovePhoto()" style="height:30px;padding:0 12px;margin-left:6px;background:#fff;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Remove</button>':'')
    + '<span id="vp-photo-msg" style="margin-left:8px;font-size:11px;"></span>'
    + '</div></div>';
  let h1=photoBlock+'<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px;background:#f8faff;border-radius:8px;padding:14px;">';
  h1+='<div><div style="font-size:10px;font-weight:600;color:#374151;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;">Identity</div>';
  h1+=_vf('Store / Vendo name',v&&v.sheet_name,null,false);
  h1+=edit?_vf('Owner name',v&&v.owner_name,'owner_name',true):'<div style="margin-bottom:6px;display:flex;gap:8px;padding:5px 8px;border-radius:5px;background:#fff;border:0.5px solid #e5e7eb;"><div style="font-size:11px;color:#6b7280;width:110px;flex-shrink:0;padding-top:1px;font-weight:500;">Owner name</div><div style="font-size:13px;color:#1e293b;flex:1;font-weight:500;">'+(v&&v.owner_name||'<span style="color:#d1d5db;">&#8212;</span>')+'</div></div>';
  if(edit){
    h1+='<div style="margin-bottom:10px;"><div style="font-size:11px;color:#374151;font-weight:500;margin-bottom:3px;">TG name</div>'
      +'<div style="position:relative;">'
      +'<input id="vp-f-tg_name" value="'+(v&&v.tg_name||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;')+'" placeholder="Search TG name..." oninput="vpTgSearch(this.value)" style="width:100%;height:32px;padding:0 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;">'
      +'<div id="vp-tg-results" style="display:none;position:absolute;top:34px;left:0;right:0;background:#fff;border:1px solid #1565c0;border-radius:6px;max-height:180px;overflow-y:auto;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,.1);"></div>'
      +'</div></div>';
  } else {
    h1+='<div style="margin-bottom:8px;display:flex;gap:8px;"><div style="font-size:11px;color:#6b7280;width:110px;flex-shrink:0;">TG name</div><div style="font-size:13px;color:#1e293b;flex:1;">'+(v&&v.tg_name||'&#8212;')+tgB+'</div></div>';
  }
  h1+=_vf('Area',v&&v.area,null,false)+_vf('VLAN',v&&v.vlan,null,false)+_vf('Status',v&&v.status,null,false);
  h1+='<div style="margin-top:12px;font-size:10px;font-weight:600;color:#7c3aed;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;padding:6px 10px;background:#f5f3ff;border-radius:6px;border-left:3px solid #7c3aed;">&#128205; Location &amp; Contact</div>';
  h1+=_vf('Address',v&&v.address,'address',edit)+_vf('Contact',v&&v.contact_number,'contact_number',edit);
  h1+=edit?'':'<div style="margin-bottom:8px;display:flex;gap:8px;"><div style="font-size:11px;color:#6b7280;width:110px;flex-shrink:0;">GPS</div><div style="font-size:13px;color:#1e293b;flex:1;">'+(v&&v.lat?v.lat+', '+v.lng:'&#8212;')+gpsL+'</div></div>';
  h1+='</div><div>';
  h1+='<div style="font-size:10px;font-weight:600;color:#15803d;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;padding:6px 10px;background:#f0fdf4;border-radius:6px;border-left:3px solid #15803d;">&#127806; Harvest</div>';
  h1+='<div style="margin-bottom:8px;display:flex;gap:8px;"><div style="font-size:11px;color:#6b7280;width:110px;flex-shrink:0;">Last harvest</div><div style="font-size:13px;color:#1e293b;flex:1;">'+(v&&v.last_harvest_date||'&#8212;')+(days!==null?' <span style="font-size:11px;color:'+dc+';">('+days+'d ago)</span>':'')+'</div></div>';
  h1+=_vf('Interval',v&&v.harvest_interval_days?v.harvest_interval_days+'d':null,null,false)+_vf('Installed',v&&v.date_installed,null,false)+_vf('Installer',v&&v.installer,null,false);
  if(h.length){const tn=h.reduce((s,r)=>s+Number(r.net_collectible||0),0),ts=h.reduce((s,r)=>s+Number(r.spawn_share||0),0);h1+='<div style="margin-top:12px;background:#f8faff;border-radius:8px;padding:12px;"><div style="font-size:10px;font-weight:600;color:#374151;margin-bottom:8px;">Lifetime ('+h.length+' harvests)</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><div><div style="font-size:17px;font-weight:700;color:#1565c0;">'+_php(tn)+'</div><div style="font-size:10px;color:#6b7280;">Total net</div></div><div><div style="font-size:17px;font-weight:700;color:#15803d;">'+_php(ts)+'</div><div style="font-size:10px;color:#6b7280;">Spawn 75%</div></div></div></div>';}
  h1+='</div></div>';
  if(edit){h1+='<div style="margin-top:14px;padding-top:14px;border-top:1px solid #e5e7eb;display:flex;gap:8px;align-items:center;"><button onclick="vpSave()" style="height:34px;padding:0 18px;background:#1565c0;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Save</button><button onclick="vpToggleEdit()" style="height:34px;padding:0 14px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;background:white;color:#374151;">Cancel</button><div style="flex:1;"></div><button onclick="vpConfirmPullout()" style="height:34px;padding:0 14px;border:1px solid #dc2626;border-radius:6px;font-size:12px;cursor:pointer;background:white;color:#dc2626;font-weight:600;">&#x1F534; Pull out</button></div>';}
  else if(v&&v.status!=='pulled_out'){h1+='<div style="margin-top:12px;display:flex;justify-content:flex-end;"><button onclick="vpToggleEdit()" style="height:28px;padding:0 14px;border:1px solid #d1d5db;border-radius:6px;font-size:11px;cursor:pointer;background:white;color:#374151;">Edit info</button></div>';}
  document.getElementById('vp-body').innerHTML=h1;
}
function vpRenderLedger(){
  const h=window._vpHarvests||[];
  if(!h.length){document.getElementById('vp-body').innerHTML='<div style="padding:30px;text-align:center;color:#6b7280;font-size:13px;">No harvest records</div>';return;}
  const tc=h.reduce((s,r)=>s+Number(r.coins_total||0),0),tn=h.reduce((s,r)=>s+Number(r.net_collectible||0),0),ts=h.reduce((s,r)=>s+Number(r.spawn_share||0),0),to=h.reduce((s,r)=>s+Number(r.customer_share||0),0);
  document.getElementById('vp-body').innerHTML='<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f8faff;"><th style="padding:7px 10px;text-align:left;border-bottom:2px solid #e5e7eb;">Date</th><th style="padding:7px 10px;text-align:right;border-bottom:2px solid #e5e7eb;">Total</th><th style="padding:7px 10px;text-align:right;border-bottom:2px solid #e5e7eb;">Free</th><th style="padding:7px 10px;text-align:right;border-bottom:2px solid #e5e7eb;">Saloy</th><th style="padding:7px 10px;text-align:right;border-bottom:2px solid #e5e7eb;">Old</th><th style="padding:7px 10px;text-align:right;border-bottom:2px solid #e5e7eb;color:#1565c0;font-weight:700;">Net</th><th style="padding:7px 10px;text-align:right;border-bottom:2px solid #e5e7eb;color:#15803d;">Spawn 75%</th><th style="padding:7px 10px;text-align:right;border-bottom:2px solid #e5e7eb;color:#7c3aed;">Owner 25%</th><th style="padding:7px 10px;text-align:left;border-bottom:2px solid #e5e7eb;">Collector</th></tr></thead><tbody>'
    +h.map(r=>{const ex=r.source==='excel';return '<tr style="'+(ex?'background:#f9fafb;':'')+'">'+'<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;'+(ex?'color:#9ca3af;font-style:italic;':'')+'">'+(r.harvest_date||'&#8212;')+(ex?' <span style="font-size:9px;color:#9ca3af">Excel</span>':'')+'</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right;">'+_php(r.coins_total)+'</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;">'+_php(r.coins_free)+'</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;">'+_php(r.coins_saloy)+'</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;">'+_php(r.coins_old)+'</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:700;color:#1565c0;">'+_php(r.net_collectible)+'</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#15803d;">'+_php(r.spawn_share)+'</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#7c3aed;">'+_php(r.customer_share)+'</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;">'+(r.collector||'&#8212;')+'</td></tr>';}).join('')
    +'<tr style="background:#f0fdf4;font-weight:700;border-top:2px solid #e5e7eb;"><td style="padding:8px 10px;">TOTAL ('+h.length+')</td><td style="padding:8px 10px;text-align:right;">'+_php(tc)+'</td><td colspan="3"></td><td style="padding:8px 10px;text-align:right;color:#1565c0;">'+_php(tn)+'</td><td style="padding:8px 10px;text-align:right;color:#15803d;">'+_php(ts)+'</td><td style="padding:8px 10px;text-align:right;color:#7c3aed;">'+_php(to)+'</td><td></td></tr></tbody></table>';
}
async function vpRenderRecon(){
  const v=window._vpVendo,h=window._vpHarvests||[];
  if(!v||!v.tg_name){document.getElementById('vp-body').innerHTML='<div style="padding:30px;text-align:center;color:#6b7280;font-size:13px;">No TG name linked &#8212; match this vendo first</div>';return;}
  document.getElementById('vp-body').innerHTML='<div style="padding:20px;text-align:center;color:#6b7280;font-size:13px;">Loading...</div>';
  try{
    // Fetch per-harvest window TG income using date field
    const rows=[];
    for(let i=0;i<h.length;i++){
      const hr=h[i];
      const ws=hr.harvest_window_start||hr.harvest_date;
      const we=hr.harvest_date;
      let tgInc=0,off=0;
      while(true){
        const r=await fetch(`${SB}/rest/v1/transactions?vendo=eq.${encodeURIComponent(v.tg_name)}&is_skipped=eq.false&date=gte.${ws}&date=lte.${we}&select=amount&limit=1000&offset=${off}`,
          {headers:{apikey:_KEY,Authorization:'Bearer '+_KEY}});
        const td=await r.json();
        if(!Array.isArray(td)||!td.length) break;
        tgInc+=td.reduce((s,t)=>s+Number(t.amount||0),0);
        if(td.length<1000) break;
        off+=1000;
      }
      const coins=Number(hr.coins_total||0);
      const gap=tgInc-coins; // positive=short (TG>coins), negative=surplus (coins>TG)
      const gc=Math.abs(gap)<100?'#15803d':gap>0?'#dc2626':'#b45309';
      const bg=Math.abs(gap)<100?'#f0fdf4':gap>0?'#fef2f2':'#fefce8';
      rows.push({hr,ws,we,tgInc,coins,gap,gc,bg});
    }
    const totC=rows.reduce((s,r)=>s+r.coins,0);
    const totTg=rows.reduce((s,r)=>s+r.tgInc,0);
    const totGap=totTg-totC; // positive=short
    const gc=Math.abs(totGap)<100?'#374151':totGap>0?'#dc2626':'#b45309';
    let html='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">'
      +'<div style="background:#f8faff;border-radius:8px;padding:12px;"><div style="font-size:18px;font-weight:700;color:#1565c0;">'+_php(totC)+'</div><div style="font-size:11px;color:#6b7280;margin-top:2px;">Coins total</div></div>'
      +'<div style="background:#f0fdf4;border-radius:8px;padding:12px;"><div style="font-size:18px;font-weight:700;color:#15803d;">'+_php(totTg)+'</div><div style="font-size:11px;color:#6b7280;margin-top:2px;">TG income</div></div>'
      +'<div style="background:'+(Math.abs(totGap)<100?'#f0fdf4':totGap>0?'#fef2f2':'#fefce8')+';border-radius:8px;padding:12px;"><div style="font-size:18px;font-weight:700;color:'+gc+';">'+(totGap>=0?'+':'')+_php(totGap)+'</div><div style="font-size:11px;color:#6b7280;margin-top:2px;">'+(totGap>100?'🔴 Short':totGap<-100?'🟡 Surplus':'✅ OK')+'</div></div>'
      +'</div><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f8faff;"><th style="padding:7px 10px;text-align:left;border-bottom:2px solid #e5e7eb;">Harvest date</th><th style="padding:7px 10px;text-align:left;border-bottom:2px solid #e5e7eb;">Window</th><th style="padding:7px 10px;text-align:right;border-bottom:2px solid #e5e7eb;">Coins total</th><th style="padding:7px 10px;text-align:right;border-bottom:2px solid #e5e7eb;">TG income</th><th style="padding:7px 10px;text-align:right;border-bottom:2px solid #e5e7eb;">Gap</th></tr></thead><tbody>';
    rows.forEach(({hr,ws,we,tgInc,coins,gap,gc,bg})=>{
      const gapLabel=gap>100?'🔴 Short':gap<-100?'🟡 Surplus':'✅ OK';
      html+=`<tr style="background:${bg}"><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;">${hr.harvest_date}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:10px;color:#6b7280;">${ws} → ${we}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#1565c0;">${_php(coins)}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#15803d;">${_php(tgInc)}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:${gc};font-weight:600;">${gapLabel} ${gap>=0?'+':''}${_php(gap)}</td></tr>`;
    });
    html+='</tbody></table>';
    document.getElementById('vp-body').innerHTML=html;
  }catch(e){document.getElementById('vp-body').innerHTML='<div style="padding:20px;text-align:center;color:#dc2626;">Error: '+e.message+'</div>';}
}
async function vpRenderNames(){
  const v=window._vpVendo;
  const body=document.getElementById('vp-body');
  body.innerHTML='<div style="padding:20px;text-align:center;color:#6b7280;font-size:13px;">Loading...</div>';

  // Load ALL vendos with same sheet_name OR tg_name to find duplicates/splits
  const sheetName = v&&v.sheet_name;
  const tgName = v&&v.tg_name;
  const matchStatus = tgName
    ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">✅ Matched</span>'
    : '<span style="background:#fef9c3;color:#b45309;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">⚠ Unmatched</span>';

  // Search for other vendos with similar names to help matching
  let suggestions = [];
  if(!tgName && sheetName){
    // Find TG-only vendos whose tg_name contains the sheet_name words
    const words = sheetName.split(/\s+/).filter(w=>w.length>3);
    const q = words.slice(0,2).join(' ');
    try{
      const r=await fetch(`${SB}/rest/v1/vendos?tg_name=ilike.*${encodeURIComponent(q)}*&sheet_name=is.null&status=eq.active&select=id,tg_name,area,vlan&limit=10`,
        {headers:{apikey:_KEY,Authorization:'Bearer '+_KEY}});
      suggestions=await r.json();
    }catch(e){}
  }

  // Most recent harvest record for window editing
  const harvests = window._vpHarvests||[];
  const lastHarvestData = harvests.length ? harvests[0] : null;

  let html = `
  <div style="margin-bottom:16px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <div style="font-size:14px;font-weight:700;color:#1e293b;">Name Matching Status</div>
      ${matchStatus}
    </div>

    <!-- Current names -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px;">
        <div style="font-size:10px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">📋 Excel / Sheet Name</div>
        <div style="font-size:14px;font-weight:700;color:#0c4a6e;word-break:break-word;">${sheetName||'<span style="color:#9ca3af;font-style:italic;font-weight:400;">Not set</span>'}</div>
        ${sheetName?'<div style="font-size:10px;color:#0369a1;margin-top:4px;">Used in dashboard display</div>':'<div style="font-size:10px;color:#d97706;margin-top:4px;">⚠ Vendo will show as unmatched</div>'}
      </div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;">
        <div style="font-size:10px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">📡 TG Name</div>
        <div style="font-size:13px;font-weight:600;color:#14532d;word-break:break-word;">${tgName||'<span style="color:#9ca3af;font-style:italic;font-weight:400;">Not linked</span>'}</div>
        ${tgName?'<div style="font-size:10px;color:#15803d;margin-top:4px;">Used for TG income matching</div>':'<div style="font-size:10px;color:#d97706;margin-top:4px;">⚠ No TG income can be fetched</div>'}
      </div>
    </div>

    <!-- Edit section -->
    <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:10px;padding:14px;margin-bottom:12px;">
      <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:10px;">Edit Names</div>
      <div style="margin-bottom:8px;">
        <label style="font-size:11px;color:#6b7280;font-weight:500;">Excel / Sheet Name</label>
        <input id="vn-sheet" value="${(sheetName||'').replace(/"/g,'&quot;')}" placeholder="Name from Excel file..."
          style="width:100%;height:32px;padding:0 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-top:3px;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:10px;">
        <label style="font-size:11px;color:#6b7280;font-weight:500;">TG Name (for income matching)</label>
        <div style="position:relative;margin-top:3px;">
          <input id="vn-tg" value="${(tgName||'').replace(/"/g,'&quot;')}" placeholder="Search TG name..." oninput="vpTgSearch2(this.value)"
            style="width:100%;height:32px;padding:0 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;">
          <div id="vn-tg-results" style="display:none;position:absolute;top:34px;left:0;right:0;background:#fff;border:1px solid #1565c0;border-radius:6px;max-height:160px;overflow-y:auto;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,.1);"></div>
        </div>
      </div>
      <button onclick="vpSaveNames()" style="height:32px;padding:0 16px;background:#1565c0;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">💾 Save Names</button>
    </div>

    <!-- Harvest Window editor -->
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px;margin-bottom:12px;">
      <div style="font-size:12px;font-weight:600;color:#c2410c;margin-bottom:6px;">🗓 Harvest Window</div>
      <div style="font-size:11px;color:#92400e;margin-bottom:10px;">Changes reconciliation window — TG income is fetched between window start and harvest date.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:500;">Window Start</label>
          <input type="date" id="vn-window-start" value="${(lastHarvestData&&lastHarvestData.harvest_window_start)||''}"
            style="width:100%;height:32px;padding:0 8px;border:1px solid #fed7aa;border-radius:6px;font-size:13px;margin-top:3px;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:500;">Harvest Date</label>
          <input type="date" id="vn-harvest-date" value="${(lastHarvestData&&lastHarvestData.harvest_date)||''}"
            style="width:100%;height:32px;padding:0 8px;border:1px solid #fed7aa;border-radius:6px;font-size:13px;margin-top:3px;box-sizing:border-box;">
        </div>
      </div>
      ${lastHarvestData?`<div style="font-size:10px;color:#92400e;margin-bottom:8px;">Harvest ID: <b>${lastHarvestData.id||'—'}</b> · Collector: <b>${lastHarvestData.collector||'—'}</b></div>`:'<div style="font-size:10px;color:#9ca3af;margin-bottom:8px;">No harvest records found.</div>'}
      <button onclick="vpSaveHarvestWindow()" style="height:32px;padding:0 16px;background:#ea580c;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">🗓 Update Harvest Window</button>
    </div>`;

  // Suggestions for unmatched vendos
  if(suggestions.length){
    html += `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;">
      <div style="font-size:12px;font-weight:600;color:#b45309;margin-bottom:8px;">💡 Possible TG matches — click to link immediately</div>`;
    suggestions.forEach(s=>{
      const safeTg = JSON.stringify(s.tg_name);
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#fff;border-radius:6px;margin-bottom:6px;border:1px solid #fde68a;font-size:12px;">
        <div><div style="font-weight:500;color:#1e293b;">${s.tg_name}</div><div style="font-size:10px;color:#6b7280;">${s.area||''} · VLAN ${s.vlan||'—'}</div></div>
        <button onclick="vpQuickLink(${safeTg.replace(/"/g,'&quot;')})" style="height:28px;padding:0 14px;background:#15803d;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">✅ Link & Save</button>
      </div>`;
    });
    html += '</div>';
  }

  html += '</div>';
  body.innerHTML = html;
}

async function vpQuickLink(tgName){
  const v=window._vpVendo; if(!v)return;
  const pw=prompt('Admin password:'); if(pw!=='101510'){toast('Wrong password');return;}
  const u={tg_name:tgName, tg_match_confirmed:true};
  try{
    const r=await fetch(SB+'/rest/v1/vendos?id=eq.'+v.id,{method:'PATCH',
      headers:{apikey:_KEY,Authorization:'Bearer '+_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify(u)});
    if(r.ok){
      Object.assign(window._vpVendo,u);
      document.getElementById('vp-title').textContent=v.sheet_name||tgName||'—';
      htAllRows=[]; // invalidate cache
      toast('✅ Linked! TG name saved.');
      vpRenderNames();
    } else toast('Save failed');
  }catch(e){toast('Error: '+e.message);}
}

let _tgSearchResults = [];
async function vpTgSearch2(q){
  const el=document.getElementById('vn-tg-results');
  if(!el)return;
  q=(q||'').trim();
  if(!q){el.style.display='none';return;}
  el.style.display='';
  el.innerHTML='<div style="padding:8px 10px;color:var(--mu);font-size:12px;">Searching…</div>';
  try{
    const r=await fetch(`${SB}/rest/v1/vendos?tg_name=ilike.*${encodeURIComponent(q)}*&select=tg_name,sheet_name,area&limit=20&order=tg_name.asc`,
      {headers:{apikey:_KEY,Authorization:'Bearer '+_KEY}});
    _tgSearchResults=await r.json();
    if(!_tgSearchResults.length){el.innerHTML='<div style="padding:8px 10px;color:var(--mu);font-size:12px;">No matches</div>';return;}
    el.innerHTML=_tgSearchResults.map((v,i)=>`<div onclick="vpTgPick(${i})"
      style="padding:7px 10px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:12px;"
      onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background=''">
      <div style="font-weight:600">${v.tg_name}</div>
      <div style="font-size:10px;color:var(--mu)">${v.sheet_name||''} · ${v.area||''}</div>
    </div>`).join('');
  }catch(e){el.innerHTML='<div style="padding:8px 10px;color:#dc2626;font-size:12px;">Error</div>';}
}
function vpTgPick(i){
  const v=_tgSearchResults[i];
  if(!v)return;
  const inp=document.getElementById('vn-tg');
  if(inp) inp.value=v.tg_name;
  const el=document.getElementById('vn-tg-results');
  if(el) el.style.display='none';
}

async function vpSaveNames(){
  const v=window._vpVendo; if(!v)return;
  const pw=prompt('Admin password:'); if(pw!=='101510'){toast('Wrong password');return;}
  const sheet=(document.getElementById('vn-sheet')||{}).value||'';
  const tg=(document.getElementById('vn-tg')||{}).value||'';
  const u={sheet_name:sheet||null, tg_name:tg||null};
  if(tg) u.tg_match_confirmed=true;
  try{
    const r=await fetch(SB+'/rest/v1/vendos?id=eq.'+v.id,{method:'PATCH',
      headers:{apikey:_KEY,Authorization:'Bearer '+_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify(u)});
    if(r.ok){
      Object.assign(window._vpVendo,u);
      document.getElementById('vp-title').textContent=u.sheet_name||v.sheet_name||u.tg_name||'—';
      htAllRows=[];
      toast('✅ Names saved!');
      vpRenderNames();
    } else {
      const errText = await r.text();
      toast('Save failed: '+errText.slice(0,80));
      console.error('vpSaveNames failed:', r.status, errText);
    }
  }catch(e){toast('Error: '+e.message); console.error('vpSaveNames error:',e);}
}

async function vpSaveHarvestWindow(){
  const v=window._vpVendo; if(!v)return;
  const harvests=window._vpHarvests||[];
  const lastH=harvests.length?harvests[0]:null;
  if(!lastH||!lastH.id){toast('No harvest record to update');return;}
  const ws=(document.getElementById('vn-window-start')||{}).value||'';
  const hd=(document.getElementById('vn-harvest-date')||{}).value||'';
  if(!ws&&!hd){toast('Enter at least one date to update');return;}
  const pw=prompt('Admin password:'); if(pw!=='101510'){toast('Wrong password');return;}
  const u={};
  if(ws) u.harvest_window_start=ws;
  if(hd){ u.harvest_date=hd; }
  try{
    const r=await fetch(SB+'/rest/v1/harvests?id=eq.'+lastH.id,{method:'PATCH',
      headers:{apikey:_KEY,Authorization:'Bearer '+_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify(u)});
    if(r.ok){
      // Also update vendos.last_harvest_date if harvest_date changed
      if(hd){
        await fetch(SB+'/rest/v1/vendos?id=eq.'+v.id,{method:'PATCH',
          headers:{apikey:_KEY,Authorization:'Bearer '+_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
          body:JSON.stringify({last_harvest_date:hd})});
        Object.assign(window._vpVendo,{last_harvest_date:hd});
      }
      // Update local cache
      Object.assign(lastH,u);
      toast('✅ Harvest window updated!');
      vpRenderNames();
    } else {
      const errText=await r.text();
      toast('Update failed: '+errText.slice(0,80));
    }
  }catch(e){toast('Error: '+e.message);}
}

function vpPhotoZoom(url){
  document.getElementById('vp-photo-zoom-overlay')?.remove();
  const ov=document.createElement('div');
  ov.id='vp-photo-zoom-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:11000;display:flex;align-items:center;justify-content:center;touch-action:none;overflow:hidden;';
  ov.innerHTML=`
    <button onclick="document.getElementById('vp-photo-zoom-overlay').remove()" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,.15);border:none;color:#fff;font-size:22px;width:40px;height:40px;border-radius:50%;cursor:pointer;line-height:1;z-index:2;">✕</button>
    <div style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);color:#fff;font-size:12px;opacity:.7;z-index:2;">Scroll / pinch to zoom · drag to pan · double-tap to reset</div>
    <img id="vp-zoom-img" src="${url}" style="max-width:92vw;max-height:88vh;object-fit:contain;transform:scale(1) translate(0px,0px);transition:transform .05s;cursor:grab;user-select:none;-webkit-user-drag:none;">`;
  ov.onclick=e=>{ if(e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
  const img=document.getElementById('vp-zoom-img');
  let scale=1, tx=0, ty=0, dragging=false, sx=0, sy=0, lastTap=0, pinchDist=0;
  const apply=()=>{ img.style.transform=`scale(${scale}) translate(${tx}px,${ty}px)`; img.style.cursor=scale>1?'grab':'zoom-in'; };
  // wheel zoom
  ov.addEventListener('wheel',e=>{ e.preventDefault(); scale=Math.min(6,Math.max(1, scale + (e.deltaY<0?0.25:-0.25))); if(scale===1){tx=0;ty=0;} apply(); },{passive:false});
  // drag to pan
  img.addEventListener('mousedown',e=>{ if(scale<=1)return; dragging=true; sx=e.clientX-tx*scale; sy=e.clientY-ty*scale; img.style.cursor='grabbing'; e.preventDefault(); });
  window.addEventListener('mousemove',e=>{ if(!dragging)return; tx=(e.clientX-sx)/scale; ty=(e.clientY-sy)/scale; apply(); });
  window.addEventListener('mouseup',()=>{ dragging=false; if(img)img.style.cursor=scale>1?'grab':'zoom-in'; });
  // double-click / double-tap reset or zoom
  img.addEventListener('dblclick',()=>{ scale=scale>1?1:2.5; tx=0;ty=0; apply(); });
  // touch: pinch zoom + drag
  img.addEventListener('touchstart',e=>{
    if(e.touches.length===2){ pinchDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); }
    else if(e.touches.length===1){
      const now=Date.now();
      if(now-lastTap<300){ scale=scale>1?1:2.5; tx=0;ty=0; apply(); }
      lastTap=now;
      if(scale>1){ dragging=true; sx=e.touches[0].clientX-tx*scale; sy=e.touches[0].clientY-ty*scale; }
    }
  },{passive:false});
  img.addEventListener('touchmove',e=>{
    e.preventDefault();
    if(e.touches.length===2){
      const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      if(pinchDist){ scale=Math.min(6,Math.max(1, scale*(d/pinchDist))); if(scale===1){tx=0;ty=0;} apply(); }
      pinchDist=d;
    } else if(e.touches.length===1 && dragging){
      tx=(e.touches[0].clientX-sx)/scale; ty=(e.touches[0].clientY-sy)/scale; apply();
    }
  },{passive:false});
  img.addEventListener('touchend',e=>{ if(e.touches.length===0){ dragging=false; pinchDist=0; } });
}

async function vpUploadPhoto(input){
  const v=window._vpVendo; if(!v||!v.id){toast('No vendo loaded');return;}
  const file=input.files&&input.files[0]; if(!file)return;
  const msg=document.getElementById('vp-photo-msg');
  if(msg){msg.textContent='Uploading…';msg.style.color='#6b7280';}
  try{
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
    const path='vendo-'+v.id+'-'+Date.now()+'.'+ext;
    // Upload to harvest-photos bucket
    const up=await fetch(`${_SB}/storage/v1/object/harvest-photos/${path}`,{
      method:'POST',
      headers:{apikey:_KEY,Authorization:'Bearer '+_KEY,'Content-Type':file.type||'image/jpeg','x-upsert':'true'},
      body:file
    });
    if(!up.ok){const t=await up.text();if(msg){msg.textContent='Upload failed';msg.style.color='#dc2626';}console.error('upload',t);return;}
    const publicUrl=`${_SB}/storage/v1/object/public/harvest-photos/${path}`;
    // Save URL to vendos
    const r=await fetch(`${_SB}/rest/v1/vendos?id=eq.${v.id}`,{method:'PATCH',
      headers:{..._HDR,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({photo_url:publicUrl})});
    if(r.ok){
      window._vpVendo.photo_url=publicUrl;
      toast('✅ Photo uploaded!');
      vpRenderInfo();
    }else{if(msg){msg.textContent='Save failed';msg.style.color='#dc2626';}}
  }catch(e){if(msg){msg.textContent='Error: '+e.message;msg.style.color='#dc2626';}}
}
async function vpRemovePhoto(){
  const v=window._vpVendo; if(!v||!v.id)return;
  if(!confirm('Remove this vendo photo?'))return;
  try{
    const r=await fetch(`${_SB}/rest/v1/vendos?id=eq.${v.id}`,{method:'PATCH',
      headers:{..._HDR,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({photo_url:null})});
    if(r.ok){window._vpVendo.photo_url=null;toast('Photo removed');vpRenderInfo();}
    else toast('Remove failed');
  }catch(e){toast('Error: '+e.message);}
}

async function vpSave(){
  const v=window._vpVendo;if(!v)return;
  const pw=prompt('Admin password:');if(pw!=='101510'){toast('Wrong password');return;}
  const u={};['owner_name','tg_name','address','contact_number'].forEach(f=>{const el=document.getElementById('vp-f-'+f);if(el)u[f]=el.value.trim()||null;});
  if(u.tg_name)u.tg_match_confirmed=true;
  try{
    const r=await fetch(SB+'/rest/v1/vendos?id=eq.'+v.id,{method:'PATCH',headers:{apikey:_KEY,Authorization:'Bearer '+_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(u)});
    if(r.ok){Object.assign(window._vpVendo,u);window._vpEditMode=false;document.getElementById('vp-edit-btn').textContent='Edit';document.getElementById('vp-title').textContent=u.sheet_name||v.sheet_name;vpRenderInfo();toast('Saved!');}
    else toast('Save failed');
  }catch(e){toast('Error: '+e.message);}
}
function vpConfirmPullout(){
  const v=window._vpVendo;if(!v)return;
  const inner=document.getElementById('vp-inner');
  let ov=document.getElementById('vp-po-ov');if(ov)ov.remove();
  ov=document.createElement('div');ov.id='vp-po-ov';
  ov.style.cssText='position:absolute;inset:0;background:rgba(255,255,255,.97);display:flex;align-items:center;justify-content:center;border-radius:12px;z-index:20;';
  const btn1='<button onclick="vpExecutePullout()" style="height:36px;padding:0 20px;background:#dc2626;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Confirm Pull Out</button>';
  const btn2='<button onclick="vpCancelPullout()" style="height:36px;padding:0 14px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;background:white;color:#374151;">Cancel</button>';
  ov.innerHTML='<div style="max-width:320px;width:100%;padding:24px;text-align:center;">'
    +'<div style="font-size:36px;margin-bottom:12px;">&#9888;&#65039;</div>'
    +'<div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:6px;">Pull out vendo?</div>'
    +'<div style="font-size:12px;color:#374151;margin-bottom:4px;font-weight:500;">'+(v.sheet_name||v.tg_name||'')+'</div>'
    +'<div style="font-size:11px;color:#6b7280;margin-bottom:18px;">Enter admin password to confirm.</div>'
    +'<input id="vp-po-pw" type="password" placeholder="Admin password" style="width:100%;height:36px;padding:0 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:8px;">'
    +'<input id="vp-po-reason" type="text" placeholder="Reason (optional)" style="width:100%;height:36px;padding:0 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:16px;">'
    +'<div style="display:flex;gap:8px;justify-content:center;">'+btn1+btn2+'</div>'
    +'<div id="vp-po-err" style="color:#dc2626;font-size:12px;margin-top:8px;"></div>'
    +'</div>';
  inner.appendChild(ov);
  setTimeout(()=>{const pw=document.getElementById('vp-po-pw');if(pw)pw.focus();},100);
}
async function vpExecutePullout(){
  const v=window._vpVendo;
  const pw=(document.getElementById('vp-po-pw')||{}).value||'';
  const reason=(document.getElementById('vp-po-reason')||{}).value||'';
  if(pw!=='101510'){const e=document.getElementById('vp-po-err');if(e)e.textContent='Incorrect password.';return;}
  try{
    const r=await fetch(SB+'/rest/v1/vendos?id=eq.'+v.id,{method:'PATCH',headers:{apikey:_KEY,Authorization:'Bearer '+_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({status:'pulled_out',pulled_out_at:new Date().toISOString(),pulled_out_by:'admin',pullout_reason:reason||null})});
    if(r.ok){vpCancelPullout();window._vpVendo.status='pulled_out';toast('Vendo pulled out');vpRenderInfo();}
    else{const e=document.getElementById('vp-po-err');if(e)e.textContent='Save failed';}
  }catch(e2){const e=document.getElementById('vp-po-err');if(e)e.textContent='Error: '+e2.message;}
}

/* ── HARVEST TABLE ── */
let htAllRows = [];


async function htRebuildCache() {
  try {
    await fetch(`${_SB}/functions/v1/write-vendos-cache`, {
      method: 'POST',
      headers: { 'x-cache-secret': 'spawn-cache-2026', apikey: _KEY }
    });
    console.log('[htLoad] Cache rebuilt');
  } catch(e) { console.warn('[htLoad] Cache rebuild failed', e); }
}

async function htForceLoad(){
  // Skip bucket cache entirely, go straight to DB
  htAllRows=[];
  document.getElementById('ht-cache-age').textContent = 'refreshing…';
  document.getElementById('ht-tbody').innerHTML = '<tr><td colspan="6" style="padding:30px;text-align:center;color:var(--mu);"><span style="display:inline-block;width:18px;height:18px;border:2px solid var(--bd);border-top-color:var(--blue);border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:8px;"></span>Loading from DB…</td></tr>';
  try {
    let offset = 0;
    while(true){
      const r = await fetch(
        `${_SB}/rest/v1/vendos?select=id,sheet_name,tg_name,owner_name,area,vlan,last_harvest_date,status&status=eq.active&order=last_harvest_date.desc.nullslast&limit=1000&offset=${offset}`,
        {headers:{..._HDR,'Prefer':'count=none'}}
      );
      const batch = await r.json();
      if(!Array.isArray(batch)||!batch.length) break;
      htAllRows.push(...batch.map(v=>({...v,harvest_date:v.last_harvest_date||null,actual_collector:null,spawn_share:null})));
      if(batch.length<1000) break;
      offset+=1000;
    }
    // Enrich with last harvest
    const ids = htAllRows.filter(v=>v.last_harvest_date).map(v=>v.id).slice(0,500);
    if(ids.length){
      const rh = await fetch(`${_SB}/rest/v1/harvests?select=vendo_id,collector,spawn_share&vendo_id=in.(${ids.join(',')})&order=harvest_date.desc&limit=500`,{headers:_HDR});
      const hrows = await rh.json();
      const hmap={};
      (hrows||[]).forEach(h=>{if(!hmap[h.vendo_id])hmap[h.vendo_id]=h;});
      htAllRows=htAllRows.map(v=>({...v,actual_collector:hmap[v.id]?.collector||null,spawn_share:hmap[v.id]?.spawn_share||null}));
    }
    const collectors=[...new Set(htAllRows.map(r=>r.actual_collector||r.collector).filter(Boolean))].sort();
    const htSel=document.getElementById('ht-collector');
    const rcSel=document.getElementById('rc-collector');
    if(htSel){const prev=htSel.value;htSel.innerHTML='<option value="">All collectors</option>';collectors.forEach(c=>{htSel.innerHTML+=`<option${c===prev?' selected':''}>${c}</option>`;});}
    if(rcSel){rcSel.innerHTML='<option value="">All collectors</option>';collectors.forEach(c=>{rcSel.innerHTML+=`<option>${c}</option>`;});}
    document.getElementById('ht-cache-age').textContent = `${htAllRows.length} rows · live`;
    htFilter();
    htRebuildCache(); // update bucket cache with fresh data
  } catch(e){
    document.getElementById('ht-tbody').innerHTML='<tr><td colspan="6" style="padding:20px;text-align:center;color:#dc2626;">Error: '+e.message+'</td></tr>';
  }
}

async function htLoad(){
  document.getElementById('ht-tbody').innerHTML = '<tr><td colspan="6" style="padding:30px;text-align:center;color:var(--mu);"><span style="display:inline-block;width:18px;height:18px;border:2px solid var(--bd);border-top-color:var(--blue);border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:8px;"></span>Loading…</td></tr>';
  htAllRows = [];
  localStorage.removeItem('spawn_ht'); // always fresh — harvests table is source of truth
  // Bucket cache with 5-min expiry
  const _HT_BUCKET = 'https://cviraqfhphhsonjmrtvu.supabase.co/storage/v1/object/public/harvest-history-cache/vendos_table.json';
  try {
    const rc = await fetch(_HT_BUCKET + '?t=' + Math.floor(Date.now()/60000));
    if (rc.ok) {
      const d = await rc.json();
      if (d.rows && d.rows.length && d.rows.length > 500) {
        htAllRows = d.rows;
        const age = Date.now() - new Date(d.generated_at||0).getTime();
        document.getElementById('ht-cache-age').textContent = 'cache ' + Math.round(age/60000) + 'min ago';
        const collectors = [...new Set(htAllRows.map(r=>r.actual_collector||r.collector).filter(Boolean))].sort();
        const htSel = document.getElementById('ht-collector');
        const rcSel = document.getElementById('rc-collector');
        if(htSel){ const prev=htSel.value; htSel.innerHTML='<option value="">All collectors</option>'; collectors.forEach(c=>{ htSel.innerHTML+=`<option${c===prev?' selected':''}>${c}</option>`; }); }
        if(rcSel){ rcSel.innerHTML='<option value="">All collectors</option>'; collectors.forEach(c=>{ rcSel.innerHTML+=`<option>${c}</option>`; }); }
        htFilter();
        loadTodaySummary(true);
        if(age > 60*60*1000) htRebuildCache();
        return;
      }
    }
  } catch(e) {}
  // 2. Fallback: direct DB
  try {
    document.getElementById('ht-cache-age').textContent = 'loading from DB…';
    let offset = 0;
    while(true){
      const r = await fetch(
        `${_SB}/rest/v1/vendos?select=id,sheet_name,tg_name,owner_name,area,vlan,last_harvest_date,status&status=eq.active&order=last_harvest_date.desc.nullslast&limit=1000&offset=${offset}`,
        {headers:{..._HDR,'Prefer':'count=none'}}
      );
      const batch = await r.json();
      if(!Array.isArray(batch)||!batch.length) break;
      htAllRows.push(...batch.map(v=>({...v, harvest_date:v.last_harvest_date||null, actual_collector:null, spawn_share:null})));
      if(batch.length<1000) break;
      offset+=1000;
    }
    // Enrich with last harvest
    const ids = htAllRows.filter(v=>v.last_harvest_date).map(v=>v.id).slice(0,500);
    if(ids.length){
      const rh = await fetch(`${_SB}/rest/v1/harvests?select=vendo_id,collector,spawn_share&vendo_id=in.(${ids.join(',')})&order=harvest_date.desc&limit=500`,{headers:_HDR});
      const hrows = await rh.json();
      const hmap={};
      (hrows||[]).forEach(h=>{if(!hmap[h.vendo_id])hmap[h.vendo_id]=h;});
      htAllRows=htAllRows.map(v=>({...v,actual_collector:hmap[v.id]?.collector||null,spawn_share:hmap[v.id]?.spawn_share||null}));
    }
    document.getElementById('ht-cache-age').textContent = 'live';
    htRebuildCache(); // write to bucket for next time
  } catch(e){
    console.warn('htLoad error',e);
    document.getElementById('ht-tbody').innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:#dc2626;">Error: '+e.message+'</td></tr>';
    return;
  }
  if(!htAllRows.length){
    document.getElementById('ht-tbody').innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--mu);">No harvest records found.</td></tr>';
    return;
  }
  const collectors = [...new Set(htAllRows.map(r=>r.actual_collector||r.collector).filter(Boolean))].sort();
  const htSel = document.getElementById('ht-collector');
  const rcSel = document.getElementById('rc-collector');
  if(htSel){
    const prev = htSel.value;
    htSel.innerHTML = '<option value="">All collectors</option>';
    collectors.forEach(c=>{ htSel.innerHTML += `<option${c===prev?' selected':''}>${c}</option>`; });
  }
  if(rcSel){
    rcSel.innerHTML = '<option value="">All collectors</option>';
    collectors.forEach(c=>{ rcSel.innerHTML += `<option>${c}</option>`; });
  }
  htFilter();
  loadTodaySummary(true);
}

let _todaySummaryLoading = false;
let _todaySummaryLoaded = false;
async function loadTodaySummary(force){
  const el = document.getElementById('harvest-collector-summary');
  if(!el) return;
  // Prevent concurrent/duplicate runs that cause the flash + unclickable cards
  if(_todaySummaryLoading) return;
  // If already loaded and not forcing, skip re-render (avoids blink)
  if(_todaySummaryLoaded && !force && el.querySelector('[onclick^="htShowCollectorPopup"]')) return;
  _todaySummaryLoading = true;
  if(!_todaySummaryLoaded) el.innerHTML = '<div style="font-size:11px;color:var(--mu);padding:4px 0"><span style="display:inline-block;width:14px;height:14px;border:2px solid var(--bd);border-top-color:var(--blue);border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:6px;"></span>Loading today…</div>';
  try {
    const today = new Date().toISOString().slice(0,10);
    const r = await fetch(`${_SB}/rest/v1/harvests?harvest_date=eq.${today}&select=id,collector,vendo_name,sheet_name,tg_name,area,coins_total,coins_free,coins_saloy,coins_old,net_collectible,spawn_share,harvested_at,collector_note,photo_url&order=harvested_at.asc`,{headers:_HDR});
    const rows = await r.json();
    if(!Array.isArray(rows)||!rows.length){
      el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px;color:var(--mu)">📭 No harvests recorded today yet</div>';
      return;
    }
    // Group by collector
    const byCol = {};
    rows.forEach(h=>{
      const c = h.collector||'Unknown';
      if(!byCol[c]) byCol[c]={count:0,spawn:0,coins:0,areas:new Set(),vendos:[]};
      byCol[c].count++;
      byCol[c].spawn += Number(h.spawn_share||0);
      byCol[c].coins += Number(h.coins_total||0);
      byCol[c].vendos.push(h);
      if(h.area) byCol[c].areas.add(h.area);
    });
    const totalCount = rows.length;
    const totalSpawn = rows.reduce((s,h)=>s+Number(h.spawn_share||0),0);
    const colColors = ['#1565c0','#15803d','#b45309','#7c3aed','#0d9488'];
    Object.values(byCol).forEach(d=>{if(d.areas instanceof Set)d.areas=[...d.areas];});
    window._htColByCol=byCol;
    const colEntries = Object.entries(byCol).sort((a,b)=>b[1].spawn-a[1].spawn);
    el.innerHTML = `
      <div style="background:#fff;border:1px solid var(--bd);border-radius:10px;padding:10px 14px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
          <div style="font-size:12px;font-weight:700;color:#1565c0;">📅 Today's Harvest Summary</div>
          <div style="display:flex;gap:10px;align-items:center;">
            <span style="font-size:11px;color:var(--mu);">${totalCount} vendos</span>
            <span style="font-size:14px;font-weight:700;color:#15803d;">${_php(totalSpawn)} spawn share</span>
            <button onclick="loadTodaySummary(true)" style="padding:2px 8px;border:1px solid var(--bd);border-radius:5px;background:#fff;font-size:11px;cursor:pointer;color:var(--mu)">↻</button>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${colEntries.map(([name,d],i)=>`
            <div onclick="htShowCollectorPopup(${JSON.stringify(name).replace(/"/g,'&quot;')})" style="background:#f8faff;border:1px solid #e0e7ff;border-radius:8px;padding:7px 12px;min-width:130px;cursor:pointer;" onmouseover="this.style.borderColor='#1565c0'" onmouseout="this.style.borderColor='#e0e7ff'">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                ${collectorAvatar(name, 26)}
                <span style="font-size:12px;font-weight:700;color:#1e293b;">${name}</span>
              </div>
              <div style="font-size:13px;font-weight:700;color:#15803d;">${_php(d.spawn)}</div>
              <div style="font-size:10px;color:var(--mu);margin-top:1px;">${d.count} vendo${d.count!==1?'s':''} · ${[...d.areas].join(', ')||'—'} <span style="color:#1565c0">▸</span></div>
            </div>`).join('')}
        </div>
      </div>`;
    _todaySummaryLoaded = true;
  } catch(e){
    el.innerHTML = '<div style="font-size:11px;color:#dc2626;padding:4px 0">Error loading today summary</div>';
  } finally {
    _todaySummaryLoading = false;
  }
}


async function htShowCollectorPopup(collectorName){
  const byCol = window._htColByCol||{};
  const d = byCol[collectorName];
  if(!d) return;
  let ov = document.getElementById('ht-col-popup');
  if(ov) ov.remove();
  ov = document.createElement('div');
  ov.id = 'ht-col-popup';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:center;justify-content:center;padding:12px;';
  ov.onclick = e => { if(e.target===ov) ov.remove(); };

  // Fetch expenses
  const today = new Date().toISOString().slice(0,10);
  let expenses = [];
  try {
    const er = await fetch(`${_SB}/rest/v1/collector_expenses?collector=eq.${encodeURIComponent(collectorName)}&expense_date=eq.${today}&select=*`,{headers:_HDR});
    expenses = await er.json();
    if(!Array.isArray(expenses)) expenses=[];
  } catch(e){}
  const totalExp = expenses.reduce((s,e)=>s+Number(e.amount||0),0);

  const fmt = n => Math.round(n).toLocaleString();

  const vendoCards = (d.vendos||[]).map(h=>{
    const t = h.harvested_at ? new Date(h.harvested_at).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit'}) : '—';
    const net = Number(h.net_collectible||0);
    const free = Number(h.coins_free||0);
    const saloy = Number(h.coins_saloy||0);
    const old = Number(h.coins_old||0);
    const total = Number(h.coins_total||0);
    const spawn = Number(h.spawn_share||0);
    const photoHtml = h.photo_url ? `<img src="${h.photo_url}" style="width:52px;height:52px;border-radius:8px;object-fit:cover;flex-shrink:0;">` : `<div style="width:52px;height:52px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">🏪</div>`;
    return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin-bottom:8px;">
      <div style="display:flex;gap:10px;align-items:flex-start;">
        ${photoHtml}
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:800;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${h.sheet_name||h.vendo_name||h.tg_name||'—'}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:1px;">${h.area||'—'} · ${t}</div>
          ${h.tg_name&&h.tg_name!==(h.sheet_name||h.vendo_name)?`<div style="font-size:9px;color:#9ca3af;margin-top:1px;">${h.tg_name}</div>`:''}
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:16px;font-weight:900;color:#15803d;">₱${fmt(spawn)}</div>
          <div style="font-size:9px;color:#6b7280;">spawn share</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:10px;background:#f8faff;border-radius:8px;padding:8px;">
        <div style="text-align:center;">
          <div style="font-size:11px;font-weight:700;color:#1e293b;">₱${fmt(total)}</div>
          <div style="font-size:9px;color:#6b7280;">Total</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:11px;font-weight:700;color:#1e293b;">₱${fmt(net)}</div>
          <div style="font-size:9px;color:#6b7280;">Net</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:11px;font-weight:700;color:${free>0?'#b45309':'#9ca3af'};">₱${fmt(free)}</div>
          <div style="font-size:9px;color:#6b7280;">Free</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:11px;font-weight:700;color:${saloy>0?'#7c3aed':'#9ca3af'};">₱${fmt(saloy)}</div>
          <div style="font-size:9px;color:#6b7280;">Saloy</div>
        </div>
      </div>
      ${h.collector_note?`<div style="margin-top:6px;background:#fffbeb;border-radius:6px;padding:5px 8px;font-size:11px;color:#92400e;">📝 ${h.collector_note}</div>`:''}
    </div>`;
  }).join('');

  const expHtml = expenses.length ? `
    <div style="margin-top:4px;">
      <div style="font-size:10px;font-weight:800;color:#ef4444;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">💸 Expenses</div>
      ${expenses.map(e=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #fef2f2;font-size:12px;">
          <span style="color:#374151;">${e.description||e.category||'Expense'}</span>
          <span style="font-weight:700;color:#ef4444;">−₱${fmt(Number(e.amount||0))}</span>
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:7px 0 0;font-size:13px;font-weight:800;">
        <span style="color:#ef4444;">Total Expenses</span>
        <span style="color:#ef4444;">−₱${fmt(totalExp)}</span>
      </div>
    </div>` : '';

  const netRemit = d.spawn - totalExp;

  ov.innerHTML = `
  <div style="background:#f9fafb;border-radius:16px;width:100%;max-width:420px;max-height:88vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.4);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1565c0,#1976d2);color:#fff;padding:14px 16px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:1;">
      <div style="display:flex;align-items:center;gap:10px;">
        ${collectorAvatar(collectorName, 40)}
        <div>
          <div style="font-size:16px;font-weight:900;">${collectorName}</div>
          <div style="font-size:11px;opacity:.8;">${d.count} vendo${d.count!==1?'s':''} · ${(d.areas||[]).join(', ')||'—'}</div>
        </div>
      </div>
      <button onclick="document.getElementById('ht-col-popup').remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:18px;width:32px;height:32px;border-radius:50%;cursor:pointer;line-height:1;">✕</button>
    </div>
    <!-- Totals bar -->
    <div style="display:grid;grid-template-columns:1fr 1fr ${totalExp>0?'1fr 1fr':'1fr'};background:#1565c0;border-bottom:3px solid #0d47a1;">
      <div style="padding:10px;text-align:center;border-right:1px solid rgba(255,255,255,.15);">
        <div style="font-size:9px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.05em;">Coins</div>
        <div style="font-size:15px;font-weight:800;color:#fff;">₱${fmt(d.coins)}</div>
      </div>
      <div style="padding:10px;text-align:center;border-right:1px solid rgba(255,255,255,.15);">
        <div style="font-size:9px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.05em;">Spawn</div>
        <div style="font-size:15px;font-weight:800;color:#4ade80;">₱${fmt(d.spawn)}</div>
      </div>
      ${totalExp>0?`
      <div style="padding:10px;text-align:center;border-right:1px solid rgba(255,255,255,.15);">
        <div style="font-size:9px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.05em;">Expenses</div>
        <div style="font-size:15px;font-weight:800;color:#fca5a5;">−₱${fmt(totalExp)}</div>
      </div>
      <div style="padding:10px;text-align:center;">
        <div style="font-size:9px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.05em;">Net Remit</div>
        <div style="font-size:15px;font-weight:800;color:#fff;">₱${fmt(netRemit)}</div>
      </div>`:''}
    </div>
    <!-- Vendo cards -->
    <div style="padding:12px;">
      ${vendoCards||'<div style="text-align:center;color:#9ca3af;padding:20px;font-size:12px;">No vendos yet</div>'}
      ${expHtml}
    </div>
  </div>`;
  document.body.appendChild(ov);
}

function progressFlyTo(name){
  const btn = document.getElementById('hbtn-progress');
  if(btn) hvNewTab('progress',btn);
  setTimeout(()=>{
    if(!_progressMap||!window._progressMarkers) return;
    const m = window._progressMarkers[name];
    if(m){ _progressMap.setView(m.getLatLng(),17); m.openPopup(); }
    else toast('No GPS pin for '+name);
  },350);
}

function htFilter(){
  const area = document.getElementById('ht-area').value;
  const col  = document.getElementById('ht-collector').value;
  const stat = document.getElementById('ht-status')?.value||'';
  const q    = (document.getElementById('ht-search').value||'').toLowerCase();
  const rows = htAllRows.filter(r=>{
    if(area && r.area!==area) return false;
    const actualCol = r.actual_collector||r.harvest_groups?.collector||'';
    if(col  && actualCol!==col) return false;
    // status filter not applicable for vendos table
    if(q){
      const hay = ((r.sheet_name||'')+(r.tg_name||'')+(r.owner_name||'')+(r.area||'')).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  const done = rows.filter(r=>r.harvest_date).length;
  const pend = rows.filter(r=>!r.harvest_date).length;
  const tCoins = rows.reduce((s,r)=>s+Number(r.coins_total||0),0);
  const tNet   = rows.reduce((s,r)=>s+Number(r.net_collectible||0),0);
  document.getElementById('ht-stats').innerHTML = [
    ['stat-blue', rows.length.toLocaleString(), 'Vendos shown'],
    ['stat-grn',  done.toLocaleString(), 'Harvested'],
    ['stat-amb',  pend.toLocaleString(), 'Never harvested'],
  ].map(([cl,v,l])=>`<div style="background:#fff;border:1px solid var(--bd);border-radius:8px;padding:10px 12px;">
    <div style="font-size:20px;font-weight:700;color:${cl==='stat-grn'?'#15803d':cl==='stat-amb'?'#b45309':'#1565c0'};line-height:1">${v}</div>
    <div style="font-size:10px;color:var(--mu);margin-top:3px;font-weight:500">${l}</div>
  </div>`).join('');
  document.getElementById('ht-count').textContent = rows.length.toLocaleString()+' rows';
  const tb = document.getElementById('ht-tbody');
  if(!rows.length){ tb.innerHTML='<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--mu);">No results</td></tr>'; return; }
  tb.innerHTML = rows.slice(0,2000).map(r=>{
    const col = r.collector||r.actual_collector||'—';
    const days = r.harvest_date ? Math.floor((Date.now()-new Date(r.harvest_date))/86400000) : null;
    const daysColor = days===null?'#9ca3af':days>30?'#dc2626':days>14?'#d97706':'#15803d';
    const daysStr = days===null?'—':`<span style="font-weight:700;color:${daysColor}">${days}d ago</span>`;
    const spawn = r.spawn_share!=null?'<span style="font-weight:700;color:#15803d;font-size:13px;">'+_php(r.spawn_share)+'</span>':'—';
    return `<tr data-id="${r.id||''}" data-tg="${(r.sheet_name||r.tg_name||'').replace(/"/g,'&quot;')}" data-area="${r.area||''}" style="cursor:pointer" onclick="htShowVendoFromRow(this)">
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-weight:500;">${r.sheet_name||`<span style="color:#9ca3af;font-style:italic;font-size:10px;">unmatched</span>`}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;">${r.area||'—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;">${r.harvest_date||'<span style="color:#d1d5db">never</span>'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;"><span style="background:#ede9fe;color:#6d28d9;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;">${col||'—'}</span></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;">${daysStr}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;">${spawn}</td>
    </tr>`;
  }).join('');
  if(rows.length>2000) tb.innerHTML+=`<tr><td colspan="6" style="padding:8px;text-align:center;color:var(--mu);font-size:10px;">Showing 2,000 of ${rows.length} — use filters to narrow</td></tr>`;
}

/* ── LIVE FEED ── */
let lfItems = [];
let lfWs = null;
let lfConnected = false;

let lfMode = 'today';
let lfHistItems = [];

function lfSetMode(mode){
  lfMode = mode;
  const isToday = mode==='today';
  document.getElementById('lf-panel-today').style.display = isToday?'':'none';
  document.getElementById('lf-panel-history').style.display = isToday?'none':'';
  document.getElementById('lf-mode-today').style.borderBottomColor = isToday?'#1565c0':'transparent';
  document.getElementById('lf-mode-today').style.color = isToday?'#1565c0':'#6b7280';
  document.getElementById('lf-mode-history').style.borderBottomColor = isToday?'transparent':'#1565c0';
  document.getElementById('lf-mode-history').style.color = isToday?'#6b7280':'#1565c0';
  if(mode==='history' && !document.getElementById('lf-hist-date').value){
    // Default to yesterday
    const d=new Date(); d.setDate(d.getDate()-1);
    document.getElementById('lf-hist-date').value=d.toISOString().slice(0,10);
  }
}

function lfRenderRows(items, elId, statsId, countId, searchId){
  const el=document.getElementById(elId);
  const stats=document.getElementById(statsId);
  const q=(document.getElementById(searchId)?.value||'').toLowerCase().trim();
  const filtered=q?items.filter(i=>(i.sheet_name||'').toLowerCase().includes(q)||(i.collector||'').toLowerCase().includes(q)||(i.area||'').toLowerCase().includes(q)):items;
  document.getElementById(countId).textContent=filtered.length+' records';
  if(!filtered.length){el.innerHTML='<div style="padding:30px;text-align:center;color:var(--mu);font-size:12px;">No records found.</div>';stats.innerHTML='';return;}
  const tC=filtered.reduce((s,i)=>s+Number(i.coins_total||0),0);
  const tN=filtered.reduce((s,i)=>s+Number(i.net_collectible||0),0);
  const cols=[...new Set(filtered.map(i=>i.collector).filter(Boolean))];
  stats.innerHTML=[
    ['#1565c0',filtered.length,'Total records'],
    ['#1565c0',_php(tC),'Coins collected'],
    ['#15803d',_php(tN),'Net collectible'],
    ['#1565c0',cols.length,'Collectors'],
  ].map(([c,v,l])=>`<div style="background:#fff;border:1px solid var(--bd);border-radius:8px;padding:10px 12px;">
    <div style="font-size:20px;font-weight:700;color:${c};line-height:1">${v}</div>
    <div style="font-size:10px;color:var(--mu);margin-top:3px;font-weight:500">${l}</div>
  </div>`).join('');
  el.innerHTML=filtered.slice(0,500).map((item,i)=>{
    const timeStr=item.harvested_at?new Date(item.harvested_at).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}):'';
    return `<div onclick="lfShowDetail(${lfItems.indexOf(item)>=0?lfItems.indexOf(item):i})" style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border-bottom:1px solid #f3f4f6;cursor:pointer;" onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background=''">
      <div style="font-size:10px;color:var(--mu);white-space:nowrap;padding-top:2px;min-width:50px;">${timeStr}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:12px;">${item.sheet_name||'<span style="color:#9ca3af;font-style:italic;">unmatched</span>'}</div>
        <div style="font-size:11px;color:var(--mu);margin-top:1px;">
          <span style="background:#ede9fe;color:#6d28d9;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;">${item.collector||'—'}</span>
          &nbsp;${item.area||''}
        </div>
      </div>
      <div style="text-align:right;white-space:nowrap;">
        ${item.spawn_share!=null?`<div style="font-size:13px;font-weight:700;color:#15803d;">${_php(item.spawn_share)}</div>`:''}
        ${item.net_collectible!=null?`<div style="font-size:10px;color:var(--mu);">net ${_php(item.net_collectible)}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

function lfFlyToCollector(collector){
  // Try progress map (has GPS from today's harvest_group_items)
  if(window._progressMap){
    // find a marker for this collector - search through the progress map layers
    let found = null;
    _progressMap.eachLayer(l=>{ if(l.getPopup && l.getPopup()){ const c=l.getPopup().getContent(); if(c&&c.includes&&c.includes(collector)&&!found) found=l; } });
    if(found){ _progressMap.flyTo(found.getLatLng(),16,{animate:true,duration:1}); found.openPopup(); return; }
  }
  // Fall back to vmap top
  if(window._vmtMap){
    let found=null;
    _vmtMap.eachLayer(l=>{ if(l.getPopup&&l.getPopup()){ const c=l.getPopup().getContent(); if(c&&c.includes&&c.includes(collector)&&!found) found=l; } });
    if(found){ _vmtMap.flyTo(found.getLatLng(),16,{animate:true,duration:1}); }
  }
  // Just scroll to map area in progress
  const pm=document.getElementById('progress-map');
  if(pm) pm.scrollIntoView({behavior:'smooth'});
}

function lfRender(){ lfRenderRows(lfItems,'lf-list','lf-stats','lf-count','lf-search'); }
function lfHistRender(){ lfRenderRows(lfHistItems,'lf-hist-list','lf-hist-stats','lf-hist-count','lf-hist-search'); }

async function lfLoadHistoryDate(){
  const date=document.getElementById('lf-hist-date').value;
  if(!date) return;
  document.getElementById('lf-hist-list').innerHTML='<div style="padding:30px;text-align:center;color:var(--mu);font-size:12px;">Loading…</div>';
  document.getElementById('lf-hist-stats').innerHTML='';
  try{
    const r=await fetch(`${_SB}/rest/v1/harvests?harvest_date=eq.${date}&select=id,sheet_name,tg_name,area,coins_total,coins_free,coins_saloy,coins_old,net_collectible,spawn_share,customer_share,harvested_at,harvest_date,collector,collector_note,photo_url&order=harvested_at.desc.nullslast&limit=500`,{headers:_HDR});
    lfHistItems=await r.json();
    lfHistRender();
  }catch(e){document.getElementById('lf-hist-list').innerHTML=`<div style="padding:20px;text-align:center;color:#dc2626;">Error: ${e.message}</div>`;}
}

async function lfLoadToday(){
  try{
    const r = await fetch(
      `${_SB}/rest/v1/harvests?harvest_date=eq.${new Date().toISOString().slice(0,10)}&select=id,sheet_name,tg_name,area,coins_total,coins_free,coins_saloy,coins_old,net_collectible,spawn_share,customer_share,harvested_at,harvest_date,collector,collector_note,photo_url&order=harvested_at.desc.nullslast&limit=500`,
      {headers:_HDR}
    );
    const rows = await r.json();
    if(Array.isArray(rows)){
      lfItems = rows.map(r=>({...r,group_label:''}));
      lfRender();
    }
  }catch(e){console.warn('lfLoadToday',e);}
}

function lfConnect(){
  if(lfConnected) return;
  lfLoadToday();
  try{
    const wsUrl = `wss://cviraqfhphhsonjmrtvu.supabase.co/realtime/v1/websocket?vsn=1.0.0&apikey=${_KEY}`;
    lfWs = new WebSocket(wsUrl);
    lfWs.onopen = ()=>{
      lfWs.send(JSON.stringify({topic:'realtime:public:harvests',event:'phx_join',payload:{},ref:'1'}));
      lfConnected = true;
      document.getElementById('lf-dot').style.background='#16a34a';
      document.getElementById('lf-status').textContent='Live — updates as collectors submit';
    };
    lfWs.onmessage = async (e)=>{
      try{
        const msg = JSON.parse(e.data);
        if(msg.event==='INSERT' || msg.event==='UPDATE'){
          const rec = msg.payload?.record;
          if(!rec) return;
          // harvests table INSERT — has collector directly
          if(rec.collector && rec.harvest_date){
            lfItems.unshift({...rec, group_label:''});
            lfRender();
            if(hvNewActiveTab==='htable') htLoad();
          }
          // harvest_group_items UPDATE to harvested — refresh table
          else if(rec.status==='harvested'){
            if(hvNewActiveTab==='htable') htLoad();
          }
        }
      }catch(err){}
    };
    lfWs.onclose = ()=>{
      lfConnected=false;
      document.getElementById('lf-dot').style.background='#ef4444';
      document.getElementById('lf-status').textContent='Reconnecting…';
      setTimeout(lfConnect, 5000);
    };
    lfWs.onerror = ()=>{ try{lfWs.close();}catch(e){} };
  }catch(err){ console.warn('lfConnect',err); }
}

/* ── RECONCILIATION ── */

// ── RECONCILIATION CONFIRM / NOTES ───────────────────────────────
async function rcConfirmRow(id, btn) {
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const r = await fetch(`${_SB}/rest/v1/harvests?id=eq.${id}`, {
      method: 'PATCH',
      headers: {..._HDR, 'Prefer': 'return=minimal'},
      body: JSON.stringify({ reconcile_status: 'ok' })
    });
    if (r.ok) {
      const row = rcAllRows.find(r=>r.id===id);
      if (row) row.reconcile_status = 'ok';
      // Re-render just this cell
      const cell = btn.closest('td');
      cell.innerHTML = `<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">✅ Confirmed</span>
        <button onclick="rcClearConfirm(${id})" style="margin-left:4px;border:none;background:none;cursor:pointer;font-size:10px;color:#9ca3af;">✕</button>
        <div style="margin-top:4px;"><input id="rcnote-${id}" placeholder="Add note…" value=""
          style="width:100%;padding:2px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:10px;font-family:inherit;"
          onblur="rcSaveNote(${id},this.value)"></div>`;
    } else { btn.disabled=false; btn.textContent='✅ OK'; }
  } catch(e) { btn.disabled=false; btn.textContent='✅ OK'; }
}
async function rcClearConfirm(id) {
  await fetch(`${_SB}/rest/v1/harvests?id=eq.${id}`, {
    method: 'PATCH', headers: {..._HDR, 'Prefer': 'return=minimal'},
    body: JSON.stringify({ reconcile_status: null })
  });
  const row = rcAllRows.find(r=>r.id===id);
  if (row) row.reconcile_status = null;
  rcFilter();
}
async function rcSaveNote(id, val) {
  await fetch(`${_SB}/rest/v1/harvests?id=eq.${id}`, {
    method: 'PATCH', headers: {..._HDR, 'Prefer': 'return=minimal'},
    body: JSON.stringify({ admin_notes: val||null })
  });
  const row = rcAllRows.find(r=>r.id===id);
  if (row) row.admin_notes = val||null;
  // Flash saved
  const inp = document.getElementById('rcnote-'+id);
  if (inp) { inp.style.borderColor='#16a34a'; setTimeout(()=>{ if(inp) inp.style.borderColor='#e5e7eb'; }, 1000); }
}

let rcAllRows = [];
let rcDatesInited = false;

function rcInitDates(){
  const to = new Date(), from = new Date();
  from.setDate(from.getDate()-7); // default to last 7 days for recent view
  document.getElementById('rc-to').value   = to.toISOString().slice(0,10);
  document.getElementById('rc-from').value = from.toISOString().slice(0,10);
  rcDatesInited = true;
}

async function rcRun(){
  console.log('[rcRun] called');
  try {
  // Auto-set dates if not set (last 30 days)
  if(!document.getElementById('rc-from').value || !document.getElementById('rc-to').value){ rcInitDates(); }
  const from = document.getElementById('rc-from').value;
  const to   = document.getElementById('rc-to').value;
  if(!from||!to) return;
  const fromISO = from+'T00:00:00+08:00';
  const toISO   = to  +'T23:59:59+08:00';
  const el = document.getElementById('rc-content');
  document.getElementById('rc-count').textContent='';
  rcAllRows=[];
  // Try bucket cache first
  const _RC_BUCKET = 'https://cviraqfhphhsonjmrtvu.supabase.co/storage/v1/object/public/harvest-history-cache/recon_cache.json';
  if (!rcBypassCache) try {
    const rc = await fetch(_RC_BUCKET + '?t=' + Math.floor(Date.now()/120000));
    if (rc.ok) {
      const d = await rc.json();
      // Cache hit if cache window COVERS requested window (superset) — filter client-side
      const cacheCovers = d.rows && d.rows.length && d.from && d.to && d.from <= from && d.to >= to;
      if (cacheCovers) {
        rcAllRows = d.rows.filter(r=>{
          const hd = r.harvest_date || '';
          return hd >= from && hd <= to;
        });
        const age = Math.round((Date.now() - new Date(d.generated_at||0).getTime())/60000);
        document.getElementById('rc-count').textContent = rcAllRows.length + ' harvests · cache ' + age + 'min ago';
        rcFilter();
        // Refresh in background if older than 10min OR no rows matched (new harvests not in cache)
        if (age > 10 || !rcAllRows.length) setTimeout(()=>rcRunFresh(from,to,fromISO,toISO,el), 100);
        return;
      }
    }
  } catch(e) {}
  el.innerHTML='<div style="padding:30px;text-align:center;color:var(--mu);"><span style="display:inline-block;width:18px;height:18px;border:2px solid var(--bd);border-top-color:var(--blue);border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:8px;"></span>Loading harvests…</div>';
  let harvestRows=[], offset=0;
  while(true){
    const r=await fetch(
      `${_SB}/rest/v1/harvests?harvest_date=gte.${from}&harvest_date=lte.${to}`+
      `&select=id,vendo_id,tg_name,sheet_name,area,coins_total,coins_free,coins_saloy,coins_old,net_collectible,spawn_share,harvested_at,harvest_date,collector,harvest_window_start,route_code,admin_notes,reconcile_status,tg_income,recon_gap,recon_flag,recon_at`+
      `&order=harvest_date.desc&limit=1000&offset=${offset}`,
      {headers:_HDR}
    );
    const batch=await r.json();
    if(!Array.isArray(batch)||!batch.length) break;
    harvestRows.push(...batch.map(r=>({...r, actual_collector:r.collector})));
    if(batch.length<1000) break;
    offset+=1000;
  }
  if(!harvestRows.length){
    el.innerHTML='<div style="padding:30px;text-align:center;color:var(--mu);">No harvests found for this date range</div>';
    return;
  }

  // Check if all rows already have saved recon data
  const allSaved = harvestRows.length > 0 && harvestRows.every(r=>r.recon_at && r.tg_income!=null);
  if(allSaved && !rcBypassCache){
    rcAllRows=harvestRows.map(row=>({
      ...row,
      collector:row.actual_collector||row.collector||'Unknown',
      tg_income:Number(row.tg_income),
      gap:Number(row.recon_gap),
      gap_pct:row.coins_total>0?Math.abs(row.recon_gap)/row.coins_total*100:null,
      flag:row.recon_flag||'nodata',
      is_admin:!row.route_code||row.route_code.toUpperCase()==='ADMIN'||row.route_code.toUpperCase()==='MANUAL'
    }));
    document.getElementById('rc-count').textContent=rcAllRows.length+' harvests · saved '+Math.round((Date.now()-new Date(harvestRows[0].recon_at).getTime())/60000)+'min ago';
    rcFilter();
    return;
  }
  el.innerHTML=`<div style="padding:20px;text-align:center;color:var(--mu);">Fetching TG income for ${harvestRows.length} harvests…</div>`;

  // Build tg_name map: harvest id → tg_name
  const tgMap={};
  harvestRows.forEach(r=>{ if(r.tg_name) tgMap[r.id]=r.tg_name; });

  // Lookup by vendo_id
  const noTgIds=[...new Set(harvestRows.filter(r=>!tgMap[r.id]&&r.vendo_id).map(r=>r.vendo_id))];
  const vendoTgMap={};
  for(let i=0;i<noTgIds.length;i+=200){
    try{
      const rv=await fetch(`${_SB}/rest/v1/vendos?id=in.(${noTgIds.slice(i,i+200).join(',')})&select=id,tg_name&limit=200`,{headers:_HDR});
      const vd=await rv.json();
      vd.forEach(v=>{ if(v.tg_name) vendoTgMap[v.id]=v.tg_name; });
    }catch(e){}
  }
  harvestRows.forEach(r=>{ if(!tgMap[r.id]&&r.vendo_id&&vendoTgMap[r.vendo_id]) tgMap[r.id]=vendoTgMap[r.vendo_id]; });

  // Lookup by sheet_name
  const noTgNames=[...new Set(harvestRows.filter(r=>!tgMap[r.id]&&r.sheet_name).map(r=>r.sheet_name))];
  const sheetTgMap={};
  for(let i=0;i<noTgNames.length;i+=50){
    try{
      const encoded=noTgNames.slice(i,i+50).map(n=>encodeURIComponent(n)).join(',');
      const rv=await fetch(`${_SB}/rest/v1/vendos?or=(${noTgNames.slice(i,i+50).map(n=>`sheet_name.eq.${encodeURIComponent(n)}`).join(',')})&select=sheet_name,tg_name&limit=50`,{headers:_HDR});
      const vd=await rv.json();
      vd.forEach(v=>{ if(v.tg_name) sheetTgMap[v.sheet_name]=v.tg_name; });
    }catch(e){}
  }
  harvestRows.forEach(r=>{ if(!tgMap[r.id]&&r.sheet_name&&sheetTgMap[r.sheet_name]) tgMap[r.id]=sheetTgMap[r.sheet_name]; });

  // Fetch TG income per unique window — PARALLELIZED in batches for speed
  // Key: "tg_name|window_start|harvest_date" to dedupe identical windows
  const tgRowIncomeMap={};
  const uniqueWindows=[];
  const seenKeys=new Set();
  for(const row of harvestRows){
    const tg=tgMap[row.id];
    if(!tg) continue;
    const ws=row.harvest_window_start||from;
    const we=row.harvest_date||to;
    const key=tg+'|'+ws+'|'+we;
    if(seenKeys.has(key)) continue;
    seenKeys.add(key);
    uniqueWindows.push({tg,ws,we,key});
  }
  // Fetch one window's total (handles pagination)
  async function fetchWindowTotal(w){
    let total=0,off2=0;
    while(true){
      try{
        const rt=await fetch(
          `${_SB}/rest/v1/transactions?vendo=eq.${encodeURIComponent(w.tg)}&is_skipped=eq.false&date=gte.${w.ws}&date=lte.${w.we}&select=amount&limit=1000&offset=${off2}`,
          {headers:_HDR}
        );
        const td=await rt.json();
        if(!Array.isArray(td)||!td.length) break;
        total+=td.reduce((s,t)=>s+Number(t.amount||0),0);
        if(td.length<1000) break;
        off2+=1000;
      }catch(e){break;}
    }
    return {key:w.key,total};
  }
  // Run in parallel batches of 10 (avoid overwhelming the API)
  for(let i=0;i<uniqueWindows.length;i+=10){
    const chunk=uniqueWindows.slice(i,i+10);
    const results=await Promise.all(chunk.map(fetchWindowTotal));
    results.forEach(r=>{ tgRowIncomeMap[r.key]=r.total; });
    if(el) el.innerHTML=`<div style="padding:20px;text-align:center;color:var(--mu);">Fetching TG income… ${Math.min(i+10,uniqueWindows.length)}/${uniqueWindows.length}</div>`;
  }
  const tgIncomeMap={}; // legacy compat placeholder

  // Build final rows with true deficit formula
  // True deficit = TG income - (coins_total + saloy)
  rcAllRows=harvestRows.map(row=>{
    const tg=tgMap[row.id]||null;
    const ws=row.harvest_window_start||from;
    const we=row.harvest_date||to;
    const rowKey=tg ? tg+'|'+ws+'|'+we : null;
    const tgInc=rowKey!=null?(tgRowIncomeMap[rowKey]??null):null;
    const coins=Number(row.coins_total||0);
    // coins_total already includes saloy — compare directly with TG income
    const gap=tgInc!=null?tgInc-coins:null; // positive=surplus TG, negative=deficit
    const gapPct=(coins>0&&gap!=null)?Math.abs(gap)/coins*100:null;
    const overAmt=gap!=null&&Math.abs(gap)>500;
    const overPct=gapPct!=null&&gapPct>20;
    const flag=gap==null?'nodata':gap>0&&(overAmt||overPct)?'alert':gap<0&&(overAmt||overPct)?'warn':'ok';
    const rc=row.route_code||'ADMIN';
    const isAdmin=!row.route_code||row.route_code.toUpperCase()==='ADMIN'||row.route_code.toUpperCase()==='MANUAL';
    return {...row,
      collector:row.actual_collector||row.collector||'Unknown',
      tg_name:tg,tg_income:tgInc,gap,gap_pct:gapPct,flag,
      route_code:rc,is_admin:isAdmin
    };
  });

  // Render immediately, then save tg_income/gap/flag to DB in the BACKGROUND
  rcFilter();
  const toSave = rcAllRows.filter(r=>r.tg_income!=null);
  if(toSave.length){
    (async()=>{
      for(let i=0;i<toSave.length;i+=50){
        const batch=toSave.slice(i,i+50);
        try{
          await Promise.all(batch.map(r=>
            fetch(`${_SB}/rest/v1/harvests?id=eq.${r.id}`,{
              method:'PATCH',
              headers:{..._HDR,'Prefer':'return=minimal'},
              body:JSON.stringify({tg_income:r.tg_income,recon_gap:r.gap,recon_flag:r.flag,recon_at:new Date().toISOString()})
            })
          ));
        }catch(e){}
      }
      console.log('[rcRun] background save complete:',toSave.length,'rows');
    })();
  }
  } catch(e) { console.error('rcRun error',e); document.getElementById('rc-content').innerHTML='<div style="padding:20px;text-align:center;color:#dc2626;">Error: '+e.message+'</div>'; }
}

let rcBypassCache = false;
async function rcRunFresh(from,to,fromISO,toISO,el){ 
  rcBypassCache = true;
  rcAllRows = [];
  await rcRun();
  rcBypassCache = false;
}

function rcShowNamesById(harvestId){
  const row=(rcAllRows||[]).find(r=>r.id===harvestId);
  if(!row){toast('Row not found');return;}
  rcShowNames(row.vendo_name||row.sheet_name||'',row.sheet_name||'',row.tg_name||'',row.area||'',row);
}
async function rcShowNames(vendoName, sheetName, tgName, area, harvestRow){
  window._rcnHarvestRow = harvestRow || null;
  // Create overlay
  let overlay = document.getElementById('rc-names-overlay');
  if(overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'rc-names-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:center;justify-content:center;';
  overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };

  const matchStatus = tgName
    ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">✅ Matched</span>'
    : '<span style="background:#fef9c3;color:#b45309;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">⚠ Unmatched</span>';

  overlay.innerHTML = `
  <div style="background:#fff;border-radius:14px;width:90%;max-width:520px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">
    <div style="background:linear-gradient(135deg,#1e3cb8,#1565c0);color:#fff;padding:14px 18px;border-radius:14px 14px 0 0;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:14px;font-weight:700;">${sheetName||vendoName||'—'}</div>
        <div style="font-size:11px;opacity:.8;">${area||''}</div>
      </div>
      <button onclick="document.getElementById('rc-names-overlay').remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:16px;width:28px;height:28px;border-radius:50%;cursor:pointer;">✕</button>
    </div>
    <div style="padding:16px;" id="rcn-body">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:#1e293b;">Name Matching Status</div>
        ${matchStatus}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:12px;">
          <div style="font-size:10px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">📋 Excel / Sheet Name</div>
          <div style="font-size:13px;font-weight:700;color:#0c4a6e;">${sheetName||'<span style="color:#9ca3af;font-style:italic;font-weight:400;">Not set</span>'}</div>
          ${sheetName?'<div style="font-size:10px;color:#0369a1;margin-top:4px;">Used in dashboard display</div>':''}
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;">
          <div style="font-size:10px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">📡 TG Name</div>
          <div style="font-size:13px;font-weight:600;color:#14532d;">${tgName||'<span style="color:#9ca3af;font-style:italic;font-weight:400;">Not linked</span>'}</div>
          ${tgName?'<div style="font-size:10px;color:#15803d;margin-top:4px;">Used for TG income matching</div>':'<div style="font-size:10px;color:#d97706;margin-top:4px;">⚠ No TG income can be fetched</div>'}
        </div>
      </div>
      <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:10px;padding:14px;margin-bottom:12px;">
        <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:10px;">Edit Names</div>
        <div style="margin-bottom:8px;">
          <label style="font-size:11px;color:#6b7280;font-weight:500;">Excel / Sheet Name</label>
          <input id="rcn-sheet" value="${(sheetName||'').replace(/"/g,'&quot;')}" placeholder="Name from Excel file..." autocomplete="off"
            style="width:100%;height:32px;padding:0 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-top:3px;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:10px;">
          <label style="font-size:11px;color:#6b7280;font-weight:500;">TG Name (for income matching)</label>
          <div style="position:relative;margin-top:3px;">
            <input id="rcn-tg" value="${(tgName||'').replace(/"/g,'&quot;')}" placeholder="Search TG name..." oninput="rcnTgSearch(this.value)" autocomplete="off"
              style="width:100%;height:32px;padding:0 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;">
            <div id="rcn-tg-results" style="display:none;position:absolute;top:34px;left:0;right:0;background:#fff;border:1px solid #1565c0;border-radius:6px;max-height:160px;overflow-y:auto;z-index:10;box-shadow:0 4px 12px rgba(0,0,0,.1);"></div>
          </div>
        </div>
        <button onclick="rcnSaveNames(${JSON.stringify(vendoName).replace(/"/g,'&quot;')})" style="height:32px;padding:0 16px;background:#1565c0;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">💾 Save Names</button>
        <span id="rcn-msg" style="margin-left:10px;font-size:11px;"></span>
      </div>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px;margin-bottom:12px;">
        <div style="font-size:12px;font-weight:600;color:#c2410c;margin-bottom:6px;">🗓 Harvest Window</div>
        <div style="font-size:11px;color:#92400e;margin-bottom:10px;">Changes reconciliation window — TG income is fetched between window start and harvest date.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          <div>
            <label style="font-size:11px;color:#6b7280;font-weight:500;">Window Start</label>
            <input type="date" id="rcn-window-start" value="${(harvestRow&&harvestRow.harvest_window_start)||''}"
              style="width:100%;height:32px;padding:0 8px;border:1px solid #fed7aa;border-radius:6px;font-size:13px;margin-top:3px;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:11px;color:#6b7280;font-weight:500;">Harvest Date</label>
            <input type="date" id="rcn-harvest-date" value="${(harvestRow&&harvestRow.harvest_date)||''}"
              style="width:100%;height:32px;padding:0 8px;border:1px solid #fed7aa;border-radius:6px;font-size:13px;margin-top:3px;box-sizing:border-box;">
          </div>
        </div>
        ${harvestRow?`<div style="font-size:10px;color:#92400e;margin-bottom:8px;">Harvest ID: <b>${harvestRow.id||'—'}</b> · Collector: <b>${harvestRow.collector||'—'}</b></div>`:'<div style="font-size:10px;color:#9ca3af;margin-bottom:8px;">No harvest record linked.</div>'}
        <button onclick="rcnSaveHarvestWindow()" style="height:32px;padding:0 16px;background:#ea580c;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">🗓 Update Harvest Window</button>
        <span id="rcn-window-msg" style="margin-left:10px;font-size:11px;"></span>
      </div>
      <div id="rcn-suggestions"></div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  // Load suggestions if unmatched
  if(!tgName && sheetName){
    const words = sheetName.split(/\s+/).filter(w=>w.length>3);
    const q = words.slice(0,2).join(' ');
    if(q){
      try{
        const r = await fetch(`${_SB}/rest/v1/vendos?tg_name=ilike.*${encodeURIComponent(q)}*&sheet_name=is.null&status=eq.active&select=id,tg_name,area,vlan&limit=5&order=tg_name.asc`,{headers:_HDR});
        const suggestions = await r.json();
        if(suggestions.length){
          const sd = document.getElementById('rcn-suggestions');
          if(sd){
            let sh = `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;">
              <div style="font-size:12px;font-weight:600;color:#b45309;margin-bottom:8px;">💡 Possible TG matches — click to link immediately</div>`;
            suggestions.forEach(s=>{
              const safeTg = JSON.stringify(s.tg_name);
              sh += `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#fff;border-radius:6px;margin-bottom:6px;border:1px solid #fde68a;">
                <div><div style="font-weight:500;color:#1e293b;">${s.tg_name}</div><div style="font-size:10px;color:#6b7280;">${s.area||''} · VLAN ${s.vlan||'—'}</div></div>
                <button onclick="rcnQuickLink(${JSON.stringify(vendoName).replace(/"/g,'&quot;')},${safeTg.replace(/"/g,'&quot;')})" style="height:28px;padding:0 14px;background:#15803d;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">✅ Link & Save</button>
              </div>`;
            });
            sh += '</div>';
            sd.innerHTML = sh;
          }
        }
      }catch(e){}
    }
  }
}

let _rcnTgResults = [];
async function rcnTgSearch(q){
  const el = document.getElementById('rcn-tg-results');
  if(!el) return;
  q = (q||'').trim();
  if(!q){el.style.display='none';return;}
  el.style.display='';
  el.innerHTML='<div style="padding:8px 10px;color:var(--mu);font-size:12px;">Searching…</div>';
  try{
    const r = await fetch(`${_SB}/rest/v1/vendos?tg_name=ilike.*${encodeURIComponent(q)}*&select=tg_name,sheet_name,area&limit=20&order=tg_name.asc`,{headers:_HDR});
    _rcnTgResults = await r.json();
    if(!_rcnTgResults.length){el.innerHTML='<div style="padding:8px 10px;color:var(--mu);font-size:12px;">No matches</div>';return;}
    el.innerHTML=_rcnTgResults.map((v,i)=>`<div onclick="rcnTgPick(${i})"
      style="padding:7px 10px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:12px;"
      onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background=''">
      <div style="font-weight:600">${v.tg_name}</div>
      <div style="font-size:10px;color:var(--mu)">${v.sheet_name||''} · ${v.area||''}</div>
    </div>`).join('');
  }catch(e){}
}
function rcnTgPick(i){
  const v=_rcnTgResults[i]; if(!v)return;
  const inp=document.getElementById('rcn-tg');
  if(inp){inp.value=v.tg_name;}
  const el=document.getElementById('rcn-tg-results');
  if(el)el.style.display='none';
}

async function rcnSaveNames(vendoName){
  const pw=prompt('Admin password:'); if(pw!=='101510'){toast('Wrong password');return;}
  const sheet=(document.getElementById('rcn-sheet')?.value||'').trim();
  const tg=(document.getElementById('rcn-tg')?.value||'').trim();
  const msg=document.getElementById('rcn-msg');
  const row=window._rcnHarvestRow;
  try{
    // Prefer the exact vendo_id from the harvest row (avoids wrong-duplicate match);
    // fall back to name lookup only if vendo_id is missing.
    let id = row && row.vendo_id ? row.vendo_id : null;
    if(!id){
      const r=await fetch(`${_SB}/rest/v1/vendos?select=id&limit=1&or=(tg_name.eq.${encodeURIComponent(vendoName)},sheet_name.eq.${encodeURIComponent(vendoName)})`,{headers:_HDR});
      const rows=await r.json();
      if(!rows.length){if(msg){msg.textContent='Vendo not found';msg.style.color='#dc2626';}return;}
      id=rows[0].id;
    }
    const u={};
    if(sheet) u.sheet_name=sheet;
    if(tg){ u.tg_name=tg; u.tg_match_confirmed=true; }
    const r2=await fetch(`${_SB}/rest/v1/vendos?id=eq.${id}`,{method:'PATCH',headers:{..._HDR,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(u)});
    if(r2.ok){
      toast('✅ Names saved!');
      htAllRows=[];
      // update local cache row so reopening shows fresh values
      if(row){ if(sheet) row.sheet_name=sheet; if(tg) row.tg_name=tg; }
      if(msg){msg.textContent='Saved';msg.style.color='#15803d';}
    }else{
      const errText=await r2.text();
      if(msg){msg.textContent='Save failed: '+errText.slice(0,40);msg.style.color='#dc2626';}
    }
  }catch(e){if(msg){msg.textContent='Error: '+e.message;msg.style.color='#dc2626';}}
}


async function rcnSaveHarvestWindow(){
  const row=window._rcnHarvestRow;
  const msg=document.getElementById('rcn-window-msg');
  if(!row||!row.id){ if(msg){msg.textContent='No harvest record linked';msg.style.color='#dc2626';} return; }
  const ws=(document.getElementById('rcn-window-start')?.value||'').trim();
  const hd=(document.getElementById('rcn-harvest-date')?.value||'').trim();
  if(!ws&&!hd){ if(msg){msg.textContent='Enter at least one date';msg.style.color='#dc2626';} return; }
  const pw=prompt('Admin password:'); if(pw!=='101510'){toast('Wrong password');return;}
  const u={};
  if(ws) u.harvest_window_start=ws;
  if(hd) u.harvest_date=hd;
  try{
    const r=await fetch(`${_SB}/rest/v1/harvests?id=eq.${row.id}`,{method:'PATCH',
      headers:{..._HDR,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify(u)});
    if(r.ok){
      // keep vendos.last_harvest_date in sync if harvest_date changed
      if(hd && row.vendo_id){
        await fetch(`${_SB}/rest/v1/vendos?id=eq.${row.vendo_id}`,{method:'PATCH',
          headers:{..._HDR,'Content-Type':'application/json',Prefer:'return=minimal'},
          body:JSON.stringify({last_harvest_date:hd})});
      }
      // update local cache row
      Object.assign(row,u);
      const cacheRow=(rcAllRows||[]).find(x=>x.id===row.id);
      if(cacheRow) Object.assign(cacheRow,u);
      toast('✅ Harvest window updated!');
      if(msg){msg.textContent='Saved';msg.style.color='#15803d';}
    }else{
      const errText=await r.text();
      if(msg){msg.textContent='Failed: '+errText.slice(0,40);msg.style.color='#dc2626';}
    }
  }catch(e){ if(msg){msg.textContent='Error: '+e.message;msg.style.color='#dc2626';} }
}

async function rcnQuickLink(vendoName, tgName){
  const pw=prompt('Admin password:'); if(pw!=='101510'){toast('Wrong password');return;}
  try{
    const r=await fetch(`${_SB}/rest/v1/vendos?select=id&limit=1&or=(tg_name.eq.${encodeURIComponent(vendoName)},sheet_name.eq.${encodeURIComponent(vendoName)})`,{headers:_HDR});
    const rows=await r.json();
    if(!rows.length){toast('Vendo not found');return;}
    const id=rows[0].id;
    const r2=await fetch(`${_SB}/rest/v1/vendos?id=eq.${id}`,{method:'PATCH',headers:{..._HDR,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({tg_name:tgName,tg_match_confirmed:true})});
    if(r2.ok){
      toast('✅ Linked! TG name saved.');
      htAllRows=[];
      document.getElementById('rc-names-overlay')?.remove();
    }else toast('Save failed');
  }catch(e){toast('Error: '+e.message);}
}
function rcFilter(){
  const area=document.getElementById('rc-area').value;
  const col =document.getElementById('rc-collector').value;
  const rows=rcAllRows.filter(r=>{
    if(area&&r.area!==area) return false;
    if(col&&r.collector!==col) return false;
    return true;
  });

  // Populate collector dropdown
  const collectors=[...new Set(rcAllRows.map(r=>r.collector).filter(Boolean))].sort();
  const rcSel=document.getElementById('rc-collector');
  if(rcSel){
    const prev=rcSel.value;
    rcSel.innerHTML='<option value="">All collectors</option>';
    collectors.forEach(c=>{ rcSel.innerHTML+=`<option${c===prev?' selected':''}>${c}</option>`; });
  }

  document.getElementById('rc-count').textContent=rows.length+' harvests';
  const el=document.getElementById('rc-content');
  if(!rows.length){el.innerHTML='<div style="padding:20px;text-align:center;color:var(--mu);">No results</div>';return;}

  // ── Group: Collector → Date → Route → Vendos ──────────────────
  const byCollector={};
  rows.forEach(r=>{
    const c=r.collector;
    if(!byCollector[c]) byCollector[c]={rows:[],dates:{}};
    byCollector[c].rows.push(r);
    const dt=r.harvest_date||'unknown';
    if(!byCollector[c].dates[dt]) byCollector[c].dates[dt]={rows:[],routes:{}};
    byCollector[c].dates[dt].rows.push(r);
    const rc=r.route_code||'ADMIN';
    if(!byCollector[c].dates[dt].routes[rc]) byCollector[c].dates[dt].routes[rc]={rows:[],is_admin:r.is_admin};
    byCollector[c].dates[dt].routes[rc].rows.push(r);
  });

  const fmtP=v=>_php(v);
  const flagBadge=f=>f==='alert'
    ?'<span style="background:#fee2e2;color:#dc2626;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:700;">🔴 Short</span>'
    :f==='warn'
    ?'<span style="background:#fef9c3;color:#b45309;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:700;">🟡 Surplus</span>'
    :f==='nodata'
    ?'<span style="background:#e8eef7;color:#3b5b8c;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:700;">🔗 needs match</span>'
    :'<span style="background:#dcfce7;color:#15803d;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:700;">✅ OK</span>';
  const diffStr=(gap,pct)=>{
    if(gap==null) return '<span style="color:#9ca3af">—</span>';
    // gap = TG income - coins_total
    // positive = surplus (TG > coins) = yellow
    // negative = short (coins > TG) = red
    const c=gap>100?'#dc2626':gap<-100?'#b45309':'#15803d';
    const bg=gap>100?'#fee2e2':gap<-100?'#fefce8':'#dcfce7';
    const sign=gap>=0?'+':'';
    return `<span style="color:${c};font-weight:700;background:${bg};padding:1px 6px;border-radius:4px;">${sign}${fmtP(gap)}</span>`;
  };

  let html='';
  Object.entries(byCollector).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([collector,cd])=>{
    const colCoins=cd.rows.reduce((s,r)=>s+Number(r.coins_total||0),0);
    const colTG=cd.rows.filter(r=>r.tg_income!=null).reduce((s,r)=>s+r.tg_income,0);
    const colGap=cd.rows.filter(r=>r.gap!=null).reduce((s,r)=>s+r.gap,0);
    const colAlerts=cd.rows.filter(r=>r.flag==='alert').length;
    const colWarns=cd.rows.filter(r=>r.flag==='warn').length;
    const colGapColor=colGap>500?'#dc2626':colGap>100?'#d97706':'#15803d';

    html+=`<div style="background:#fff;border:1.5px solid #c7d2fe;border-radius:12px;margin-bottom:14px;overflow:hidden;">
      <!-- Collector header -->
      <div style="background:linear-gradient(135deg,#1e3cb8,#1565c0);color:#fff;padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="font-size:15px;font-weight:700;">👤 ${collector}</div>
        <div style="font-size:12px;opacity:.85;">${cd.rows.length} harvests</div>
        ${colAlerts?`<span style="background:rgba(220,38,38,.9);padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;">${colAlerts} ALERT</span>`:''}
        ${colWarns?`<span style="background:rgba(217,119,6,.9);padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;">${colWarns} SURPLUS</span>`:''}
        <div style="margin-left:auto;display:flex;gap:16px;text-align:right;">
          <div><div style="font-size:11px;opacity:.7;">Coins Total</div><div style="font-size:14px;font-weight:700;">${fmtP(colCoins)}</div></div>
          <div><div style="font-size:11px;opacity:.7;">TG Income</div><div style="font-size:14px;font-weight:700;">${fmtP(colTG)}</div></div>
          <div><div style="font-size:11px;opacity:.7;">True Gap</div><div style="font-size:14px;font-weight:700;color:${colGapColor==='#15803d'?'#86efac':colGapColor==='#d97706'?'#fde68a':'#fca5a5'};">${colGap>=0?'+':''}${fmtP(colGap)}</div></div>
        </div>
      </div>
      <!-- Date blocks -->
      <div style="padding:10px 12px;display:flex;flex-direction:column;gap:10px;">`;

    Object.entries(cd.dates).sort((a,b)=>b[0].localeCompare(a[0])).forEach(([dt,dd])=>{
      const dtCoins=dd.rows.reduce((s,r)=>s+Number(r.coins_total||0),0);
      const dtTG=dd.rows.filter(r=>r.tg_income!=null).reduce((s,r)=>s+r.tg_income,0);
      const dtGap=dd.rows.filter(r=>r.gap!=null).reduce((s,r)=>s+r.gap,0);
      const dtAlerts=dd.rows.filter(r=>r.flag==='alert').length;
      const dtWarns=dd.rows.filter(r=>r.flag==='warn').length;
      const dtGapColor=dtGap>500?'#dc2626':dtGap>100?'#d97706':'#15803d';

      html+=`<div style="border:1px solid #e0e7ff;border-radius:8px;overflow:hidden;">
        <div style="background:#eef2ff;padding:7px 12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #e0e7ff;">
          <span style="font-size:12px;font-weight:700;color:#3730a3;">📅 ${dt}</span>
          <span style="font-size:11px;color:#6b7280;">${dd.rows.length} vendos</span>
          ${dtAlerts?`<span style="background:#fee2e2;color:#dc2626;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;">${dtAlerts} ALERT</span>`:''}
          ${dtWarns?`<span style="background:#fef9c3;color:#b45309;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;">${dtWarns} SURPLUS</span>`:''}
          <div style="margin-left:auto;font-size:11px;display:flex;gap:10px;">
            <span>Coins: <b>${fmtP(dtCoins)}</b></span>
            <span>TG: <b>${fmtP(dtTG)}</b></span>
            <span>Gap: <b style="color:${dtGapColor};">${dtGap>=0?'+':''}${fmtP(dtGap)}</b></span>
          </div>
        </div>
        <div style="padding:6px 8px;display:flex;flex-direction:column;gap:6px;">`;

    Object.entries(dd.routes).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([rc,rd])=>{
      const rcCoins=rd.rows.reduce((s,r)=>s+Number(r.coins_total||0),0);
      const rcTG=rd.rows.filter(r=>r.tg_income!=null).reduce((s,r)=>s+r.tg_income,0);
      const rcGap=rd.rows.filter(r=>r.gap!=null).reduce((s,r)=>s+r.gap,0);
      const rcAlerts=rd.rows.filter(r=>r.flag==='alert').length;
      const rcWarns=rd.rows.filter(r=>r.flag==='warn').length;
      const rcGapColor=rcGap>500?'#dc2626':rcGap>100?'#d97706':'#15803d';
      const srcBadge=rd.is_admin
        ?'<span style="background:#fef3c7;color:#b45309;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700;">🔧 Admin</span>'
        :'<span style="background:#eff6ff;color:#1d4ed8;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700;">📱 PWA</span>';

      html+=`<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <!-- Route header -->
        <div style="background:#f8faff;padding:8px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid #e5e7eb;">
          <span style="font-family:monospace;font-size:12px;font-weight:700;color:#1565c0;">🧾 ${rc}</span>
          ${srcBadge}
          <span style="font-size:11px;color:var(--mu);">${rd.rows.length} vendos</span>
          ${rcAlerts?`<span style="background:#fee2e2;color:#dc2626;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;">${rcAlerts} ALERT</span>`:''}
          ${rcWarns?`<span style="background:#fef9c3;color:#b45309;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;">${rcWarns} SURPLUS</span>`:''}
          <div style="margin-left:auto;display:flex;gap:12px;font-size:11px;">
            <span>Coins: <b>${fmtP(rcCoins)}</b></span>
            <span>TG: <b>${fmtP(rcTG)}</b></span>
            <span>Gap: <b style="color:${rcGapColor};">${rcGap>=0?'+':''}${fmtP(rcGap)}</b></span>
          </div>
        </div>
        <!-- Vendo table -->
        <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead><tr style="background:#f9fafb;">
            <th style="padding:5px 8px;text-align:left;color:var(--mu);font-weight:600;border-bottom:1px solid #f3f4f6;">Vendo</th>
            <th style="padding:5px 8px;text-align:left;color:var(--mu);font-weight:600;border-bottom:1px solid #f3f4f6;">Area</th>
            <th style="padding:5px 8px;text-align:left;color:var(--mu);font-weight:600;border-bottom:1px solid #f3f4f6;">Last Harvest</th>
            <th style="padding:5px 8px;text-align:left;color:var(--mu);font-weight:600;border-bottom:1px solid #f3f4f6;">Window</th>
            <th style="padding:5px 8px;text-align:right;color:var(--mu);font-weight:600;border-bottom:1px solid #f3f4f6;">Coins</th>
            <th style="padding:5px 8px;text-align:right;color:var(--mu);font-weight:600;border-bottom:1px solid #f3f4f6;">TG Income</th>
            <th style="padding:5px 8px;text-align:right;color:var(--mu);font-weight:600;border-bottom:1px solid #f3f4f6;">True Gap</th>
            <th style="padding:5px 8px;text-align:center;color:var(--mu);font-weight:600;border-bottom:1px solid #f3f4f6;">Flag</th>
            <th style="padding:5px 8px;text-align:left;color:var(--mu);font-weight:600;border-bottom:1px solid #f3f4f6;">Confirm / Note</th>
          </tr></thead>
          <tbody>
          ${rd.rows.map(h=>{
            const rowBg=h.flag==='alert'?'background:#fef2f2;':h.flag==='warn'?'background:#fefce8;':h.flag==='nodata'?'background:#f3f6fb;':'';
            const tgStr=h.tg_income!=null?fmtP(h.tg_income):'<span style="color:#9ca3af;font-style:italic;">no match</span>';
            const noTgBadge=!h.tg_name?'<span style="background:#fef3c7;color:#b45309;font-size:9px;padding:0 4px;border-radius:3px;margin-left:4px;">no TG</span>':'';
            return `<tr style="${rowBg}">
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;">
                <div style="display:flex;align-items:center;gap:4px;">
                  <span>${h.sheet_name||`<span style="color:#9ca3af;font-style:italic;font-size:9px;">unmatched</span>`}${noTgBadge}</span>
                  <button onclick="rcShowNamesById(${h.id})" style="border:none;background:none;cursor:pointer;font-size:11px;padding:0 2px;line-height:1;" title="View/Edit TG Name">🔗</button>
                </div>
              </td>
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;">${h.area||'—'}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;font-weight:500;">${h.harvest_date||'—'}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;color:var(--mu);font-size:10px;">${h.harvest_window_start||'—'} → ${h.harvest_date||'—'}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${fmtP(h.coins_total)}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${tgStr}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${diffStr(h.gap,h.gap_pct)}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:center;">${flagBadge(h.flag)}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;min-width:180px;">
                ${h.reconcile_status==='ok'
                  ? `<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">✅ Confirmed</span>
                     <button onclick="rcClearConfirm(${h.id})" style="margin-left:4px;border:none;background:none;cursor:pointer;font-size:10px;color:#9ca3af;">✕</button>`
                  : `<button onclick="rcConfirmRow(${h.id},this)" style="padding:2px 8px;border-radius:6px;border:1px solid #16a34a;background:#f0fdf4;color:#15803d;font-size:10px;font-weight:600;cursor:pointer;">✅ OK</button>`}
                <div style="margin-top:4px;">
                  <input id="rcnote-${h.id}" placeholder="Add note…" value="${(h.admin_notes||'').replace(/"/g,'&quot;')}"
                    style="width:100%;padding:2px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:10px;font-family:inherit;"
                    onblur="rcSaveNote(${h.id},this.value)">
                </div>
              </td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
        </div>
      </div>`;
    });

        html+='</div></div>'; // end date block
      }); // end dates loop
    html+='</div></div></div></div>'; // close date inner, date container, routes wrapper, collector
  });

  el.innerHTML=html;
}

/* ── AUTO-LOAD on panel activation ── */
(function(){
  const origShowP = window.showP;
  window.showP = function(panel, btn){
    if(origShowP) origShowP(panel, btn);
    if(panel==='dash') loadDashboard();
    if(panel==='harvest'){ htLoad(); lfConnect(); }
    if(panel==='vmap-top'){ setTimeout(()=>{ if(window._vmtMap) _vmtMap.invalidateSize(); },300); setTimeout(()=>{ if(window._vmtMap) _vmtMap.invalidateSize(); },700); }
  };
})();

setInterval(()=>{ if(hvNewActiveTab==='htable' && document.getElementById('panel-harvest')?.classList.contains('active')) htLoad(); }, 60000);
// auto-refresh removed — user clicks Refresh manually

async function loadProgress(){
  const el = document.getElementById('progress-content');
  el.innerHTML = '<div style="padding:30px;text-align:center;color:#6b7280;">Loading…</div>';
  document.getElementById('progress-updated').textContent = '';
  try {
    const phNow = new Date(Date.now() + (8*60*60*1000));
    const today = phNow.toISOString().slice(0,10);

    const [rH, rGPS] = await Promise.all([
      fetch(`${_SB}/rest/v1/harvests?harvest_date=eq.${today}&select=id,vendo_name,sheet_name,tg_name,area,collector,coins_total,net_collectible,spawn_share,harvested_at,collector_note&order=harvested_at.desc&limit=300`,{headers:_HDR}),
      Promise.resolve([])  // GPS built from vendo table below
    ]);
    const rows = await rH.json();
    // Build GPS points from vendos table using today's harvested vendo names
    let gpsRows = [];
    if(rows.length){
      const names = [...new Set(rows.map(h=>h.tg_name||h.sheet_name||h.vendo_name).filter(Boolean))];
      // fetch GPS from vendos for these names
      const nameChunks = [];
      for(let i=0;i<names.length;i+=20) nameChunks.push(names.slice(i,i+20));
      const gpsVendos = [];
      for(const chunk of nameChunks){
        const q = chunk.map(n=>`tg_name.eq.${encodeURIComponent(n)},sheet_name.eq.${encodeURIComponent(n)}`).join(',');
        try{
          const rv = await fetch(`${_SB}/rest/v1/vendos?or=(${q})&select=tg_name,sheet_name,lat,lng&lat=not.is.null`,{headers:_HDR});
          const vd = await rv.json();
          if(Array.isArray(vd)) gpsVendos.push(...vd);
        }catch(e){}
      }
      // Match harvest rows with vendo GPS
      const vendoGpsMap = {};
      gpsVendos.forEach(v=>{ const k=v.tg_name||v.sheet_name; if(k&&v.lat) vendoGpsMap[k]={lat:v.lat,lng:v.lng}; });
      gpsRows = rows.map(h=>{
        const key = h.tg_name||h.sheet_name||h.vendo_name;
        const gps = vendoGpsMap[key];
        if(!gps) return null;
        return {...h, lat_captured:gps.lat, lng_captured:gps.lng};
      }).filter(Boolean);
    }

    const totalCoins = rows.reduce((s,h)=>s+(parseFloat(h.coins_total)||0),0);
    const totalSpawn = rows.reduce((s,h)=>s+(parseFloat(h.spawn_share)||0),0);
    const collectors = [...new Set(rows.map(h=>h.collector).filter(Boolean))];

    let html = `<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      <div style="background:#fff;border:1.5px solid #e0e7ff;border-radius:10px;padding:10px 18px;flex:1;min-width:100px;text-align:center;">
        <div style="font-size:10px;color:#6b7280;margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px;">Harvests</div>
        <div style="font-size:26px;font-weight:700;color:#1565c0;">${rows.length}</div>
      </div>
      <div style="background:#fff;border:1.5px solid #bbf7d0;border-radius:10px;padding:10px 18px;flex:1;min-width:100px;text-align:center;">
        <div style="font-size:10px;color:#6b7280;margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px;">Coins</div>
        <div style="font-size:26px;font-weight:700;color:#15803d;">₱${Math.round(totalCoins).toLocaleString()}</div>
      </div>
      <div style="background:#fff;border:1.5px solid #bbf7d0;border-radius:10px;padding:10px 18px;flex:1;min-width:100px;text-align:center;">
        <div style="font-size:10px;color:#6b7280;margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px;">Spawn Share</div>
        <div style="font-size:26px;font-weight:700;color:#15803d;">₱${Math.round(totalSpawn).toLocaleString()}</div>
      </div>
      <div style="background:#fff;border:1.5px solid #e0e7ff;border-radius:10px;padding:10px 18px;flex:1;min-width:100px;text-align:center;">
        <div style="font-size:10px;color:#6b7280;margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px;">Collectors</div>
        <div style="font-size:26px;font-weight:700;color:#1565c0;">${collectors.length}</div>
      </div>
    </div>`;

    // Map
    if(window.L){
      html += `<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;margin-bottom:14px;overflow:hidden;">
        <div style="background:#1e293b;color:#fff;padding:10px 16px;font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px;">
          🗺 Live Field Map — Zamboanga del Norte
          <span style="font-size:10px;font-weight:400;opacity:.6;">${Array.isArray(gpsRows)?gpsRows.length:0} GPS points today</span>
          <div style="margin-left:auto;display:flex;gap:12px;font-size:10px;font-weight:400;">
            <span>🟢 &lt;30min</span><span>🟡 30–60min</span><span>🔴 &gt;1hr</span>
          </div>
        </div>
        <div id="progress-map" style="height:300px;width:100%;"></div>
      </div>`;
    }

    if(!rows.length){
      html += '<div style="padding:40px;text-align:center;color:#6b7280;font-size:13px;background:#fff;border-radius:10px;border:1px solid #e5e7eb;">No harvests today yet.</div>';
      el.innerHTML = html;
      if(window.L) _initProgressMap(gpsRows);
      document.getElementById('progress-updated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
      return;
    }

    const byCollector = {};
    rows.forEach(h => { const c=h.collector||'Unknown'; if(!byCollector[c]) byCollector[c]=[]; byCollector[c].push(h); });

    Object.entries(byCollector).forEach(([collector, harvests]) => {
      const cCoins = harvests.reduce((s,h)=>s+(parseFloat(h.coins_total)||0),0);
      const cSpawn = harvests.reduce((s,h)=>s+(parseFloat(h.spawn_share)||0),0);
      html += `<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;margin-bottom:14px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1565c0,#1976d2);color:#fff;padding:11px 16px;display:flex;align-items:center;gap:10px;">
          <div style="font-size:16px;font-weight:700;cursor:pointer;" onclick="lfFlyToCollector('${collector}')" title="Click to locate on map">👤 ${collector}</div>
          <span style="background:rgba(255,255,255,.2);padding:2px 10px;border-radius:10px;font-size:11px;">${harvests.length} harvested</span>
          <div style="margin-left:auto;display:flex;gap:18px;text-align:right;">
            <div><div style="font-size:10px;opacity:.7;">Coins</div><div style="font-weight:700;">₱${Math.round(cCoins).toLocaleString()}</div></div>
            <div><div style="font-size:10px;opacity:.7;">Spawn</div><div style="font-weight:700;">₱${Math.round(cSpawn).toLocaleString()}</div></div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f8faff;border-bottom:1px solid #e5e7eb;">
            <th style="padding:7px 12px;text-align:left;color:#6b7280;font-weight:600;font-size:11px;">Time</th>
            <th style="padding:7px 12px;text-align:left;color:#6b7280;font-weight:600;font-size:11px;">Vendo</th>
            <th style="padding:7px 12px;text-align:left;color:#6b7280;font-weight:600;font-size:11px;">Area</th>
            <th style="padding:7px 12px;text-align:right;color:#6b7280;font-weight:600;font-size:11px;">Coins</th>
            <th style="padding:7px 12px;text-align:right;color:#6b7280;font-weight:600;font-size:11px;">Spawn</th>
          </tr></thead><tbody>`;
      harvests.forEach((h,i) => {
        const t = h.harvested_at?new Date(h.harvested_at).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}):'—';
        const name = h.sheet_name||h.vendo_name||h.tg_name||'—';
        const bg = i%2===0?'#fff':'#f9fafb';
        const sn = (name).replace(/'/g,"\'");
        html += `<tr style="background:${bg};cursor:pointer;" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='${bg}'" onclick="vmZoomToProgress('${sn}')">
          <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;white-space:nowrap;">${t}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;font-weight:500;color:#1e293b;cursor:pointer;" onclick="progressFlyTo(${JSON.stringify(sn).replace(/"/g,'&quot;')})" title="Show on map">${name} <span style="font-size:9px;color:#1565c0;">📍</span></td>
          <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:11px;">${h.area||'—'}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;color:#1e293b;">₱${Math.round(h.coins_total||0).toLocaleString()}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;color:#15803d;">₱${Math.round(h.spawn_share||0).toLocaleString()}</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    });

    el.innerHTML = html;
    if(window.L) _initProgressMap(gpsRows);
    document.getElementById('progress-updated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
  } catch(e){
    el.innerHTML = `<div style="padding:20px;text-align:center;color:#dc2626;">Error: ${e.message}</div>`;
  }
}

let _progressMap = null;
function _initProgressMap(gpsRows){
  if(!window.L) return;
  setTimeout(()=>{
    const mapEl = document.getElementById('progress-map');
    if(!mapEl) return;
    if(_progressMap){ _progressMap.remove(); _progressMap=null; }
    _progressMap = L.map('progress-map').setView([8.15,123.27],10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(_progressMap);
    if(!Array.isArray(gpsRows)||!gpsRows.length) return;
    window._progressMarkers={};
    const now=Date.now(), bounds=[];
    gpsRows.forEach(row=>{
      if(!row.lat_captured||!row.lng_captured) return;
      const lat=parseFloat(row.lat_captured),lng=parseFloat(row.lng_captured);
      if(isNaN(lat)||isNaN(lng)) return;
      const minsAgo=row.harvested_at?(now-new Date(row.harvested_at).getTime())/60000:999;
      const color=minsAgo<30?'#16a34a':minsAgo<60?'#d97706':'#dc2626';
      const name=row.sheet_name||row.tg_name||'?';
      const t=row.harvested_at?new Date(row.harvested_at).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}):'—';
      const collector=row.collector||row.harvest_groups?.collector||'';
      const icon=L.divIcon({className:'',html:`<div style="text-align:center;"><div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4);margin:0 auto;"></div>${collector?`<div style="background:#1e293b;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:5px;white-space:nowrap;margin-top:2px;display:inline-block;">👤 ${collector}</div>`:''}<div style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;white-space:nowrap;margin-top:2px;display:inline-block;">${name}</div><div style="color:#555;font-size:9px;">${t}</div></div>`,iconAnchor:[7,7]});
      const _m=L.marker([lat,lng],{icon}).addTo(_progressMap).bindPopup(`<b>${name}</b><br>${collector?'👤 '+collector+'<br>':''}${t}`); window._progressMarkers[name]=_m;
      _m.on('click',function(){ _progressMap.flyTo([lat,lng],18,{animate:true,duration:0.8}); });
      bounds.push([lat,lng]);
    });
    if(bounds.length===1)_progressMap.setView(bounds[0],15);
    else if(bounds.length>1)_progressMap.fitBounds(bounds,{padding:[40,40],maxZoom:15});
  },200);
}

function vmZoomToProgress(name){
  if(!_progressMap||!window._progressMarkers){ toast('Map loading…'); return; }
  const m=window._progressMarkers[name];
  if(m){
    _progressMap.flyTo(m.getLatLng(),18,{animate:true,duration:0.8});
    m.openPopup();
    // scroll map into view so user sees the zoom
    document.getElementById('progress-map')?.scrollIntoView({behavior:'smooth',block:'center'});
  } else {
    toast('No GPS pin for '+name);
  }
}

// Auto-refresh every 30 seconds when tab is active
setInterval(()=>{ if(hvNewActiveTab==='progress') loadProgress(); }, 30000);


// ═══════════════ RECONCILIATION RECEIPT TAB ═══════════════
function rcptInit(){
  const d=document.getElementById('rcpt-date');
  if(d && !d.value){ const n=new Date(); d.value=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'); }
  rcptLoad();
}
const _RCPT_PACK_LABELS={mix:'₱1k',peso:'₱300',bungkig:'Bungkig',bugi:'Bugi',bills:'Cash'};
const _RCPT_PACK_COLORS={mix:'#3B6FD4',peso:'#7B4FA6',bungkig:'#2BA89A',bugi:'#b45309',bills:'#F5A623'};
let _rcptData=null;
async function rcptLoad(){
  const date=document.getElementById('rcpt-date')?.value;
  if(!date) return;
  const listEl=document.getElementById('rcpt-list');
  if(listEl) listEl.innerHTML='<div style="padding:30px;text-align:center;color:#9ca3af;">Loading…</div>';
  try{
    const [harvests,packs,recons,expenses]=await Promise.all([
      fetch(`${_SB}/rest/v1/harvests?harvest_date=eq.${date}&select=id,collector,vendo_name,sheet_name,area,coins_total,spawn_share,harvested_at&order=collector.asc,harvested_at.asc&limit=2000`,{headers:_HDR}).then(r=>r.json()),
      fetch(`${_SB}/rest/v1/harvest_pack_items?harvest_date=eq.${date}&saved_by=eq.office&select=harvest_id,pack_type,amount&limit=5000`,{headers:_HDR}).then(r=>r.json()),
      fetch(`${_SB}/rest/v1/harvest_reconciliations?recon_date=eq.${date}&select=collector,confirmed_by,confirmed_at,spawn_share,expenses,net_to_remit,vendo_count&limit=200`,{headers:_HDR}).then(r=>r.json()),
      fetch(`${_SB}/rest/v1/collector_expenses?expense_date=eq.${date}&select=collector,category,description,amount&limit=500`,{headers:_HDR}).then(r=>r.json()).catch(()=>[])
    ]);
    // pack map per harvest
    const packMap={};
    (packs||[]).forEach(p=>{ if(!packMap[p.harvest_id])packMap[p.harvest_id]={}; packMap[p.harvest_id][p.pack_type]=(packMap[p.harvest_id][p.pack_type]||0)+Number(p.amount||0); });
    const reconMap={}; (recons||[]).forEach(r=>reconMap[r.collector]=r);
    // group by collector
    const byCol={};
    (harvests||[]).forEach(h=>{ if(!byCol[h.collector])byCol[h.collector]=[]; byCol[h.collector].push(h); });
    const expByCol={}; (expenses||[]).forEach(e=>{ if(!expByCol[e.collector])expByCol[e.collector]=[]; expByCol[e.collector].push(e); });
    _rcptData={date,byCol,packMap,reconMap,expByCol};
    rcptRender();
  }catch(e){
    if(listEl) listEl.innerHTML='<div style="padding:24px;text-align:center;color:#dc2626;">Error: '+e.message+'</div>';
  }
}
function rcptRender(){
  const {date,byCol,packMap,reconMap,expByCol}=_rcptData;
  const cols=Object.keys(byCol).sort();
  let daySpawn=0, dayNet=0, dayShort=0, daySurplus=0;
  const cards=cols.map(col=>{
    const harvests=byCol[col];
    const recon=reconMap[col];
    const exps=expByCol[col]||[];
    let counted=0, spawn=0, bugi=0, shortT=0, surplusT=0;
    const rows=harvests.map(h=>{
      const pm=packMap[h.id]||{};
      const b=Number(pm.bugi||0);
      const cnt=Object.entries(pm).filter(([k])=>k!=='bugi').reduce((s,[,v])=>s+v,0);
      const sp=parseFloat(h.spawn_share||0);
      const gap=cnt>0?cnt-sp:null;
      counted+=cnt; spawn+=sp; bugi+=b;
      if(gap!=null){ if(gap<0)shortT+=Math.abs(gap); else if(gap>0)surplusT+=gap; }
      const hasP=cnt>0||b>0;
      const stCol=!hasP?'#9ca3af':gap===0?'#0F6E56':gap<0?'#dc2626':'#854F0B';
      const stTxt=!hasP?'⏳ Pending':gap===0?'✓ Match':gap<0?'Short '+fmt(Math.abs(gap)):'Surplus '+fmt(gap);
      const code=h.vendo_name?(h.vendo_name.substring(0,4).toUpperCase()):(h.sheet_name?h.sheet_name.substring(0,4).toUpperCase():'—');
      return `<div style="display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-bottom:0.5px solid #f1f5f9;">
        <span><b style="color:#1565c0;">${code}</b> · ${(h.vendo_name||h.sheet_name||'—')}</span>
        <span style="color:${stCol};font-weight:600;">${stTxt}</span></div>`;
    }).join('');
    const totalExp=exps.reduce((s,e)=>s+Number(e.amount||0),0);
    const netRemit=recon?parseFloat(recon.net_to_remit||0):(spawn-totalExp-bugi);
    const overallGap=counted>0?surplusT-shortT:null;
    daySpawn+=spawn; dayNet+=netRemit; dayShort+=shortT; daySurplus+=surplusT;
    const initial=col.charAt(0).toUpperCase();
    const isRecon=!!recon;
    const statusPill=isRecon
      ? `<span style="font-size:11px;background:#E1F5EE;color:#0F6E56;padding:2px 8px;border-radius:6px;margin-left:6px;">✓ Reconciled ${recon.confirmed_at?new Date(recon.confirmed_at).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit'}):''}</span>`
      : `<span style="font-size:11px;background:#f1f5f9;color:#6b7280;padding:2px 8px;border-radius:6px;margin-left:6px;">⏳ Pending</span>`;
    const countedBy=isRecon
      ? `👤 Counted by <b style="color:#1e293b;">${recon.confirmed_by||'—'}</b>`
      : 'not yet counted';
    const ov=overallGap===null?{c:'#6b7280',bg:'#f3f4f6',bd:'#e5e7eb',t:'Pending'}
      :overallGap===0?{c:'#0F6E56',bg:'#E1F5EE',bd:'#9FE1CB',t:'✓ Balanced'}
      :overallGap>0?{c:'#854F0B',bg:'#FAEEDA',bd:'#FAC775',t:'+'+fmt(overallGap)+' Surplus'}
      :{c:'#dc2626',bg:'#fef2f2',bd:'#fca5a5',t:'-'+fmt(Math.abs(overallGap))+' Deficit'};
    return `<div class="rcpt-card" style="background:#fff;border:0.5px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin-bottom:10px;">
      <div onclick="rcptOpenModal(this)" style="display:flex;align-items:center;gap:12px;cursor:pointer;">
        <div style="width:40px;height:40px;border-radius:50%;background:${isRecon?'#E6F1FB':'#f1f5f9'};display:flex;align-items:center;justify-content:center;font-weight:700;color:${isRecon?'#1565c0':'#6b7280'};">${initial}</div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:15px;color:#1e293b;">${col}${statusPill}</div>
          <div style="font-size:12px;color:#6b7280;">${harvests.length} vendos · ${countedBy}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:18px;font-weight:800;color:#1565c0;">${fmt(netRemit)}</div>
          <div style="font-size:11px;color:#6b7280;">net remit</div>
        </div>
        <span class="rcpt-chev" style="color:#cbd5e1;font-size:18px;">▸</span>
      </div>
      <div class="rcpt-modal-title" style="display:none;">${col} · ${date} · ${harvests.length} vendos</div>
      <div class="rcpt-detail" style="display:none;margin-top:14px;border-top:0.5px solid #e5e7eb;padding-top:12px;">
        <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Per Vendo</div>
        ${rows||'<div style="color:#9ca3af;font-size:13px;padding:8px 0;">No vendos</div>'}
        <div style="margin-top:12px;background:#E1F5EE;border:1px solid #9FE1CB;border-radius:8px;padding:12px;">
          <div style="font-size:11px;font-weight:700;color:#0F6E56;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">📋 Remittance Summary</div>
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;"><span style="color:#6b7280;">Total Spawn Share</span><span style="font-weight:700;">${fmt(spawn)}</span></div>
          ${shortT>0?`<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;"><span style="color:#dc2626;">Total Short</span><span style="color:#dc2626;font-weight:700;">−${fmt(shortT)}</span></div>`:''}
          ${surplusT>0?`<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;"><span style="color:#854F0B;">Total Surplus</span><span style="color:#854F0B;font-weight:700;">+${fmt(surplusT)}</span></div>`:''}
          ${bugi>0?`<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;"><span style="color:#b45309;">Bugi (Old Coins)</span><span style="color:#b45309;font-weight:700;">−${fmt(bugi)}</span></div>`:''}
          ${totalExp>0?`<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;"><span style="color:#dc2626;">Expenses</span><span style="color:#dc2626;font-weight:700;">−${fmt(totalExp)}</span></div>`:''}
          <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:800;padding:8px 0 0;border-top:0.5px solid #9FE1CB;margin-top:4px;"><span>Net to Remit</span><span style="color:#1565c0;">${fmt(netRemit)}</span></div>
          <div style="text-align:center;margin-top:10px;padding:8px;border-radius:8px;background:${ov.bg};border:1px solid ${ov.bd};">
            <div style="font-size:16px;font-weight:800;color:${ov.c};">${ov.t}</div>
            <div style="font-size:11px;color:#6b7280;">per-vendo pack count vs spawn share</div>
          </div>
          ${isRecon?`<div style="text-align:center;margin-top:8px;font-size:11px;color:#6b7280;">👤 Counted &amp; confirmed by <b style="color:#1e293b;">${recon.confirmed_by||'—'}</b>${recon.confirmed_at?' · '+new Date(recon.confirmed_at).toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):''}</div>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
  // summary stats
  const dayOverall=daySurplus-dayShort;
  const ovc=dayOverall===0?{c:'#0F6E56',bg:'#E1F5EE'}:dayOverall>0?{c:'#854F0B',bg:'#FAEEDA'}:{c:'#dc2626',bg:'#fef2f2'};
  const sumEl=document.getElementById('rcpt-summary');
  if(sumEl) sumEl.innerHTML=`
    <div style="background:#f8faff;border-radius:8px;padding:12px;"><div style="font-size:12px;color:#6b7280;">Collectors</div><div style="font-size:22px;font-weight:800;">${cols.length}</div></div>
    <div style="background:#f8faff;border-radius:8px;padding:12px;"><div style="font-size:12px;color:#6b7280;">Total Spawn</div><div style="font-size:22px;font-weight:800;">${fmt(daySpawn)}</div></div>
    <div style="background:#f8faff;border-radius:8px;padding:12px;"><div style="font-size:12px;color:#6b7280;">Net to Remit</div><div style="font-size:22px;font-weight:800;color:#1565c0;">${fmt(dayNet)}</div></div>
    <div style="background:${ovc.bg};border-radius:8px;padding:12px;"><div style="font-size:12px;color:${ovc.c};">Overall</div><div style="font-size:22px;font-weight:800;color:${ovc.c};">${dayOverall>0?'+':''}${dayOverall===0?'₱0':(dayOverall<0?'−'+fmt(Math.abs(dayOverall)):''+fmt(dayOverall))}</div></div>`;
  const listEl=document.getElementById('rcpt-list');
  if(listEl) listEl.innerHTML=cols.length?cards:'<div style="padding:30px;text-align:center;color:#9ca3af;">No harvests for this date</div>';
}
function rcptOpenModal(hdr){
  const card=hdr.closest('.rcpt-card');
  const detail=card.querySelector('.rcpt-detail');
  const title=card.querySelector('.rcpt-modal-title');
  if(!detail) return;
  // remove any existing modal
  document.getElementById('rcpt-modal-overlay')?.remove();
  const ov=document.createElement('div');
  ov.id='rcpt-modal-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
  ov.onclick=e=>{ if(e.target===ov) ov.remove(); };
  ov.innerHTML=`<div style="background:#fff;border-radius:14px;width:100%;max-width:520px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">
    <div style="position:sticky;top:0;background:linear-gradient(135deg,#1565c0,#1e3cb8);color:#fff;padding:14px 18px;border-radius:14px 14px 0 0;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:15px;font-weight:700;">🧾 ${title?title.textContent:'Receipt'}</div>
      <button onclick="document.getElementById('rcpt-modal-overlay').remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:18px;width:30px;height:30px;border-radius:50%;cursor:pointer;line-height:1;">✕</button>
    </div>
    <div style="padding:16px;">${detail.innerHTML}</div>
  </div>`;
  document.body.appendChild(ov);
}

/* ══ KEYS — Key Monitoring (taken / returned) ══ */
let _klRows = [];

function klEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function klLoad(){
  const list = document.getElementById('kl-list');
  if(list) list.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;">Loading…</div>';
  // default date to today
  const dEl = document.getElementById('kl-date');
  if(dEl && !dEl.value){ const n=new Date(); dEl.value = n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'); }
  // populate collector dropdown (once)
  const sel = document.getElementById('kl-name');
  if(sel && sel.options.length<=1){
    fetch(_SB+'/rest/v1/collectors?select=name&active=eq.true&order=name.asc', {headers:_HDR})
      .then(r=>r.json())
      .then(cs=>{ if(Array.isArray(cs)){ cs.forEach(c=>{ const o=document.createElement('option'); o.value=c.name; o.textContent=c.name; sel.appendChild(o); }); } })
      .catch(()=>{});
  }
  fetch(_SB+'/rest/v1/key_logs?select=*&order=taken_at.desc&limit=500', {headers:_HDR})
    .then(r=>r.json())
    .then(rows=>{ _klRows = Array.isArray(rows)?rows:[]; klRender(); })
    .catch(e=>{ if(list) list.innerHTML = '<div style="padding:20px;color:#DF1A35;">Load error: '+klEsc(e.message)+'</div>'; });
}

function klAdd(){
  const name = document.getElementById('kl-name').value.trim();
  const area = document.getElementById('kl-area').value;
  const count = parseInt(document.getElementById('kl-count').value,10)||0;
  const kdate = document.getElementById('kl-date').value || null;
  const notes = document.getElementById('kl-notes').value.trim();
  const lineman = document.getElementById('kl-lineman').value.trim();
  const wifikey = document.getElementById('kl-wifikey').value.trim();
  if(!name){ alert('Select collector name'); return; }
  const body = { collector_name:name, area:area||null, keys_taken:count, key_date:kdate, notes:notes||null, lineman:lineman||null, wifi_key:wifikey||null, returned:false };
  fetch(_SB+'/rest/v1/key_logs', {method:'POST', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(body)})
    .then(r=>{
      if(!r.ok){ return r.text().then(t=>{throw new Error(t);}); }
      document.getElementById('kl-name').value='';
      document.getElementById('kl-notes').value='';
      document.getElementById('kl-count').value='1';
      document.getElementById('kl-area').value='';
      document.getElementById('kl-lineman').value='';
      document.getElementById('kl-wifikey').value='';
      klLoad();
    })
    .catch(e=>alert('Save failed: '+e.message));
}

function klMarkReturned(id){
  const note = prompt('Return notes (optional):','');
  if(note===null) return; // cancelled
  const body = { returned:true, returned_at:new Date().toISOString(), returned_notes:note||null };
  fetch(_SB+'/rest/v1/key_logs?id=eq.'+id, {method:'PATCH', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(body)})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} klLoad(); })
    .catch(e=>alert('Update failed: '+e.message));
}

function klUndoReturn(id){
  if(!confirm('Mark this key as NOT returned again?')) return;
  const body = { returned:false, returned_at:null, returned_notes:null };
  fetch(_SB+'/rest/v1/key_logs?id=eq.'+id, {method:'PATCH', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(body)})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} klLoad(); })
    .catch(e=>alert('Update failed: '+e.message));
}

function klDelete(id){
  if(!confirm('Delete this key record permanently?')) return;
  fetch(_SB+'/rest/v1/key_logs?id=eq.'+id, {method:'DELETE', headers:_HDR})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} klLoad(); })
    .catch(e=>alert('Delete failed: '+e.message));
}

function klRender(){
  const list = document.getElementById('kl-list');
  const lbl  = document.getElementById('kl-count-lbl');
  if(!list) return;
  const filt = (document.getElementById('kl-filter')||{}).value || 'out';
  const q = ((document.getElementById('kl-search')||{}).value||'').toLowerCase().trim();
  let rows = _klRows.slice();
  if(filt==='out')      rows = rows.filter(r=>!r.returned);
  else if(filt==='returned') rows = rows.filter(r=>r.returned);
  if(q) rows = rows.filter(r=>((r.collector_name||'')+' '+(r.area||'')+' '+(r.notes||'')+' '+(r.lineman||'')+' '+(r.wifi_key||'')).toLowerCase().includes(q));

  const out = _klRows.filter(r=>!r.returned).length;
  const outKeys = _klRows.filter(r=>!r.returned).reduce((s,r)=>s+(r.keys_taken||0),0);
  if(lbl) lbl.textContent = rows.length+' record(s) shown · '+out+' out ('+outKeys+' keys not yet returned)';

  if(!rows.length){ list.innerHTML='<div style="padding:20px;text-align:center;color:#6b7280;">No records.</div>'; return; }

  list.innerHTML = rows.map(r=>{
    const returned = !!r.returned;
    const bd = returned ? '#028867' : '#DF1A35';
    const badge = returned
      ? '<span style="background:#028867;color:#fff;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:800;">✅ RETURNED</span>'
      : '<span style="background:#DF1A35;color:#fff;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:800;">🔴 OUT</span>';
    const actions = returned
      ? '<button onclick="klUndoReturn('+r.id+')" style="padding:6px 12px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">↩ Undo</button>'
      : '<button onclick="klMarkReturned('+r.id+')" style="padding:6px 14px;background:#028867;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;">✓ Mark Returned</button>';
    return '<div style="background:#fff;border-left:4px solid '+bd+';border:1.5px solid #e5e7eb;border-left:4px solid '+bd+';border-radius:9px;padding:12px 14px;margin-bottom:9px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">'
      +   '<div style="flex:1;min-width:160px;">'
      +     '<div style="font-size:14px;font-weight:800;color:#311A8E;">'+klEsc(r.collector_name)+' '+badge+'</div>'
      +     '<div style="font-size:12px;color:#374151;margin-top:3px;">'
      +       '📍 '+klEsc(r.area||'—')+' · 🔑 '+(r.keys_taken||0)+' key(s)'
      +       (r.key_date?(' · 📅 '+klEsc(r.key_date)):'')
      +     '</div>'
      +     (r.notes?'<div style="font-size:11px;color:#6b7280;margin-top:2px;">📝 '+klEsc(r.notes)+'</div>':'')
      +     ((r.lineman||r.wifi_key)?'<div style="font-size:11px;color:#025AC6;margin-top:2px;font-weight:700;">🛠️ '+klEsc(r.lineman||'—')+(r.wifi_key?(' · 📶 WiFi key: '+klEsc(r.wifi_key)):'')+'</div>':'')
      +     '<div style="font-size:10px;color:#9ca3af;margin-top:4px;">Taken: '+_fmt(r.taken_at)
      +       (returned?(' · Returned: '+_fmt(r.returned_at)):'')+'</div>'
      +     (returned&&r.returned_notes?'<div style="font-size:10px;color:#028867;margin-top:2px;">↩ '+klEsc(r.returned_notes)+'</div>':'')
      +   '</div>'
      +   '<div style="display:flex;gap:6px;flex-wrap:wrap;">'+actions
      +     '<button onclick="klDelete('+r.id+')" style="padding:6px 10px;background:#fff;color:#DF1A35;border:1.5px solid #fca5a5;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">🗑</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}
