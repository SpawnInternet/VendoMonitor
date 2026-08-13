// ══════════════════════════════════════════════════════════
// REPORTS MODULE  (was: Import)
// Sub-tabs mirror the sheets in Report.xlsx
// All DB traffic routes through spawn-gw-admin (apikey:'gw')
// ══════════════════════════════════════════════════════════

const RP_SB = 'https://cviraqfhphhsonjmrtvu.supabase.co';
const RP_H  = { apikey:'gw', 'Content-Type':'application/json' };

const RP_BRAND = { blue:'#025AC6', gold:'#FFB725', teal:'#028867', magenta:'#C01176', red:'#DF1A35', purple:'#311A8E' };
const RP_MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

let rpHints    = { categories:[], people:[], descriptions:[], last_date:null };
let rpDraft    = [];      // unsaved rows in the entry grid
let rpDayRows  = [];      // already-saved rows for the selected date
let rpJustSaved = [];     // ids written in this sitting — highlighted in the list
let rpDate     = null;    // selected expense date (YYYY-MM-DD)
let rpTab      = 'expense';
let rpInited   = false;

// ── helpers ───────────────────────────────────────────────
function rpPhToday(){
  return new Date(Date.now() + 8*3600*1000).toISOString().slice(0,10);
}
function rpPeso(n){
  const v = Number(n)||0;
  return '\u20b1' + v.toLocaleString('en-PH',{minimumFractionDigits:2, maximumFractionDigits:2});
}
function rpPesoShort(n){
  const v = Number(n)||0;
  if(!v) return '\u2014';
  return '\u20b1' + v.toLocaleString('en-PH',{maximumFractionDigits:0});
}
function rpEsc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
async function rpRestAll(base, cap){
  // PostgREST hard-caps at 1000 rows per request regardless of limit=.
  // Walk pages until a short page comes back (or the safety cap is hit).
  const max = cap || 20000;
  let out = [];
  for(let off = 0; off < max; off += 1000){
    const page = await rpRest(base + '&limit=1000&offset=' + off);
    if(!page || !page.length) break;
    out = out.concat(page);
    if(page.length < 1000) break;
  }
  return out;
}
async function rpRpc(fn, body){
  const r = await fetch(RP_SB + '/rest/v1/rpc/' + fn, { method:'POST', headers:RP_H, body:JSON.stringify(body||{}) });
  if(!r.ok) throw new Error(fn + ' -> ' + r.status);
  return r.json();
}
async function rpRest(path, opts){
  const o = Object.assign({ headers:RP_H }, opts||{});
  o.headers = Object.assign({}, RP_H, o.headers||{});
  const r = await fetch(RP_SB + '/rest/v1/' + path, o);
  if(!r.ok){ const t = await r.text(); throw new Error(r.status + ' ' + t.slice(0,180)); }
  if(r.status === 204) return null;
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// ── shell ─────────────────────────────────────────────────
async function reportsInit(){
  const host = document.getElementById('panel-reports');
  if(!host) return;
  if(!rpInited){
    rpInited = true;
    host.innerHTML = rpShellHtml();
    rpDate = rpPhToday();
    try { rpHints = await rpRpc('spawn_expense_hints'); } catch(e){ console.warn('hints', e); }
    rpFillDatalists();
    rpSetTab('expense');
  } else {
    rpSetTab(rpTab);
  }
}

function rpShellHtml(){
  const tabs = [
    ['expense',  '\u{1F4B8}', 'Daily Expense'],
    ['wendell',  '\u{1F4B3}', 'Admin Expense'],
    ['subinc',   '\u{1F4B5}', 'Subscriber Income'],
    ['summary',  '\u{1F4CA}', 'Expense Summary'],
    ['salesrecon','\u{1F9EE}', 'Sales Recon'],
    ['sales',    '\u{1F4B0}', 'Sales'],
    ['collect',  '\u{1F9FE}', 'Collections'],
    ['newvendo', '\u{1F195}', 'New Vendos'],
    ['newsub',   '\u{1F465}', 'New Subscribers'],
    ['pullout',  '\u{1F4E4}', 'Vendo Pull-Out'],
    ['cutoff',   '\u2702\uFE0F', 'Cutoff Subs'],
    ['status',   '\u{1F4E1}', 'Active / Inactive'],
    ['cash',     '\u{1F3E6}', 'Cash Receipts'],
    ['financial','\u{1F4C8}', 'Spawn Financial']
  ];
  const tabsHtml = tabs.map(function(t){
    return '<button class="rp-tab" data-rp="' + t[0] + '" onclick="rpSetTab(\'' + t[0] + '\')">' + t[1] + ' ' + t[2] + '</button>';
  }).join('');
  return ''
  + '<style>'
  + '#panel-reports .rp-tabs{display:flex;gap:0;border-bottom:2px solid #e8eeff;margin-bottom:14px;flex-wrap:wrap}'
  + '#panel-reports .rp-tab{padding:8px 14px;font-size:12px;font-weight:600;border:none;background:none;cursor:pointer;color:#6b7394;border-bottom:2px solid transparent;margin-bottom:-2px;font-family:inherit;transition:all .15s;white-space:nowrap}'
  + '#panel-reports .rp-tab:hover{color:#025AC6;background:#f6f9ff}'
  + '#panel-reports .rp-tab.active{color:#025AC6;border-bottom-color:#025AC6;background:#f0f4ff}'
  + '#panel-reports .rp-mode{display:none}#panel-reports .rp-mode.active{display:block}'
  + '#panel-reports .rp-card{background:#fff;border:1px solid #e8eeff;border-radius:12px;padding:14px;margin-bottom:12px}'
  + '#panel-reports .rp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}'
  + '#panel-reports .rp-kpi{background:#fff;border:1px solid #e8eeff;border-radius:12px;padding:12px 14px;border-bottom:3px solid #025AC6}'
  + '#panel-reports .rp-kpi .k{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6b7394}'
  + '#panel-reports .rp-kpi .v{font-size:19px;font-weight:800;color:#1a1d2e;margin-top:3px}'
  + '#panel-reports .rp-kpi .s{font-size:10px;color:#8b93ad;margin-top:2px}'
  + '#panel-reports table.rp-t{width:100%;border-collapse:collapse;font-size:12px}'
  + '#panel-reports table.rp-t th{background:#f0f4ff;color:#025AC6;font-size:10px;text-transform:uppercase;letter-spacing:.04em;padding:7px 8px;text-align:left;font-weight:700;position:sticky;top:0;z-index:2}'
  + '#panel-reports table.rp-t td{padding:6px 8px;border-bottom:1px solid #f2f5fc}'
  + '#panel-reports table.rp-t tbody tr:hover{background:#f8faff}'
  + '#panel-reports .rp-num{text-align:right;font-variant-numeric:tabular-nums}'
  + '#panel-reports .rp-in{width:100%;padding:6px 8px;border:1px solid #dbeafe;border-radius:6px;font-size:12px;font-family:inherit;background:#fff;color:#1a1d2e;box-sizing:border-box}'
  + '#panel-reports .rp-in:focus{outline:none;border-color:#025AC6;box-shadow:0 0 0 2px rgba(2,90,198,.12)}'
  + '#panel-reports .rp-in.err{border-color:#DF1A35;background:#fff5f5}'
  + '#panel-reports .rp-grid{display:grid;grid-template-columns:20px minmax(0,1.7fr) minmax(0,1fr) minmax(0,1.15fr) 82px 24px;gap:3px;align-items:center;margin-bottom:4px}#panel-reports .rp-rn{font-size:10px;color:#b6bdd0;text-align:right;font-variant-numeric:tabular-nums}#panel-reports .rp-in.cell{padding:6px 7px;font-size:12px}#panel-reports .rp-in.ok{border-color:#028867;background:#f6fffb}#panel-reports .rp-in.guess{border-color:#028867;border-style:dashed;background:#f6fffb;color:#0b6b53}#panel-reports .rp-in.warn{border-color:#FFB725;background:#fffdf5}#panel-reports .rp-fund{text-align:center;font-weight:800;letter-spacing:.03em}#panel-reports .rp-fund.C{color:#025AC6;background:#f2f7ff;border-color:#bfd8ff}#panel-reports .rp-fund.W{color:#C01176;background:#fff4fb;border-color:#f3c2e2}#panel-reports .rp-keys{font-size:10.5px;color:#6b7394;line-height:1.9}#panel-reports .rp-cat{cursor:pointer;padding-right:20px!important}#panel-reports .rp-cat.set{font-weight:600}.rp-pop{position:fixed;z-index:100030;background:#fff;border:1px solid #dbeafe;border-radius:10px;box-shadow:0 12px 40px rgba(17,10,60,.22);max-height:330px;overflow-y:auto;min-width:230px;padding:4px}.rp-pop div{padding:7px 10px;font-size:12.5px;cursor:pointer;border-radius:6px;display:flex;align-items:center;gap:9px;color:#1a1d2e}.rp-pop div:hover,.rp-pop div.hi{background:#f0f4ff;color:#025AC6;font-weight:700}.rp-pop i{width:10px;height:10px;border-radius:3px;flex:none;display:inline-block}.rp-pop .hint{position:sticky;bottom:0;background:#f8faff;color:#6b7394;font-size:10px;padding:6px 10px;cursor:default;border-top:1px solid #e8eeff}#panel-reports .rp-keys kbd{background:#f0f4ff;border:1px solid #dbeafe;border-bottom-width:2px;border-radius:4px;padding:1px 5px;font-family:ui-monospace,monospace;font-size:10px;color:#025AC6;font-weight:700}'
  + '#panel-reports .rp-grid.hdr{font-size:10px;font-weight:700;color:#025AC6;text-transform:uppercase;letter-spacing:.04em;padding:0 2px 4px}'
  + '#panel-reports .rp-x{border:none;background:#fff0f2;color:#DF1A35;border-radius:6px;height:30px;cursor:pointer;font-size:14px;font-weight:700;line-height:1}'
  + '#panel-reports .rp-x:hover{background:#DF1A35;color:#fff}'
  + '#panel-reports .rp-btn{padding:8px 14px;border-radius:8px;border:1px solid #dbeafe;background:#fff;color:#374151;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}'
  + '#panel-reports .rp-btn:hover{border-color:#025AC6;color:#025AC6}'
  + '#panel-reports .rp-btn.pri{background:#025AC6;color:#fff;border-color:#025AC6}'
  + '#panel-reports .rp-btn.pri:hover{background:#0148a0;color:#fff}'
  + '#panel-reports .rp-btn.ok{background:#028867;color:#fff;border-color:#028867}'
  + '#panel-reports .rp-btn:disabled{opacity:.5;cursor:not-allowed}'
  + '#panel-reports .rp-chip{display:inline-block;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700;margin:2px 3px 2px 0;cursor:pointer;border:1px solid #e8eeff;background:#fff;font-family:inherit}'
  + '#panel-reports .rp-chip.gap{background:#fff8e8;border-color:#FFB725;color:#8a6100}'
  + '#panel-reports .rp-chip.has{background:#eefaf5;border-color:#028867;color:#026a50}'
  + '#panel-reports .rp-chip.sel{background:#025AC6;border-color:#025AC6;color:#fff}'
  + '#panel-reports .rp-todo{background:#fffaf0;border:1px solid #FFB725;border-radius:12px;padding:16px}'
  + '#panel-reports .rp-scroll{max-height:480px;overflow:auto;border:1px solid #e8eeff;border-radius:10px}#panel-reports .rp-2col{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:10px;align-items:start}@media(max-width:820px){#panel-reports .rp-2col{grid-template-columns:1fr}}#panel-reports .rp-side{position:sticky;top:8px}#panel-reports .rp-kpis.tight{grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:7px;margin-bottom:9px}#panel-reports .rp-kpis.tight .rp-kpi{padding:8px 10px}#panel-reports .rp-kpis.tight .rp-kpi .v{font-size:15px}#panel-reports .rp-chip{padding:2px 7px;font-size:10.5px;margin:1px 2px 1px 0}'
  + '</style>'
  + '<div class="w" style="padding-top:10px">'
  +   '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">'
  +     '<div>'
  +       '<div style="font-size:16px;font-weight:800;color:#025AC6">\u{1F4D1} Reports</div>'
  +       '<div style="font-size:11px;color:#6b7394">Spawn Internetan \u2014 operating books, live from the database</div>'
  +     '</div>'
  +     '<div id="rp-actions" style="display:flex;gap:8px"></div>'
  +   '</div>'
  +   '<div class="rp-tabs" id="rp-tabs">' + tabsHtml + '</div>'
  +   '<div class="rp-mode" id="rp-mode-expense"></div>'
  +   '<div class="rp-mode" id="rp-mode-wendell"></div>'
  +   '<div class="rp-mode" id="rp-mode-subinc"></div>'
  +   '<div class="rp-mode" id="rp-mode-summary"></div>'
  +   '<div class="rp-mode" id="rp-mode-salesrecon"></div>'
  +   '<div class="rp-mode" id="rp-mode-sales"></div>'
  +   '<div class="rp-mode" id="rp-mode-collect"></div>'
  +   '<div class="rp-mode" id="rp-mode-newvendo"></div>'
  +   '<div class="rp-mode" id="rp-mode-newsub"></div>'
  +   '<div class="rp-mode" id="rp-mode-pullout"></div>'
  +   '<div class="rp-mode" id="rp-mode-cutoff"></div>'
  +   '<div class="rp-mode" id="rp-mode-status"></div>'
  +   '<div class="rp-mode" id="rp-mode-cash"></div>'
  +   '<div class="rp-mode" id="rp-mode-financial"></div>'
  + '</div>'
  + '<datalist id="rp-dl-desc"></datalist>'
  + '<datalist id="rp-dl-cat"></datalist>'
  + '<datalist id="rp-dl-people"></datalist>';
}

function rpFillDatalists(){
  const d = document.getElementById('rp-dl-desc');
  const p = document.getElementById('rp-dl-people');
  if(d) d.innerHTML = (rpHints.descriptions||[]).map(function(x){ return '<option value="'+rpEsc(x.d)+'">'; }).join('');
  if(p) p.innerHTML = (rpHints.people||[]).map(function(x){ return '<option value="'+rpEsc(x)+'">'; }).join('');
  const c = document.getElementById('rp-dl-cat');
  if(c) c.innerHTML = (rpHints.categories||[]).map(function(x){ return '<option value="'+rpEsc(x.name)+'">'; }).join('');
}

let rpFund  = 'Collections';
const rpState = { 'Collections': { date:null, draft:null }, 'Sir Wendell': { date:null, draft:null } };
const RP_LS = 'spawn_rp_workdate';
function rpSaveWorkDate(){
  try {
    const m = JSON.parse(localStorage.getItem(RP_LS) || '{}');
    m[rpFund] = rpDate;
    localStorage.setItem(RP_LS, JSON.stringify(m));
  } catch(e){}
}
function rpLoadWorkDate(fund){
  try { return (JSON.parse(localStorage.getItem(RP_LS) || '{}'))[fund] || null; }
  catch(e){ return null; }
}
function rpStash(){
  if(rpTab === 'expense'){
    rpState[rpFund] = { date: rpDate, draft: rpDraft };
  }
}
function rpFundShort(){ return rpFund === 'Sir Wendell' ? 'Admin' : 'Collections'; }
// Display label only. The stored value stays 'Sir Wendell' so the database,
// the RPCs and the sheet bridge are untouched.
function rpFundName(v){ return v === 'Sir Wendell' ? 'Admin Expense' : 'Daily Expense'; }
function rpFundColor(){ return rpFund === 'Sir Wendell' ? RP_BRAND.magenta : RP_BRAND.blue; }

window.rpSetTab = function(mode){
  if(mode !== rpTab) rpStash();
  rpTab = mode;
  document.querySelectorAll('#panel-reports .rp-tab').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-rp') === mode);
  });
  document.querySelectorAll('#panel-reports .rp-mode').forEach(function(m){
    m.classList.toggle('active', m.id === 'rp-mode-' + mode);
  });
  document.getElementById('rp-actions').innerHTML = '';
  if(mode === 'wendell') rpRenderWendell();
  if(mode === 'expense'){
    rpFund = 'Collections';
    const st = rpState[rpFund];
    rpDate  = st.date || rpLoadWorkDate(rpFund) || rpPhToday();
    rpDraft = st.draft && st.draft.length ? st.draft : [rpBlankRow(), rpBlankRow(), rpBlankRow()];
    rpRenderExpense();
  }
  if(mode === 'subinc')   rpRenderSubInc();
  if(mode === 'summary')  rpRenderSummary();
  if(mode === 'salesrecon') rpRenderRecon();
  if(mode === 'sales')    rpRenderSales();
  if(mode === 'status')   rpRenderStatus();
  if(mode === 'financial' && typeof fnLoad === 'function') fnLoad();
  if(['collect','newvendo','newsub','pullout','cutoff','cash'].indexOf(mode) >= 0) rpRenderTodo(mode);
};

