
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
var _KEY = "gw";

// ── Time-aware reconciliation helpers ──────────────────────────────
// Transactions store date (date) + time (text like "02:08:32 PM"), Manila local.
// Harvest submission (harvested_at) is UTC. We compare both as Manila-local ms.
function _rcParseAmpm(timeStr){
  // "02:08:32 PM" -> {h,m,s} in 24h; returns null if unparseable
  if(!timeStr) return null;
  var m=/^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\s*$/i.exec(timeStr);
  if(!m) return null;
  var h=parseInt(m[1],10), min=parseInt(m[2],10), s=m[3]?parseInt(m[3],10):0;
  var ap=(m[4]||'').toUpperCase();
  if(ap==='PM' && h<12) h+=12;
  if(ap==='AM' && h===12) h=0;
  return {h:h,m:min,s:s};
}
// Local (Manila) ms for a transaction row's date+time, treated as wall-clock.
function _rcTxnLocalMs(dateStr, timeStr){
  if(!dateStr) return null;
  var t=_rcParseAmpm(timeStr);
  var d=/^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if(!d) return null;
  // Use Date.UTC so it's a stable wall-clock number (no local-TZ drift on the viewer's machine)
  return Date.UTC(+d[1], +d[2]-1, +d[3], t?t.h:23, t?t.m:59, t?t.s:59);
}
// Submission cutoff as Manila wall-clock ms. harvested_at is UTC ISO; +8h -> Manila.
function _rcSubmitLocalMs(harvestedAt, harvestDate){
  if(harvestedAt){
    var utc=new Date(harvestedAt).getTime();
    if(!isNaN(utc)) return utc + 8*3600*1000; // shift to Manila wall-clock, comparable to _rcTxnLocalMs
  }
  // fallback: end of harvest_date
  var d=/^(\d{4})-(\d{2})-(\d{2})/.exec(harvestDate||'');
  if(d) return Date.UTC(+d[1], +d[2]-1, +d[3], 23,59,59);
  return null;
}
var _HDR = {'apikey':_KEY,'Authorization':'Bearer '+_KEY,'Content-Type':'application/json'};
// anon key — used ONLY for the realtime websocket (read-only live feed; cannot write data)
var _ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2aXJhcWZocGhoc29uam1ydHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0MDQ4MDIsImV4cCI6MjA1ODk4MDgwMn0.1Nf1cVMSnFkFMDFRzDFUsxbvZy2vBFJnFOdOthHxq9k";

const _php = v => v==null?'—':'₱'+Math.round(Number(v)).toLocaleString();
const _fmt = ts => ts ? new Date(ts).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}) : '—';
const _fmtT = ts => ts ? new Date(ts).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true}) : '—';

let hvNewActiveTab = 'htable';

