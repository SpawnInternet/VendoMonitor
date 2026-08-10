// ══════════════════════════════════════════════════════════
// SUBSCRIBERS TAB
// Read-only view of the subscriber master (BASHANG) joined to the
// live payment ledger. Source: v_subscriber_overview.
// All DB traffic routes through spawn-gw-admin (apikey:'gw').
// ══════════════════════════════════════════════════════════

const SB_SUB_URL = 'https://cviraqfhphhsonjmrtvu.supabase.co';
const SB_SUB_H   = { apikey:'gw', 'Content-Type':'application/json' };

const SUB_BRAND = { blue:'#025AC6', gold:'#FFB725', teal:'#028867',
                    magenta:'#C01176', red:'#DF1A35', purple:'#311A8E' };

// Spawn area palette — same colours the map and harvest surfaces use.
const SUB_AREA_COLOR = {
  DIPOLOG:'#025AC6', DAPITAN:'#028867', SINDANGAN:'#C01176', POLANCO:'#FFB725',
  ROXAS:'#311A8E', MINAOG:'#0EA5E9', SINAMAN:'#DF1A35'
};
const subAreaColor = (a)=> SUB_AREA_COLOR[String(a||'').toUpperCase()] || '#94a3b8';

let subRows   = null;
let subFilter = 'all';
let subArea   = 'all';
let subSearch = '';
let subSort   = 'days';
let subInited = false;

function subPeso(n){
  const v = Number(n)||0;
  return '\u20b1' + v.toLocaleString('en-PH',{maximumFractionDigits:0});
}
function subEsc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function subInitials(name){
  const parts = String(name||'?').replace(/\(.*?\)/g,'').trim().split(/[\s,]+/).filter(Boolean);
  return ((parts[0]||'?')[0] + (parts.length>1 ? parts[parts.length-1][0] : '')).toUpperCase();
}
async function subRest(path){
  // PostgREST caps at 1000 rows per request regardless of limit=.
  let out = [];
  for(let off=0; off<5000; off+=1000){
    const r = await fetch(SB_SUB_URL + '/rest/v1/' + path + '&limit=1000&offset=' + off,
                          { headers: SB_SUB_H });
    if(!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0,160));
    const page = await r.json();
    if(!page || !page.length) break;
    out = out.concat(page);
    if(page.length < 1000) break;
  }
  return out;
}

const SUB_STATUS = {
  current:      { label:'Current',      short:'Current',   color:'#028867' },
  overdue_35:   { label:'Overdue 35d+', short:'35d+',      color:'#FFB725' },
  overdue_60:   { label:'Overdue 60d+', short:'60d+',      color:'#DF1A35' },
  never_paid:   { label:'Never paid',   short:'None',      color:'#94a3b8' },
  disconnected: { label:'Disconnected', short:'Cut',       color:'#64748b' }
};
const SUB_ORDER = ['current','overdue_35','overdue_60','never_paid','disconnected'];

