
// ══════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════

/* ══ VENDO MAP TOP LEVEL ══ */
let _vmtMap = null, _vmtRows = [], _vmtMarkers = [];
const _VMT_COLORS = {
  'DIPOLOG':'#1565c0','DAPITAN':'#15803d','SINDANGAN':'#7e22ce',
  'POLANCO':'#b45309','ROXAS':'#dc2626','SINAMAN':'#0891b2',
  'MINAOG':'#be185d','MIX AREAS':'#6b7280'
};
async function vmTopLoad(){
  const mapEl = document.getElementById('vmap-top-map');
  if(!mapEl||!window.L) return;
  if(!_vmtMap){
    _vmtMap = L.map('vmap-top-map').setView([8.15,123.27],10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(_vmtMap);
  }
  setTimeout(()=>_vmtMap.invalidateSize(),300);setTimeout(()=>_vmtMap.invalidateSize(),700);
  const cnt=document.getElementById('vmap-top-count');
  if(cnt) cnt.textContent='Loading…';
  try{
    let all=[],off=0;
    while(true){
      const r=await fetch(`${SB_URL}/rest/v1/vendos?status=eq.active&lat=not.is.null&select=id,sheet_name,tg_name,area,address,contact_number,lat,lng,last_harvest_date,vlan&order=sheet_name.asc&limit=1000&offset=${off}`,{headers:HDR});
      const b=await r.json();
      if(!Array.isArray(b)||!b.length) break;
      all.push(...b);
      if(b.length<1000) break;
      off+=1000;
    }
    _vmtRows=all;
    const areas=[...new Set(all.map(v=>v.area).filter(Boolean))].sort();
    const sel=document.getElementById('vmap-top-area');
    if(sel){const prev=sel.value;sel.innerHTML='<option value="">All areas</option>'+areas.map(a=>`<option${a===prev?' selected':''}>${a}</option>`).join('');}
    vmTopFilter();
  }catch(e){if(cnt)cnt.textContent='Error: '+e.message;}
}
function vmTopFilter(){
  if(!_vmtMap||!_vmtRows.length) return;
  const q=(document.getElementById('vmap-top-search')?.value||'').toLowerCase().trim();
  const area=document.getElementById('vmap-top-area')?.value||'';
  let rows=_vmtRows;
  if(area) rows=rows.filter(v=>v.area===area);
  if(q) rows=rows.filter(v=>(v.sheet_name||'').toLowerCase().includes(q)||(v.tg_name||'').toLowerCase().includes(q)||(v.address||'').toLowerCase().includes(q));
  _vmtMarkers.forEach(m=>_vmtMap.removeLayer(m));_vmtMarkers=[];
  const bounds=[];
  rows.forEach(v=>{
    const lat=parseFloat(v.lat),lng=parseFloat(v.lng);
    if(isNaN(lat)||isNaN(lng)) return;
    const color=_VMT_COLORS[v.area]||'#475569';
    const name=v.sheet_name||v.tg_name||'?';
    const daysAgo=v.last_harvest_date?Math.floor((Date.now()-new Date(v.last_harvest_date))/86400000):null;
    const daysColor=daysAgo===null?'#9ca3af':daysAgo>60?'#dc2626':daysAgo>30?'#d97706':'#15803d';
    const icon=L.divIcon({className:'',html:`<div style="text-align:center;"><div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);margin:0 auto;"></div><div style="background:${color};color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:6px;white-space:nowrap;margin-top:2px;display:inline-block;">${name}</div></div>`,iconAnchor:[6,6]});
    const popup=`<div style="font-size:12px;min-width:180px;"><div style="font-weight:700;font-size:13px;margin-bottom:4px;">${name}</div><div style="margin-bottom:2px;">📍 <a href="https://maps.google.com/?q=${lat},${lng}" target="_blank" style="color:#1565c0;">Open in Google Maps</a></div>${v.address?`<div style="color:#6b7280;font-size:11px;">🏠 ${v.address}</div>`:''}<div style="margin-top:4px;"><span style="background:${color};color:#fff;padding:1px 6px;border-radius:6px;font-size:11px;">${v.area||'—'}</span>${v.vlan?`<span style="background:#311A8E;color:#fff;padding:1px 6px;border-radius:6px;font-size:11px;margin-left:4px;">VLAN ${v.vlan}</span>`:''}${v.vendo_code?`<span style="background:#028867;color:#fff;padding:1px 6px;border-radius:6px;font-size:11px;margin-left:4px;">${v.vendo_code}</span>`:''}</div><div style="font-size:11px;margin-top:3px;color:${daysColor};">Last harvest: ${v.last_harvest_date||'—'}${daysAgo!==null?' ('+daysAgo+'d ago)':''}</div></div>`;
    const m=L.marker([lat,lng],{icon}).addTo(_vmtMap);
    m.bindPopup(popup);_vmtMarkers.push(m);bounds.push([lat,lng]);
  });
  const cnt=document.getElementById('vmap-top-count');
  if(cnt)cnt.textContent=`${_vmtMarkers.length} of ${_vmtRows.length} vendos with GPS`;
  if(bounds.length===1)_vmtMap.setView(bounds[0],16);
  else if(bounds.length>1)_vmtMap.fitBounds(bounds,{padding:[20,20],maxZoom:13});
}
setInterval(()=>{if(document.getElementById('panel-vmap-top')?.classList.contains('active'))vmTopLoad();},60000);

// Config — var (not const) so shared.js can also declare without conflict
var SB_URL = "https://cviraqfhphhsonjmrtvu.supabase.co";
var SB_KEY = "gw";

// ── COLLECTOR PHOTOS (bucket: collector-photos) ──
window._collectorPhotos = {};  // name(lowercase) -> photo_url
async function loadCollectorPhotos(){
  try{
    const r = await fetch(`${SB_URL}/rest/v1/collectors?select=name,photo_url`, {headers: HDR});
    const rows = await r.json();
    if(Array.isArray(rows)){
      rows.forEach(c=>{ if(c.name) window._collectorPhotos[c.name.toLowerCase()] = c.photo_url||null; });
    }
  }catch(e){}
}

// Returns an avatar HTML snippet (thumbnail). Click → upload if empty, fullview if set.
function collectorAvatar(name, size){
  size = size || 32;
  if(!window._collectorPhotos) return '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:#e0e7ff;flex-shrink:0;display:inline-block;"></div>';
  const url = window._collectorPhotos[(name||'').toLowerCase()];
  const initials = (name||'?').trim().slice(0,1).toUpperCase();
  const safeName = JSON.stringify(name||'');
  if(url){
    return `<img src="${url}" onclick="event.stopPropagation();collectorPhotoFullview(${safeName})"
      style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;cursor:pointer;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.2);flex-shrink:0;" title="View photo">`;
  }
  // Placeholder with initials — click to upload
  return `<div onclick="event.stopPropagation();collectorPhotoUpload(${safeName})"
    style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#cbd5e1,#94a3b8);color:#fff;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.45)}px;font-weight:700;cursor:pointer;flex-shrink:0;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.15);" title="Add photo">${initials}</div>`;
}

function collectorPhotoFullview(name){
  const url = window._collectorPhotos[(name||'').toLowerCase()];
  if(!url){ collectorPhotoUpload(name); return; }
  let ov = document.getElementById('col-photo-lightbox');
  if(ov) ov.remove();
  ov = document.createElement('div');
  ov.id = 'col-photo-lightbox';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
  ov.onclick = e => { if(e.target===ov) ov.remove(); };
  ov.innerHTML = `
    <img src="${url}" style="max-width:90vw;max-height:75vh;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5);">
    <div style="color:#fff;font-size:16px;font-weight:700;">👤 ${name}</div>
    <div style="display:flex;gap:10px;">
      <button onclick="collectorPhotoUpload(${JSON.stringify(name)})" style="padding:8px 16px;background:#1565c0;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">📷 Change Photo</button>
      <button onclick="document.getElementById('col-photo-lightbox').remove()" style="padding:8px 16px;background:rgba(255,255,255,.2);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Close</button>
    </div>`;
  document.body.appendChild(ov);
}

function collectorPhotoUpload(name){
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.onchange = async () => {
    const file = inp.files[0];
    if(!file) return;
    const pw = await askAdminPw('Enter admin password to set '+name+"'s photo.");
    if(pw===null)return; if(pw!=='101510'){ markAdminPwWrong(); toast('Wrong password'); return; }
    toast('Compressing & uploading…');
    try{
      const blob = await compressImage(file, 400, 0.8); // 400px max, 80% quality
      const path = (name||'unknown').toLowerCase().replace(/[^a-z0-9]/g,'_') + '.jpg';
      // Upload (upsert) to bucket
      const up = await fetch(`${SB_URL}/storage/v1/object/collector-photos/${path}`, {
        method:'POST',
        headers:{ apikey:SB_KEY, Authorization:'Bearer '+SB_KEY, 'Content-Type':'image/jpeg', 'x-upsert':'true' },
        body: blob
      });
      if(!up.ok){ const t=await up.text(); toast('Upload failed: '+t.slice(0,60)); return; }
      const publicUrl = `${SB_URL}/storage/v1/object/public/collector-photos/${path}?t=${Date.now()}`;
      // Save url to collectors table
      await fetch(`${SB_URL}/rest/v1/collectors?name=eq.${encodeURIComponent(name)}`, {
        method:'PATCH',
        headers:{ apikey:SB_KEY, Authorization:'Bearer '+SB_KEY, 'Content-Type':'application/json', Prefer:'return=minimal' },
        body: JSON.stringify({ photo_url: publicUrl })
      });
      window._collectorPhotos[(name||'').toLowerCase()] = publicUrl;
      toast('✅ Photo saved!');
      document.getElementById('col-photo-lightbox')?.remove();
      // Refresh visible views
      if(typeof loadTodaySummary==='function') loadTodaySummary(true);
      if(_colMode==='date' && typeof colLoad==='function') colLoad();
      if(_colMode==='all' && typeof colLoadAll==='function') colLoadAll();
    }catch(e){ toast('Error: '+e.message); }
  };
  inp.click();
}

// Compress image client-side → small JPEG blob (keeps storage tiny)
function compressImage(file, maxSize, quality){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      let {width, height} = img;
      if(width>height){ if(width>maxSize){ height=Math.round(height*maxSize/width); width=maxSize; } }
      else { if(height>maxSize){ width=Math.round(width*maxSize/height); height=maxSize; } }
      const canvas = document.createElement('canvas');
      canvas.width=width; canvas.height=height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img,0,0,width,height);
      canvas.toBlob(b=> b?resolve(b):reject(new Error('compress failed')), 'image/jpeg', quality);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── GPS TRACING ──
let _gpsAllVendos = [];
let _gpsMap = null;
let _gpsMarkers = {};
function _gpsAgeDays(updatedAt){
  if(!updatedAt) return null;
  return Math.floor((Date.now() - new Date(updatedAt).getTime())/86400000);
}
function _gpsStatus(v){
  if(v.lat==null||v.lng==null) return 'missing';
  const age=_gpsAgeDays(v.gps_updated_at);
  if(age==null) return 'old';
  if(age<30) return 'fresh';
  if(age<90) return 'aging';
  return 'old';
}
function _gpsColor(status){
  return status==='fresh'?'#16a34a':status==='aging'?'#d97706':status==='missing'?'#9ca3af':'#dc2626';
}

async function gpsTraceLoad(){
  const listEl=document.getElementById('gps-list');
  if(!listEl) return;
  listEl.innerHTML='<div style="text-align:center;padding:40px;color:#6b7280;font-size:13px;">⏳ Loading vendos…</div>';
  try{
    const rows = await sbAll('vendos', 'select=id,sheet_name,tg_name,owner_name,area,address,lat,lng,gps,gps_updated_at,photo_url,status&status=eq.active&order=area.asc');
    _gpsAllVendos = Array.isArray(rows)?rows:[];

    // Summary
    const total=_gpsAllVendos.length;
    const hasGps=_gpsAllVendos.filter(v=>v.lat!=null&&v.lng!=null).length;
    const missing=total-hasGps;
    const old=_gpsAllVendos.filter(v=>_gpsStatus(v)==='old'&&v.lat!=null).length;
    const fresh=_gpsAllVendos.filter(v=>_gpsStatus(v)==='fresh').length;
    const pct=total>0?Math.round(hasGps/total*100):0;
    document.getElementById('gps-summary').innerHTML=`
      <div class="stat" style="border-bottom-color:#16a34a"><div class="sl">GPS Coverage</div><div class="sv" style="color:#16a34a">${pct}%</div></div>
      <div class="stat"><div class="sl">Has GPS</div><div class="sv">${hasGps}</div></div>
      <div class="stat" style="border-bottom-color:#dc2626"><div class="sl">Missing GPS</div><div class="sv" style="color:#dc2626">${missing}</div></div>
      <div class="stat" style="border-bottom-color:#d97706"><div class="sl">Old / Recheck</div><div class="sv" style="color:#d97706">${old}</div></div>`;

    gpsInitMap();
    gpsTraceFilter();
  }catch(e){
    listEl.innerHTML='<div style="color:#dc2626;text-align:center;padding:40px 0;">Error: '+e.message+'</div>';
  }
}

function gpsInitMap(){
  if(!window.L) return;
  setTimeout(()=>{
    const mapEl=document.getElementById('gps-map');
    if(!mapEl) return;
    if(_gpsMap){ _gpsMap.remove(); _gpsMap=null; }
    _gpsMap=L.map('gps-map').setView([8.55,123.34],10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(_gpsMap);
    _gpsMarkers={};
    const bounds=[];
    _gpsAllVendos.forEach(v=>{
      if(v.lat==null||v.lng==null) return;
      const lat=parseFloat(v.lat),lng=parseFloat(v.lng);
      if(isNaN(lat)||isNaN(lng)) return;
      const st=_gpsStatus(v);
      const color=_gpsColor(st);
      const name=v.sheet_name||v.tg_name||'?';
      const age=_gpsAgeDays(v.gps_updated_at);
      const icon=L.divIcon({className:'',html:`<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);"></div>`,iconSize:[12,12],iconAnchor:[6,6]});
      const m=L.marker([lat,lng],{icon}).addTo(_gpsMap).bindPopup(`<b>${name}</b><br>${v.area||''}<br>${age!=null?age+'d ago':'unknown date'}<br><button onclick="gpsOpenEditor(${v.id})" style="margin-top:4px;padding:3px 10px;background:#16a34a;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;">✏️ Update</button>`);
      _gpsMarkers[v.id]=m;
      bounds.push([lat,lng]);
    });
    const cnt=document.getElementById('gps-map-count');
    if(cnt) cnt.textContent=bounds.length+' pins';
    if(bounds.length>1)_gpsMap.fitBounds(bounds,{padding:[30,30],maxZoom:13});
    else if(bounds.length===1)_gpsMap.setView(bounds[0],14);
  },200);
}

function gpsTraceFilter(){
  const q=(document.getElementById('gps-search')?.value||'').toLowerCase().trim();
  const area=document.getElementById('gps-area')?.value||'';
  const status=document.getElementById('gps-status')?.value||'';
  const sort=document.getElementById('gps-sort')?.value||'oldest';

  let rows=_gpsAllVendos.filter(v=>{
    if(area&&v.area!==area) return false;
    const st=_gpsStatus(v);
    if(status==='nophoto'){ if(v.photo_url) return false; }
    else if(status&&st!==status) return false;
    if(q){
      const hay=((v.sheet_name||'')+(v.tg_name||'')+(v.owner_name||'')+(v.address||'')).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });

  rows.sort((a,b)=>{
    if(sort==='name') return (a.sheet_name||a.tg_name||'').localeCompare(b.sheet_name||b.tg_name||'');
    const aa=a.gps_updated_at?new Date(a.gps_updated_at).getTime():0;
    const bb=b.gps_updated_at?new Date(b.gps_updated_at).getTime():0;
    // missing GPS (0) should sort to top for 'oldest'
    return sort==='newest'?bb-aa:aa-bb;
  });

  document.getElementById('gps-count').textContent=rows.length+' vendos';
  gpsTraceRender(rows);
}

function gpsTraceRender(rows){
  const el=document.getElementById('gps-list');
  if(!rows.length){ el.innerHTML='<div style="color:#9ca3af;text-align:center;padding:40px 0;">No vendos match</div>'; return; }
  el.innerHTML=rows.slice(0,500).map(v=>{
    const st=_gpsStatus(v);
    const color=_gpsColor(st);
    const age=_gpsAgeDays(v.gps_updated_at);
    const name=v.sheet_name||v.tg_name||'—';
    const statusLabel=st==='missing'?'❌ No GPS':st==='fresh'?'🟢 '+age+'d':st==='aging'?'🟡 '+age+'d':(age!=null?'🔴 '+age+'d':'🔴 unknown');
    const photoThumb=v.photo_url
      ? `<img src="${v.photo_url}" onclick="event.stopPropagation();collectorPhotoFullviewUrl('${v.photo_url}','${(name||'').replace(/'/g,'')}')" style="width:38px;height:38px;border-radius:8px;object-fit:cover;cursor:pointer;flex-shrink:0;border:1px solid #e5e7eb;">`
      : `<div style="width:38px;height:38px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">📷</div>`;
    return `<div onclick="gpsOpenEditor(${v.id})" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:6px;cursor:pointer;background:#fff;" onmouseover="this.style.background='#f0fdf4'" onmouseout="this.style.background='#fff'">
      ${photoThumb}
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
        <div style="font-size:10px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${v.area||'—'} · ${v.address||'no address'}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:11px;font-weight:700;color:${color};">${statusLabel}</div>
        <div style="font-size:9px;color:#9ca3af;">${v.lat!=null?Number(v.lat).toFixed(4)+', '+Number(v.lng).toFixed(4):'—'}</div>
      </div>
    </div>`;
  }).join('') + (rows.length>500?`<div style="text-align:center;color:#9ca3af;font-size:11px;padding:8px;">Showing 500 of ${rows.length}</div>`:'');
}

function collectorPhotoFullviewUrl(url,name){
  let ov=document.getElementById('col-photo-lightbox'); if(ov)ov.remove();
  ov=document.createElement('div'); ov.id='col-photo-lightbox';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
  ov.onclick=e=>{if(e.target===ov)ov.remove();};
  ov.innerHTML=`<img src="${url}" style="max-width:90vw;max-height:80vh;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5);"><div style="color:#fff;font-size:15px;font-weight:700;">${name||''}</div><button onclick="document.getElementById('col-photo-lightbox').remove()" style="padding:8px 16px;background:rgba(255,255,255,.2);color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;">Close</button>`;
  document.body.appendChild(ov);
}

// GPS + Photo editor modal
function gpsOpenEditor(vendoId){
  const v=_gpsAllVendos.find(x=>x.id===vendoId);
  if(!v) return;
  const name=v.sheet_name||v.tg_name||'—';
  let ov=document.getElementById('gps-editor'); if(ov)ov.remove();
  ov=document.createElement('div'); ov.id='gps-editor';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
  ov.onclick=e=>{if(e.target===ov)ov.remove();};
  const age=_gpsAgeDays(v.gps_updated_at);
  ov.innerHTML=`
  <div style="background:#fff;border-radius:14px;width:100%;max-width:460px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">
    <div style="background:linear-gradient(135deg,#15803d,#16a34a);color:#fff;padding:14px 18px;border-radius:14px 14px 0 0;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:15px;font-weight:700;">📍 ${name}</div>
        <div style="font-size:11px;opacity:.85;">${v.area||''} ${age!=null?'· GPS '+age+'d old':'· GPS never set'}</div>
      </div>
      <button onclick="document.getElementById('gps-editor').remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:18px;width:30px;height:30px;border-radius:50%;cursor:pointer;line-height:1;">✕</button>
    </div>
    <div style="padding:16px;">
      <!-- Photo -->
      <div style="text-align:center;margin-bottom:16px;">
        ${v.photo_url
          ? `<img src="${v.photo_url}" onclick="collectorPhotoFullviewUrl('${v.photo_url}','${(name||'').replace(/'/g,'')}')" style="width:120px;height:120px;border-radius:12px;object-fit:cover;cursor:pointer;border:2px solid #e5e7eb;">`
          : `<div style="width:120px;height:120px;border-radius:12px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:40px;margin:0 auto;">📷</div>`}
        <div style="margin-top:8px;">
          <button onclick="gpsUploadPhoto(${v.id})" style="padding:7px 14px;background:#1565c0;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;">📷 ${v.photo_url?'Change':'Add'} Photo</button>
        </div>
      </div>
      <!-- GPS input -->
      <label style="font-size:11px;color:#6b7280;font-weight:600;">GPS Coordinates (lat, lng)</label>
      <input id="gps-edit-coords" value="${v.lat!=null?v.lat+', '+v.lng:''}" placeholder="8.59709, 123.35454"
        style="width:100%;height:38px;padding:0 10px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;margin-top:4px;margin-bottom:6px;box-sizing:border-box;font-family:monospace;">
      <div style="font-size:10px;color:#9ca3af;margin-bottom:12px;">💡 Tip: paste from the Conota camera photo overlay, or from Google Maps</div>
      <button onclick="gpsSaveCoords(${v.id})" style="width:100%;height:40px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">💾 Save GPS</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function gpsSaveCoords(vendoId){
  const raw=(document.getElementById('gps-edit-coords')?.value||'').trim();
  if(!raw){ toast('Enter coordinates'); return; }
  const m=raw.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
  if(!m){ toast('Invalid format. Use: lat, lng'); return; }
  const lat=parseFloat(m[1]), lng=parseFloat(m[2]);
  if(isNaN(lat)||isNaN(lng)||lat<4||lat>22||lng<115||lng<0){ if(lat<4||lat>22||lng<115||lng>128){ toast('Coordinates outside Philippines — double check'); } }
  const pw=await askAdminPw('Enter admin password to confirm.'); if(pw===null)return; if(pw!=='101510'){ markAdminPwWrong(); toast('Wrong password'); return; }
  try{
    const r=await fetch(`${SB_URL}/rest/v1/vendos?id=eq.${vendoId}`,{method:'PATCH',
      headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({lat,lng,gps:lat+', '+lng})});
    if(r.ok){
      toast('✅ GPS saved!');
      const v=_gpsAllVendos.find(x=>x.id===vendoId);
      if(v){ v.lat=lat; v.lng=lng; v.gps=lat+', '+lng; v.gps_updated_at=new Date().toISOString(); }
      document.getElementById('gps-editor')?.remove();
      gpsInitMap(); gpsTraceFilter();
    } else { const t=await r.text(); toast('Save failed: '+t.slice(0,60)); }
  }catch(e){ toast('Error: '+e.message); }
}

function gpsUploadPhoto(vendoId){
  const v=_gpsAllVendos.find(x=>x.id===vendoId);
  if(!v) return;
  const inp=document.createElement('input');
  inp.type='file'; inp.accept='image/*';
  inp.onchange=async()=>{
    const file=inp.files[0]; if(!file) return;
    const pw=await askAdminPw('Enter admin password to confirm.'); if(pw===null)return; if(pw!=='101510'){ markAdminPwWrong(); toast('Wrong password'); return; }
    // Try to read GPS from photo EXIF BEFORE compression (compression strips EXIF)
    try{
      const gps=await readExifGps(file);
      if(gps){
        const inpEl=document.getElementById('gps-edit-coords');
        if(inpEl){ inpEl.value=gps.lat.toFixed(6)+', '+gps.lng.toFixed(6); inpEl.style.background='#dcfce7'; }
        toast('📍 GPS found in photo: '+gps.lat.toFixed(5)+', '+gps.lng.toFixed(5));
      }
    }catch(e){ /* no EXIF GPS — silent */ }
    toast('Compressing & uploading…');
    try{
      const blob=await compressImage(file,600,0.82);
      const path='vendo-profiles/vendo_'+vendoId+'.jpg';
      const up=await fetch(`${SB_URL}/storage/v1/object/harvest-photos/${path}`,{
        method:'POST',
        headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'image/jpeg','x-upsert':'true'},
        body:blob});
      if(!up.ok){ const t=await up.text(); toast('Upload failed: '+t.slice(0,60)); return; }
      const publicUrl=`${SB_URL}/storage/v1/object/public/harvest-photos/${path}?t=${Date.now()}`;
      await fetch(`${SB_URL}/rest/v1/vendos?id=eq.${vendoId}`,{method:'PATCH',
        headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify({photo_url:publicUrl})});
      if(v) v.photo_url=publicUrl;
      toast('✅ Photo saved!');
      // Re-open editor but preserve any GPS we just auto-filled
      const filled=document.getElementById('gps-edit-coords')?.value||'';
      gpsOpenEditor(vendoId);
      if(filled){ const el=document.getElementById('gps-edit-coords'); if(el&&!el.value){ el.value=filled; el.style.background='#dcfce7'; } }
      gpsTraceFilter();
    }catch(e){ toast('Error: '+e.message); }
  };
  inp.click();
}

// Read GPS coordinates from a JPEG file's EXIF data (no external library)
function readExifGps(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=function(e){
      try{
        const view=new DataView(e.target.result);
        if(view.getUint16(0,false)!==0xFFD8){ return reject('not jpeg'); }
        let offset=2; const len=view.byteLength;
        while(offset<len){
          const marker=view.getUint16(offset,false); offset+=2;
          if(marker===0xFFE1){ // APP1 (EXIF)
            const exifStart=offset+2;
            if(view.getUint32(exifStart,false)!==0x45786966){ return reject('no exif'); }
            const tiff=exifStart+6;
            const little=view.getUint16(tiff,false)===0x4949;
            const firstIFD=view.getUint32(tiff+4,little);
            // walk IFD0 to find GPS IFD pointer (0x8825)
            let dir=tiff+firstIFD;
            const entries=view.getUint16(dir,little); dir+=2;
            let gpsIFD=0;
            for(let i=0;i<entries;i++){
              const entry=dir+i*12;
              if(view.getUint16(entry,little)===0x8825){ gpsIFD=tiff+view.getUint32(entry+8,little); break; }
            }
            if(!gpsIFD){ return reject('no gps ifd'); }
            // parse GPS IFD
            const gEntries=view.getUint16(gpsIFD,little); let gdir=gpsIFD+2;
            let latRef='N',lngRef='E',lat=null,lng=null;
            const readRationals=(off,count)=>{ const arr=[]; for(let k=0;k<count;k++){ const num=view.getUint32(off+k*8,little); const den=view.getUint32(off+k*8+4,little); arr.push(den?num/den:0); } return arr; };
            for(let i=0;i<gEntries;i++){
              const entry=gdir+i*12;
              const tag=view.getUint16(entry,little);
              const valOff=tiff+view.getUint32(entry+8,little);
              if(tag===1){ latRef=String.fromCharCode(view.getUint8(entry+8)); }
              else if(tag===2){ const d=readRationals(valOff,3); lat=d[0]+d[1]/60+d[2]/3600; }
              else if(tag===3){ lngRef=String.fromCharCode(view.getUint8(entry+8)); }
              else if(tag===4){ const d=readRationals(valOff,3); lng=d[0]+d[1]/60+d[2]/3600; }
            }
            if(lat==null||lng==null){ return reject('no coords'); }
            if(latRef==='S') lat=-lat;
            if(lngRef==='W') lng=-lng;
            return resolve({lat,lng});
          } else if((marker&0xFF00)!==0xFF00){ break; }
          else { offset+=view.getUint16(offset,false); }
        }
        reject('no exif found');
      }catch(err){ reject(err); }
    };
    reader.onerror=()=>reject('read error');
    reader.readAsArrayBuffer(file.slice(0,128*1024)); // EXIF is in first chunk
  });
}

// ── INLINED FROM js/api.js ──
// ── SPAWN INTERNET — API LAYER + CACHE ───────────────────────────
// Storage bucket → edge function only. NO direct DB fallback.
// DB is reserved for: bot writes, live feed, history, reconciliation.

const EDGE_URL = `${SB_URL}/functions/v1/dashboard-summary`;
const STORAGE_CACHE_URL = 'https://cviraqfhphhsonjmrtvu.supabase.co/storage/v1/object/public/dashboard-cache/summary.json';
const CACHE_MAX_AGE_MS = 35 * 60 * 1000; // 35 min — matches 30-min cron + buffer

// TTLs
const TTL_MAIN   = 30 * 60 * 1000; // 30 min — overview stats (from storage)
const TTL_VENDOS = 24 * 60 * 60 * 1000; // 24hr — vendo list
const TTL_HARVEST = 5 * 60 * 1000;  // 5 min — harvest summary
const TTL_RECENT  = 30 * 1000;       // 30 sec — live feed

// Memory cache (cleared on page close)
const _mem = {};

// ── localStorage helpers ──────────────────────────────────────────
function lsSet(key, data) {
  try {
    localStorage.setItem('spawn_' + key, JSON.stringify({ ts: Date.now(), data }));
  } catch(e) {}
}

function lsGet(key, ttl) {
  try {
    const raw = localStorage.getItem('spawn_' + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > ttl) return null;
    // Extra check: if data has generated_at older than 2 days, discard
    if (data && data.generated_at) {
      const age = Date.now() - new Date(data.generated_at).getTime();
      if (age > 2 * 24 * 60 * 60 * 1000) { localStorage.removeItem('spawn_' + key); return null; }
    }
    // Discard if missing all_vendos (old cache format)
    if (key === 'main' && data && !data.all_vendos) { localStorage.removeItem('spawn_main'); return null; }
    return data;
  } catch(e) { return null; }
}

function lsClear() {
  Object.keys(localStorage).filter(k => k.startsWith('spawn_')).forEach(k => localStorage.removeItem(k));
  Object.keys(_mem).forEach(k => delete _mem[k]);
  toast('Cache cleared — reloading...');
  setTimeout(() => loadDashboard(), 500);
}

// ── Cache age display ─────────────────────────────────────────────
function cacheAge() {
  const ts = _mem._ts || 0;
  if (!ts) return null;
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec/60)}m ago`;
  return `${Math.round(sec/3600)}h ago`;
}

function updateCacheIndicator() {
  const el = document.getElementById('cache-age');
  if (!el) return;
  const age = cacheAge();
  el.textContent = age ? `Updated ${age}` : '';
  el.style.display = age ? '' : 'none';
}

// ── Main API load ─────────────────────────────────────────────────
let _fetching = false;
let _fetchCallbacks = [];

async function apiLoad(force = false) {
  // 1. Memory cache — instant (same session)
  if (!force && _mem._data && (Date.now() - _mem._ts < TTL_MAIN)) {
    updateCacheIndicator();
    return _mem._data;
  }

  // 2. localStorage cache — survives page reload (30 min TTL)
  if (!force) {
    const cached = lsGet('main', TTL_MAIN);
    if (cached) {
      _mem._data = cached;
      _mem._ts = Date.now();
      updateCacheIndicator();
      // Refresh from storage in background silently
      setTimeout(() => apiLoad(true), 200);
      return cached;
    }
  }

  // 3. Deduplicate concurrent fetches
  if (_fetching) return new Promise(resolve => _fetchCallbacks.push(resolve));
  _fetching = true;

  const data = await _fetchFresh();

  if (data) {
    _mem._data = data;
    _mem._ts = Date.now();
    lsSet('main', data);
    updateCacheIndicator();
    if (typeof hideConnError === 'function') hideConnError();
  }

  _fetching = false;
  _fetchCallbacks.forEach(cb => cb(data));
  _fetchCallbacks = [];
  return data;
}

// ── Fetch: Storage bucket first, edge function fallback ───────────
// NEVER hits DB directly — DB is for bot writes only
async function _fetchFresh() {
  // 1. Storage bucket — pre-built every 30 min by cron, zero DB load
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(STORAGE_CACHE_URL + '?t=' + Math.floor(Date.now()/60000), { signal: ctrl.signal });
    clearTimeout(tid);
    if (r.ok) {
      const data = await r.json();
      const age = Date.now() - new Date(data.generated_at || 0).getTime();
      if (age < CACHE_MAX_AGE_MS) {
        data._source = 'storage';
        data._age_min = Math.round(age / 60000);
        // Normalize field names
        if (!data.stats) {
          data.stats = {
            total_vendos: data.active_vendos || data.total_vendos || 0,
            total_txns: data.total_transactions || 0,
            total_sales: data.total_sales || 0,
            today_sales: data.today_sales || 0,
            today_txns: data.today_txns || 0,
            suspicious_count: data.suspicious_count || 0,
          };
        }
        if (!data.areas && data.area_cards) data.areas = data.area_cards;
        if (!data.trend && data.trend_data) data.trend = data.trend_data;
        // Sanity check — if all zeros, data is bad, try edge
        // Patch total_vendos if missing
        if (data.stats && !data.stats.total_vendos && data.active_vendos) data.stats.total_vendos = data.active_vendos;
        const s = data.stats || {};
        if (!s.total_txns && !s.total_sales && !s.total_vendos) {
          console.warn('[API] Storage has zero stats — data bad, trying edge...');
        } else {
          console.log('[API] Storage hit, age:', data._age_min + 'min');
          return data;
        }
      }
      console.log('[API] Storage stale (' + Math.round(age/60000) + 'min), trying edge...');
    }
  } catch(e) {
    console.warn('[API] Storage fetch failed:', e.message);
  }

  // 2. Edge function — has its own 5-min memory cache, reads Storage internally
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(EDGE_URL, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      signal: ctrl.signal
    });
    clearTimeout(tid);
    if (r.ok) {
      const data = await r.json();
      data._source = 'edge';
      console.log('[API] Edge function hit');
      return data;
    }
  } catch(e) {
    console.warn('[API] Edge function failed:', e.message);
  }

  // 3. Return stale localStorage if available (better than nothing)
  try {
    const raw = localStorage.getItem('spawn_main');
    if (raw) {
      const { data } = JSON.parse(raw);
      if (data) {
        data._source = 'stale_cache';
        console.warn('[API] Serving stale localStorage cache — DB not queried');
        return data;
      }
    }
  } catch(e) {}

  // 4. Nothing available — return null, show empty state
  console.error('[API] All sources failed — no data available');
  return null;
}

