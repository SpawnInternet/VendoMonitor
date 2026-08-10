// ══════════════════════════════════════════════════════════
// SPAWN FINANCIAL  —  Reports sub-tab
// Mirrors Spawn_Financial_2026.xlsx: one inner tab per sheet,
// line items down the rows, months across the columns.
// Source: spawn_financial_pack() + spawn_financial_lines().
// Read-only. Downloadable to .xlsx (SheetJS loaded on demand).
// ══════════════════════════════════════════════════════════

let fnPack  = null;
let fnLines = null;
let fnSheet = 'summary';
let fnBusy  = false;

const FN_MONTHS = ['','January','February','March','April','May','June',
                   'July','August','September','October','November','December'];
const FN_SHORT  = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Statement-group order and headings, matching the Excel
const FN_GROUPS = [
  ['capex',        '1. CAPITAL EXPENDITURE (CapEx)', 'One-time investments in infrastructure'],
  ['network',      '2. NETWORK & CONNECTIVITY (OpEx)','Recurring internet & utility costs'],
  ['maintenance',  '3. MAINTENANCE',                  'Repairs & upkeep of equipment and sites'],
  ['personnel',    '4. PERSONNEL',                    'Salaries, benefits and cash advances'],
  ['admin',        '5. ADMIN & GENERAL',              'Cards, meals, uniforms and general costs'],
  ['unclassified', '6. UNCLASSIFIED',                 'Not yet assigned a statement group']
];

function fnPeso(n){
  const v = Number(n)||0;
  if(!v) return '';
  return v.toLocaleString('en-PH',{minimumFractionDigits:2, maximumFractionDigits:2});
}
function fnShort(n){
  const v = Number(n)||0;
  if(!v) return '\u2014';
  return '\u20b1' + v.toLocaleString('en-PH',{maximumFractionDigits:0});
}
function fnEsc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fnLabel(ym){
  if(!ym) return '';
  const p = String(ym).split('-');
  return (FN_MONTHS[parseInt(p[1],10)]||ym) + ' ' + p[0];
}
function fnHead(ym){
  const p = String(ym).split('-');
  return (FN_SHORT[parseInt(p[1],10)]||ym);
}
function fnBy(rows){
  const out = {};
  (rows||[]).forEach(function(r){ out[r.ym] = r; });
  return out;
}

function fnStyles(){
  if(document.getElementById('fn-styles')) return;
  const css = ''
  + '.fn-sheettabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;'
  +   'border-bottom:2px solid #e6ecf5;padding-bottom:0}'
  + '.fn-st{border:1px solid #e6ecf5;border-bottom:none;background:#f7f9fc;color:#4a5270;'
  +   'border-radius:8px 8px 0 0;padding:7px 14px;font-size:11.5px;font-weight:700;'
  +   'cursor:pointer;font-family:inherit;position:relative;top:2px}'
  + '.fn-st.active{background:#fff;color:#025AC6;border-color:#e6ecf5;'
  +   'box-shadow:0 -2px 0 #025AC6 inset;top:2px}'
  + '.fn-grid{width:100%;border-collapse:collapse;font-size:11.5px;'
  +   'font-variant-numeric:tabular-nums}'
  + '.fn-grid th{background:#1f2b52;color:#fff;padding:7px 9px;font-size:10.5px;'
  +   'font-weight:800;text-align:right;white-space:nowrap;position:sticky;top:0;z-index:2}'
  + '.fn-grid th.l{text-align:left;left:0;z-index:3;min-width:220px}'
  + '.fn-grid td{padding:5px 9px;border-bottom:1px solid #f2f5fa;text-align:right;'
  +   'white-space:nowrap}'
  + '.fn-grid td.l{text-align:left;position:sticky;left:0;background:#fff;z-index:1;'
  +   'font-weight:600;color:#1a1d2e}'
  + '.fn-grid tr.sec td{background:#eef2fb;font-weight:800;color:#1f2b52;'
  +   'font-size:10.5px;text-transform:uppercase;letter-spacing:.3px}'
  + '.fn-grid tr.sec td.l{background:#eef2fb}'
  + '.fn-grid tr.sub td{background:#f7f9fc;font-weight:800}'
  + '.fn-grid tr.sub td.l{background:#f7f9fc}'
  + '.fn-grid tr.tot td{background:#1f2b52;color:#fff;font-weight:800}'
  + '.fn-grid tr.tot td.l{background:#1f2b52;color:#fff}'
  + '.fn-grid tr.item td.l{font-weight:500;color:#4a5270;padding-left:22px}'
  + '.fn-grid tr:hover td{background:#f8fbff}'
  + '.fn-grid tr.sec:hover td,.fn-grid tr.tot:hover td{background:inherit}'
  + '.fn-scroll{overflow:auto;max-height:64vh;border:1px solid #e6ecf5;border-radius:10px;background:#fff}'
  + '.fn-neg{color:#DF1A35}';
  const el = document.createElement('style');
  el.id = 'fn-styles'; el.textContent = css;
  document.head.appendChild(el);
}