function subStyles(){
  if(document.getElementById('sub-styles')) return '';
  return ''
  + '<style id="sub-styles">'
  + '.sub-wrap{--sub-line:#e9eef6;--sub-mu:#7c85a3;--sub-ink:#141726}'
  + '.sub-hero{background:linear-gradient(135deg,#025AC6,#028867);border-radius:14px;'
  +   'padding:16px 18px;color:#fff;margin-bottom:12px;position:relative;overflow:hidden}'
  + '.sub-hero:after{content:"";position:absolute;right:-40px;top:-60px;width:200px;height:200px;'
  +   'border-radius:50%;background:rgba(255,255,255,.07)}'
  + '.sub-hero h2{margin:0;font-size:15px;font-weight:800;letter-spacing:.2px}'
  + '.sub-hero p{margin:3px 0 0;font-size:11.5px;opacity:.9;font-weight:500}'
  + '.sub-risk{font-size:30px;font-weight:800;line-height:1.05;letter-spacing:-.5px}'
  + '.sub-bar{display:flex;height:9px;border-radius:6px;overflow:hidden;margin-top:12px;'
  +   'background:rgba(255,255,255,.18)}'
  + '.sub-bar span{transition:flex-grow .5s ease}'
  + '.sub-key{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:10.5px;font-weight:600}'
  + '.sub-key i{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:5px}'
  + '.sub-toolbar{background:#fff;border:1px solid var(--sub-line);border-radius:11px;'
  +   'padding:10px 12px;margin-bottom:10px;display:flex;gap:7px;flex-wrap:wrap;align-items:center}'
  + '.sub-chip{border-radius:20px;padding:5px 13px;font-size:11px;font-weight:700;cursor:pointer;'
  +   'font-family:inherit;border:1px solid var(--sub-line);background:#fff;color:#4a5270;'
  +   'transition:all .15s ease}'
  + '.sub-chip:hover{border-color:#c9d4e6;transform:translateY(-1px)}'
  + '.sub-chip b{opacity:.7;font-weight:800;margin-left:3px}'
  + '.sub-in,.sub-sel{border:1px solid var(--sub-line);border-radius:8px;padding:6px 9px;'
  +   'font-size:11px;font-weight:600;font-family:inherit;color:#4a5270;background:#fff}'
  + '.sub-in:focus,.sub-sel:focus{outline:2px solid #025AC6;outline-offset:1px;border-color:#025AC6}'
  + '.sub-card{background:#fff;border:1px solid var(--sub-line);border-radius:11px;overflow:hidden}'
  + '.sub-tb{width:100%;border-collapse:collapse;font-size:11.5px}'
  + '.sub-tb th{text-align:left;padding:8px 10px;font-size:9.5px;text-transform:uppercase;'
  +   'letter-spacing:.5px;color:var(--sub-mu);border-bottom:1px solid var(--sub-line);'
  +   'background:#f8fafd;position:sticky;top:0;z-index:1;font-weight:800}'
  + '.sub-tb td{padding:7px 10px;border-bottom:1px solid #f3f6fb;vertical-align:middle}'
  + '.sub-tb tbody tr{transition:background .12s ease}'
  + '.sub-tb tbody tr:hover{background:#f8fbff}'
  + '.sub-av{width:26px;height:26px;border-radius:8px;display:flex;align-items:center;'
  +   'justify-content:center;font-size:9.5px;font-weight:800;color:#fff;flex:0 0 26px}'
  + '.sub-nm{font-weight:700;color:var(--sub-ink);line-height:1.3}'
  + '.sub-sub{font-size:10px;color:var(--sub-mu);line-height:1.3}'
  + '.sub-pill{border-radius:20px;padding:2px 9px;font-size:10px;font-weight:800;'
  +   'white-space:nowrap;display:inline-block}'
  + '.sub-area{font-size:10px;font-weight:800;letter-spacing:.3px;padding:2px 8px;'
  +   'border-radius:5px;white-space:nowrap}'
  + '.sub-days{display:flex;align-items:center;gap:6px;font-weight:800}'
  + '.sub-track{width:34px;height:4px;border-radius:3px;background:#eef2f8;overflow:hidden}'
  + '.sub-track i{display:block;height:100%;border-radius:3px}'
  + '.sub-note{margin-top:9px;font-size:10.5px;color:#8b93ad;line-height:1.6;'
  +   'background:#fbfcfe;border:1px solid var(--sub-line);border-radius:9px;padding:9px 11px}'
  + '@media (max-width:720px){.sub-hide{display:none}}'
  + '@media (prefers-reduced-motion:reduce){.sub-bar span,.sub-chip{transition:none}}'
  + '</style>';
}

async function subscribersInit(){
  const host = document.getElementById('panel-subscribers');
  if(!host) return;
  if(subInited && subRows){ subRender(); return; }
  subInited = true;
  host.innerHTML = subStyles()
    + '<div style="padding:34px;text-align:center;color:#7c85a3;font-size:12.5px">'
    + 'Loading subscribers\u2026</div>';
  try {
    subRows = await subRest('v_subscriber_overview?select=*&order=days_since_paid.desc.nullslast');
  } catch(e){
    host.innerHTML = subStyles()
      + '<div class="sub-card" style="border-color:#f3c2e2;padding:16px;color:#C01176;font-size:12.5px">'
      + '<b>Subscribers didn\'t load.</b><br>'
      + '<span style="font-size:11px;color:#8b93ad">' + subEsc(e.message) + '</span><br>'
      + '<button class="sub-chip" style="margin-top:9px" onclick="subRetry()">Try again</button></div>';
    return;
  }
  subRender();
}
function subRetry(){ subInited = false; subRows = null; subscribersInit(); }

function subFiltered(){
  const q = subSearch.trim().toLowerCase();
  let rows = (subRows||[]).filter(function(r){
    if(subFilter === 'overdue'){
      if(r.status !== 'overdue_35' && r.status !== 'overdue_60') return false;
    } else if(subFilter !== 'all' && r.status !== subFilter) return false;
    if(subArea !== 'all' && (r.area||'\u2014') !== subArea) return false;
    if(q){
      const hay = (r.raw_name||'') + ' ' + (r.address||'') + ' ' + (r.account_no||'')
                + ' ' + (r.phone||'') + ' ' + (r.fb_name||'');
      if(hay.toLowerCase().indexOf(q) < 0) return false;
    }
    return true;
  });
  if(subSort === 'days')       rows.sort((a,b)=>(b.days_since_paid==null?-1:b.days_since_paid)-(a.days_since_paid==null?-1:a.days_since_paid));
  else if(subSort === 'name')  rows.sort((a,b)=>String(a.raw_name).localeCompare(String(b.raw_name)));
  else if(subSort === 'value') rows.sort((a,b)=>(b.typical_amount||0)-(a.typical_amount||0));
  return rows;
}