// ── Per-tab cached fetchers ───────────────────────────────────────
// Vendos list — 24hr cache
async function apiGetVendos(area, force = false) {
  const key = 'vendos_' + (area || 'all');
  if (!force) {
    const mem = _mem[key];
    if (mem && Date.now() - mem.ts < TTL_VENDOS) return mem.data;
    const ls = lsGet(key, TTL_VENDOS);
    if (ls) { _mem[key] = { ts: Date.now(), data: ls }; return ls; }
  }
  const params = area ? `area=eq.${encodeURIComponent(area)}&order=sheet_name.asc` : 'order=sheet_name.asc';
  const data = await sbAll('vendos', `${params}&select=id,sheet_name,tg_name,vlan,area,lat,lng,last_harvest_date,address,contact_number`);
  _mem[key] = { ts: Date.now(), data };
  lsSet(key, data);
  return data;
}

// Recent transactions — 30 sec cache
async function apiGetRecent(force = false) {
  const key = 'recent';
  if (!force) {
    const mem = _mem[key];
    if (mem && Date.now() - mem.ts < TTL_RECENT) return mem.data;
  }
  const today = todayPHT();
  const data = await sb('transactions', `date=eq.${today}&is_skipped=eq.false&order=created_at.desc`, 30);
  _mem[key] = { ts: Date.now(), data };
  return data;
}

