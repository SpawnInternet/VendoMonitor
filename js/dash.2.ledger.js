
var _elData=null,_elFiltered=[];
async function elLoad(){
  if(_elData)return elFilter();
  const loadEl=document.getElementById('el-loading');
  const wrapEl=document.getElementById('el-table-wrap');
  if(loadEl){loadEl.style.display='block';loadEl.textContent='Loading ledger data…';}
  if(wrapEl) wrapEl.style.display='none';
  try{
    const url='https://cviraqfhphhsonjmrtvu.supabase.co/storage/v1/object/public/harvest-history-cache/excel-ledger-2026-full.json';
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const d=await r.json();
    _elData=Array.isArray(d)?d:(d.records||[]);
    // Auto-add the current month (July+) live from actual harvests by collectors
    try{ await elMergeLiveMonth(); }catch(e){ console.warn('live month merge failed',e&&e.message); }
    if(loadEl) loadEl.style.display='none';
    elFilter();
  }catch(e){
    if(loadEl){loadEl.style.display='block';loadEl.textContent='Error: '+e.message;}
  }
}

// Pull this month's harvests from the DB and fold them into the ledger as a live column
async function elMergeLiveMonth(){
  const now=new Date();
  const ym=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0'); // e.g. 2026-07
  const start=ym+'-01';
  const endD=new Date(now.getFullYear(), now.getMonth()+1, 1);
  const end=endD.getFullYear()+'-'+String(endD.getMonth()+1).padStart(2,'0')+'-01';
  // fetch harvests for the month (gateway-routed via _HDR)
  const sb=(typeof _SB!=='undefined')?_SB:'https://cviraqfhphhsonjmrtvu.supabase.co';
  const hdr=(typeof _HDR!=='undefined')?_HDR:{apikey:'gw',Authorization:'Bearer gw','Content-Type':'application/json','x-spawn-gw':'1'};
  const q=`harvests?harvest_date=gte.${start}&harvest_date=lt.${end}&select=sheet_name,tg_name,area,spawn_share,collector&limit=5000`;
  const r=await fetch(`${sb}/rest/v1/${q}`,{headers:hdr});
  if(!r.ok) throw new Error('harvests '+r.status);
  const rows=await r.json();
  if(!Array.isArray(rows)||!rows.length) return;
  // aggregate per vendo (sheet_name||area) and append as synthetic ledger records
  const agg={};
  rows.forEach(h=>{
    const label=h.sheet_name||h.tg_name||'(unnamed)';
    const area=h.area||'';
    const key=label+'||'+area;
    if(!agg[key]) agg[key]={sheet_name:label,area:area,spawn:0};
    agg[key].spawn += Number(h.spawn_share||0);
  });
  // remove any prior live rows for this month (avoid double count on re-load)
  _elData=_elData.filter(r=>!(r._live===true && (r.collection_date||'').startsWith(ym)));
  Object.values(agg).forEach(a=>{
    _elData.push({ sheet_name:a.sheet_name, area:a.area, collection_date:start, spawn_share:Math.round(a.spawn), _live:true });
  });
  window._elLiveMonth=ym;
}
function elFilter(){
  if(!_elData)return;
  const q=(document.getElementById('el-search').value||'').toLowerCase();
  const area=document.getElementById('el-area').value;
  const month=document.getElementById('el-month').value;
  _elFiltered=_elData.filter(r=>{
    if(q&&!r.sheet_name.toLowerCase().includes(q))return false;
    if(area&&r.area!==area)return false;
    if(month&&!r.collection_date.startsWith(month))return false;
    return true;
  });
  elRender();
}
function elRender(){
  if(!_elFiltered)return;
  var wrap=document.getElementById('el-table-wrap');
  if(!wrap)return;
  wrap.style.display='';
  // Build pivot table: group by sheet_name + area, months as columns
  var monthSet=new Set();
  _elFiltered.forEach(function(r){var m=r.collection_date.substring(0,7);if(m!=='2026-12')monthSet.add(m);});
  var months=Array.from(monthSet).sort();
  var mName={'2026-01':'Jan','2026-02':'Feb','2026-03':'Mar','2026-04':'Apr','2026-05':'May','2026-06':'Jun','2026-07':'Jul','2026-08':'Aug','2026-09':'Sep','2026-10':'Oct','2026-11':'Nov','2025-01':'Jan','2025-02':'Feb','2025-03':'Mar','2025-04':'Apr','2025-05':'May','2025-06':'Jun','2025-07':'Jul','2025-08':'Aug','2025-09':'Sep','2025-10':'Oct','2025-11':'Nov','2025-12':'Dec'};
  var groups={};
  _elFiltered.forEach(function(r){
    var m=r.collection_date.substring(0,7);
    if(m==='2026-12')return;
    var key=r.sheet_name+'||'+r.area;
    if(!groups[key])groups[key]={label:r.sheet_name,area:r.area,byMonth:{},total:0};
    var val=parseInt((r.spawn_share||0).toString().replace(/[^\d]/g,''))||0;
    groups[key].byMonth[m]=(groups[key].byMonth[m]||0)+val;
    groups[key].total+=val;
  });
  var entries=Object.values(groups).sort(function(a,b){return b.total-a.total;});
  var H='<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#1565c0;color:#fff;position:sticky;top:0">';
  H+='<th style="padding:6px 10px;text-align:left">Vendo</th><th style="padding:6px 10px;text-align:left">Area</th>';
  months.forEach(function(m){H+='<th style="padding:6px 10px;text-align:right">'+(mName[m]||m)+'</th>';});
  H+='<th style="padding:6px 10px;text-align:right;background:#0d47a1">TOTAL</th></tr></thead><tbody>';
  var gTotals={};months.forEach(function(m){gTotals[m]=0;});var grandTotal=0;
  entries.forEach(function(g,i){
    var bg=i%2===0?'#fff':'#f5f7fa';
    H+='<tr style="background:'+bg+'"><td style="padding:5px 10px">'+g.label+'</td><td style="padding:5px 10px;color:#888;font-size:12px">'+g.area+'</td>';
    months.forEach(function(m){var v=g.byMonth[m]||0;gTotals[m]+=v;H+='<td style="padding:5px 10px;text-align:right;color:'+(v?'#2e7d32':'#ccc')+'">'+(v?'\u20b1'+v.toLocaleString():'\u2014')+'</td>';});
    grandTotal+=g.total;
    H+='<td style="padding:5px 10px;text-align:right;font-weight:700;color:#1565c0">\u20b1'+g.total.toLocaleString()+'</td></tr>';
  });
  H+='<tr style="background:#e8f0fe;font-weight:700;border-top:2px solid #1565c0"><td style="padding:6px 10px" colspan="2">TOTAL</td>';
  months.forEach(function(m){H+='<td style="padding:6px 10px;text-align:right;color:#1565c0">\u20b1'+(gTotals[m]||0).toLocaleString()+'</td>';});
  H+='<td style="padding:6px 10px;text-align:right;color:#0d47a1">\u20b1'+grandTotal.toLocaleString()+'</td></tr></tbody></table>';
  wrap.innerHTML=H;
}
function elShowSkipped(){const b=document.getElementById('el-skipped-box');b.style.display=b.style.display==='none'?'':'none';}