async function fnLoad(force){
  if(fnBusy) return;
  fnBusy = true;
  fnStyles();
  const host = document.getElementById('rp-mode-financial');
  if(!host){ fnBusy = false; return; }
  if(!fnPack || force){
    host.innerHTML = '<div style="padding:30px;text-align:center;color:#6b7394;font-size:13px">'
                   + 'Building financial statement\u2026</div>';
    try {
      const res = await Promise.all([
        rpRpc('spawn_financial_pack',  { p_from: '2026-01-01' }),
        rpRpc('spawn_financial_lines', { p_from: '2026-01-01' })
      ]);
      fnPack = res[0]; fnLines = res[1];
    } catch(e){
      host.innerHTML = '<div class="rp-card" style="border-color:#f3c2e2;color:#C01176;font-size:13px">'
        + '<b>Could not build the statement.</b><br>'
        + '<span style="font-size:11px;color:#8b93ad">' + fnEsc(e.message) + '</span><br>'
        + '<button class="rp-btn" style="margin-top:9px" onclick="fnLoad(true)">Try again</button></div>';
      fnBusy = false; return;
    }
  }
  fnBusy = false;
  if(!fnPack || !(fnPack.months||[]).length){
    host.innerHTML = '<div class="rp-card">No financial data yet.</div>'; return;
  }
  fnRender();
}

// ── per-month figures ─────────────────────────────────────
function fnFigures(ym){
  const rev  = fnBy(fnPack.revenue)[ym]       || {};
  const ret  = fnBy(fnPack.returns)[ym]       || {};
  const sub  = fnBy(fnPack.subscriber)[ym]    || {};
  const cash = fnBy(fnPack.cash)[ym]          || {};
  const hv   = fnBy(fnPack.harvest_check)[ym] || {};

  const daily = (fnPack.daily_expense||[]).filter(function(r){ return r.ym === ym; });
  const admin = (fnPack.admin_expense||[]).filter(function(r){ return r.ym === ym; });

  const vendo     = Number(rev.vendo_sales)||0;
  const subInc    = Number(sub.income)||0;
  const otherInc  = Number(rev.other_income)||0;
  const loanBack  = Number(ret.loan_repaid)||0;
  const otherBack = Number(ret.other_income)||0;
  const addBack   = loanBack + otherBack;

  const totalRev = vendo + subInc + otherInc + addBack;
  const dailyTot = daily.reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);
  const adminTot = admin.reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);

  return { ym, rev, ret, sub, cash, hv,
           vendo, subInc, otherInc, loanBack, otherBack, addBack,
           totalRev, dailyTot, adminTot, net: totalRev - dailyTot - adminTot,
           chgBack: Number(ret.change_returned)||0,
           sukli:   Number(ret.sukli)||0,
           capital: Number(ret.capital)||0,
           tagged:  Number(ret.tagged)||0,
           untagged:Number(ret.untagged)||0 };
}

// ── grid helpers ──────────────────────────────────────────
function fnRow(label, vals, cls){
  return '<tr class="' + (cls||'') + '"><td class="l">' + fnEsc(label) + '</td>'
    + vals.map(function(v){
        const n = Number(v)||0;
        return '<td' + (n<0?' class="fn-neg"':'') + '>' + fnPeso(v) + '</td>';
      }).join('')
    + '</tr>';
}
function fnGrid(months, body){
  return '<div class="fn-scroll"><table class="fn-grid"><thead><tr>'
    + '<th class="l">Particular</th>'
    + months.map(function(m){ return '<th>' + fnHead(m) + '</th>'; }).join('')
    + '<th>TOTAL</th></tr></thead><tbody>' + body + '</tbody></table></div>';
}
// sum a row across months, appending the total column
function fnWithTotal(vals){
  const t = vals.reduce(function(s,v){ return s + (Number(v)||0); }, 0);
  return vals.concat([t]);
}
function fnLineVals(rows, months, matchFn){
  return months.map(function(m){
    const hit = (rows||[]).filter(function(r){ return r.ym===m && matchFn(r); });
    return hit.reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);
  });
}