// Harvest items for a specific group — 5 min cache
async function apiGetHarvestItems(groupId, force = false) {
  const key = 'hgi_' + groupId;
  if (!force) {
    const mem = _mem[key];
    if (mem && Date.now() - mem.ts < TTL_HARVEST) return mem.data;
  }
  const data = await sb('harvest_group_items',
    `group_run_id=eq.${groupId}&select=id,vendo_id,sheet_name,tg_name,vlan,area,status,coins_total,net_collectible,last_harvest_date,harvested_at&order=id.asc`,
    2000);
  _mem[key] = { ts: Date.now(), data };
  return data;
}

// ── Invalidate cache ──────────────────────────────────────────────
function apiInvalidate(key) {
  if (key) {
    delete _mem[key];
    localStorage.removeItem('spawn_' + key);
  } else {
    delete _mem._data;
    delete _mem._ts;
    localStorage.removeItem('spawn_main');
  }
}

// ── Auto-refresh every 30 min (matches cron) ──────────────────────
setInterval(async () => {
  if (document.hidden) return;
  apiInvalidate();
  const data = await apiLoad(true);
  if (data && typeof overviewRender === 'function') overviewRender(data);
  updateCacheIndicator();
}, TTL_MAIN);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && _mem._ts && Date.now() - _mem._ts > TTL_MAIN) {
    apiLoad(true).then(data => {
      if (data && typeof overviewRender === 'function') overviewRender(data);
    });
  }
});