function hvNewTab(id, btn){
  document.querySelectorAll('#panel-harvest .hv-hvtab').forEach(b=>b.classList.remove('on'));
  ['htable','livefeed','recon','receipt','settings','perf','progress','names','ledger','gps','keys','spawnkeys','harveststats'].forEach(t=>{
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
  // close any open Keys modals when leaving the keys sub-tab
  if(id!=='keys'){ ['kl-detail-modal','kl-return-modal','kl-lineman-modal','kc-remit-modal','ki-pw-modal','vi-give-modal','kt-modal'].forEach(m=>{ const e=document.getElementById(m); if(e) e.remove(); }); }
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
  if(id==='harveststats'){ hstLoad(); }
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
        if(!r.ok){ throw new Error('TG income fetch failed ('+r.status+') — cannot reconcile'); }
        const td=await r.json();
        if(!Array.isArray(td)){ throw new Error('TG income unreadable — cannot reconcile'); }
        if(!td.length) break;
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
      +'<div style="background:'+(Math.abs(totGap)<100?'#f0fdf4':totGap>0?'#fef2f2':'#fefce8')+';border-radius:8px;padding:12px;"><div style="font-size:18px;font-weight:700;color:'+gc+';">'+_php(Math.abs(totGap))+'</div><div style="font-size:11px;color:#6b7280;margin-top:2px;">'+(totGap>100?'🔴 Short':totGap<-100?'🟡 Surplus':'✅ OK')+'</div></div>'
      +'</div><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f8faff;"><th style="padding:7px 10px;text-align:left;border-bottom:2px solid #e5e7eb;">Harvest date</th><th style="padding:7px 10px;text-align:left;border-bottom:2px solid #e5e7eb;">Window</th><th style="padding:7px 10px;text-align:right;border-bottom:2px solid #e5e7eb;">Coins total</th><th style="padding:7px 10px;text-align:right;border-bottom:2px solid #e5e7eb;">TG income</th><th style="padding:7px 10px;text-align:right;border-bottom:2px solid #e5e7eb;">Gap</th></tr></thead><tbody>';
    rows.forEach(({hr,ws,we,tgInc,coins,gap,gc,bg})=>{
      const gapLabel=gap>100?'🔴 Short':gap<-100?'🟡 Surplus':'✅ OK';
      html+=`<tr style="background:${bg}"><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;">${hr.harvest_date}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:10px;color:#6b7280;">${ws} → ${we}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#1565c0;">${_php(coins)}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#15803d;">${_php(tgInc)}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:${gc};font-weight:600;">${gapLabel} ${_php(Math.abs(gap))}</td></tr>`;
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
  const pw=await askAdminPw('Enter admin password to confirm this change.'); if(pw===null)return; if(pw!=='101510'){markAdminPwWrong();toast('Wrong password');return;}
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
  const pw=await askAdminPw('Enter admin password to confirm this change.'); if(pw===null)return; if(pw!=='101510'){markAdminPwWrong();toast('Wrong password');return;}
  const sheet=(document.getElementById('vn-sheet')||{}).value||'';
  const tg=(document.getElementById('vn-tg')||{}).value||'';
  const u={sheet_name:sheet||null, tg_name:tg||null};
  if(tg) u.tg_match_confirmed=true;
  try{
    const r=await fetch(SB+'/rest/v1/vendos?id=eq.'+v.id,{method:'PATCH',
      headers:{apikey:_KEY,Authorization:'Bearer '+_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify(u)});
    if(r.ok){
      // recon reads harvests — sync tg_name/sheet_name there too, else it reverts
      const hu={};
      if(sheet) hu.sheet_name=sheet;
      if(tg) hu.tg_name=tg;
      if(Object.keys(hu).length){
        try{
          await fetch(SB+'/rest/v1/harvests?vendo_id=eq.'+v.id,{method:'PATCH',
            headers:{apikey:_KEY,Authorization:'Bearer '+_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
            body:JSON.stringify(hu)});
        }catch(e){ console.error('harvests sync failed:',e); }
      }
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
  const pw=await askAdminPw('Enter admin password to confirm this change.'); if(pw===null)return; if(pw!=='101510'){markAdminPwWrong();toast('Wrong password');return;}
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
  const pw=await askAdminPw('Enter admin password to confirm this change.'); if(pw===null)return; if(pw!=='101510'){markAdminPwWrong();toast('Wrong password');return;}
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

  const rowHtml = (item,i)=>{
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
  };

  if(window._lfGroupByCollector){
    // collapsed collector cards — tap opens a popup with that collector's harvests
    const feed = (elId==='lf-hist-list') ? 'hist' : 'today';
    const groups={};
    filtered.forEach(it=>{ const k=it.collector||'— No collector —'; (groups[k]=groups[k]||[]).push(it); });
    // keep only collectors that actually have harvests in THIS view
    const order=Object.keys(groups)
      .filter(name=>groups[name] && groups[name].length>0)
      .sort((a,b)=>
        groups[b].reduce((s,i)=>s+Number(i.spawn_share||0),0) - groups[a].reduce((s,i)=>s+Number(i.spawn_share||0),0));
    // store per-feed so Today and History don't overwrite each other
    if(feed==='hist'){ window._lfGroupsHist = groups; } else { window._lfGroupsToday = groups; }
    if(!order.length){
      el.innerHTML='<div style="padding:30px;text-align:center;color:var(--mu);font-size:12px;">No harvests to group in this view.</div>';
      return;
    }
    el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;padding:10px;">' + order.map(name=>{
      const rows=groups[name];
      const gSpawn=rows.reduce((s,i)=>s+Number(i.spawn_share||0),0);
      const gCoins=rows.reduce((s,i)=>s+Number(i.coins_total||0),0);
      const areas=[...new Set(rows.map(r=>r.area).filter(Boolean))].join(', ');
      const initial=(name||'?').trim().charAt(0).toUpperCase();
      return `<div onclick="lfShowCollector('${name.replace(/'/g,"\\'")}','${feed}')" style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:14px;cursor:pointer;transition:.12s;" onmouseover="this.style.boxShadow='0 4px 14px rgba(0,0,0,.10)';this.style.borderColor='#6d28d9';" onmouseout="this.style.boxShadow='none';this.style.borderColor='#e5e7eb';">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#6d28d9,#025AC6);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0;">${initial}</div>
          <div style="min-width:0;">
            <div style="font-weight:800;font-size:14px;color:#4c1d95;">${name}</div>
            <div style="font-size:10px;color:var(--mu);">${rows.length} vendo${rows.length!==1?'s':''}${areas?' · '+areas:''}</div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:flex-end;">
          <div>
            <div style="font-size:20px;font-weight:800;color:#15803d;line-height:1;">${_php(gSpawn)}</div>
            <div style="font-size:9px;color:var(--mu);margin-top:2px;">spawn share</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;font-weight:700;color:#1565c0;">${_php(gCoins)}</div>
            <div style="font-size:9px;color:var(--mu);">coins</div>
          </div>
        </div>
        <div style="margin-top:10px;font-size:10px;color:#6d28d9;font-weight:700;text-align:center;border-top:1px solid #f1f5f9;padding-top:8px;">Tap to view harvests ›</div>
      </div>`;
    }).join('') + '</div>';
  } else {
    el.innerHTML=filtered.slice(0,500).map((item,i)=>rowHtml(item,i)).join('');
  }
}

function lfShowCollector(name, feed){
  const groups = (feed==='hist' ? window._lfGroupsHist : window._lfGroupsToday) || {};
  const rows = groups[name]||[];
  const src = feed==='hist' ? lfHistItems : lfItems;
  if(!rows.length){ toast('No harvests for '+name+' in this view'); return; }
  const gSpawn=rows.reduce((s,i)=>s+Number(i.spawn_share||0),0);
  const gCoins=rows.reduce((s,i)=>s+Number(i.coins_total||0),0);
  const gNet=rows.reduce((s,i)=>s+Number(i.net_collectible||0),0);
  const areas=[...new Set(rows.map(r=>r.area).filter(Boolean))].join(', ');
  const old=document.getElementById('lf-collector-modal'); if(old) old.remove();
  const ov=document.createElement('div');
  ov.id='lf-collector-modal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px;';
  const rowsHtml = rows.map(it=>{
    const t=it.harvested_at?new Date(it.harvested_at).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}):'';
    const idx=src.indexOf(it);
    return `<div onclick="lfCloseCollector();lfShowDetail(${idx})" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #f3f4f6;cursor:pointer;" onmouseover="this.style.background='#f8faff'" onmouseout="this.style.background=''">
      <div style="font-size:10px;color:var(--mu);min-width:48px;">${t}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:13px;">${it.sheet_name||'<span style="color:#9ca3af;font-style:italic;">unmatched</span>'}</div>
        <div style="font-size:10px;color:var(--mu);">${it.area||''}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:14px;font-weight:800;color:#15803d;">${_php(it.spawn_share)}</div>
        <div style="font-size:9px;color:var(--mu);">net ${_php(it.net_collectible)}</div>
      </div>
    </div>`;
  }).join('');
  const initial=(name||'?').trim().charAt(0).toUpperCase();
  ov.innerHTML=`<div style="background:#fff;border-radius:18px;max-width:460px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:inherit;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#6d28d9,#025AC6);padding:18px 22px;color:#fff;flex-shrink:0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:19px;">${initial}</div>
          <div>
            <div style="font-size:19px;font-weight:800;">${name}</div>
            <div style="font-size:11px;opacity:.9;">${rows.length} harvest${rows.length!==1?'s':''}${areas?' · '+areas:''}</div>
          </div>
        </div>
        <button onclick="lfCloseCollector()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:30px;height:30px;border-radius:8px;font-size:17px;cursor:pointer;font-family:inherit;">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:14px;">
        <div style="background:rgba(255,255,255,.15);border-radius:8px;padding:8px;text-align:center;"><div style="font-size:16px;font-weight:800;">${_php(gSpawn)}</div><div style="font-size:9px;opacity:.85;">spawn</div></div>
        <div style="background:rgba(255,255,255,.15);border-radius:8px;padding:8px;text-align:center;"><div style="font-size:16px;font-weight:800;">${_php(gCoins)}</div><div style="font-size:9px;opacity:.85;">coins</div></div>
        <div style="background:rgba(255,255,255,.15);border-radius:8px;padding:8px;text-align:center;"><div style="font-size:16px;font-weight:800;">${_php(gNet)}</div><div style="font-size:9px;opacity:.85;">net</div></div>
      </div>
    </div>
    <div style="overflow-y:auto;flex:1;">${rowsHtml}</div>
  </div>`;
  ov.addEventListener('click',e=>{ if(e.target===ov) lfCloseCollector(); });
  document.body.appendChild(ov);
}
function lfCloseCollector(){ const o=document.getElementById('lf-collector-modal'); if(o) o.remove(); }

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

function lfToggleGroup(){
  window._lfGroupByCollector = !window._lfGroupByCollector;
  document.querySelectorAll('.lf-group-btn').forEach(b=>{
    b.textContent = window._lfGroupByCollector ? '👥 Grouped by collector' : '☰ Group by collector';
    b.style.background = window._lfGroupByCollector ? '#6d28d9' : '#fff';
    b.style.color = window._lfGroupByCollector ? '#fff' : '#6d28d9';
  });
  lfRender(); lfHistRender();
}

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
    const wsUrl = `wss://cviraqfhphhsonjmrtvu.supabase.co/realtime/v1/websocket?vsn=1.0.0&apikey=${_ANON}`;
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
        // Say plainly that this is cached. Silent staleness is what makes an
        // edit look like it didn't save. The refresh button lives in the
        // toolbar, not here — rcFilter() overwrites this element on every
        // filter change, so any button placed here would vanish.
        const ageEl = document.getElementById('rc-count');
        if(ageEl){
          const stale = age >= 5;
          ageEl.innerHTML = rcAllRows.length + ' harvests · '
            + '<span style="color:' + (stale ? '#b45309' : '#6b7280') + ';">'
            + (stale ? '⚠ cached ' : 'cached ') + age + 'min ago</span>';
        }
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
    rcAllRows=harvestRows.map(row=>{
      const tgInc=(row.tg_income!=null)?Number(row.tg_income):null;
      const coins=Number(row.coins_total||0);
      // recompute gap fresh (saved recon_gap may be null/stale)
      const gap=tgInc!=null?tgInc-coins:(row.recon_gap!=null?Number(row.recon_gap):null);
      const gap_pct=(coins>0&&gap!=null)?Math.abs(gap)/coins*100:null;
      // recompute flag with current ±20 rule (do NOT trust saved recon_flag)
      const flag = gap==null ? 'nodata'
                 : Math.abs(gap)<=20 ? 'ok'
                 : gap>20 ? 'alert'
                 : 'warn';
      return {
        ...row,
        collector:row.actual_collector||row.collector||'Unknown',
        tg_income:tgInc, gap, gap_pct, flag,
        is_admin:!row.route_code||row.route_code.toUpperCase()==='ADMIN'||row.route_code.toUpperCase()==='MANUAL'
      };
    });
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
  // TIME-AWARE TG income via server RPC (spawn_tg_recon) — does submission-time
  // cutoff server-side, so post-harvest transactions fall to next cycle.
  // Keyed by tg_name (RPC returns one row per harvest this month).
  const rpcById={};      // harvest_id -> {tg_income, audited, submitted_at, window_start}
  const rpcTgByName={};  // fallback: tg_name -> tg_income (for rows the id-map misses)
  try{
    const rr=await fetch(`${_SB}/rest/v1/rpc/spawn_tg_recon`,{
      method:'POST', headers:{..._HDR}, body:JSON.stringify({})
    });
    let rj=await rr.json();
    // SHAPE: spawn_tg_recon is declared RETURNS jsonb — a single value that
    // happens to be an ARRAY of harvest objects. PostgREST therefore hands back
    // [ [ {...}, {...} ] ]  — an array whose one element is the real array —
    // NOT [ {...}, {...} ]. The old code did rj.forEach(o => o.harvest_id...),
    // where o was the inner ARRAY, so harvest_id was undefined, rpcById stayed
    // empty, every gap computed null, and the whole table rendered "—" / "OK"
    // with the colours gone. Unwrap before use.
    if(Array.isArray(rj) && rj.length===1 && Array.isArray(rj[0])) rj = rj[0];
    else if(rj && !Array.isArray(rj) && Array.isArray(rj.spawn_tg_recon)) rj = rj.spawn_tg_recon;
    if(Array.isArray(rj)){
      rj.forEach(o=>{
        if(o && o.harvest_id!=null){
          rpcById[o.harvest_id]={
            tg_income:Number(o.tg_income||0),
            audited:!!o.audited,
            submitted_at:o.submitted_at||null,
            window_start:o.window_start||null,
            has_chain:!!o.has_chain
          };
        }
        if(o && o.tg_name && rpcTgByName[o.tg_name]===undefined){
          rpcTgByName[o.tg_name]=Number(o.tg_income||0);
        }
      });
    }
  }catch(e){ console.warn('[rcRun] time-aware RPC failed, falling back to date-only fetch',e); }

  // Fallback fetch (date-only) — used only for windows the RPC didn't cover.
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
  // Only fetch windows whose harvests are NOT covered by the RPC id-map.
  const coveredTg=new Set(harvestRows.filter(r=>rpcById[r.id]).map(r=>tgMap[r.id]).filter(Boolean));
  const needFetch=uniqueWindows.filter(w=>!coveredTg.has(w.tg) && rpcTgByName[w.tg]===undefined);
  for(let i=0;i<needFetch.length;i+=10){
    const chunk=needFetch.slice(i,i+10);
    const results=await Promise.all(chunk.map(fetchWindowTotal));
    results.forEach(r=>{ tgRowIncomeMap[r.key]=r.total; });
    if(el) el.innerHTML=`<div style="padding:20px;text-align:center;color:var(--mu);">Fetching TG income… ${Math.min(i+10,needFetch.length)}/${needFetch.length}</div>`;
  }
  const tgIncomeMap={}; // legacy compat placeholder

  // Build final rows with true deficit formula
  // True deficit = TG income - (coins_total + saloy)
  rcAllRows=harvestRows.map(row=>{
    const tg=tgMap[row.id]||null;
    const ws=row.harvest_window_start||from;
    const we=row.harvest_date||to;
    const rowKey=tg ? tg+'|'+ws+'|'+we : null;
    // Prefer per-harvest RPC data (by harvest id — no tg_name collision);
    // then tg_name fallback; then date-only fetch.
    let tgInc=null, rpcAudited=false, rpcWinStart=null, rpcSubmit=null, rpcHasChain=true;
    const byId=rpcById[row.id];
    if(byId){
      tgInc=byId.tg_income; rpcAudited=byId.audited;
      rpcWinStart=byId.window_start; rpcSubmit=byId.submitted_at;
      rpcHasChain=byId.has_chain;
    } else if(tg && rpcTgByName[tg]!==undefined){
      tgInc=rpcTgByName[tg];
    } else if(rowKey!=null){
      tgInc=(tgRowIncomeMap[rowKey]??null);
    }
    const coins=Number(row.coins_total||0);
    // coins_total already includes saloy — compare directly with TG income
    const gap=tgInc!=null?tgInc-coins:null; // gap = TG - coins. positive=TG>coins, negative=coins>TG (surplus of coins)
    const gapPct=(coins>0&&gap!=null)?Math.abs(gap)/coins*100:null;
    // OK only within ±20 pesos. Beyond that: flag by direction.
    //   gap >  20  => TG more than coins   => SHORT (coins may be missing) => 'alert'
    //   gap < -20  => coins more than TG    => SURPLUS (extra coins)         => 'warn'
    const flag = gap==null ? 'nodata'
               : Math.abs(gap)<=20 ? 'ok'
               : gap>20 ? 'alert'
               : 'warn';
    const rc=row.route_code||'ADMIN';
    const isAdmin=!row.route_code||row.route_code.toUpperCase()==='ADMIN'||row.route_code.toUpperCase()==='MANUAL';
    return {...row,
      collector:row.actual_collector||row.collector||'Unknown',
      tg_name:tg,tg_income:tgInc,gap,gap_pct:gapPct,flag,
      rpc_audited:rpcAudited,
      rpc_window_start:rpcWinStart,
      rpc_submitted_at:rpcSubmit,
      window_estimated:false,
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

// Manual "read live, ignore the cache" refresh.
//
// WHY THIS EXISTS: recon reads recon_cache.json, rebuilt hourly by cron. On a
// cache hit it only auto-refreshes in the background when the cache is >10min
// old. So an edit made 3 minutes after a rebuild keeps showing the OLD value
// for the next 7 minutes with nothing on screen saying so — which reads as
// "my change didn't save". This forces a live read on demand.
async function rcForceFresh(){
  const btn = document.getElementById('rc-refresh-btn');
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Reading live…'; }
  try{
    rcBypassCache = true;
    rcAllRows = [];
    await rcRun();
  }catch(e){
    toast('Refresh failed: '+e.message);
  }finally{
    rcBypassCache = false;
    if(btn){ btn.disabled = false; btn.textContent = '↻ Refresh live'; }
  }
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
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100002;display:flex;align-items:center;justify-content:center;';
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
  const pw=await askAdminPw('Enter admin password to confirm this change.'); if(pw===null)return; if(pw!=='101510'){markAdminPwWrong();toast('Wrong password');return;}
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
      // ALSO update the harvests rows for this vendo — the recon table & TG-income
      // matching read from harvests, so without this the change reverts on reload.
      const hu={};
      if(sheet) hu.sheet_name=sheet;
      if(tg) hu.tg_name=tg;
      if(Object.keys(hu).length){
        try{
          await fetch(`${_SB}/rest/v1/harvests?vendo_id=eq.${id}`,{method:'PATCH',
            headers:{..._HDR,'Content-Type':'application/json',Prefer:'return=minimal'},
            body:JSON.stringify(hu)});
        }catch(e){ console.error('harvests tg_name sync failed:',e); }
      }
      toast('✅ Names saved!');
      htAllRows=[];
      // update local cache row so reopening shows fresh values
      if(row){ if(sheet) row.sheet_name=sheet; if(tg) row.tg_name=tg; }
      // reflect the change in the loaded recon rows and re-render immediately
      if(Array.isArray(rcAllRows)){
        rcAllRows.forEach(rr=>{ if(rr.vendo_id && row && rr.vendo_id===row.vendo_id){ if(tg) rr.tg_name=tg; if(sheet) rr.sheet_name=sheet; } });
      }
      if(msg){msg.textContent='Saved';msg.style.color='#15803d';}
      const ov=document.getElementById('rc-names-overlay'); if(ov) ov.remove();
      // Re-run reconciliation fresh so TG income re-matches the new name (skip cache).
      if(typeof rcRun==='function'){
        try{ rcBypassCache=true; await rcRun(); }
        catch(e){ if(typeof rcFilter==='function') rcFilter(); }
        finally{ rcBypassCache=false; }
      } else if(typeof rcFilter==='function'){ rcFilter(); }
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
  const pw=await askAdminPw('Enter admin password to confirm this change.'); if(pw===null)return; if(pw!=='101510'){markAdminPwWrong();toast('Wrong password');return;}
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
  const pw=await askAdminPw('Enter admin password to confirm this change.'); if(pw===null)return; if(pw!=='101510'){markAdminPwWrong();toast('Wrong password');return;}
  try{
    // Same duplicate-name hazard as rcnUnlink — do not blind-pick with limit=1.
    const r=await fetch(`${_SB}/rest/v1/vendos?select=id,sheet_name,tg_name,area&or=(tg_name.eq.${encodeURIComponent(vendoName)},sheet_name.eq.${encodeURIComponent(vendoName)})`,{headers:_HDR});
    let rows=await r.json();
    if(!Array.isArray(rows)||!rows.length){toast('Vendo not found');return;}
    let id;
    if(rows.length===1){
      id=rows[0].id;
    }else{
      rows=await rcEnrichVendoRows(rows);
      rows.sort((a,b)=>b._harvests-a._harvests);
      id=await rcPickVendo(rows, 'Link TG name to which vendo?');
      if(id===null) return;
    }
    const r2=await fetch(`${_SB}/rest/v1/vendos?id=eq.${id}`,{method:'PATCH',headers:{..._HDR,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({tg_name:tgName,tg_match_confirmed:true})});
    if(r2.ok){
      // Three-table rule: vendos + harvests + harvest_group_items must all carry
      // the TG name or the change silently reverts. recon reads harvests; the
      // collector PWA reads harvest_group_items. Patching only vendos looks like
      // it worked and then "un-does" itself on the next load.
      try{
        await fetch(`${_SB}/rest/v1/harvests?vendo_id=eq.${id}`,{method:'PATCH',
          headers:{..._HDR,'Content-Type':'application/json',Prefer:'return=minimal'},
          body:JSON.stringify({tg_name:tgName})});
      }catch(e){ console.error('harvests tg sync failed:',e); }
      try{
        await fetch(`${_SB}/rest/v1/harvest_group_items?vendo_id=eq.${id}`,{method:'PATCH',
          headers:{..._HDR,'Content-Type':'application/json',Prefer:'return=minimal'},
          body:JSON.stringify({tg_name:tgName})});
      }catch(e){ console.error('harvest_group_items tg sync failed:',e); }
      if(Array.isArray(rcAllRows)) rcAllRows.forEach(rr=>{ if(rr.vendo_id===id) rr.tg_name=tgName; });
      toast('✅ Linked! TG name saved.');
      htAllRows=[];
      document.getElementById('rc-names-overlay')?.remove();
      if(typeof rcRun==='function'){
        try{ rcBypassCache=true; await rcRun(); }
        catch(e){ if(typeof rcFilter==='function') rcFilter(); }
        finally{ rcBypassCache=false; }
      }
    }else toast('Save failed');
  }catch(e){toast('Error: '+e.message);}
}
// ── UNLINK TG NAME ──────────────────────────────────────────────
// Clears a wrong TG link, or marks a vendo as "no TG yet" (no bot in its GC).
//
// MONEY SAFETY: this only touches NAME columns. It never writes coins_total,
// tg_income, recon_gap or any money field. An unlink makes recon show "no
// match" for that vendo — which is the honest state — it does not erase or
// alter a single peso of what was already counted.
//
// Same three-table rule as linking: vendos + harvests + harvest_group_items.
// Pick which vendo row to act on when several share a name.
//
// The old code used confirm() with a pre-chosen row: OK or Cancel, no way to
// choose the OTHER one. Worse, it preferred the first sheet_name match, which
// is often an empty legacy row. Real case: "Sugabo" exists as #761 (POLANCO,
// no TG, 0 harvests — dead) and #2865 (SINDANGAN, VLAN213, 2 harvests — live).
// It proposed #761. Clicking OK would have unlinked nothing and looked fine.
//
// This shows the evidence — area, TG name, harvest count — and lets you pick.
function rcPickVendo(rows, title){
  return new Promise(resolve=>{
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit;';
    const cards=rows.map(r=>{
      const dead = (r._harvests===0);
      return `<div onclick="this.closest('[data-pick]').__pick(${r.id})" style="border:2px solid ${dead?'#e5e7eb':'#025AC6'};background:${dead?'#f9fafb':'#f0f6ff'};border-radius:11px;padding:11px 13px;margin-bottom:9px;cursor:pointer;transition:.12s;" onmouseover="this.style.transform='translateX(3px)'" onmouseout="this.style.transform=''">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div style="font-weight:800;font-size:14px;color:#111;">#${r.id} · ${r.sheet_name||'(no sheet name)'}</div>
          ${dead?'<span style="background:#e5e7eb;color:#6b7280;font-size:9px;font-weight:800;padding:2px 7px;border-radius:99px;">EMPTY</span>'
                :'<span style="background:#025AC6;color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:99px;">HAS DATA</span>'}
        </div>
        <div style="font-size:11px;color:#4b5563;margin-top:4px;line-height:1.5;">
          ${r.area?`<b>${r.area}</b> · `:''}${r._harvests} harvest${r._harvests===1?'':'s'}${r._last?` · last ${r._last}`:''}<br>
          TG: ${r.tg_name?`<span style="color:#15803d;font-weight:600;">${r.tg_name}</span>`:'<span style="color:#b45309;">none</span>'}
        </div>
      </div>`;
    }).join('');
    ov.innerHTML=`<div data-pick style="background:#fff;border-radius:15px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.4);overflow:hidden;">
      <div style="background:linear-gradient(135deg,#1e3cb8,#1565c0);color:#fff;padding:14px 17px;">
        <div style="font-size:15px;font-weight:800;">${title||'Which vendo?'}</div>
        <div style="font-size:11px;opacity:.85;margin-top:2px;">${rows.length} rows share this name — pick the right one</div>
      </div>
      <div style="padding:14px;max-height:60vh;overflow-y:auto;">${cards}</div>
      <div style="padding:0 14px 14px;"><button style="width:100%;padding:9px;border:1px solid #d1d5db;background:#fff;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;color:#6b7280;">Cancel</button></div>
    </div>`;
    const box=ov.querySelector('[data-pick]');
    box.__pick=(id)=>{ ov.remove(); resolve(id); };
    ov.querySelector('button').onclick=()=>{ ov.remove(); resolve(null); };
    ov.addEventListener('click',e=>{ if(e.target===ov){ ov.remove(); resolve(null); } });
    document.body.appendChild(ov);
  });
}

// Fetch harvest counts so the picker can show which row is real.
async function rcEnrichVendoRows(rows){
  const ids=rows.map(r=>r.id);
  const counts={}, lasts={};
  try{
    const r=await fetch(`${_SB}/rest/v1/harvests?vendo_id=in.(${ids.join(',')})&select=vendo_id,harvest_date&limit=1000`,{headers:_HDR});
    const d=await r.json();
    if(Array.isArray(d)) d.forEach(h=>{
      counts[h.vendo_id]=(counts[h.vendo_id]||0)+1;
      if(!lasts[h.vendo_id]||h.harvest_date>lasts[h.vendo_id]) lasts[h.vendo_id]=h.harvest_date;
    });
  }catch(e){}
  return rows.map(r=>({...r, _harvests:counts[r.id]||0, _last:lasts[r.id]||null}));
}

async function rcnUnlink(vendoName, opts){
  opts = opts || {};
  const markNoTg = !!opts.noTg;
  try{
    // DUPLICATE NAMES ARE REAL: the same name can sit on more than one vendos
    // row (e.g. an empty legacy row alongside the live one). A bare limit=1
    // would silently act on whichever came back first — often the empty one —
    // and report success while the real vendo kept its name.
    const r=await fetch(`${_SB}/rest/v1/vendos?select=id,tg_name,sheet_name,area&or=(tg_name.eq.${encodeURIComponent(vendoName)},sheet_name.eq.${encodeURIComponent(vendoName)})`,{headers:_HDR});
    let rows=await r.json();
    if(!Array.isArray(rows)||!rows.length){toast('Vendo not found');return;}
    let id;
    if(rows.length===1){
      id=rows[0].id;
    }else{
      rows=await rcEnrichVendoRows(rows);
      rows.sort((a,b)=>b._harvests-a._harvests);   // real rows first
      id=await rcPickVendo(rows, markNoTg?'Mark which as NO TG?':'Unlink which vendo?');
      if(id===null) return;
    }
    const chosen = rows.find(x=>x.id===id) || {};
    const label = markNoTg ? 'mark as NO TG NAME' : 'unlink the TG name';
    if(!confirm('This will '+label+' for:\n\n  #'+id+'  '+(chosen.sheet_name||vendoName)
      + (chosen.tg_name?'\n  TG: '+chosen.tg_name:'')
      + '\n\nMoney figures are not touched — only the name link.\n\nContinue?')) return;
    const pw=await askAdminPw('Enter admin password to confirm this change.'); if(pw===null)return;
    if(pw!=='101510'){markAdminPwWrong();toast('Wrong password');return;}

    const vendoPatch = markNoTg
      ? {tg_name:null, tg_match_confirmed:false, no_tg:true}
      : {tg_name:null, tg_match_confirmed:false};

    const r2=await fetch(`${_SB}/rest/v1/vendos?id=eq.${id}`,{method:'PATCH',
      headers:{..._HDR,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify(vendoPatch)});
    if(!r2.ok){ toast('Unlink failed'); return; }

    // Clear the name everywhere it is mirrored — AND clear the recon figures
    // derived from it. tg_income/recon_gap/recon_flag were computed FROM the
    // TG match; once the match is gone they are orphaned. Leaving them behind
    // means the row keeps reconciling against income it is no longer linked to,
    // and the deficit/surplus cards keep counting it. Only NAME-DERIVED recon
    // fields are cleared here — coins_total, spawn_share and every other money
    // column the collector actually counted are never touched.
    try{
      await fetch(`${_SB}/rest/v1/harvests?vendo_id=eq.${id}`,{method:'PATCH',
        headers:{..._HDR,'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify({tg_name:null, tg_income:null, recon_gap:null, recon_flag:null, recon_at:null})});
    }catch(e){ console.error('harvests unlink sync failed:',e); }
    try{
      await fetch(`${_SB}/rest/v1/harvest_group_items?vendo_id=eq.${id}`,{method:'PATCH',
        headers:{..._HDR,'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify({tg_name:null})});
    }catch(e){ console.error('harvest_group_items unlink sync failed:',e); }

    // Patch the in-memory rows so the table updates before any refetch.
    if(Array.isArray(rcAllRows)) rcAllRows.forEach(rr=>{
      if(rr.vendo_id===id){ rr.tg_name=null; rr.tg_income=null; rr.recon_gap=null; rr.recon_flag='nodata'; }
    });
    if(typeof rcFilter==='function') rcFilter();

    toast(markNoTg ? '✅ Marked: no TG name' : '✅ TG name unlinked');
    htAllRows=[];
    document.getElementById('rc-names-overlay')?.remove();

    // If the collector drill-down popup is open, refresh IT — otherwise
    // rcRun() rebuilds the table underneath while the popup keeps showing
    // the old snapshot, which reads as "my unlink did nothing".
    const openModal = document.getElementById('rc-modal');
    if(openModal && typeof rcRefreshCollector==='function'){
      const who = (Array.isArray(rcAllRows)
        ? (rcAllRows.find(rr=>rr.vendo_id===id)||{}).collector
        : null) || _rcOpenCollector;
      if(who){ await rcRefreshCollector(who); return; }
    }

    if(typeof rcRun==='function'){
      try{ rcBypassCache=true; await rcRun(); }
      catch(e){ if(typeof rcFilter==='function') rcFilter(); }
      finally{ rcBypassCache=false; }
    }
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
  const flagBadge=(f,est)=>{
    // Muted style for estimated (first-harvest) rows — don't present a guess as a verdict.
    if(est){
      const lbl = f==='alert'?'🔴 Short?' : f==='warn'?'🟡 Surplus?' : f==='nodata'?'🔗 needs match' : '✅ OK';
      if(f==='nodata') return '<span style="background:#e8eef7;color:#3b5b8c;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:700;">🔗 needs match</span>';
      return `<span style="background:#f1f3f5;color:#868e96;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600;">${lbl}</span>`;
    }
    return f==='alert'
    ?'<span style="background:#fee2e2;color:#dc2626;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:700;">🔴 Short</span>'
    :f==='warn'
    ?'<span style="background:#fef9c3;color:#b45309;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:700;">🟡 Surplus</span>'
    :f==='nodata'
    ?'<span style="background:#e8eef7;color:#3b5b8c;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:700;">🔗 needs match</span>'
    :'<span style="background:#dcfce7;color:#15803d;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:700;">✅ OK</span>';
  };
  const diffStr=(gap,pct)=>{
    if(gap==null) return '<span style="color:#9ca3af">—</span>';
    // gap = TG income - coins_total.  >20 TG>coins (short, red); <-20 coins>TG (surplus, amber); else OK green
    const c=gap>20?'#dc2626':gap<-20?'#b45309':'#15803d';
    const bg=gap>20?'#fee2e2':gap<-20?'#fefce8':'#dcfce7';
    return `<span style="color:${c};font-weight:700;background:${bg};padding:1px 6px;border-radius:4px;">${fmtP(Math.abs(gap))}</span>`;
  };

  let html='';
  window._rcDetail = {};  // collector -> full detail HTML for popup
  const cardData = [];
  Object.entries(byCollector).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([collector,cd])=>{
    // MATCHED ROWS ONLY. This card compares coins against TG income, so it must
    // only count harvests that HAVE TG income. Previously colCoins summed every
    // row while colTG summed only rows with tg_income — so unmatched vendos
    // (no TG link, no bot in the GC) contributed coins with nothing on the TG
    // side, and the difference was reported as a deficit. For Gilbert that was
    // 54 harvests holding ₱135,135 in coins, inflating the deficit to ₱82,322
    // when the real figure is ~₱6,020. Unmatched is NOT missing money — it is
    // a naming gap, and it belongs in "needs match", not in DEFICIT.
    const matched = cd.rows.filter(r=>r.tg_income!=null);
    const unmatchedN = cd.rows.length - matched.length;
    const unmatchedCoins = cd.rows.filter(r=>r.tg_income==null)
                                  .reduce((s,r)=>s+Number(r.coins_total||0),0);
    const colCoins=matched.reduce((s,r)=>s+Number(r.coins_total||0),0);
    const colTG=matched.reduce((s,r)=>s+Number(r.tg_income||0),0);
    const colGap=matched.filter(r=>r.gap!=null).reduce((s,r)=>s+r.gap,0);
    const colAlerts=cd.rows.filter(r=>r.flag==='alert').length;
    const colWarns=cd.rows.filter(r=>r.flag==='warn').length;
    const colConfirmed=cd.rows.filter(r=>r.reconcile_status==='ok').length;
    const colGapColor=colGap>500?'#dc2626':colGap>100?'#d97706':'#15803d';

    // ---- per-vendo reconciliation breakdown ----
    // Direction rule (owner): coins > TG income = SURPLUS, coins < TG = DEFICIT.
    //
    // THRESHOLD: ±20, matching the table and the spawn_tg_recon RPC. This card
    // used ±100 while the rows behind it used ±20, so the card's EXACT/SURPLUS/
    // DEFICIT counts could never reconcile with the list you see when you tap in.
    //
    // SOURCE: live tg_income only. The old code fell back to the saved
    // recon_gap column, which is written by a background job and goes stale the
    // moment a TG name is linked or unlinked.
    const surplusVal=r=>{
      if(r.tg_income==null) return null;   // unmatched — not a money discrepancy
      return Number(r.coins_total||0)-Number(r.tg_income);   // + = surplus, - = deficit
    };
    const rcRows=matched.filter(r=>surplusVal(r)!=null);
    let exactN=0, surplusN=0, deficitN=0, surplusAmt=0, deficitAmt=0;
    rcRows.forEach(r=>{
      const s=Number(surplusVal(r));
      if(Math.abs(s)<=20){ exactN++; }
      else if(s>0){ surplusN++; surplusAmt+=s; }
      else { deficitN++; deficitAmt+=Math.abs(s); }
    });

    // ---- build the FULL detail (dates→routes→vendos) into a string for the popup ----
    let detail=`<div style="padding:10px 12px;display:flex;flex-direction:column;gap:10px;">`;

    Object.entries(cd.dates).sort((a,b)=>b[0].localeCompare(a[0])).forEach(([dt,dd])=>{
      const dtCoins=dd.rows.reduce((s,r)=>s+Number(r.coins_total||0),0);
      const dtTG=dd.rows.filter(r=>r.tg_income!=null).reduce((s,r)=>s+r.tg_income,0);
      const dtGap=dd.rows.filter(r=>r.gap!=null).reduce((s,r)=>s+r.gap,0);
      const dtAlerts=dd.rows.filter(r=>r.flag==='alert').length;
      const dtWarns=dd.rows.filter(r=>r.flag==='warn').length;
      const dtGapColor=dtGap>500?'#dc2626':dtGap>100?'#d97706':'#15803d';

      detail+=`<div style="border:1px solid #e0e7ff;border-radius:8px;overflow:hidden;">
        <div style="background:#eef2ff;padding:7px 12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #e0e7ff;">
          <span style="font-size:12px;font-weight:700;color:#3730a3;">📅 ${dt}</span>
          <span style="font-size:11px;color:#6b7280;">${dd.rows.length} vendos</span>
          ${dtAlerts?`<span style="background:#fee2e2;color:#dc2626;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;">${dtAlerts} DEFICIT</span>`:''}
          ${dtWarns?`<span style="background:#fef9c3;color:#b45309;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;">${dtWarns} SURPLUS</span>`:''}
          <div style="margin-left:auto;font-size:11px;display:flex;gap:10px;">
            <span>Coins: <b>${fmtP(dtCoins)}</b></span>
            <span>TG: <b>${fmtP(dtTG)}</b></span>
            <span>Gap: <b style="color:${dtGapColor};">${fmtP(Math.abs(dtGap))}</b></span>
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

      detail+=`<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <!-- Route header -->
        <div style="background:#f8faff;padding:8px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid #e5e7eb;">
          <span style="font-family:monospace;font-size:12px;font-weight:700;color:#1565c0;">🧾 ${rc}</span>
          ${srcBadge}
          <span style="font-size:11px;color:var(--mu);">${rd.rows.length} vendos</span>
          ${rcAlerts?`<span style="background:#fee2e2;color:#dc2626;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;">${rcAlerts} DEFICIT</span>`:''}
          ${rcWarns?`<span style="background:#fef9c3;color:#b45309;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;">${rcWarns} SURPLUS</span>`:''}
          <div style="margin-left:auto;display:flex;gap:12px;font-size:11px;">
            <span>Coins: <b>${fmtP(rcCoins)}</b></span>
            <span>TG: <b>${fmtP(rcTG)}</b></span>
            <span>Gap: <b style="color:${rcGapColor};">${fmtP(Math.abs(rcGap))}</b></span>
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
                  <span style="font-weight:600;">${h.sheet_name||`<span style="color:#9ca3af;font-style:italic;font-size:9px;">unmatched</span>`}${noTgBadge}</span>
                  <button onclick="rcShowNamesById(${h.id})" style="border:none;background:none;cursor:pointer;font-size:11px;padding:0 2px;line-height:1;" title="View/Edit TG Name">🔗</button>
                </div>
                ${h.tg_name
                  ? `<div style="font-size:9px;color:#15803d;margin-top:1px;line-height:1.2;">🔗 ${h.tg_name}
                       <span onclick='rcnUnlink(${JSON.stringify(h.sheet_name||h.tg_name)})' style="color:#b91c1c;cursor:pointer;font-weight:700;margin-left:5px;" title="Unlink this TG name">✕ unlink</span>
                     </div>`
                  : `<div style="font-size:9px;color:#b45309;margin-top:1px;line-height:1.2;">⚠ no TG linked
                       <span onclick='rcnUnlink(${JSON.stringify(h.sheet_name||h.tg_name)},{noTg:true})' style="color:#6b7280;cursor:pointer;font-weight:700;margin-left:5px;" title="Mark this vendo as having no TG name yet">🚫 no TG yet</span>
                     </div>`}
              </td>
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;">${h.area||'—'}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;font-weight:500;">${h.harvest_date||'—'}${h.rpc_submitted_at?`<br><span style="font-weight:400;color:var(--mu);font-size:9px;">\ud83d\udd52 ${h.rpc_submitted_at.split(' ').slice(1).join(' ')}</span>`:''}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;color:var(--mu);font-size:10px;">${(h.rpc_window_start && h.rpc_submitted_at) ? `${h.rpc_window_start}<br>\u2192 ${h.rpc_submitted_at}` : `${h.harvest_window_start||'—'} \u2192 ${h.harvest_date||'—'}`}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${fmtP(h.coins_total)}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${tgStr}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">${diffStr(h.gap,h.gap_pct)}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:center;">${flagBadge(h.flag,h.window_estimated)}${h.window_estimated?`<div style="font-size:8px;color:#9ca3af;margin-top:2px;line-height:1.1;" title="First harvest for this vendo — no previous submission to chain from, so the window is a 30-day estimate. Reconciles exactly once it has a second harvest.">\u26a0 est. window</div>`:''}</td>
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

        detail+='</div></div>'; // end route wrapper, end date block inner
      }); // end dates loop
    detail+='</div>'; // close detail container

    // stash the detail HTML for the popup
    window._rcDetail[collector] = {
      html: detail,
      coins: colCoins, tg: colTG, gap: colGap,
      exactN, surplusN, deficitN, surplusAmt, deficitAmt,
      count: cd.rows.length, alerts: colAlerts, warns: colWarns, confirmed: colConfirmed
    };

    // build the collapsed card
    const initial=(collector||'?').trim().charAt(0).toUpperCase();
    const gapTxt=fmtP(Math.abs(colGap));
    const gapChipColor=Math.abs(colGap)<100?'#15803d':colGap>0?'#b45309':'#dc2626';
    const gapChipBg=Math.abs(colGap)<100?'#dcfce7':colGap>0?'#fef9c3':'#fee2e2';
    cardData.push({collector, sortKey:collector, html:`
      <div onclick="rcShowCollector('${collector.replace(/'/g,"\\'")}')" style="background:#fff;border:1.5px solid #c7d2fe;border-radius:12px;padding:14px;cursor:pointer;transition:.12s;" onmouseover="this.style.boxShadow='0 4px 14px rgba(0,0,0,.10)';this.style.borderColor='#6d28d9';" onmouseout="this.style.boxShadow='none';this.style.borderColor='#c7d2fe';">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#1e3cb8,#1565c0);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;flex-shrink:0;">${initial}</div>
          <div style="min-width:0;flex:1;">
            <div style="font-weight:800;font-size:15px;color:#1e3a8a;">${collector}</div>
            <div style="font-size:10px;color:var(--mu);">${cd.rows.length} harvests${colConfirmed?` · ${colConfirmed} confirmed`:''}</div>
          </div>
          ${deficitN?`<span style="background:#fee2e2;color:#dc2626;padding:2px 7px;border-radius:8px;font-size:10px;font-weight:800;">${deficitN} DEFICIT</span>`:''}
          ${surplusN?`<span style="background:#fef9c3;color:#b45309;padding:2px 7px;border-radius:8px;font-size:10px;font-weight:800;">${surplusN} SURPLUS</span>`:''}
          ${unmatchedN?`<span title="${unmatchedN} harvests have no TG name linked, holding ${fmtP(unmatchedCoins)} in coins. Not counted as deficit — they need a TG match first." style="background:#e0e7ff;color:#4338ca;padding:2px 7px;border-radius:8px;font-size:10px;font-weight:800;">🔗 ${unmatchedN} NO TG</span>`:''}
          ${(!deficitN&&!surplusN)?`<span style="background:#dcfce7;color:#15803d;padding:2px 7px;border-radius:8px;font-size:10px;font-weight:800;">✅ OK</span>`:''}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div style="background:#eff6ff;border-radius:7px;padding:8px;text-align:center;"><div style="font-size:13px;font-weight:800;color:#1565c0;">${fmtP(colCoins)}</div><div style="font-size:8px;color:var(--mu);">Coins${unmatchedN?' (matched only)':''}</div></div>
          <div style="background:#f0fdf4;border-radius:7px;padding:8px;text-align:center;"><div style="font-size:13px;font-weight:800;color:#15803d;">${fmtP(colTG)}</div><div style="font-size:8px;color:var(--mu);">TG Income</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:6px;">
          <div style="background:#f0fdf4;border-radius:7px;padding:8px;text-align:center;"><div style="font-size:15px;font-weight:800;color:#15803d;">${exactN}</div><div style="font-size:8px;color:var(--mu);font-weight:700;">✅ EXACT</div></div>
          <div style="background:#fef9c3;border-radius:7px;padding:8px;text-align:center;"><div style="font-size:15px;font-weight:800;color:#b45309;">${surplusN}</div><div style="font-size:8px;color:#b45309;font-weight:700;">🟡 SURPLUS</div><div style="font-size:9px;font-weight:800;color:#b45309;margin-top:1px;">${surplusN?fmtP(surplusAmt):'—'}</div></div>
          <div style="background:#fee2e2;border-radius:7px;padding:8px;text-align:center;"><div style="font-size:15px;font-weight:800;color:#dc2626;">${deficitN}</div><div style="font-size:8px;color:#dc2626;font-weight:700;">🔴 DEFICIT</div><div style="font-size:9px;font-weight:800;color:#dc2626;margin-top:1px;">${deficitN?fmtP(deficitAmt):'—'}</div></div>
        </div>
        <div style="margin-top:10px;font-size:10px;color:#6d28d9;font-weight:700;text-align:center;border-top:1px solid #f1f5f9;padding-top:8px;">Tap to reconcile ›</div>
      </div>`});
  });

  el.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">'
    + cardData.map(c=>c.html).join('') + '</div>';
}

// Recon detail popup — full dates/routes/vendos with working confirm+note buttons
// Which collector the drill-down popup is currently showing. Needed so an
// unlink performed inside the popup knows which popup to rebuild.
let _rcOpenCollector = null;

function rcShowCollector(collector){
  const d=(window._rcDetail||{})[collector];
  if(!d) return;
  _rcOpenCollector = collector;
  const old=document.getElementById('rc-modal'); if(old) old.remove();
  const ov=document.createElement('div');
  ov.id='rc-modal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:99997;display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit;';
  const initial=(collector||'?').trim().charAt(0).toUpperCase();
  const gapTxt=_php(Math.abs(d.gap));
  ov.innerHTML=`<div style="background:#fff;border-radius:16px;max-width:980px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.4);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#1e3cb8,#1565c0);color:#fff;padding:16px 20px;flex-shrink:0;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;">${initial}</div>
      <div><div style="font-size:18px;font-weight:800;">${collector}</div><div style="font-size:11px;opacity:.85;">${d.count} harvests${d.confirmed?` · ${d.confirmed} confirmed`:''}</div></div>
      <div style="margin-left:auto;display:flex;gap:14px;text-align:right;align-items:center;">
        <div><div style="font-size:10px;opacity:.7;">Coins</div><div style="font-size:14px;font-weight:700;">${_php(d.coins)}</div></div>
        <div><div style="font-size:10px;opacity:.7;">TG Income</div><div style="font-size:14px;font-weight:700;">${_php(d.tg)}</div></div>
        <div><div style="font-size:10px;opacity:.7;">✅ Exact</div><div style="font-size:14px;font-weight:700;">${d.exactN??0}</div></div>
        <div><div style="font-size:10px;opacity:.7;">🟡 Surplus</div><div style="font-size:14px;font-weight:700;">${d.surplusN??0}${d.surplusN?` · ${_php(d.surplusAmt)}`:''}</div></div>
        <div><div style="font-size:10px;opacity:.7;">🔴 Deficit</div><div style="font-size:14px;font-weight:700;">${d.deficitN??0}${d.deficitN?` · ${_php(d.deficitAmt)}`:''}</div></div>
        <button id="rc-modal-refresh" onclick='rcRefreshCollector(${JSON.stringify(collector)})' title="Re-read live from the database and rebuild this popup — use after linking or unlinking a TG name" style="background:rgba(255,255,255,.2);border:none;color:#fff;height:30px;padding:0 11px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">↻ Refresh</button>
        <button onclick="rcCloseCollector()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:30px;height:30px;border-radius:8px;font-size:17px;cursor:pointer;font-family:inherit;">✕</button>
      </div>
    </div>
    <div style="overflow-y:auto;flex:1;background:#fbfcff;">${d.html}</div>
  </div>`;
  ov.addEventListener('click',e=>{ if(e.target===ov) rcCloseCollector(); });
  document.body.appendChild(ov);
}
function rcCloseCollector(){ const o=document.getElementById('rc-modal'); if(o) o.remove(); _rcOpenCollector = null; }

// Refresh this popup's contents from live data.
//
// WHY IT ISN'T JUST A RE-RENDER: the popup reads window._rcDetail, a snapshot
// built when the table last rendered. Unlinking a TG name inside the popup
// changes the database but NOT that snapshot — so the row keeps showing the old
// link until the whole table is rebuilt. Re-rendering alone would just redraw
// the same stale snapshot. So: force a live read (bypassing recon_cache.json),
// let rcFilter() rebuild _rcDetail, then reopen this same collector.
async function rcRefreshCollector(collector){
  const btn = document.getElementById('rc-modal-refresh');
  if(btn){ btn.disabled = true; btn.textContent = '⏳ …'; }
  try{
    rcBypassCache = true;
    rcAllRows = [];
    await rcRun();               // live read + rcFilter() rebuilds _rcDetail
  }catch(e){
    toast('Refresh failed: '+e.message);
    if(btn){ btn.disabled = false; btn.textContent = '↻ Refresh'; }
    return;
  }finally{
    rcBypassCache = false;
  }
  // Reopen on the rebuilt snapshot. If this collector no longer has rows in
  // the current filter, say so rather than silently showing an empty popup.
  const d = (window._rcDetail||{})[collector];
  if(d){
    rcShowCollector(collector);
  }else{
    rcCloseCollector();
    toast('No rows for '+collector+' in the current filter');
  }
}

// ══════════════════════════════════════════════════════════
// HARVEST STATS — per-area, per-month comparison (analytics-style)
// ══════════════════════════════════════════════════════════
let _hstData = null;        // [{area, ym, harvests, coins, spawn}]
let _hstMetric = 'spawn';
let _hstChart = null;
const _HST_MONTHS = {'01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun','07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec'};
const _HST_COLORS = ['#025AC6','#FFB725','#028867','#C01176','#DF1A35','#311A8E','#0EA5E9','#F97316','#84CC16','#EC4899'];

// map a harvest's route_code to a combined group name (v3 groups; G1-3 merged)
function _hstGroupOf(route){
  const rc=(route||'').toUpperCase();
  if(rc==='GRP-A1'||rc==='GRP-A2'||rc==='GRP-A3') return 'Dipolog';
  if(rc==='GRP-B1'||rc==='GRP-B2'||rc==='GRP-B3') return 'Dapitan';
  if(rc==='GRP-A4') return 'Sindangan';
  if(rc==='GRP-A5') return 'Polanco';
  if(rc==='GRP-A6') return 'Roxas';
  return 'Pre-v3 / Admin';
}

async function hstLoad(){
  const load=document.getElementById('hst-loading');
  if(load){ load.style.display='block'; load.textContent='Loading harvest stats…'; }
  try{
    // pull all harvests this year (route_code, date, coins, spawn) via gateway
    const year=new Date().getFullYear();
    const rows=[]; let off=0;
    while(true){
      const r=await fetch(`${_SB}/rest/v1/harvests?harvest_date=gte.${year}-01-01&select=route_code,harvest_date,coins_total,spawn_share&limit=1000&offset=${off}`,{headers:_HDR});
      if(!r.ok) throw new Error('harvests '+r.status);
      const d=await r.json();
      if(!Array.isArray(d)||!d.length) break;
      rows.push(...d);
      if(d.length<1000) break;
      off+=1000;
    }
    // aggregate GROUP (from route_code) × month
    const agg={};
    rows.forEach(h=>{
      const area=_hstGroupOf(h.route_code);   // 'area' key reused as the group name
      const ym=(h.harvest_date||'').slice(0,7);
      if(!ym) return;
      const k=area+'|'+ym;
      if(!agg[k]) agg[k]={area, ym, harvests:0, coins:0, spawn:0};
      agg[k].harvests++;
      agg[k].coins += Number(h.coins_total||0);
      agg[k].spawn += Number(h.spawn_share||0);
    });
    _hstData = Object.values(agg);
    if(load) load.style.display='none';
    hstRender();
  }catch(e){
    if(load){ load.style.display='block'; load.textContent='Error: '+e.message; }
  }
}

function hstSetMetric(m, btn){
  _hstMetric=m;
  document.querySelectorAll('.hst-mbtn').forEach(b=>{
    const on=b.dataset.m===m;
    b.classList.toggle('on',on);
    b.style.background=on?'#025AC6':'#fff';
    b.style.color=on?'#fff':'#025AC6';
  });
  hstRender();
}

function hstRender(){
  if(!_hstData) return;
  const metric=_hstMetric;
  const metricLabel = metric==='spawn'?'Spawn Share':metric==='coins'?'Coins':'Harvests';
  const isMoney = metric!=='harvests';
  const titleEl=document.getElementById('hst-chart-title');
  if(titleEl) titleEl.textContent=metricLabel+' by Group · per Month';

  // axes
  const months=[...new Set(_hstData.map(d=>d.ym))].sort();
  const areas=[...new Set(_hstData.map(d=>d.area))].sort();
  // lookup
  const val=(area,ym)=>{ const d=_hstData.find(x=>x.area===area&&x.ym===ym); return d?Number(d[metric]||0):0; };
  const fmtV=v=> isMoney ? _php(v) : v.toLocaleString();

  // ── summary cards: total per area (across all months) ──
  const areaTotals=areas.map(a=>({area:a, total:months.reduce((s,m)=>s+val(a,m),0)})).sort((a,b)=>b.total-a.total);
  const grand=areaTotals.reduce((s,a)=>s+a.total,0);
  const sumEl=document.getElementById('hst-summary');
  if(sumEl){
    sumEl.innerHTML =
      `<div style="background:linear-gradient(135deg,#025AC6,#311A8E);color:#fff;border-radius:10px;padding:12px;">
        <div style="font-size:20px;font-weight:800;">${fmtV(grand)}</div>
        <div style="font-size:10px;opacity:.9;margin-top:2px;">Total ${metricLabel} (${months.length} mo)</div>
      </div>` +
      areaTotals.slice(0,7).map((a,i)=>`<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px;border-left:3px solid ${_HST_COLORS[i%_HST_COLORS.length]};">
        <div style="font-size:17px;font-weight:800;color:#111827;">${fmtV(a.total)}</div>
        <div style="font-size:10px;color:var(--mu);margin-top:2px;">${a.area}</div>
      </div>`).join('');
  }

  // ── grouped bar chart: months on X, one bar-series per area ──
  const ctx=document.getElementById('hst-chart');
  if(ctx && window.Chart){
    if(_hstChart){ _hstChart.destroy(); _hstChart=null; }
    _hstChart=new Chart(ctx,{
      type:'bar',
      data:{
        labels: months.map(m=>{ const [y,mm]=m.split('-'); return (_HST_MONTHS[mm]||mm)+' '+y.slice(2); }),
        datasets: areas.map((a,i)=>({
          label:a,
          data: months.map(m=>val(a,m)),
          backgroundColor:_HST_COLORS[i%_HST_COLORS.length],
          borderRadius:4,
        }))
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{position:'bottom', labels:{boxWidth:12, font:{size:11}}},
          tooltip:{callbacks:{label:c=>c.dataset.label+': '+fmtV(c.parsed.y)}}
        },
        scales:{
          x:{grid:{display:false}},
          y:{beginAtZero:true, ticks:{callback:v=> isMoney ? '₱'+(v/1000)+'k' : v}}
        }
      }
    });
  }

  // ── pivot table: rows=area, cols=month, with totals ──
  let H='<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#025AC6;color:#fff;">'
    +'<th style="padding:8px 12px;text-align:left;">Group</th>'
    + months.map(m=>{ const [y,mm]=m.split('-'); return `<th style="padding:8px 12px;text-align:right;">${_HST_MONTHS[mm]||mm} ${y.slice(2)}</th>`; }).join('')
    +'<th style="padding:8px 12px;text-align:right;background:#0d47a1;">TOTAL</th></tr></thead><tbody>';
  const colTotals={}; months.forEach(m=>colTotals[m]=0);
  areaTotals.forEach((at,idx)=>{
    const a=at.area;
    H+=`<tr style="background:${idx%2?'#f8faff':'#fff'};"><td style="padding:7px 12px;font-weight:700;">${a}</td>`;
    months.forEach(m=>{ const v=val(a,m); colTotals[m]+=v; H+=`<td style="padding:7px 12px;text-align:right;color:${v?'#111827':'#d1d5db'};">${v?fmtV(v):'—'}</td>`; });
    H+=`<td style="padding:7px 12px;text-align:right;font-weight:800;color:#025AC6;">${fmtV(at.total)}</td></tr>`;
  });
  H+='<tr style="background:#e8f0fe;font-weight:800;border-top:2px solid #025AC6;"><td style="padding:8px 12px;">TOTAL</td>'
    + months.map(m=>`<td style="padding:8px 12px;text-align:right;color:#025AC6;">${fmtV(colTotals[m])}</td>`).join('')
    + `<td style="padding:8px 12px;text-align:right;color:#0d47a1;">${fmtV(grand)}</td></tr>`;
  H+='</tbody></table>';
  const tEl=document.getElementById('hst-table'); if(tEl) tEl.innerHTML=H;
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
const KL_AREAS = ['POLANCO','BANDERA','ROXAS','KATIPUNAN','SANGKOL','COGON','SINAMAN','DICAYAS','MINAOG','PUNTA','EGOT/ESTAKA','GULAYON/GALAS','TURNO','SANTA ISABEL','MIPUTAK','DAPITAN AREAS'];

function klBuildAreas(){
  const box = document.getElementById('kl-area-box');
  if(!box || box.children.length) return;
  box.innerHTML = KL_AREAS.map(a=>
    '<label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#374151;cursor:pointer;">'
    + '<input type="checkbox" class="kl-area-cb" value="'+klEsc(a)+'" style="width:15px;height:15px;cursor:pointer;">'+klEsc(a)+'</label>'
  ).join('');
}

function klSelectedAreas(){
  return Array.from(document.querySelectorAll('#kl-area-box .kl-area-cb:checked')).map(c=>c.value);
}

function klClearAreas(){
  document.querySelectorAll('#kl-area-box .kl-area-cb').forEach(c=>c.checked=false);
}

function klEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function klLoad(){
  const list = document.getElementById('kl-list');
  if(list) list.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;">Loading…</div>';
  klBuildAreas();
  // default date to today
  const dEl = document.getElementById('kl-date');
  if(dEl && !dEl.value){ const n=new Date(); dEl.value = n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'); }
  // populate collector dropdown (rebuild each load to avoid duplicates)
  const sel = document.getElementById('kl-name');
  if(sel){
    const cur = sel.value;
    fetch(_SB+'/rest/v1/collectors?select=name&active=eq.true&order=name.asc', {headers:_HDR})
      .then(r=>r.json())
      .then(cs=>{
        sel.innerHTML = '<option value="">— Select Collector —</option>';
        if(Array.isArray(cs)){ cs.forEach(c=>{ const o=document.createElement('option'); o.value=c.name; o.textContent=c.name; sel.appendChild(o); }); }
        if(cur) sel.value = cur;
      })
      .catch(()=>{});
  }
  Promise.all([
    fetch(_SB+'/rest/v1/key_logs?select=*&order=taken_at.desc&limit=500', {headers:_HDR}).then(r=>r.json()),
    fetch(_SB+'/rest/v1/key_items?select=*&order=id.asc&limit=2000', {headers:_HDR}).then(r=>r.json()).catch(()=>[])
  ])
    .then(([rows, items])=>{ _klRows = Array.isArray(rows)?rows:[]; _klItems = Array.isArray(items)?items:[]; klRender(); })
    .catch(e=>{ if(list) list.innerHTML = '<div style="padding:20px;color:#DF1A35;">Load error: '+klEsc(e.message)+'</div>'; });
}

let _klItems = [];
const KI_VAR = { original:'Original', duplicate:'Duplicate', pungpung:'Pungpung' };
const KI_LBL = it => it.key_kind==='board' ? '🔌 Board' : ('🪙 Coins ('+(KI_VAR[it.coin_variant]||it.coin_variant||'?')+')');

/* per-key checkbox: mark a single key_items row returned (password 101510) */
function kiToggle(itemId, makeReturned){
  const it = _klItems.find(x=>x.id===itemId); if(!it) return;
  const verb = makeReturned ? 'RETURNED' : 'NOT returned';
  const old = document.getElementById('ki-pw-modal'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'ki-pw-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:18px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;font-family:inherit;">'
    + '<div style="background:linear-gradient(135deg,'+(makeReturned?'#028867':'#DF1A35')+',#311A8E);padding:18px 22px;color:#fff;">'
    +   '<div style="font-size:17px;font-weight:800;">🔑 Mark '+verb+'</div>'
    +   '<div style="font-size:12px;opacity:.9;margin-top:3px;">'+klEsc(it.vendo_name)+' · '+KI_LBL(it)+'</div>'
    + '</div>'
    + '<div style="padding:18px 22px;">'
    +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">🔒 Password</label>'
    +   '<input id="ki-pw" type="password" inputmode="numeric" placeholder="Enter password" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;" onkeydown="if(event.key===\'Enter\')kiConfirm('+itemId+','+(makeReturned?'true':'false')+')">'
    +   '<div id="ki-pw-err" style="color:#DF1A35;font-size:12px;font-weight:700;margin-top:8px;display:none;">❌ Wrong password.</div>'
    +   '<div style="display:flex;gap:8px;margin-top:18px;">'
    +     '<button onclick="kiClosePw()" style="flex:1;padding:11px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Cancel</button>'
    +     '<button onclick="kiConfirm('+itemId+','+(makeReturned?'true':'false')+')" style="flex:2;padding:11px;background:'+(makeReturned?'#028867':'#DF1A35')+';color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;">✓ Confirm</button>'
    +   '</div>'
    + '</div>'
    + '</div>';
  ov.addEventListener('click', e=>{ if(e.target===ov) kiClosePw(); });
  document.body.appendChild(ov);
  setTimeout(()=>{ const p=document.getElementById('ki-pw'); if(p) p.focus(); }, 60);
}

function kiClosePw(){ const ov=document.getElementById('ki-pw-modal'); if(ov) ov.remove(); klRender(); }

function kiConfirm(itemId, makeReturned){
  const pw = (document.getElementById('ki-pw')||{}).value || '';
  const err = document.getElementById('ki-pw-err');
  if(pw !== KL_RETURN_PW){ if(err) err.style.display='block'; const p=document.getElementById('ki-pw'); if(p){p.value='';p.focus();} return; }
  const body = makeReturned
    ? { returned:true, returned_at:new Date().toISOString() }
    : { returned:false, returned_at:null };
  fetch(_SB+'/rest/v1/key_items?id=eq.'+itemId, {method:'PATCH', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(body)})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});}
      const ov=document.getElementById('ki-pw-modal'); if(ov) ov.remove();
      // auto-close parent log when all its items are returned
      const it = _klItems.find(x=>x.id===itemId);
      if(it && it.key_log_id){
        const sibs = _klItems.filter(x=>x.key_log_id===it.key_log_id);
        sibs.forEach(s=>{ if(s.id===itemId) s.returned = makeReturned; });
        const allBack = sibs.every(s=>s.returned);
        return fetch(_SB+'/rest/v1/key_logs?id=eq.'+it.key_log_id, {method:'PATCH', headers:Object.assign({'Prefer':'return=minimal'},_HDR),
          body:JSON.stringify(allBack ? {returned:true, returned_at:new Date().toISOString()} : {returned:false, returned_at:null})});
      }
    })
    .then(()=>klLoad())
    .catch(e=>alert('Update failed: '+e.message));
}

function klAdd(){
  const name = document.getElementById('kl-name').value.trim();
  const areas = klSelectedAreas();
  const area = areas.join(', ');
  const count = parseInt(document.getElementById('kl-count').value,10)||0;
  const kdate = document.getElementById('kl-date').value || null;
  const notes = document.getElementById('kl-notes').value.trim();
  if(!name){ alert('Select collector name'); return; }
  if(!areas.length){ alert('Check at least one area'); return; }
  const body = { record_type:'collector', collector_name:name, area:area||null, keys_taken:count, key_date:kdate, notes:notes||null, returned:false };
  fetch(_SB+'/rest/v1/key_logs', {method:'POST', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(body)})
    .then(r=>{
      if(!r.ok){ return r.text().then(t=>{throw new Error(t);}); }
      document.getElementById('kl-name').value='';
      document.getElementById('kl-notes').value='';
      document.getElementById('kl-count').value='1';
      klClearAreas();
      klLoad();
    })
    .catch(e=>alert('Save failed: '+e.message));
}

function klOpenLineman(){
  const old = document.getElementById('kl-lineman-modal'); if(old) old.remove();
  _lmVendos = [];
  const now = new Date();
  const today = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  const ov = document.createElement('div');
  ov.id = 'kl-lineman-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px;';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:18px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:inherit;">'
    + '<div style="background:linear-gradient(135deg,#025AC6,#311A8E);padding:18px 22px;color:#fff;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2;">'
    +   '<div style="font-size:18px;font-weight:800;">🛠️ Lineman WiFi Key</div>'
    +   '<button onclick="klCloseLineman()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:30px;height:30px;border-radius:8px;font-size:17px;cursor:pointer;font-family:inherit;">✕</button>'
    + '</div>'
    + '<div style="padding:18px 22px;">'
    +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Lineman Name</label>'
    +   '<input id="kl-lm-name" list="kc-by-list" placeholder="e.g. Jericho" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:14px;outline:none;">'
    +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Add vendo he took keys for</label>'
    +   '<div style="position:relative;margin-bottom:12px;">'
    +     '<input id="kl-lm-vq" placeholder="🔍 Search vendo then click to add..." oninput="lmVendoInput()" autocomplete="off" style="width:100%;padding:10px 12px;border:1.5px solid #025AC6;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;">'
    +     '<div id="kl-lm-vres" style="position:absolute;top:100%;left:0;right:0;background:#fff;border:1.5px solid #025AC6;border-radius:8px;max-height:200px;overflow-y:auto;z-index:60;display:none;box-shadow:0 8px 20px rgba(0,0,0,.15);"></div>'
    +   '</div>'
    +   '<div id="kl-lm-vlist" style="margin-bottom:12px;"></div>'
    +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Reason (why the wifi key was taken)</label>'
    +   '<input id="kl-lm-reason" placeholder="e.g. move the box, repair..." style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:12px;outline:none;">'
    +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Date</label>'
    +   '<input id="kl-lm-date" type="date" value="'+today+'" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:12px;outline:none;">'
    +   '<div id="kl-lm-preview" style="display:none;background:#f0f7ff;border:1.5px dashed #025AC6;border-radius:9px;padding:11px 13px;margin-bottom:16px;font-size:12px;color:#1e3a8a;font-weight:700;white-space:pre-line;line-height:1.6;"></div>'
    +   '<div style="display:flex;gap:8px;">'
    +     '<button onclick="klCloseLineman()" style="flex:1;padding:11px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Cancel</button>'
    +     '<button onclick="klAddLineman()" style="flex:2;padding:11px;background:#025AC6;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;">✓ Log Lineman Key</button>'
    +   '</div>'
    + '</div>'
    + '</div>';
  ov.addEventListener('click', e=>{ if(e.target===ov) klCloseLineman(); });
  document.body.appendChild(ov);
  kcEnsureNames();
  lmRenderVendos();
  setTimeout(()=>{ const n=document.getElementById('kl-lm-name'); if(n) n.focus(); }, 60);
}

// multiple vendos per lineman borrow record
let _lmVendos = [], _lmVT = null, _lmSeq = 0;

const LM_KEYS = [
  {k:'coin_duplicate', lbl:'🪙 Coin Key — Duplicate'},
  {k:'coin_pungpung',  lbl:'🪙 Coin Key sa Pungpung'},
  {k:'board',          lbl:'🔌 Board Key'}
];
const LM_SHORT = { coin_original:'Coins (Original)', coin_duplicate:'Coins (Duplicate)', coin_pungpung:'Coins (Pungpung)', board:'Board' };

function lmVendoInput(){
  clearTimeout(_lmVT);
  const q = (document.getElementById('kl-lm-vq')||{}).value.trim();
  const box = document.getElementById('kl-lm-vres');
  if(!box) return;
  if(q.length<2){ box.style.display='none'; box.innerHTML=''; return; }
  _lmVT = setTimeout(()=>{
    const enc = encodeURIComponent('*'+q+'*');
    fetch(_SB+'/rest/v1/vendos?select=id,sheet_name,tg_name,owner_name,area&or=(sheet_name.ilike.'+enc+',tg_name.ilike.'+enc+',owner_name.ilike.'+enc+')&limit=12', {headers:_HDR})
      .then(r=>r.json())
      .then(rows=>{
        if(!Array.isArray(rows) || !rows.length){ box.innerHTML='<div style="padding:10px 12px;font-size:12px;color:#6b7280;">No vendo found.</div>'; box.style.display='block'; return; }
        box.innerHTML = rows.map(v=>{
          const nm = v.sheet_name || v.tg_name || v.owner_name || ('#'+v.id);
          return '<div onclick=\'lmAddVendo('+JSON.stringify(v.id)+','+JSON.stringify(nm)+','+JSON.stringify(v.area||'')+')\' '
            + 'style="padding:9px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:12px;" '
            + 'onmouseover="this.style.background=\'#f0f7ff\'" onmouseout="this.style.background=\'#fff\'">'
            + '<b style="color:#311A8E;">'+klEsc(nm)+'</b>'
            + (v.area?' · <span style="color:#025AC6;font-weight:700;">'+klEsc(v.area)+'</span>':'')
            + '</div>';
        }).join('');
        box.style.display='block';
      })
      .catch(()=>{ box.style.display='none'; });
  }, 300);
}

function lmAddVendo(id, name, area){
  const box = document.getElementById('kl-lm-vres'); if(box){ box.style.display='none'; box.innerHTML=''; }
  const vq = document.getElementById('kl-lm-vq'); if(vq) vq.value='';
  if(_lmVendos.some(v=>v.id===id)){ alert('This vendo is already added: '+name); return; }
  _lmVendos.push({row:++_lmSeq, id:id, name:name, area:area||null, keys:{}});
  lmRenderVendos();
}

function lmRemoveVendo(row){
  _lmVendos = _lmVendos.filter(v=>v.row!==row);
  lmRenderVendos();
}

function lmSetKey(row, k, on){
  const v = _lmVendos.find(x=>x.row===row); if(!v) return;
  v.keys[k] = on;
  lmCompile();
}

function lmRenderVendos(){
  const el = document.getElementById('kl-lm-vlist');
  if(!el) return;
  if(!_lmVendos.length){
    el.innerHTML = '<div style="padding:14px;text-align:center;color:#9ca3af;font-size:12px;border:1.5px dashed #e5e7eb;border-radius:9px;">No vendo yet. Search above to add.</div>';
    lmCompile();
    return;
  }
  el.innerHTML = _lmVendos.map(v=>
    '<div style="border:1.5px solid #025AC6;border-radius:9px;padding:10px 12px;margin-bottom:8px;background:#f8fbff;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:7px;">'
    +   '<div style="font-size:13px;font-weight:800;color:#311A8E;">'+klEsc(v.name)+(v.area?' <span style="font-size:10px;color:#025AC6;">· '+klEsc(v.area)+'</span>':'')+'</div>'
    +   '<button onclick="lmRemoveVendo('+v.row+')" style="background:#fff;border:1.5px solid #fca5a5;color:#DF1A35;width:26px;height:26px;border-radius:7px;font-size:13px;cursor:pointer;font-family:inherit;flex-shrink:0;">✕</button>'
    + '</div>'
    + LM_KEYS.map(kk=>
        '<label style="display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:#374151;cursor:pointer;padding:2px 0;">'
        + '<input type="checkbox" '+(v.keys[kk.k]?'checked':'')+' onchange="lmSetKey('+v.row+',\''+kk.k+'\',this.checked)" style="width:15px;height:15px;cursor:pointer;">'
        + kk.lbl + '</label>'
      ).join('')
    + '</div>'
  ).join('');
  lmCompile();
}

// auto-compiled message of everything clicked
function lmCompile(){
  const pv = document.getElementById('kl-lm-preview');
  if(!pv) return;
  if(!_lmVendos.length){ pv.style.display='none'; return; }
  const lines = _lmVendos.map(v=>{
    const picked = LM_KEYS.filter(kk=>v.keys[kk.k]).map(kk=>LM_SHORT[kk.k]);
    if(!picked.length) return '⚠️ '+v.name+' — no key checked';
    const only = (picked.length===1 && picked[0]==='Board') ? ' Key only' : '';
    return '• '+v.name+' — '+picked.join(', ')+only;
  });
  const total = _lmVendos.reduce((s,v)=>s+LM_KEYS.filter(kk=>v.keys[kk.k]).length, 0);
  pv.style.display='block';
  pv.textContent = '📝 Compiled ('+total+' key'+(total===1?'':'s')+' · '+_lmVendos.length+' vendo'+(_lmVendos.length===1?'':'s')+'):\n'+lines.join('\n');
}

function klCloseLineman(){ const ov=document.getElementById('kl-lineman-modal'); if(ov) ov.remove(); _lmVendos=[]; }

function klAddLineman(){
  const lineman = ((document.getElementById('kl-lm-name')||{}).value||'').trim();
  const reason  = ((document.getElementById('kl-lm-reason')||{}).value||'').trim();
  const kdate   = (document.getElementById('kl-lm-date')||{}).value || null;
  if(!lineman){ alert('Enter lineman name'); return; }
  if(!_lmVendos.length){ alert('Search and pick a vendo first'); return; }
  const items = [];
  const bad = [];
  _lmVendos.forEach(v=>{
    const picked = LM_KEYS.filter(kk=>v.keys[kk.k]);
    if(!picked.length){ bad.push(v.name); return; }
    picked.forEach(kk=>{
      items.push({
        vendo_id: v.id, vendo_name: v.name, area: v.area,
        key_kind: kk.k==='board' ? 'board' : 'coin',
        coin_variant: kk.k==='board' ? null : kk.k.replace('coin_',''),
        returned: false
      });
    });
  });
  if(bad.length){ alert('No keys checked for:\n\n'+bad.map(b=>'  • '+b).join('\n')+'\n\nCheck a key or remove them.'); return; }
  if(!items.length){ alert('Check at least one key'); return; }
  const areas = Array.from(new Set(_lmVendos.map(v=>v.area).filter(Boolean))).join(', ');
  const compiled = (document.getElementById('kl-lm-preview')||{}).textContent || '';
  const body = { record_type:'lineman', collector_name:lineman, lineman:lineman,
                 wifi_key: compiled.split('\n').slice(1).join(' · ').replace(/^• /,'').replace(/ · • /g,' · '),
                 lineman_reason:reason||null, key_date:kdate, keys_taken:items.length,
                 area:areas||null, returned:false };
  fetch(_SB+'/rest/v1/key_logs', {method:'POST', headers:Object.assign({'Prefer':'return=representation'},_HDR), body:JSON.stringify(body)})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} return r.json(); })
    .then(rows=>{
      const logId = Array.isArray(rows)&&rows[0] ? rows[0].id : null;
      if(!logId) throw new Error('no log id returned');
      items.forEach(it=>{ it.key_log_id = logId; });
      return fetch(_SB+'/rest/v1/key_items', {method:'POST', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(items)});
    })
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} klCloseLineman(); klLoad(); })
    .catch(e=>alert('Save failed: '+e.message));
}

const KL_RETURN_PW = '101510';

function klMarkReturned(id){
  const rec = _klRows.find(r=>r.id===id) || {};
  const stamp = new Date();
  const stampStr = stamp.toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true});
  // remove any existing modal
  const old = document.getElementById('kl-return-modal'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'kl-return-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:18px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;font-family:inherit;">'
    + '<div style="background:linear-gradient(135deg,#028867,#025AC6);padding:20px 22px;color:#fff;">'
    +   '<div style="font-size:19px;font-weight:800;display:flex;align-items:center;gap:8px;">🔑 Return Keys</div>'
    +   '<div style="font-size:12px;opacity:.9;margin-top:3px;">'+klEsc(rec.collector_name||'')+' · '+klEsc(rec.area||'—')+'</div>'
    + '</div>'
    + '<div style="padding:20px 22px;">'
    +   '<div style="background:#f0fdf9;border:1.5px solid #028867;border-radius:10px;padding:10px 12px;margin-bottom:16px;font-size:12px;color:#065f46;">'
    +     '📅 Return stamp: <b>'+stampStr+'</b> <span style="color:#059669;">(auto)</span>'
    +   '</div>'
    +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Return notes (optional)</label>'
    +   '<input id="kl-rt-note" placeholder="remarks..." style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:14px;outline:none;">'
    +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">🔒 Password</label>'
    +   '<input id="kl-rt-pw" type="password" inputmode="numeric" placeholder="Enter password to confirm" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;" onkeydown="if(event.key===\'Enter\')klConfirmReturn('+id+')">'
    +   '<div id="kl-rt-err" style="color:#DF1A35;font-size:12px;font-weight:700;margin-top:8px;display:none;">❌ Wrong password.</div>'
    +   '<div style="display:flex;gap:8px;margin-top:20px;">'
    +     '<button onclick="klCloseReturn()" style="flex:1;padding:11px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Cancel</button>'
    +     '<button onclick="klConfirmReturn('+id+')" style="flex:2;padding:11px;background:#028867;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;">✓ Confirm Return</button>'
    +   '</div>'
    + '</div>'
    + '</div>';
  ov.addEventListener('click', e=>{ if(e.target===ov) klCloseReturn(); });
  document.body.appendChild(ov);
  setTimeout(()=>{ const p=document.getElementById('kl-rt-pw'); if(p) p.focus(); }, 60);
}

function klCloseReturn(){
  const ov = document.getElementById('kl-return-modal'); if(ov) ov.remove();
}

function klConfirmReturn(id){
  const pw = (document.getElementById('kl-rt-pw')||{}).value || '';
  const err = document.getElementById('kl-rt-err');
  if(pw !== KL_RETURN_PW){ if(err) err.style.display='block'; const p=document.getElementById('kl-rt-pw'); if(p){p.value='';p.focus();} return; }
  const note = (document.getElementById('kl-rt-note')||{}).value.trim();
  const body = { returned:true, returned_at:new Date().toISOString(), returned_notes:note||null };
  fetch(_SB+'/rest/v1/key_logs?id=eq.'+id, {method:'PATCH', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(body)})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} klCloseReturn(); klLoad(); })
    .catch(e=>alert('Update failed: '+e.message));
}

function klUndoReturn(id){
  if(!confirm('Mark this key as NOT returned again?')) return;
  const body = { returned:false, returned_at:null, returned_notes:null };
  fetch(_SB+'/rest/v1/key_logs?id=eq.'+id, {method:'PATCH', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(body)})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} klCloseDetail(); klLoad(); })
    .catch(e=>alert('Update failed: '+e.message));
}

