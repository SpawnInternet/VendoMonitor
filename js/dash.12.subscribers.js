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

let subRows    = null;
let subFilter  = 'all';
let subArea    = 'all';
let subSearch  = '';
let subInited  = false;
let subSort    = 'days';

function subPeso(n){
  const v = Number(n)||0;
  return '\u20b1' + v.toLocaleString('en-PH',{maximumFractionDigits:0});
}
function subEsc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
  current:      { label:'Current',      color:'#028867' },
  overdue_35:   { label:'Overdue 35d+', color:'#FFB725' },
  overdue_60:   { label:'Overdue 60d+', color:'#DF1A35' },
  never_paid:   { label:'Never paid',   color:'#94a3b8' },
  disconnected: { label:'Disconnected', color:'#64748b' }
};

async function subscribersInit(){
  const host = document.getElementById('panel-subscribers');
  if(!host) return;
  if(subInited && subRows){ subRender(); return; }
  subInited = true;
  host.innerHTML = '<div style="padding:26px;text-align:center;color:#6b7394;font-size:13px">'
                 + 'Loading subscribers\u2026</div>';
  try {
    subRows = await subRest('v_subscriber_overview?select=*&order=days_since_paid.desc.nullslast');
  } catch(e){
    host.innerHTML = '<div style="background:#fff;border:1px solid #f3c2e2;border-radius:9px;'
      + 'padding:16px;color:#C01176;font-size:13px">Could not load subscribers.<br>'
      + '<span style="font-size:11px;color:#8b93ad">' + subEsc(e.message) + '</span></div>';
    return;
  }
  subRender();
}

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
  if(subSort === 'days')      rows.sort((a,b)=>(b.days_since_paid||-1)-(a.days_since_paid||-1));
  else if(subSort === 'name') rows.sort((a,b)=>String(a.raw_name).localeCompare(String(b.raw_name)));
  else if(subSort === 'value')rows.sort((a,b)=>(b.typical_amount||0)-(a.typical_amount||0));
  return rows;
}

function subRender(){
  const host = document.getElementById('panel-subscribers');
  if(!host) return;
  const all = subRows || [];
  const cnt = function(s){ return all.filter(r=>r.status===s).length; };
  const overdue = all.filter(r=>r.status==='overdue_35'||r.status==='overdue_60');
  const overdueValue = overdue.reduce((s,r)=>s+(Number(r.typical_amount)||0),0);
  const linked = all.filter(r=>r.ledger_linked).length;

  const areas = Array.from(new Set(all.map(r=>r.area||'\u2014'))).sort();
  const rows = subFiltered();

  const kpi = (label,value,color,sub) =>
      '<div class="stat" style="border-bottom-color:'+color+'">'
    +   '<div class="sl">'+label+'</div>'
    +   '<div class="sv" style="color:'+color+'">'+value+'</div>'
    +   (sub?'<div style="font-size:9px;color:var(--mu);margin-top:1px;font-weight:600">'+sub+'</div>':'')
    + '</div>';

  const chip = (id,label,n,color) =>
      '<button onclick="subSetFilter(\''+id+'\')" style="border:1px solid '
    + (subFilter===id?color:'#e6ecf5')+';background:'+(subFilter===id?color:'#fff')
    + ';color:'+(subFilter===id?'#fff':'#4a5270')
    + ';border-radius:20px;padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer;'
    + 'font-family:inherit">'+label+' <span style="opacity:.75">'+n+'</span></button>';

  host.innerHTML =
      '<div class="dash-stats" style="margin-bottom:12px">'
    +   kpi('Total Subscribers', all.length, SUB_BRAND.blue,
            linked + ' matched to payments')
    +   kpi('Current', cnt('current'), SUB_BRAND.teal, 'paid within 35 days')
    +   kpi('Overdue', overdue.length, SUB_BRAND.red,
            subPeso(overdueValue) + '/month at risk')
    +   kpi('Disconnected', cnt('disconnected'), '#64748b', 'green in BASHANG')
    + '</div>'

    + '<div style="background:#fff;border:1px solid #e6ecf5;border-radius:9px;padding:11px 12px;margin-bottom:10px">'
    +   '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
    +     chip('all','All',all.length,SUB_BRAND.blue)
    +     chip('current','Current',cnt('current'),SUB_BRAND.teal)
    +     chip('overdue','Overdue',overdue.length,SUB_BRAND.red)
    +     chip('never_paid','Never paid',cnt('never_paid'),'#94a3b8')
    +     chip('disconnected','Disconnected',cnt('disconnected'),'#64748b')
    +     '<span style="flex:1"></span>'
    +     '<select onchange="subSetArea(this.value)" style="border:1px solid #e6ecf5;border-radius:7px;'
    +       'padding:5px 8px;font-size:11px;font-weight:600;font-family:inherit;color:#4a5270">'
    +       '<option value="all">All areas</option>'
    +       areas.map(a=>'<option value="'+subEsc(a)+'"'+(subArea===a?' selected':'')+'>'+subEsc(a)+'</option>').join('')
    +     '</select>'
    +     '<select onchange="subSetSort(this.value)" style="border:1px solid #e6ecf5;border-radius:7px;'
    +       'padding:5px 8px;font-size:11px;font-weight:600;font-family:inherit;color:#4a5270">'
    +       '<option value="days"'+(subSort==='days'?' selected':'')+'>Longest unpaid</option>'
    +       '<option value="name"'+(subSort==='name'?' selected':'')+'>Name</option>'
    +       '<option value="value"'+(subSort==='value'?' selected':'')+'>Monthly amount</option>'
    +     '</select>'
    +     '<input value="'+subEsc(subSearch)+'" oninput="subSetSearch(this.value)" placeholder="Search name, address, account\u2026" '
    +       'style="border:1px solid #e6ecf5;border-radius:7px;padding:5px 9px;font-size:11px;'
    +       'font-family:inherit;min-width:210px">'
    +   '</div>'
    + '</div>'

    + '<div style="background:#fff;border:1px solid #e6ecf5;border-radius:9px;overflow:hidden">'
    +   '<div style="padding:9px 12px;border-bottom:1px solid #eef2f8;font-size:11px;'
    +     'color:var(--mu);font-weight:700">Showing '+rows.length+' of '+all.length+'</div>'
    +   '<div style="overflow:auto;max-height:62vh">'
    +   '<table style="width:100%;border-collapse:collapse;font-size:11.5px">'
    +     '<thead><tr style="background:#f7f9fc;position:sticky;top:0;z-index:1">'
    +       ['Subscriber','Area','Acct','Due','Monthly','Last paid','Days','Status']
              .map(h=>'<th style="text-align:left;padding:7px 9px;font-size:10px;text-transform:uppercase;'
                 +'letter-spacing:.3px;color:#6b7394;border-bottom:1px solid #e6ecf5">'+h+'</th>').join('')
    +     '</tr></thead><tbody>'
    +     (rows.length ? rows.map(subRowHtml).join('')
          : '<tr><td colspan="8" style="padding:22px;text-align:center;color:var(--mu)">No subscribers match.</td></tr>')
    +   '</tbody></table></div></div>'

    + '<div style="margin-top:9px;font-size:10.5px;color:#8b93ad;line-height:1.55">'
    +   'Master list from BASHANG UPDATED (subscribers dapitan to roxas + Sindangan subscriber). '
    +   'Disconnected = green-highlighted rows. Last paid prefers the live payment ledger and falls '
    +   'back to the sheet grid. '
    +   (all.length - linked) + ' subscribers are not yet matched to a ledger name \u2014 their last '
    +   'payment date comes from the sheet only.'
    + '</div>';
}