// ── END api.js ──

var HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

let currentYear   = "2026";
let allVendos     = [];
let filteredVendos= [];
let suspMap       = {};
let vPage_n       = 1;
let vtPage_n      = 1;
let hPage_n       = 1;
let currentVendo  = "";
let vtxnAll       = [];
let harvestAll    = [];
let hackedAll     = [];
let filteredHacked= [];
let navStack      = [];
let vendoAnalyticsChart = null;
let vendoChart    = null;
let skippedAll    = [];
let skPage_n      = 1;
let skippedVendos = [];
let skCurrentVendo= "";
let skTxnAll      = [];
let skTxPage_n    = 1;
let hkTxnAll      = [];
let hkTxPage_n    = 1;
let hkCurrentVendo= "";
let lastTxnTime   = null;
let trendChart    = null;
let areaChart     = null;
let monthlyChart  = null;
let analyticsAreaChart = null;

// ── Supabase ──────────────────────────────────────────────
let sbOffline = false;
let sbFailCount = 0;

async function sb(table, params="", limit=1000) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?${params}&limit=${limit}`, {
      headers: {...HDR, 'Statement-Timeout': '0'},
      signal: AbortSignal.timeout(12000)
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`HTTP ${r.status}: ${err.slice(0,200)}`);
    }
    sbOffline = false;
    sbFailCount = 0;
    if (typeof updateCacheIndicator === 'function') updateCacheIndicator();
    return r.json();
  } catch(e) {
    sbFailCount++;
    // Banner only for true offline — dashboard uses Storage so sb() failures are non-critical
    if (!sbOffline && !navigator.onLine) {
      sbOffline = true;
      showConnError('No internet connection');
    }
    return [];
  }
}

async function sbAll(table, params="") {
  let all=[], offset=0;
  while(true) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${table}?${params}&limit=1000&offset=${offset}`, {
        headers: HDR,
        signal: AbortSignal.timeout(10000)
      });
      if (!r.ok) { const err = await r.text(); throw new Error(`HTTP ${r.status}: ${err.slice(0,200)}`); }
      const rows = await r.json();
      sbOffline = false;
      if (!rows?.length) break;
      all.push(...rows);
      if (rows.length < 1000) break;
      offset += 1000;
    } catch(e) {
      if (!sbOffline) { sbOffline = true; showConnError(e.message); }
      break;
    }
  }
  return all;
}

