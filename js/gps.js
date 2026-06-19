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
    const pw = prompt('Admin password to set '+name+"'s photo:");
    if(pw!=='101510'){ toast('Wrong password'); return; }
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
      if(typeof loadTodaySummary==='function') loadTodaySummary();
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
  const pw=prompt('Admin password:'); if(pw!=='101510'){ toast('Wrong password'); return; }
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
    const pw=prompt('Admin password:'); if(pw!=='101510'){ toast('Wrong password'); return; }
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
      gpsOpenEditor(vendoId); // refresh modal
      gpsTraceFilter();
    }catch(e){ toast('Error: '+e.message); }
  };
  inp.click();
}