function klDelete(id){
  // custody-safe delete: never destroy return history
  const kids = _klItems.filter(x=>x.key_log_id===id);
  const back = kids.filter(x=>x.returned);
  if(back.length){
    alert('🔒 This record cannot be deleted.\n\n'
      + back.length+' of '+kids.length+' key(s) already marked returned:\n'
      + back.map(x=>'  ✅ '+x.vendo_name+' — '+KI_LBL(x)).join('\n')
      + '\n\nDeleting would lose the return history. Uncheck the returned key(s) first (password '+KL_RETURN_PW+') if you really want to delete.');
    return;
  }
  const warn = kids.length
    ? 'Delete this key record permanently?\n\nThis also deletes '+kids.length+' key(s) not yet returned:\n'
      + kids.map(x=>'  🔴 '+x.vendo_name+' — '+KI_LBL(x)).join('\n')
    : 'Delete this key record permanently?';
  if(!confirm(warn)) return;
  fetch(_SB+'/rest/v1/key_logs?id=eq.'+id, {method:'DELETE', headers:_HDR})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} klCloseDetail(); klLoad(); })
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
  else if(filt==='collector') rows = rows.filter(r=>r.record_type!=='lineman');
  else if(filt==='lineman') rows = rows.filter(r=>r.record_type==='lineman');
  if(q) rows = rows.filter(r=>((r.collector_name||'')+' '+(r.area||'')+' '+(r.notes||'')+' '+(r.lineman||'')+' '+(r.wifi_key||'')+' '+(r.lineman_reason||'')).toLowerCase().includes(q));

  const out = _klRows.filter(r=>!r.returned).length;
  const outKeys = _klRows.filter(r=>!r.returned).reduce((s,r)=>s+(r.keys_taken||0),0);
  if(lbl) lbl.textContent = rows.length+' record(s) shown · '+out+' out ('+outKeys+' keys not yet returned)';

  if(!rows.length){ list.innerHTML='<div style="padding:20px;text-align:center;color:#6b7280;">No records.</div>'; return; }

  list.innerHTML = rows.map(r=>{
    const returned = !!r.returned;
    const isLM = (r.record_type==='lineman');
    const bd = returned ? '#028867' : '#DF1A35';
    const badge = returned
      ? '<span style="background:#028867;color:#fff;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:800;">✅</span>'
      : '<span style="background:#DF1A35;color:#fff;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:800;">🔴 OUT</span>';
    return '<div onclick="klDetail('+r.id+')" style="background:#fff;border:1.5px solid #e5e7eb;border-left:4px solid '+bd+';border-radius:9px;padding:11px 13px;margin-bottom:8px;cursor:pointer;transition:.1s;" onmouseover="this.style.boxShadow=\'0 3px 10px rgba(0,0,0,.10)\';this.style.borderColor=\'#025AC6\';this.style.borderLeftColor=\''+bd+'\';" onmouseout="this.style.boxShadow=\'none\';this.style.borderColor=\'#e5e7eb\';this.style.borderLeftColor=\''+bd+'\';">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'
      +   '<div style="font-size:14px;font-weight:800;color:#311A8E;">'+(isLM?'🛠️ ':'')+klEsc(r.collector_name)+'</div>'
      +   badge
      + '</div>'
      + (isLM
          ? '<div style="font-size:12px;color:#025AC6;margin-top:3px;font-weight:600;">📶 '+klEsc(r.wifi_key||'—')+(r.key_date?(' · 📅 '+klEsc(r.key_date)):'')+'</div>'
            + (r.lineman_reason?'<div style="font-size:11px;color:#C01176;margin-top:2px;">💬 '+klEsc(r.lineman_reason)+'</div>':'')
            + klItemBoxes(r.id)
          : '<div style="font-size:12px;color:#374151;margin-top:3px;">📍 '+klEsc(r.area||'—')+' · 🔑 '+(r.keys_taken||0)+(r.key_date?(' · 📅 '+klEsc(r.key_date)):'')+'</div>')
      + '<div style="font-size:10px;color:#9ca3af;margin-top:4px;">Tap for details ›</div>'
      + '</div>';
  }).join('');
}

