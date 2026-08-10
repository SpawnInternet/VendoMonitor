// ══════════════════════════════════════════════════════════
// SPAWN FINANCIAL  —  Reports sub-tab
// Live financial statement: Revenue / Daily Expenses /
// Admin & Capital / Summary / Cash Recon, per month.
// Source: spawn_financial_pack() RPC via spawn-gw-admin.
// Downloadable to .xlsx (SheetJS loaded on demand).
// ══════════════════════════════════════════════════════════

let fnPack  = null;
let fnMonth = null;
let fnBusy  = false;

const FN_MONTHS = ['','January','February','March','April','May','June',
                   'July','August','September','October','November','December'];

function fnPeso(n){
  const v = Number(n)||0;
  return '\u20b1' + v.toLocaleString('en-PH',{minimumFractionDigits:2, maximumFractionDigits:2});
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
// index an array of {ym,...} rows by month
function fnBy(rows, key){
  const out = {};
  (rows||[]).forEach(function(r){
    const k = key ? (r.ym + '||' + r[key]) : r.ym;
    out[k] = r;
  });
  return out;
}

async function fnLoad(force){
  if(fnBusy) return;
  fnBusy = true;
  const host = document.getElementById('rp-mode-financial');
  if(!host){ fnBusy = false; return; }
  if(!fnPack || force){
    host.innerHTML = '<div style="padding:30px;text-align:center;color:#6b7394;font-size:13px">'
                   + 'Building financial statement\u2026</div>';
    try {
      fnPack = await rpRpc('spawn_financial_pack', { p_from: '2026-01-01' });
    } catch(e){
      host.innerHTML = '<div class="rp-card" style="border-color:#f3c2e2;color:#C01176;font-size:13px">'
        + '<b>Could not build the statement.</b><br>'
        + '<span style="font-size:11px;color:#8b93ad">' + fnEsc(e.message) + '</span><br>'
        + '<button class="rp-btn" style="margin-top:9px" onclick="fnLoad(true)">Try again</button></div>';
      fnBusy = false; return;
    }
  }
  fnBusy = false;
  const months = (fnPack && fnPack.months) || [];
  if(!months.length){ host.innerHTML = '<div class="rp-card">No financial data yet.</div>'; return; }
  if(!fnMonth || months.indexOf(fnMonth) < 0) fnMonth = months[months.length-1];
  fnRender();
}

// ── derive every figure for one month ─────────────────────
function fnFigures(ym){
  const rev  = fnBy(fnPack.revenue)[ym]    || {};
  const sub  = fnBy(fnPack.subscriber)[ym] || {};
  const cash = fnBy(fnPack.cash)[ym]       || {};
  const hv   = fnBy(fnPack.harvest_check)[ym] || {};

  const daily = (fnPack.daily_expense||[]).filter(function(r){ return r.ym === ym; });
  const admin = (fnPack.admin_expense||[]).filter(function(r){ return r.ym === ym; });

  const vendo      = Number(rev.vendo_sales)||0;
  const subInc     = Number(sub.income)||0;
  const otherInc   = Number(rev.other_income)||0;
  const totalRev   = vendo + subInc + otherInc;
  const dailyTot   = daily.reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);
  const adminTot   = admin.reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);
  const net        = totalRev - dailyTot - adminTot;

  return { ym, rev, sub, cash, hv, daily, admin,
           vendo, subInc, otherInc, totalRev, dailyTot, adminTot, net };
}