// ══════════════════════════════════════════════════════════
// 1. DAILY EXPENSE  — bulk entry
// ══════════════════════════════════════════════════════════
async function rpRenderExpense(){
  const host = document.getElementById('rp-mode-expense');
  host.innerHTML = '<div style="padding:26px;text-align:center;color:#6b7394;font-size:13px">Loading expense book\u2026</div>';

  let gaps = [], day = null;
  try {
    const today = rpPhToday();
    const mFrom = rpDate.slice(0,8) + '01';
    const lastD = new Date(+rpDate.slice(0,4), +rpDate.slice(5,7), 0).getDate();
    let   mTo   = rpDate.slice(0,8) + String(lastD).padStart(2,'0');
    if(mTo > today) mTo = today;
    const res = await Promise.all([
      rpRpc('spawn_expense_gaps', { p_from: mFrom, p_to: mTo, p_fund: rpFund }),
      rpRpc('spawn_expense_day', { p_date: rpDate })
    ]);
    gaps = res[0] || []; day = res[1] || {};
  } catch(e){
    host.innerHTML = '<div class="rp-card" style="color:#DF1A35">Could not load: ' + rpEsc(e.message) + '</div>';
    return;
  }
  rpDayRows = (day.rows || []).filter(function(r){ return r.paid_from === rpFund; })
                              .sort(function(a,b){ return b.id - a.id; });
  const dayTotal = rpDayRows.reduce(function(a,r){ return a + (Number(r.amount)||0); }, 0);
  const mtdFund  = rpFund === 'Sir Wendell' ? day.mtd_wendell : day.mtd_collections;
  if(!rpDraft.length) rpDraft = [rpBlankRow(), rpBlankRow(), rpBlankRow()];

  const missing = gaps.filter(function(g){ return g.count === 0; });
  const filled = gaps.filter(function(g){ return g.count > 0 && g.date !== rpDate; });
  const lastFilled = filled.length ? filled[filled.length-1].date : null;

  const gapChips = gaps.map(function(g){
    const cls = g.count ? 'has' : 'gap';
    const sel = (g.date === rpDate) ? ' sel' : '';
    return '<button class="rp-chip ' + cls + sel + '" onclick="rpChangeDate(\'' + g.date + '\')">'
         + g.date.slice(5) + (g.count ? ' \u00b7 ' + rpPesoShort(g.total) : '') + '</button>';
  }).join('');
  const mLabel = RP_MONTHS[parseInt(rpDate.slice(5,7),10)] + ' ' + rpDate.slice(0,4);
  const lastLine = rpDayRows.length
    ? 'Last entered: \u201c' + rpEsc(rpDayRows[0].description || rpDayRows[0].category) + '\u201d '
      + rpPeso(rpDayRows[0].amount) + (rpDayRows[0].co ? ' \u00b7 ' + rpEsc(rpDayRows[0].co) : '')
    : 'Nothing entered for this day yet';
  const gapsHtml = gaps.length
    ? '<div style="display:flex;align-items:center;gap:8px;margin:10px 0 5px">'
      + '<button class="rp-btn" style="padding:3px 9px" onclick="rpMonthStep(-1)">\u2039</button>'
      + '<span style="font-size:11px;font-weight:800;color:#025AC6">' + mLabel + '</span>'
      + '<button class="rp-btn" style="padding:3px 9px" onclick="rpMonthStep(1)">\u203a</button>'
      + '<span style="font-size:10px;color:#6b7394">green = entered \u00b7 amber = still empty</span>'
      + '</div>'
      + '<div style="margin-bottom:4px">' + gapChips + '</div>'
    : '';

  host.innerHTML = ''
  + '<div style="background:'+rpFundColor()+';color:#fff;border-radius:10px;padding:9px 14px;margin-bottom:11px;font-size:12px;font-weight:800;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">'
  +   '<span>'+(rpFund === 'Sir Wendell' ? '\u{1F4B3} Admin Expense \u2014 capital & admin, paid by Sir Wendell' : '\u{1F4B8} Daily Expense \u2014 paid from Collections')+'</span>'
  +   '<span style="display:flex;align-items:center;gap:9px">'
  +     '<span style="font-weight:600;opacity:.92;font-size:11px">' + lastLine + '</span>'
  +     (rpFund === 'Sir Wendell' ? '' :
         '<span id="rp-mirror-badge" title="Checking whether every entry is in the sheet…" '
       + 'style="padding:3px 9px;border-radius:20px;background:rgba(255,255,255,.16);color:#fff;font-size:10.5px;font-weight:700;white-space:nowrap">\u22ef checking\u2026</span>'
       + '<button id="rp-sync-sheet" onclick="rpSyncSheet()" title="Push every daily expense not yet in the DAILY EXPENSE 2026 sheet. Safe to press more than once - already-mirrored rows are skipped." '
       + 'style="padding:4px 11px;border:1px solid rgba(255,255,255,.45);border-radius:7px;background:rgba(255,255,255,.16);color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">'
       + '\u2191 Sync to Sheet</button>')
  +   '</span>'
  + '</div>'
  + '<div class="rp-kpis tight">'
  +   '<div class="rp-kpi" style="border-bottom-color:'+rpFundColor()+'"><div class="k">Selected day</div><div class="v" id="rp-kpi-day">'+rpPeso(day.total)+'</div><div class="s">'+(day.count||0)+' entries \u00b7 '+rpDate+'</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.teal+'"><div class="k">Month to date</div><div class="v">'+rpPeso(mtdFund)+'</div><div class="s">'+RP_MONTHS[parseInt(rpDate.slice(5,7),10)]+' \u00b7 both books '+rpPesoShort(day.month_to_date)+'</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.gold+'"><div class="k">Days still empty</div><div class="v">'+missing.length+'</div><div class="s">in '+RP_MONTHS[parseInt(rpDate.slice(5,7),10)]+'</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.magenta+'"><div class="k">Unsaved in grid</div><div class="v" id="rp-kpi-draft">'+rpPeso(0)+'</div><div class="s" id="rp-kpi-draftn">0 rows ready</div></div>'
  + '</div>'

  + '<div class="rp-card">'
  +   '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">'
  +     '<div><div style="font-size:10px;font-weight:700;color:#6b7394;text-transform:uppercase;margin-bottom:3px">Entry date</div>'
  +       '<input type="date" id="rp-date" class="rp-in" style="width:170px" value="'+rpDate+'" onchange="rpChangeDate(this.value)"></div>'
  +     '<div><div style="font-size:10px;font-weight:700;color:#6b7394;text-transform:uppercase;margin-bottom:3px">Copy a previous day</div>'
  +       '<div style="display:flex;gap:5px">'
  +         '<input type="date" id="rp-copy-date" class="rp-in" style="width:150px" value="'+(lastFilled||'')+'">'
  +         '<button class="rp-btn" onclick="rpCopyDay()">\u{1F4C4} Load</button>'
  +       '</div></div>'
  +     '<button class="rp-btn" onclick="rpPasteOpen()">\u{1F4CB} Paste from Excel</button>'
  +     '<div style="flex:1"></div>'
  +     '<button class="rp-btn ok" id="rp-save" onclick="rpSaveDraft()">\u{1F4BE} Save all rows</button>'
  +   '</div>'
  +   gapsHtml
  + '</div>'

  + '<div class="rp-2col">'
  + '<div>'
  + '<div class="rp-card">'
  +   '<div style="font-size:12px;font-weight:800;color:#025AC6;margin-bottom:9px">\u270F\uFE0F New entries for <span id="rp-lbl-date">'+rpDate+'</span></div>'
  +   '<div id="rp-copy-warn" style="display:none;background:#fffaf0;border:1px solid #FFB725;border-radius:8px;padding:8px 11px;font-size:11px;color:#8a6100;margin-bottom:9px">'
  +     '<b>These rows were copied from another day.</b> The amounts came with them \u2014 they are a starting point, not a record. '
  +     'Correct every figure against the actual receipts and delete anything that did not happen, before you save.'
  +   '</div>'
  +   '<div class="rp-grid hdr"><div>#</div><div>Particulars / description</div><div>Name (c/o \u2014 released to)</div><div>Expense type</div><div class="rp-num">Amount</div><div></div></div>'
  +   '<div id="rp-rows"></div>'
  +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:10px;border-top:2px solid #f0f4ff">'
  +     '<div class="rp-keys">'
  +       '<kbd>\u2191</kbd><kbd>\u2193</kbd> move row \u00b7 <kbd>\u2190</kbd><kbd>\u2192</kbd> move column \u00b7 <kbd>Enter</kbd> next row \u00b7 <kbd>Tab</kbd> next cell<br>'
  +       'On <b>Expense type</b>: type a letter, press <kbd>Enter</kbd> or click to open the list \u00b7 <kbd>Tab</kbd> from Name skips it, <kbd>\u2192</kbd> steps into it<br>'
  +       'Past entries appear as you type \u2014 <b>click</b> one to use it. The arrow keys always move around the grid.<br>'
  +       '<kbd>Ctrl</kbd>+<kbd>D</kbd> copy cell above \u00b7 <kbd>Ctrl</kbd>+<kbd>\u232B</kbd> delete row \u00b7 <kbd>Ctrl</kbd>+<kbd>Enter</kbd> save'
  +     '</div>'
  +     '<div style="text-align:right">'
  +       '<div style="font-size:16px;font-weight:800;color:'+rpFundColor()+';margin-bottom:7px">Grid total: <span id="rp-draft-total">'+rpPeso(0)+'</span></div>'
  +       '<button class="rp-btn ok" id="rp-save2" style="padding:10px 20px;font-size:13px" onclick="rpSaveDraft()">\u{1F4BE} Save all rows</button>'
  +     '</div>'
  +   '</div>'
  + '</div>'

  + '</div>'
  + '<div class="rp-side">'
  + '<div class="rp-card">'
  +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">'
  +     '<div style="font-size:12px;font-weight:800;color:#028867">\u2705 Saved for '+rpDate+' \u2014 '+rpDayRows.length+' entries'
  +       (day.voided_count ? ' <span style="font-weight:700;color:#DF1A35;font-size:10px">\u00b7 '+day.voided_count+' voided</span>' : '')
  +       ' <span style="font-weight:600;color:#6b7394;font-size:10px">(newest first)</span></div>'
  +     '<div style="display:flex;align-items:center;gap:7px">'
  +       '<button class="rp-btn" style="padding:3px 8px;font-size:10.5px" onclick="rpVoidedOpen()">\u{1F6AB} Voided</button>'
  +       '<div style="font-size:13px;font-weight:800;color:#028867" id="rp-saved-total">'+rpPeso(dayTotal)+'</div>'
  +     '</div>'
  +   '</div>'
  +   '<div class="rp-scroll" style="max-height:calc(100vh - 300px)"><table class="rp-t"><thead><tr>'
  +     '<th>Particulars</th><th>Name (c/o)</th><th class="rp-num">Amount</th><th></th>'
  +   '</tr></thead><tbody id="rp-saved"></tbody></table></div>'
  + '</div>'
  + '</div>'
  + '</div>';

  rpDrawRows();
  rpGridBind();
  rpDrawSaved();
  // Verify against the sheet in the background - never block the grid on it.
  if(rpFund !== 'Sir Wendell' && typeof rpMirrorCheck === 'function'){
    setTimeout(function(){ rpMirrorCheck(); }, 60);
  }
  setTimeout(function(){ const f = document.querySelector('#rp-rows [data-r="0"][data-c="0"]'); if(f) f.focus(); }, 40);
}

function rpBlankRow(){
  return { description:'', co:'', category:'', amount:'' };
}

window.rpAddRows = function(n){
  for(let i=0;i<(n||1);i++) rpDraft.push(rpBlankRow());
  rpDrawRows();
};

// resolve a typed category fragment to a real category name
function rpMatchCat(txt){
  const t = (txt||'').trim().toLowerCase();
  if(!t) return '';
  const names = (rpHints.categories||[]).map(function(c){ return c.name; });
  let hit = names.find(function(n){ return n.toLowerCase() === t; });
  if(hit) return hit;
  hit = names.find(function(n){ return n.toLowerCase().indexOf(t) === 0; });
  if(hit) return hit;
  hit = names.find(function(n){ return n.toLowerCase().indexOf(t) >= 0; });
  return hit || '';
}

// ── expense-type detection ───────────────────────────────
function rpCatCellUpdate(r){
  const el = document.querySelector('#rp-rows [data-r="'+r+'"][data-c="2"]');
  const row = rpDraft[r];
  if(!el || !row) return;
  el.value = row.category || '';
  el.classList.remove('ok','warn','set','guess');
  if(row.category){
    el.classList.add('set');
    el.classList.add(row.guessed ? 'guess' : 'ok');
    el.title = row.guessed ? 'Detected from the particulars \u2014 press \u2192 then Enter to change it' : 'Chosen by you';
  } else if(row.amount) el.classList.add('warn');
}

const RP_STOP = ['pcs','pc','pack','packs','roll','rolls','box','boxes','kg','pair','set','sets','meters','meter','pieces','piece'];

function rpDescTokens(txt){
  return String(txt||'').toLowerCase()
    .replace(/[^a-z0-9\s&]/g,' ')
    .split(/\s+/)
    .filter(function(w){ return w && w.length >= 3 && !/^\d+$/.test(w) && RP_STOP.indexOf(w) < 0; });
}

// exactOnly = true while typing, so a half-finished word never locks in a
// wrong category. The looser passes run when you leave the cell.
function rpMatchDesc(txt, exactOnly){
  const list = (typeof rpHints !== 'undefined' && rpHints.descriptions) ? rpHints.descriptions : [];
  if(!list.length) return null;
  const d = String(txt||'').trim().toLowerCase();
  if(d.length < 2) return null;

  let hit = list.find(function(x){ return (x.d||'').toLowerCase() === d; });
  if(hit) return hit.c || null;
  if(exactOnly) return null;

  hit = list.find(function(x){ return (x.d||'').toLowerCase().indexOf(d) === 0; });
  if(hit) return hit.c || null;

  const mine = rpDescTokens(d);
  if(!mine.length) return null;
  let best = null, bestScore = 0;
  list.forEach(function(x){
    const theirs = rpDescTokens(x.d);
    if(!theirs.length) return;
    let hits = 0;
    theirs.forEach(function(w){ if(mine.indexOf(w) >= 0) hits++; });
    if(!hits) return;
    const score = hits / theirs.length;
    if(score > bestScore){ bestScore = score; best = x; }
  });
  return (best && bestScore >= 0.5) ? (best.c || null) : null;
}

function rpTryAutoCat(r){
  const row = rpDraft[r];
  if(!row || !row.description || row.category) return false;
  const c = rpMatchDesc(row.description, false);
  if(c){ row.category = c; row.guessed = true; rpCatCellUpdate(r); return true; }
  return false;
}

function rpAutoCatAll(){
  let n = 0;
  for(let i = 0; i < rpDraft.length; i++) if(rpTryAutoCat(i)) n++;
  return n;
}

function rpRowHtml(r, i){
  const catOk = r.category ? (r.guessed ? ' guess set' : ' ok set') : (r.amount ? ' warn' : '');
  return '<div class="rp-grid" data-i="'+i+'">'
    + '<div class="rp-rn">'+(i+1)+'</div>'
    + '<input class="rp-in cell" data-cell data-r="'+i+'" data-c="0" autocomplete="off" placeholder="description" value="'+rpEsc(r.description)+'">'
    + '<input class="rp-in cell" data-cell data-r="'+i+'" data-c="1" autocomplete="off" placeholder="c/o" value="'+rpEsc(r.co)+'">'
    + '<input class="rp-in cell rp-cat'+catOk+'" data-cell data-r="'+i+'" data-c="2" readonly placeholder="choose type" title="'+(r.category ? (r.guessed?'Detected \u2014 click to change':'Chosen by you') : 'Click or press Enter to choose')+'" value="'+rpEsc(r.category)+'" onclick="rpCatOpen('+i+')">'
    + '<input class="rp-in cell rp-num" data-cell data-r="'+i+'" data-c="3" inputmode="decimal" placeholder="0.00" value="'+rpEsc(r.amount)+'">'
    + '<button class="rp-x" tabindex="-1" title="Remove row" onclick="rpDelRow('+i+')">\u00d7</button>'
    + '</div>';
}

// Append one row to the DOM. Does NOT rebuild the grid, so whatever you are
// typing in keeps its focus and cursor position.
function rpAppendRowDom(){
  const box = document.getElementById('rp-rows');
  if(!box) return;
  const i = rpDraft.length - 1;
  const tmp = document.createElement('div');
  tmp.innerHTML = rpRowHtml(rpDraft[i], i);
  box.appendChild(tmp.firstChild);
}

function rpDrawRows(){
  const box = document.getElementById('rp-rows');
  if(!box) return;
  const active = document.activeElement;
  const keep = active && active.hasAttribute && active.hasAttribute('data-cell')
             ? { r:active.getAttribute('data-r'), c:active.getAttribute('data-c'),
                 s:(active.readOnly ? null : active.selectionStart) } : null;

  box.innerHTML = rpDraft.map(rpRowHtml).join('');

  if(keep){
    const el = box.querySelector('[data-r="'+keep.r+'"][data-c="'+keep.c+'"]');
    if(el){ el.focus(); if(keep.s != null){ try { el.setSelectionRange(keep.s, keep.s); } catch(e){} } }
  }
  rpTotals();
}

// one delegated handler for the whole grid — input, keys, blur
function rpGridBind(){
  const box = document.getElementById('rp-rows');
  if(!box || box.__bound) return;
  box.__bound = true;

  const FIELDS = ['description','co','category','amount'];
  const LASTC = 3;

  function cell(r,c){ return box.querySelector('[data-r="'+r+'"][data-c="'+c+'"]'); }
  function go(r,c,toEnd){
    rpCatClose();
    rpSugHide();
    if(r < 0) r = 0;
    while(r >= rpDraft.length){ rpDraft.push(rpBlankRow()); }
    if(box.querySelectorAll('.rp-grid').length !== rpDraft.length) rpDrawRows();
    const el = cell(r,c);
    if(el){
      el.focus();
      if(!el.readOnly){
        const p = toEnd ? el.value.length : 0;
        try { el.setSelectionRange(p,p); } catch(e){}
      }
    }
  }

  box.addEventListener('input', function(ev){
    const t = ev.target;
    if(!t.hasAttribute || !t.hasAttribute('data-cell')) return;
    const r = +t.getAttribute('data-r'), c = +t.getAttribute('data-c');
    if(!rpDraft[r]) return;
    rpDraft[r][FIELDS[c]] = t.value;
    if(c === 3) rpTotals();

    // live type detection while typing the particulars — exact matches only,
    // so a half-typed word never picks the wrong category
    if(c === 0){
      // emptied the particulars: drop a type that was only ever a guess
      if(!t.value.trim()){
        if(rpDraft[r].guessed){ rpDraft[r].category = ''; rpDraft[r].guessed = false; rpCatCellUpdate(r); }
      } else if(!rpDraft[r].category){
        const hit = rpMatchDesc(t.value, true);
        if(hit){ rpDraft[r].category = hit; rpDraft[r].guessed = true; rpCatCellUpdate(r); }
      } else if(rpDraft[r].guessed){
        // still a guess and the text changed — re-detect from scratch
        rpDraft[r].category = '';
        const hit2 = rpMatchDesc(t.value, true);
        rpDraft[r].category = hit2 || '';
        rpDraft[r].guessed  = !!hit2;
        rpCatCellUpdate(r);
      }
    }
    if(c === 0 || c === 1){ rpSugHi = -1; rpSugShow(r, c, t.value); }

    // keep one spare row at the bottom — appended, never a full redraw
    const last = rpDraft[rpDraft.length-1];
    if(last && (last.description || last.amount || last.co)){
      rpDraft.push(rpBlankRow());
      rpAppendRowDom();
    }
  });

  box.addEventListener('blur', function(ev){
    const t = ev.target;
    if(!t.hasAttribute || !t.hasAttribute('data-cell')) return;
    const r = +t.getAttribute('data-r'), c = +t.getAttribute('data-c');
    if(!rpDraft[r]) return;
    if(c === 0) rpTryAutoCat(r);   // in-place, safe during blur
    setTimeout(rpSugHide, 120);    // let a click on the popup land first
  }, true);

  box.addEventListener('keydown', function(ev){
    const t = ev.target;
    if(!t.hasAttribute || !t.hasAttribute('data-cell')) return;
    const r = +t.getAttribute('data-r'), c = +t.getAttribute('data-c');
    const k = ev.key;

    // ── while the type picker is open it owns the keyboard ──
    if(rpPopRow != null && c === 2){
      const list = rpCatList();
      if(k === 'ArrowDown'){ ev.preventDefault(); rpPopHi = Math.min(list.length-1, rpPopHi+1); rpCatDraw(); return; }
      if(k === 'ArrowUp'){   ev.preventDefault(); rpPopHi = Math.max(0, rpPopHi-1); rpCatDraw(); return; }
      if(k === 'Enter' || k === 'Tab'){ ev.preventDefault(); rpCatPick(null, rpPopHi); return; }
      if(k === 'Escape'){ ev.preventDefault(); rpCatClose(); return; }
      if(k === 'Backspace'){ ev.preventDefault(); rpPopFilter = rpPopFilter.slice(0,-1); rpPopHi = 0; rpCatDraw(); return; }
      if(k.length === 1 && /[a-zA-Z0-9 &]/.test(k)){
        ev.preventDefault(); rpPopFilter += k; rpPopHi = 0; rpCatDraw(); return;
      }
      return;
    }

    // ── suggestion popup open on Particulars / Name ──
    // Guard on the popup actually being in the DOM: tracked state can drift,
    // the element cannot.
    if(document.getElementById('rp-sug-pop') && (c === 0 || c === 1) && rpSugList.length){
      if(k === 'ArrowDown'){
        ev.preventDefault();
        if(rpSugHi < rpSugList.length - 1){ rpSugHi++; rpSugRedraw(); }
        else { rpSugHide(); go(r+1, c, true); }
        return;
      }
      if(k === 'ArrowUp'){
        ev.preventDefault();
        if(rpSugHi > 0){ rpSugHi--; rpSugRedraw(); }
        else if(rpSugHi === 0){ rpSugHi = -1; rpSugRedraw(); }
        else { rpSugHide(); go(r-1, c, true); }
        return;
      }
      if((k === 'Enter' || k === 'Tab') && rpSugHi >= 0){ ev.preventDefault(); rpSugAccept(r, c); return; }
      if(k === 'Escape'){ ev.preventDefault(); rpSugHide(); return; }
    }

    // ── closed picker: a letter, Enter or Space opens it ──
    if(c === 2 && rpPopRow == null){
      if(k === 'Enter' || k === ' ' || (k === 'ArrowDown' && ev.altKey)){
        ev.preventDefault(); rpCatOpen(r); return;
      }
      if(k.length === 1 && /[a-zA-Z]/.test(k) && !ev.ctrlKey && !ev.metaKey){
        ev.preventDefault(); rpCatOpen(r); rpPopFilter = k; rpPopHi = 0; rpCatDraw(); return;
      }
    }

    if((ev.ctrlKey || ev.metaKey) && (k === 'Enter' || k === 's')){ ev.preventDefault(); rpSaveDraft(); return; }

    // Ctrl+D — copy the cell directly above
    if((ev.ctrlKey || ev.metaKey) && (k === 'd' || k === 'D')){
      ev.preventDefault();
      if(r > 0){ rpDraft[r][FIELDS[c]] = rpDraft[r-1][FIELDS[c]]; rpDrawRows(); go(r,c,true); }
      return;
    }

    // leaving the particulars in any direction: recognise the expense type
    if(c === 0 && (k === 'Tab' || k === 'Enter' || k === 'ArrowRight' || k === 'ArrowDown') && !ev.shiftKey) rpTryAutoCat(r);

    // leaving the name: if the type is already known, skip it and go to Amount
    if(c === 1 && k === 'Tab' && !ev.shiftKey && rpDraft[r] && rpDraft[r].category){
      ev.preventDefault(); go(r, 3, true); return;
    }

    if(k === 'ArrowDown'){ ev.preventDefault(); go(r+1, c, true); return; }
    if(k === 'ArrowUp'){   ev.preventDefault(); go(r-1, c, true); return; }
    if(k === 'Enter'){     ev.preventDefault(); go(r+1, c, true); return; }

    if(k === 'ArrowRight'){
      if(t.readOnly || t.selectionStart === t.value.length){
        if(c < LASTC){ ev.preventDefault(); go(r, c+1, false); }
        else { ev.preventDefault(); go(r+1, 0, false); }
      }
      return;
    }
    if(k === 'ArrowLeft'){
      if(t.readOnly || t.selectionStart === 0){
        if(c > 0){ ev.preventDefault(); go(r, c-1, true); }
        else if(r > 0){ ev.preventDefault(); go(r-1, LASTC, true); }
      }
      return;
    }
    if(k === 'Escape'){ ev.preventDefault(); t.blur(); return; }

    // Ctrl+Backspace deletes the row
    if((ev.ctrlKey || ev.metaKey) && k === 'Backspace'){
      ev.preventDefault(); rpDelRow(r); setTimeout(function(){ go(Math.max(0,r-1), c, true); }, 0); return;
    }
  });
}

window.rpDelRow = function(i){
  rpDraft.splice(i,1);
  if(!rpDraft.length) rpDraft.push(rpBlankRow());
  rpDrawRows();
};

function rpValidDraft(){
  return rpDraft.filter(function(r){
    return (Number(r.amount)||0) > 0 && r.category;
  });
}

function rpTotals(){
  const good = rpValidDraft();
  const t = good.reduce(function(a,r){ return a + (Number(r.amount)||0); }, 0);
  const set = function(id, v){ const e = document.getElementById(id); if(e) e.textContent = v; };
  set('rp-draft-total', rpPeso(t));
  set('rp-kpi-draft',   rpPeso(t));
  set('rp-kpi-draftn',  good.length + ' row' + (good.length===1?'':'s') + ' ready');
  ['rp-save','rp-save2'].forEach(function(id){
    const b = document.getElementById(id); if(b) b.disabled = !good.length;
  });
}

window.rpMonthStep = function(n){
  const y = +rpDate.slice(0,4), m = +rpDate.slice(5,7);
  const d = new Date(y, m - 1 + n, 1);
  const ny = d.getFullYear(), nm = d.getMonth() + 1;
  const last = new Date(ny, nm, 0).getDate();
  const want = ny + '-' + String(nm).padStart(2,'0') + '-' + String(Math.min(+rpDate.slice(8,10), last)).padStart(2,'0');
  rpChangeDate(want);
};

window.rpChangeDate = function(d){
  if(!d) return;
  const dirty = rpValidDraft().length;
  if(dirty && !confirm(dirty + ' unsaved row(s) in the grid will be cleared. Continue?')) {
    const di = document.getElementById('rp-date'); if(di) di.value = rpDate;
    return;
  }
  rpDate  = d;
  rpSaveWorkDate();
  rpDraft = [rpBlankRow(), rpBlankRow(), rpBlankRow()];
  rpRenderExpense();
};