function klDetail(id){
  const r = _klRows.find(x=>x.id===id); if(!r) return;
  const returned = !!r.returned;
  const bd = returned ? '#028867' : '#DF1A35';
  const old = document.getElementById('kl-detail-modal'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'kl-detail-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px;';
  const row = (icon,label,val)=> val ? '<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid #f1f5f9;"><div style="width:120px;font-size:12px;color:#6b7280;font-weight:700;flex-shrink:0;">'+icon+' '+label+'</div><div style="font-size:13px;color:#111827;font-weight:600;flex:1;">'+klEsc(val)+'</div></div>' : '';
  const actions = returned
    ? '<button onclick="klUndoReturn('+r.id+')" style="flex:1;padding:11px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">↩ Undo Return</button>'
    : '<button onclick="klCloseDetail();klMarkReturned('+r.id+')" style="flex:2;padding:11px;background:#028867;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;">✓ Mark Returned</button>';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:18px;max-width:440px;width:100%;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:inherit;">'
    + '<div style="background:linear-gradient(135deg,'+bd+',#311A8E);padding:18px 22px;color:#fff;display:flex;justify-content:space-between;align-items:flex-start;">'
    +   '<div><div style="font-size:19px;font-weight:800;">'+klEsc(r.collector_name)+'</div>'
    +   '<div style="font-size:12px;opacity:.9;margin-top:2px;">'+(returned?'✅ Returned':'🔴 Keys Out')+'</div></div>'
    +   '<button onclick="klCloseDetail()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:30px;height:30px;border-radius:8px;font-size:17px;cursor:pointer;font-family:inherit;">✕</button>'
    + '</div>'
    + '<div style="padding:16px 22px;">'
    +   row('📍','Areas',r.area||'—')
    +   row('🔑','No. of Keys',String(r.keys_taken||0))
    +   row('📅','Date',r.key_date||'—')
    +   row('📝','Notes',r.notes)
    +   row('🛠️','Lineman',r.lineman)
    +   row('📶','WiFi Key',r.wifi_key)
    +   row('💬','Reason',r.lineman_reason)
    +   row('🕐','Logged',_fmt(r.taken_at))
    +   (returned?row('↩','Returned At',_fmt(r.returned_at)):'')
    +   (returned&&r.returned_notes?row('🗒️','Return Notes',r.returned_notes):'')
    +   '<div style="display:flex;gap:8px;margin-top:18px;">'+actions
    +     '<button onclick="klEdit('+r.id+')" style="padding:11px 14px;background:#fff;color:#025AC6;border:1.5px solid #93c5fd;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">✏️ Edit</button>'
    +     '<button onclick="klCloseDetail();klDelete('+r.id+')" style="padding:11px 14px;background:#fff;color:#DF1A35;border:1.5px solid #fca5a5;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">🗑</button>'
    +   '</div>'
    + '</div>'
    + '</div>';
  ov.addEventListener('click', e=>{ if(e.target===ov) klCloseDetail(); });
  document.body.appendChild(ov);
}

function klCloseDetail(){ const ov=document.getElementById('kl-detail-modal'); if(ov) ov.remove(); }

// ── Edit a key-custody record (password 101510 required to save) ──
function klEdit(id){
  const r = _klRows.find(x=>x.id===id); if(!r) return;
  klCloseDetail();
  const old = document.getElementById('kl-edit-modal'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'kl-edit-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit;';
  const fld = (id,label,val,ph)=>
      '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin:12px 0 5px;">'+label+'</label>'
    + '<input id="'+id+'" type="text" value="'+klEsc(val==null?'':val)+'" placeholder="'+(ph||'')+'" style="width:100%;padding:11px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:14px;box-sizing:border-box;outline:none;font-family:inherit;">';
  const numFld = (id,label,val)=>
      '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin:12px 0 5px;">'+label+'</label>'
    + '<input id="'+id+'" type="number" min="0" value="'+(val||0)+'" style="width:100%;padding:11px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:14px;box-sizing:border-box;outline:none;font-family:inherit;">';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:18px;max-width:440px;width:100%;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.35);">'
    + '<div style="background:linear-gradient(135deg,#025AC6,#311A8E);padding:18px 22px;color:#fff;display:flex;justify-content:space-between;align-items:center;">'
    +   '<div style="font-size:18px;font-weight:800;">✏️ Edit Key Record</div>'
    +   '<button onclick="klCloseEdit()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:30px;height:30px;border-radius:8px;font-size:17px;cursor:pointer;font-family:inherit;">✕</button>'
    + '</div>'
    + '<div style="padding:16px 22px 20px;">'
    +   fld('kl-e-collector','👤 Lineman / Collector', r.collector_name, 'Name')
    +   fld('kl-e-area','📍 Areas', r.area, '—')
    +   numFld('kl-e-keys','🔑 No. of Keys', r.keys_taken)
    +   fld('kl-e-date','📅 Date', r.key_date, 'YYYY-MM-DD')
    +   fld('kl-e-lineman','🛠️ Lineman', r.lineman, '')
    +   fld('kl-e-wifikey','📶 WiFi Key', r.wifi_key, '')
    +   fld('kl-e-reason','💬 Reason', r.lineman_reason, '')
    +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin:12px 0 5px;">📝 Notes</label>'
    +   '<textarea id="kl-e-notes" rows="2" placeholder="Optional" style="width:100%;padding:11px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:14px;box-sizing:border-box;outline:none;font-family:inherit;resize:vertical;">'+klEsc(r.notes||'')+'</textarea>'
    +   '<div style="display:flex;gap:8px;margin-top:20px;">'
    +     '<button onclick="klCloseEdit()" style="flex:1;padding:12px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Cancel</button>'
    +     '<button onclick="klSaveEdit('+r.id+')" style="flex:2;padding:12px;background:#028867;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;">💾 Save changes</button>'
    +   '</div>'
    + '</div>'
    + '</div>';
  ov.addEventListener('click', e=>{ if(e.target===ov) klCloseEdit(); });
  document.body.appendChild(ov);
  setTimeout(()=>{ const i=document.getElementById('kl-e-collector'); if(i) i.focus(); }, 60);
}

function klCloseEdit(){ const ov=document.getElementById('kl-edit-modal'); if(ov) ov.remove(); }

async function klSaveEdit(id){
  const gv = k => { const el=document.getElementById(k); return el? el.value : ''; };
  const body = {
    collector_name: (gv('kl-e-collector').trim())||null,
    area:           (gv('kl-e-area').trim())||null,
    keys_taken:     parseInt(gv('kl-e-keys'),10)||0,
    key_date:       (gv('kl-e-date').trim())||null,
    lineman:        (gv('kl-e-lineman').trim())||null,
    wifi_key:       (gv('kl-e-wifikey').trim())||null,
    lineman_reason: (gv('kl-e-reason').trim())||null,
    notes:          (gv('kl-e-notes').trim())||null
  };
  // password gate (101510) using the shared pretty popup
  const pw = await askAdminPw('Enter admin password to save these changes.');
  if(pw===null) return;
  if(pw!=='101510'){ markAdminPwWrong(); return; }
  const pwModal = document.getElementById('spawn-pw-modal'); if(pwModal) pwModal.remove();
  try{
    const r = await fetch(_SB+'/rest/v1/key_logs?id=eq.'+id, {method:'PATCH', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(body)});
    if(!r.ok){ const t=await r.text(); throw new Error(t); }
    klCloseEdit();
    if(typeof toast==='function') toast('✓ Key record updated'); else alert('Key record updated');
    klLoad();
  }catch(e){ alert('Update failed: '+e.message); }
}


/* ══ KEYS SUB-PANES — Borrow Log / Overview / Padlock Changes ══ */
let _kvPane = 'borrow';

function kvPane(p, btn){
  _kvPane = p;
  ['borrow','overview','changes','installs','transfer'].forEach(t=>{
    const el = document.getElementById('kv-pane-'+t);
    if(el) el.style.display = (t===p) ? (t==='overview'?'flex':'block') : 'none';
    const b = document.getElementById('kvp-'+t);
    if(b){
      const on = (t===p);
      b.style.background = on ? '#025AC6' : '#fff';
      b.style.color      = on ? '#fff'    : '#374151';
      b.style.borderColor= on ? '#025AC6' : '#e5e7eb';
    }
  });
  if(p==='borrow')   klLoad();
  if(p==='overview') kvoLoad();
  if(p==='changes')  kcLoad();
  if(p==='installs') viLoad();
  if(p==='transfer') { kcEnsureNames(); ktLoad(); }
}

/* ── OVERVIEW: merged view of key_logs + key_changes, search per day or by name ── */
let _kvoLogs = [], _kvoChanges = [], _kvoItems = [], _kvoInstalls = [];

function kvoLoad(){
  const list = document.getElementById('kvo-list');
  if(list) list.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;">Loading…</div>';
  Promise.all([
    fetch(_SB+'/rest/v1/key_logs?select=*&order=taken_at.desc&limit=800', {headers:_HDR}).then(r=>r.json()),
    fetch(_SB+'/rest/v1/key_changes?select=*&order=created_at.desc&limit=800', {headers:_HDR}).then(r=>r.json()),
    fetch(_SB+'/rest/v1/key_items?select=*&limit=2000', {headers:_HDR}).then(r=>r.json()).catch(()=>[]),
    fetch(_SB+'/rest/v1/vendo_installs?select=*&order=created_at.desc&limit=800', {headers:_HDR}).then(r=>r.json()).catch(()=>[])
  ]).then(([logs, changes, items, installs])=>{
    _kvoLogs = Array.isArray(logs)?logs:[];
    _kvoChanges = Array.isArray(changes)?changes:[];
    _kvoItems = Array.isArray(items)?items:[];
    _kvoInstalls = Array.isArray(installs)?installs:[];
    kvoRender();
  }).catch(e=>{ if(list) list.innerHTML = '<div style="padding:20px;color:#DF1A35;">Load error: '+klEsc(e.message)+'</div>'; });
}

function kvoItemLbl(logId){
  const its = _kvoItems.filter(x=>x.key_log_id===logId);
  if(!its.length) return '';
  return its.map(it=>{
    const k = it.key_kind==='board' ? '🔌 Board' : ('🪙 Coins ('+(KI_VAR[it.coin_variant]||it.coin_variant||'?')+')');
    return it.vendo_name+' — '+k+' '+(it.returned?'✅':'🔴');
  }).join(' · ');
}

function kvoRender(){
  const list = document.getElementById('kvo-list');
  const lbl  = document.getElementById('kvo-lbl');
  if(!list) return;
  const day  = (document.getElementById('kvo-date')||{}).value || '';
  const type = (document.getElementById('kvo-type')||{}).value || 'all';
  const q    = ((document.getElementById('kvo-q')||{}).value||'').toLowerCase().trim();

  const KT_LBL = { coin_original:'🪙 Coin Key — Original', coin_duplicate:'🪙 Coin Key — Duplicate', board:'🔌 Board Key' };

  // normalize into one event list
  let evs = [];
  _kvoLogs.forEach(r=>{
    const isLM = (r.record_type==='lineman');
    evs.push({
      kind: isLM ? 'lineman' : 'borrow',
      date: r.key_date || (r.taken_at||'').slice(0,10),
      ts:   r.taken_at || '',
      title: r.collector_name || '—',
      sub:  isLM ? (kvoItemLbl(r.id) || ('📶 '+(r.wifi_key||'—')))+(r.lineman_reason?(' · 💬 '+r.lineman_reason):'')
                 : ('📍 '+(r.area||'—')+' · 🔑 '+(r.keys_taken||0)+(r.notes?(' · 📝 '+r.notes):'')),
      badge: r.returned ? {t:'✅ Returned',c:'#028867'} : {t:'🔴 OUT',c:'#DF1A35'},
      blob: ((r.collector_name||'')+' '+(r.area||'')+' '+(r.notes||'')+' '+(r.lineman||'')+' '+(r.wifi_key||'')+' '+(r.lineman_reason||'')+' '+kvoItemLbl(r.id)).toLowerCase()
    });
  });
  _kvoInstalls.forEach(r=>{
    evs.push({
      kind: 'install',
      date: r.install_date || (r.created_at||'').slice(0,10),
      ts:   r.created_at || '',
      title: r.vendo_name || '—',
      sub:  viKeysLbl(r)+' · 👷 '+(r.installed_by||'—')+(r.area?(' · 📍 '+r.area):'')+(r.notes?(' · 📝 '+r.notes):''),
      badge: r.given_to_office ? {t:'✅ Given'+(r.received_by?(' · '+r.received_by):''),c:'#028867'} : {t:'🔴 NOT GIVEN',c:'#DF1A35'},
      blob: ((r.vendo_name||'')+' '+(r.installed_by||'')+' '+(r.area||'')+' '+(r.notes||'')+' '+(r.received_by||'')+' '+viKeysLbl(r)).toLowerCase()
    });
  });
  _kvoChanges.forEach(r=>{
    evs.push({
      kind: 'change',
      date: r.change_date || (r.created_at||'').slice(0,10),
      ts:   r.created_at || '',
      title: r.vendo_name || '—',
      sub:  (KT_LBL[r.key_type]||r.key_type)+' · 👷 '+(r.changed_by||'—')+(r.area?(' · 📍 '+r.area):'')+(r.notes?(' · 📝 '+r.notes):''),
      badge: r.remitted ? {t:'✅ Remitted'+(r.remitted_by?(' · '+r.remitted_by):''),c:'#028867'} : {t:'🔴 NOT REMITTED',c:'#DF1A35'},
      blob: ((r.vendo_name||'')+' '+(r.changed_by||'')+' '+(r.area||'')+' '+(r.notes||'')+' '+(KT_LBL[r.key_type]||'')+' '+(r.remitted_by||'')).toLowerCase()
    });
  });

  if(day)  evs = evs.filter(e=>e.date===day);
  if(type!=='all') evs = evs.filter(e=>e.kind===type);
  if(q)    evs = evs.filter(e=>e.blob.includes(q));
  evs.sort((a,b)=> (b.date||'').localeCompare(a.date||'') || (b.ts||'').localeCompare(a.ts||''));

  if(lbl) lbl.textContent = evs.length+' record(s)'+(day?(' on '+day):'')+(q?(' matching "'+q+'"'):'');
  if(!evs.length){ list.innerHTML='<div style="padding:20px;text-align:center;color:#6b7280;">No records found.</div>'; return; }

  // group per day
  const KIND_ICON = { borrow:'🔑', lineman:'🛠️', change:'🔁', install:'📦' };
  let html = '', curDay = null;
  evs.forEach(e=>{
    if(e.date!==curDay){
      curDay = e.date;
      const d = curDay ? new Date(curDay+'T00:00:00') : null;
      const dLbl = d && !isNaN(d) ? d.toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric',year:'numeric'}) : (curDay||'No date');
      html += '<div style="font-size:12px;font-weight:800;color:#311A8E;margin:14px 0 8px;padding-bottom:4px;border-bottom:2px solid #e5e7eb;">📅 '+klEsc(dLbl)+'</div>';
    }
    html += '<div style="background:#fff;border:1.5px solid #e5e7eb;border-left:4px solid '+e.badge.c+';border-radius:9px;padding:10px 13px;margin-bottom:7px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'
      +   '<div style="font-size:13px;font-weight:800;color:#311A8E;">'+KIND_ICON[e.kind]+' '+klEsc(e.title)+'</div>'
      +   '<span style="background:'+e.badge.c+';color:#fff;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:800;white-space:nowrap;">'+klEsc(e.badge.t)+'</span>'
      + '</div>'
      + '<div style="font-size:12px;color:#374151;margin-top:3px;">'+klEsc(e.sub)+'</div>'
      + '</div>';
  });
  list.innerHTML = html;
}

/* ── PADLOCK / KEY CHANGES (who last changed the key + remit checker) ── */
let _kcRows = [], _kcPicked = null, _kcVT = null;

const KC_TYPE_LBL = { coin_original:'🪙 Coin — Original', coin_duplicate:'🪙 Coin — Duplicate', board:'🔌 Board Key' };
const KC_TYPE_CLR = { coin_original:'#FFB725', coin_duplicate:'#C01176', board:'#025AC6' };

function kcLoad(){
  const list = document.getElementById('kc-list');
  if(list) list.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;">Loading…</div>';
  // default date today
  const dEl = document.getElementById('kc-date');
  if(dEl && !dEl.value){ const n=new Date(); dEl.value = n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'); }
  // datalist of collectors + technicians
  kcEnsureNames();
  fetch(_SB+'/rest/v1/key_changes?select=*&order=created_at.desc&limit=500', {headers:_HDR})
    .then(r=>r.json())
    .then(rows=>{ _kcRows = Array.isArray(rows)?rows:[]; kcRender(); })
    .catch(e=>{ if(list) list.innerHTML = '<div style="padding:20px;color:#DF1A35;">Load error: '+klEsc(e.message)+'</div>'; });
}

function kcVendoInput(){
  clearTimeout(_kcVT);
  const q = (document.getElementById('kc-vq')||{}).value.trim();
  const box = document.getElementById('kc-vres');
  if(!box) return;
  if(q.length<2){ box.style.display='none'; box.innerHTML=''; return; }
  _kcVT = setTimeout(()=>{
    const enc = encodeURIComponent('*'+q+'*');
    fetch(_SB+'/rest/v1/vendos?select=id,sheet_name,tg_name,owner_name,area&or=(sheet_name.ilike.'+enc+',tg_name.ilike.'+enc+',owner_name.ilike.'+enc+')&limit=12', {headers:_HDR})
      .then(r=>r.json())
      .then(rows=>{
        if(!Array.isArray(rows) || !rows.length){ box.innerHTML='<div style="padding:10px 12px;font-size:12px;color:#6b7280;">No vendo found.</div>'; box.style.display='block'; return; }
        box.innerHTML = rows.map(v=>{
          const nm = v.sheet_name || v.tg_name || v.owner_name || ('#'+v.id);
          return '<div onclick=\'kcPickVendo('+JSON.stringify(v.id)+','+JSON.stringify(nm)+','+JSON.stringify(v.area||'')+')\' '
            + 'style="padding:9px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:12px;" '
            + 'onmouseover="this.style.background=\'#f0f7ff\'" onmouseout="this.style.background=\'#fff\'">'
            + '<b style="color:#311A8E;">'+klEsc(nm)+'</b>'
            + (v.tg_name && v.tg_name!==nm ? ' <span style="color:#6b7280;">('+klEsc(v.tg_name)+')</span>':'')
            + (v.area?' · <span style="color:#025AC6;font-weight:700;">'+klEsc(v.area)+'</span>':'')
            + '</div>';
        }).join('');
        box.style.display='block';
      })
      .catch(()=>{ box.style.display='none'; });
  }, 300);
}

function kcPickVendo(id, name, area){
  _kcPicked = {id:id, name:name, area:area||null};
  const box = document.getElementById('kc-vres'); if(box){ box.style.display='none'; box.innerHTML=''; }
  const vq = document.getElementById('kc-vq'); if(vq) vq.value = name;
  const p = document.getElementById('kc-picked');
  if(p){ p.style.display='block'; p.textContent = '✓ '+name+(area?(' · '+area):''); }
}

function kcAdd(){
  if(!_kcPicked){ alert('Search and pick a vendo first'); return; }
  const type  = (document.getElementById('kc-type')||{}).value;
  const by    = ((document.getElementById('kc-by')||{}).value||'').trim();
  const kdate = (document.getElementById('kc-date')||{}).value || null;
  const notes = ((document.getElementById('kc-notes')||{}).value||'').trim();
  if(!by){ alert('Who changed it? Enter a name'); return; }
  const body = { vendo_id:_kcPicked.id, vendo_name:_kcPicked.name, area:_kcPicked.area, key_type:type, changed_by:by, change_date:kdate, notes:notes||null, remitted:false, source:'dashboard' };
  fetch(_SB+'/rest/v1/key_changes', {method:'POST', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(body)})
    .then(r=>{
      if(!r.ok){ return r.text().then(t=>{throw new Error(t);}); }
      _kcPicked = null;
      const vq=document.getElementById('kc-vq'); if(vq) vq.value='';
      const p=document.getElementById('kc-picked'); if(p) p.style.display='none';
      const by2=document.getElementById('kc-by'); if(by2) by2.value='';
      const nt=document.getElementById('kc-notes'); if(nt) nt.value='';
      if(typeof toast==='function') toast('✓ Key change logged');
      kcLoad();
    })
    .catch(e=>alert('Save failed: '+e.message));
}

function kcRender(){
  const list = document.getElementById('kc-list');
  const lbl  = document.getElementById('kc-lbl');
  if(!list) return;
  const filt = (document.getElementById('kc-filter')||{}).value || 'pending';
  const q = ((document.getElementById('kc-q')||{}).value||'').toLowerCase().trim();
  let rows = _kcRows.slice();
  if(filt==='pending')       rows = rows.filter(r=>!r.remitted);
  else if(filt==='remitted') rows = rows.filter(r=>r.remitted);
  else if(filt==='coin_original'||filt==='coin_duplicate'||filt==='board') rows = rows.filter(r=>r.key_type===filt);
  if(q) rows = rows.filter(r=>((r.vendo_name||'')+' '+(r.changed_by||'')+' '+(r.area||'')+' '+(r.notes||'')+' '+(r.remitted_by||'')).toLowerCase().includes(q));

  const pend = _kcRows.filter(r=>!r.remitted).length;
  if(lbl) lbl.textContent = rows.length+' record(s) shown · '+pend+' not yet remitted to office';
  if(!rows.length){ list.innerHTML='<div style="padding:20px;text-align:center;color:#6b7280;">No records.</div>'; return; }

  // mark latest change per vendo+type = who changed it last
  const latest = {};
  _kcRows.forEach(r=>{
    const k = (r.vendo_id||r.vendo_name)+'|'+r.key_type;
    if(!latest[k] || (r.created_at||'')>(latest[k].created_at||'')) latest[k]=r;
  });

  list.innerHTML = rows.map(r=>{
    const bd = r.remitted ? '#028867' : '#DF1A35';
    const isLatest = latest[(r.vendo_id||r.vendo_name)+'|'+r.key_type] && latest[(r.vendo_id||r.vendo_name)+'|'+r.key_type].id===r.id;
    const tClr = KC_TYPE_CLR[r.key_type]||'#6b7280';
    const badge = r.remitted
      ? '<span style="background:#028867;color:#fff;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:800;">✅ REMITTED</span>'
      : '<span style="background:#DF1A35;color:#fff;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:800;">🔴 NOT REMITTED</span>';
    const actions = r.remitted
      ? '<button onclick="event.stopPropagation();kcUndoRemit('+r.id+')" style="padding:6px 10px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">↩ Undo</button>'
      : '<button onclick="event.stopPropagation();kcRemit('+r.id+')" style="padding:6px 12px;background:#028867;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;">✓ Remit sa Office</button>';
    return '<div style="background:#fff;border:1.5px solid #e5e7eb;border-left:4px solid '+bd+';border-radius:9px;padding:11px 13px;margin-bottom:8px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'
      +   '<div style="font-size:14px;font-weight:800;color:#311A8E;">'+klEsc(r.vendo_name)+(isLatest?' <span style="font-size:9px;background:#311A8E;color:#fff;padding:1px 6px;border-radius:5px;vertical-align:middle;">LAST</span>':'')+'</div>'
      +   badge
      + '</div>'
      + '<div style="font-size:12px;margin-top:4px;"><span style="background:'+tClr+'22;color:'+tClr+';border:1px solid '+tClr+';padding:1px 7px;border-radius:6px;font-weight:800;font-size:10px;">'+(KC_TYPE_LBL[r.key_type]||klEsc(r.key_type))+'</span>'
      +   ' <span style="color:#374151;">👷 '+klEsc(r.changed_by||'—')+' · 📅 '+klEsc(r.change_date||'—')+(r.area?(' · 📍 '+klEsc(r.area)):'')+'</span></div>'
      + (r.notes?'<div style="font-size:11px;color:#C01176;margin-top:2px;">📝 '+klEsc(r.notes)+'</div>':'')
      + (r.remitted?'<div style="font-size:11px;color:#028867;margin-top:2px;">🏢 Remitted'+(r.remitted_by?(' to '+klEsc(r.remitted_by)):'')+(r.remitted_at?(' · '+_fmt(r.remitted_at)):'')+'</div>':'')
      + '<div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;">'
      +   actions
      +   '<button onclick="event.stopPropagation();kcDelete('+r.id+')" style="padding:6px 9px;background:#fff;color:#DF1A35;border:1.5px solid #fca5a5;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">🗑</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

function kcRemit(id){
  const rec = _kcRows.find(r=>r.id===id) || {};
  const old = document.getElementById('kc-remit-modal'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'kc-remit-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:18px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;font-family:inherit;">'
    + '<div style="background:linear-gradient(135deg,#028867,#025AC6);padding:20px 22px;color:#fff;">'
    +   '<div style="font-size:19px;font-weight:800;">🏢 Remit Key to Office</div>'
    +   '<div style="font-size:12px;opacity:.9;margin-top:3px;">'+klEsc(rec.vendo_name||'')+' · '+(KC_TYPE_LBL[rec.key_type]||'')+'</div>'
    + '</div>'
    + '<div style="padding:20px 22px;">'
    +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Received by (office staff)</label>'
    +   '<input id="kc-rm-by" placeholder="e.g. Joi" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:14px;outline:none;">'
    +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">🔒 Password</label>'
    +   '<input id="kc-rm-pw" type="password" inputmode="numeric" placeholder="Enter password to confirm" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;" onkeydown="if(event.key===\'Enter\')kcConfirmRemit('+id+')">'
    +   '<div id="kc-rm-err" style="color:#DF1A35;font-size:12px;font-weight:700;margin-top:8px;display:none;">❌ Wrong password.</div>'
    +   '<div style="display:flex;gap:8px;margin-top:20px;">'
    +     '<button onclick="kcCloseRemit()" style="flex:1;padding:11px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Cancel</button>'
    +     '<button onclick="kcConfirmRemit('+id+')" style="flex:2;padding:11px;background:#028867;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;">✓ Confirm Remit</button>'
    +   '</div>'
    + '</div>'
    + '</div>';
  ov.addEventListener('click', e=>{ if(e.target===ov) kcCloseRemit(); });
  document.body.appendChild(ov);
  setTimeout(()=>{ const p=document.getElementById('kc-rm-by'); if(p) p.focus(); }, 60);
}

function kcCloseRemit(){ const ov=document.getElementById('kc-remit-modal'); if(ov) ov.remove(); }

function kcConfirmRemit(id){
  const pw = (document.getElementById('kc-rm-pw')||{}).value || '';
  const err = document.getElementById('kc-rm-err');
  if(pw !== KL_RETURN_PW){ if(err) err.style.display='block'; const p=document.getElementById('kc-rm-pw'); if(p){p.value='';p.focus();} return; }
  const by = ((document.getElementById('kc-rm-by')||{}).value||'').trim();
  const body = { remitted:true, remitted_at:new Date().toISOString(), remitted_by:by||null };
  fetch(_SB+'/rest/v1/key_changes?id=eq.'+id, {method:'PATCH', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(body)})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} kcCloseRemit(); kcLoad(); })
    .catch(e=>alert('Update failed: '+e.message));
}

function kcUndoRemit(id){
  if(!confirm('Mark this key as NOT yet remitted again?')) return;
  const body = { remitted:false, remitted_at:null, remitted_by:null };
  fetch(_SB+'/rest/v1/key_changes?id=eq.'+id, {method:'PATCH', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(body)})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} kcLoad(); })
    .catch(e=>alert('Update failed: '+e.message));
}