function hideConnError() {
  const el = document.getElementById("conn-error-banner");
  if (el) el.remove();
  sbOffline = false;
  sbFailCount = 0;
}

// Only call this when GENUINELY offline or Supabase is truly down
// Never call on slow first load — use sbFailCount guard
function showConnError(msg) {
  let el = document.getElementById("conn-error-banner");
  if (!el) {
    el = document.createElement("div");
    el.id = "conn-error-banner";
    el.style.cssText = "position:fixed;top:52px;left:0;right:0;background:#dc2626;color:white;padding:8px 16px;font-size:12px;font-weight:600;z-index:999;display:flex;justify-content:space-between;align-items:center;";
    document.body.appendChild(el);
  }
  el.innerHTML = `⚠️ Cannot reach Supabase — check your internet connection or Supabase status. <span style="opacity:.7;font-weight:400">${msg}</span>
    <button onclick="document.getElementById('conn-error-banner').remove();sbOffline=false;loadDashboard();" style="padding:3px 10px;background:white;color:#dc2626;border:none;border-radius:4px;cursor:pointer;font-weight:700;margin-left:12px;">Retry</button>`;
}

async function testConnection() {
  // Condition 1: Browser says offline — show immediately
  if (!navigator.onLine) {
    showConnError('No internet connection');
    return;
  }
  // If data loaded fine — no need to test
  if (sbFailCount === 0 && !sbOffline) return;

  // Ping Supabase with a tiny query
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${SB_URL}/rest/v1/summary_totals?select=id&limit=1`, {
      headers: HDR, signal: ctrl.signal
    });
    clearTimeout(tid);
    if (r.ok) {
      // Supabase is back — hide banner and reload
      hideConnError();
      if (sbOffline) loadDashboard();
    } else if (r.status >= 500) {
      // Condition 3: Supabase server error
      showConnError('Supabase server error — retrying');
    }
    // 4xx — auth/config issue, don't spam banner
  } catch(e) {
    if (!navigator.onLine) {
      // Condition 1: went offline during test
      showConnError('No internet connection');
    } else if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      // Condition 2: Supabase not responding
      showConnError('Cannot connect to Supabase — server not responding');
    }
  }
}

// ── Helpers ───────────────────────────────────────────────
const fmt = n => "₱" + Math.round(Number(n||0)).toLocaleString();
const esc = s => (s||"").replace(/'/g,"\\'").replace(/"/g,"&quot;");
function yf(y) {
  if (!y || y==="all") return "";
  if (y==="2025-2026") return "date=gte.2025-01-01";
  return `date=gte.${y}-01-01&date=lte.${y}-12-31`;
}

// ── Clock + Date ──────────────────────────────────────────
const _DAYS=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const _MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
function _tickClock(){
  const n=new Date();
  const h=n.getHours(),m=n.getMinutes(),s=n.getSeconds();
  const ap=h>=12?'PM':'AM';
  const hh=((h%12)||12).toString().padStart(2,'0');
  const el=document.getElementById('dt-clk');
  if(el)el.textContent=`${hh}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')} ${ap}`;
  const dd=document.getElementById('dt-day');
  if(dd)dd.textContent=_DAYS[n.getDay()];
  const dt=document.getElementById('dt-date');
  if(dt)dt.textContent=`${_MONTHS[n.getMonth()]} ${n.getDate()}, ${n.getFullYear()}`;
  // Also update top-status time
  const ts=document.getElementById('top-status');
}
_tickClock();
setInterval(_tickClock,1000);