window.rpSaveDraft = async function(){
  const filled = rpAutoCatAll();          // catch any row still missing a type
  if(filled) rpDrawRows();
  const good = rpValidDraft();
  if(!good.length){ if(window.toast) toast('Nothing to save \u2014 each row needs an amount and an expense type.'); return; }
  const btns = ['rp-save','rp-save2'].map(function(id){ return document.getElementById(id); }).filter(Boolean);
  btns.forEach(function(b){ b.disabled = true; b.textContent = 'Saving\u2026'; });
  const payload = good.map(function(r){
    return {
      expense_date: rpDate,
      description:  (r.description||'').trim() || null,
      co:           (r.co||'').trim() || null,
      category:     r.category,
      amount:       Number(r.amount),
      paid_from:    rpFund,
      source:       'dashboard',
      created_by:   'dashboard'
    };
  });
  try {
    const written = await rpRest('expenses', { method:'POST', headers:{ Prefer:'return=representation' }, body:JSON.stringify(payload) });
    if(Array.isArray(written)) rpJustSaved = rpJustSaved.concat(written.map(function(x){ return x.id; }));
    if(window.toast) toast('\u2705 Saved ' + payload.length + ' entries for ' + rpDate + ' \u2014 still on this date, keep going');
    rpSaveWorkDate();
    rpDraft = [rpBlankRow(), rpBlankRow(), rpBlankRow()];
    try { rpHints = await rpRpc('spawn_expense_hints'); rpFillDatalists(); } catch(e){}
    rpRenderExpense();
  } catch(e){
    if(window.toast) toast('\u274c Save failed: ' + e.message);
    btns.forEach(function(b){ b.disabled = false; b.textContent = '\u{1F4BE} Save all rows'; });
  }
};

function rpDrawSaved(){
  const tb = document.getElementById('rp-saved');
  if(!tb) return;
  if(!rpDayRows.length){
    tb.innerHTML = '<tr><td colspan="4" style="padding:18px;text-align:center;color:#8b93ad">No entries saved for this day yet.</td></tr>';
    return;
  }
  tb.innerHTML = rpDayRows.map(function(r, n){
    const fresh = rpJustSaved.indexOf(r.id) >= 0;
    return '<tr'+(fresh?' style="background:#f0fff8"':'')+'>'
      + (n === 0 ? '' : '')
      + '<td>'+(fresh?'<span style="color:#028867;font-weight:800;margin-right:4px">\u2713</span>':'')+rpEsc(r.description||'\u2014')
      +   '<div style="font-size:9.5px;color:#8b93ad">'+rpEsc(r.category)+'</div></td>'
      + '<td style="color:'+(r.co?'#6b7394':'#DF1A35')+'">'+rpEsc(r.co||'no name')+'</td>'
      + '<td class="rp-num" style="font-weight:700">'+rpPeso(r.amount)+'</td>'
      + '<td><button class="rp-x" title="Void this entry (admin password)" onclick="rpDelSaved('+r.id+')">\u00d7</button></td>'
      + '</tr>';
  }).join('');
}