function kcDelete(id){
  const r = _kcRows.find(x=>x.id===id);
  if(r && r.remitted){
    alert('🔒 This record cannot be deleted.\n\n'
      + r.vendo_name+' — '+(KC_TYPE_LBL[r.key_type]||r.key_type)+'\n'
      + 'Already remitted to office'+(r.remitted_by?(' to '+r.remitted_by):'')+(r.remitted_at?(' · '+_fmt(r.remitted_at)):'')+'.\n\n'
      + 'Deleting would lose the remit history. Undo the remit first if you are sure.');
    return;
  }
  if(!confirm('Delete this key-change record permanently?')) return;
  fetch(_SB+'/rest/v1/key_changes?id=eq.'+id, {method:'DELETE', headers:_HDR})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} kcLoad(); })
    .catch(e=>alert('Delete failed: '+e.message));
}


/* per-key checker boxes under a lineman record */
function klItemBoxes(logId){
  const items = _klItems.filter(x=>x.key_log_id===logId);
  if(!items.length) return '';
  return '<div style="margin-top:7px;border-top:1px dashed #e5e7eb;padding-top:7px;" onclick="event.stopPropagation()">'
    + items.map(it=>{
        const c = it.returned ? '#028867' : '#DF1A35';
        return '<label style="display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:'+c+';cursor:pointer;padding:3px 0;">'
          + '<input type="checkbox" '+(it.returned?'checked':'')+' onclick="event.stopPropagation();kiToggle('+it.id+',this.checked)" style="width:15px;height:15px;cursor:pointer;">'
          + klEsc(it.vendo_name)+' — '+KI_LBL(it)+' '+(it.returned?'✅':'🔴')
          + '</label>';
      }).join('')
    + '</div>';
}

/* shared collector+technician datalist loader */
function kcEnsureNames(){
  const dl = document.getElementById('kc-by-list');
  if(!dl || dl.children.length) return;
  Promise.all([
    fetch(_SB+'/rest/v1/collectors?select=name&active=eq.true&order=name.asc', {headers:_HDR}).then(r=>r.json()).catch(()=>[]),
    fetch(_SB+'/rest/v1/technicians?select=name&active=eq.true&order=name.asc', {headers:_HDR}).then(r=>r.json()).catch(()=>[])
  ]).then(([cs,ts])=>{
    const names = new Set();
    (Array.isArray(cs)?cs:[]).forEach(c=>names.add(c.name));
    (Array.isArray(ts)?ts:[]).forEach(t=>names.add(t.name));
    dl.innerHTML = Array.from(names).sort().map(n=>'<option value="'+klEsc(n)+'">').join('');
  });
}

/* ══ NEW VENDO INSTALLS ══ */
let _viRows = [], _viPicked = null, _viVT = null, _viTgVT = null, _viTg = null, _viNoTg = false, _viGroups = [];