function subRender(){
  const host = document.getElementById('panel-subscribers');
  if(!host) return;
  const all = subRows || [];
  const cnt = (s)=> all.filter(r=>r.status===s).length;
  const overdue = all.filter(r=>r.status==='overdue_35'||r.status==='overdue_60');
  const atRisk  = overdue.reduce((s,r)=>s+(Number(r.typical_amount)||0),0);
  const billing = all.filter(r=>!r.is_disconnected)
                     .reduce((s,r)=>s+(Number(r.typical_amount)||0),0);
  const linked  = all.filter(r=>r.ledger_linked).length;
  const areas   = Array.from(new Set(all.map(r=>r.area||'\u2014'))).sort();
  const rows    = subFiltered();

  // Signature element: the book split by payment health, sized by real counts.
  const bar = SUB_ORDER.map(function(k){
    const n = cnt(k);
    if(!n) return '';
    return '<span title="'+SUB_STATUS[k].label+': '+n+'" style="flex:'+n+' 1 0;'
         + 'background:'+SUB_STATUS[k].color+'"></span>';
  }).join('');
  const key = SUB_ORDER.filter(k=>cnt(k)).map(k =>
      '<span><i style="background:'+SUB_STATUS[k].color+'"></i>'
    + SUB_STATUS[k].label+' '+cnt(k)+'</span>').join('');

  const chip = (id,label,n)=>
      '<button class="sub-chip" onclick="subSetFilter(\''+id+'\')"'
    + (subFilter===id ? ' style="background:'+SUB_BRAND.blue+';border-color:'+SUB_BRAND.blue+';color:#fff"' : '')
    + '>'+label+'<b>'+n+'</b></button>';

  host.innerHTML = subStyles() + '<div class="sub-wrap">'

    + '<div class="sub-hero">'
    +   '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;position:relative;z-index:1">'
    +     '<div><h2>Subscriber Book</h2>'
    +       '<p>'+all.length+' subscribers \u00b7 '+subPeso(billing)+' billed monthly \u00b7 '
    +         linked+' matched to the payment ledger</p></div>'
    +     '<div style="text-align:right">'
    +       '<div class="sub-risk">'+subPeso(atRisk)+'</div>'
    +       '<div style="font-size:11px;opacity:.9;font-weight:600">'
    +         'monthly revenue at risk \u00b7 '+overdue.length+' overdue</div>'
    +     '</div>'
    +   '</div>'
    +   '<div class="sub-bar">'+bar+'</div>'
    +   '<div class="sub-key">'+key+'</div>'
    + '</div>'

    + '<div class="sub-toolbar">'
    +   chip('all','All',all.length)
    +   chip('current','Current',cnt('current'))
    +   chip('overdue','Overdue',overdue.length)
    +   chip('never_paid','Never paid',cnt('never_paid'))
    +   chip('disconnected','Disconnected',cnt('disconnected'))
    +   '<span style="flex:1"></span>'
    +   '<select class="sub-sel" onchange="subSetArea(this.value)" aria-label="Filter by area">'
    +     '<option value="all">All areas</option>'
    +     areas.map(a=>'<option value="'+subEsc(a)+'"'+(subArea===a?' selected':'')+'>'+subEsc(a)+'</option>').join('')
    +   '</select>'
    +   '<select class="sub-sel" onchange="subSetSort(this.value)" aria-label="Sort">'
    +     '<option value="days"'+(subSort==='days'?' selected':'')+'>Longest unpaid</option>'
    +     '<option value="name"'+(subSort==='name'?' selected':'')+'>Name A\u2013Z</option>'
    +     '<option value="value"'+(subSort==='value'?' selected':'')+'>Monthly amount</option>'
    +   '</select>'
    +   '<input class="sub-in" value="'+subEsc(subSearch)+'" oninput="subSetSearch(this.value)" '
    +     'placeholder="Search name, address, account\u2026" style="min-width:200px" aria-label="Search subscribers">'
    + '</div>'

    + '<div class="sub-card">'
    +   '<div style="padding:9px 12px;border-bottom:1px solid #e9eef6;font-size:11px;'
    +     'color:#7c85a3;font-weight:700;display:flex;justify-content:space-between">'
    +     '<span>'+rows.length+' of '+all.length+' shown</span>'
    +     '<span>'+subPeso(rows.reduce((s,r)=>s+(Number(r.typical_amount)||0),0))+' / month</span>'
    +   '</div>'
    +   '<div style="overflow:auto;max-height:60vh">'
    +   '<table class="sub-tb"><thead><tr>'
    +     '<th>Subscriber</th><th>Area</th><th class="sub-hide">Acct</th>'
    +     '<th class="sub-hide">Due</th><th>Monthly</th><th>Last paid</th>'
    +     '<th>Unpaid</th><th>Status</th>'
    +   '</tr></thead><tbody>'
    +   (rows.length ? rows.map(subRowHtml).join('')
        : '<tr><td colspan="8" style="padding:30px;text-align:center;color:#7c85a3">'
          + 'No subscribers match these filters. '
          + '<button class="sub-chip" onclick="subClear()">Clear filters</button></td></tr>')
    +   '</tbody></table></div></div>'

    + '<div class="sub-note">'
    +   '<b>Where this comes from.</b> Master list is BASHANG UPDATED \u2014 '
    +   '<i>subscribers dapitan to roxas</i> and <i>Sindangan subscriber</i>. '
    +   'Disconnected means the row is highlighted green in the sheet. '
    +   'Last paid uses the live payment ledger where the name matches, otherwise the sheet grid. '
    +   (all.length - linked) + ' subscribers are not yet matched to a ledger name \u2014 marked '
    +   '<span style="color:#FFB725;font-weight:800">\u25cf</span> \u2014 so their dates come from the sheet only.'
    + '</div></div>';
}