// One modal, two fields: reason + password. Resolves {reason, pw} or null.
function rpVoidModal(row){
  return new Promise(function(resolve){
    const old = document.getElementById('rp-void-ov'); if(old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'rp-void-ov';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:100040;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:18px;max-width:430px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden">'
      + '<div style="background:linear-gradient(135deg,#DF1A35,#8f0f22);padding:16px 22px;color:#fff;font-size:16px;font-weight:800">\u{1F6AB} Void expense entry</div>'
      + '<div style="padding:19px 22px">'
      +   '<div style="background:#fff5f5;border:1px solid #ffd4da;border-radius:9px;padding:11px 13px;margin-bottom:15px">'
      +     '<div style="font-size:13.5px;font-weight:700;color:#1a1d2e">' + rpEsc(row.description || row.category || 'Entry')
      +       ' <span style="color:#DF1A35">' + rpPeso(row.amount) + '</span></div>'
      +     '<div style="font-size:11px;color:#6b7394;margin-top:3px">' + rpEsc(row.expense_date || rpDate)
      +       (row.co ? ' \u00b7 ' + rpEsc(row.co) : '') + ' \u00b7 ' + rpEsc(row.category || '')
      +       ' \u00b7 ' + rpEsc(rpFundName(row.paid_from || rpFund)) + '</div>'
      +   '</div>'
      +   '<div style="font-size:11.5px;color:#374151;margin-bottom:13px;line-height:1.6">It comes out of every total and report, but stays on record with your name and reason, and can be restored.</div>'
      +   '<label style="display:block;font-size:10px;font-weight:700;color:#6b7394;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Reason <span style="font-weight:500;text-transform:none">(optional)</span></label>'
      +   '<input id="rp-void-why" placeholder="e.g. duplicate entry, wrong amount" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;box-sizing:border-box;outline:none;font-family:inherit;margin-bottom:13px">'
      +   '<label style="display:block;font-size:10px;font-weight:700;color:#6b7394;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Admin password</label>'
      +   '<input id="rp-void-pw" type="password" inputmode="numeric" placeholder="Required" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;box-sizing:border-box;outline:none;font-family:inherit">'
      +   '<div id="rp-void-err" style="color:#DF1A35;font-size:12px;font-weight:700;margin-top:8px;display:none">\u274c Wrong password.</div>'
      +   '<div style="display:flex;gap:8px;margin-top:18px">'
      +     '<button id="rp-void-cancel" style="flex:1;padding:11px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Cancel</button>'
      +     '<button id="rp-void-ok" style="flex:2;padding:11px;background:#DF1A35;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit">\u{1F6AB} Void entry</button>'
      +   '</div>'
      + '</div></div>';
    document.body.appendChild(ov);

    const why = document.getElementById('rp-void-why');
    const pw  = document.getElementById('rp-void-pw');
    function done(v){ ov.remove(); resolve(v); }
    function submit(){
      if(!pw.value){ pw.focus(); return; }
      resolve({ reason: why.value, pw: pw.value, close: function(){ ov.remove(); },
                wrong: function(){
                  const e = document.getElementById('rp-void-err');
                  if(e) e.style.display = 'block';
                  pw.value = ''; pw.focus();
                  const b = document.getElementById('rp-void-ok');
                  if(b){ b.disabled = false; b.textContent = '\u{1F6AB} Void entry'; }
                } });
      const b = document.getElementById('rp-void-ok');
      if(b){ b.disabled = true; b.textContent = 'Voiding\u2026'; }
    }
    document.getElementById('rp-void-cancel').onclick = function(){ done(null); };
    document.getElementById('rp-void-ok').onclick = submit;
    [why, pw].forEach(function(el){
      el.onkeydown = function(e){
        if(e.key === 'Enter'){ e.preventDefault(); if(el === why) pw.focus(); else submit(); }
        if(e.key === 'Escape'){ e.preventDefault(); done(null); }
      };
    });
    ov.addEventListener('click', function(e){ if(e.target === ov) done(null); });
    setTimeout(function(){ why.focus(); }, 60);
  });
}

window.rpDelSaved = async function(id){
  const row = rpDayRows.find(function(x){ return x.id === id; }) || {};
  const ans = await rpVoidModal(row);
  if(!ans) return;
  try {
    const res = await rpRpc('spawn_expense_void', {
      p_id: id, p_pw: ans.pw, p_by: 'dashboard', p_reason: ans.reason || null
    });
    if(!res || res.ok !== true){
      if(res && res.error === 'bad_password'){ ans.wrong(); return; }
      throw new Error((res && res.error) || 'void failed');
    }
    ans.close();
    rpJustSaved = rpJustSaved.filter(function(x){ return x !== id; });
    if(window.toast) toast('\u{1F6AB} Voided ' + rpPeso(row.amount) + ' \u2014 kept on record');
    rpRenderExpense();
  } catch(e){
    ans.close();
    if(window.toast) toast('\u274c Void failed: ' + e.message);
  }
};

// ── suggestion popup for Particulars and Name ────────────
// Deliberately NOT a <datalist>: the native one captures the arrow keys for
// its own list, which killed row navigation. This one is click-only, so the
// arrows always belong to the grid.
let rpSugCell = null, rpSugList = [], rpSugHi = -1;

function rpSugSource(c){
  if(c === 0) return (rpHints.descriptions||[]).map(function(x){ return x.d; });
  if(c === 1) return (rpHints.people||[]);
  return [];
}

function rpSugShow(r, c, typed){
  rpSugHide();
  const q = String(typed||'').trim().toLowerCase();
  if(q.length < 2) return;
  const src = rpSugSource(c);
  if(!src.length) return;
  const starts = [], has = [];
  for(let i=0; i<src.length && starts.length + has.length < 40; i++){
    const v = String(src[i]||''); const lv = v.toLowerCase();
    if(lv === q) continue;
    if(lv.indexOf(q) === 0) starts.push(v);
    else if(lv.indexOf(q) > 0) has.push(v);
  }
  const list = starts.concat(has).slice(0, 8);
  if(!list.length) return;
  rpSugList = list;
  if(rpSugHi >= list.length) rpSugHi = -1;

  const cell = document.querySelector('#rp-rows [data-r="'+r+'"][data-c="'+c+'"]');
  if(!cell) return;
  const pop = document.createElement('div');
  pop.className = 'rp-pop'; pop.id = 'rp-sug-pop';
  pop.innerHTML = list.map(function(v, n){
      return '<div class="'+(n===rpSugHi?'hi':'')+'" onmousedown="rpSugPick(event,'+r+','+c+',\'' + rpEsc(v).replace(/'/g,"\\\\'") + '\')">' + rpEsc(v) + '</div>';
    }).join('')
    + '<div class="hint">\u2191\u2193 choose \u00b7 Enter or Tab to use \u00b7 Esc to dismiss</div>';
  (document.getElementById('panel-reports') || document.body).appendChild(pop);
  const b = cell.getBoundingClientRect();
  pop.style.minWidth = Math.max(190, b.width) + 'px';
  const h = pop.offsetHeight;
  pop.style.left = Math.min(b.left, window.innerWidth - pop.offsetWidth - 12) + 'px';
  pop.style.top  = (window.innerHeight - b.bottom > h + 12) ? (b.bottom + 3) + 'px' : (b.top - h - 3) + 'px';
  rpSugCell = { r:r, c:c };
}

function rpSugHide(){
  const p = document.getElementById('rp-sug-pop'); if(p) p.remove();
  rpSugCell = null; rpSugList = []; rpSugHi = -1;
}
function rpSugRedraw(){
  const pop = document.getElementById('rp-sug-pop');
  if(!pop) return;
  const items = pop.querySelectorAll('div:not(.hint)');
  items.forEach(function(el, n){ el.classList.toggle('hi', n === rpSugHi); });
  const hi = pop.querySelector('.hi'); if(hi) hi.scrollIntoView({ block:'nearest' });
}
function rpSugAccept(r, c){
  if(rpSugHi < 0 || !rpSugList[rpSugHi]) return false;
  rpSugPick(null, r, c, rpSugList[rpSugHi]);
  return true;
}

window.rpSugPick = function(ev, r, c, val){
  if(ev) ev.preventDefault();
  const FIELDS = ['description','co','category','amount'];
  if(!rpDraft[r]) return;
  rpDraft[r][FIELDS[c]] = val;
  const el = document.querySelector('#rp-rows [data-r="'+r+'"][data-c="'+c+'"]');
  if(el) el.value = val;
  rpSugHide();
  if(c === 0) rpTryAutoCat(r);
  const nxt = document.querySelector('#rp-rows [data-r="'+r+'"][data-c="'+(c+1)+'"]');
  if(nxt) nxt.focus();
};

document.addEventListener('mousedown', function(e){
  const p = document.getElementById('rp-sug-pop');
  if(p && !p.contains(e.target)) rpSugHide();
});

// ── voided entries: view and restore ─────────────────────
window.rpVoidedOpen = async function(){
  const old = document.getElementById('rp-vd-ov'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'rp-vd-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:100040;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = '<div style="background:#fff;border-radius:18px;max-width:820px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden">'
    + '<div style="background:linear-gradient(135deg,#DF1A35,#8f0f22);padding:15px 22px;color:#fff;font-size:15px;font-weight:800;display:flex;justify-content:space-between;align-items:center">'
    +   '<span>\u{1F6AB} Voided entries</span>'
    +   '<button onclick="document.getElementById(\'rp-vd-ov\').remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:7px;padding:4px 11px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit">Close</button>'
    + '</div>'
    + '<div id="rp-vd-body" style="padding:16px 20px;max-height:70vh;overflow:auto"><div style="padding:24px;text-align:center;color:#6b7394;font-size:13px">Loading\u2026</div></div>'
    + '</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  rpVoidedLoad();
};

async function rpVoidedLoad(){
  const box = document.getElementById('rp-vd-body');
  if(!box) return;
  let rows = [];
  try { rows = await rpRest('v_expense_voided?limit=300') || []; }
  catch(e){ box.innerHTML = '<div style="color:#DF1A35;padding:16px">Could not load: '+rpEsc(e.message)+'</div>'; return; }

  if(!rows.length){
    box.innerHTML = '<div style="padding:30px;text-align:center;color:#8b93ad;font-size:13px">Nothing has been voided. Every entry ever saved is still counted.</div>';
    return;
  }
  const total = rows.reduce(function(a,r){ return a + (Number(r.amount)||0); }, 0);
  box.innerHTML =
      '<div style="background:#fff8f8;border:1px solid #ffd4da;border-radius:9px;padding:10px 13px;margin-bottom:12px;font-size:12px;color:#7f1d1d">'
    +   '<b>'+rows.length+' entries voided, '+rpPeso(total)+' total.</b> These are excluded from every report. Restoring one puts it straight back into the books.'
    + '</div>'
    + '<table class="rp-t"><thead><tr>'
    +   '<th>Date</th><th>Particulars</th><th>Name</th><th class="rp-num">Amount</th><th>Voided</th><th>Reason</th><th></th>'
    + '</tr></thead><tbody>'
    + rows.map(function(r){
        return '<tr>'
          + '<td style="color:#6b7394;white-space:nowrap">'+rpEsc(r.expense_date)+'</td>'
          + '<td>'+rpEsc(r.description||'\u2014')+'<div style="font-size:9.5px;color:#8b93ad">'+rpEsc(r.category)+' \u00b7 '+rpEsc(r.paid_from)+'</div></td>'
          + '<td style="color:#6b7394">'+rpEsc(r.co||'\u2014')+'</td>'
          + '<td class="rp-num" style="font-weight:700;color:#DF1A35">'+rpPeso(r.amount)+'</td>'
          + '<td style="font-size:10px;color:#6b7394;white-space:nowrap">'+rpEsc(String(r.voided_at||'').slice(0,16).replace('T',' '))
          +   '<div>'+rpEsc(r.voided_by||'')+'</div></td>'
          + '<td style="font-size:11px;color:#6b7394">'+rpEsc(r.void_reason||'\u2014')+'</td>'
          + '<td><button class="rp-btn" style="padding:3px 9px;font-size:10.5px" onclick="rpRestore('+r.id+')">\u21a9 Restore</button></td>'
          + '</tr>';
      }).join('')
    + '</tbody></table>';
}

window.rpRestore = async function(id){
  const pw = await window.askAdminPw('Restore this entry to the books?<br><br>It will count in every total again from the moment you confirm.');
  if(pw === null) return;
  try {
    const res = await rpRpc('spawn_expense_restore', { p_id: id, p_pw: pw });
    if(!res || res.ok !== true){
      if(res && res.error === 'bad_password'){ window.markAdminPwWrong(); return; }
      throw new Error((res && res.error) || 'restore failed');
    }
    const m = document.getElementById('spawn-pw-modal'); if(m) m.remove();
    if(window.toast) toast('\u21a9 Restored ' + rpPeso(res.amount) + ' \u2014 back in the books');
    rpVoidedLoad();
    rpRenderExpense();
  } catch(e){
    const m = document.getElementById('spawn-pw-modal'); if(m) m.remove();
    if(window.toast) toast('\u274c Restore failed: ' + e.message);
  }
};

// ── expense-type picker ────────────────────────────────────
// A real dropdown, but it only swallows the arrow keys while it is open —
// closed, arrows still move around the grid.
let rpPopRow = null, rpPopHi = 0, rpPopFilter = '';

function rpCatList(){
  const all = (rpHints.categories||[]);
  if(!rpPopFilter) return all;
  const f = rpPopFilter.toLowerCase();
  const hit = all.filter(function(c){ return c.name.toLowerCase().indexOf(f) === 0; });
  return hit.length ? hit : all.filter(function(c){ return c.name.toLowerCase().indexOf(f) >= 0; });
}

window.rpCatOpen = function(i){
  rpPopRow = i; rpPopFilter = '';
  const cur = rpDraft[i] ? rpDraft[i].category : '';
  const list = rpCatList();
  rpPopHi = Math.max(0, list.findIndex(function(c){ return c.name === cur; }));
  rpCatDraw();
};

function rpCatDraw(){
  rpCatClose(true);
  if(rpPopRow == null) return;
  const cell = document.querySelector('#rp-rows [data-r="'+rpPopRow+'"][data-c="2"]');
  if(!cell) return;
  const list = rpCatList();
  const pop = document.createElement('div');
  pop.className = 'rp-pop';
  pop.id = 'rp-cat-pop';
  pop.innerHTML = list.map(function(c, n){
      return '<div class="'+(n===rpPopHi?'hi':'')+'" onmousedown="rpCatPick(event,'+n+')">'
           + '<i style="background:'+(c.color||'#94a3b8')+'"></i>' + rpEsc(c.name) + '</div>';
    }).join('')
    + '<div class="hint">Type to filter \u00b7 \u2191\u2193 choose \u00b7 Enter select \u00b7 Esc cancel</div>';
  document.body.appendChild(pop);

  const r = cell.getBoundingClientRect();
  pop.style.minWidth = Math.max(230, r.width) + 'px';
  const h = pop.offsetHeight;
  const below = window.innerHeight - r.bottom;
  pop.style.left = Math.min(r.left, window.innerWidth - pop.offsetWidth - 12) + 'px';
  pop.style.top  = (below > h + 12 || r.top < h) ? (r.bottom + 3) + 'px' : (r.top - h - 3) + 'px';
  const hi = pop.querySelector('.hi'); if(hi) hi.scrollIntoView({ block:'nearest' });
}

function rpCatClose(keepRow){
  const old = document.getElementById('rp-cat-pop'); if(old) old.remove();
  if(!keepRow){ rpPopRow = null; rpPopFilter = ''; }
}

window.rpCatPick = function(ev, n){
  if(ev) ev.preventDefault();
  const list = rpCatList();
  if(rpPopRow != null && list[n]){
    rpDraft[rpPopRow].category = list[n].name;
    rpDraft[rpPopRow].guessed = false;
    const row = rpPopRow;
    rpCatClose();
    rpDrawRows();
    const nxt = document.querySelector('#rp-rows [data-r="'+row+'"][data-c="3"]');
    if(nxt){ nxt.focus(); try { nxt.setSelectionRange(nxt.value.length, nxt.value.length); } catch(e){} }
  } else rpCatClose();
};

document.addEventListener('mousedown', function(e){
  const pop = document.getElementById('rp-cat-pop');
  if(pop && !pop.contains(e.target) && !(e.target.classList && e.target.classList.contains('rp-cat'))) rpCatClose();
});
window.addEventListener('resize', function(){ if(rpPopRow != null) rpCatDraw(); });

// ── copy a previous day's layout into the grid ──
window.rpCopyDay = async function(){
  const el = document.getElementById('rp-copy-date');
  const src = el ? el.value : null;
  if(!src){ if(window.toast) toast('Pick a date to copy from.'); return; }
  if(src === rpDate){ if(window.toast) toast('That is the day you are already on.'); return; }
  let d;
  try { d = await rpRpc('spawn_expense_day', { p_date: src }); }
  catch(e){ if(window.toast) toast('\u274c ' + e.message); return; }

  const rows = (d.rows||[]).map(function(r){
    return { description: r.description||'', co: r.co||'', category: r.category||'',
             amount: String(Number(r.amount)||'') };
  }).filter(function(r,i){ return (d.rows[i].paid_from === rpFund); });
  if(!rows.length){ if(window.toast) toast('No entries recorded on ' + src + '.'); return; }

  rpDraft = rpDraft.filter(function(r){ return r.description || r.amount; }).concat(rows, [rpBlankRow()]);
  rpAutoCatAll();
  rpDrawRows();
  rpGridBind();
  const box = document.getElementById('rp-copy-warn');
  if(box) box.style.display = 'block';
  if(window.toast) toast('Loaded ' + rows.length + ' rows from ' + src + ' \u2014 check every amount before saving');
};

// ── paste-from-Excel ──────────────────────────────────────
window.rpPasteOpen = function(){
  const old = document.getElementById('rp-paste-ov'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'rp-paste-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,10,60,.55);z-index:100020;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:660px;width:100%;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35)">'
    + '<div style="background:linear-gradient(135deg,#025AC6,#311A8E);padding:16px 20px;color:#fff;font-size:15px;font-weight:800">\u{1F4CB} Paste rows from Excel</div>'
    + '<div style="padding:18px 20px">'
    +   '<div style="font-size:12px;color:#374151;margin-bottom:8px">Copy the cells straight out of the sheet and paste below. Expected column order:</div>'
    +   '<div style="font-size:11px;font-family:monospace;background:#f6f9ff;border:1px solid #e8eeff;border-radius:7px;padding:8px 10px;margin-bottom:10px;color:#025AC6">Description &nbsp;\u2192&nbsp; c/o &nbsp;\u2192&nbsp; Expense Type &nbsp;\u2192&nbsp; Amount</div>'
    +   '<textarea id="rp-paste-ta" placeholder="Gas&#9;Tandoy&#9;Fuel &amp; Oil&#9;150" style="width:100%;height:190px;padding:10px;border:1.5px solid #dbeafe;border-radius:9px;font-size:12px;font-family:monospace;box-sizing:border-box;resize:vertical"></textarea>'
    +   '<div id="rp-paste-msg" style="font-size:11px;color:#6b7394;margin-top:7px;min-height:15px"></div>'
    +   '<div style="display:flex;gap:8px;margin-top:14px">'
    +     '<button class="rp-btn" style="flex:1" onclick="document.getElementById(\'rp-paste-ov\').remove()">Cancel</button>'
    +     '<button class="rp-btn pri" style="flex:2" onclick="rpPasteApply()">Add to grid</button>'
    +   '</div>'
    + '</div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  setTimeout(function(){ const t = document.getElementById('rp-paste-ta'); if(t) t.focus(); }, 60);
};

window.rpPasteApply = function(){
  const ta = document.getElementById('rp-paste-ta');
  const msg = document.getElementById('rp-paste-msg');
  if(!ta) return;
  const cats = (rpHints.categories||[]).map(function(c){ return c.name; });
  const lines = ta.value.split(/\r?\n/).filter(function(l){ return l.trim(); });
  let added = 0, bad = 0;
  const fresh = [];
  lines.forEach(function(line){
    const c = line.split('\t');
    const amt = parseFloat(String(c[3]!=null?c[3]:'').replace(/[^0-9.\-]/g,''));
    if(!(amt > 0)){ bad++; return; }
    let cat = (c[2]||'').trim();
    const match = cats.find(function(k){ return k.toLowerCase() === cat.toLowerCase(); });
    cat = match || '';
    fresh.push({ description:(c[0]||'').trim(), co:(c[1]||'').trim(), category:cat, amount:String(amt) });
    added++;
  });
  if(!added){ if(msg) msg.innerHTML = '<span style="color:#DF1A35;font-weight:700">No usable rows found \u2014 check that the 4th column holds the amount.</span>'; return; }
  rpDraft = rpDraft.filter(function(r){ return r.description || r.amount; }).concat(fresh, [rpBlankRow()]);
  rpAutoCatAll();
  rpGridBind();
  const ov = document.getElementById('rp-paste-ov'); if(ov) ov.remove();
  rpDrawRows();
  const unmatched = fresh.filter(function(r){ return !r.category; }).length;
  if(window.toast) toast('Added ' + added + ' row' + (added===1?'':'s') + (bad?' \u00b7 '+bad+' skipped':'') + (unmatched?' \u00b7 '+unmatched+' need an expense type':''));
};

// ══════════════════════════════════════════════════════════
// 2. EXPENSE SUMMARY — Excel-style sheet, months across columns
//    Daily book and Admin book kept in separate blocks, never mixed.
//    Source: spawn_expense_matrix(year) — split by `book`, not paid_from.
// ══════════════════════════════════════════════════════════
let rpSumYear = null, rpSumExact = false, rpSumMx = null;

async function rpRenderSummary(){
  const host = document.getElementById('rp-mode-summary');
  if(!host) return;
  if(!rpSumYear) rpSumYear = parseInt((rpDate||rpPhToday()).slice(0,4), 10);
  host.innerHTML = '<div style="padding:26px;text-align:center;color:#6b7394;font-size:13px">Building summary\u2026</div>';

  let mx;
  try { mx = await rpRpc('spawn_expense_matrix', { p_year: rpSumYear }); }
  catch(e){ host.innerHTML = '<div class="rp-card" style="color:#DF1A35">Could not load: '+rpEsc(e.message)+'</div>'; return; }
  rpSumMx = mx;

  const actions = document.getElementById('rp-actions');
  if(actions) actions.innerHTML = '<button class="rp-btn" onclick="rpExportSummary()">\u2B07\uFE0F Download CSV</button>';

  try { host.innerHTML = rpSumHtml(mx); }
  catch(e){ host.innerHTML = '<div class="rp-card" style="color:#DF1A35">Could not draw the sheet: '+rpEsc(e.message)+'</div>'; }
}

function rpSumCell(v){ return rpSumExact ? (Number(v)? rpPeso(v) : '\u2014') : rpPesoShort(v); }
function rpSumMv(r, m){ return Number((r.months||{})[String(m)]) || 0; }

function rpSumHtml(mx){
  const months = (mx.months||[]).map(Number);
  const mt     = mx.month_totals || {};
  const years  = (mx.years||[]).map(Number).sort(function(a,b){ return b-a; });
  const nm     = months.length;

  const tot = function(m){ return Number((mt[String(m)]||{}).tot)   || 0; };
  const dly = function(m){ return Number((mt[String(m)]||{}).daily) || 0; };
  const adm = function(m){ return Number((mt[String(m)]||{}).admin) || 0; };

  // biggest month, and the month-on-month movement
  var hiM = null, hiV = 0;
  months.forEach(function(m){ if(tot(m) > hiV){ hiV = tot(m); hiM = m; } });
  const lastM = nm ? months[nm-1] : null;
  const prevM = nm > 1 ? months[nm-2] : null;
  const mom   = prevM ? tot(lastM) - tot(prevM) : 0;
  const momP  = prevM && tot(prevM) ? Math.round(mom / tot(prevM) * 100) : 0;

  if(!nm) return '<div class="rp-card">No expenses recorded in '+rpSumYear+'.</div>';

  // ---- header -------------------------------------------------------
  var h = ''
  + '<div style="background:linear-gradient(135deg,#025AC6,#311A8E);color:#fff;border-radius:12px;padding:12px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
  +   '<div><div style="font-size:13px;font-weight:800">\u{1F4CA} Expense Summary \u2014 '+rpSumYear+'</div>'
  +     '<div style="font-size:10.5px;opacity:.85;margin-top:2px">Daily and Admin books side by side \u00b7 '
  +     RP_MONTHS[months[0]]+' \u2192 '+RP_MONTHS[lastM]+'</div></div>'
  +   '<div style="display:flex;gap:6px;align-items:center">'
  +     '<button class="rp-btn" style="background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.35);color:#fff" onclick="rpSumToggleExact()">'
  +       (rpSumExact ? '\u{1F4B1} Rounded' : '\u{1F522} Exact centavos') + '</button>'
  +     '<button class="rp-btn" style="background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.35);color:#fff" onclick="rpSumRefresh()">\u21bb Refresh</button>'
  +     '<select class="rp-in" style="width:auto;min-width:100px;background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.35);color:#fff;font-weight:700" onchange="rpSumSetYear(this.value)">'
  +       years.map(function(y){ return '<option value="'+y+'"'+(y===rpSumYear?' selected':'')+' style="color:#1a1d2e">'+y+'</option>'; }).join('')
  +     '</select></div>'
  + '</div>';

  // ---- KPI strip ----------------------------------------------------
  h += '<div class="rp-kpis">'
  +   '<div class="rp-kpi" style="border-bottom-color:#311A8E"><div class="k">Total expense '+rpSumYear+'</div>'
  +     '<div class="v">'+rpPeso(mx.grand)+'</div><div class="s">'+nm+' month'+(nm===1?'':'s')+' with activity</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:#025AC6"><div class="k">Daily Expense</div>'
  +     '<div class="v" style="color:#025AC6">'+rpPesoShort(mx.daily_total)+'</div>'
  +     '<div class="s">'+(Number(mx.grand)?Math.round(mx.daily_total/mx.grand*100):0)+'% of total \u00b7 from Collections</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:#C01176"><div class="k">Admin &amp; Capital</div>'
  +     '<div class="v" style="color:#C01176">'+rpPesoShort(mx.admin_total)+'</div>'
  +     '<div class="s">'+(Number(mx.grand)?Math.round(mx.admin_total/mx.grand*100):0)+'% of total \u00b7 Sir Wendell</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+(mom>0?'#DF1A35':'#028867')+'"><div class="k">'+RP_MONTHS[lastM]+' vs '+(prevM?RP_MONTHS[prevM]:'\u2014')+'</div>'
  +     '<div class="v" style="color:'+(mom>0?'#DF1A35':'#028867')+'">'+(prevM?(mom>0?'+':'')+rpPesoShort(mom):'\u2014')+'</div>'
  +     '<div class="s">'+(prevM?(momP>0?'+':'')+momP+'% \u00b7 average '+rpPesoShort(mx.grand/nm)+'/mo':'no earlier month')+'</div></div>'
  + '</div>';

  // ---- the sheet ----------------------------------------------------
  const th = function(label){ return '<th class="rp-num" style="white-space:nowrap;background:#f0f4ff;position:sticky;top:0;z-index:2">'+label+'</th>'; };
  const stickyL = 'position:sticky;left:0;background:#fff;z-index:1;min-width:190px';

  h += '<div class="rp-card" style="padding:0;overflow:hidden">'
    +  '<div style="padding:11px 14px;font-size:12px;font-weight:800;color:#025AC6;border-bottom:1px solid #e8eeff;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">'
    +    '<span>\u{1F4D2} Expense sheet \u2014 every line by month</span>'
    +    '<span style="font-weight:600;color:#8b93ad;font-size:10.5px">TOTAL and Avg/mo on the right \u00b7 % is the share of the year</span>'
    +  '</div>'
    +  '<div style="overflow:auto;max-height:640px"><table class="rp-t" style="min-width:'+(320 + nm*92)+'px;font-variant-numeric:tabular-nums">'
    +  '<thead><tr>'
    +    '<th style="'+stickyL+';background:#f0f4ff;position:sticky;top:0;left:0;z-index:3">Line</th>'
    +    months.map(function(m){ return th(RP_MONTHS[m].slice(0,3).toUpperCase()); }).join('')
    +    th('TOTAL') + th('Avg/mo') + th('%')
    +  '</tr></thead><tbody>';

  // section renderer ---------------------------------------------------
  function section(title, sub, color, bg, rows, monthFn, sectionTotal){
    var s = '<tr style="background:'+bg+'"><td style="'+stickyL+';background:'+bg+';padding:8px;font-weight:800;font-size:11.5px;color:'+color+'">'
      + rpEsc(title) + '<span style="font-weight:400;color:#8b93ad;font-size:10px"> \u00b7 '+sub+'</span></td>'
      + months.map(function(){ return '<td style="background:'+bg+'"></td>'; }).join('')
      + '<td colspan="3" style="background:'+bg+'"></td></tr>';

    (rows||[]).forEach(function(r){
      s += '<tr>'
        + '<td style="'+stickyL+';font-weight:600;font-size:11.5px">'
        +   '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:'+(r.color||'#94a3b8')+';margin-right:7px"></span>'
        +   rpEsc(r.label)+'</td>'
        + months.map(function(m){
            const v = rpSumMv(r, m);
            return '<td class="rp-num" style="font-size:11.5px;color:'+(v?'#1a1d2e':'#c9cfe0')+'">'+rpSumCell(v)+'</td>';
          }).join('')
        + '<td class="rp-num" style="font-weight:800;background:#f6f9ff;color:'+color+'">'+rpSumCell(r.total)+'</td>'
        + '<td class="rp-num" style="color:#8b93ad;font-size:11px">'+rpSumCell(Number(r.total)/nm)+'</td>'
        + '<td class="rp-num" style="color:#8b93ad;font-size:11px">'+(Number(mx.grand)?(Number(r.total)/Number(mx.grand)*100).toFixed(1)+'%':'\u2014')+'</td>'
        + '</tr>';
    });

    s += '<tr style="background:'+bg+'"><td style="'+stickyL+';background:'+bg+';font-weight:800;font-size:11.5px;color:'+color+'">Subtotal \u2014 '+rpEsc(title)+'</td>'
      + months.map(function(m){
          return '<td class="rp-num" style="font-weight:800;font-size:11.5px;color:'+color+'">'+rpSumCell(monthFn(m))+'</td>';
        }).join('')
      + '<td class="rp-num" style="font-weight:800;background:#f6f9ff;color:'+color+'">'+rpSumCell(sectionTotal)+'</td>'
      + '<td class="rp-num" style="font-weight:700;color:'+color+';font-size:11px">'+rpSumCell(Number(sectionTotal)/nm)+'</td>'
      + '<td class="rp-num" style="font-weight:700;color:'+color+';font-size:11px">'+(Number(mx.grand)?(Number(sectionTotal)/Number(mx.grand)*100).toFixed(1)+'%':'\u2014')+'</td>'
      + '</tr>';
    return s;
  }

  h += section('Daily Expense', 'paid from Collections', '#025AC6', '#eef4ff',
               mx.daily, dly, mx.daily_total);
  h += section('Admin & Capital', 'paid by Sir Wendell', '#C01176', '#fdf2f9',
               mx.admin, adm, mx.admin_total);

  // grand total + movement rows ----------------------------------------
  h += '<tr style="background:#e8f0ff"><td style="'+stickyL+';background:#e8f0ff;padding:10px 8px;font-weight:800;font-size:13px;color:#311A8E">TOTAL EXPENSE</td>'
    +  months.map(function(m){
         return '<td class="rp-num" style="padding:10px 4px;font-weight:800;font-size:12.5px;color:#311A8E">'+rpSumCell(tot(m))+'</td>';
       }).join('')
    +  '<td class="rp-num" style="padding:10px 4px;font-weight:800;font-size:12.5px;background:#dbe6ff;color:#311A8E">'+rpSumCell(mx.grand)+'</td>'
    +  '<td class="rp-num" style="font-weight:800;color:#311A8E;font-size:11.5px">'+rpSumCell(Number(mx.grand)/nm)+'</td>'
    +  '<td class="rp-num" style="font-weight:800;color:#311A8E;font-size:11.5px">100%</td></tr>';

  // change vs the month before, in pesos then in per cent
  h += '<tr><td style="'+stickyL+';font-weight:700;font-size:11px;color:#6b7394">Change vs previous month</td>'
    +  months.map(function(m, i){
         if(i === 0) return '<td class="rp-num" style="font-size:11px;color:#c9cfe0">\u2014</td>';
         const d = tot(m) - tot(months[i-1]);
         return '<td class="rp-num" style="font-size:11px;font-weight:700;color:'+(d>0?'#DF1A35':'#028867')+'">'
           + (d>0?'+':'') + rpPesoShort(Math.abs(d)===0?0:d) + '</td>';
       }).join('')
    +  '<td colspan="3" style="background:#f6f9ff"></td></tr>';

  h += '<tr><td style="'+stickyL+';font-weight:700;font-size:11px;color:#6b7394">Change %</td>'
    +  months.map(function(m, i){
         if(i === 0) return '<td class="rp-num" style="font-size:11px;color:#c9cfe0">\u2014</td>';
         const p = tot(months[i-1]);
         const d = tot(m) - p;
         const pc = p ? Math.round(d/p*100) : 0;
         return '<td class="rp-num" style="font-size:11px;font-weight:700;color:'+(d>0?'#DF1A35':'#028867')+'">'
           + (p ? (d>0?'+':'')+pc+'%' : '\u2014') + '</td>';
       }).join('')
    +  '<td colspan="3" style="background:#f6f9ff"></td></tr>';

  // daily vs admin split per month, as a share
  h += '<tr><td style="'+stickyL+';font-weight:700;font-size:11px;color:#6b7394">Daily / Admin split</td>'
    +  months.map(function(m){
         const t = tot(m);
         const dp = t ? Math.round(dly(m)/t*100) : 0;
         return '<td class="rp-num" style="font-size:10.5px;color:#8b93ad">'+(t? dp+'% / '+(100-dp)+'%' : '\u2014')+'</td>';
       }).join('')
    +  '<td colspan="3" style="background:#f6f9ff"></td></tr>';

  h += '</tbody></table></div>'
    +  '<div style="padding:10px 14px;font-size:10.5px;color:#8b93ad;border-top:1px solid #e8eeff">'
    +  'The two books are never added together inside a line \u2014 Daily is the Collections fund, Admin &amp; Capital is Sir Wendell\u2019s. '
    +  'They only meet at TOTAL EXPENSE, which is what the net income formula subtracts. '
    +  (hiM ? 'Heaviest month was '+RP_MONTHS[hiM]+' at '+rpPesoShort(hiV)+'. ' : '')
    +  'Download CSV opens straight in Excel with the same layout.</div>'
    +  '</div>';

  return h;
}

window.rpSumSetYear = function(y){ rpSumYear = parseInt(y,10); rpRenderSummary(); };
window.rpSumRefresh = function(){ rpRenderSummary(); };
window.rpSumToggleExact = function(){
  rpSumExact = !rpSumExact;
  const host = document.getElementById('rp-mode-summary');
  if(host && rpSumMx) host.innerHTML = rpSumHtml(rpSumMx);
};

window.rpExportSummary = function(){
  const mx = rpSumMx; if(!mx) return;
  const months = (mx.months||[]).map(Number);
  const mt = mx.month_totals || {};
  const q = function(v){ return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'; };
  const num = function(v){ return Number(v)||0; };
  const line = function(label, vals, total){ return [q(label)].concat(vals).concat([total]).join(','); };
  const L = [];
  L.push(['Expense Summary '+mx.year].join(','));
  L.push([q('Line')].concat(months.map(function(m){ return q(RP_MONTHS[m]); })).concat([q('TOTAL'), q('Avg/mo')]).join(','));

  L.push(q('DAILY EXPENSE (Collections)'));
  (mx.daily||[]).forEach(function(r){
    L.push(line(r.label, months.map(function(m){ return rpSumMv(r,m); }), num(r.total)) + ',' + (num(r.total)/months.length).toFixed(2));
  });
  L.push(line('Subtotal - Daily Expense',
        months.map(function(m){ return num((mt[String(m)]||{}).daily); }), num(mx.daily_total))
        + ',' + (num(mx.daily_total)/months.length).toFixed(2));

  L.push(q('ADMIN & CAPITAL (Sir Wendell)'));
  (mx.admin||[]).forEach(function(r){
    L.push(line(r.label, months.map(function(m){ return rpSumMv(r,m); }), num(r.total)) + ',' + (num(r.total)/months.length).toFixed(2));
  });
  L.push(line('Subtotal - Admin & Capital',
        months.map(function(m){ return num((mt[String(m)]||{}).admin); }), num(mx.admin_total))
        + ',' + (num(mx.admin_total)/months.length).toFixed(2));

  L.push(line('TOTAL EXPENSE',
        months.map(function(m){ return num((mt[String(m)]||{}).tot); }), num(mx.grand))
        + ',' + (num(mx.grand)/months.length).toFixed(2));
  L.push(line('Change vs previous month',
        months.map(function(m, i){ return i===0 ? '' : num((mt[String(m)]||{}).tot) - num((mt[String(months[i-1])]||{}).tot); }), ''));

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([L.join('\n')], { type:'text/csv;charset=utf-8' }));
  a.download = 'spawn-expense-summary-' + mx.year + '.csv';
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1500);
};

// ══════════════════════════════════════════════════════════
// FUND RELEASES — who money was released to, and what for
// ══════════════════════════════════════════════════════════
let rpRelFrom = null, rpRelTo = null, rpRelOpen = {};

async function rpRenderReleases(){
  const host = document.getElementById('rp-mode-releases');
  if(!rpRelFrom){
    const d = rpDate || rpPhToday();
    rpRelFrom = d.slice(0,8) + '01';
    rpRelTo   = d;
  }
  host.innerHTML = '<div style="padding:26px;text-align:center;color:#6b7394;font-size:13px">Building release report\u2026</div>';

  let rows = [];
  try {
    for(let off=0; off<20000; off+=1000){
      const p = await rpRest('expenses?select=id,expense_date,description,co,category,statement_group,book,amount,paid_from'
        + '&voided_at=is.null'
        + '&expense_date=gte.' + rpRelFrom + '&expense_date=lte.' + rpRelTo
        + '&order=expense_date.asc,id.asc&limit=1000&offset=' + off);
      if(!p || !p.length) break;
      rows = rows.concat(p);
      if(p.length < 1000) break;
    }
  } catch(e){
    host.innerHTML = '<div class="rp-card" style="color:#DF1A35">Could not load: ' + rpEsc(e.message) + '</div>'; return;
  }

  // group by the person the funds went to
  const by = {};
  rows.forEach(function(r){
    const k = (r.co && r.co.trim()) ? r.co.trim() : '\u2014 not recorded \u2014';
    by[k] = by[k] || { name:k, rows:[], total:0, coll:0, wend:0, cats:{} };
    const a = Number(r.amount) || 0;
    by[k].rows.push(r);
    by[k].total += a;
    if(r.book === 'admin') by[k].wend += a; else by[k].coll += a;
    const ck = r.category || r.statement_group || '\u2014 uncategorised \u2014';
    by[k].cats[ck] = (by[k].cats[ck]||0) + a;
  });
  const people = Object.keys(by).map(function(k){ return by[k]; })
                       .sort(function(a,b){ return b.total - a.total; });
  const grand   = people.reduce(function(s,p){ return s + p.total; }, 0);
  const unnamed = (by['\u2014 not recorded \u2014'] || {}).total || 0;

  window.__rpRelCache = { people:people, grand:grand, from:rpRelFrom, to:rpRelTo };
  document.getElementById('rp-actions').innerHTML =
    '<button class="rp-btn" onclick="rpRelExport()">\u2B07\uFE0F Download CSV</button>'
  + '<button class="rp-btn" onclick="window.print()">\u{1F5A8}\uFE0F Print</button>';

  host.innerHTML = ''
  + '<div class="rp-card">'
  +   '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">'
  +     '<div><div style="font-size:10px;font-weight:700;color:#6b7394;text-transform:uppercase;margin-bottom:3px">From</div>'
  +       '<input type="date" class="rp-in" style="width:160px" value="'+rpRelFrom+'" onchange="rpRelSet(this.value,null)"></div>'
  +     '<div><div style="font-size:10px;font-weight:700;color:#6b7394;text-transform:uppercase;margin-bottom:3px">To</div>'
  +       '<input type="date" class="rp-in" style="width:160px" value="'+rpRelTo+'" onchange="rpRelSet(null,this.value)"></div>'
  +     '<button class="rp-btn" onclick="rpRelMonth(0)">This month</button>'
  +     '<button class="rp-btn" onclick="rpRelMonth(-1)">Last month</button>'
  +   '</div>'
  + '</div>'
  + '<div class="rp-kpis">'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.gold+'"><div class="k">Total released</div><div class="v">'+rpPeso(grand)+'</div><div class="s">'+rows.length+' releases</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.blue+'"><div class="k">People</div><div class="v">'+people.length+'</div><div class="s">'+rpRelFrom+' \u2192 '+rpRelTo+'</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+(unnamed?RP_BRAND.red:RP_BRAND.teal)+'"><div class="k">No name recorded</div><div class="v">'+rpPeso(unnamed)+'</div><div class="s">'+(unnamed?'cannot be liquidated':'all releases named')+'</div></div>'
  + '</div>'
  + (unnamed ? '<div class="rp-card" style="background:#fff5f5;border-color:'+RP_BRAND.red+';font-size:11.5px;color:#7f1d1d">'
  +   '<b>'+rpPeso(unnamed)+' has no c/o name against it.</b> Those releases cannot be traced to anyone. '
  +   'Open the last row below to see them \u2014 they need a name filled in before this report can be used for liquidation.'
  + '</div>' : '')
  + '<div class="rp-card" style="padding:0;overflow:hidden">'
  +   '<div class="rp-scroll" style="border:none;max-height:600px"><table class="rp-t"><thead><tr>'
  +     '<th style="min-width:170px">Name (c/o)</th><th class="rp-num">Releases</th>'
  +     '<th>Mainly for</th><th class="rp-num">Daily</th><th class="rp-num">Admin</th><th class="rp-num">Total</th>'
  +   '</tr></thead><tbody>' + people.map(rpRelRow).join('')
  +   '</tbody><tfoot><tr style="background:#f0f4ff">'
  +     '<td style="font-weight:800;color:#025AC6">TOTAL</td><td class="rp-num" style="font-weight:800">'+rows.length+'</td><td></td>'
  +     '<td class="rp-num" style="font-weight:800">'+rpPesoShort(people.reduce(function(s,p){return s+p.coll;},0))+'</td>'
  +     '<td class="rp-num" style="font-weight:800">'+rpPesoShort(people.reduce(function(s,p){return s+p.wend;},0))+'</td>'
  +     '<td class="rp-num" style="font-weight:800;background:#e8f0ff;color:#025AC6">'+rpPesoShort(grand)+'</td>'
  +   '</tr></tfoot></table></div>'
  + '</div>';
}

function rpRelRow(p, i){
  const top = Object.keys(p.cats).sort(function(a,b){ return p.cats[b]-p.cats[a]; }).slice(0,2).join(', ');
  const open = !!rpRelOpen[p.name];
  let html = '<tr style="cursor:pointer" onclick="rpRelToggle('+i+')">'
    + '<td style="font-weight:700">' + (open ? '\u25be ' : '\u25b8 ') + rpEsc(p.name) + '</td>'
    + '<td class="rp-num" style="color:#6b7394">' + p.rows.length + '</td>'
    + '<td style="color:#6b7394;font-size:11px">' + rpEsc(top) + '</td>'
    + '<td class="rp-num">' + rpPesoShort(p.coll) + '</td>'
    + '<td class="rp-num" style="color:#C01176">' + (p.wend ? rpPesoShort(p.wend) : '\u2014') + '</td>'
    + '<td class="rp-num" style="font-weight:800;color:#025AC6">' + rpPeso(p.total) + '</td></tr>';
  if(open){
    html += '<tr><td colspan="6" style="padding:0;background:#f8faff">'
      + '<table class="rp-t" style="margin:0">'
      + '<thead><tr><th style="width:110px">Date</th><th>Particulars</th><th style="width:150px">Expense type</th><th style="width:90px">Fund</th><th class="rp-num" style="width:120px">Amount</th></tr></thead><tbody>'
      + p.rows.map(function(r){
          return '<tr><td style="color:#6b7394">'+rpEsc(r.expense_date)+'</td>'
            + '<td>'+rpEsc(r.description || '\u2014')+'</td>'
            + '<td style="color:#6b7394">'+rpEsc(r.category)+'</td>'
            + '<td style="font-size:11px;color:'+(r.paid_from==='Sir Wendell'?'#C01176':'#025AC6')+'">'+rpEsc(rpFundName(r.paid_from))+'</td>'
            + '<td class="rp-num">'+rpPeso(r.amount)+'</td></tr>';
        }).join('')
      + '<tr style="background:#eef3ff"><td colspan="4" style="font-weight:800;text-align:right">Total released to '+rpEsc(p.name)+'</td>'
      + '<td class="rp-num" style="font-weight:800;color:#025AC6">'+rpPeso(p.total)+'</td></tr>'
      + '</tbody></table></td></tr>';
  }
  return html;
}

window.rpRelToggle = function(i){
  const c = window.__rpRelCache; if(!c) return;
  const n = c.people[i].name;
  rpRelOpen[n] = !rpRelOpen[n];
  rpRenderReleases();
};
window.rpRelSet = function(f, t){
  if(f) rpRelFrom = f;
  if(t) rpRelTo = t;
  rpRenderReleases();
};
window.rpRelMonth = function(back){
  const d = new Date(rpPhToday() + 'T00:00:00');
  d.setMonth(d.getMonth() + back);
  const y = d.getFullYear(), m = d.getMonth() + 1;
  const last = new Date(y, m, 0).getDate();
  const pad = function(n){ return String(n).padStart(2,'0'); };
  rpRelFrom = y + '-' + pad(m) + '-01';
  rpRelTo   = y + '-' + pad(m) + '-' + pad(back === 0 ? Math.min(last, +rpPhToday().slice(8,10)) : last);
  rpRenderReleases();
};
window.rpRelExport = function(){
  const c = window.__rpRelCache; if(!c) return;
  const L = ['Fund Releases ' + c.from + ' to ' + c.to];
  L.push('Name,Date,Particulars,Expense Type,Fund,Amount');
  c.people.forEach(function(p){
    p.rows.forEach(function(r){
      L.push(['"'+p.name+'"','"'+r.expense_date+'"','"'+String(r.description||'').replace(/"/g,'""')+'"',
              '"'+r.category+'"','"'+r.paid_from+'"', Number(r.amount)||0].join(','));
    });
    L.push(['"'+p.name+'"','','','','TOTAL', p.total].join(','));
  });
  L.push(['GRAND TOTAL','','','','', c.grand].join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([L.join('\n')], { type:'text/csv' }));
  a.download = 'spawn-fund-releases-' + c.from + '_' + c.to + '.csv';
  a.click();
};

// ══════════════════════════════════════════════════════════
// 3. SALES — piso wifi sales by area x month (from harvests)
// ══════════════════════════════════════════════════════════
async function rpRenderSales(){
  const host = document.getElementById('rp-mode-sales');
  host.innerHTML = '<div style="padding:26px;text-align:center;color:#6b7394;font-size:13px">Reading harvest income\u2026</div>';
  const yr = parseInt((rpDate||rpPhToday()).slice(0,4), 10);
  let rows = [];
  try {
    // paginate — PostgREST caps at 1000
    for(let off=0; off<12000; off+=1000){
      const page = await rpRest('harvests?select=area,harvest_date,coins_total,spawn_share'
        + '&harvest_date=gte.' + yr + '-01-01&harvest_date=lte.' + yr + '-12-31'
        + '&order=harvest_date.asc&limit=1000&offset=' + off);
      if(!page || !page.length) break;
      rows = rows.concat(page);
      if(page.length < 1000) break;
    }
  } catch(e){
    host.innerHTML = '<div class="rp-card" style="color:#DF1A35">Could not load: '+rpEsc(e.message)+'</div>'; return;
  }

  const byArea = {}, months = {};
  rows.forEach(function(h){
    const a = h.area || 'UNASSIGNED';
    const m = parseInt(String(h.harvest_date).slice(5,7), 10);
    if(!m) return;
    months[m] = true;
    byArea[a] = byArea[a] || { area:a, months:{}, total:0, n:0 };
    byArea[a].months[m] = (byArea[a].months[m]||0) + (Number(h.coins_total)||0);
    byArea[a].total += (Number(h.coins_total)||0);
    byArea[a].n++;
  });
  const mList = Object.keys(months).map(Number).sort(function(a,b){ return a-b; });
  const aList = Object.keys(byArea).map(function(k){ return byArea[k]; }).sort(function(a,b){ return b.total-a.total; });
  const grand = aList.reduce(function(s,a){ return s+a.total; }, 0);

  host.innerHTML = ''
  + '<div class="rp-card" style="background:#f6f9ff;border-color:#dbeafe;font-size:11px;color:#374151">'
  +   '<b style="color:#025AC6">Source:</b> live <code>harvests</code> table (gross coins in the box, before the 75/25 split) \u2014 not the Excel sheet. '
  +   'The Excel <i>SALES 2026</i> sheet also carried Internet Plan sales per area; that needs the subscriber payment book wired up first (see the <b>Collections</b> tab).'
  + '</div>'
  + '<div class="rp-kpis">'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.gold+'"><div class="k">Piso wifi gross '+yr+'</div><div class="v">'+rpPeso(grand)+'</div><div class="s">'+rows.length.toLocaleString()+' harvests</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.teal+'"><div class="k">Spawn share (75%)</div><div class="v">'+rpPeso(grand*0.75)+'</div><div class="s">customer share '+rpPeso(grand*0.25)+'</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.blue+'"><div class="k">Areas reporting</div><div class="v">'+aList.length+'</div><div class="s">across '+mList.length+' months</div></div>'
  + '</div>'
  + '<div class="rp-card" style="padding:0;overflow:hidden"><div class="rp-scroll" style="border:none;max-height:560px"><table class="rp-t">'
  +   '<thead><tr><th style="min-width:150px">Area</th><th class="rp-num">Harvests</th>'
  +   mList.map(function(m){ return '<th class="rp-num">'+RP_MONTHS[m].slice(0,3).toUpperCase()+'</th>'; }).join('')
  +   '<th class="rp-num" style="background:#e8f0ff">TOTAL</th></tr></thead><tbody>'
  +   aList.map(function(a){
        return '<tr><td style="font-weight:600">'+rpEsc(a.area)+'</td><td class="rp-num" style="color:#6b7394">'+a.n+'</td>'
          + mList.map(function(m){ return '<td class="rp-num">'+rpPesoShort(a.months[m])+'</td>'; }).join('')
          + '<td class="rp-num" style="font-weight:800;background:#f6f9ff;color:#025AC6">'+rpPesoShort(a.total)+'</td></tr>';
      }).join('')
  + '</tbody></table></div></div>';
}

// ══════════════════════════════════════════════════════════
// 4. ACTIVE / INACTIVE — vendos + subscribers
// ══════════════════════════════════════════════════════════
async function rpRenderStatus(){
  const host = document.getElementById('rp-mode-status');
  host.innerHTML = '<div style="padding:26px;text-align:center;color:#6b7394;font-size:13px">Counting vendos and subscribers\u2026</div>';
  let vend = [], subs = [];
  try {
    for(let off=0; off<4000; off+=1000){
      const p = await rpRest('vendos?select=area,status&limit=1000&offset='+off);
      if(!p || !p.length) break; vend = vend.concat(p); if(p.length<1000) break;
    }
    for(let off=0; off<2000; off+=1000){
      const p = await rpRest('subscribers?select=area,status&limit=1000&offset='+off);
      if(!p || !p.length) break; subs = subs.concat(p); if(p.length<1000) break;
    }
  } catch(e){
    host.innerHTML = '<div class="rp-card" style="color:#DF1A35">Could not load: '+rpEsc(e.message)+'</div>'; return;
  }
  function tally(list){
    const m = {};
    list.forEach(function(x){
      const a = x.area || 'UNASSIGNED';
      const on = /^active$/i.test(x.status||'');
      m[a] = m[a] || { area:a, active:0, inactive:0 };
      m[a][on ? 'active' : 'inactive']++;
    });
    return Object.keys(m).map(function(k){ return m[k]; }).sort(function(a,b){ return (b.active+b.inactive)-(a.active+a.inactive); });
  }
  const vt = tally(vend), st = tally(subs);
  const vA = vend.filter(function(x){ return /^active$/i.test(x.status||''); }).length;
  const sA = subs.filter(function(x){ return /^active$/i.test(x.status||''); }).length;

  function tbl(title, rows, tot, act){
    return '<div class="rp-card" style="padding:0;overflow:hidden">'
      + '<div style="padding:11px 14px;font-size:12px;font-weight:800;color:#025AC6;border-bottom:1px solid #e8eeff">'+title
      + ' <span style="font-weight:600;color:#6b7394">\u2014 '+act+' active / '+(tot-act)+' inactive / '+tot+' total</span></div>'
      + '<div class="rp-scroll" style="border:none;max-height:330px"><table class="rp-t"><thead><tr>'
      + '<th>Area</th><th class="rp-num">Active</th><th class="rp-num">Inactive</th><th class="rp-num">Total</th></tr></thead><tbody>'
      + rows.map(function(r){
          return '<tr><td style="font-weight:600">'+rpEsc(r.area)+'</td>'
            + '<td class="rp-num" style="color:#028867;font-weight:700">'+r.active+'</td>'
            + '<td class="rp-num" style="color:'+(r.inactive?'#DF1A35':'#cbd5e1')+'">'+r.inactive+'</td>'
            + '<td class="rp-num" style="font-weight:800">'+(r.active+r.inactive)+'</td></tr>';
        }).join('')
      + '</tbody></table></div></div>';
  }

  host.innerHTML = ''
  + '<div class="rp-card" style="background:#fffaf0;border-color:'+RP_BRAND.gold+';font-size:11px;color:#374151">'
  +   '<b style="color:#8a6100">Heads up \u2014 these numbers do not match the Excel.</b> The sheet listed <b>884 vendos</b> (859 active / 25 inactive) and '
  +   '<b>383 subscribers</b> (318 / 65). The database holds <b>'+vend.length+' vendos</b> and <b>'+subs.length+' subscribers</b>, and only '
  +   (subs.length-sA)+' subscriber(s) are flagged inactive. The cutoff history from the Excel has never been posted \u2014 see the <b>Cutoff Subs</b> tab.'
  + '</div>'
  + '<div class="rp-kpis">'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.blue+'"><div class="k">Piso wifi vendos</div><div class="v">'+vend.length+'</div><div class="s">'+vA+' active</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.teal+'"><div class="k">Subscribers</div><div class="v">'+subs.length+'</div><div class="s">'+sA+' active</div></div>'
  + '</div>'
  + tbl('\u{1F4E1} Piso Wifi Vendos by area', vt, vend.length, vA)
  + tbl('\u{1F465} Internet Subscribers by area', st, subs.length, sA);
}

// ══════════════════════════════════════════════════════════
// 5. Not-yet-wired sheets
// ══════════════════════════════════════════════════════════
const RP_TODO = {
  collect: {
    t: '\u{1F9FE} Collections 2026',
    sheet: 'Date \u00b7 Name of Collector \u00b7 Collections (Name) \u00b7 Collections (Amount) \u00b7 Total Daily',
    xl: 'Excel total: \u20b11,079,312 across the year',
    why: 'This sheet is the <b>subscriber payment</b> book \u2014 who paid their internet plan, how much, collected by whom. The matching table <code>subscriber_payments</code> exists in the database but has <b>0 rows</b>.',
    need: 'Decide whether collectors log these in the Harvest PWA (same as coins), or whether the office keys them here like the daily expense grid.'
  },
  newvendo: {
    t: '\u{1F195} New Vendos 2026',
    sheet: 'Month \u00b7 Name \u00b7 VLAN \u00b7 GPS \u00b7 Address \u00b7 Host \u00b7 Contact \u00b7 Installer \u00b7 Date Installed',
    xl: 'Excel total: 146 vendos added in 2026',
    why: 'The database already has <code>vendo_installs</code> and it is wired to the Spawn Jobs flow \u2014 but it only holds <b>9 rows</b> (25 Jun onward). The 2026 install history lives only in the Excel.',
    need: 'Confirm the install log should be back-filled from the sheet, and whether installer names should be matched against the technicians table.'
  },
  newsub: {
    t: '\u{1F465} New Subscribers 2026',
    sheet: 'Month \u00b7 Name \u00b7 Address \u00b7 Internet Plan \u00b7 Contact \u00b7 Installer \u00b7 Date Installed',
    xl: 'Excel total: 45 new subscribers in 2026',
    why: 'The <code>subscribers</code> table has all the right columns (<code>installer</code>, <code>date_installed</code>, <code>plan_type</code>) but only <b>1 of 418</b> rows has an install date filled in.',
    need: 'Confirm the install dates and installers should be back-filled from the sheet onto the existing subscriber records.'
  },
  pullout: {
    t: '\u{1F4E4} Vendo Pull-Out 2026',
    sheet: 'Date of Pull Out \u00b7 Name \u00b7 VLAN \u00b7 Address \u00b7 Host',
    xl: 'Excel total: 25 pull-outs (going back to Feb 2025)',
    why: 'Pull-outs currently just flip a vendo to inactive \u2014 the date, reason and who did it are not kept. <code>vendo_trash</code> holds 2 rows.',
    need: 'Confirm whether a proper pull-out log should be added, or whether pull-out fields belong directly on the vendo record.'
  },
  cash: {
    t: '\u{1F3E6} Cash Receipts & Bank Deposits',
    sheet: 'Date \u00b7 Piso Wifi \u00b7 Subscriber (Office & Edwin Collection) \u00b7 G-Cash Collection \u00b7 Change Received / Wendell\u2019s Money \u00b7 Sales Box/Vendo \u00b7 Coins Remaining Box',
    xl: 'Lives in a separate Google Sheet \u2014 not in Report.xlsx',
    why: 'This is the <b>money-in</b> side: what actually landed in the box, the office, G-Cash and the bank each day. Pairing it against the daily expense book is what lets you trace a peso from harvest \u2192 deposit \u2192 spend.',
    need: 'Share the sheet with <code>aletamarklemer13@gmail.com</code>, or publish the tab to the web as CSV so the sync can pull it automatically.'
  },
  wendell: {
    t: '\u{1F4B3} Expenses paid by Wendell',
    sheet: 'Second tab of the same Google Sheet',
    xl: 'Excel cross-check: Jan \u20b1808,473.24 \u00b7 Feb \u20b1355,396.22 \u00b7 Mar \u20b1629,996.63',
    why: 'The <i>EXPENSE 2026</i> sheet splits every month into <b>from Collections</b> and <b>paid by Sir Wendell</b>. The 2,620 rows now in the database are the Collections side only \u2014 March matches to the peso (\u20b1456,960.50). The Wendell side has never been in the system.',
    need: 'Same access as above. Once it is in, the <b>Paid from</b> column on every expense becomes meaningful and the two funds reconcile side by side.'
  },
  cutoff: {
    t: '\u2702\uFE0F Cutoff Subscribers',
    sheet: 'Month-Year of Cut Off \u00b7 Name \u00b7 Address',
    xl: 'Excel total: 66 cutoffs, running back to 2024',
    why: 'The <code>subscribers</code> table has <code>pullout_at</code>, <code>pullout_by</code> and <code>pullout_reason</code>, all empty. Only 1 subscriber is currently marked inactive, versus 65 in the sheet.',
    need: 'Confirm the 66 cutoff names should be matched to existing subscriber records and marked inactive with their cutoff month.'
  }
};

function rpRenderTodo(mode){
  const d = RP_TODO[mode];
  const host = document.getElementById('rp-mode-' + mode);
  if(!d || !host) return;
  host.innerHTML = ''
  + '<div class="rp-todo">'
  +   '<div style="font-size:15px;font-weight:800;color:#8a6100;margin-bottom:4px">'+d.t+'</div>'
  +   '<div style="font-size:11px;color:#6b7394;margin-bottom:12px">'+d.xl+'</div>'
  +   '<div style="background:#fff;border-radius:9px;padding:12px 14px;font-size:12px;color:#374151;line-height:1.65">'
  +     '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7394;letter-spacing:.04em;margin-bottom:3px">Sheet columns</div>'
  +     '<div style="font-family:monospace;font-size:11px;color:#025AC6;margin-bottom:11px">'+d.sheet+'</div>'
  +     '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7394;letter-spacing:.04em;margin-bottom:3px">Where it stands</div>'
  +     '<div style="margin-bottom:11px">'+d.why+'</div>'
  +     '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#DF1A35;letter-spacing:.04em;margin-bottom:3px">Needs your call</div>'
  +     '<div>'+d.need+'</div>'
  +   '</div>'
  + '</div>';
}


// showP wipes .active off every .panel — put it back if we're on the import sub-tab
(function(){
  const orig = window.showP;
  window.showP = function(panel, btn){
    if(orig) orig(panel, btn);
    if(panel === 'reports' && typeof reportsInit === 'function') reportsInit();
  };
})();


// ══════════════════════════════════════════════════════════
// DASHBOARD CARDS — daily expense + capital & admin
// ══════════════════════════════════════════════════════════
window.rpxGoReports = function(){
  const btn = document.querySelector('[data-panel="reports"]');
  if(typeof showP === 'function') showP('reports', btn);
  if(typeof reportsInit === 'function') reportsInit();
};

let _rpxDaily = null, _rpxMonth = null, _rpxBusy = false;

window.rpxLoadCharts = async function(){
  if(_rpxBusy || typeof Chart === 'undefined') return;
  if(!document.getElementById('rpx-daily-chart')) return;
  _rpxBusy = true;
  try {
    const ym    = rpxMonth || rpPhToday().slice(0,7);
    const lastD  = new Date(+ym.slice(0,4), +ym.slice(5,7), 0).getDate();
    const realTd = rpPhToday();
    const today = (ym === realTd.slice(0,7)) ? realTd : (ym + '-' + lastD);
    const from  = new Date(new Date(today + 'T00:00:00').getTime() - 13*86400000).toISOString().slice(0,10);

    const rows = await rpRest('expenses?select=expense_date,amount,book&voided_at=is.null'
      + '&expense_date=gte.' + from + '&expense_date=lte.' + today + '&order=expense_date.asc&limit=1000');

    const days = [], coll = [], wend = [];
    for(let i = 0; i < 14; i++){
      const d = new Date(new Date(from + 'T00:00:00').getTime() + i*86400000).toISOString().slice(0,10);
      days.push(d.slice(5));
      coll.push(0); wend.push(0);
    }
    (rows||[]).forEach(function(r){
      const i = days.indexOf(String(r.expense_date).slice(5));
      if(i < 0) return;
      if(r.book === 'admin') wend[i] += Number(r.amount)||0; else coll[i] += Number(r.amount)||0;
    });
    const dTot = coll.reduce(function(a,b){return a+b;},0) + wend.reduce(function(a,b){return a+b;},0);
    const dl = document.getElementById('rpx-d-tot'); if(dl) dl.textContent = rpPeso(dTot);

    if(_rpxDaily) _rpxDaily.destroy();
    _rpxDaily = new Chart(document.getElementById('rpx-daily-chart'), {
      type: 'bar',
      data: { labels: days, datasets: [
        { label:'Daily Expense', data: coll, backgroundColor: RP_BRAND.blue, stack:'s' },
        { label:'Admin Expense', data: wend, backgroundColor: RP_BRAND.magenta, stack:'s' }
      ]},
      options: { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:true, labels:{ boxWidth:9, font:{size:9} } },
          tooltip:{ callbacks:{ label:function(x){ return x.dataset.label + ': ' + rpPeso(x.raw); } } } },
        scales:{ x:{ ticks:{ font:{size:8} }, grid:{display:false}, stacked:true },
                 y:{ ticks:{ font:{size:8}, callback:function(v){ return rpPesoShort(v); } }, stacked:true } } }
    });

    const yr = parseInt(ym.slice(0,4),10);
    const sum = await rpRpc('spawn_expense_summary', { p_year: yr });
    const MON = ['','JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const ms = [], mc = [], mw = [];
    for(let m = 1; m <= 12; m++){
      const f = (sum.funds||{})[m];
      if(!f) continue;
      ms.push(MON[m]); mc.push(Number(f.collections)||0); mw.push(Number(f.wendell)||0);
    }
    // This card is "Capital & Admin Expense" — show ONLY the admin/Wendell book.
    // It used to also plot the Daily series and print sum.grand (daily + admin,
    // whole year to date) in the header, so the figure never matched the title:
    // it read millions against a month's worth of admin spend.
    const admTot = mw.reduce(function(a,b){ return a + (Number(b)||0); }, 0);
    const ml = document.getElementById('rpx-m-tot'); if(ml) ml.textContent = rpPeso(admTot);

    if(_rpxMonth) _rpxMonth.destroy();
    _rpxMonth = new Chart(document.getElementById('rpx-month-chart'), {
      type: 'bar',
      data: { labels: ms, datasets: [
        { label:'Capital & Admin Expense', data: mw, backgroundColor: RP_BRAND.magenta }
      ]},
      options: { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:true, labels:{ boxWidth:9, font:{size:9} } },
          tooltip:{ callbacks:{ label:function(x){ return x.dataset.label + ': ' + rpPeso(x.raw); } } } },
        scales:{ x:{ ticks:{ font:{size:9} }, grid:{display:false} },
                 y:{ ticks:{ font:{size:8}, callback:function(v){ return rpPesoShort(v); } } } } }
    });
  } catch(e){ console.warn('rpx charts', e); }
  finally { _rpxBusy = false; }
};

(function(){
  const orig = window.showP;
  window.showP = function(panel, btn){
    if(orig) orig(panel, btn);
    if(panel === 'dash') setTimeout(function(){ rpxLoadStat(); rpxLoadCharts(); }, 400);
  };
  setTimeout(function(){
    if(document.getElementById('panel-dash') &&
       document.getElementById('panel-dash').classList.contains('active')){ rpxLoadStat(); rpxLoadCharts(); }
  }, 1800);
})();


// ══════════════════════════════════════════════════════════
// EXPENSE OF THE MONTH — dashboard stat card + month picker
// ══════════════════════════════════════════════════════════
let rpxMonth = null;   // 'YYYY-MM'

function rpxFillMonthPicker(){
  const sel = document.getElementById('rpx-month');
  if(!sel || sel.dataset.built) return;
  sel.dataset.built = '1';
  const today = rpPhToday();
  if(!rpxMonth) rpxMonth = today.slice(0,7);
  const opts = [];
  let y = +today.slice(0,4), m = +today.slice(5,7);
  for(let i = 0; i < 18; i++){
    const key = y + '-' + String(m).padStart(2,'0');
    opts.push('<option value="'+key+'"'+(key===rpxMonth?' selected':'')+'>'
      + RP_MONTHS[m].slice(0,3) + ' ' + y + '</option>');
    m--; if(m < 1){ m = 12; y--; }
  }
  sel.innerHTML = opts.join('');
}

window.rpxSetMonth = function(v){
  rpxMonth = v;
  rpxLoadStat();
  rpxLoadCharts();
};

window.rpxLoadStat = async function(){
  rpxFillMonthPicker();
  // The dashboard expense card now lives in dash.6.overview.js — it is
  // book-based and sits in the correct position in the stat row. This
  // injector used to append a duplicate at the end; disabled. Also clear
  // any card left behind by an older cached copy of this module.
  const stale = document.getElementById('rpx-stat');
  if(stale && stale.parentNode) stale.parentNode.removeChild(stale);
  return;
  const host = document.querySelector('#panel-dash .stat');
  if(!host || !host.parentNode) return;
  const wrap = host.parentNode;

  let card = document.getElementById('rpx-stat');
  if(!card){
    card = document.createElement('div');
    card.className = 'stat';
    card.id = 'rpx-stat';
    card.style.cssText = 'border-bottom-color:' + RP_BRAND.magenta + ';cursor:pointer';
    card.title = 'Total expense for the selected month \u2014 click to open the books';
    card.onclick = rpxGoReports;
    wrap.appendChild(card);
  }
  card.innerHTML = '<div class="sl" style="color:' + RP_BRAND.magenta + '">Expense of the Month</div>'
                 + '<div class="sv" style="color:' + RP_BRAND.magenta + '">\u2026</div>';

  try {
    const ym = rpxMonth || rpPhToday().slice(0,7);
    const last = new Date(+ym.slice(0,4), +ym.slice(5,7), 0).getDate();
    const rows = await rpRest('expenses?select=amount,book&voided_at=is.null'
      + '&expense_date=gte.' + ym + '-01&expense_date=lte.' + ym + '-' + last + '&limit=1000');
    let coll = 0, wend = 0;
    (rows||[]).forEach(function(r){
      const a = Number(r.amount)||0;
      if(r.book === 'admin') wend += a; else coll += a;
    });
    const mn = RP_MONTHS[parseInt(ym.slice(5,7),10)];
    card.innerHTML =
        '<div class="sl" style="color:' + RP_BRAND.magenta + '">Expense &middot; ' + mn + '</div>'
      + '<div class="sv" style="color:' + RP_BRAND.magenta + '">' + rpPeso(coll + wend) + '</div>'
      + '<div style="font-size:9px;color:var(--mu);margin-top:1px;font-weight:600">'
      +   'Daily ' + rpPesoShort(coll) + ' &middot; Admin ' + (wend ? rpPesoShort(wend) : '\u2014')
      + '</div>';
  } catch(e){
    card.innerHTML = '<div class="sl" style="color:' + RP_BRAND.magenta + '">Expense of the Month</div>'
                   + '<div class="sv" style="color:var(--mu);font-size:13px">unavailable</div>';
  }
};

// ══════════════════════════════════════════════════════════
// 2. ADMIN EXPENSE  — Sir Wendell's book, grouped by statement group
// Separate book from Daily Expense: never mixed, never summed together.
// Source: "Expenses paid by Wendell" sheet -> sheet bridge -> expenses(book='admin')
// ══════════════════════════════════════════════════════════
const RP_ADM_G = [
  ['capex',       '1. Capital Expenditure',   '#311A8E', 'One-time build-out'],
  ['network',     '2. Network & Connectivity','#025AC6', 'Upstream, telco, fiber'],
  ['maintenance', '3. Maintenance',           '#028867', 'Repairs & upkeep'],
  ['personnel',   '4. Personnel',             '#FFB725', 'Salaries & advances'],
  ['admin',       '5. Admin & General',       '#C01176', 'Cards & general']
];
let rpAdmRows = null, rpAdmMonth = null, rpAdmPending = [], rpAdmTab = 'overview';

async function rpRenderWendell(){
  const host = document.getElementById('rp-mode-wendell');
  if(!host) return;
  if(!rpAdmRows){
    host.innerHTML = '<div style="padding:26px;text-align:center;color:#6b7394;font-size:13px">Loading admin expense book\u2026</div>';
    try{
      rpAdmRows = await rpRestAll('expenses?select=id,expense_date,description,amount,note,statement_group,vendor'
        + '&book=eq.admin&voided_at=is.null&order=expense_date.desc,id.desc');
      try{
        rpAdmPending = await rpRest('sheet_outbox?select=id,payload&source=eq.wendell_expenses'
          + '&status=eq.queued&order=id&limit=50');
      }catch(e){ rpAdmPending = []; }
    }catch(e){
      host.innerHTML = '<div class="rp-card" style="border-color:#f3c2e2;color:#C01176;font-size:13px">'
        + 'Could not load the admin book.<br><span style="font-size:11px;color:#8b93ad">' + rpEsc(e.message) + '</span></div>';
      return;
    }
  }
  const months = Array.from(new Set((rpAdmRows||[]).map(function(r){ return String(r.expense_date).slice(0,7); }))).sort().reverse();
  if(!months.length){ host.innerHTML = '<div class="rp-card">No admin expenses yet.</div>'; return; }
  if(!rpAdmMonth || months.indexOf(rpAdmMonth) < 0) rpAdmMonth = months[0];
  host.innerHTML = rpAdmHtml(months);
}

function rpAdmMonthLabel(m){
  const p = String(m).split('-');
  return RP_MONTHS[Number(p[1])] + ' ' + p[0];
}

function rpAdmTabBtn(id, label, sub){
  const on = rpAdmTab === id;
  return '<button onclick="rpAdmSetTab(\'' + id + '\')" style="flex:1;min-width:120px;text-align:left;cursor:pointer;'
    + 'border:1px solid ' + (on ? '#C01176' : '#e8eeff') + ';background:' + (on ? '#fdf2f9' : '#fff') + ';'
    + 'border-radius:10px;padding:8px 12px;line-height:1.25">'
    + '<div style="font-size:12px;font-weight:800;color:' + (on ? '#C01176' : '#6b7394') + '">' + label + '</div>'
    + '<div style="font-size:10px;color:#8b93ad;margin-top:1px">' + sub + '</div></button>';
}

function rpAdmHtml(months){
  const rows  = rpAdmRows.filter(function(r){ return String(r.expense_date).slice(0,7) === rpAdmMonth; });
  const total = rows.reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);

  var h = ''
  + '<div style="background:linear-gradient(135deg,#C01176,#311A8E);color:#fff;border-radius:12px;padding:12px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
  +   '<div><div style="font-size:13px;font-weight:800">\u{1F4B3} Admin &amp; Capital Expense</div>'
  +   '<div style="font-size:10.5px;opacity:.85;margin-top:2px">Paid by Sir Wendell \u00b7 separate book from Daily Expense</div></div>'
  +   '<div style="display:flex;gap:6px;align-items:center">'
  +     '<button class="rp-btn" style="background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.35);color:#fff" onclick="rpAdmRefresh()" title="Re-read the admin book from the database">\u21bb Refresh</button>'
  +     '<select class="rp-in" style="width:auto;min-width:150px;background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.35);color:#fff;font-weight:700" onchange="rpAdmSetMonth(this.value)">'
  +       months.map(function(m){
            return '<option value="'+m+'"'+(m===rpAdmMonth?' selected':'')+' style="color:#1a1d2e">'+rpAdmMonthLabel(m)+'</option>';
          }).join('')
  +     '</select></div>'
  + '</div>'

  + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
  +   rpAdmTabBtn('overview', 'Monthly Overview', 'Totals \u00b7 by group')
  +   rpAdmTabBtn('entries',  'Payments',         rows.length + ' rows \u00b7 ' + rpPesoShort(total))
  + '</div>';

  return h + (rpAdmTab === 'entries' ? rpAdmEntriesHtml(rows, total) : rpAdmOverviewHtml(rows, total, months));
}