function viLoad(){
  const list = document.getElementById('vi-list');
  if(list) list.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;">Loading…</div>';
  const dEl = document.getElementById('vi-date');
  if(dEl && !dEl.value){ const n=new Date(); dEl.value = n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'); }
  kcEnsureNames();
  ['vi-k-co','vi-k-cd','vi-k-bd'].forEach(id=>{ const e=document.getElementById(id); if(e && !e._wired){ e.addEventListener('change', viCompile); e._wired=true; } });
  if(!_viGroups.length){
    fetch(_SB+'/rest/v1/harvest_groups?select=id,area,group_label,group_id,collector,team,barangays,total_vendos,status&status=eq.active&order=area.asc,group_id.asc', {headers:_HDR})
      .then(r=>r.json()).then(gs=>{ _viGroups = Array.isArray(gs)?gs:[]; viAreaChanged(); }).catch(()=>{});
  }
  viSrvLoadList();
  fetch(_SB+'/rest/v1/vendo_installs?select=*&order=created_at.desc&limit=500', {headers:_HDR})
    .then(r=>r.json())
    .then(rows=>{ _viRows = Array.isArray(rows)?rows:[]; viRender(); })
    .catch(e=>{ if(list) list.innerHTML = '<div style="padding:20px;color:#DF1A35;">Load error: '+klEsc(e.message)+'</div>'; });
}

function viVendoInput(){
  clearTimeout(_viVT);
  const q = (document.getElementById('vi-vq')||{}).value.trim();
  const box = document.getElementById('vi-vres');
  if(!box) return;
  // free-typed name counts as picked (new vendo may not exist in `vendos` yet)
  _viPicked = q ? {id:null, name:q, area:null, typed:true} : null;
  const p = document.getElementById('vi-picked');
  if(p){
    if(q){ p.style.display='block'; p.innerHTML='✏️ <b>'+klEsc(q)+'</b> · <span style="color:#C01176;">new (not yet in vendos)</span>'; }
    else { p.style.display='none'; }
  }
  viCompile();
  if(q.length<2){ box.style.display='none'; box.innerHTML=''; return; }
  _viVT = setTimeout(()=>{
    const enc = encodeURIComponent('*'+q+'*');
    fetch(_SB+'/rest/v1/vendos?select=id,sheet_name,tg_name,owner_name,area,vlan,server_name&or=(sheet_name.ilike.'+enc+',tg_name.ilike.'+enc+',owner_name.ilike.'+enc+')&limit=12', {headers:_HDR})
      .then(r=>r.json())
      .then(rows=>{
        if(!Array.isArray(rows) || !rows.length){ box.innerHTML='<div style="padding:10px 12px;font-size:12px;color:#028867;font-weight:700;">✏️ New vendo — just type the name, it will still save.</div>'; box.style.display='block'; return; }
        box.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:#6b7280;background:#fafafa;border-bottom:1px solid #f1f5f9;">Click to link an existing vendo, or just type for a new one:</div>'
          + rows.map(v=>{
          const nm = v.sheet_name || v.tg_name || v.owner_name || ('#'+v.id);
          const sub = [];
          if(v.tg_name && v.tg_name!==nm) sub.push('📶 '+klEsc(v.tg_name));
          if(v.vlan) sub.push('VLAN '+v.vlan);
          if(v.server_name) sub.push('🖥️ '+klEsc(v.server_name));
          return '<div onclick=\'viPickVendo('+JSON.stringify(v.id)+','+JSON.stringify(nm)+','+JSON.stringify(v.area||'')+')\' '
            + 'style="padding:9px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:12px;" '
            + 'onmouseover="this.style.background=\'#f0fdf9\'" onmouseout="this.style.background=\'#fff\'">'
            + '<b style="color:#311A8E;">'+klEsc(nm)+'</b>'
            + (v.area?' · <span style="color:#028867;font-weight:700;">'+klEsc(v.area)+'</span>':'')
            + (sub.length?'<div style="font-size:10px;color:#6b7280;margin-top:2px;">'+sub.join(' · ')+'</div>':'')
            + '</div>';
        }).join('');
        box.style.display='block';
      })
      .catch(()=>{ box.style.display='none'; });
  }, 300);
}

function viPickVendo(id, name, area){
  _viPicked = {id:id, name:name, area:area||null, typed:false};
  const box = document.getElementById('vi-vres'); if(box){ box.style.display='none'; box.innerHTML=''; }
  const vq = document.getElementById('vi-vq'); if(vq) vq.value = name;
  const p = document.getElementById('vi-picked');
  if(p){ p.style.display='block'; p.innerHTML='✓ <b>'+klEsc(name)+'</b>'+(area?(' · '+klEsc(area)):'')+' <span style="color:#6b7280;font-weight:600;">(linked)</span>'; }
  viCompile();
}

function viCompile(){
  const pv = document.getElementById('vi-preview');
  if(!pv) return;
  if(!_viPicked){ pv.style.display='none'; return; }
  const parts = [];
  if((document.getElementById('vi-k-co')||{}).checked) parts.push('Coins (Not Duplicate)');
  if((document.getElementById('vi-k-cd')||{}).checked) parts.push('Coins (Duplicate)');
  if((document.getElementById('vi-k-bd')||{}).checked) parts.push('Board');
  const area = (document.getElementById('vi-area')||{}).value || '';
  const vlan = (document.getElementById('vi-vlan')||{}).value || '';
  const gsel = document.getElementById('vi-group');
  const glbl = gsel && gsel.value ? gsel.options[gsel.selectedIndex].text : '';
  const bits = [];
  if(area) bits.push('📍 '+area);
  if(vlan) bits.push('VLAN '+vlan);
  if(glbl) bits.push('👥 '+glbl);
  if(_viNoTg) bits.push('🚫 no TG (sheet name)');
  else if(_viTg) bits.push('📶 '+_viTg);
  if(_viSrv) bits.push('🖥️ '+_viSrv);
  const _ad = (((document.getElementById('vi-addr')||{}).value)||'').trim();
  if(_ad) bits.push('🏠 '+_ad);
  if(_viGps) bits.push('📍 '+_viGps.lat+', '+_viGps.lng);
  if(_viPhotoFile) bits.push('📷 photo');
  pv.style.display='block';
  pv.textContent = '📝 Compiled: '+_viPicked.name+' — '+(parts.length?parts.join(', '):'⚠️ no key checked')
    + (bits.length ? '\n🆕 ' + bits.join(' · ') : '');
}

let _viBusy = false;

async function viAdd(){
  if(_viBusy) return;                       // guard against double-click double-insert
  const btn = document.getElementById('vi-add-btn');
  const typedName = ((document.getElementById('vi-vq')||{}).value||'').trim();
  if(!_viPicked && !typedName){ viModal({ok:false, title:'Missing vendo name', lead:'Type or pick the vendo name first.'}); return; }
  if(!_viPicked) _viPicked = {id:null, name:typedName, area:null, typed:true};

  const co = (document.getElementById('vi-k-co')||{}).checked;
  const cd = (document.getElementById('vi-k-cd')||{}).checked;
  const bd = (document.getElementById('vi-k-bd')||{}).checked;
  if(!co && !cd && !bd){ viModal({ok:false, title:'No keys checked', lead:'Check at least one key that was received.'}); return; }
  const by = ((document.getElementById('vi-by')||{}).value||'').trim();
  if(!by){ viModal({ok:false, title:'Missing installer', lead:'Enter who installed this vendo.'}); return; }

  const area  = (document.getElementById('vi-area')||{}).value || '';
  const vlanS = ((document.getElementById('vi-vlan')||{}).value||'').trim();
  const vlan  = vlanS ? parseInt(vlanS,10) : null;
  const gsel  = document.getElementById('vi-group');
  const gid   = gsel && gsel.value ? parseInt(gsel.value,10) : null;
  const idate = (document.getElementById('vi-date')||{}).value || null;
  const notes = ((document.getElementById('vi-notes')||{}).value||'').trim() || null;
  const isNew = !_viPicked.id;

  _viBusy = true;
  if(btn){ btn.disabled = true; btn.style.opacity = '.6'; btn.textContent = '⏳ Saving…'; }
  try{
    // 1) validate BEFORE writing anything
    if(isNew){
      const chk = await fetch(_SB+'/rest/v1/rpc/spawn_check_new_vendo', {
        method:'POST', headers:_HDR,
        body: JSON.stringify({ p_sheet_name:_viPicked.name, p_area:area,
                               p_tg_name:_viNoTg?null:_viTg, p_no_tg:!!_viNoTg, p_vlan:vlan })
      }).then(r=>r.json());
      if(chk && chk.ok === false){ viProblems(chk.errors||[]); return; }
    }

    // 2) install + vendo in ONE transaction — both or neither
    const res = await fetch(_SB+'/rest/v1/rpc/spawn_log_install_and_create_vendo', {
      method:'POST', headers:_HDR,
      body: JSON.stringify({
        p_sheet_name:_viPicked.name, p_area: area || _viPicked.area || '',
        p_tg_name: _viNoTg ? null : _viTg, p_no_tg: !!_viNoTg,
        p_vlan: vlan, p_group_id: gid,
        p_installed_by: by, p_install_date: idate,
        p_key_coin_original: co, p_key_coin_duplicate: cd, p_key_board: bd,
        p_notes: notes, p_existing_vendo_id: _viPicked.id,
        p_server_name: _viSrv || null,
        p_address: (((document.getElementById('vi-addr')||{}).value)||'').trim() || null
      })
    }).then(async r=>{ const t = await r.text(); if(!r.ok) throw new Error(t); return JSON.parse(t); });

    const keys = [];
    if(co) keys.push('🪙 Coins (Not Duplicate)');
    if(cd) keys.push('🪙 Coins (Duplicate)');
    if(bd) keys.push('🔌 Board');
    const gLbl = gsel && gsel.value ? gsel.options[gsel.selectedIndex].text : null;

    // GPS + photo are best-effort: the vendo already exists, so never fail the whole save
    let extraNote = '';
    const vid = res.vendo_id;
    if(_viGps && vid){
      try{
        const gpsBody = { lat:_viGps.lat, lng:_viGps.lng,
                          gps:_viGps.lat+', '+_viGps.lng,
                          gps_updated_at:new Date().toISOString() };
        const gr = await fetch(_SB+'/rest/v1/vendos?id=eq.'+vid, {method:'PATCH',
          headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(gpsBody)});
        if(!gr.ok) throw new Error(await gr.text());
        // the collector PWA reads lat/lng from harvest_group_items — keep both in sync
        await fetch(_SB+'/rest/v1/harvest_group_items?vendo_id=eq.'+vid, {method:'PATCH',
          headers:Object.assign({'Prefer':'return=minimal'},_HDR),
          body:JSON.stringify({lat:_viGps.lat, lng:_viGps.lng})}).catch(()=>{});
      }catch(err){ extraNote += '<br><br>⚠️ GPS not saved: '+klEsc(String(err.message||err)); }
    }
    let photoUrl = null;
    if(_viPhotoFile && vid){
      try{
        photoUrl = await viUploadPhoto(vid);
        if(photoUrl){
          const pr = await fetch(_SB+'/rest/v1/vendos?id=eq.'+vid, {method:'PATCH',
            headers:Object.assign({'Prefer':'return=minimal'},_HDR),
            body:JSON.stringify({photo_url:photoUrl})});
          if(!pr.ok) throw new Error(await pr.text());
        }
      }catch(err){ photoUrl = null; extraNote += '<br><br>⚠️ Photo not saved: '+klEsc(String(err.message||err)); }
    }
    const savedGps = _viGps;

    viResetForm();
    if(res.vendo_created){
      viModal({
        ok:true, title:'Vendo created', btn:'Done',
        lead:'The install was logged and the vendo now exists in the system.',
        rows:[
          ['Code',    res.vendo_code ? '<span style="background:#311A8E;color:#fff;padding:2px 9px;border-radius:6px;font-weight:800;letter-spacing:.5px;">'+klEsc(res.vendo_code)+'</span>' : '<span style="color:#9ca3af;">—</span>'],
          ['Vendo',   klEsc(res.sheet_name||'')+' <span style="color:#6b7280;font-weight:600;">#'+res.vendo_id+'</span>'],
          ['Area',    klEsc(res.area||'—')],
          ['VLAN',    vlan ? String(vlan) : '<span style="color:#9ca3af;">—</span>'],
          ['TG name', _viNoTg ? '<span style="color:#C01176;">🚫 none — using sheet name</span>' : klEsc(res.tg_name||'—')],
          ['Server',  res.server_name ? klEsc(res.server_name) : '<span style="color:#9ca3af;">—</span>'],
          ['Address',  res.address ? klEsc(res.address) : '<span style="color:#9ca3af;">—</span>'],
          ['Group',   gLbl ? klEsc(gLbl) : '<span style="color:#9ca3af;">—</span>'],
          ['GPS',     savedGps ? ('📍 '+savedGps.lat+', '+savedGps.lng) : '<span style="color:#9ca3af;">—</span>'],
          ['Photo',   photoUrl ? '<img src="'+photoUrl+'" style="width:100%;max-height:110px;object-fit:cover;border-radius:6px;">' : '<span style="color:#9ca3af;">—</span>'],
          ['Keys',    keys.join('<br>')]
        ],
        note: '✅ Live now in <b>Vendos</b>, <b>Spawn Harvest</b> (collector route), <b>Vendo Map</b>'
              + (savedGps ? ' with its GPS pin' : '') + ' and <b>Recon</b>. Caches rebuilt.'
              + (_viNoTg ? '<br><br>⚠️ No TG name yet — link it in <b>dicayas.html</b> when ready.' : '')
              + extraNote
      });
      // rebuild BOTH caches so the new vendo shows up everywhere immediately:
      //   write-vendo-cache  -> vendos.json       (collector PWA; cron only runs 21:00 daily)
      //   write-vendos-cache -> vendos_table.json (dashboard Vendos tab; cron hourly at :30)
      // Routed via the gateway: those functions are secret-auth'd and send no CORS headers.
      try{
        await fetch(_SB+'/functions/v1/spawn-gw-admin', {
          method:'POST',
          headers:{'Content-Type':'application/json','x-gw-token': window.__ADMIN_GW_TOKEN||''},
          body: JSON.stringify({ kind:'cache', fns:['write-vendo-cache','write-vendos-cache'] })
        });
      }catch(_){ /* cache refresh is best-effort; cron will catch up */ }
    } else {
      viModal({ ok:true, title:'Install logged', btn:'Done',
        lead:'Logged against the existing vendo — no new vendo was created.',
        rows:[['Vendo', klEsc(res.sheet_name||'')], ['Keys', keys.join('<br>')]] });
    }
    viLoad();
  }catch(e){
    let msg = String(e.message||e);
    try{ const j = JSON.parse(msg); msg = j.message || j.details || msg; }catch(_){}
    viModal({ ok:false, title:'Save failed', lead:'Nothing was saved — you can fix this and try again.',
              note: klEsc(msg) });
  }finally{
    _viBusy = false;
    if(btn){ btn.disabled = false; btn.style.opacity = '1'; btn.textContent = '✓ Log Install'; }
  }
}

function viResetForm(){
  _viPicked = null; _viTg = null; _viGps = null; _viPhotoFile = null; _viSrv = null; _viRt = null;
  viSetNoTg(false);
  ['vi-vq','vi-by','vi-notes','vi-vlan','vi-tgq','vi-gps','vi-photo','vi-srvq','vi-rtq','vi-addr'].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
  const as=document.getElementById('vi-addr-state'); if(as){ as.style.color='#9ca3af'; as.textContent='Optional — shown to collectors on the route.'; }
  const rs=document.getElementById('vi-rt-state'); if(rs){ rs.style.color='#9ca3af'; rs.textContent='Linking a router auto-fills VLAN + server.'; }
  const ss=document.getElementById('vi-srv-state'); if(ss){ ss.style.color='#9ca3af'; ss.textContent='Optional — which MikroTik server this vendo sits on.'; }
  const pp=document.getElementById('vi-photo-prev'); if(pp){ pp.style.display='none'; pp.src=''; }
  const ps=document.getElementById('vi-photo-state'); if(ps){ ps.style.color='#9ca3af'; ps.textContent='Optional — uploaded after the vendo is created.'; }
  const gs=document.getElementById('vi-gps-state'); if(gs){ gs.style.color='#9ca3af'; gs.textContent='Paste coordinates — only real camera/Maps values, never estimated.'; }
  ['vi-k-co','vi-k-cd','vi-k-bd'].forEach(id=>{ const e=document.getElementById(id); if(e) e.checked=false; });
  const a=document.getElementById('vi-area'); if(a) a.value='';
  viAreaChanged();
  const p=document.getElementById('vi-picked'); if(p) p.style.display='none';
  const pv=document.getElementById('vi-preview'); if(pv) pv.style.display='none';
}

function viKeysLbl(r){
  const p = [];
  if(r.key_coin_original)  p.push('🪙 Coins (Not Duplicate)');
  if(r.key_coin_duplicate) p.push('🪙 Coins (Duplicate)');
  if(r.key_board)          p.push('🔌 Board');
  return p.length ? p.join(', ') : '—';
}

function viRender(){
  const list = document.getElementById('vi-list');
  const lbl  = document.getElementById('vi-lbl');
  if(!list) return;
  const filt = (document.getElementById('vi-filter')||{}).value || 'pending';
  const q = ((document.getElementById('vi-q')||{}).value||'').toLowerCase().trim();
  let rows = _viRows.slice();
  if(filt==='pending')     rows = rows.filter(r=>!r.given_to_office);
  else if(filt==='given')  rows = rows.filter(r=>r.given_to_office);
  if(q) rows = rows.filter(r=>((r.vendo_name||'')+' '+(r.installed_by||'')+' '+(r.area||'')+' '+(r.notes||'')+' '+(r.received_by||'')).toLowerCase().includes(q));

  const pend = _viRows.filter(r=>!r.given_to_office).length;
  if(lbl) lbl.textContent = rows.length+' install(s) shown · '+pend+' not yet given to office';
  if(!rows.length){ list.innerHTML='<div style="padding:20px;text-align:center;color:#6b7280;">No installs.</div>'; return; }

  list.innerHTML = rows.map(r=>{
    const bd = r.given_to_office ? '#028867' : '#DF1A35';
    const badge = r.given_to_office
      ? '<span style="background:#028867;color:#fff;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:800;">✅ GIVEN</span>'
      : '<span style="background:#DF1A35;color:#fff;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:800;">🔴 NOT GIVEN</span>';
    const actions = r.given_to_office
      ? '<button onclick="viUndoGive('+r.id+')" style="padding:6px 10px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">↩ Undo</button>'
      : '<button onclick="viGive('+r.id+')" style="padding:6px 12px;background:#028867;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;">✓ Given to Office</button>';
    return '<div style="background:#fff;border:1.5px solid #e5e7eb;border-left:4px solid '+bd+';border-radius:9px;padding:11px 13px;margin-bottom:8px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'
      +   '<div style="font-size:14px;font-weight:800;color:#311A8E;">📦 '+klEsc(r.vendo_name)+'</div>'+badge
      + '</div>'
      + '<div style="font-size:12px;color:#374151;margin-top:4px;">'+viKeysLbl(r)+'</div>'
      + '<div style="font-size:11px;color:#6b7280;margin-top:3px;">👷 '+klEsc(r.installed_by||'—')+' · 📅 '+klEsc(r.install_date||'—')+(r.area?(' · 📍 '+klEsc(r.area)):'')+(r.vlan?(' · VLAN '+r.vlan):'')+'</div>'
      + (r.vendo_created
          ? '<div style="font-size:11px;color:#028867;margin-top:2px;font-weight:700;">🆕 Vendo created'+(r.vendo_id?(' #'+r.vendo_id):'')+(r.no_tg?' · <span style="color:#C01176;">🚫 no TG name — link in dicayas</span>':(r.tg_name?(' · 📶 '+klEsc(r.tg_name)):''))+'</div>'
          : '<div style="font-size:11px;color:#9ca3af;margin-top:2px;">Existing vendo (no new one created)</div>')
      + (r.notes?'<div style="font-size:11px;color:#C01176;margin-top:2px;">📝 '+klEsc(r.notes)+'</div>':'')
      + (r.given_to_office?'<div style="font-size:11px;color:#028867;margin-top:2px;">🏢 Given'+(r.received_by?(' to '+klEsc(r.received_by)):'')+(r.given_at?(' · '+_fmt(r.given_at)):'')+'</div>':'')
      + '<div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;">'+actions
      +   '<button onclick="viDelete('+r.id+')" style="padding:6px 9px;background:#fff;color:#DF1A35;border:1.5px solid #fca5a5;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">🗑</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

function viGive(id){
  const rec = _viRows.find(r=>r.id===id) || {};
  const old = document.getElementById('vi-give-modal'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'vi-give-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:18px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;font-family:inherit;">'
    + '<div style="background:linear-gradient(135deg,#028867,#025AC6);padding:20px 22px;color:#fff;">'
    +   '<div style="font-size:19px;font-weight:800;">🏢 Turnover to Office</div>'
    +   '<div style="font-size:12px;opacity:.9;margin-top:3px;">'+klEsc(rec.vendo_name||'')+' · '+viKeysLbl(rec)+'</div>'
    + '</div>'
    + '<div style="padding:20px 22px;">'
    +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Received by (office staff)</label>'
    +   '<input id="vi-g-by" placeholder="e.g. Joi" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:14px;outline:none;">'
    +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">🔒 Password</label>'
    +   '<input id="vi-g-pw" type="password" inputmode="numeric" placeholder="Enter password to confirm" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;" onkeydown="if(event.key===\'Enter\')viConfirmGive('+id+')">'
    +   '<div id="vi-g-err" style="color:#DF1A35;font-size:12px;font-weight:700;margin-top:8px;display:none;">❌ Wrong password.</div>'
    +   '<div style="display:flex;gap:8px;margin-top:20px;">'
    +     '<button onclick="viCloseGive()" style="flex:1;padding:11px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Cancel</button>'
    +     '<button onclick="viConfirmGive('+id+')" style="flex:2;padding:11px;background:#028867;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;">✓ Confirm</button>'
    +   '</div>'
    + '</div>'
    + '</div>';
  ov.addEventListener('click', e=>{ if(e.target===ov) viCloseGive(); });
  document.body.appendChild(ov);
  setTimeout(()=>{ const p=document.getElementById('vi-g-by'); if(p) p.focus(); }, 60);
}

function viCloseGive(){ const ov=document.getElementById('vi-give-modal'); if(ov) ov.remove(); }

function viConfirmGive(id){
  const pw = (document.getElementById('vi-g-pw')||{}).value || '';
  const err = document.getElementById('vi-g-err');
  if(pw !== KL_RETURN_PW){ if(err) err.style.display='block'; const p=document.getElementById('vi-g-pw'); if(p){p.value='';p.focus();} return; }
  const by = ((document.getElementById('vi-g-by')||{}).value||'').trim();
  const body = { given_to_office:true, given_at:new Date().toISOString(), received_by:by||null };
  fetch(_SB+'/rest/v1/vendo_installs?id=eq.'+id, {method:'PATCH', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(body)})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} viCloseGive(); viLoad(); })
    .catch(e=>alert('Update failed: '+e.message));
}

function viUndoGive(id){
  if(!confirm('Mark as NOT yet given to office again?')) return;
  fetch(_SB+'/rest/v1/vendo_installs?id=eq.'+id, {method:'PATCH', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify({given_to_office:false, given_at:null, received_by:null})})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} viLoad(); })
    .catch(e=>alert('Update failed: '+e.message));
}

function viDelete(id){
  const r = _viRows.find(x=>x.id===id);
  if(r && r.given_to_office){
    alert('🔒 This record cannot be deleted.\n\n'
      + r.vendo_name+' — '+viKeysLbl(r)+'\n'
      + 'Already given to office'+(r.received_by?(' to '+r.received_by):'')+(r.given_at?(' · '+_fmt(r.given_at)):'')+'.\n\n'
      + 'Deleting would lose the turnover history. Undo the turnover first if you are sure.');
    return;
  }
  if(!confirm('Delete this install record permanently?')) return;
  fetch(_SB+'/rest/v1/vendo_installs?id=eq.'+id, {method:'DELETE', headers:_HDR})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} viLoad(); })
    .catch(e=>alert('Delete failed: '+e.message));
}


/* ── install: vendo detail fields (area / group / tg / vlan) ── */
/* Vendos in SINAMAN / MINAOG / MIX AREAS are harvested by DIPOLOG groups —
   those area labels have no groups of their own. Never hide a valid choice:
   show every group, grouped by area, with the suggested ones first. */
const VI_AREA_GROUPS = { 'SINAMAN':'DIPOLOG', 'MINAOG':'DIPOLOG', 'MIX AREAS':'DIPOLOG' };

function viAreaChanged(){
  const area = ((document.getElementById('vi-area')||{}).value || '').toUpperCase();
  const sel  = document.getElementById('vi-group');
  if(!sel) return;
  const prev = sel.value;

  if(!_viGroups.length){ sel.innerHTML = '<option value="">— Loading groups… —</option>'; return; }

  // which area's groups actually harvest this vendo
  const harvestArea = VI_AREA_GROUPS[area] || area;

  const label = g => {
    const b = (g.barangays||'').trim();
    const t = g.group_label || ('Group '+g.id);
    const who = g.collector ? ' · '+g.collector : '';
    return b ? (t+who+' — '+b) : (t+who);
  };

  // bucket by area, suggested area first
  const byArea = {};
  _viGroups.forEach(g=>{
    const a = String(g.area||'—').toUpperCase();
    (byArea[a] = byArea[a] || []).push(g);
  });
  const areas = Object.keys(byArea).sort((a,b)=>{
    if(a===harvestArea) return -1;
    if(b===harvestArea) return 1;
    return a.localeCompare(b);
  });

  let html = '<option value="">— No group —</option>';
  areas.forEach(a=>{
    const suggested = (a === harvestArea);
    const note = suggested && VI_AREA_GROUPS[area] ? ' (harvests '+area+')' : '';
    html += '<optgroup label="'+klEsc(a + note + (suggested ? '  ★' : ''))+'">';
    byArea[a].sort((x,y)=>String(x.group_id||'').localeCompare(String(y.group_id||'')))
      .forEach(g=>{
        html += '<option value="'+g.id+'">'
             + klEsc((g.group_id?g.group_id+' · ':'') + label(g))
             + ' ('+(g.total_vendos||0)+')</option>';
      });
    html += '</optgroup>';
  });
  sel.innerHTML = html;
  if(prev && sel.querySelector('option[value="'+prev+'"]')) sel.value = prev;

  const hint = document.getElementById('vi-group-hint');
  if(hint){
    if(VI_AREA_GROUPS[area]){
      hint.style.color = '#025AC6';
      hint.innerHTML = 'ℹ️ <b>'+klEsc(area)+'</b> vendos are harvested by <b>'+VI_AREA_GROUPS[area]+'</b> groups (★).';
    } else if(area){
      hint.style.color = '#9ca3af';
      hint.textContent = '★ = groups for this area. Any group can still be picked.';
    } else {
      hint.style.color = '#9ca3af';
      hint.textContent = 'Pick an area to highlight its groups.';
    }
  }
  viCompile();
}

function viTgInput(){
  clearTimeout(_viTgVT);
  const q = ((document.getElementById('vi-tgq')||{}).value||'').trim();
  const box = document.getElementById('vi-tgres');
  if(!box) return;
  _viTg = q || null;
  if(q) viSetNoTg(false);
  viTgState();
  if(q.length<2){ box.style.display='none'; box.innerHTML=''; return; }
  _viTgVT = setTimeout(()=>{
    const enc = encodeURIComponent('*'+q+'*');
    fetch(_SB+'/rest/v1/tg_vendo_names?select=name&name=ilike.'+enc+'&limit=12', {headers:_HDR})
      .then(r=>r.json())
      .then(rows=>{
        if(!Array.isArray(rows) || !rows.length){
          box.innerHTML='<div style="padding:10px 12px;font-size:12px;color:#6b7280;">No TG name matched. Keep typing or use "No TG name yet".</div>';
          box.style.display='block'; return;
        }
        box.innerHTML = rows.map(v=>
          '<div onclick=\'viPickTg('+JSON.stringify(v.name)+')\' style="padding:9px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:12px;font-weight:700;color:#311A8E;" '
          + 'onmouseover="this.style.background=\'#f0f7ff\'" onmouseout="this.style.background=\'#fff\'">📶 '+klEsc(v.name)+'</div>'
        ).join('');
        box.style.display='block';
      })
      .catch(()=>{ box.style.display='none'; });
  }, 300);
}

function viPickTg(name){
  _viTg = name;
  viSetNoTg(false);
  const q = document.getElementById('vi-tgq'); if(q) q.value = name;
  const box = document.getElementById('vi-tgres'); if(box){ box.style.display='none'; box.innerHTML=''; }
  viTgState();
}

function viToggleNoTg(){ viSetNoTg(!_viNoTg); }

function viSetNoTg(on){
  _viNoTg = !!on;
  const btn = document.getElementById('vi-notg-btn');
  const q   = document.getElementById('vi-tgq');
  if(_viNoTg){
    _viTg = null;
    if(q){ q.value=''; q.disabled = true; q.style.background='#f3f4f6'; }
    if(btn){ btn.style.background='#C01176'; btn.style.color='#fff'; btn.textContent='✓ No TG name — sheet name will be used'; }
    const box = document.getElementById('vi-tgres'); if(box){ box.style.display='none'; }
  } else {
    if(q){ q.disabled = false; q.style.background='#fff'; }
    if(btn){ btn.style.background='#fff'; btn.style.color='#C01176'; btn.textContent='🚫 No TG name yet — use the sheet name'; }
  }
  viTgState();
}

function viTgState(){
  const el = document.getElementById('vi-tg-state');
  if(!el) return;
  const nm = ((document.getElementById('vi-vq')||{}).value||'').trim();
  if(_viNoTg){
    el.style.color = '#C01176';
    el.textContent = '🚫 no_tg = true · tg_name = "'+(nm||'(sheet name)')+'" · link it in dicayas.html later';
  } else if(_viTg){
    el.style.color = '#028867';
    el.textContent = '✅ TG name: '+_viTg;
  } else {
    el.style.color = '#6b7280';
    el.textContent = 'Pick a TG name or tap "No TG name yet".';
  }
  viCompile();
}

/* ══ PUNGPUNG TRANSFER — keys to move into a collector's bunch ══ */
let _ktRows = [], _ktVendos = [], _ktVT = null, _ktSeq = 0, _ktCustodians = [], _ktPending = [], _ktBusy = false;

function ktLoad(){
  const list = document.getElementById('kt-list');
  if(list) list.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;">Loading…</div>';
  Promise.all([
    fetch(_SB+'/rest/v1/key_transfers?select=*&order=created_at.desc&limit=800', {headers:_HDR}).then(r=>r.json()),
    fetch(_SB+'/rest/v1/key_custodians?select=name&active=eq.true&order=name.asc', {headers:_HDR}).then(r=>r.json()).catch(()=>[]),
    fetch(_SB+'/rest/v1/rpc/spawn_pungpung_pending', {method:'POST', headers:_HDR, body:'{}'}).then(r=>r.json()).catch(()=>[])
  ]).then(([rows, cus, pend])=>{
    _ktRows = Array.isArray(rows)?rows:[];
    _ktCustodians = (Array.isArray(cus)?cus:[]).map(c=>c.name);
    _ktPending = Array.isArray(pend)?pend:[];
    ktRenderCustodians();
    ktWireHolder();
    ktRenderVendos();
    ktRenderPending();
    ktRender();
  }).catch(e=>{ if(list) list.innerHTML = '<div style="padding:20px;color:#DF1A35;">Load error: '+klEsc(e.message)+'</div>'; });
}

/* remembered custodian names — click a chip to reuse */
function ktRenderCustodians(){
  const dl = document.getElementById('kt-holder-list');
  if(dl) dl.innerHTML = _ktCustodians.map(n=>'<option value="'+klEsc(n)+'">').join('');
  const box = document.getElementById('kt-holder-chips');
  if(!box) return;
  box.innerHTML = _ktCustodians.length
    ? _ktCustodians.map(n=>
        '<button type="button" onclick="ktPickHolder('+JSON.stringify(n)+')" style="padding:4px 10px;background:#f5f3ff;color:#311A8E;border:1.5px solid #c4b5fd;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">👤 '+klEsc(n)+'</button>'
      ).join('')
    : '<span style="font-size:11px;color:#9ca3af;">No saved custodian yet — just type, it will be remembered.</span>';
}