function subRowHtml(r){
  const st   = SUB_STATUS[r.status] || { label:r.status, color:'#94a3b8' };
  const days = (r.days_since_paid==null) ? null : Number(r.days_since_paid);
  const ac   = subAreaColor(r.area);
  const dcol = days==null ? '#94a3b8' : days>60 ? '#DF1A35' : days>35 ? '#B47F00' : '#028867';
  const pct  = days==null ? 0 : Math.max(6, Math.min(100, Math.round(days/90*100)));
  return '<tr>'
    + '<td><div style="display:flex;align-items:center;gap:9px">'
    +   '<div class="sub-av" style="background:'+ac+'">'+subEsc(subInitials(r.raw_name))+'</div>'
    +   '<div style="min-width:0">'
    +     '<div class="sub-nm">'+subEsc(r.raw_name)+'</div>'
    +     (r.address?'<div class="sub-sub">'+subEsc(String(r.address).slice(0,52))+'</div>':'')
    +   '</div></div></td>'
    + '<td><span class="sub-area" style="background:'+ac+'1a;color:'+ac+'">'
    +   subEsc(r.area||'\u2014')+'</span></td>'
    + '<td class="sub-hide" style="color:#8b93ad;font-variant-numeric:tabular-nums">'
    +   subEsc(r.account_no||'\u2014')+'</td>'
    + '<td class="sub-hide" style="color:#4a5270">'+(r.due_day||'\u2014')+'</td>'
    + '<td style="font-weight:800;font-variant-numeric:tabular-nums">'
    +   (r.typical_amount?subPeso(r.typical_amount):'\u2014')+'</td>'
    + '<td style="color:#4a5270;font-variant-numeric:tabular-nums;white-space:nowrap">'
    +   (r.last_payment_date||'\u2014')
    +   (r.ledger_linked?'':'<span title="Not matched to the payment ledger \u2014 date is from the sheet" '
        + 'style="color:#FFB725;font-weight:800"> \u25cf</span>')
    + '</td>'
    + '<td><div class="sub-days" style="color:'+dcol+'">'
    +   '<span style="font-variant-numeric:tabular-nums;min-width:22px">'+(days==null?'\u2014':days)+'</span>'
    +   '<span class="sub-track"><i style="width:'+pct+'%;background:'+dcol+'"></i></span>'
    + '</div></td>'
    + '<td><span class="sub-pill" style="background:'+st.color+'1a;color:'+st.color+'">'
    +   subEsc(st.label)+'</span></td>'
    + '</tr>';
}

function subSetFilter(v){ subFilter = v; subRender(); }
function subSetArea(v){ subArea = v; subRender(); }
function subSetSort(v){ subSort = v; subRender(); }
function subSetSearch(v){ subSearch = v; subRender(); }
function subClear(){ subFilter='all'; subArea='all'; subSearch=''; subRender(); }