// Browser online/offline events — most reliable signal
window.addEventListener('offline', () => {
  showConnError('No internet connection');
});
window.addEventListener('online', () => {
  hideConnError();
  // Reload data when connection restored
  setTimeout(() => loadDashboard(), 1000);
});

// ── Navigation ────────────────────────────────────────────
/* ── GLOBAL NAV HISTORY ── */
var _navHistory = [];
var _navLabels  = {
  dash:'Dashboard', vendos:'Vendos', harvest:'Harvest',
  suspicious:'Suspicious', skipped:'Skipped', joborders:'Job Orders',
  analytics:'Analytics', notsus:'Not Sus', status:'System'
};
function gNavBack() {
  if (_navHistory.length < 2) return;
  _navHistory.pop(); // remove current
  const prev = _navHistory.pop(); // get previous
  // Find the nav button for prev panel
  const navBtn = document.querySelector(`.nav-bar button[data-panel="${prev}"]`);
  showP(prev, navBtn);
}
function ahSourceBadge(routeCode) {
  if (!routeCode) return '';
  return '<span style="background:#e0f2fe;color:#0369a1;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;margin-left:4px">' + routeCode + '</span>';
}
function cyclesLoad() { /* reserved */ }

function gUpdateBackBtn(id) {
  const btn   = document.getElementById('g-back-btn');
  const label = document.getElementById('g-back-label');
  if (!btn) return;
  if (_navHistory.length >= 2) {
    const prev = _navHistory[_navHistory.length - 2];
    if (label) label.textContent = '← ' + (_navLabels[prev] || prev);
    btn.classList.add('vis');
  } else {
    btn.classList.remove('vis');
  }
}

function showP(id, btn) {
  // Hide all fixed overlays when switching panels
  ['hv-tab-audited','hv-overlay-recon','hv-overlay-records','hvt-settings','hvt-gps','hvt-keys'].forEach(function(oid){
    var oel=document.getElementById(oid); if(oel) oel.style.display='none';
  });
  _navHistory = [];
  document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".nav-bar button").forEach(b=>b.classList.remove("active"));
  const panel = document.getElementById("panel-"+id);
  if(!panel) { console.error("Panel not found: panel-"+id); return; }
  panel.classList.add("active");
  if(btn) btn.classList.add("active");
  // Track navigation history
  if (_navHistory[_navHistory.length-1] !== id) _navHistory.push(id);
  if (_navHistory.length > 10) _navHistory.shift();
  gUpdateBackBtn(id);
  hideBread();
  if(id==="harvest")   { loadHarvests(); if(typeof harvestTabLoad==='function') harvestTabLoad(); }
  if(id==="analytics") loadAnalytics();
  if(id==="vendos")     loadVendos();
  if(id==="skipped")    loadSkipped();
  if(id==="notsus")     loadNotSuspicious();
  if(id==="status")     loadSystemStatus();
  if(id==="suspicious") loadSuspicious();
  if(id==="joborders")  { colLoad(); }
  if(id==="spawnjobs"){
    var frm=document.getElementById('spawnjobs-frame');
    if(frm && (!frm.src || frm.src==='about:blank' || frm.src.endsWith('about:blank'))){
      frm.src='spawn-jobs.html';
    }
  }
}

function showBread(text, backFn) {
  navStack.push(backFn);
  document.getElementById("breadbar").classList.add("show");
  document.getElementById("breadcrumb").textContent = text;
  document.getElementById("float-back").style.display = "block";
}
function hideBread() {
  navStack = [];
  document.getElementById("breadbar").classList.remove("show");
  document.getElementById("float-back").style.display = "none";
}
function goBack() {
  if (navStack.length) {
    navStack.pop()();
    if (!navStack.length) hideBread();
  }
}

function changeYear(y) {
  currentYear = y;
  // Show year indicator
  const sel = document.getElementById('year-select');
  if(sel) sel.style.fontWeight = '800';
  // Bypass cache for year-filtered data
  const trend  = sb('trend_7day_mat','order=date.asc',7);
  const areas  = sb('summary_by_area','order=total_sales.desc');
  Promise.all([trend, areas]).then(([t, a]) => {
    // Re-render with year note — full year filtering requires materialized view changes
    // For now show toast that year filter affects new DB queries only
    if(y !== '2026') {
      document.getElementById('dash-stats').insertAdjacentHTML('afterbegin',
        '<div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:12px;font-weight:700;color:#854d0e">⚠️ Year filter ('+y+'): Dashboard stats are from materialized views — contact admin to refresh for historical years.</div>'
      );
    }
  });
  loadDashboard();
}

// ══════════════════════════════════════════════════════════
// GLOBAL SEARCH
// ══════════════════════════════════════════════════════════
function showSearchDrop() {
  if (allVendos.length) document.getElementById("search-drop").style.display = "block";
}
function hideSearchDrop() { document.getElementById("search-drop").style.display = "none"; }

function globalSearch(q) {
  const drop = document.getElementById("search-drop");
  if (!q || q.length < 2) { drop.style.display = "none"; return; }
  const ql = q.toLowerCase();

  // Primary: match TG name from allVendos (transaction-based)
  let results = allVendos.filter(v => v.vendo.toLowerCase().includes(ql)).slice(0, 10);

  // Secondary: if fewer than 5 results, also search sheet_name in allVendos registry
  // and cross-reference to allVendos by tg_name
  if (results.length < 5 && allVendos && allVendos.length) {
    const sheetMatches = allVendos.filter(v =>
      v.sheet_name && v.sheet_name.toLowerCase().includes(ql) && v.tg_name
    );
    for (const sm of sheetMatches) {
      const already = results.find(r => r.vendo === sm.tg_name);
      if (!already) {
        const fromAll = allVendos.find(r => r.vendo === sm.tg_name);
        if (fromAll) results.push(fromAll);
        else results.push({ vendo: sm.tg_name, area: sm.area || '—', sales: 0, txn_count: 0, _sheetLabel: sm.sheet_name });
      }
      if (results.length >= 10) break;
    }
  }

  if (!results.length) { drop.style.display = "none"; return; }
  drop.style.display = "block";
  drop.innerHTML =
    `<div style="padding:8px 14px;background:#f0f4ff;border-bottom:1px solid var(--bd);font-size:11px;color:#1565c0;font-weight:600;">
      ${results.length} vendos found — click to view transactions
    </div>` +
    results.map(v => {
      // Find sheet_name label if available
      const reg = allVendos ? allVendos.find(x => x.tg_name === v.vendo) : null;
      const sheetLabel = reg && reg.sheet_name ? `<span style="color:#7c3aed;font-size:10px;margin-left:6px;">📋 ${reg.sheet_name}</span>` : '';
      return `
    <div onclick="openVendoFromSearch('${esc(v.vendo)}','${v.area}')"
      style="padding:11px 14px;border-bottom:1px solid var(--bd);cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:background .12s;"
      onmouseover="this.style.background='#f0f4ff'" onmouseout="this.style.background=''">
      <div>
        <div style="font-weight:600;font-size:13px;color:#1a1d2e">${v.vendo}${sheetLabel}</div>
        <div style="font-size:11px;color:var(--mu);margin-top:2px">📍 ${v.area} · ${parseInt(v.txn_count||v.txns||0).toLocaleString()} txns</div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:8px;">
        <div style="font-weight:700;color:#1565c0;font-size:13px">${fmt(v.sales)}</div>
        <div style="font-size:10px;color:#9FE1CB;font-weight:600;">→ View txns</div>
      </div>
    </div>`;
    }).join("");
}

async function openVendoFromSearch(vendo, area) {
  document.getElementById("search-drop").style.display = "none";
  document.getElementById("global-search").value = "";
  // Switch to vendos panel manually — avoid showP() which calls loadVendos() and resets state
  document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".nav-bar button").forEach(b=>b.classList.remove("active"));
  document.getElementById("panel-vendos").classList.add("active");
  document.querySelector(".nav-bar button:nth-child(2)").classList.add("active");
  hideBread();
  // Load vendo list only if empty
  if (!allVendos.length) {
    const v = await sb("summary_by_vendo","order=sales.desc&select=vendo,sheet_name,area,sales,txn_count,today_sales,last_date",2000);
    allVendos = v;
  }
  await openVendoDetail(vendo, area);
}