function ktWireHolder(){
  const el = document.getElementById('kt-holder');
  if(el && !el._wired){ el.addEventListener('input', ktCompile); el._wired = true; }
}

function ktPickHolder(n){
  const el = document.getElementById('kt-holder');
  if(el) el.value = n;
  ktCompile();
}

function ktRememberCustodian(name){
  const nm = (name||'').trim();
  if(!nm) return Promise.resolve();
  if(_ktCustodians.some(c=>c.toLowerCase()===nm.toLowerCase())) return Promise.resolve();
  return fetch(_SB+'/rest/v1/key_custodians', {method:'POST', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify({name:nm, active:true})})
    .then(()=>{ _ktCustodians.push(nm); _ktCustodians.sort(); ktRenderCustodians(); })
    .catch(()=>{});
}

function ktVendoInput(){
  clearTimeout(_ktVT);
  const q = ((document.getElementById('kt-vq')||{}).value||'').trim();
  const box = document.getElementById('kt-vres');
  if(!box) return;
  if(q.length<2){ box.style.display='none'; box.innerHTML=''; return; }
  _ktVT = setTimeout(()=>{
    const enc = encodeURIComponent('*'+q+'*');
    fetch(_SB+'/rest/v1/vendos?select=id,sheet_name,tg_name,owner_name,area&or=(sheet_name.ilike.'+enc+',tg_name.ilike.'+enc+',owner_name.ilike.'+enc+')&limit=12', {headers:_HDR})
      .then(r=>r.json())
      .then(rows=>{
        if(!Array.isArray(rows) || !rows.length){ box.innerHTML='<div style="padding:10px 12px;font-size:12px;color:#6b7280;">No vendo found.</div>'; box.style.display='block'; return; }
        box.innerHTML = rows.map(v=>{
          const nm = v.sheet_name || v.tg_name || v.owner_name || ('#'+v.id);
          return '<div onclick=\'ktAddVendo('+JSON.stringify(v.id)+','+JSON.stringify(nm)+','+JSON.stringify(v.area||'')+')\' '
            + 'style="padding:9px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:12px;" '
            + 'onmouseover="this.style.background=\'#f5f3ff\'" onmouseout="this.style.background=\'#fff\'">'
            + '<b style="color:#311A8E;">'+klEsc(nm)+'</b>'
            + (v.area?' · <span style="color:#025AC6;font-weight:700;">'+klEsc(v.area)+'</span>':'')
            + '</div>';
        }).join('');
        box.style.display='block';
      })
      .catch(()=>{ box.style.display='none'; });
  }, 300);
}

function ktAddVendo(id, name, area){
  const box = document.getElementById('kt-vres'); if(box){ box.style.display='none'; box.innerHTML=''; }
  const vq = document.getElementById('kt-vq'); if(vq) vq.value='';
  if(_ktVendos.some(v=>v.id===id)){ alert('This vendo is already added: '+name); return; }
  _ktVendos.push({row:++_ktSeq, id:id, name:name, area:area||null});
  ktRenderVendos();
}

function ktRemoveVendo(row){ _ktVendos = _ktVendos.filter(v=>v.row!==row); ktRenderVendos(); ktRenderPending(); }

function ktRenderVendos(){
  const el = document.getElementById('kt-vlist');
  if(!el) return;
  if(!_ktVendos.length){
    el.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:12px;border:1.5px dashed #e5e7eb;border-radius:8px;">No vendo yet. Search above to add.</div>';
    ktCompile(); return;
  }
  el.innerHTML = _ktVendos.map(v=>
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;border:1.5px solid #311A8E;border-radius:8px;padding:8px 11px;margin-bottom:6px;background:#faf9ff;">'
    + '<div style="font-size:12px;font-weight:800;color:#311A8E;">'+klEsc(v.name)
    +   (v.area?' <span style="font-size:10px;color:#025AC6;font-weight:700;">· '+klEsc(v.area)+'</span>':'<span style="font-size:10px;color:#DF1A35;font-weight:700;"> · no area</span>')
    + '</div>'
    + '<button onclick="ktRemoveVendo('+v.row+')" style="background:#fff;border:1.5px solid #fca5a5;color:#DF1A35;width:24px;height:24px;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;flex-shrink:0;">✕</button>'
    + '</div>'
  ).join('');
  ktCompile();
}

function ktCompile(){
  const pv = document.getElementById('kt-preview');
  if(!pv) return;
  if(!_ktVendos.length){ pv.style.display='none'; return; }
  const holder = ((document.getElementById('kt-holder')||{}).value||'').trim();
  const byArea = {};
  _ktVendos.forEach(v=>{ const a=v.area||'(no area)'; (byArea[a]=byArea[a]||[]).push(v.name); });
  const lines = Object.keys(byArea).sort().map(a=>'📍 '+a+': '+byArea[a].join(', '));
  pv.style.display='block';
  pv.textContent = '📝 Compiled ('+_ktVendos.length+' key'+(_ktVendos.length===1?'':'s')+')'
    + (holder?'\n👤 Held by: '+holder:'\n⚠️ Who is holding them?')
    + '\n'+lines.join('\n');
}

function ktAdd(){
  if(_ktBusy) return;                       // guard: double-click duplicated every row before
  const holder = ((document.getElementById('kt-holder')||{}).value||'').trim();
  if(!holder){ alert('Who is holding the key? Enter staff custodian'); return; }
  if(!_ktVendos.length){ alert('Search and pick a vendo first'); return; }
  let notes = ((document.getElementById('kt-notes')||{}).value||'').trim() || null;
  // tie this transfer back to the free-text lineman log it resolves
  if(_ktForLog) notes = (notes ? notes+' · ' : '') + 'log#'+_ktForLog;
  const rows = _ktVendos.map(v=>({
    vendo_id:v.id, vendo_name:v.name, area:v.area,
    held_by:holder, added_to_pungpung:false, notes:notes
  }));
  const btn = document.getElementById('kt-add-btn');
  _ktBusy = true;
  if(btn){ btn.disabled = true; btn.style.opacity = '.6'; }
  ktRememberCustodian(holder)
    .then(()=>fetch(_SB+'/rest/v1/key_transfers', {method:'POST', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(rows)}))
    .then(r=>{
      if(!r.ok){ return r.text().then(t=>{throw new Error(t);}); }
      _ktVendos = [];
      const nt=document.getElementById('kt-notes'); if(nt) nt.value='';
      ktClearForLog();
      ktRenderVendos();
      if(typeof toast==='function') toast('✓ '+rows.length+' key(s) logged for transfer');
      ktLoad();
    })
    .catch(e=>{
      let m = String(e.message||e);
      if(/key_transfers_one_open_per_vendo/.test(m)) m = 'That vendo already has an open transfer for this custodian.';
      alert('Save failed: '+m);
    })
    .finally(()=>{ _ktBusy=false; if(btn){ btn.disabled=false; btn.style.opacity='1'; } });
}

function ktRender(){
  const list = document.getElementById('kt-list');
  const lbl  = document.getElementById('kt-lbl');
  if(!list) return;
  const filt = (document.getElementById('kt-filter')||{}).value || 'pending';
  const q = ((document.getElementById('kt-q')||{}).value||'').toLowerCase().trim();
  let rows = _ktRows.slice();
  if(filt==='pending')   rows = rows.filter(r=>!r.added_to_pungpung);
  else if(filt==='done') rows = rows.filter(r=>r.added_to_pungpung);
  if(q) rows = rows.filter(r=>((r.vendo_name||'')+' '+(r.held_by||'')+' '+(r.area||'')+' '+(r.notes||'')+' '+(r.transferred_by||'')+' '+(r.transferred_to||'')).toLowerCase().includes(q));

  const pend = _ktRows.filter(r=>!r.added_to_pungpung).length;
  if(lbl) lbl.textContent = rows.length+' key(s) shown · '+pend+' not yet in a pungpung';
  if(!rows.length){ list.innerHTML='<div style="padding:20px;text-align:center;color:#6b7280;">No records.</div>'; return; }

  // group by area
  const byArea = {};
  rows.forEach(r=>{ const a = r.area || '(no area)'; (byArea[a]=byArea[a]||[]).push(r); });

  list.innerHTML = Object.keys(byArea).sort().map(area=>{
    const items = byArea[area];
    const outN = items.filter(r=>!r.added_to_pungpung).length;
    return '<div style="font-size:12px;font-weight:800;color:#311A8E;margin:12px 0 7px;padding-bottom:4px;border-bottom:2px solid #e5e7eb;">📍 '+klEsc(area)
      + ' <span style="color:#6b7280;font-weight:600;">· '+items.length+' key(s)'+(outN?' · <span style="color:#DF1A35;">'+outN+' pending</span>':'')+'</span></div>'
      + items.map(r=>{
          const done = !!r.added_to_pungpung;
          const bd = done ? '#028867' : '#DF1A35';
          const badge = done
            ? '<span style="background:#028867;color:#fff;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:800;">✅ SA PUNGPUNG</span>'
            : '<span style="background:#DF1A35;color:#fff;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:800;">🔴 PENDING</span>';
          const actions = done
            ? '<button onclick="ktUndo('+r.id+')" style="padding:6px 10px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">↩ Undo</button>'
            : '<button onclick="ktTransfer('+r.id+')" style="padding:6px 12px;background:#311A8E;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;">🔗 Added to the Pungpung</button>';
          return '<div style="background:#fff;border:1.5px solid #e5e7eb;border-left:4px solid '+bd+';border-radius:9px;padding:10px 13px;margin-bottom:7px;">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'
            +   '<div style="font-size:13px;font-weight:800;color:#311A8E;">🔑 '+klEsc(r.vendo_name)+'</div>'+badge
            + '</div>'
            + '<div style="font-size:11px;color:#374151;margin-top:3px;">👤 Held by: <b>'+klEsc(r.held_by||'—')+'</b></div>'
            + (r.notes?'<div style="font-size:11px;color:#C01176;margin-top:2px;">📝 '+klEsc(r.notes)+'</div>':'')
            + (done
                ? '<div style="font-size:11px;color:#028867;margin-top:2px;">🔗 Transferred by <b>'+klEsc(r.transferred_by||'—')+'</b>'
                  + (r.transferred_to?(' → into <b>'+klEsc(r.transferred_to)+'</b>&#39;s pungpung'):'')
                  + (r.transferred_at?(' · '+_fmt(r.transferred_at)):'')+'</div>'
                : '')
            + '<div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;">'+actions
            +   '<button onclick="ktDelete('+r.id+')" style="padding:6px 9px;background:#fff;color:#DF1A35;border:1.5px solid #fca5a5;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">🗑</button>'
            + '</div>'
            + '</div>';
        }).join('');
  }).join('');
}

function ktTransfer(id){
  const rec = _ktRows.find(r=>r.id===id) || {};
  const old = document.getElementById('kt-modal'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'kt-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:18px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;font-family:inherit;">'
    + '<div style="background:linear-gradient(135deg,#311A8E,#025AC6);padding:20px 22px;color:#fff;">'
    +   '<div style="font-size:19px;font-weight:800;">🔗 Added to the Pungpung</div>'
    +   '<div style="font-size:12px;opacity:.9;margin-top:3px;">'+klEsc(rec.vendo_name||'')+(rec.area?(' · '+klEsc(rec.area)):'')+'</div>'
    + '</div>'
    + '<div style="padding:20px 22px;">'
    +   '<div style="background:#f5f3ff;border:1.5px solid #c4b5fd;border-radius:9px;padding:9px 12px;margin-bottom:14px;font-size:12px;color:#311A8E;">'
    +     '👤 Currently held by: <b>'+klEsc(rec.held_by||'—')+'</b></div>'
    +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Who did the transfer?</label>'
    +   '<input id="kt-m-by" list="kt-holder-list" placeholder="e.g. Joi" value="'+klEsc(rec.held_by||'')+'" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:12px;outline:none;">'
    +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Into whose pungpung? (optional)</label>'
    +   '<input id="kt-m-to" list="kc-by-list" placeholder="collector name" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:12px;outline:none;">'
    +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">🔒 Password</label>'
    +   '<input id="kt-m-pw" type="password" inputmode="numeric" placeholder="Enter password to confirm" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;" onkeydown="if(event.key===\'Enter\')ktConfirm('+id+')">'
    +   '<div id="kt-m-err" style="color:#DF1A35;font-size:12px;font-weight:700;margin-top:8px;display:none;">❌ Wrong password.</div>'
    +   '<div style="display:flex;gap:8px;margin-top:20px;">'
    +     '<button onclick="ktCloseModal()" style="flex:1;padding:11px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Cancel</button>'
    +     '<button onclick="ktConfirm('+id+')" style="flex:2;padding:11px;background:#311A8E;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;">✓ Confirm Transfer</button>'
    +   '</div>'
    + '</div>'
    + '</div>';
  ov.addEventListener('click', e=>{ if(e.target===ov) ktCloseModal(); });
  document.body.appendChild(ov);
  setTimeout(()=>{ const p=document.getElementById('kt-m-by'); if(p) p.focus(); }, 60);
}

function ktCloseModal(){ const ov=document.getElementById('kt-modal'); if(ov) ov.remove(); }

function ktConfirm(id){
  const pw = (document.getElementById('kt-m-pw')||{}).value || '';
  const err = document.getElementById('kt-m-err');
  if(pw !== KL_RETURN_PW){ if(err) err.style.display='block'; const p=document.getElementById('kt-m-pw'); if(p){p.value='';p.focus();} return; }
  const by = ((document.getElementById('kt-m-by')||{}).value||'').trim();
  const to = ((document.getElementById('kt-m-to')||{}).value||'').trim();
  const body = { added_to_pungpung:true, transferred_at:new Date().toISOString(), transferred_by:by||null, transferred_to:to||null };
  ktRememberCustodian(by)
    .then(()=>fetch(_SB+'/rest/v1/key_transfers?id=eq.'+id, {method:'PATCH', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify(body)}))
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} ktCloseModal(); ktLoad(); })
    .catch(e=>alert('Update failed: '+e.message));
}

function ktUndo(id){
  if(!confirm('Mark as NOT yet added to the pungpung again?')) return;
  fetch(_SB+'/rest/v1/key_transfers?id=eq.'+id, {method:'PATCH', headers:Object.assign({'Prefer':'return=minimal'},_HDR), body:JSON.stringify({added_to_pungpung:false, transferred_at:null, transferred_by:null, transferred_to:null})})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} ktLoad(); })
    .catch(e=>alert('Update failed: '+e.message));
}

function ktDelete(id){
  const r = _ktRows.find(x=>x.id===id);
  if(r && r.added_to_pungpung){
    alert('🔒 This record cannot be deleted.\n\n'
      + r.vendo_name+' — already added to the pungpung'+(r.transferred_by?(' (transferred by '+r.transferred_by+')'):'')+'.\n\n'
      + 'Deleting would lose the transfer history. Undo it first if you are sure.');
    return;
  }
  if(!confirm('Delete this transfer record permanently?')) return;
  fetch(_SB+'/rest/v1/key_transfers?id=eq.'+id, {method:'DELETE', headers:_HDR})
    .then(r=>{ if(!r.ok){return r.text().then(t=>{throw new Error(t);});} ktLoad(); })
    .catch(e=>alert('Delete failed: '+e.message));
}

/* ══ Pretty result modals for installs (replaces raw alert JSON) ══ */
function viModal(opts){
  const old = document.getElementById('vi-result-modal'); if(old) old.remove();
  const ok    = !!opts.ok;
  const tint  = ok ? '#028867' : '#DF1A35';
  const icon  = ok ? '✅' : '⚠️';
  const ov = document.createElement('div');
  ov.id = 'vi-result-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit;';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:18px;max-width:430px;width:100%;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.35);">'
    + '<div style="background:linear-gradient(135deg,'+tint+',#311A8E);padding:18px 22px;color:#fff;display:flex;justify-content:space-between;align-items:center;">'
    +   '<div style="font-size:18px;font-weight:800;">'+icon+' '+klEsc(opts.title||'')+'</div>'
    +   '<button onclick="viCloseModal()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:30px;height:30px;border-radius:8px;font-size:17px;cursor:pointer;font-family:inherit;">✕</button>'
    + '</div>'
    + '<div style="padding:18px 22px;">'
    +   (opts.lead ? '<div style="font-size:13px;color:#374151;margin-bottom:14px;line-height:1.5;">'+opts.lead+'</div>' : '')
    +   (opts.rows && opts.rows.length
        ? '<div style="border:1.5px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:14px;">'
          + opts.rows.map((r,i)=>
              '<div style="display:flex;gap:10px;padding:9px 12px;'+(i?'border-top:1px solid #f1f5f9;':'')+'background:'+(i%2?'#fafbfc':'#fff')+';">'
              + '<div style="width:104px;font-size:11px;color:#6b7280;font-weight:700;flex-shrink:0;">'+r[0]+'</div>'
              + '<div style="font-size:12px;color:#111827;font-weight:700;flex:1;word-break:break-word;">'+r[1]+'</div></div>'
            ).join('')
          + '</div>'
        : '')
    +   (opts.note ? '<div style="background:'+(ok?'#f0fdf9':'#fef2f2')+';border:1.5px solid '+tint+';border-radius:10px;padding:10px 12px;font-size:12px;color:'+(ok?'#065f46':'#991b1b')+';font-weight:600;line-height:1.5;margin-bottom:6px;">'+opts.note+'</div>' : '')
    +   '<button onclick="viCloseModal()" style="width:100%;margin-top:12px;padding:11px;background:'+tint+';color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;">'+(opts.btn||'OK')+'</button>'
    + '</div>'
    + '</div>';
  ov.addEventListener('click', e=>{ if(e.target===ov) viCloseModal(); });
  document.body.appendChild(ov);
}

function viCloseModal(){ const ov=document.getElementById('vi-result-modal'); if(ov) ov.remove(); }