function fnRender(){
  const host = document.getElementById('rp-mode-financial');
  if(!host || !fnPack) return;
  const months = fnPack.months || [];
  const F = months.map(fnFigures);
  const untagged = F.reduce(function(s,x){ return s + x.untagged; }, 0);
  const noExp = F.filter(function(x){ return x.dailyTot === 0; }).map(function(x){ return fnHead(x.ym); });

  document.getElementById('rp-actions').innerHTML =
      '<button class="rp-btn" onclick="fnExport()">\u2B07\uFE0F Download Excel</button>'
    + '<button class="rp-btn" onclick="fnLoad(true)">\u21BB Refresh</button>'
    + '<button class="rp-btn" onclick="window.print()">\u{1F5A8}\uFE0F Print</button>';

  const sheets = [
    ['summary', '\u{1F4CA} Summary'],
    ['revenue', '\u{1F4B0} Revenue'],
    ['daily',   '\u{1F4B8} Daily Expenses'],
    ['admin',   '\u{1F3E6} Admin & Capital'],
    ['cash',    '\u{1F9FE} Cash Recon']
  ];

  host.innerHTML = ''
    + '<div style="background:linear-gradient(135deg,#025AC6,#311A8E);border-radius:12px;'
    +   'padding:13px 16px;color:#fff;margin-bottom:11px">'
    +   '<div style="font-size:15px;font-weight:800">Spawn Financial Statement 2026</div>'
    +   '<div style="font-size:11px;opacity:.9;margin-top:2px">'
    +     'Live from the database \u00b7 same layout as the workbook, months across the columns</div>'
    + '</div>'

    + (untagged ? '<div class="rp-card" style="border-color:#ffe0a3;background:#fffaf0;'
        + 'font-size:11.5px;color:#8a5a00;margin-bottom:9px"><b>' + untagged
        + ' cash receipt remarks still untagged.</b> Money paid back is written in the remarks '
        + 'column of CASH RECEIPTS but has no Type/Amount in columns P and Q, so it is not counted. '
        + 'Net income is understated until those are filled in.</div>' : '')

    + (noExp.length ? '<div class="rp-card" style="border-color:#f5b3b3;background:#fff5f5;'
        + 'font-size:11.5px;color:#a11;margin-bottom:9px"><b>No daily expenses entered for '
        + noExp.join(', ') + '.</b> The cash receipts ledger shows money was spent in '
        + (noExp.length===1?'that month':'those months')
        + ', so net income there is overstated until the entries are made.</div>' : '')

    + '<div class="fn-sheettabs">'
    +   sheets.map(function(s){
          return '<button class="fn-st' + (fnSheet===s[0]?' active':'') + '" '
               + 'onclick="fnSetSheet(\'' + s[0] + '\')">' + s[1] + '</button>';
        }).join('')
    + '</div>'
    + '<div id="fn-sheet"></div>';

  fnRenderSheet(months, F);
}

function fnSetSheet(s){
  fnSheet = s;
  const months = fnPack.months || [];
  fnRender();
}

