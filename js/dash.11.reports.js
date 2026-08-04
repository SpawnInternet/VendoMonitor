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
    ['summary',  '\u{1F4CA}', 'Expense Summary'],
    ['sales',    '\u{1F4B0}', 'Sales'],
    ['collect',  '\u{1F9FE}', 'Collections'],
    ['newvendo', '\u{1F195}', 'New Vendos'],
    ['newsub',   '\u{1F465}', 'New Subscribers'],
    ['pullout',  '\u{1F4E4}', 'Vendo Pull-Out'],
    ['cutoff',   '\u2702\uFE0F', 'Cutoff Subs'],
    ['status',   '\u{1F4E1}', 'Active / Inactive'],
    ['cash',     '\u{1F3E6}', 'Cash Receipts'],
    ['wendell',  '\u{1F4B3}', 'Paid by Wendell']
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
  + '#panel-reports .rp-grid{display:grid;grid-template-columns:30px 1.7fr 1.1fr 1.35fr 110px 96px 30px;gap:5px;align-items:center;margin-bottom:4px}#panel-reports .rp-rn{font-size:10px;color:#b6bdd0;text-align:right;font-variant-numeric:tabular-nums}#panel-reports .rp-in.cell{padding:7px 8px}#panel-reports .rp-in.ok{border-color:#028867;background:#f6fffb}#panel-reports .rp-in.warn{border-color:#FFB725;background:#fffdf5}#panel-reports .rp-fund{text-align:center;font-weight:800;letter-spacing:.03em}#panel-reports .rp-fund.C{color:#025AC6;background:#f2f7ff;border-color:#bfd8ff}#panel-reports .rp-fund.W{color:#C01176;background:#fff4fb;border-color:#f3c2e2}#panel-reports .rp-keys{font-size:10.5px;color:#6b7394;line-height:1.9}#panel-reports .rp-keys kbd{background:#f0f4ff;border:1px solid #dbeafe;border-bottom-width:2px;border-radius:4px;padding:1px 5px;font-family:ui-monospace,monospace;font-size:10px;color:#025AC6;font-weight:700}'
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
  + '#panel-reports .rp-scroll{max-height:480px;overflow:auto;border:1px solid #e8eeff;border-radius:10px}'
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
  +   '<div class="rp-mode" id="rp-mode-summary"></div>'
  +   '<div class="rp-mode" id="rp-mode-sales"></div>'
  +   '<div class="rp-mode" id="rp-mode-collect"></div>'
  +   '<div class="rp-mode" id="rp-mode-newvendo"></div>'
  +   '<div class="rp-mode" id="rp-mode-newsub"></div>'
  +   '<div class="rp-mode" id="rp-mode-pullout"></div>'
  +   '<div class="rp-mode" id="rp-mode-cutoff"></div>'
  +   '<div class="rp-mode" id="rp-mode-status"></div>'
  +   '<div class="rp-mode" id="rp-mode-cash"></div>'
  +   '<div class="rp-mode" id="rp-mode-wendell"></div>'
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

window.rpSetTab = function(mode){
  rpTab = mode;
  document.querySelectorAll('#panel-reports .rp-tab').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-rp') === mode);
  });
  document.querySelectorAll('#panel-reports .rp-mode').forEach(function(m){
    m.classList.toggle('active', m.id === 'rp-mode-' + mode);
  });
  document.getElementById('rp-actions').innerHTML = '';
  if(mode === 'expense')  rpRenderExpense();
  if(mode === 'summary')  rpRenderSummary();
  if(mode === 'sales')    rpRenderSales();
  if(mode === 'status')   rpRenderStatus();
  if(['collect','newvendo','newsub','pullout','cutoff','cash','wendell'].indexOf(mode) >= 0) rpRenderTodo(mode);
};