// ══════════════════════════════════════════════════════════


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
    let perfUrl = `${_SB}/rest/v1/harvests?select=collector,net_collectible,spawn_share,coins_total,harvest_date,area,sheet_name,tg_name,harvested_at&order=harvest_date.desc&limit=5000`;
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
    window._perfData = {};   // collector -> {stats, harvests}

    el.innerHTML = `
      <div style="margin-bottom:12px;font-size:11px;color:var(--mu);">Based on all ${rows.length} harvest records · ranked by Spawn Share</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;">
        ${sorted.map(([name,s],i)=>{
          const days = s.dates.size;
          const avg = s.count ? (s.spawn/s.count).toFixed(0) : 0;
          const medal = medals[i]||'';
          const harvestRows = rows.filter(r=>r.collector===name).sort((a,b)=>(b.harvest_date||'').localeCompare(a.harvest_date||''));
          window._perfData[name] = { stats:{count:s.count,net:s.net,spawn:s.spawn,coins:s.coins,days}, harvests:harvestRows };
          return `<div onclick="perfShowPopup('${name.replace(/'/g,"\\'")}')" style="background:#fff;border:1px solid var(--bd);border-radius:12px;padding:14px 16px;cursor:pointer;transition:.12s;" onmouseover="this.style.boxShadow='0 4px 14px rgba(0,0,0,.10)';this.style.borderColor='#6d28d9';" onmouseout="this.style.boxShadow='none';this.style.borderColor='var(--bd)';">
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
            <div style="width:100%;padding:6px;border:1px solid #e5e7eb;border-radius:6px;background:#f8faff;font-size:11px;text-align:center;color:#6d28d9;font-weight:700;">
              📋 View ${harvestRows.length} harvests ›
            </div>
          </div>`;
        }).join('')}
      </div>`;
  } catch(e) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:#dc2626;">Error: '+e.message+'</div>';
  }
}

// Pretty popup showing a collector's harvest breakdown
function perfShowPopup(name){
  const d = (window._perfData||{})[name];
  if(!d) return;
  const s=d.stats, hs=d.harvests;
  const old=document.getElementById('perf-modal'); if(old) old.remove();
  const ov=document.createElement('div');
  ov.id='perf-modal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit;';
  const initial=(name||'?').trim().charAt(0).toUpperCase();
  const avg=s.count?(s.spawn/s.count).toFixed(0):0;
  const rowsHtml = hs.map(h=>{
    const t=h.harvested_at?new Date(h.harvested_at).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}):'';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid #f3f4f6;">
      <div style="min-width:74px;"><div style="font-size:11px;color:#475569;font-weight:600;">${h.harvest_date||'—'}</div><div style="font-size:9px;color:var(--mu);">${t}</div></div>
      <div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:600;">${h.sheet_name||h.tg_name||'<span style=\"color:#9ca3af;font-style:italic\">unmatched</span>'}</div><div style="font-size:10px;color:var(--mu);">${h.area||''}</div></div>
      <div style="text-align:right;"><div style="font-size:13px;font-weight:800;color:#15803d;">${_php(h.spawn_share)}</div><div style="font-size:9px;color:var(--mu);">coins ${_php(h.coins_total)}</div></div>
    </div>`;
  }).join('');
  ov.innerHTML=`<div style="background:#fff;border-radius:18px;max-width:480px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#6d28d9,#025AC6);padding:18px 22px;color:#fff;flex-shrink:0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:19px;">${initial}</div>
          <div><div style="font-size:19px;font-weight:800;">${name}</div><div style="font-size:11px;opacity:.9;">${s.count} harvests · ${s.days} days active</div></div>
        </div>
        <button onclick="perfClosePopup()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:30px;height:30px;border-radius:8px;font-size:17px;cursor:pointer;font-family:inherit;">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-top:14px;">
        <div style="background:rgba(255,255,255,.15);border-radius:8px;padding:7px;text-align:center;"><div style="font-size:14px;font-weight:800;">${_php(s.spawn)}</div><div style="font-size:8px;opacity:.85;">spawn</div></div>
        <div style="background:rgba(255,255,255,.15);border-radius:8px;padding:7px;text-align:center;"><div style="font-size:14px;font-weight:800;">${_php(s.net)}</div><div style="font-size:8px;opacity:.85;">net</div></div>
        <div style="background:rgba(255,255,255,.15);border-radius:8px;padding:7px;text-align:center;"><div style="font-size:14px;font-weight:800;">${_php(s.coins)}</div><div style="font-size:8px;opacity:.85;">coins</div></div>
        <div style="background:rgba(255,255,255,.15);border-radius:8px;padding:7px;text-align:center;"><div style="font-size:14px;font-weight:800;">${_php(avg)}</div><div style="font-size:8px;opacity:.85;">avg</div></div>
      </div>
    </div>
    <div style="overflow-y:auto;flex:1;">${rowsHtml}</div>
  </div>`;
  ov.addEventListener('click',e=>{ if(e.target===ov) perfClosePopup(); });
  document.body.appendChild(ov);
}
function perfClosePopup(){ const o=document.getElementById('perf-modal'); if(o) o.remove(); }

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
  const pw = await askAdminPw('Enter admin password to confirm.');
  if(pw===null)return; if(pw!=='101510'){markAdminPwWrong();toast('Wrong password');return;}
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
  if (typeof updateCacheIndicator === 'function') updateCacheIndicator();
  ['hv-tab-audited','hv-overlay-recon','hv-overlay-records'].forEach(function(oid){ var el=document.getElementById(oid); if(el) el.style.display='none'; });
  // Overview fully handled by overviewLoad() in dash.6.overview.js (TG sales + harvest spawn)
  if (typeof overviewLoad === 'function') { overviewLoad(); }
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

  // Clear stale harvest summary IMMEDIATELY (synchronously) to prevent flash-of-old-content
  const _hsum = document.getElementById('harvest-collector-summary');
  if (_hsum) _hsum.innerHTML = '<div style="padding:16px;text-align:center;color:var(--mu);font-size:12px;"><span style="display:inline-block;width:16px;height:16px;border:2px solid var(--bd);border-top-color:var(--blue);border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:8px;"></span>Loading harvest summary…</div>';

  // Run both loads in parallel — no artificial delay (was causing 800ms stale flash)
  setTimeout(() => {
    if (typeof htLoad === 'function') htLoad();
    if (typeof harvestTabLoad === 'function') harvestTabLoad();
  }, 30);
}

function renderHarvests(rows){ }
function hPage(d){ }

// ══════════════════════════════════════════════════════════
// HACKED — TODO LIST
// ══════════════════════════════════════════════════════════
async function loadSuspicious() {
  const rows=await sb("hacked_summary","order=txn_count.desc",1000);
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
    return `<div class="todo-item" id="hack-${(h.vendo||"").replace(/[^a-zA-Z0-9]/g,"_").slice(0,30)}}">
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

// ── Auto-load dashboard on first open ────────────────────

/* ─── ANALYTICS (fast+cached) ─── */
let _anlC=null;
// ── Analytics view toggle: Harvested Spawn Share (default) vs Telegram Sales ──
let _anlView = 'harvest';
let _anlHarvestLoaded = false;
function anlSetView(v){
  _anlView = v;
  const hv=document.getElementById('anv-harvest'), tv=document.getElementById('anv-tg');
  const hb=document.getElementById('anv-harvest-btn'), tb=document.getElementById('anv-tg-btn');
  if(hv) hv.style.display = v==='harvest' ? 'block':'none';
  if(tv) tv.style.display = v==='tg' ? 'block':'none';
  if(hb){ hb.style.background = v==='harvest'?'#028867':'#fff'; hb.style.color = v==='harvest'?'#fff':'#025AC6'; }
  if(tb){ tb.style.background = v==='tg'?'#025AC6':'#fff'; tb.style.color = v==='tg'?'#fff':'#025AC6'; }
  if(v==='harvest'){ anlLoadHarvest(); }
  else { loadAnalyticsTg(); }
}

async function loadAnalytics(){
  // entry point when the Analytics panel opens — default to harvested view
  anlSetView(_anlView || 'harvest');
}

// Telegram-sales analytics (the original content)
async function loadAnalyticsTg(){
  if(_anlC){_anlR(_anlC);return;}
  try{
    const [ms,aD]=await Promise.all([
      sb('monthly_summary_mat','order=month.asc',48),
      sb('summary_by_area','order=total_sales.desc',20)
    ]);
    const mm={};
    (ms||[]).forEach(r=>{ if(r.month) mm[r.month]=(mm[r.month]||0)+parseFloat(r.total_sales||0); });
    _anlC={mm,aD};_anlR(_anlC);
  }catch(e){console.error('loadAnalyticsTg:',e);}
}

// Harvested Spawn Share analytics — group × month (reuses _hstGroupOf)
let _anlHChart = null;
const _ANL_MONTHS = {'01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun','07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec'};
const _ANL_COLORS = ['#025AC6','#FFB725','#028867','#C01176','#DF1A35','#311A8E','#0EA5E9','#F97316'];
function _anlGroupOf(route){
  const rc=(route||'').toUpperCase();
  if(rc==='GRP-A1'||rc==='GRP-A2'||rc==='GRP-A3') return 'Dipolog';
  if(rc==='GRP-B1'||rc==='GRP-B2'||rc==='GRP-B3') return 'Dapitan';
  if(rc==='GRP-A4') return 'Sindangan';
  if(rc==='GRP-A5') return 'Polanco';
  if(rc==='GRP-A6') return 'Roxas';
  return 'Pre-v3 / Admin';
}
async function anlLoadHarvest(){
  const load=document.getElementById('anv-h-loading');
  if(_anlHarvestLoaded){ return; }  // already rendered
  if(load){ load.style.display='block'; load.textContent='Loading harvested analytics…'; }
  try{
    const year=new Date().getFullYear();
    const rows=[]; let off=0;
    while(true){
      const r=await fetch(`${SB_URL}/rest/v1/harvests?harvest_date=gte.${year}-01-01&select=route_code,harvest_date,spawn_share&limit=1000&offset=${off}`,{headers:HDR});
      if(!r.ok) throw new Error('harvests '+r.status);
      const d=await r.json();
      if(!Array.isArray(d)||!d.length) break;
      rows.push(...d);
      if(d.length<1000) break;
      off+=1000;
    }
    const agg={};
    rows.forEach(h=>{
      const g=_anlGroupOf(h.route_code);
      const ym=(h.harvest_date||'').slice(0,7);
      if(!ym) return;
      const k=g+'|'+ym;
      if(!agg[k]) agg[k]={grp:g, ym, spawn:0};
      agg[k].spawn += Number(h.spawn_share||0);
    });
    _anlHData = Object.values(agg);
    _anlHarvestLoaded = true;
    if(load) load.style.display='none';
    anlRenderHarvest();
  }catch(e){ if(load){ load.style.display='block'; load.textContent='Error: '+e.message; } }
}
let _anlHData = null;
function anlRenderHarvest(){
  if(!_anlHData) return;
  const months=[...new Set(_anlHData.map(d=>d.ym))].sort();
  const groups=[...new Set(_anlHData.map(d=>d.grp))].sort();
  const val=(g,m)=>{ const d=_anlHData.find(x=>x.grp===g&&x.ym===m); return d?Number(d.spawn||0):0; };
  const php=v=>'₱'+Math.round(Number(v||0)).toLocaleString();

  // summary cards (total spawn per group)
  const totals=groups.map(g=>({grp:g,total:months.reduce((s,m)=>s+val(g,m),0)})).sort((a,b)=>b.total-a.total);
  const grand=totals.reduce((s,t)=>s+t.total,0);
  const sumEl=document.getElementById('anv-h-summary');
  if(sumEl){
    sumEl.innerHTML=`<div style="background:linear-gradient(135deg,#028867,#025AC6);color:#fff;border-radius:10px;padding:12px;">
        <div style="font-size:19px;font-weight:800;">${php(grand)}</div>
        <div style="font-size:10px;opacity:.9;margin-top:2px;">Total Spawn (${months.length} mo)</div></div>`
      + totals.map((t,i)=>`<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px;border-left:3px solid ${_ANL_COLORS[i%_ANL_COLORS.length]};">
        <div style="font-size:16px;font-weight:800;color:#111827;">${php(t.total)}</div>
        <div style="font-size:10px;color:var(--mu);margin-top:2px;">${t.grp}</div></div>`).join('');
  }

  // grouped bar chart
  const ctx=document.getElementById('anv-h-chart');
  if(ctx && window.Chart){
    if(_anlHChart){ _anlHChart.destroy(); _anlHChart=null; }
    Chart.getChart(ctx)?.destroy();
    _anlHChart=new Chart(ctx,{ type:'bar',
      data:{ labels: months.map(m=>{const[y,mm]=m.split('-');return (_ANL_MONTHS[mm]||mm)+' '+y.slice(2);}),
        datasets: groups.map((g,i)=>({label:g,data:months.map(m=>val(g,m)),backgroundColor:_ANL_COLORS[i%_ANL_COLORS.length],borderRadius:4})) },
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{legend:{position:'bottom',labels:{boxWidth:12,font:{size:11}}},tooltip:{callbacks:{label:c=>c.dataset.label+': '+php(c.parsed.y)}}},
        scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{callback:v=>'₱'+(v/1000)+'k'}}} }
    });
  }

  // pivot table
  let H='<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#028867;color:#fff;"><th style="padding:8px 12px;text-align:left;">Group</th>'
    + months.map(m=>{const[y,mm]=m.split('-');return `<th style="padding:8px 12px;text-align:right;">${_ANL_MONTHS[mm]||mm} ${y.slice(2)}</th>`;}).join('')
    + '<th style="padding:8px 12px;text-align:right;background:#016b51;">TOTAL</th></tr></thead><tbody>';
  const colT={}; months.forEach(m=>colT[m]=0);
  totals.forEach((t,idx)=>{ const g=t.grp;
    H+=`<tr style="background:${idx%2?'#f6fdfb':'#fff'};"><td style="padding:7px 12px;font-weight:700;">${g}</td>`;
    months.forEach(m=>{const v=val(g,m);colT[m]+=v;H+=`<td style="padding:7px 12px;text-align:right;color:${v?'#111827':'#d1d5db'};">${v?php(v):'—'}</td>`;});
    H+=`<td style="padding:7px 12px;text-align:right;font-weight:800;color:#028867;">${php(t.total)}</td></tr>`;
  });
  H+='<tr style="background:#e7f6f1;font-weight:800;border-top:2px solid #028867;"><td style="padding:8px 12px;">TOTAL</td>'
    + months.map(m=>`<td style="padding:8px 12px;text-align:right;color:#028867;">${php(colT[m])}</td>`).join('')
    + `<td style="padding:8px 12px;text-align:right;color:#016b51;">${php(grand)}</td></tr></tbody></table>`;
  const tEl=document.getElementById('anv-h-table'); if(tEl) tEl.innerHTML=H;
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