function fnRenderSheet(months, F){
  const el = document.getElementById('fn-sheet');
  if(!el) return;
  const col = function(fn){ return fnWithTotal(F.map(fn)); };

  if(fnSheet === 'summary'){
    el.innerHTML = fnGrid(months, ''
      + fnRow('REVENUE', months.concat(['']).map(function(){ return ''; }), 'sec')
      + fnRow('Vendo Sales (Piso WiFi)', col(function(x){ return x.vendo; }), 'item')
      + fnRow('Subscriber Income',       col(function(x){ return x.subInc; }), 'item')
      + fnRow('Other Income',            col(function(x){ return x.otherInc; }), 'item')
      + fnRow('Add back: money paid back', col(function(x){ return x.addBack; }), 'item')
      + fnRow('TOTAL REVENUE',           col(function(x){ return x.totalRev; }), 'sub')
      + fnRow('EXPENSES', months.concat(['']).map(function(){ return ''; }), 'sec')
      + fnRow('Daily Expense',           col(function(x){ return x.dailyTot; }), 'item')
      + fnRow('Admin & Capital',         col(function(x){ return x.adminTot; }), 'item')
      + fnRow('TOTAL EXPENSE',           col(function(x){ return x.dailyTot + x.adminTot; }), 'sub')
      + fnRow('NET INCOME',              col(function(x){ return x.net; }), 'tot')
    );
    return;
  }

  if(fnSheet === 'revenue'){
    el.innerHTML = fnGrid(months, ''
      + fnRow('VENDO SALES (Piso WiFi)', months.concat(['']).map(function(){ return ''; }), 'sec')
      + fnRow('From cash receipts ledger', col(function(x){ return x.vendo; }), 'item')
      + fnRow('SUBSCRIBER INCOME', months.concat(['']).map(function(){ return ''; }), 'sec')
      + fnRow('Subscriber payments',   col(function(x){ return x.subInc; }), 'item')
      + fnRow('Payments received',     col(function(x){ return Number(x.sub.payments)||0; }), 'item')
      + fnRow('OTHER', months.concat(['']).map(function(){ return ''; }), 'sec')
      + fnRow('Sales box / vendo box', col(function(x){ return x.otherInc; }), 'item')
      + fnRow('Loans repaid',          col(function(x){ return x.loanBack; }), 'item')
      + fnRow('Other income returned', col(function(x){ return x.otherBack; }), 'item')
      + fnRow('TOTAL REVENUE',         col(function(x){ return x.totalRev; }), 'tot')
      + fnRow('MEMO \u2014 not revenue', months.concat(['']).map(function(){ return ''; }), 'sec')
      + fnRow('G-Cash (inside subscriber income)', col(function(x){ return Number(x.rev.gcash)||0; }), 'item')
      + fnRow('Change received (day total on hand)', col(function(x){ return Number(x.rev.change_received)||0; }), 'item')
      + fnRow('Harvest app recorded',  col(function(x){ return Number(x.hv.spawn_share)||0; }), 'item')
    );
    return;
  }

  if(fnSheet === 'daily'){
    const cats = Array.from(new Set((fnLines && fnLines.daily_lines || [])
                   .map(function(r){ return r.line; }))).sort();
    let body = fnRow('DAILY EXPENSES \u2014 Collections fund',
                     months.concat(['']).map(function(){ return ''; }), 'sec');
    cats.forEach(function(c){
      const vals = fnLineVals(fnLines.daily_lines, months, function(r){ return r.line===c; });
      body += fnRow(c, fnWithTotal(vals), 'item');
    });
    body += fnRow('TOTAL DAILY EXPENSE', col(function(x){ return x.dailyTot; }), 'tot');
    el.innerHTML = fnGrid(months, body);
    return;
  }

  if(fnSheet === 'admin'){
    const lines = (fnLines && fnLines.admin_lines) || [];
    let body = '';
    FN_GROUPS.forEach(function(g){
      const key = g[0];
      const inGrp = Array.from(new Set(lines.filter(function(r){ return r.statement_group===key; })
                        .map(function(r){ return r.line; }))).sort();
      if(!inGrp.length) return;
      body += fnRow(g[1] + '  \u2014  ' + g[2],
                    months.concat(['']).map(function(){ return ''; }), 'sec');
      inGrp.forEach(function(ln){
        const vals = fnLineVals(lines, months, function(r){
          return r.statement_group===key && r.line===ln; });
        body += fnRow(ln, fnWithTotal(vals), 'item');
      });
      const sub = fnLineVals(lines, months, function(r){ return r.statement_group===key; });
      body += fnRow('Subtotal \u2014 ' + g[1].replace(/^\d+\.\s*/,''), fnWithTotal(sub), 'sub');
    });
    body += fnRow('TOTAL ADMIN & CAPITAL', col(function(x){ return x.adminTot; }), 'tot');
    el.innerHTML = fnGrid(months, body);
    return;
  }

  if(fnSheet === 'cash'){
    el.innerHTML = fnGrid(months, ''
      + fnRow('CASH HANDLED', months.concat(['']).map(function(){ return ''; }), 'sec')
      + fnRow('Piso WiFi collections', col(function(x){ return x.vendo; }), 'item')
      + fnRow('Subscriber income (ledger)', col(function(x){ return x.subInc; }), 'item')
      + fnRow('G-Cash (digital)', col(function(x){ return Number(x.rev.gcash)||0; }), 'item')
      + fnRow('Change received', col(function(x){ return Number(x.rev.change_received)||0; }), 'item')
      + fnRow('NET CASH', col(function(x){ return Number(x.cash.net_cash)||0; }), 'sub')
      + fnRow('DEPOSITS', months.concat(['']).map(function(){ return ''; }), 'sec')
      + fnRow('Deposited', col(function(x){ return Number(x.cash.deposited)||0; }), 'item')
      + fnRow('Carried to next month', col(function(x){
          return (Number(x.cash.net_cash)||0) - (Number(x.cash.deposited)||0); }), 'item')
      + fnRow('OVER / SHORT', months.concat(['']).map(function(){ return ''; }), 'sec')
      + fnRow('Over', col(function(x){ return Number(x.cash.over_)||0; }), 'item')
      + fnRow('Short', col(function(x){ return Number(x.cash.short_)||0; }), 'item')
      + fnRow('Discrepancy flagged', col(function(x){ return Number(x.cash.discrepancy)||0; }), 'item')
      + fnRow('MONEY PAID BACK (tagged)', months.concat(['']).map(function(){ return ''; }), 'sec')
      + fnRow('Loans repaid \u2014 adds to net', col(function(x){ return x.loanBack; }), 'item')
      + fnRow('Other income returned \u2014 adds to net', col(function(x){ return x.otherBack; }), 'item')
      + fnRow('Float returned \u2014 cash only', col(function(x){ return x.chgBack; }), 'item')
      + fnRow('Sukli returned \u2014 cash only', col(function(x){ return x.sukli; }), 'item')
      + fnRow('Owner capital in \u2014 financing', col(function(x){ return x.capital; }), 'item')
      + fnRow('Remarks still untagged', col(function(x){ return x.untagged; }), 'sub')
    );
    return;
  }
}