function fnRender(){
  const host = document.getElementById('rp-mode-financial');
  if(!host || !fnPack) return;
  const months = fnPack.months || [];
  const f = fnFigures(fnMonth);

  // harvest-coverage warning: the PWA record only became reliable in July 2026
  const hvSpawn = Number(f.hv.spawn_share)||0;
  const cover   = f.vendo ? Math.round(hvSpawn / f.vendo * 100) : 0;
  const thin    = f.vendo > 0 && cover < 80;

  document.getElementById('rp-actions').innerHTML =
      '<button class="rp-btn" onclick="fnExport()">\u2B07\uFE0F Download Excel</button>'
    + '<button class="rp-btn" onclick="fnLoad(true)">\u21BB Refresh</button>'
    + '<button class="rp-btn" onclick="window.print()">\u{1F5A8}\uFE0F Print</button>';

  const row = function(label, val, opts){
    const o = opts||{};
    return '<tr' + (o.total?' style="background:#f7f9fc;font-weight:800"':'') + '>'
      + '<td style="padding:6px 10px;border-bottom:1px solid #f2f5fa'
      +   (o.indent?';padding-left:26px;color:#4a5270':';font-weight:700') + '">' + fnEsc(label) + '</td>'
      + '<td class="rp-num" style="padding:6px 10px;border-bottom:1px solid #f2f5fa;text-align:right'
      +   (o.color?';color:'+o.color:'') + '">' + (val==null?'\u2014':fnPeso(val)) + '</td></tr>';
  };

  host.innerHTML = ''
    + '<div style="background:linear-gradient(135deg,#025AC6,#311A8E);border-radius:13px;'
    +   'padding:15px 17px;color:#fff;margin-bottom:12px;display:flex;justify-content:space-between;'
    +   'align-items:center;flex-wrap:wrap;gap:12px">'
    +   '<div><div style="font-size:15px;font-weight:800">Spawn Financial Statement</div>'
    +     '<div style="font-size:11px;opacity:.9;margin-top:2px">'
    +       'Revenue from the cash receipts ledger \u00b7 expenses from both books</div></div>'
    +   '<div style="display:flex;gap:8px;align-items:center">'
    +     '<select class="rp-in" style="width:auto;background:rgba(255,255,255,.15);'
    +       'border-color:rgba(255,255,255,.35);color:#fff;font-weight:700"'
    +       ' onchange="fnSetMonth(this.value)">'
    +       months.map(function(m){
              return '<option value="'+m+'"'+(m===fnMonth?' selected':'')
                   + ' style="color:#1a1d2e">'+fnLabel(m)+'</option>'; }).join('')
    +     '</select>'
    +   '</div>'
    + '</div>'

    // ── headline numbers
    + '<div class="rp-kpis">'
    +   '<div class="rp-kpi" style="border-bottom-color:#025AC6"><div class="k">Total Revenue</div>'
    +     '<div class="v">'+fnShort(f.totalRev)+'</div><div class="s">'+fnLabel(fnMonth)+'</div></div>'
    +   '<div class="rp-kpi" style="border-bottom-color:#C01176"><div class="k">Daily Expense</div>'
    +     '<div class="v" style="color:#C01176">'+fnShort(f.dailyTot)+'</div>'
    +     '<div class="s">'+f.daily.length+' categories</div></div>'
    +   '<div class="rp-kpi" style="border-bottom-color:#DF1A35"><div class="k">Admin &amp; Capital</div>'
    +     '<div class="v" style="color:#DF1A35">'+fnShort(f.adminTot)+'</div>'
    +     '<div class="s">'+f.admin.length+' groups</div></div>'
    +   '<div class="rp-kpi" style="border-bottom-color:'+(f.net<0?'#DF1A35':'#028867')+'">'
    +     '<div class="k">Net Income</div>'
    +     '<div class="v" style="color:'+(f.net<0?'#DF1A35':'#028867')+'">'+fnShort(f.net)+'</div>'
    +     '<div class="s">revenue \u2212 both books</div></div>'
    + '</div>'

    + (f.dailyTot === 0 ? '<div class="rp-card" style="border-color:#f5b3b3;background:#fff5f5;'
        + 'font-size:11.5px;color:#a11;margin-bottom:10px"><b>No daily expenses entered for '
        + fnLabel(fnMonth) + '.</b> The cash receipts ledger shows '
        + fnPeso(Number(f.cash.cash_expenses)||0) + ' of expenses actually spent this month, but '
        + 'nothing has been keyed into the daily expense book. Net income below is overstated by '
        + 'roughly that amount until the entries are made.</div>' : '')

    + (thin ? '<div class="rp-card" style="border-color:#ffe0a3;background:#fffaf0;font-size:11.5px;'
        + 'color:#8a5a00;margin-bottom:10px"><b>Heads up.</b> The harvest app only holds '
        + fnPeso(hvSpawn) + ' for ' + fnLabel(fnMonth) + ' \u2014 about ' + cover + '% of the '
        + fnPeso(f.vendo) + ' in the cash book. Vendo sales here come from the cash receipts '
        + 'ledger, which is the complete record for this month.</div>' : '')

    // ── Revenue
    + '<div class="rp-card" style="padding:0;overflow:hidden;margin-bottom:10px">'
    +   '<div style="padding:9px 12px;background:#f7f9fc;border-bottom:1px solid #e6ecf5;'
    +     'font-size:11px;font-weight:800;color:#025AC6;text-transform:uppercase;letter-spacing:.4px">Revenue</div>'
    +   '<table style="width:100%;border-collapse:collapse;font-size:12px"><tbody>'
    +     row('Vendo Sales (Piso WiFi)', f.vendo, {indent:true})
    +     row('Subscriber Income', f.subInc, {indent:true})
    +     row('Other Income (sales box)', f.otherInc, {indent:true})
    +     row('TOTAL REVENUE', f.totalRev, {total:true})
    +   '</tbody></table></div>'

    // ── Daily expenses
    + '<div class="rp-card" style="padding:0;overflow:hidden;margin-bottom:10px">'
    +   '<div style="padding:9px 12px;background:#f7f9fc;border-bottom:1px solid #e6ecf5;'
    +     'font-size:11px;font-weight:800;color:#C01176;text-transform:uppercase;letter-spacing:.4px">'
    +     'Daily Expenses \u00b7 Collections fund</div>'
    +   '<table style="width:100%;border-collapse:collapse;font-size:12px"><tbody>'
    +     (f.daily.length
        ? f.daily.slice().sort(function(a,b){ return (b.amount||0)-(a.amount||0); })
                 .map(function(r){ return row(r.category, r.amount, {indent:true}); }).join('')
        : '<tr><td style="padding:14px;color:#8b93ad" colspan="2">No daily expenses this month.</td></tr>')
    +     row('TOTAL DAILY EXPENSE', f.dailyTot, {total:true})
    +   '</tbody></table></div>'

    // ── Admin & capital
    + '<div class="rp-card" style="padding:0;overflow:hidden;margin-bottom:10px">'
    +   '<div style="padding:9px 12px;background:#f7f9fc;border-bottom:1px solid #e6ecf5;'
    +     'font-size:11px;font-weight:800;color:#DF1A35;text-transform:uppercase;letter-spacing:.4px">'
    +     'Admin &amp; Capital Expense</div>'
    +   '<table style="width:100%;border-collapse:collapse;font-size:12px"><tbody>'
    +     (f.admin.length
        ? f.admin.slice().sort(function(a,b){ return (b.amount||0)-(a.amount||0); })
                 .map(function(r){ return row(r.statement_group, r.amount, {indent:true}); }).join('')
        : '<tr><td style="padding:14px;color:#8b93ad" colspan="2">No admin expenses this month.</td></tr>')
    +     row('TOTAL ADMIN &amp; CAPITAL', f.adminTot, {total:true})
    +   '</tbody></table></div>'

    // ── Summary
    + '<div class="rp-card" style="padding:0;overflow:hidden;margin-bottom:10px">'
    +   '<div style="padding:9px 12px;background:#f7f9fc;border-bottom:1px solid #e6ecf5;'
    +     'font-size:11px;font-weight:800;color:#028867;text-transform:uppercase;letter-spacing:.4px">Summary</div>'
    +   '<table style="width:100%;border-collapse:collapse;font-size:12px"><tbody>'
    +     row('Total Revenue', f.totalRev, {indent:true})
    +     row('Less: Daily Expense', -f.dailyTot, {indent:true, color:'#C01176'})
    +     row('Less: Admin &amp; Capital', -f.adminTot, {indent:true, color:'#DF1A35'})
    +     row('NET INCOME', f.net, {total:true, color:(f.net<0?'#DF1A35':'#028867')})
    +   '</tbody></table></div>'

    // ── Cash reconciliation
    + '<div class="rp-card" style="padding:0;overflow:hidden;margin-bottom:10px">'
    +   '<div style="padding:9px 12px;background:#f7f9fc;border-bottom:1px solid #e6ecf5;'
    +     'font-size:11px;font-weight:800;color:#311A8E;text-transform:uppercase;letter-spacing:.4px">'
    +     'Cash Reconciliation</div>'
    +   '<table style="width:100%;border-collapse:collapse;font-size:12px"><tbody>'
    +     row('Net cash generated', f.cash.net_cash, {indent:true})
    +     row('Deposited', f.cash.deposited, {indent:true})
    +     row('Carried to next month', (Number(f.cash.net_cash)||0)-(Number(f.cash.deposited)||0), {indent:true})
    +     row('Over', f.cash.over_, {indent:true})
    +     row('Short', f.cash.short_, {indent:true})
    +     row('G-Cash (digital, not in net cash)', f.rev.gcash, {indent:true})
    +     row('Change received (returned money, not revenue)', f.rev.change_received, {indent:true})
    +     row('Discrepancy flagged (money out, awaiting return)', f.cash.discrepancy, {indent:true})
    +   '</tbody></table>'
    +   '<div style="padding:10px 12px;border-top:1px solid #eef2f8;font-size:10.5px;'
    +     'color:#6b7394;line-height:1.6;background:#fbfcfe">'
    +     '<b>About change received and money paid back.</b> The column figure above is the '
    +     'day\u2019s total change on hand \u2014 it is not the transaction amount. The real amount '
    +     'for each movement is written in the remarks column of the cash receipts sheet '
    +     '(for example \u201c14,000 Partial Payment ma\u2019am Joi\u201d). '
    +     'When a loan or advance goes out it is booked as an expense, so when it is paid back '
    +     'that money must be <b>added back to company money</b> \u2014 otherwise the expense '
    +     'stands with nothing offsetting it. Those repayments are not included in the figures '
    +     'above yet; they still have to be read from the remarks and tagged.'
    +   '</div></div>'

    + '<div style="font-size:10.5px;color:#8b93ad;line-height:1.6;background:#fbfcfe;'
    +   'border:1px solid #e6ecf5;border-radius:9px;padding:10px 12px">'
    +   '<b>How these are built.</b> Vendo sales come from the cash receipts ledger (column '
    +   '\u201cPiso WiFi\u201d, already Spawn\u2019s share), because it is complete for every month '
    +   'while the harvest app only became a full record from July 2026. Subscriber income is the '
    +   'payment ledger on payment date. Expenses are split by book \u2014 never by who paid. '
    +   'G-Cash and change received are shown for completeness but are not counted as revenue: '
    +   'G-Cash is already inside subscriber income, and change received is money returned to the business.'
    + '</div>';
}