function subRowHtml(r){
  const st = SUB_STATUS[r.status] || { label:r.status, color:'#94a3b8' };
  const days = (r.days_since_paid==null) ? '\u2014' : r.days_since_paid;
  const td = 'padding:6px 9px;border-bottom:1px solid #f2f5fa';
  return '<tr>'
    + '<td style="'+td+'">'
    +   '<div style="font-weight:700;color:#1a1d2e">'+subEsc(r.raw_name)+'</div>'
    +   (r.address?'<div style="font-size:10px;color:#8b93ad">'+subEsc(r.address).slice(0,54)+'</div>':'')
    + '</td>'
    + '<td style="'+td+';color:#4a5270">'+subEsc(r.area||'\u2014')+'</td>'
    + '<td style="'+td+';color:#8b93ad">'+subEsc(r.account_no||'\u2014')+'</td>'
    + '<td style="'+td+';color:#4a5270">'+(r.due_day||'\u2014')+'</td>'
    + '<td style="'+td+';font-weight:700">'+(r.typical_amount?subPeso(r.typical_amount):'\u2014')+'</td>'
    + '<td style="'+td+';color:#4a5270">'+(r.last_payment_date||'\u2014')
    +   (r.ledger_linked?'':'<span title="not matched to the payment ledger" style="color:#FFB725"> \u25cf</span>')
    + '</td>'
    + '<td style="'+td+';font-weight:700;color:'+(Number(days)>60?'#DF1A35':Number(days)>35?'#B47F00':'#4a5270')+'">'+days+'</td>'
    + '<td style="'+td+'">'
    +   '<span style="background:'+st.color+'1a;color:'+st.color+';border-radius:20px;'
    +   'padding:2px 9px;font-size:10px;font-weight:800">'+st.label+'</span>'
    + '</td></tr>';
}

function subSetFilter(v){ subFilter = v; subRender(); }
function subSetArea(v){ subArea = v; subRender(); }
function subSetSort(v){ subSort = v; subRender(); }
function subSetSearch(v){ subSearch = v; subRender(); }
