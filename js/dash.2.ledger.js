
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

// 2026-11-26: every month AFTER the Excel snapshot is filled live (it used to add only the current month,
// so Jul–Oct were missing). Per harvest: the BASHANG book record (office_harvest_records), plus any app
// harvest with no book record for the same vendo within 3 days — one record per harvest, never both.
async function elMergeLiveMonth(){
  const sb=(typeof _SB!=='undefined')?_SB:'https://cviraqfhphhsonjmrtvu.supabase.co';
  const hdr=(typeof _HDR!=='undefined')?_HDR:{apikey:'gw',Authorization:'Bearer gw','Content-Type':'application/json','x-spawn-gw':'1'};
  const all=async(q)=>{ const out=[]; for(let off=0;;off+=1000){ const r=await fetch(`${sb}/rest/v1/${q}&limit=1000&offset=${off}`,{headers:hdr});
    if(!r.ok) throw new Error(q.split('?')[0]+' '+r.status); const rows=await r.json(); if(!Array.isArray(rows)) throw new Error(q.split('?')[0]+' unreadable');
    out.push(...rows); if(rows.length<1000) break; } return out; };
  // first month not covered by the Excel snapshot
  const snapMonths=_elData.filter(r=>!r._live).map(r=>String(r.collection_date||'').slice(0,7)).filter(Boolean).sort();
  const lastSnap=snapMonths.length?snapMonths[snapMonths.length-1]:'2026-06';
  const [y,m]=lastSnap.split('-').map(Number);
  const firstLive=new Date(y, m, 1);                      // month after the snapshot
  const start=firstLive.getFullYear()+'-'+String(firstLive.getMonth()+1).padStart(2,'0')+'-01';
  const today=new Date().toISOString().slice(0,10);
  if(start>today) return;
  const [book, app, vend]=await Promise.all([
    all(`office_harvest_records?record_date=gte.${start}&record_date=lte.${today}&select=vendo_id,record_date,amount,raw_name,area&order=id.asc`),
    all(`harvests?harvest_date=gte.${start}&harvest_date=lte.${today}&select=vendo_id,harvest_date,sheet_name,tg_name,area,spawn_share&order=id.asc`),
    all(`vendos?select=id,sheet_name,tg_name,area&order=id.asc`)
  ]);
  const vName={}; vend.forEach(v=>vName[v.id]={label:v.sheet_name||v.tg_name||('#'+v.id), area:v.area||''});
  const dayN=d=>Math.round(new Date(String(d).slice(0,10)+'T00:00:00Z').getTime()/86400000);
  const bookBy={}; book.forEach(b=>{ if(b.vendo_id!=null) (bookBy[b.vendo_id]=bookBy[b.vendo_id]||[]).push(dayN(b.record_date)); });
  const recs=[];
  book.forEach(b=>{
    const v=vName[b.vendo_id]||{label:b.raw_name||'(unnamed)', area:b.area||''};
    recs.push({sheet_name:v.label, area:v.area||b.area||'', collection_date:String(b.record_date).slice(0,10), spawn_share:Math.round(Number(b.amount||0)), _live:true, _src:'book'});
  });
  app.forEach(h=>{
    const bd=bookBy[h.vendo_id]||[], d=dayN(h.harvest_date);
    if(h.vendo_id!=null && bd.some(x=>Math.abs(x-d)<=3)) return;     // already in the book — counted once
    const v=vName[h.vendo_id]||{label:h.sheet_name||h.tg_name||'(unnamed)', area:h.area||''};
    recs.push({sheet_name:v.label, area:v.area||h.area||'', collection_date:String(h.harvest_date).slice(0,10), spawn_share:Math.round(Number(h.spawn_share||0)), _live:true, _src:'app'});
  });
  _elData=_elData.filter(r=>r._live!==true).concat(recs);
  window._elLiveMonth=start.slice(0,7)+' → now';
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
  H+='<th style="padding:6px 10px;text-align:left;color:#fff">Vendo</th><th style="padding:6px 10px;text-align:left;color:#fff">Area</th>';
  months.forEach(function(m){H+='<th style="padding:6px 10px;text-align:right;color:#fff">'+(mName[m]||m)+'</th>';});
  H+='<th style="padding:6px 10px;text-align:right;background:#0d47a1;color:#fff">TOTAL</th></tr></thead><tbody>';
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