// ══════════════════════════════════════════════════════════
// 1. DAILY EXPENSE  — bulk entry
// ══════════════════════════════════════════════════════════
async function rpRenderExpense(){
  const host = document.getElementById('rp-mode-expense');
  host.innerHTML = '<div style="padding:26px;text-align:center;color:#6b7394;font-size:13px">Loading expense book\u2026</div>';

  let gaps = [], day = null;
  try {
    const res = await Promise.all([ rpRpc('spawn_expense_gaps'), rpRpc('spawn_expense_day', { p_date: rpDate }) ]);
    gaps = res[0] || []; day = res[1] || {};
  } catch(e){
    host.innerHTML = '<div class="rp-card" style="color:#DF1A35">Could not load: ' + rpEsc(e.message) + '</div>';
    return;
  }
  rpDayRows = day.rows || [];
  if(!rpDraft.length) rpDraft = [rpBlankRow(), rpBlankRow(), rpBlankRow()];

  const missing = gaps.filter(function(g){ return g.count === 0; });

  const gapChips = gaps.map(function(g){
    const cls = g.count ? 'has' : 'gap';
    const sel = (g.date === rpDate) ? ' sel' : '';
    return '<button class="rp-chip ' + cls + sel + '" onclick="rpChangeDate(\'' + g.date + '\')">'
         + g.date.slice(5) + (g.count ? ' \u00b7 ' + rpPesoShort(g.total) : '') + '</button>';
  }).join('');
  const gapsHtml = gaps.length
    ? '<div style="font-size:10px;font-weight:700;color:#6b7394;text-transform:uppercase;margin:8px 0 4px">Jump to a day \u2014 amber = nothing entered yet</div>'
      + '<div style="margin-bottom:4px">' + gapChips + '</div>'
    : '';

  host.innerHTML = ''
  + '<div class="rp-kpis">'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.blue+'"><div class="k">Selected day</div><div class="v" id="rp-kpi-day">'+rpPeso(day.total)+'</div><div class="s">'+(day.count||0)+' entries \u00b7 '+rpDate+'</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.teal+'"><div class="k">Month to date \u2014 combined</div><div class="v">'+rpPeso(day.month_to_date)+'</div><div class="s">C '+rpPesoShort(day.mtd_collections)+' \u00b7 W '+rpPesoShort(day.mtd_wendell)+'</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.gold+'"><div class="k">Days not yet entered</div><div class="v">'+missing.length+'</div><div class="s">since last book entry</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.magenta+'"><div class="k">Unsaved in grid</div><div class="v" id="rp-kpi-draft">'+rpPeso(0)+'</div><div class="s" id="rp-kpi-draftn">0 rows ready</div></div>'
  + '</div>'

  + '<div class="rp-card">'
  +   '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">'
  +     '<div><div style="font-size:10px;font-weight:700;color:#6b7394;text-transform:uppercase;margin-bottom:3px">Entry date</div>'
  +       '<input type="date" id="rp-date" class="rp-in" style="width:170px" value="'+rpDate+'" onchange="rpChangeDate(this.value)"></div>'
  +     '<div><div style="font-size:10px;font-weight:700;color:#6b7394;text-transform:uppercase;margin-bottom:3px">New rows default to</div>'
  +       '<div id="rp-fundsel">'
  +         '<button class="rp-chip sel" data-f="Collections" onclick="rpSetFundDefault(\'Collections\')">C \u00b7 Collections</button>'
  +         '<button class="rp-chip" data-f="Sir Wendell" onclick="rpSetFundDefault(\'Sir Wendell\')">W \u00b7 Sir Wendell</button>'
  +       '</div></div>'
  +     '<button class="rp-btn" onclick="rpPasteOpen()">\u{1F4CB} Paste from Excel</button>'
  +     '<div style="flex:1"></div>'
  +     '<button class="rp-btn ok" id="rp-save" onclick="rpSaveDraft()">\u{1F4BE} Save all rows</button>'
  +   '</div>'
  +   gapsHtml
  + '</div>'

  + '<div class="rp-card">'
  +   '<div style="font-size:12px;font-weight:800;color:#025AC6;margin-bottom:9px">\u270F\uFE0F New entries for <span id="rp-lbl-date">'+rpDate+'</span></div>'
  +   '<div class="rp-grid hdr"><div>#</div><div>Description</div><div>c/o (released to)</div><div>Expense type</div><div class="rp-num">Amount</div><div style="text-align:center">Fund</div><div></div></div>'
  +   '<div id="rp-rows"></div>'
  +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:10px;border-top:2px solid #f0f4ff">'
  +     '<div class="rp-keys">'
  +       '<kbd>\u2191</kbd><kbd>\u2193</kbd> move row \u00b7 <kbd>\u2190</kbd><kbd>\u2192</kbd> move column \u00b7 <kbd>Enter</kbd> next row \u00b7 <kbd>Tab</kbd> next cell<br>'
  +       '<kbd>C</kbd>/<kbd>W</kbd>/<kbd>Space</kbd> on the Fund cell \u00b7 <kbd>Ctrl</kbd>+<kbd>D</kbd> copy cell above \u00b7 <kbd>Ctrl</kbd>+<kbd>\u232B</kbd> delete row \u00b7 <kbd>Ctrl</kbd>+<kbd>Enter</kbd> save'
  +     '</div>'
  +     '<div style="text-align:right">'
  +       '<div style="font-size:11px;color:#025AC6;font-weight:700">Collections <span id="rp-draft-coll">'+rpPeso(0)+'</span></div>'
  +       '<div style="font-size:11px;color:#C01176;font-weight:700">Sir Wendell <span id="rp-draft-wend">'+rpPeso(0)+'</span></div>'
  +       '<div style="font-size:16px;font-weight:800;color:#1a1d2e;margin-top:2px">Total <span id="rp-draft-total">'+rpPeso(0)+'</span></div>'
  +     '</div>'
  +   '</div>'
  + '</div>'

  + '<div class="rp-card">'
  +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">'
  +     '<div style="font-size:12px;font-weight:800;color:#028867">\u2705 Already saved for this day</div>'
  +     '<div style="font-size:13px;font-weight:800;color:#028867" id="rp-saved-total">'+rpPeso(day.total)+'</div>'
  +   '</div>'
  +   '<div class="rp-scroll"><table class="rp-t"><thead><tr>'
  +     '<th>Description</th><th>c/o</th><th>Type</th><th class="rp-num">Amount</th><th>Paid from</th><th>Src</th><th></th>'
  +   '</tr></thead><tbody id="rp-saved"></tbody></table></div>'
  + '</div>';

  rpDrawRows();
  rpGridBind();
  rpDrawSaved();
  setTimeout(function(){ const f = document.querySelector('#rp-rows [data-r="0"][data-c="0"]'); if(f) f.focus(); }, 40);
}

