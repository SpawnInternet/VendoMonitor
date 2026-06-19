
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
    const popup=`<div style="font-size:12px;min-width:180px;"><div style="font-weight:700;font-size:13px;margin-bottom:4px;">${name}</div><div style="margin-bottom:2px;">📍 <a href="https://maps.google.com/?q=${lat},${lng}" target="_blank" style="color:#1565c0;">Open in Google Maps</a></div>${v.address?`<div style="color:#6b7280;font-size:11px;">🏠 ${v.address}</div>`:''}<div style="margin-top:4px;"><span style="background:${color};color:#fff;padding:1px 6px;border-radius:6px;font-size:11px;">${v.area||'—'}</span></div><div style="font-size:11px;margin-top:3px;color:${daysColor};">Last harvest: ${v.last_harvest_date||'—'}${daysAgo!==null?' ('+daysAgo+'d ago)':''}</div></div>`;
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
var SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2aXJhcWZocGhoc29uam1ydHZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY5NjYxOSwiZXhwIjoyMDkxMjcyNjE5fQ.qLPX_TW2U6W51nbOiotRdjUoofXnoWHi3oNfcIDmsek";