function fnSetMonth(m){ fnMonth = m; fnRender(); }

// ── Excel export ──────────────────────────────────────────
// SheetJS is not on the critical path; pull it in on demand.
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
    const wb = XLSX.utils.book_new();

    // Summary sheet — every month side by side
    const head = ['Item'].concat(months.map(fnLabel));
    const rows = [
      ['SPAWN INTERNET \u2014 FINANCIAL SUMMARY 2026'], [], head,
      ['REVENUE'],
    ];
    const F = months.map(fnFigures);
    rows.push(['  Vendo Sales (Piso WiFi)'].concat(F.map(function(x){ return x.vendo; })));
    rows.push(['  Subscriber Income'].concat(F.map(function(x){ return x.subInc; })));
    rows.push(['  Other Income'].concat(F.map(function(x){ return x.otherInc; })));
    rows.push(['TOTAL REVENUE'].concat(F.map(function(x){ return x.totalRev; })));
    rows.push([]);
    rows.push(['EXPENSES']);
    rows.push(['  Daily Expense'].concat(F.map(function(x){ return x.dailyTot; })));
    rows.push(['  Admin & Capital'].concat(F.map(function(x){ return x.adminTot; })));
    rows.push(['TOTAL EXPENSE'].concat(F.map(function(x){ return x.dailyTot + x.adminTot; })));
    rows.push([]);
    rows.push(['NET INCOME'].concat(F.map(function(x){ return x.net; })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Summary');

    // Daily expense by category x month
    const cats = Array.from(new Set((fnPack.daily_expense||[]).map(function(r){ return r.category; }))).sort();
    const dRows = [['Category'].concat(months.map(fnLabel))];
    cats.forEach(function(c){
      dRows.push([c].concat(months.map(function(m){
        const hit = (fnPack.daily_expense||[]).find(function(r){ return r.ym===m && r.category===c; });
        return hit ? Number(hit.amount) : 0;
      })));
    });
    dRows.push(['TOTAL'].concat(F.map(function(x){ return x.dailyTot; })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dRows), 'Daily Expenses');

    // Admin expense by statement group x month
    const grps = Array.from(new Set((fnPack.admin_expense||[]).map(function(r){ return r.statement_group; }))).sort();
    const aRows = [['Statement Group'].concat(months.map(fnLabel))];
    grps.forEach(function(g){
      aRows.push([g].concat(months.map(function(m){
        const hit = (fnPack.admin_expense||[]).find(function(r){ return r.ym===m && r.statement_group===g; });
        return hit ? Number(hit.amount) : 0;
      })));
    });
    aRows.push(['TOTAL'].concat(F.map(function(x){ return x.adminTot; })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aRows), 'Admin & Capital');

    // Cash reconciliation
    const cRows = [['Item'].concat(months.map(fnLabel))];
    const pick = function(key){ return months.map(function(m){
      const r = fnBy(fnPack.cash)[m] || {}; return Number(r[key])||0; }); };
    cRows.push(['Net cash generated'].concat(pick('net_cash')));
    cRows.push(['Deposited'].concat(pick('deposited')));
    cRows.push(['Carried to next month'].concat(months.map(function(m){
      const r = fnBy(fnPack.cash)[m] || {};
      return (Number(r.net_cash)||0) - (Number(r.deposited)||0); })));
    cRows.push(['Over'].concat(pick('over_')));
    cRows.push(['Short'].concat(pick('short_')));
    cRows.push(['Discrepancy flagged'].concat(pick('discrepancy')));
    cRows.push(['G-Cash (digital)'].concat(months.map(function(m){
      const r = fnBy(fnPack.revenue)[m] || {}; return Number(r.gcash)||0; })));
    cRows.push(['Change received (returned)'].concat(months.map(function(m){
      const r = fnBy(fnPack.revenue)[m] || {}; return Number(r.change_received)||0; })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cRows), 'Cash Recon');

    const stamp = new Date(Date.now()+8*3600*1000).toISOString().slice(0,10);
    XLSX.writeFile(wb, 'Spawn_Financial_' + stamp + '.xlsx');
  } catch(e){
    alert('Could not build the Excel file: ' + (e && e.message || e));
  } finally {
    if(btn){ btn.disabled = false; btn.innerHTML = '\u2B07\uFE0F Download Excel'; }
  }
}