// ---- TAB 1: monthly overview -----------------------------------------
function rpAdmOverviewHtml(rows, total, months){
  const uncl  = rows.filter(function(r){ return !r.statement_group; });
  const unclA = uncl.reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);

  // previous month, for the movement figure
  const idx  = months.indexOf(rpAdmMonth);
  const prev = idx >= 0 && idx + 1 < months.length ? months[idx+1] : null;
  const prevT = prev ? rpAdmRows.filter(function(r){ return String(r.expense_date).slice(0,7) === prev; })
                                .reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0) : 0;
  const delta = prev ? total - prevT : 0;
  const dPct  = prev && prevT ? Math.round(delta / prevT * 100) : 0;

  var h = '<div class="rp-kpis">'
  +   '<div class="rp-kpi" style="border-bottom-color:#C01176"><div class="k">'+rpAdmMonthLabel(rpAdmMonth)+' total</div>'
  +     '<div class="v">'+rpPeso(total)+'</div><div class="s">'+rows.length+' entries</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+(delta>0?'#DF1A35':'#028867')+'"><div class="k">vs previous month</div>'
  +     '<div class="v" style="color:'+(delta>0?'#DF1A35':'#028867')+'">'+(prev?(delta>0?'+':'')+rpPesoShort(delta):'\u2014')+'</div>'
  +     '<div class="s">'+(prev? rpAdmMonthLabel(prev)+' \u00b7 '+(dPct>0?'+':'')+dPct+'%' : 'no earlier month')+'</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+(unclA?'#FFB725':'#028867')+'"><div class="k">Needs a group</div>'
  +     '<div class="v" style="color:'+(unclA?'#8a6100':'#028867')+'">'+(unclA?rpPeso(unclA):'All set')+'</div>'
  +     '<div class="s">'+uncl.length+' of '+rows.length+' entries</div></div>'
  + '</div>';

  // Statement groups, broken down to the lines inside each one
  h += '<div class="rp-card"><div style="font-size:12px;font-weight:800;color:#025AC6;margin-bottom:4px">Breakdown \u2014 '+rpAdmMonthLabel(rpAdmMonth)+'</div>'
    +  '<table class="rp-t"><tbody>';

  RP_ADM_G.forEach(function(g){
    const gr  = rows.filter(function(r){ return r.statement_group === g[0]; });
    const amt = gr.reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);

    // one line per vendor; entries with no vendor group by description
    const lm = {};
    gr.forEach(function(r){
      const k = r.vendor || r.description || '\u2014';
      if(!lm[k]) lm[k] = { amt:0, n:0 };
      lm[k].amt += (Number(r.amount)||0);
      lm[k].n   += 1;
    });
    const lines = Object.keys(lm).map(function(k){ return [k, lm[k].amt, lm[k].n]; })
                        .sort(function(a,b){ return b[1]-a[1]; });

    h += '<tr style="background:'+g[2]+'0d"><td colspan="2" style="padding:8px;font-weight:800;font-size:11.5px;color:'+g[2]+'">'
      +    rpEsc(g[1]) + '<span style="font-weight:400;color:#8b93ad;font-size:10px"> \u00b7 '+g[3]+'</span></td>'
      +  '<td class="rp-num" style="padding:8px;font-weight:800;color:'+g[2]+'">'+(amt?rpPeso(amt):'\u2014')+'</td></tr>';

    if(!lines.length){
      h += '<tr><td colspan="3" style="padding:5px 8px 5px 24px;color:#b6bdd0;font-size:11px">no entries this month</td></tr>';
    } else {
      lines.forEach(function(L){
        h += '<tr><td style="padding:4px 8px 4px 24px;font-size:11.5px">'+rpEsc(L[0])
          +    (L[2]>1?'<span style="color:#8b93ad;font-size:10px"> \u00d7'+L[2]+'</span>':'')+'</td>'
          +  '<td class="rp-num" style="font-size:10px;color:#8b93ad">'+(amt?(L[1]/amt*100).toFixed(0)+'%':'')+'</td>'
          +  '<td class="rp-num" style="font-size:11.5px;font-variant-numeric:tabular-nums">'+rpPeso(L[1])+'</td></tr>';
      });
    }
  });

  if(unclA){
    h += '<tr style="background:#fffdf5"><td colspan="2" style="padding:8px;font-weight:800;font-size:11.5px;color:#8a6100">'
      +  '\u26a0\uFE0F Not yet grouped</td>'
      +  '<td class="rp-num" style="padding:8px;font-weight:800;color:#8a6100">'+rpPeso(unclA)+'</td></tr>';
    uncl.slice().sort(function(a,b){ return (Number(b.amount)||0)-(Number(a.amount)||0); }).forEach(function(r){
      h += '<tr><td style="padding:4px 8px 4px 24px;font-size:11.5px;color:#8a6100">'+rpEsc(r.description||'\u2014')+'</td>'
        +  '<td class="rp-num" style="font-size:10px;color:#b6bdd0">'+rpEsc(String(r.expense_date).slice(5))+'</td>'
        +  '<td class="rp-num" style="font-size:11.5px">'+rpPeso(r.amount)+'</td></tr>';
    });
  }

  h += '<tr><td colspan="2" style="padding:10px 8px;border-top:2px solid #e8eeff;font-weight:800;font-size:13px;color:#311A8E">TOTAL</td>'
    +  '<td class="rp-num" style="padding:10px 8px;border-top:2px solid #e8eeff;font-weight:800;font-size:13px;color:#311A8E">'+rpPeso(total)+'</td></tr>'
    +  '</tbody></table>'
    +  '<div style="font-size:10.5px;color:#8b93ad;margin-top:7px">Every peso here is Sir Wendell\u2019s book. '
    +  'Open the <b>Payments</b> tab for the line-by-line entries behind these totals.</div></div>';
  return h;
}