/* problems found before saving — shown per field, with a fix button for VLAN */
function viProblems(errors){
  const FIELD = { name:'📛 Vendo name', area:'📍 Area', tg:'📶 TG name', vlan:'🔌 VLAN' };
  let suggest = null, blockerId = null, blockerUnnamed = false;
  errors.forEach(e=>{
    if(e.field==='vlan' && e.suggest) suggest = e.suggest;
    if(e.vendo_id){ blockerId = e.vendo_id; blockerUnnamed = !!e.blocker_unnamed; }
  });
  const old = document.getElementById('vi-result-modal'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'vi-result-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit;';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:18px;max-width:430px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;">'
    + '<div style="background:linear-gradient(135deg,#DF1A35,#311A8E);padding:18px 22px;color:#fff;display:flex;justify-content:space-between;align-items:center;">'
    +   '<div><div style="font-size:18px;font-weight:800;">⚠️ Cannot create this vendo</div>'
    +   '<div style="font-size:12px;opacity:.9;margin-top:2px;">Nothing was saved — fix these first</div></div>'
    +   '<button onclick="viCloseModal()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:30px;height:30px;border-radius:8px;font-size:17px;cursor:pointer;font-family:inherit;flex-shrink:0;">✕</button>'
    + '</div>'
    + '<div style="padding:18px 22px;">'
    +   errors.map(e=>
          '<div style="border:1.5px solid #fca5a5;background:#fef2f2;border-radius:10px;padding:11px 13px;margin-bottom:9px;">'
          + '<div style="font-size:11px;font-weight:800;color:#991b1b;margin-bottom:3px;">'+(FIELD[e.field]||e.field)+'</div>'
          + '<div style="font-size:12px;color:#374151;font-weight:600;line-height:1.5;">'+klEsc(e.msg)+'</div>'
          + '</div>'
        ).join('')
    +   (blockerUnnamed && blockerId
        ? '<div style="background:#fffbeb;border:1.5px solid #FFB725;border-radius:10px;padding:11px 13px;margin-top:4px;">'
          + '<div style="font-size:12px;color:#92400e;font-weight:700;margin-bottom:5px;">⚠️ The vendo holding this VLAN has no name (#'+blockerId+').</div>'
          + '<div style="font-size:11px;color:#78350f;font-weight:600;line-height:1.5;">This is often the <b>same vendo</b> you\u2019re adding — already in the system but never named. '
          + 'Check it in the <b>Vendos</b> tab first. If it is the same one, rename that record instead of creating a new vendo.</div>'
          + '</div>'
        : '')
    +   (suggest
        ? '<div style="background:#f0f7ff;border:1.5px solid #025AC6;border-radius:10px;padding:11px 13px;margin-top:8px;">'
          + '<div style="font-size:12px;color:#1e3a8a;font-weight:700;margin-bottom:8px;">💡 Next free VLAN in this area: <b style="font-size:15px;">'+suggest+'</b></div>'
          + '<button onclick="viUseVlan('+suggest+')" style="width:100%;padding:9px;background:#025AC6;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;">✓ Use VLAN '+suggest+'</button>'
          + '<div style="font-size:10px;color:#6b7280;margin-top:6px;font-weight:600;">Only if this really is a different vendo.</div>'
          + '</div>'
        : '')
    +   '<button onclick="viCloseModal()" style="width:100%;margin-top:12px;padding:11px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Close</button>'
    + '</div>'
    + '</div>';
  ov.addEventListener('click', e=>{ if(e.target===ov) viCloseModal(); });
  document.body.appendChild(ov);
}

function viUseVlan(v){
  const el = document.getElementById('vi-vlan');
  if(el){ el.value = v; el.style.borderColor = '#028867'; setTimeout(()=>{ el.style.borderColor='#e5e7eb'; }, 1500); }
  viCloseModal();
  viCompile();
}

/* ══ INSTALL: GPS parser + photo upload ══ */
let _viGps = null, _viPhotoFile = null;

/* Accepts:
     8.59408, 123.35089
     8.59408,123.35089
     Lat 8.59408 Long 123.35089
     8°35'38.7"N 123°21'03.2"E     (Conota / Maps DMS)
     8.59408N, 123.35089E
   Rejects anything outside Zamboanga del Norte's plausible box. */
function viGpsParseStr(raw){
  if(!raw) return null;
  const s = String(raw).trim();
  if(!s) return null;

  // DMS first: 8°35'38.7"N 123°21'03.2"E
  const dms = s.match(/(\d+)\s*[°º]\s*(\d+)\s*['′]\s*([\d.]+)\s*["″]?\s*([NS])[,\s]+(\d+)\s*[°º]\s*(\d+)\s*['′]\s*([\d.]+)\s*["″]?\s*([EW])/i);
  if(dms){
    let la = (+dms[1]) + (+dms[2])/60 + (+dms[3])/3600;
    let ln = (+dms[5]) + (+dms[6])/60 + (+dms[7])/3600;
    if(dms[4].toUpperCase()==='S') la = -la;
    if(dms[8].toUpperCase()==='W') ln = -ln;
    return {lat:+la.toFixed(6), lng:+ln.toFixed(6)};
  }

  // decimal pair, tolerating labels and N/E suffixes
  const nums = s.replace(/[NnEe](?![\d.])/g,' ').match(/-?\d+\.\d+|-?\d+/g);
  if(!nums || nums.length < 2) return null;
  const lat = parseFloat(nums[0]), lng = parseFloat(nums[1]);
  if(isNaN(lat) || isNaN(lng)) return null;
  return {lat:+lat.toFixed(6), lng:+lng.toFixed(6)};
}

/* plausible box for Zamboanga del Norte — catches swapped lat/lng and typos */
function viGpsSane(g){
  if(!g) return {ok:false, why:'Could not read coordinates'};
  const inBox = (la,ln) => la > 7.5 && la < 9.5 && ln > 122.5 && ln < 124.0;
  if(inBox(g.lat, g.lng)) return {ok:true};
  // check the reverse before complaining about range — a swapped paste is the common case
  if(inBox(g.lng, g.lat)) return {ok:false, why:'Looks reversed — lat and lng are swapped', swapped:true};
  if(Math.abs(g.lat)>90 || Math.abs(g.lng)>180) return {ok:false, why:'Out of range for a coordinate'};
  return {ok:false, why:'Outside Zamboanga del Norte'};
}

function viGpsParse(){
  const raw = ((document.getElementById('vi-gps')||{}).value||'');
  const el = document.getElementById('vi-gps-state');
  if(!el) return;
  if(!raw.trim()){
    _viGps = null;
    el.style.color = '#9ca3af';
    el.textContent = 'Paste coordinates — only real camera/Maps values, never estimated.';
    viCompile(); return;
  }
  const g = viGpsParseStr(raw);
  const s = viGpsSane(g);
  if(!s.ok){
    _viGps = null;
    el.style.color = '#DF1A35';
    el.innerHTML = '❌ '+klEsc(s.why)
      + (s.swapped ? ' · <button type="button" onclick="viGpsSwap()" style="padding:2px 8px;background:#025AC6;color:#fff;border:none;border-radius:5px;font-size:10px;font-weight:800;cursor:pointer;font-family:inherit;">Swap them</button>' : '');
    viCompile(); return;
  }
  _viGps = g;
  el.style.color = '#028867';
  el.innerHTML = '✅ ' + g.lat + ', ' + g.lng
    + ' · <a href="https://www.google.com/maps?q='+g.lat+','+g.lng+'" target="_blank" rel="noopener" style="color:#025AC6;font-weight:800;">view on map ↗</a>';
  viCompile();
}

function viGpsSwap(){
  const el = document.getElementById('vi-gps');
  const g = viGpsParseStr(el ? el.value : '');
  if(g && el){ el.value = g.lng + ', ' + g.lat; viGpsParse(); }
}

function viGpsClear(){
  const el = document.getElementById('vi-gps'); if(el) el.value='';
  _viGps = null;
  viGpsParse();
}

async function viPhotoPick(input){
  const f = input.files && input.files[0];
  const st = document.getElementById('vi-photo-state');
  const pv = document.getElementById('vi-photo-prev');
  if(!f){ _viPhotoFile=null; if(pv) pv.style.display='none'; if(st){st.style.color='#9ca3af';st.textContent='Optional — uploaded after the vendo is created.';} viCompile(); return; }
  if(!/^image\//.test(f.type)){ _viPhotoFile=null; if(st){st.style.color='#DF1A35';st.textContent='❌ Not an image file';} return; }
  if(f.size > 10*1024*1024){ _viPhotoFile=null; if(st){st.style.color='#DF1A35';st.textContent='❌ Too big (max 10MB)';} return; }
  _viPhotoFile = f;
  if(pv){ pv.src = URL.createObjectURL(f); pv.style.display='block'; }
  const size = Math.round(f.size/1024)+' KB';
  if(st){ st.style.color='#6b7280'; st.textContent='📷 '+f.name+' · '+size+' · reading GPS…'; }

  // try to lift GPS straight out of the photo's EXIF
  const g = await viExifGps(f);
  if(!st){ viCompile(); return; }
  if(g){
    const sane = viGpsSane(g);
    if(sane.ok){
      const box = document.getElementById('vi-gps');
      const already = box && box.value.trim();
      if(!already){
        if(box) box.value = g.lat+', '+g.lng;
        viGpsParse();
        st.style.color='#028867';
        st.innerHTML = '✅ '+klEsc(f.name)+' · '+size+'<br>📍 <b>GPS read from photo</b> — filled in above.';
      } else {
        st.style.color='#025AC6';
        st.innerHTML = '✅ '+klEsc(f.name)+' · '+size+'<br>📍 Photo has GPS ('+g.lat+', '+g.lng+') · '
          + '<button type="button" onclick="viUsePhotoGps('+g.lat+','+g.lng+')" style="padding:2px 8px;background:#025AC6;color:#fff;border:none;border-radius:5px;font-size:10px;font-weight:800;cursor:pointer;font-family:inherit;">use it</button>';
      }
    } else {
      st.style.color='#C01176';
      st.innerHTML = '✅ '+klEsc(f.name)+' · '+size+'<br>⚠️ Photo GPS looks wrong ('+g.lat+', '+g.lng+') — ignored.';
    }
  } else {
    st.style.color='#6b7280';
    st.innerHTML = '✅ '+klEsc(f.name)+' · '+size
      + '<br><span style="color:#9ca3af;">No GPS in this photo — a Conota stamp is printed on the image, not stored as data. Type or paste the coordinates above.</span>';
  }
  viCompile();
}

function viUsePhotoGps(lat, lng){
  const box = document.getElementById('vi-gps');
  if(box){ box.value = lat+', '+lng; viGpsParse(); }
}

/* upload to harvest-photos/vendo-profiles/vendo_{id}.jpg (existing convention).
   The core fetch interceptor rewrites this into a spawn-gw-admin storage call. */
async function viUploadPhoto(vendoId){
  if(!_viPhotoFile || !vendoId) return null;
  const path = 'vendo-profiles/vendo_' + vendoId + '.jpg';
  const up = await fetch(_SB+'/storage/v1/object/harvest-photos/'+path, {
    method:'POST',
    headers:{ apikey:_KEY, Authorization:'Bearer '+_KEY,
              'Content-Type': _viPhotoFile.type||'image/jpeg', 'x-upsert':'true' },
    body:_viPhotoFile
  });
  const txt = await up.text();
  if(!up.ok) throw new Error('Photo upload failed: '+txt);
  // gateway replies { ok, status, body, public_url }
  try{ const j = JSON.parse(txt); if(j && j.public_url) return j.public_url; }catch(_){}
  return _SB+'/storage/v1/object/public/harvest-photos/'+path;
}

/* ══ INSTALL: server name — searchable, free-type allowed ══ */
let _viSrv = null, _viSrvVT = null, _viSrvList = null;

/* known servers = distinct server_name from mikrotik_status (the live source) */
async function viSrvLoadList(){
  if(_viSrvList) return _viSrvList;
  try{
    const r = await fetch(_SB+'/rest/v1/mikrotik_status?select=server_name&limit=2000', {headers:_HDR});
    const rows = await r.json();
    const set = new Set();
    (Array.isArray(rows)?rows:[]).forEach(x=>{ if(x.server_name) set.add(x.server_name); });
    // include anything already used on vendos, in case a server has no router rows
    const r2 = await fetch(_SB+'/rest/v1/vendos?select=server_name&server_name=not.is.null&limit=2000', {headers:_HDR});
    const rows2 = await r2.json();
    (Array.isArray(rows2)?rows2:[]).forEach(x=>{ if(x.server_name) set.add(x.server_name); });
    _viSrvList = Array.from(set).sort();
  }catch(e){ _viSrvList = []; }
  return _viSrvList;
}

async function viSrvInput(){
  clearTimeout(_viSrvVT);
  const q = ((document.getElementById('vi-srvq')||{}).value||'').trim();
  const box = document.getElementById('vi-srvres');
  _viSrv = q || null;
  viSrvState();
  if(!box) return;
  if(!q){ box.style.display='none'; box.innerHTML=''; return; }
  _viSrvVT = setTimeout(async ()=>{
    const list = await viSrvLoadList();
    const hits = list.filter(s=>s.toLowerCase().includes(q.toLowerCase()));
    const exact = list.some(s=>s.toLowerCase()===q.toLowerCase());
    let html = '';
    if(hits.length){
      html += hits.map(s=>
        '<div onclick=\'viPickSrv('+JSON.stringify(s)+')\' style="padding:9px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:12px;font-weight:700;color:#311A8E;" '
        + 'onmouseover="this.style.background=\'#f0fdf9\'" onmouseout="this.style.background=\'#fff\'">🖥️ '+klEsc(s)+'</div>'
      ).join('');
    }
    if(!exact){
      html += '<div style="padding:9px 12px;font-size:11px;color:#028867;font-weight:700;background:#f0fdf9;">'
            + '✏️ New server — "'+klEsc(q)+'" will be saved as typed.</div>';
    }
    box.innerHTML = html;
    box.style.display = 'block';
  }, 250);
}

function viPickSrv(name){
  _viSrv = name;
  const el = document.getElementById('vi-srvq'); if(el) el.value = name;
  const box = document.getElementById('vi-srvres'); if(box){ box.style.display='none'; box.innerHTML=''; }
  viSrvState();
}

function viSrvState(){
  const el = document.getElementById('vi-srv-state');
  if(!el) return;
  if(!_viSrv){
    el.style.color = '#9ca3af';
    el.textContent = 'Optional — which MikroTik server this vendo sits on.';
  } else {
    const known = _viSrvList && _viSrvList.some(s=>s.toLowerCase()===_viSrv.toLowerCase());
    el.style.color = known ? '#028867' : '#C01176';
    el.textContent = known ? ('✅ '+_viSrv) : ('✏️ New server: '+_viSrv);
  }
  viCompile();
}

/* ══ INSTALL: router search — links VLAN + server from MikroTik ══ */
let _viRt = null, _viRtVT = null;

function viRtInput(){
  clearTimeout(_viRtVT);
  const q = ((document.getElementById('vi-rtq')||{}).value||'').trim();
  const box = document.getElementById('vi-rtres');
  if(!box) return;
  if(q.length < 2){ box.style.display='none'; box.innerHTML=''; return; }
  const area = (document.getElementById('vi-area')||{}).value || null;
  _viRtVT = setTimeout(()=>{
    fetch(_SB+'/rest/v1/rpc/spawn_search_routers', {
      method:'POST', headers:_HDR,
      body: JSON.stringify({ p_q:q, p_area:area, p_limit:12 })
    })
    .then(r=>r.json())
    .then(rows=>{
      if(!Array.isArray(rows) || !rows.length){
        box.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:#6b7280;">No router found. Check the MikroTik comment, or leave this blank.</div>';
        box.style.display='block'; return;
      }
      box.innerHTML = rows.map(r=>{
        const dot = r.online ? '🟢' : '🔴';
        const taken = !!r.claimed_by;
        const cmt = (r.comment||'').replace(/[\r\n]+/g,' · ').trim();
        return '<div onclick=\'viPickRouter('+JSON.stringify(r)+')\' '
          + 'style="padding:9px 12px;border-bottom:1px solid #f1f5f9;cursor:'+(taken?'not-allowed':'pointer')+';font-size:12px;'+(taken?'background:#fafafa;opacity:.75;':'')+'" '
          + 'onmouseover="this.style.background=\''+(taken?'#fafafa':'#f5f3ff')+'\'" onmouseout="this.style.background=\''+(taken?'#fafafa':'#fff')+'\'">'
          + '<div style="display:flex;justify-content:space-between;gap:6px;align-items:center;">'
          +   '<b style="color:#311A8E;">'+dot+' VLAN '+r.vlan+'</b>'
          +   (taken ? '<span style="font-size:9px;background:#DF1A35;color:#fff;padding:1px 6px;border-radius:5px;font-weight:800;">TAKEN</span>'
                     : '<span style="font-size:9px;background:#028867;color:#fff;padding:1px 6px;border-radius:5px;font-weight:800;">FREE</span>')
          + '</div>'
          + '<div style="font-size:11px;color:#374151;margin-top:2px;">'+klEsc(cmt||'(no comment)')+'</div>'
          + (taken ? '<div style="font-size:10px;color:#DF1A35;margin-top:2px;font-weight:700;">Already used by: '+klEsc(r.claimed_by)+'</div>' : '')
          + '</div>';
      }).join('');
      box.style.display='block';
    })
    .catch(()=>{ box.style.display='none'; });
  }, 300);
}

function viPickRouter(r){
  if(r.claimed_by){
    viModal({ok:false, title:'Router already in use',
      lead:'VLAN '+r.vlan+' is already linked to another vendo.',
      rows:[['Used by', klEsc(r.claimed_by)], ['Comment', klEsc((r.comment||'').replace(/[\r\n]+/g,' · '))]],
      note:'Pick a FREE router, or fix the other vendo\u2019s VLAN first.'});
    return;
  }
  _viRt = r;
  const box=document.getElementById('vi-rtres'); if(box){ box.style.display='none'; box.innerHTML=''; }
  const q=document.getElementById('vi-rtq');
  if(q) q.value = 'VLAN '+r.vlan+' — '+((r.comment||'').replace(/[\r\n]+/g,' ').slice(0,40));
  // auto-fill VLAN + server
  const vl = document.getElementById('vi-vlan');
  if(vl){ vl.value = r.vlan; vl.style.borderColor='#028867'; setTimeout(()=>{vl.style.borderColor='#e5e7eb';},1500); }
  if(r.server_name){
    _viSrv = r.server_name;
    const s = document.getElementById('vi-srvq'); if(s) s.value = r.server_name;
    viSrvState();
  }
  const st = document.getElementById('vi-rt-state');
  if(st){
    st.style.color = '#028867';
    st.innerHTML = '✅ Linked · VLAN <b>'+r.vlan+'</b> · '+klEsc(r.server_name||'—')
      + ' · '+(r.online?'🟢 online':'🔴 offline')
      + (r.ip?' · <span style="color:#6b7280;">'+klEsc(r.ip)+'</span>':'');
  }
  // offer the address hiding inside the router comment
  const guess = viAddrFromComment(r.comment);
  const ai = document.getElementById('vi-addr'), as = document.getElementById('vi-addr-state');
  if(guess && ai && as && !ai.value.trim()){
    as.style.color = '#025AC6';
    as.innerHTML = '💡 From router: "'+klEsc(guess)+'" · '
      + '<button type="button" onclick="viUseAddr('+JSON.stringify(guess)+')" style="padding:2px 8px;background:#025AC6;color:#fff;border:none;border-radius:5px;font-size:10px;font-weight:800;cursor:pointer;font-family:inherit;">use it</button>';
  }
  viCompile();
}

/* Router comments look like:
     "Gina Velasco\r\nPurok Santan 2\r\nSitio balabag\r\nBarangay Gulayon\r\nD.C. 12/13/25"
     "Bendong Purok Sidlakan upper turno 09709162679  9/19/25"
   Strip the vlan label, phone numbers and trailing dates; keep the location-ish remainder. */
function viAddrFromComment(cmt){
  if(!cmt) return null;
  let s = String(cmt).replace(/[\r\n]+/g, ', ');
  s = s.replace(/\bvlan\s*\d+\b/ig, ' ');       // "vlan201"
  s = s.replace(/\b09\d{9}\b/g, ' ');            // phone
  s = s.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' '); // dates
  s = s.replace(/\s*,\s*/g, ', ').replace(/\s{2,}/g, ' ');
  s = s.replace(/(^[\s,]+)|([\s,]+$)/g, '');
  // drop a leading person-name chunk if the rest still looks like an address
  const parts = s.split(', ').filter(Boolean);
  if(parts.length > 1 && /purok|sitio|barangay|brgy|street|st\.|road|rd|bypass|upper|lower|relocation|site/i.test(parts.slice(1).join(' '))){
    parts.shift();
    s = parts.join(', ');
  }
  s = s.replace(/(^[\s,]+)|([\s,]+$)/g, '');
  return s.length > 3 ? s : null;
}

function viUseAddr(a){
  const ai = document.getElementById('vi-addr');
  if(ai){ ai.value = a; ai.style.borderColor='#028867'; setTimeout(()=>{ai.style.borderColor='#e5e7eb';},1500); }
  const as = document.getElementById('vi-addr-state');
  if(as){ as.style.color='#9ca3af'; as.textContent='Optional — shown to collectors on the route.'; }
  viCompile();
}

function viRtClear(){
  _viRt = null;
  const q=document.getElementById('vi-rtq'); if(q) q.value='';
  const st=document.getElementById('vi-rt-state');
  if(st){ st.style.color='#9ca3af'; st.textContent='Linking a router auto-fills VLAN + server.'; }
  viCompile();
}

/* ══ INSTALL: read GPS out of a photo's EXIF (no library) ══
   Only works if the camera wrote real GPS EXIF tags. Coordinates *burned into
   the pixels* (Conota-style stamps) are NOT readable this way — those must be
   typed or pasted. */
function viExifGps(file){
  return new Promise(resolve=>{
    const fr = new FileReader();
    fr.onerror = ()=>resolve(null);
    fr.onload = ()=>{
      try{
        const dv = new DataView(fr.result);
        if(dv.byteLength < 4 || dv.getUint16(0) !== 0xFFD8) return resolve(null); // not a JPEG
        let off = 2;
        // walk JPEG markers to find APP1/Exif
        while(off < dv.byteLength - 4){
          const marker = dv.getUint16(off);
          if(marker === 0xFFE1){
            const exifStart = off + 4;
            if(dv.getUint32(exifStart) !== 0x45786966) return resolve(null); // "Exif"
            return resolve(viExifWalk(dv, exifStart + 6));
          }
          if((marker & 0xFF00) !== 0xFF00) break;
          off += 2 + dv.getUint16(off + 2);
        }
        resolve(null);
      }catch(e){ resolve(null); }
    };
    fr.readAsArrayBuffer(file.slice(0, 256*1024)); // header only
  });
}

function viExifWalk(dv, tiff){
  const le = dv.getUint16(tiff) === 0x4949;           // II = little-endian
  const u16 = o => dv.getUint16(o, le);
  const u32 = o => dv.getUint32(o, le);
  if(u16(tiff + 2) !== 0x002A) return null;
  const ifd0 = tiff + u32(tiff + 4);
  let gpsOff = 0;
  const n = u16(ifd0);
  for(let i=0;i<n;i++){
    const e = ifd0 + 2 + i*12;
    if(u16(e) === 0x8825){ gpsOff = tiff + u32(e + 8); break; }  // GPSInfo pointer
  }
  if(!gpsOff) return null;

  const rat = (o) => u32(o) / (u32(o+4) || 1);
  const dms = (o) => rat(o) + rat(o+8)/60 + rat(o+16)/3600;
  let lat=null, lng=null, latR='N', lngR='E';
  const gn = u16(gpsOff);
  for(let i=0;i<gn;i++){
    const e = gpsOff + 2 + i*12;
    const tag = u16(e), cnt = u32(e+4);
    const valOff = (cnt*8 > 4) ? (tiff + u32(e+8)) : (e+8);
    if(tag === 1) latR = String.fromCharCode(dv.getUint8(e+8));
    if(tag === 3) lngR = String.fromCharCode(dv.getUint8(e+8));
    if(tag === 2) lat = dms(valOff);
    if(tag === 4) lng = dms(valOff);
  }
  if(lat==null || lng==null || isNaN(lat) || isNaN(lng)) return null;
  if(latR === 'S') lat = -lat;
  if(lngR === 'W') lng = -lng;
  return {lat:+lat.toFixed(6), lng:+lng.toFixed(6)};
}

/* ══ PUNGPUNG: auto-checker — keys now with the office, not yet in a pungpung ══
   Suggestions only. Nothing is written until staff taps Add. */
const KT_SRC = {
  lineman:      {icon:'🔧', label:'Lineman returned', color:'#025AC6'},
  lineman_text: {icon:'🔧', label:'Lineman returned', color:'#025AC6'},
  padlock:      {icon:'🔁', label:'Padlock remitted', color:'#C01176'},
  install:      {icon:'📦', label:'New install',      color:'#028867'}
};

function ktRenderPending(){
  const box = document.getElementById('kt-pending');
  if(!box) return;
  const rows = _ktPending || [];
  if(!rows.length){
    box.innerHTML = '<div style="background:#f0fdf9;border:1.5px solid #028867;border-radius:10px;padding:11px 13px;font-size:12px;color:#065f46;font-weight:700;">'
      + '✅ Nothing waiting — every key given to the office is already logged for transfer.</div>';
    return;
  }
  const when = t => {
    if(!t) return '';
    const d = new Date(t); if(isNaN(d)) return '';
    const days = Math.floor((Date.now()-d.getTime())/86400000);
    return days<=0?'today':days===1?'1 day ago':days+' days ago';
  };
  box.innerHTML =
    '<div style="background:#fffbeb;border:1.5px solid #FFB725;border-radius:10px;padding:11px 13px;margin-bottom:9px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:9px;">'
    +   '<div style="font-size:12px;font-weight:800;color:#92400e;">📋 Waiting to be transferred · '+rows.length+'</div>'
    +   '<button type="button" onclick="ktAddAllPending()" style="padding:5px 11px;background:#92400e;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap;">+ Add all</button>'
    + '</div>'
    + '<div style="font-size:10px;color:#78350f;font-weight:600;margin-bottom:9px;line-height:1.5;">Keys the office has received but that are not on a pungpung yet. Tap Add to move one across — nothing is saved until you do.</div>'
    + rows.map(r=>{
        const s = KT_SRC[r.source] || {icon:'🔑', label:r.source, color:'#6b7280'};
        if(!r.vendo_id) return ktPendingUnlinked(r, s);
        const already = _ktVendos.some(v=>v.id===r.vendo_id);
        return '<div style="background:#fff;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;margin-bottom:6px;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'
          +   '<div style="min-width:0;flex:1;">'
          +     '<div style="font-size:12px;font-weight:800;color:#311A8E;">'+klEsc(r.vendo_name||('#'+r.vendo_id))
          +       (r.vendo_code?' <span style="background:#311A8E;color:#fff;padding:1px 5px;border-radius:4px;font-size:9px;">'+klEsc(r.vendo_code)+'</span>':'')+'</div>'
          +     '<div style="font-size:10px;color:#6b7280;font-weight:600;margin-top:2px;">'
          +       '<span style="color:'+s.color+';font-weight:800;">'+s.icon+' '+s.label+'</span>'
          +       ' · '+klEsc(r.area||'—')
          +       (r.who?' · from '+klEsc(r.who):'')
          +       (r.when?' · '+when(r.when):'')
          +     '</div>'
          +     (r.detail?'<div style="font-size:10px;color:#9ca3af;font-weight:600;margin-top:1px;">'+klEsc(r.detail)+'</div>':'')
          +   '</div>'
          +   (already
              ? '<span style="font-size:10px;color:#028867;font-weight:800;white-space:nowrap;">✓ added</span>'
              : '<button type="button" onclick=\'ktAddPending('+JSON.stringify(r.vendo_id)+','+JSON.stringify(r.vendo_name||'')+','+JSON.stringify(r.area||'')+')\' style="padding:5px 11px;background:#028867;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap;">+ Add</button>')
          + '</div></div>';
      }).join('')
    + '</div>';
}

/* move one suggestion into the manual basket — still not saved */
function ktAddPending(id, name, area){
  if(_ktVendos.some(v=>v.id===id)) return;
  _ktVendos.push({row:++_ktSeq, id:id, name:name, area:area});
  ktRenderVendos();
  ktRenderPending();
  if(typeof toast==='function') toast('Added to the list below — set the custodian, then save.');
}

function ktAddAllPending(){
  let n = 0;
  (_ktPending||[]).forEach(r=>{
    if(!_ktVendos.some(v=>v.id===r.vendo_id)){
      _ktVendos.push({row:++_ktSeq, id:r.vendo_id, name:r.vendo_name||('#'+r.vendo_id), area:r.area||''});
      n++;
    }
  });
  ktRenderVendos();
  ktRenderPending();
  if(typeof toast==='function') toast(n?('Added '+n+' to the list below — set the custodian, then save.'):'All already in the list.');
}


/* Free-text lineman return — vendo never linked, so staff must choose.
   Names like "ZAMORA" match several vendos; auto-matching would risk wrong custody. */
function ktPendingUnlinked(r, s){
  const when = (()=>{ if(!r.when) return ''; const d=new Date(r.when); if(isNaN(d)) return '';
    const days=Math.floor((Date.now()-d.getTime())/86400000);
    return days<=0?'today':days===1?'1 day ago':days+' days ago'; })();
  return '<div style="background:#fff;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;margin-bottom:6px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">'
    +   '<div style="min-width:0;flex:1;">'
    +     '<div style="font-size:10px;color:#6b7280;font-weight:600;">'
    +       '<span style="color:'+s.color+';font-weight:800;">'+s.icon+' '+s.label+'</span>'
    +       (r.who?' · from '+klEsc(r.who):'') + (when?' · '+when:'')
    +       ' · <span style="color:#9ca3af;">log #'+r.log_id+'</span>'
    +     '</div>'
    +     '<div style="font-size:12px;font-weight:700;color:#311A8E;margin-top:3px;word-break:break-word;">🔑 '+klEsc(r.raw_text||'')+'</div>'
    +     (r.detail?'<div style="font-size:10px;color:#9ca3af;font-weight:600;margin-top:1px;">'+klEsc(r.detail)+'</div>':'')
    +     '<div style="font-size:10px;color:#C01176;font-weight:700;margin-top:3px;">⚠️ Typed by hand — no vendo linked. Pick which vendo this key belongs to.</div>'
    +   '</div>'
    +   '<button type="button" onclick=\'ktPickForLog('+JSON.stringify(r.log_id)+')\' style="padding:5px 11px;background:#025AC6;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;">Pick vendo</button>'
    + '</div></div>';
}

/* focus the existing vendo search and remember which log we are resolving */
let _ktForLog = null;
function ktPickForLog(logId){
  _ktForLog = logId;
  const inp = document.getElementById('kt-vq');
  if(inp){ inp.focus(); inp.scrollIntoView({behavior:'smooth', block:'center'}); }
  const note = document.getElementById('kt-forlog');
  if(note){
    note.style.display = 'block';
    note.innerHTML = '🔗 Linking to <b>log #'+logId+'</b> — search the vendo above, then save. '
      + '<button type="button" onclick="ktClearForLog()" style="padding:1px 7px;background:#fff;border:1.5px solid #e5e7eb;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit;">cancel</button>';
  }
  if(typeof toast==='function') toast('Search the vendo, then Log Keys for Transfer.');
}

function ktClearForLog(){
  _ktForLog = null;
  const note = document.getElementById('kt-forlog');
  if(note){ note.style.display='none'; note.innerHTML=''; }
}