function rpBlankRow(){
  return { description:'', co:'', category:'', amount:'', paid_from: rpFundDefault };
}
let rpFundDefault = 'Collections';

window.rpAddRows = function(n){
  for(let i=0;i<(n||1);i++) rpDraft.push(rpBlankRow());
  rpDrawRows();
};

window.rpSetFundDefault = function(f){
  rpFundDefault = f;
  document.querySelectorAll('#rp-fundsel .rp-chip').forEach(function(b){
    b.classList.toggle('sel', b.getAttribute('data-f') === f);
  });
  // apply to any still-empty rows
  rpDraft.forEach(function(r){ if(!r.description && !r.amount) r.paid_from = f; });
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
function rpFundLabel(v){ return v === 'Sir Wendell' ? 'W' : 'C'; }

function rpDrawRows(){
  const box = document.getElementById('rp-rows');
  if(!box) return;
  const active = document.activeElement;
  const keep = active && active.hasAttribute && active.hasAttribute('data-cell')
             ? { r:active.getAttribute('data-r'), c:active.getAttribute('data-c'), s:active.selectionStart } : null;

  box.innerHTML = rpDraft.map(function(r, i){
    const catOk  = r.category ? ' ok' : (r.amount ? ' warn' : '');
    const fk     = rpFundLabel(r.paid_from);
    return '<div class="rp-grid" data-i="'+i+'">'
      + '<div class="rp-rn">'+(i+1)+'</div>'
      + '<input class="rp-in cell" data-cell data-r="'+i+'" data-c="0" list="rp-dl-desc" placeholder="description" value="'+rpEsc(r.description)+'">'
      + '<input class="rp-in cell" data-cell data-r="'+i+'" data-c="1" list="rp-dl-people" placeholder="c/o" value="'+rpEsc(r.co)+'">'
      + '<input class="rp-in cell'+catOk+'" data-cell data-r="'+i+'" data-c="2" list="rp-dl-cat" placeholder="type" value="'+rpEsc(r.category)+'">'
      + '<input class="rp-in cell rp-num" data-cell data-r="'+i+'" data-c="3" inputmode="decimal" placeholder="0.00" value="'+rpEsc(r.amount)+'">'
      + '<input class="rp-in cell rp-fund '+fk+'" data-cell data-r="'+i+'" data-c="4" value="'+fk+'" title="C = Collections, W = Sir Wendell \u2014 press C, W or Space" readonly>'
      + '<button class="rp-x" tabindex="-1" title="Remove row" onclick="rpDelRow('+i+')">\u00d7</button>'
      + '</div>';
  }).join('');

  if(keep){
    const el = box.querySelector('[data-r="'+keep.r+'"][data-c="'+keep.c+'"]');
    if(el){ el.focus(); try { el.setSelectionRange(keep.s, keep.s); } catch(e){} }
  }
  rpTotals();
}

// one delegated handler for the whole grid — input, keys, blur
function rpGridBind(){
  const box = document.getElementById('rp-rows');
  if(!box || box.__bound) return;
  box.__bound = true;

  const FIELDS = ['description','co','category','amount','paid_from'];

  function cell(r,c){ return box.querySelector('[data-r="'+r+'"][data-c="'+c+'"]'); }
  function go(r,c,toEnd){
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
    // always keep one spare row at the bottom
    const last = rpDraft[rpDraft.length-1];
    if(last && (last.description || last.amount || last.co)){ rpDraft.push(rpBlankRow()); rpDrawRows(); }
  });

  box.addEventListener('blur', function(ev){
    const t = ev.target;
    if(!t.hasAttribute || !t.hasAttribute('data-cell')) return;
    const r = +t.getAttribute('data-r'), c = +t.getAttribute('data-c');
    if(!rpDraft[r]) return;
    if(c === 2){                                   // snap category to a real name
      const m = rpMatchCat(t.value);
      if(m && m !== rpDraft[r].category){ rpDraft[r].category = m; rpDrawRows(); }
    }
    if(c === 0 && rpDraft[r].description && !rpDraft[r].category){
      const hit = (rpHints.descriptions||[]).find(function(x){
        return (x.d||'').toLowerCase() === rpDraft[r].description.toLowerCase();
      });
      if(hit && hit.c){ rpDraft[r].category = hit.c; rpDrawRows(); }
    }
  }, true);

  box.addEventListener('keydown', function(ev){
    const t = ev.target;
    if(!t.hasAttribute || !t.hasAttribute('data-cell')) return;
    const r = +t.getAttribute('data-r'), c = +t.getAttribute('data-c');
    const k = ev.key;

    // fund column: C / W / Space toggle
    if(c === 4){
      if(k === 'c' || k === 'C'){ ev.preventDefault(); rpDraft[r].paid_from = 'Collections'; rpDrawRows(); return; }
      if(k === 'w' || k === 'W'){ ev.preventDefault(); rpDraft[r].paid_from = 'Sir Wendell'; rpDrawRows(); return; }
      if(k === ' '){ ev.preventDefault();
        rpDraft[r].paid_from = rpDraft[r].paid_from === 'Sir Wendell' ? 'Collections' : 'Sir Wendell';
        rpDrawRows(); return; }
    }

    if((ev.ctrlKey || ev.metaKey) && (k === 'Enter' || k === 's')){ ev.preventDefault(); rpSaveDraft(); return; }

    // Ctrl+D — copy the cell directly above
    if((ev.ctrlKey || ev.metaKey) && (k === 'd' || k === 'D')){
      ev.preventDefault();
      if(r > 0){ rpDraft[r][FIELDS[c]] = rpDraft[r-1][FIELDS[c]]; rpDrawRows(); go(r,c,true); }
      return;
    }

    if(k === 'ArrowDown'){ ev.preventDefault(); go(r+1, c, true); return; }
    if(k === 'ArrowUp'){   ev.preventDefault(); go(r-1, c, true); return; }
    if(k === 'Enter'){     ev.preventDefault(); go(r+1, c, true); return; }

    if(k === 'ArrowRight'){
      if(t.readOnly || t.selectionStart === t.value.length){
        if(c < 4){ ev.preventDefault(); go(r, c+1, false); }
        else { ev.preventDefault(); go(r+1, 0, false); }
      }
      return;
    }
    if(k === 'ArrowLeft'){
      if(t.readOnly || t.selectionStart === 0){
        if(c > 0){ ev.preventDefault(); go(r, c-1, true); }
        else if(r > 0){ ev.preventDefault(); go(r-1, 4, true); }
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
  const coll = good.filter(function(r){ return r.paid_from !== 'Sir Wendell'; })
                   .reduce(function(a,r){ return a + (Number(r.amount)||0); }, 0);
  const wend = good.filter(function(r){ return r.paid_from === 'Sir Wendell'; })
                   .reduce(function(a,r){ return a + (Number(r.amount)||0); }, 0);
  const set = function(id, v){ const e = document.getElementById(id); if(e) e.textContent = v; };
  set('rp-draft-coll',  rpPeso(coll));
  set('rp-draft-wend',  rpPeso(wend));
  set('rp-draft-total', rpPeso(coll + wend));
  set('rp-kpi-draft',   rpPeso(coll + wend));
  set('rp-kpi-draftn',  good.length + ' row' + (good.length===1?'':'s') + ' ready');
  const sv = document.getElementById('rp-save'); if(sv) sv.disabled = !good.length;
}

window.rpChangeDate = function(d){
  if(!d) return;
  const dirty = rpValidDraft().length;
  if(dirty && !confirm(dirty + ' unsaved row(s) in the grid will be cleared. Continue?')) {
    const di = document.getElementById('rp-date'); if(di) di.value = rpDate;
    return;
  }
  rpDate  = d;
  rpDraft = [rpBlankRow(), rpBlankRow(), rpBlankRow()];
  rpRenderExpense();
};

window.rpSaveDraft = async function(){
  const good = rpValidDraft();
  if(!good.length){ if(window.toast) toast('Nothing to save \u2014 each row needs an amount and an expense type.'); return; }
  const btn = document.getElementById('rp-save');
  if(btn){ btn.disabled = true; btn.textContent = 'Saving\u2026'; }
  const payload = good.map(function(r){
    return {
      expense_date: rpDate,
      description:  (r.description||'').trim() || null,
      co:           (r.co||'').trim() || null,
      category:     r.category,
      amount:       Number(r.amount),
      paid_from:    r.paid_from || 'Collections',
      source:       'dashboard',
      created_by:   'dashboard'
    };
  });
  try {
    await rpRest('expenses', { method:'POST', headers:{ Prefer:'return=minimal' }, body:JSON.stringify(payload) });
    if(window.toast) toast('\u2705 Saved ' + payload.length + ' entries for ' + rpDate);
    rpDraft = [rpBlankRow(), rpBlankRow(), rpBlankRow()];
    try { rpHints = await rpRpc('spawn_expense_hints'); rpFillDatalists(); } catch(e){}
    rpRenderExpense();
  } catch(e){
    if(window.toast) toast('\u274c Save failed: ' + e.message);
    if(btn){ btn.disabled = false; btn.textContent = '\u{1F4BE} Save all rows'; }
  }
};

function rpDrawSaved(){
  const tb = document.getElementById('rp-saved');
  if(!tb) return;
  if(!rpDayRows.length){
    tb.innerHTML = '<tr><td colspan="7" style="padding:18px;text-align:center;color:#8b93ad">No entries saved for this day yet.</td></tr>';
    return;
  }
  tb.innerHTML = rpDayRows.map(function(r){
    return '<tr>'
      + '<td>'+rpEsc(r.description||'\u2014')+'</td>'
      + '<td style="color:#6b7394">'+rpEsc(r.co||'\u2014')+'</td>'
      + '<td>'+rpEsc(r.category)+'</td>'
      + '<td class="rp-num" style="font-weight:700">'+rpPeso(r.amount)+'</td>'
      + '<td style="color:#6b7394">'+rpEsc(r.paid_from)+'</td>'
      + '<td><span style="font-size:9px;padding:2px 6px;border-radius:8px;background:'+(r.source==='excel'?'#f1f5f9':'#eefaf5')+';color:'+(r.source==='excel'?'#64748b':'#026a50')+'">'+rpEsc(r.source)+'</span></td>'
      + '<td><button class="rp-x" title="Delete" onclick="rpDelSaved('+r.id+')">\u00d7</button></td>'
      + '</tr>';
  }).join('');
}

window.rpDelSaved = async function(id){
  if(!confirm('Delete this expense entry? This cannot be undone.')) return;
  try {
    await rpRest('expenses?id=eq.' + id, { method:'DELETE', headers:{ Prefer:'return=minimal' } });
    if(window.toast) toast('Entry deleted.');
    rpRenderExpense();
  } catch(e){ if(window.toast) toast('\u274c Delete failed: ' + e.message); }
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
    +   '<div style="font-size:11px;font-family:monospace;background:#f6f9ff;border:1px solid #e8eeff;border-radius:7px;padding:8px 10px;margin-bottom:10px;color:#025AC6">Description &nbsp;\u2192&nbsp; c/o &nbsp;\u2192&nbsp; Expense Type &nbsp;\u2192&nbsp; Amount &nbsp;\u2192&nbsp; Fund (C/W, optional)</div>'
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
    let fund = rpFundDefault;
    const f5 = (c[4]||'').trim().toLowerCase();
    if(f5){ if(f5[0] === 'w') fund = 'Sir Wendell'; else if(f5[0] === 'c') fund = 'Collections'; }
    fresh.push({ description:(c[0]||'').trim(), co:(c[1]||'').trim(), category:cat, amount:String(amt), paid_from:fund });
    added++;
  });
  if(!added){ if(msg) msg.innerHTML = '<span style="color:#DF1A35;font-weight:700">No usable rows found \u2014 check that the 4th column holds the amount.</span>'; return; }
  rpDraft = rpDraft.filter(function(r){ return r.description || r.amount; }).concat(fresh, [rpBlankRow()]);
  rpGridBind();
  const ov = document.getElementById('rp-paste-ov'); if(ov) ov.remove();
  rpDrawRows();
  const unmatched = fresh.filter(function(r){ return !r.category; }).length;
  if(window.toast) toast('Added ' + added + ' row' + (added===1?'':'s') + (bad?' \u00b7 '+bad+' skipped':'') + (unmatched?' \u00b7 '+unmatched+' need an expense type':''));
};

// ══════════════════════════════════════════════════════════
// 2. EXPENSE SUMMARY — category x month pivot
// ══════════════════════════════════════════════════════════
async function rpRenderSummary(){
  const host = document.getElementById('rp-mode-summary');
  host.innerHTML = '<div style="padding:26px;text-align:center;color:#6b7394;font-size:13px">Building summary\u2026</div>';
  const yr = parseInt((rpDate||rpPhToday()).slice(0,4), 10);
  let s;
  try { s = await rpRpc('spawn_expense_summary', { p_year: yr }); }
  catch(e){ host.innerHTML = '<div class="rp-card" style="color:#DF1A35">Could not load: '+rpEsc(e.message)+'</div>'; return; }

  const rows = s.rows || [];
  const months = [];
  for(let m=1;m<=12;m++){
    if(rows.some(function(r){ return Number(r.months[m]) > 0; })) months.push(m);
  }
  const colTotal = {};
  months.forEach(function(m){
    colTotal[m] = rows.reduce(function(a,r){ return a + (Number(r.months[m])||0); }, 0);
  });

  document.getElementById('rp-actions').innerHTML =
    '<button class="rp-btn" onclick="rpExportSummary()">\u2B07\uFE0F Download CSV</button>';

  host.innerHTML = ''
  + '<div class="rp-kpis">'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.gold+'"><div class="k">Total expense '+yr+'</div><div class="v">'+rpPeso(s.grand)+'</div><div class="s">'+months.length+' month'+(months.length===1?'':'s')+' with activity</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.blue+'"><div class="k">Biggest category</div><div class="v" style="font-size:15px">'+rpEsc((rows.slice().sort(function(a,b){ return b.total-a.total; })[0]||{}).category || '\u2014')+'</div><div class="s">'+rpPeso((rows.slice().sort(function(a,b){ return b.total-a.total; })[0]||{}).total)+'</div></div>'
  +   '<div class="rp-kpi" style="border-bottom-color:'+RP_BRAND.teal+'"><div class="k">Average per month</div><div class="v">'+rpPeso(months.length ? s.grand/months.length : 0)+'</div><div class="s">across active months</div></div>'
  + '</div>'
  + '<div class="rp-card" style="padding:0;overflow:hidden">'
  +   '<div style="padding:11px 14px;font-size:12px;font-weight:800;color:#025AC6;border-bottom:1px solid #e8eeff">\u{1F4B0} Combined expense \u2014 Daily book + Sir Wendell</div>'
  +   '<div style="overflow:auto"><table class="rp-t"><thead><tr><th style="min-width:150px">Fund</th>'
  +     months.map(function(m){ return '<th class="rp-num">'+RP_MONTHS[m].slice(0,3).toUpperCase()+'</th>'; }).join('')
  +     '<th class="rp-num" style="background:#e8f0ff">TOTAL</th></tr></thead><tbody>'
  +     '<tr><td style="font-weight:700;color:#025AC6">Daily book (Collections)</td>'
  +       months.map(function(m){ return '<td class="rp-num">'+rpPesoShort((s.funds[m]||{}).collections)+'</td>'; }).join('')
  +       '<td class="rp-num" style="font-weight:800;background:#f6f9ff">'+rpPesoShort(s.fund_collections)+'</td></tr>'
  +     '<tr><td style="font-weight:700;color:#C01176">Paid by Sir Wendell</td>'
  +       months.map(function(m){ return '<td class="rp-num">'+rpPesoShort((s.funds[m]||{}).wendell)+'</td>'; }).join('')
  +       '<td class="rp-num" style="font-weight:800;background:#fff4fb;color:#C01176">'+rpPesoShort(s.fund_wendell)+'</td></tr>'
  +   '</tbody><tfoot><tr style="background:#f0f4ff">'
  +     '<td style="font-weight:800;color:#1a1d2e">COMBINED</td>'
  +     months.map(function(m){ return '<td class="rp-num" style="font-weight:800">'+rpPesoShort((s.funds[m]||{}).tot)+'</td>'; }).join('')
  +     '<td class="rp-num" style="font-weight:800;background:#e8f0ff">'+rpPesoShort(s.grand)+'</td>'
  +   '</tr></tfoot></table></div>'
  + '</div>'
  + '<div class="rp-card" style="padding:0;overflow:hidden">'
  +   '<div class="rp-scroll" style="border:none;max-height:620px"><table class="rp-t">'
  +   '<thead><tr><th style="min-width:170px">Expense type</th>'
  +     months.map(function(m){ return '<th class="rp-num">'+RP_MONTHS[m].slice(0,3).toUpperCase()+'</th>'; }).join('')
  +     '<th class="rp-num" style="background:#e8f0ff">TOTAL</th></tr></thead><tbody>'
  +   rows.map(function(r){
        const dim = Number(r.total) === 0;
        return '<tr'+(dim?' style="opacity:.4"':'')+'>'
          + '<td style="font-weight:600"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:'+(r.color||'#94a3b8')+';margin-right:7px"></span>'+rpEsc(r.category)+'</td>'
          + months.map(function(m){ return '<td class="rp-num">'+rpPesoShort(r.months[m])+'</td>'; }).join('')
          + '<td class="rp-num" style="font-weight:800;background:#f6f9ff;color:#025AC6">'+rpPesoShort(r.total)+'</td>'
          + '</tr>';
      }).join('')
  +   '</tbody><tfoot><tr style="background:#f0f4ff">'
  +     '<td style="font-weight:800;color:#025AC6">TOTAL</td>'
  +     months.map(function(m){ return '<td class="rp-num" style="font-weight:800;color:#025AC6">'+rpPesoShort(colTotal[m])+'</td>'; }).join('')
  +     '<td class="rp-num" style="font-weight:800;background:#e8f0ff;color:#025AC6">'+rpPesoShort(s.grand)+'</td>'
  +   '</tr></tfoot></table></div>'
  + '</div>';

  window.__rpSummaryCache = { yr:yr, rows:rows, months:months, colTotal:colTotal, grand:s.grand };
}

window.rpExportSummary = function(){
  const c = window.__rpSummaryCache; if(!c) return;
  const head = ['Expense Type'].concat(c.months.map(function(m){ return RP_MONTHS[m]; })).concat(['TOTAL']);
  const lines = [head.join(',')];
  c.rows.forEach(function(r){
    lines.push(['"'+r.category+'"'].concat(c.months.map(function(m){ return Number(r.months[m])||0; })).concat([Number(r.total)||0]).join(','));
  });
  lines.push(['TOTAL'].concat(c.months.map(function(m){ return c.colTotal[m]; })).concat([c.grand]).join(','));
  const blob = new Blob([lines.join('\n')], { type:'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'spawn-expense-summary-' + c.yr + '.csv';
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