// ── Excel export ──────────────────────────────────────────
async function fnExport(){
  const btn = document.querySelector('#rp-actions .rp-btn');
  if(btn){ btn.disabled = true; btn.textContent = '\u23F3 Building\u2026'; }
  try {
    if(typeof XLSX === 'undefined'){
      if(!window.spawnLazy) throw new Error('loader unavailable \u2014 hard-refresh and retry');
      await window.spawnLazy('xlsx');
    }
    if(typeof XLSX === 'undefined') throw new Error('spreadsheet library did not load');

    const months = fnPack.months || [];
    const F  = months.map(fnFigures);
    const wb = XLSX.utils.book_new();
    const head = ['Particular'].concat(months.map(fnLabel)).concat(['TOTAL']);
    const line = function(label, vals){ return [label].concat(fnWithTotal(vals)); };
    const col  = function(fn){ return F.map(fn); };

    // Summary
    let a = [['SPAWN INTERNET \u2014 FINANCIAL SUMMARY 2026'], [], head, ['REVENUE']];
    a.push(line('  Vendo Sales (Piso WiFi)', col(function(x){ return x.vendo; })));
    a.push(line('  Subscriber Income',       col(function(x){ return x.subInc; })));
    a.push(line('  Other Income',            col(function(x){ return x.otherInc; })));
    a.push(line('  Add back: money paid back', col(function(x){ return x.addBack; })));
    a.push(line('TOTAL REVENUE',             col(function(x){ return x.totalRev; })));
    a.push([]); a.push(['EXPENSES']);
    a.push(line('  Daily Expense',   col(function(x){ return x.dailyTot; })));
    a.push(line('  Admin & Capital', col(function(x){ return x.adminTot; })));
    a.push(line('TOTAL EXPENSE',     col(function(x){ return x.dailyTot + x.adminTot; })));
    a.push([]);
    a.push(line('NET INCOME', col(function(x){ return x.net; })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a), 'Summary');

    // Revenue
    a = [head];
    a.push(line('Vendo Sales (Piso WiFi)', col(function(x){ return x.vendo; })));
    a.push(line('Subscriber Income',       col(function(x){ return x.subInc; })));
    a.push(line('Sales box / vendo box',   col(function(x){ return x.otherInc; })));
    a.push(line('Loans repaid',            col(function(x){ return x.loanBack; })));
    a.push(line('Other income returned',   col(function(x){ return x.otherBack; })));
    a.push(line('TOTAL REVENUE',           col(function(x){ return x.totalRev; })));
    a.push([]); a.push(['MEMO \u2014 not revenue']);
    a.push(line('G-Cash (inside subscriber income)', col(function(x){ return Number(x.rev.gcash)||0; })));
    a.push(line('Change received (day total)',       col(function(x){ return Number(x.rev.change_received)||0; })));
    a.push(line('Harvest app recorded',              col(function(x){ return Number(x.hv.spawn_share)||0; })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a), 'Revenue');

    // Daily Expenses
    const cats = Array.from(new Set((fnLines.daily_lines||[]).map(function(r){ return r.line; }))).sort();
    a = [head];
    cats.forEach(function(c){
      a.push(line(c, fnLineVals(fnLines.daily_lines, months, function(r){ return r.line===c; })));
    });
    a.push(line('TOTAL DAILY EXPENSE', col(function(x){ return x.dailyTot; })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a), 'Daily Expenses');

    // Admin & Capital
    a = [head];
    FN_GROUPS.forEach(function(g){
      const key = g[0];
      const inGrp = Array.from(new Set((fnLines.admin_lines||[])
                      .filter(function(r){ return r.statement_group===key; })
                      .map(function(r){ return r.line; }))).sort();
      if(!inGrp.length) return;
      a.push([g[1] + '  ' + g[2]]);
      inGrp.forEach(function(ln){
        a.push(line('  ' + ln, fnLineVals(fnLines.admin_lines, months, function(r){
          return r.statement_group===key && r.line===ln; })));
      });
      a.push(line('Subtotal \u2014 ' + g[1].replace(/^\d+\.\s*/,''),
        fnLineVals(fnLines.admin_lines, months, function(r){ return r.statement_group===key; })));
    });
    a.push(line('TOTAL ADMIN & CAPITAL', col(function(x){ return x.adminTot; })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a), 'Admin & Capital');

    // Cash Recon
    a = [head];
    a.push(line('Piso WiFi collections', col(function(x){ return x.vendo; })));
    a.push(line('G-Cash (digital)',      col(function(x){ return Number(x.rev.gcash)||0; })));
    a.push(line('Change received',       col(function(x){ return Number(x.rev.change_received)||0; })));
    a.push(line('NET CASH',              col(function(x){ return Number(x.cash.net_cash)||0; })));
    a.push(line('Deposited',             col(function(x){ return Number(x.cash.deposited)||0; })));
    a.push(line('Carried to next month', col(function(x){
      return (Number(x.cash.net_cash)||0)-(Number(x.cash.deposited)||0); })));
    a.push(line('Over',  col(function(x){ return Number(x.cash.over_)||0; })));
    a.push(line('Short', col(function(x){ return Number(x.cash.short_)||0; })));
    a.push(line('Discrepancy flagged', col(function(x){ return Number(x.cash.discrepancy)||0; })));
    a.push([]); a.push(['MONEY PAID BACK (tagged)']);
    a.push(line('Loans repaid \u2014 adds to net',  col(function(x){ return x.loanBack; })));
    a.push(line('Other income returned \u2014 adds to net', col(function(x){ return x.otherBack; })));
    a.push(line('Float returned \u2014 cash only',  col(function(x){ return x.chgBack; })));
    a.push(line('Sukli returned \u2014 cash only',  col(function(x){ return x.sukli; })));
    a.push(line('Owner capital in \u2014 financing', col(function(x){ return x.capital; })));
    a.push(line('Remarks still untagged', col(function(x){ return x.untagged; })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a), 'Cash Recon');

    const stamp = new Date(Date.now()+8*3600*1000).toISOString().slice(0,10);
    XLSX.writeFile(wb, 'Spawn_Financial_' + stamp + '.xlsx');
  } catch(e){
    alert('Could not build the Excel file: ' + (e && e.message || e));
  } finally {
    if(btn){ btn.disabled = false; btn.innerHTML = '\u2B07\uFE0F Download Excel'; }
  }
}