// ---- TAB 2: payments, line by line -----------------------------------
function rpAdmEntriesHtml(rows, total){
  // Entry form. The tab decides the book: anything added here is admin &
  // capital, never daily. No password to add — only editing and voiding
  // ask for one.
  var h = '<div class="rp-card" style="border-color:#f3c2e2">'
    +  '<div style="font-size:12px;font-weight:800;color:#C01176;margin-bottom:9px">\u2795 Add an admin expense</div>'
    +  '<div style="display:grid;grid-template-columns:130px minmax(0,2fr) 110px minmax(0,1.2fr) auto;gap:7px;align-items:end">'
    +    '<div><label style="font-size:10px;font-weight:700;color:#6b7394;text-transform:uppercase;letter-spacing:.04em">Date</label>'
    +      '<input type="date" id="rp-adm-date" class="rp-in" value="'+rpPhToday()+'"></div>'
    +    '<div><label style="font-size:10px;font-weight:700;color:#6b7394;text-transform:uppercase;letter-spacing:.04em">Particulars</label>'
    +      '<input id="rp-adm-desc" class="rp-in" list="rp-adm-descs" placeholder="e.g. Globe Bill"></div>'
    +    '<div><label style="font-size:10px;font-weight:700;color:#6b7394;text-transform:uppercase;letter-spacing:.04em">Amount</label>'
    +      '<input id="rp-adm-amt" class="rp-in" type="number" step="0.01" min="0" placeholder="0.00"></div>'
    +    '<div><label style="font-size:10px;font-weight:700;color:#6b7394;text-transform:uppercase;letter-spacing:.04em">Remarks</label>'
    +      '<input id="rp-adm-rem" class="rp-in" placeholder="optional"></div>'
    +    '<button class="rp-btn pri" id="rp-adm-save" onclick="rpAdmAdd()">Add</button>'
    +  '</div>'
    +  '<datalist id="rp-adm-descs">'
    +    Array.from(new Set(rpAdmRows.map(function(r){ return r.description; }).filter(Boolean)))
           .slice(0,300).map(function(d){ return '<option value="'+rpEsc(d)+'">'; }).join('')
    +  '</datalist>'
    +  '<div id="rp-adm-msg" style="font-size:11px;margin-top:7px;min-height:14px"></div>'
    +  '<div style="font-size:10.5px;color:#8b93ad">Written to the "Expenses paid by Wendell" sheet first, then read back \u2014 '
    +  'so the sheet and the dashboard can never disagree. Its group is assigned automatically on the way in.</div>'
    + '</div>';

  if(rpAdmPending && rpAdmPending.length){
    h += '<div class="rp-card" style="border-color:#FFB725;background:#fffdf5">'
      +  '<div style="font-size:12px;font-weight:800;color:#8a6100;margin-bottom:7px">\u23f3 Waiting to reach the sheet \u2014 '+rpAdmPending.length+'</div>'
      +  rpAdmPending.map(function(p){
           const q = p.payload || {};
           return '<div style="font-size:11.5px;padding:3px 0;display:flex;justify-content:space-between;gap:8px">'
             + '<span>'+rpEsc(q.expense_date||'')+' \u00b7 '+rpEsc(q.description||'')+'</span>'
             + '<span style="font-weight:700">'+rpPeso(q.amount)+'</span></div>';
         }).join('')
      +  '<div style="font-size:10.5px;color:#8a6100;margin-top:6px">These appear below within about a minute.</div></div>';
  }

  const sorted = rows.slice().sort(function(a,b){
    if(String(a.expense_date) !== String(b.expense_date)) return String(a.expense_date) < String(b.expense_date) ? 1 : -1;
    return (b.id||0) - (a.id||0);
  });
  const uncl = sorted.filter(function(r){ return !r.statement_group; }).length;

  h += '<div class="rp-card">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:9px">'
    +   '<div><div style="font-size:12px;font-weight:800;color:#025AC6">Payments \u2014 '+rpAdmMonthLabel(rpAdmMonth)+'</div>'
    +     '<div id="rp-adm-pay-count" style="font-size:10.5px;color:#8b93ad;margin-top:2px">'+sorted.length+' rows \u00b7 '+rpPeso(total)+'</div></div>'
    +   '<div style="display:flex;gap:6px;align-items:center">'
    +     '<input class="rp-in" id="rp-adm-pay-q" placeholder="Search particulars, group, vendor, remarks\u2026" '
    +       'style="width:280px;max-width:52vw" oninput="rpAdmSearch(this.value)">'
    +     '<button class="rp-btn" onclick="rpAdmPayCsv()">\u2913 CSV</button>'
    +   '</div>'
    + '</div>'
    + '<div style="max-height:520px;overflow:auto"><table class="rp-t" style="min-width:800px">'
    + '<thead><tr>'
    +   '<th style="white-space:nowrap">Date</th>'
    +   '<th>Description</th>'
    +   '<th style="white-space:nowrap">Group</th>'
    +   '<th>Vendor</th>'
    +   '<th class="rp-num" style="white-space:nowrap">Amount</th>'
    + '</tr></thead><tbody id="rp-adm-pay-body">'
    + sorted.map(function(r){
        const g = RP_ADM_G.filter(function(x){ return x[0] === r.statement_group; })[0];
        const hay = [r.expense_date, r.description, r.note, r.vendor, g?g[1]:'ungrouped', r.amount]
                      .map(function(x){ return String(x==null?'':x); }).join(' ').toLowerCase();
        return '<tr data-amt="'+(Number(r.amount)||0)+'" data-s="'+rpEsc(hay)+'"'+(r.statement_group?'':' style="background:#fffdf5"')+'>'
          + '<td style="white-space:nowrap;color:#6b7394">'+rpEsc(String(r.expense_date).slice(5))+'</td>'
          + '<td>'+rpEsc(r.description||'\u2014')
          +   (r.note?'<div style="font-size:9.5px;color:#8b93ad">'+rpEsc(r.note)+'</div>':'')+'</td>'
          + '<td style="font-size:11px;font-weight:700;white-space:nowrap;color:'+(g?g[2]:'#8a6100')+'">'+(g?rpEsc(g[1].replace(/^\d\.\s*/,'')):'\u26a0\uFE0F needs group')+'</td>'
          + '<td style="font-size:11px;color:#6b7394">'+rpEsc(r.vendor||'\u2014')+'</td>'
          + '<td class="rp-num" style="font-weight:700;white-space:nowrap">'+rpPeso(r.amount)+'</td></tr>';
      }).join('')
    + '</tbody></table></div>'
    + '<div style="margin-top:9px;font-size:10.5px;color:#8b93ad">Synced from the "Expenses paid by Wendell" sheet \u2014 '
    + 'the bridge reads it every 10 seconds and new rows are filed every 5 minutes. '
    + 'Press \u21bb Refresh to pull the latest without reloading the page. '
    + (uncl ? 'Cream rows are the '+uncl+' entr'+(uncl>1?'ies':'y')+' still waiting for a statement group.' : '')
    + '</div></div>';
  return h;
}