window.addEventListener('load', () => { loadCollectorPhotos(); setTimeout(() => loadDashboard(), 500); ['hv-tab-audited','hv-overlay-recon','hv-overlay-records'].forEach(function(oid){ var el=document.getElementById(oid); if(el) el.style.display='none'; });
  // ── Deep-link: ?p=<panel> opens a single tab directly (used by command center) ──
  try {
    var _pp = new URLSearchParams(location.search).get('p');
    if (_pp) {
      setTimeout(function(){
        var _btn = document.querySelector('.nav-bar button[onclick*="showP(\'' + _pp + '\'"]');
        if (typeof showP === 'function') showP(_pp, _btn || null);
        // focus mode: hide the top nav bar so only the panel shows in an embedded window
        if (new URLSearchParams(location.search).get('focus') !== '0') {
          var _nav = document.querySelector('.nav-bar'); if (_nav) _nav.style.display = 'none';
        }
      }, 650);
    }
  } catch(e) { console.warn('deep-link p= failed', e); }
});

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
    // Railway unreachable / 503 / CORS — server-side issue, not dashboard.
    // The browser still logs the network error to console (unavoidable), but we handle it gracefully here.
    const pill = document.getElementById('tg-status-pill');
    if (pill) { pill.textContent = '● Status unknown'; pill.style.background='#f3f4f6'; pill.style.color='#6b7280'; pill.title='Telegram status server (Railway) unreachable — bot may still be running'; }
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
      `Railway     : vendomonitor-cloud-production.up.railway.app`,
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
  const pw = await askAdminPw('Enter admin password to confirm.');
  if(pw===null)return; if(pw!=='101510'){markAdminPwWrong();toast('Wrong password');return;}
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
  const pw = await askAdminPw('Enter admin password to confirm.');
  if(pw===null)return; if(pw!=='101510'){markAdminPwWrong();toast('Wrong password');return;}
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
  const pw = await askAdminPw('Enter admin password to confirm.');
  if(pw===null)return; if(pw!=='101510'){markAdminPwWrong();toast('Wrong password');return;}
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