window.rpAdmSearch = function(q){
  const t = String(q||'').toLowerCase().trim();
  const body = document.getElementById('rp-adm-pay-body');
  if(!body) return;
  var shown = 0, sum = 0;
  Array.prototype.forEach.call(body.getElementsByTagName('tr'), function(tr){
    const hit = !t || (tr.getAttribute('data-s')||'').indexOf(t) >= 0;
    tr.style.display = hit ? '' : 'none';
    if(hit){ shown++; sum += Number(tr.getAttribute('data-amt'))||0; }
  });
  const c = document.getElementById('rp-adm-pay-count');
  if(c) c.textContent = shown+' rows \u00b7 '+rpPeso(sum)+(t?' (filtered)':'');
};

window.rpAdmPayCsv = function(){
  const rows = (rpAdmRows||[]).filter(function(r){ return String(r.expense_date).slice(0,7) === rpAdmMonth; })
    .sort(function(a,b){ return String(a.expense_date) < String(b.expense_date) ? 1 : -1; });
  const q = function(v){ return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'; };
  const csv = ['Date,Description,Group,Vendor,Remarks,Amount']
    .concat(rows.map(function(r){
      const g = RP_ADM_G.filter(function(x){ return x[0] === r.statement_group; })[0];
      return [q(r.expense_date), q(r.description||''), q(g?g[1].replace(/^\d\.\s*/,''):'ungrouped'),
              q(r.vendor||''), q(r.note||''), (Number(r.amount)||0)].join(',');
    })).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  a.download = 'admin_expenses_'+rpAdmMonth+'.csv';
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1500);
};

window.rpAdmSetTab = function(t){ rpAdmTab = t; rpRenderWendell(); };

window.rpAdmSetMonth = function(m){ rpAdmMonth = m; rpRenderWendell(); };
window.rpRenderWendell = rpRenderWendell;

// Drop the cached rows so the next render re-reads the database.
window.rpAdmRefresh = function(){ rpAdmRows = null; rpRenderWendell(); };

// Queue an admin expense. It is written to the sheet by the bridge and
// comes back through the normal pull, so nothing is inserted into the book
// directly from here.
window.rpAdmAdd = async function(){
  const msg  = document.getElementById('rp-adm-msg');
  const btn  = document.getElementById('rp-adm-save');
  const date = (document.getElementById('rp-adm-date')||{}).value || '';
  const desc = ((document.getElementById('rp-adm-desc')||{}).value||'').trim();
  const amt  = Number((document.getElementById('rp-adm-amt')||{}).value || 0);
  const rem  = ((document.getElementById('rp-adm-rem')||{}).value||'').trim();
  const fail = function(t){ msg.innerHTML = '<span style="color:#DF1A35;font-weight:700">'+rpEsc(t)+'</span>'; };

  if(!date)              return fail('Pick a date.');
  if(!desc)              return fail('Particulars is required.');
  if(!(amt > 0))         return fail('Amount must be more than zero.');

  btn.disabled = true; btn.textContent = 'Adding\u2026';
  msg.innerHTML = '';
  try{
    await rpRpc('spawn_queue_admin_expense', {
      p_date: date, p_description: desc, p_amount: amt,
      p_remarks: rem || null, p_by: 'dashboard'
    });
    msg.innerHTML = '<span style="color:#028867;font-weight:700">\u2713 Queued \u2014 '
      + rpEsc(desc) + ' ' + rpPeso(amt) + '. It reaches the sheet within seconds.</span>';
    document.getElementById('rp-adm-desc').value = '';
    document.getElementById('rp-adm-amt').value  = '';
    document.getElementById('rp-adm-rem').value  = '';
    rpAdmRows = null;
    setTimeout(rpRenderWendell, 1200);
  }catch(e){
    fail('Not saved: ' + e.message);
  }finally{
    btn.disabled = false; btn.textContent = 'Add';
  }
};

// ══════════════════════════════════════════════════════════
// 3. SUBSCRIBER INCOME  — the payment ledger, cash basis
// Source: "Spawn Subsciber 2026" (both tabs) -> bridge -> subscriber_payments
// Counts PESOS RECEIVED, not subscribers who paid. One person can pay
// twice in a month and most payments cover more than one month, so a
// head-count times an average understates it.
// ══════════════════════════════════════════════════════════
let rpSubRows = null, rpSubMonth = null, rpSubTab = 'overview';

async function rpRenderSubInc(){
  const host = document.getElementById('rp-mode-subinc');
  if(!host) return;
  if(!rpSubRows){
    host.innerHTML = '<div style="padding:26px;text-align:center;color:#6b7394;font-size:13px">Loading subscriber payments\u2026</div>';
    try{
      rpSubRows = await rpRestAll('subscriber_payments?select=id,payment_date,subscriber_name,amount,collector,'
        + 'invoice_no,note,coverage_from,coverage_to,coverage_months,coverage_ok'
        + '&order=payment_date.desc,id.desc');
    }catch(e){
      host.innerHTML = '<div class="rp-card" style="border-color:#f3c2e2;color:#C01176;font-size:13px">'
        + 'Could not load subscriber payments.<br><span style="font-size:11px;color:#8b93ad">'+rpEsc(e.message)+'</span></div>';
      return;
    }
  }
  const months = Array.from(new Set(rpSubRows.map(function(r){ return String(r.payment_date).slice(0,7); }))).sort().reverse();
  if(!months.length){ host.innerHTML = '<div class="rp-card">No subscriber payments yet.</div>'; return; }
  if(!rpSubMonth || months.indexOf(rpSubMonth) < 0) rpSubMonth = months[0];
  host.innerHTML = rpSubHtml(months);
}

function rpSubTabBtn(id, label, sub){
  const on = rpSubTab === id;
  return '<button onclick="rpSubSetTab(\'' + id + '\')" style="flex:1;min-width:120px;text-align:left;cursor:pointer;'
    + 'border:1px solid ' + (on ? '#025AC6' : '#e8eeff') + ';background:' + (on ? '#f2f6ff' : '#fff') + ';'
    + 'border-radius:10px;padding:8px 12px;line-height:1.25">'
    + '<div style="font-size:12px;font-weight:800;color:' + (on ? '#025AC6' : '#6b7394') + '">' + label + '</div>'
    + '<div style="font-size:10px;color:#8b93ad;margin-top:1px">' + sub + '</div></button>';
}

function rpSubHtml(months){
  const rows  = rpSubRows.filter(function(r){ return String(r.payment_date).slice(0,7) === rpSubMonth; });
  const total = rows.reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);

  var h = ''
  + '<div style="background:linear-gradient(135deg,#028867,#025AC6);color:#fff;border-radius:12px;padding:12px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
  +   '<div><div style="font-size:13px;font-weight:800">\u{1F4B5} Subscriber Income</div>'
  +   '<div style="font-size:10.5px;opacity:.85;margin-top:2px">Cash received \u00b7 from the payment ledger</div></div>'
  +   '<div style="display:flex;gap:6px;align-items:center">'
  +     '<button class="rp-btn" style="background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.35);color:#fff" onclick="rpSubRefresh()">\u21bb Refresh</button>'
  +     '<select class="rp-in" style="width:auto;min-width:150px;background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.35);color:#fff;font-weight:700" onchange="rpSubSetMonth(this.value)">'
  +       months.map(function(m){
            return '<option value="'+m+'"'+(m===rpSubMonth?' selected':'')+' style="color:#1a1d2e">'+rpAdmMonthLabel(m)+'</option>';
          }).join('')
  +     '</select></div>'
  + '</div>'

  + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
  +   rpSubTabBtn('overview', 'Monthly Overview', 'Totals \u00b7 by collector')
  +   rpSubTabBtn('payments', 'Payments', rows.length + ' rows \u00b7 ' + rpPesoShort(total))
  + '</div>';

  return h + (rpSubTab === 'payments' ? rpSubPayHtml(rows, total) : rpSubOverviewHtml(rows, total, months));
}

// ---- TAB 1: monthly overview -----------------------------------------
function rpSubOverviewHtml(rows, total, months){
  const payers = new Set(rows.map(function(r){ return (r.subscriber_name||'').toLowerCase().trim(); })).size;
  const repeat = rows.length - payers;
  const multi  = rows.filter(function(r){ return (r.coverage_months||0) > 1; }).length;
  const unres  = rows.filter(function(r){ return r.coverage_ok !== true; });

  const idx  = months.indexOf(rpSubMonth);
  const prev = idx >= 0 && idx+1 < months.length ? months[idx+1] : null;
  const prevT = prev ? rpSubRows.filter(function(r){ return String(r.payment_date).slice(0,7) === prev; })
                               .reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0) : 0;
  const delta = prev ? total - prevT : 0;
  const dPct  = prev && prevT ? Math.round(delta/prevT*100) : 0;

  var h = '<div class="rp-kpis">'
  +   '<div class="rp-kpi" style="border-bottom-color:#028867"><div class="k">'+rpAdmMonthLabel(rpSubMonth)+' collected</div>'
  +     '<div class="v">'+rpPeso(total)+'</div><div class="s">'+rows.length+' payments</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+(delta<0?'#DF1A35':'#028867')+'"><div class="k">vs previous month</div>'
  +     '<div class="v" style="color:'+(delta<0?'#DF1A35':'#028867')+'">'+(prev?(delta>0?'+':'')+rpPesoShort(delta):'\u2014')+'</div>'
  +     '<div class="s">'+(prev? rpAdmMonthLabel(prev)+' \u00b7 '+(dPct>0?'+':'')+dPct+'%' : 'no earlier month')+'</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:#025AC6"><div class="k">Subscribers who paid</div>'
  +     '<div class="v">'+payers+'</div><div class="s">'+(repeat>0?repeat+' paid more than once':'one payment each')+'</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:#FFB725"><div class="k">Average payment</div>'
  +     '<div class="v">'+rpPeso(rows.length?total/rows.length:0)+'</div>'
  +     '<div class="s">'+multi+' cover 2+ months</div></div>'
  + '</div>';

  // by collector
  const cm = {};
  rows.forEach(function(r){
    const k = (r.collector||'\u2014').trim();
    if(!cm[k]) cm[k] = { amt:0, n:0 };
    cm[k].amt += (Number(r.amount)||0); cm[k].n += 1;
  });
  const cols = Object.keys(cm).map(function(k){ return [k, cm[k].amt, cm[k].n]; })
                     .sort(function(a,b){ return b[1]-a[1]; });
  h += '<div class="rp-card"><div style="font-size:12px;font-weight:800;color:#025AC6;margin-bottom:8px">By collector \u2014 '+rpAdmMonthLabel(rpSubMonth)+'</div>'
    +  '<table class="rp-t"><thead><tr><th>Collector</th><th class="rp-num">Payments</th><th class="rp-num">Share</th><th class="rp-num">Amount</th></tr></thead><tbody>'
    +  cols.map(function(c){
         return '<tr><td style="font-weight:600">'+rpEsc(c[0])+'</td>'
           + '<td class="rp-num" style="color:#8b93ad">'+c[2]+'</td>'
           + '<td class="rp-num" style="color:#8b93ad">'+(total?(c[1]/total*100).toFixed(1):'0.0')+'%</td>'
           + '<td class="rp-num" style="font-weight:700">'+rpPeso(c[1])+'</td></tr>';
       }).join('')
    +  '<tr><td colspan="3" style="border-top:2px solid #e8eeff;font-weight:800;color:#311A8E;padding-top:8px">TOTAL</td>'
    +  '<td class="rp-num" style="border-top:2px solid #e8eeff;font-weight:800;color:#311A8E;padding-top:8px">'+rpPeso(total)+'</td></tr>'
    +  '</tbody></table>'
    +  '<div style="font-size:10.5px;color:#8b93ad;margin-top:7px">Collector is recorded exactly as written in the sheet \u2014 '
    +  '"G-cash" and "G-Cash" appear separately, and payment channels sit alongside people. Not yet normalised.</div></div>';

  if(unres.length){
    h += '<div class="rp-card" style="border-color:#FFB725;background:#fffdf5">'
      +  '<div style="font-size:12px;font-weight:800;color:#8a6100;margin-bottom:6px">\u26a0\uFE0F Coverage period unreadable \u2014 '+unres.length+'</div>'
      +  '<div style="font-size:11px;color:#8a6100;margin-bottom:6px">Counted in the total; only the months they cover are unknown.</div>'
      +  unres.slice(0,12).map(function(r){
           return '<div style="font-size:11.5px;padding:2px 0;display:flex;justify-content:space-between;gap:8px">'
             + '<span>'+rpEsc(String(r.payment_date).slice(5))+' \u00b7 '+rpEsc(r.subscriber_name||'\u2014')
             + ' <span style="color:#b6bdd0">'+rpEsc(r.note||'no remarks')+'</span></span>'
             + '<span style="font-weight:700">'+rpPeso(r.amount)+'</span></div>';
         }).join('')
      +  '</div>';
  }
  return h;
}

// ---- TAB 2: payments, laid out like the sheet ------------------------
function rpSubCov(r){
  if(!r.coverage_from) return '\u2014';
  const f = String(r.coverage_from).slice(0,7), t = String(r.coverage_to).slice(0,7);
  return (f === t) ? rpAdmMonthLabel(f) : rpAdmMonthLabel(f)+' \u2192 '+rpAdmMonthLabel(t);
}

function rpSubPayHtml(rows, total){
  const sorted = rows.slice().sort(function(a,b){
    if(String(a.payment_date) !== String(b.payment_date)) return String(a.payment_date) < String(b.payment_date) ? 1 : -1;
    return (b.id||0) - (a.id||0);
  });
  const noInv = sorted.filter(function(r){ return !r.invoice_no; }).length;

  var h = '<div class="rp-card">'
  + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:9px">'
  +   '<div><div style="font-size:12px;font-weight:800;color:#025AC6">Payments \u2014 '+rpAdmMonthLabel(rpSubMonth)+'</div>'
  +     '<div id="rp-sub-pay-count" style="font-size:10.5px;color:#8b93ad;margin-top:2px">'+sorted.length+' rows \u00b7 '+rpPeso(total)+'</div></div>'
  +   '<div style="display:flex;gap:6px;align-items:center">'
  +     '<input class="rp-in" id="rp-sub-pay-q" placeholder="Search name, invoice, remarks, collector\u2026" '
  +       'style="width:270px;max-width:52vw" oninput="rpSubSearch(this.value)">'
  +     '<button class="rp-btn" onclick="rpSubPayCsv()">\u2913 CSV</button>'
  +   '</div>'
  + '</div>'
  + '<div style="max-height:520px;overflow:auto"><table class="rp-t" style="min-width:860px">'
  + '<thead><tr>'
  +   '<th style="white-space:nowrap">Date</th>'
  +   '<th style="white-space:nowrap">Service Invoice No.</th>'
  +   '<th>Name of Subscriber</th>'
  +   '<th>Remarks</th>'
  +   '<th class="rp-num" style="white-space:nowrap">Amount Paid</th>'
  +   '<th style="white-space:nowrap">Collector</th>'
  +   '<th style="white-space:nowrap">Covers</th>'
  + '</tr></thead><tbody id="rp-sub-pay-body">'
  + sorted.map(function(r){
      const hay = [r.payment_date, r.invoice_no, r.subscriber_name, r.note, r.collector, r.amount]
                    .map(function(x){ return String(x==null?'':x); }).join(' ').toLowerCase();
      return '<tr data-amt="'+(Number(r.amount)||0)+'" data-s="'+rpEsc(hay)+'"'+(r.coverage_ok===true?'':' style="background:#fffdf5"')+'>'
        + '<td style="white-space:nowrap;color:#6b7394">'+rpEsc(String(r.payment_date).slice(5))+'</td>'
        + '<td style="white-space:nowrap;font-size:11px;color:'+(r.invoice_no?'#311A8E':'#c9cfe0')+'">'+rpEsc(r.invoice_no||'\u2014')+'</td>'
        + '<td style="font-weight:600">'+rpEsc(r.subscriber_name||'\u2014')+'</td>'
        + '<td style="font-size:11px;color:#6b7394">'+rpEsc(r.note||'\u2014')+'</td>'
        + '<td class="rp-num" style="font-weight:700;white-space:nowrap">'+rpPeso(r.amount)+'</td>'
        + '<td style="font-size:11px;color:#6b7394;white-space:nowrap">'+rpEsc(r.collector||'\u2014')+'</td>'
        + '<td style="font-size:11px;white-space:nowrap;color:'+((r.coverage_months||0)>1?'#C01176':'#6b7394')+'">'+rpEsc(rpSubCov(r))+'</td>'
        + '</tr>';
    }).join('')
  + '</tbody></table></div>'
  + '<div style="margin-top:9px;font-size:10.5px;color:#8b93ad">Columns follow the sheet: Date \u00b7 Service Invoice No. \u00b7 Name of Subscriber \u00b7 Remarks \u00b7 Amount Paid \u00b7 Collector. '
  + '<b>Covers</b> is read from the remarks, not a sheet column. Cash basis \u2014 a payment counts in the month it was received. '
  + 'Cream rows are ones whose coverage period could not be read'+(noInv?'; '+noInv+' row'+(noInv>1?'s have':' has')+' no invoice number in the sheet':'')+'.</div>'
  + '</div>';
  return h;
}

window.rpSubSearch = function(q){
  const t = String(q||'').toLowerCase().trim();
  const body = document.getElementById('rp-sub-pay-body');
  if(!body) return;
  var shown = 0, sum = 0;
  Array.prototype.forEach.call(body.getElementsByTagName('tr'), function(tr){
    const hit = !t || (tr.getAttribute('data-s')||'').indexOf(t) >= 0;
    tr.style.display = hit ? '' : 'none';
    if(hit){ shown++; sum += Number(tr.getAttribute('data-amt'))||0; }
  });
  const c = document.getElementById('rp-sub-pay-count');
  if(c) c.textContent = shown+' rows \u00b7 '+rpPeso(sum)+(t?' (filtered)':'');
};

window.rpSubPayCsv = function(){
  const rows = (rpSubRows||[]).filter(function(r){ return String(r.payment_date).slice(0,7) === rpSubMonth; })
    .sort(function(a,b){ return String(a.payment_date) < String(b.payment_date) ? 1 : -1; });
  const q = function(v){ return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'; };
  const csv = ['Date,Service Invoice No.,Name of Subscriber,Remarks,Amount Paid,Collector,Covers']
    .concat(rows.map(function(r){
      return [q(r.payment_date), q(r.invoice_no||''), q(r.subscriber_name||''), q(r.note||''),
              (Number(r.amount)||0), q(r.collector||''), q(rpSubCov(r))].join(',');
    })).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  a.download = 'subscriber_payments_'+rpSubMonth+'.csv';
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1500);
};

window.rpSubSetTab   = function(t){ rpSubTab = t; rpRenderSubInc(); };
window.rpSubSetMonth = function(m){ rpSubMonth = m; rpRenderSubInc(); };
window.rpSubRefresh  = function(){ rpSubRows = null; rpRenderSubInc(); };
window.rpRenderSubInc = rpRenderSubInc;

// ══════════════════════════════════════════════════════════
// SALES RECONCILIATION — harvest app vs office record vs cash book
// Grouped by the harvest groups the collector app uses (Dipolog Group 1,
// Dapitan Group 2, and so on) — not by route code.
// ══════════════════════════════════════════════════════════
let rpRecMonth = null, rpRecData = null;

async function rpRenderRecon(){
  const host = document.getElementById('rp-mode-salesrecon');
  if(!host) return;
  if(!rpRecMonth) rpRecMonth = (rpDate || rpPhToday()).slice(0,7);
  host.innerHTML = '<div style="padding:26px;text-align:center;color:#6b7394;font-size:13px">Reconciling\u2026</div>';
  let d;
  try { d = await rpRpc('spawn_sales_recon', { p_ym: rpRecMonth }); }
  catch(e){ host.innerHTML = '<div class="rp-card" style="color:#DF1A35">Could not load: '+rpEsc(e.message)+'</div>'; return; }
  rpRecData = d;
  const actions = document.getElementById('rp-actions');
  if(actions) actions.innerHTML = '<button class="rp-btn" onclick="rpRecCsv()">\u2B07\uFE0F Download CSV</button>';
  try { host.innerHTML = rpRecHtml(d); }
  catch(e){ host.innerHTML = '<div class="rp-card" style="color:#DF1A35">Could not draw: '+rpEsc(e.message)+'</div>'; }
}

function rpRecPct(a, b){ return b ? Math.round((a-b)/b*100) : null; }

function rpRecHtml(d){
  const g  = d.groups || [];
  const c  = d.cash || {};
  const s  = d.subscriber || {};
  const months = d.months || [];
  const N = function(v){ return Number(v)||0; };

  const appPiso   = N(d.harvest_total);
  const appSpawn  = N(d.spawn_total);
  const bookPiso  = N(c.piso);
  const pisoGap   = appPiso - bookPiso;
  const pisoPct   = rpRecPct(appPiso, bookPiso);

  const subLedger = N(s.amount);
  const bookSub   = N(c.sub_cash) + N(c.gcash);
  const subGap    = subLedger - bookSub;
  const subPct    = rpRecPct(subLedger, bookSub);

  const officeOn  = N(d.office_rows) > 0;

  // cash book identity: piso + subscriber + change in, less expenses paid out,
  // should land on net cash. G-Cash is excluded — it never becomes notes and coins.
  const expected  = N(c.piso) + N(c.sub_cash) + N(c.change_in) - N(c.expenses);
  const residual  = N(c.net_cash) - expected;
  const undeposit = N(c.net_cash) - N(c.deposited);

  var h = ''
  + '<div style="background:linear-gradient(135deg,#028867,#025AC6);color:#fff;border-radius:12px;padding:12px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
  +   '<div><div style="font-size:13px;font-weight:800">\u{1F9EE} Sales Reconciliation</div>'
  +     '<div style="font-size:10.5px;opacity:.85;margin-top:2px">Harvest app \u00b7 office record \u00b7 cash book \u2014 by harvest group</div></div>'
  +   '<div style="display:flex;gap:6px;align-items:center">'
  +     '<button class="rp-btn" style="background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.35);color:#fff" onclick="rpRecRefresh()">\u21bb Refresh</button>'
  +     '<select class="rp-in" style="width:auto;min-width:150px;background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.35);color:#fff;font-weight:700" onchange="rpRecSetMonth(this.value)">'
  +       months.map(function(m){ return '<option value="'+m+'"'+(m===rpRecMonth?' selected':'')+' style="color:#1a1d2e">'+rpAdmMonthLabel(m)+'</option>'; }).join('')
  +     '</select></div>'
  + '</div>';

  // ---- KPI strip ----
  h += '<div class="rp-kpis">'
  +   '<div class="rp-kpi" style="border-bottom-color:#025AC6"><div class="k">Harvest app \u2014 coins</div>'
  +     '<div class="v">'+rpPeso(appPiso)+'</div><div class="s">'+g.reduce(function(a,x){return a+N(x.harvests);},0)+' harvests \u00b7 Spawn '+rpPesoShort(d.spawn_total)+'</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+(officeOn?'#028867':'#c9cfe0')+'"><div class="k">Office record \u2014 spawn share</div>'
  +     '<div class="v" style="'+(officeOn?'':'color:#b6bdd0;font-size:15px')+'">'+(officeOn?rpPeso(d.office_total):'not synced')+'</div>'
  +     '<div class="s">'+(officeOn
  ?      (N(d.office_rows)+' rows \u00b7 vs app '+rpPesoShort(appSpawn)
           + (N(d.office_unmatched_rows)?' \u00b7 '+N(d.office_unmatched_rows)+' unnamed':''))
  :      'sheet not yet connected')+'</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+(Math.abs(pisoPct||0)>5?'#DF1A35':'#028867')+'"><div class="k">App vs cash book</div>'
  +     '<div class="v" style="color:'+(Math.abs(pisoPct||0)>5?'#DF1A35':'#028867')+'">'+(pisoGap>0?'+':'')+rpPesoShort(pisoGap)+'</div>'
  +     '<div class="s">'+(pisoPct===null?'\u2014':(pisoPct>0?'+':'')+pisoPct+'% vs '+rpPesoShort(bookPiso))+'</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+(Math.abs(subPct||0)>5?'#FFB725':'#028867')+'"><div class="k">Subscriber vs cash book</div>'
  +     '<div class="v" style="color:'+(Math.abs(subPct||0)>5?'#8a6100':'#028867')+'">'+(subGap>0?'+':'')+rpPesoShort(subGap)+'</div>'
  +     '<div class="s">'+(subPct===null?'\u2014':(subPct>0?'+':'')+subPct+'% \u00b7 '+N(s.rows_)+' payments')+'</div></div>'
  + '</div>';

  // ---- by group ----
  h += '<div class="rp-card" style="padding:0;overflow:hidden">'
    +  '<div style="padding:11px 14px;font-size:12px;font-weight:800;color:#025AC6;border-bottom:1px solid #e8eeff;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">'
    +    '<span>\u{1F5FA}\uFE0F By harvest group \u2014 '+rpAdmMonthLabel(rpRecMonth)+'</span>'
    +    '<span style="font-weight:600;color:#8b93ad;font-size:10.5px">Coverage is vendos harvested out of the group roster</span></div>'
    +  '<div style="overflow:auto"><table class="rp-t" style="min-width:900px;font-variant-numeric:tabular-nums">'
    +  '<thead><tr><th style="min-width:170px">Group</th><th>Collector</th>'
    +  '<th class="rp-num">Coverage</th><th class="rp-num">Harvests</th>'
    +  '<th class="rp-num">Gross coins</th>'
    +  '<th class="rp-num">App spawn 75%</th><th class="rp-num">Office spawn</th><th class="rp-num">Gap</th>'
    +  '<th class="rp-num">Owner 25%</th><th class="rp-num">Saloy</th>'
    +  '</tr></thead><tbody>';

  g.forEach(function(x){
    const orphan = N(x.gid) < 0;
    const cov = N(x.in_group) ? Math.round(N(x.vendos)/N(x.in_group)*100) : null;
    h += '<tr'+(orphan?' style="background:#fffdf5"':'')+'>'
      + '<td style="font-weight:700;font-size:11.5px">'+rpEsc(x.label)
      +   (x.code?'<span style="color:#8b93ad;font-weight:400;font-size:10px"> \u00b7 '+rpEsc(x.code)+'</span>':'')
      +   (orphan?'<div style="font-size:9.5px;color:#8a6100">'+rpEsc(x.area||'')+'</div>':'')+'</td>'
      + '<td style="font-size:11px;color:#6b7394">'+rpEsc(x.collector||'\u2014')+'</td>'
      + '<td class="rp-num" style="font-size:11px;color:'+(cov!==null&&cov<70?'#8a6100':'#6b7394')+'">'
      +   (cov===null?'\u2014':N(x.vendos)+'/'+N(x.in_group)+' \u00b7 '+cov+'%')+'</td>'
      + '<td class="rp-num" style="font-size:11px;color:#6b7394">'+N(x.harvests)+'</td>'
      + '<td class="rp-num" style="color:#8b93ad">'+rpPesoShort(x.coins)+'</td>'
      + '<td class="rp-num" style="font-weight:700;color:#025AC6">'+rpPeso(x.spawn_share)+'</td>'
      + '<td class="rp-num" style="color:'+(N(x.office_rows)?'#1a1d2e':'#c9cfe0')+'">'+(N(x.office_rows)?rpPeso(x.office_amount):'\u2014')
      +   (N(x.office_unmatched)?'<div style="font-size:9px;color:#8a6100">'+N(x.office_unmatched)+' unnamed</div>':'')+'</td>'
      + '<td class="rp-num" style="font-weight:700;color:'+(N(x.office_rows)?(Math.abs(N(x.gap))>1?(N(x.gap)>0?'#DF1A35':'#028867'):'#028867'):'#c9cfe0')+'">'
      +   (N(x.office_rows)? (N(x.gap)>0?'+':'')+rpPesoShort(x.gap) : '\u2014')+'</td>'
      + '<td class="rp-num" style="color:#8b93ad">'+rpPesoShort(x.owner_share)+'</td>'
      + '<td class="rp-num" style="font-size:11px;color:'+(N(x.saloy)?'#C01176':'#c9cfe0')+'">'+(N(x.saloy)?N(x.saloy).toLocaleString():'\u2014')+'</td>'
      + '</tr>';
  });

  h += '<tr style="background:#e8f0ff"><td colspan="4" style="padding:10px 8px;font-weight:800;color:#311A8E">TOTAL</td>'
    +  '<td class="rp-num" style="font-weight:800;color:#6b7394">'+rpPesoShort(appPiso)+'</td>'
    +  '<td class="rp-num" style="font-weight:800;color:#025AC6">'+rpPeso(d.spawn_total)+'</td>'
    +  '<td class="rp-num" style="font-weight:800;color:#311A8E">'+(officeOn?rpPeso(d.office_total):'\u2014')+'</td>'
    +  '<td class="rp-num" style="font-weight:800;color:#311A8E">'+(officeOn?rpPesoShort(N(d.spawn_total)-N(d.office_total)):'\u2014')+'</td>'
    +  '<td class="rp-num" style="font-weight:800;color:#6b7394">'+rpPesoShort(d.owner_total)+'</td>'
    +  '<td></td></tr>'
    +  '</tbody></table></div>';

  if(!officeOn){
    h += '<div style="padding:10px 14px;font-size:10.5px;color:#8a6100;background:#fffdf5;border-top:1px solid #f3e2b8">'
      +  'The Office column is empty because the bashang workbook is not yet syncing. '
      +  'Once its piso-wifi tabs are connected, the office figure and the gap fill in per group with no further work here.</div>';
  }
  h += '</div>';

  // ---- final matching ----
  h += '<div class="rp-card"><div style="font-size:12px;font-weight:800;color:#025AC6;margin-bottom:8px">\u2696\uFE0F Final matching of sales</div>'
    +  '<table class="rp-t"><thead><tr><th>Stream</th><th class="rp-num">Our record</th>'
    +  '<th class="rp-num">Cash book</th><th class="rp-num">Gap</th><th class="rp-num">%</th><th>Reads as</th></tr></thead><tbody>'
    +  rpRecRow('Piso-wifi (harvest app)', appPiso, bookPiso, pisoGap, pisoPct, 5)
    +  rpRecRow('Subscriber (payment ledger)', subLedger, bookSub, subGap, subPct, 5)
    +  '</tbody></table>'
    +  '<div style="font-size:10.5px;color:#8b93ad;margin-top:8px">Subscriber cash book is <b>Subscriber Collection + G-Cash</b> together, since the ledger does not split channel. '
    +  'Both sides are cash-received basis \u2014 the date money arrived, not the month it covers.</div></div>';

  // ---- analyzer ----
  const tags = d.tags || [];
  const income = tags.filter(function(t){ return String(t.tag_type) === 'other_income'; });
  const incomeAmt = income.reduce(function(a,t){ return a + N(t.amt); }, 0);

  h += '<div class="rp-card"><div style="font-size:12px;font-weight:800;color:#C01176;margin-bottom:8px">\u{1F50E} Analyzer \u2014 does it balance</div>'
    +  '<table class="rp-t"><tbody>'
    +  rpRecCheck('Sales hiding in cash receipts',
         incomeAmt ? rpPeso(incomeAmt)+' tagged as other income' : 'none tagged this month',
         incomeAmt ? 'warn' : 'ok',
         incomeAmt ? 'Genuine sales recorded in the receipts book rather than through harvest or the ledger. Counts toward net income.'
                   : 'No receipt remark in this month is tagged as a sale.')
    +  rpRecCheck('Cash book adds up',
         (Math.abs(residual) < 1000 ? 'balanced' : (residual>0?'+':'')+rpPeso(residual)+' unexplained'),
         (Math.abs(residual) < 1000 ? 'ok' : 'warn'),
         'Piso '+rpPesoShort(c.piso)+' + subscriber '+rpPesoShort(c.sub_cash)+' + change in '+rpPesoShort(c.change_in)
         +' \u2212 expenses '+rpPesoShort(c.expenses)+' = '+rpPesoShort(expected)+', against net cash '+rpPesoShort(c.net_cash)+'. G-Cash excluded \u2014 it never becomes coins.')
    +  rpRecCheck('Cash reached the bank',
         (undeposit > 0 ? rpPeso(undeposit)+' not yet deposited' : 'fully deposited'),
         (undeposit > 20000 ? 'warn' : 'ok'),
         'Net cash '+rpPesoShort(c.net_cash)+' against '+rpPesoShort(c.deposited)+' banked. A lag of a day or two at month end is normal.')
    +  rpRecCheck('Over and short',
         'over '+rpPesoShort(c.over_)+' \u00b7 short '+rpPesoShort(c.short_),
         (N(c.short_) > 5000 ? 'warn' : 'ok'),
         'Counting differences the office already recorded against itself.')
    +  rpRecCheck('Harvests outside a group',
         (function(){ const o = g.filter(function(x){ return N(x.gid)<0; });
           return o.length ? rpPeso(o.reduce(function(a,x){return a+N(x.coins);},0))+' across '+o.reduce(function(a,x){return a+N(x.harvests);},0)+' harvests' : 'none'; })(),
         (g.some(function(x){ return N(x.gid)<0; }) ? 'warn' : 'ok'),
         'These vendos are not on any group roster, so they never appear on a collector\u2019s route sheet.')
    +  '</tbody></table></div>';

  return h;
}

function rpRecRow(label, ours, book, gap, pct, tol){
  const bad = pct !== null && Math.abs(pct) > tol;
  return '<tr><td style="font-weight:600">'+rpEsc(label)+'</td>'
    + '<td class="rp-num" style="font-weight:700">'+rpPeso(ours)+'</td>'
    + '<td class="rp-num">'+rpPeso(book)+'</td>'
    + '<td class="rp-num" style="font-weight:700;color:'+(bad?'#DF1A35':'#028867')+'">'+(gap>0?'+':'')+rpPesoShort(gap)+'</td>'
    + '<td class="rp-num" style="color:'+(bad?'#DF1A35':'#028867')+'">'+(pct===null?'\u2014':(pct>0?'+':'')+pct+'%')+'</td>'
    + '<td style="font-size:11px;color:'+(bad?'#DF1A35':'#028867')+';font-weight:700">'+(bad?'out of line':'balanced')+'</td></tr>';
}

function rpRecCheck(label, verdict, state, detail){
  const col = state === 'ok' ? '#028867' : '#8a6100';
  const dot = state === 'ok' ? '\u2713' : '\u26a0\uFE0F';
  return '<tr'+(state==='ok'?'':' style="background:#fffdf5"')+'>'
    + '<td style="font-weight:700;font-size:11.5px;min-width:190px">'+dot+' '+rpEsc(label)+'</td>'
    + '<td style="font-weight:700;font-size:11.5px;color:'+col+';white-space:nowrap">'+rpEsc(verdict)+'</td>'
    + '<td style="font-size:10.5px;color:#8b93ad">'+rpEsc(detail)+'</td></tr>';
}

window.rpRecSetMonth = function(m){ rpRecMonth = m; rpRenderRecon(); };
window.rpRecRefresh  = function(){ rpRenderRecon(); };
window.rpRenderRecon = rpRenderRecon;

window.rpRecCsv = function(){
  const d = rpRecData; if(!d) return;
  const q = function(v){ return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'; };
  const L = ['Sales Reconciliation '+d.month];
  L.push(['Group','Code','Collector','Vendos harvested','Vendos in group','Harvests','App coins','Office record','Gap','Spawn 75%','Owner 25%','Saloy'].map(q).join(','));
  (d.groups||[]).forEach(function(x){
    L.push([q(x.label), q(x.code||''), q(x.collector||''), Number(x.vendos)||0, Number(x.in_group)||0,
            Number(x.harvests)||0, Number(x.coins)||0, Number(x.office_amount)||0, Number(x.gap)||0,
            Number(x.spawn_share)||0, Number(x.owner_share)||0, Number(x.saloy)||0].join(','));
  });
  const c = d.cash||{}, s = d.subscriber||{};
  L.push('');
  L.push([q('Stream'),q('Our record'),q('Cash book')].join(','));
  L.push([q('Piso-wifi'), Number(d.harvest_total)||0, Number(c.piso)||0].join(','));
  L.push([q('Subscriber'), Number(s.amount)||0, (Number(c.sub_cash)||0)+(Number(c.gcash)||0)].join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([L.join('\n')], {type:'text/csv;charset=utf-8'}));
  a.download = 'spawn-sales-recon-'+d.month+'.csv';
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1500);
};



// ── Sync to Sheet (Daily Expense) ─────────────────────────────────
// Pushes any daily expense that is not yet mirrored into the DAILY EXPENSE
// 2026 sheet. The RPC diffs on row CONTENT against what the outbox already
// sent, so pressing this twice queues nothing the second time and it can
// never duplicate a row that is already in the sheet.
window.rpSyncSheet = async function(){
  const btn = document.getElementById('rp-sync-sheet');
  if(!btn || btn.disabled) return;
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = '\u21bb Syncing\u2026';
  try {
    const r = await rpRpc('spawn_sync_daily_expense_sheet', {});
    const res = Array.isArray(r) ? r[0] : r;
    const n = Number((res && res.queued) || 0);
    const pesos = Number((res && res.pesos) || 0);
    if(n > 0){
      btn.textContent = '\u2713 Queued ' + n;
      if(typeof window.toast === 'function'){
        toast(n + ' row(s) queued to the sheet \u00b7 ' + rpPeso(pesos) + ' \u2014 the bridge appends them within a few minutes.');
      } else {
        alert(n + ' row(s) queued to the sheet (' + rpPeso(pesos) + ').\nThe bridge appends them within a few minutes.');
      }
    } else {
      btn.textContent = '\u2713 Up to date';
      if(typeof window.toast === 'function') toast('Sheet already has every daily expense \u2014 nothing to push.');
    }
  } catch(e){
    console.warn('rpSyncSheet failed', e);
    btn.textContent = '\u26a0 Failed';
    if(typeof window.toast === 'function') toast('Sync failed: ' + (e && e.message || e));
    else alert('Sync failed: ' + (e && e.message || e));
  }
  // Re-verify so the badge reflects what just happened.
  try { if(typeof rpMirrorCheck === 'function') await rpMirrorCheck(); } catch(_){}
  setTimeout(function(){ btn.disabled = false; btn.textContent = label; }, 3500);
};


// ── Mirror verifier badge ─────────────────────────────────────────
// Answers one question at a glance: is every daily expense actually in the
// DAILY EXPENSE 2026 sheet? Uses the same content diff as the sync button, so
// the badge and the button can never disagree.
window.rpMirrorCheck = async function(){
  const el = document.getElementById('rp-mirror-badge');
  if(!el) return null;
  try {
    const r = await rpRpc('spawn_daily_expense_mirror_status', {});
    const st = Array.isArray(r) ? r[0] : r;
    if(!st) throw new Error('no status');

    const missing = Number(st.missing_rows || 0);
    const pending = Number(st.pending_rows || 0);
    const failed  = Number(st.failed_rows || 0);

    let text, bg, tip;
    if(failed > 0){
      text = '\u26a0 ' + failed + ' failed';
      bg   = 'rgba(223,26,53,.85)';
      tip  = failed + ' row(s) could not be written to the sheet. Check the bridge logs.';
    } else if(missing > 0){
      const days = (st.missing_days || []).join(', ');
      text = '\u26a0 ' + missing + ' not in sheet';
      bg   = 'rgba(255,183,37,.9)';
      tip  = missing + ' entr(y/ies) worth ' + rpPeso(st.missing_pesos)
           + ' are not in the sheet yet' + (days ? ' \u2014 ' + days : '')
           + '. Press Sync to Sheet, or wait for the half-hourly auto-sync.';
    } else if(pending > 0){
      text = '\u21bb ' + pending + ' sending';
      bg   = 'rgba(255,255,255,.30)';
      tip  = pending + ' row(s) queued \u2014 the bridge appends them within a few minutes.';
    } else {
      text = '\u2713 all in sheet';
      bg   = 'rgba(2,136,103,.9)';
      tip  = st.db_rows + ' entries, all present in the sheet.'
           + (st.last_sent_at ? ' Last write ' + new Date(st.last_sent_at).toLocaleString() + '.' : '');
    }
    el.textContent = text;
    el.style.background = bg;
    el.title = tip;
    return st;
  } catch(e){
    console.warn('rpMirrorCheck failed', e);
    el.textContent = '\u2014 check failed';
    el.style.background = 'rgba(255,255,255,.16)';
    el.title = 'Could not verify against the sheet: ' + (e && e.message || e);
    return null;
  }
};
