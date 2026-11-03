// ══════════════════════════════════════════════════════════
// ANALYTICS → 📊 Income & Net (2026-11-03)
// Charts the same monthly figures as Reports → Financial summary
// (spawn_financial_pack): total revenue, total expense, net income,
// and what the revenue is made of. Read-only; the default Analytics view.
// Uses its own copy of the pack so Reports keeps its own loading.
// ══════════════════════════════════════════════════════════
(function(){
  if (typeof window === 'undefined') return;
  const MON = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const peso = n => { const v = Number(n||0); return (v < 0 ? '−' : '') + '\u20b1' + Math.abs(v).toLocaleString('en-PH', {maximumFractionDigits: 0}); };
  const pesoK = n => { const v = Number(n||0), a = Math.abs(v); return (v < 0 ? '−' : '') + '\u20b1' + (a >= 1e6 ? (a/1e6).toFixed(2) + 'M' : a >= 1e3 ? Math.round(a/1e3) + 'k' : Math.round(a)); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const by = rows => { const o = {}; (rows||[]).forEach(r => { o[r.ym] = r; }); return o; };
  const head = ym => MON[parseInt(String(ym).split('-')[1], 10)] || ym;
  let pack = null, busy = false, charts = [];

  // same arithmetic as Reports → Financial summary (fnFigures)
  function fig(P, ym){
    const rev = by(P.revenue)[ym] || {}, ret = by(P.returns)[ym] || {}, sub = by(P.subscriber)[ym] || {};
    const daily = (P.daily_expense||[]).filter(r => r.ym === ym).reduce((s,r)=>s+(Number(r.amount)||0), 0);
    const admin = (P.admin_expense||[]).filter(r => r.ym === ym).reduce((s,r)=>s+(Number(r.amount)||0), 0);
    const vendo = Number(rev.vendo_sales)||0, subInc = Number(sub.income)||0, other = (Number(rev.other_income)||0) + (Number(ret.other_income)||0);
    const expPaid = Number(ret.expense_paid)||0;
    const revenue = vendo + subInc + other, expense = daily + admin + expPaid;
    return { ym, vendo, subInc, other, daily, admin, expPaid, revenue, expense, net: revenue - expense };
  }

  function css(){
    if (document.getElementById('anf-css')) return;
    const st = document.createElement('style'); st.id = 'anf-css';
    st.textContent = `
      #anv-fin .anf-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px}
      #anv-fin .anf-k{background:#fff;border:1px solid #e3e8f2;border-radius:12px;padding:12px 14px;border-bottom:3px solid #cbd5e1}
      #anv-fin .anf-k small{display:block;font-size:11px;font-weight:700;color:#6b7394;text-transform:uppercase;letter-spacing:.04em}
      #anv-fin .anf-k b{display:block;font-size:22px;font-weight:900;margin-top:2px;font-variant-numeric:tabular-nums}
      #anv-fin .anf-k i{font-style:normal;font-size:11.5px;color:#6b7394}
      #anv-fin .anf-row{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:12px;margin-bottom:12px}
      @media(max-width:900px){#anv-fin .anf-row{grid-template-columns:1fr}}
      #anv-fin table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
      #anv-fin th{background:#1f2a4d;color:#fff;text-align:right;padding:7px 9px;font-weight:800;font-size:11.5px}
      #anv-fin th:first-child{text-align:left}
      #anv-fin td{padding:6px 9px;border-bottom:1px solid #eef1f6;text-align:right}
      #anv-fin td:first-child{text-align:left;font-weight:700}
      #anv-fin tr.tot td{font-weight:900;background:#f4f7fc}
      #anv-fin .neg{color:#d91934}`;
    document.head.appendChild(st);
  }

  async function load(force){
    const host = document.getElementById('anv-fin'); if (!host) return;
    css();
    if (busy) return;
    if (!pack || force) {
      busy = true;
      host.innerHTML = '<div style="padding:28px;text-align:center;color:#6b7394;font-size:13px">Building the income chart…</div>';
      try {
        const y = new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Manila'}).slice(0,4);
        pack = (typeof rpRpc === 'function') ? await rpRpc('spawn_financial_pack', { p_from: y + '-01-01' })
             : await fetch(window.__SPAWN_SB + '/rest/v1/rpc/spawn_financial_pack', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({p_from: y + '-01-01'})}).then(r => r.json());
      } catch (e) {
        busy = false;
        host.innerHTML = `<div class="cs" style="color:#C01176;font-size:13px"><b>Could not load the figures.</b> <span style="color:#8b93ad;font-size:11px">${esc(e.message)}</span><br><button type="button" onclick="anfLoad(true)" style="margin-top:8px;padding:6px 12px;border-radius:8px;border:1px solid #dbe3f0;background:#fff;cursor:pointer">Try again</button></div>`;
        return;
      }
      busy = false;
    }
    draw();
  }

  // expense categories: daily-book categories + admin & capital groups (same rows the statement adds up)
  const ADM = { network:'Network (admin book)', admin:'Admin', capex:'Capital / equipment', personnel:'Personnel', maintenance:'Maintenance' };
  function cats(P, months){
    const m = {};
    const add = (k, kind, ym, a) => { m[k] = m[k] || { k, kind, by:{}, tot:0 }; m[k].by[ym] = (m[k].by[ym] || 0) + a; m[k].tot += a; };
    (P.daily_expense||[]).forEach(r => { if (months.includes(r.ym)) add(r.category || 'Uncategorised', 'daily', r.ym, Number(r.amount)||0); });
    (P.admin_expense||[]).forEach(r => { if (months.includes(r.ym)) add(ADM[r.statement_group] || ('Admin · ' + (r.statement_group || 'other')), 'admin', r.ym, Number(r.amount)||0); });
    return Object.values(m).filter(c => Math.abs(c.tot) >= 1).sort((a,b) => b.tot - a.tot);
  }
  function expHtml(F, C){
    const E = F.reduce((s,x) => s + x.expense, 0), last = F[F.length-1], prev = F[F.length-2];
    const top = C[0], dailyN = C.filter(c => c.kind === 'daily').length;
    const avg = E / F.length, hi = F.reduce((a,b) => b.expense > a.expense ? b : a, F[0]);
    return `<div class="cs-t" style="margin:18px 2px 10px;font-size:14px">💸 Expenses</div>
      <div class="anf-kpis">
        <div class="anf-k" style="border-bottom-color:#d91934"><small>Total spent</small><b style="color:#d91934">${peso(E)}</b><i>avg ${peso(avg)}/mo</i></div>
        <div class="anf-k" style="border-bottom-color:#B47F00"><small>${head(last.ym)} spent</small><b>${peso(last.expense)}</b><i>${prev ? (last.expense >= prev.expense ? '▲ ' : '▼ ') + peso(Math.abs(last.expense - prev.expense)) + ' vs ' + head(prev.ym) : '—'}</i></div>
        <div class="anf-k" style="border-bottom-color:#C01176"><small>Highest month</small><b>${head(hi.ym)} ${peso(hi.expense)}</b><i>admin & capital ${peso(hi.admin)}</i></div>
        <div class="anf-k" style="border-bottom-color:#311A8E"><small>Biggest item</small><b style="font-size:16px">${esc(top ? top.k : '—')}</b><i>${top ? peso(top.tot) + ' · ' + Math.round(top.tot / E * 100) + '% of spending' : ''}</i></div>
      </div>
      <div class="anf-row">
        <div class="cs"><div class="cs-t">Expenses per month · daily vs admin &amp; capital</div><div class="chart-wrap" style="height:320px"><canvas id="anf-c3"></canvas></div></div>
        <div class="cs"><div class="cs-t">Where the money goes · ${F.length} months</div><div class="chart-wrap" style="height:320px"><canvas id="anf-c4"></canvas></div></div>
      </div>
      <div class="cs"><details><summary style="cursor:pointer;font-weight:800;font-size:12.5px;color:#1f2a4d">Expenses by category per month <span style="font-weight:600;color:#6b7394">· ${C.length} categories (${dailyN} daily book, ${C.length - dailyN} admin &amp; capital) · tap to open</span></summary>
        <div style="overflow-x:auto;margin-top:8px"><table><thead><tr><th>Category</th>${F.map(x => `<th>${head(x.ym)}</th>`).join('')}<th>Total</th><th>Share</th></tr></thead><tbody>
        ${C.map(c => `<tr><td>${esc(c.k)} <span style="font-weight:500;color:#9aa3b8;font-size:11px">${c.kind === 'admin' ? 'admin' : 'daily'}</span></td>${F.map(x => `<td>${c.by[x.ym] ? peso(c.by[x.ym]) : ''}</td>`).join('')}<td><b>${peso(c.tot)}</b></td><td>${Math.round(c.tot / E * 100)}%</td></tr>`).join('')}
        <tr class="tot"><td>Total</td>${F.map(x => `<td>${peso(x.expense)}</td>`).join('')}<td>${peso(E)}</td><td>100%</td></tr>
        </tbody></table></div></details></div>`;
  }

  function draw(){
    const host = document.getElementById('anv-fin'); if (!host || !pack) return;
    const F = (pack.months || []).map(ym => fig(pack, ym));
    const C = cats(pack, F.map(x => x.ym));
    if (!F.length) { host.innerHTML = '<div class="cs">No financial data yet.</div>'; return; }
    const sum = k => F.reduce((s,x) => s + x[k], 0);
    const R = sum('revenue'), E = sum('expense'), N = R - E;
    const best = F.reduce((a,b) => b.net > a.net ? b : a, F[0]), worst = F.reduce((a,b) => b.net < a.net ? b : a, F[0]);
    const last = F[F.length-1], prev = F[F.length-2];
    const chg = prev ? last.net - prev.net : 0;
    const margin = R ? Math.round(N / R * 100) : 0;
    const yr = String(F[0].ym).slice(0,4);
    host.innerHTML = `
      <div class="anf-kpis">
        <div class="anf-k" style="border-bottom-color:#025AC6"><small>Revenue ${yr}</small><b style="color:#025AC6">${peso(R)}</b><i>${F.length} months · avg ${peso(R/F.length)}/mo</i></div>
        <div class="anf-k" style="border-bottom-color:#d91934"><small>Expenses ${yr}</small><b style="color:#d91934">${peso(E)}</b><i>daily ${peso(sum('daily'))} · admin & capital ${peso(sum('admin'))}</i></div>
        <div class="anf-k" style="border-bottom-color:#028867"><small>Net income ${yr}</small><b style="color:${N < 0 ? '#d91934' : '#028867'}">${peso(N)}</b><i>${margin}% of revenue kept</i></div>
        <div class="anf-k" style="border-bottom-color:#B47F00"><small>${head(last.ym)} net</small><b style="color:${last.net < 0 ? '#d91934' : '#1f2a4d'}">${peso(last.net)}</b><i>${prev ? (chg >= 0 ? '▲ ' : '▼ ') + peso(Math.abs(chg)) + ' vs ' + head(prev.ym) : '—'}</i></div>
        <div class="anf-k"><small>Best / worst month</small><b style="font-size:16px"><span style="color:#028867">${head(best.ym)} ${pesoK(best.net)}</span> · <span style="color:${worst.net < 0 ? '#d91934' : '#B47F00'}">${head(worst.ym)} ${pesoK(worst.net)}</span></b><i>by net income</i></div>
      </div>
      <div class="anf-row">
        <div class="cs"><div class="cs-t">Revenue, expenses and net income · per month</div><div class="chart-wrap" style="height:330px"><canvas id="anf-c1"></canvas></div></div>
        <div class="cs"><div class="cs-t">Where the revenue comes from</div><div class="chart-wrap" style="height:330px"><canvas id="anf-c2"></canvas></div></div>
      </div>
      <div class="cs"><div class="cs-t" style="display:flex;justify-content:space-between;align-items:center">Monthly summary <span style="font-size:11px;font-weight:600;color:#6b7394">same figures as Reports → Financial summary</span></div>
        <div style="overflow-x:auto"><table><thead><tr><th>Month</th><th>Vendo sales</th><th>Subscribers</th><th>Other</th><th>Revenue</th><th>Daily exp.</th><th>Admin & capital</th><th>Expenses</th><th>Net income</th><th>Kept</th></tr></thead><tbody>
        ${F.map(x => `<tr><td>${head(x.ym)}</td><td>${peso(x.vendo)}</td><td>${peso(x.subInc)}</td><td>${x.other ? peso(x.other) : ''}</td><td><b>${peso(x.revenue)}</b></td><td>${peso(x.daily)}</td><td>${peso(x.admin)}</td><td><b>${peso(x.expense)}</b></td><td class="${x.net < 0 ? 'neg' : ''}"><b>${peso(x.net)}</b></td><td class="${x.net < 0 ? 'neg' : ''}">${x.revenue ? Math.round(x.net / x.revenue * 100) + '%' : ''}</td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td>${peso(sum('vendo'))}</td><td>${peso(sum('subInc'))}</td><td>${peso(sum('other'))}</td><td>${peso(R)}</td><td>${peso(sum('daily'))}</td><td>${peso(sum('admin'))}</td><td>${peso(E)}</td><td class="${N < 0 ? 'neg' : ''}">${peso(N)}</td><td>${margin}%</td></tr>
        </tbody></table></div></div>
      ${expHtml(F, C)}`;
    charts.forEach(c => { try { c.destroy(); } catch(e){} }); charts = [];
    if (typeof Chart !== 'function') return;
    const labels = F.map(x => head(x.ym));
    const tk = { callback: v => pesoK(v) };
    charts.push(new Chart(document.getElementById('anf-c1'), {
      data: { labels, datasets: [
        { type:'bar', label:'Revenue', data:F.map(x=>x.revenue), backgroundColor:'rgba(2,90,198,.78)', borderRadius:5, order:2 },
        { type:'bar', label:'Expenses', data:F.map(x=>x.expense), backgroundColor:'rgba(217,25,52,.72)', borderRadius:5, order:2 },
        { type:'line', label:'Net income', data:F.map(x=>x.net), borderColor:'#028867', backgroundColor:'#028867', borderWidth:3, pointRadius:4, tension:.25, order:1 } ] },
      options: { responsive:true, maintainAspectRatio:false, interaction:{mode:'index', intersect:false},
        plugins:{ legend:{position:'bottom'}, tooltip:{callbacks:{label: c => c.dataset.label + ': ' + peso(c.parsed.y)}} },
        scales:{ y:{ ticks:tk, grid:{color:'#eef1f6'} }, x:{ grid:{display:false} } } }
    }));
    charts.push(new Chart(document.getElementById('anf-c2'), {
      type:'bar',
      data: { labels, datasets: [
        { label:'Vendo sales (Piso WiFi)', data:F.map(x=>x.vendo), backgroundColor:'#028867', borderRadius:3 },
        { label:'Subscribers', data:F.map(x=>x.subInc), backgroundColor:'#025AC6', borderRadius:3 },
        { label:'Other income', data:F.map(x=>x.other), backgroundColor:'#FFB725', borderRadius:3 } ] },
      options: { responsive:true, maintainAspectRatio:false, interaction:{mode:'index', intersect:false},
        plugins:{ legend:{position:'bottom'}, tooltip:{callbacks:{label: c => c.dataset.label + ': ' + peso(c.parsed.y)}} },
        scales:{ x:{ stacked:true, grid:{display:false} }, y:{ stacked:true, ticks:tk, grid:{color:'#eef1f6'} } } }
    }));
    charts.push(new Chart(document.getElementById('anf-c3'), {
      type:'bar',
      data: { labels, datasets: [
        { label:'Daily expense', data:F.map(x=>x.daily + x.expPaid), backgroundColor:'#025AC6', borderRadius:3 },
        { label:'Admin & capital', data:F.map(x=>x.admin), backgroundColor:'#C01176', borderRadius:3 } ] },
      options: { responsive:true, maintainAspectRatio:false, interaction:{mode:'index', intersect:false},
        plugins:{ legend:{position:'bottom'}, tooltip:{callbacks:{label: c => c.dataset.label + ': ' + peso(c.parsed.y), footer: it => 'Total: ' + peso(it.reduce((s,c)=>s+c.parsed.y,0))}} },
        scales:{ x:{ stacked:true, grid:{display:false} }, y:{ stacked:true, ticks:tk, grid:{color:'#eef1f6'} } } }
    }));
    const TOP = 12, topC = C.slice(0, TOP), rest = C.slice(TOP).reduce((s,c)=>s+c.tot, 0);
    const lab4 = topC.map(c => c.k.length > 28 ? c.k.slice(0, 27) + '…' : c.k).concat(rest ? ['All other'] : []);
    const val4 = topC.map(c => Math.round(c.tot)).concat(rest ? [Math.round(rest)] : []);
    const col4 = topC.map(c => c.kind === 'admin' ? '#C01176' : '#025AC6').concat(rest ? ['#94a3b8'] : []);
    charts.push(new Chart(document.getElementById('anf-c4'), {
      type:'bar',
      data: { labels: lab4, datasets: [{ label:'Spent', data: val4, backgroundColor: col4, borderRadius:4 }] },
      options: { indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label: c => peso(c.parsed.x) + ' · ' + Math.round(c.parsed.x / val4.reduce((a,b)=>a+b,0) * 100) + '%'}} },
        scales:{ x:{ ticks:tk, grid:{color:'#eef1f6'} }, y:{ grid:{display:false}, ticks:{font:{size:11}} } } }
    }));
  }
  window.anfLoad = load;

  // add the view to the Analytics switcher and make it the default
  function hook(){
    if (typeof window.anlSetView !== 'function') return setTimeout(hook, 200);
    if (window.anlSetView._fin) return;
    const orig = window.anlSetView;
    const btn = document.getElementById('anv-fin-btn'), fin = document.getElementById('anv-fin');
    const paint = on => { if (btn) { btn.style.background = on ? '#1f2a4d' : '#fff'; btn.style.color = on ? '#fff' : '#1f2a4d'; } if (fin) fin.style.display = on ? 'block' : 'none'; };
    const wrapped = function(v){
      if (v === 'fin') {
        try { _anlView = 'fin'; } catch(e){}
        ['anv-harvest','anv-tg'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
        [['anv-harvest-btn','#025AC6'],['anv-tg-btn','#025AC6']].forEach(([id,c]) => { const b = document.getElementById(id); if (b) { b.style.background = '#fff'; b.style.color = c; } });
        paint(true); load(); return;
      }
      paint(false); return orig(v);
    };
    wrapped._fin = true;
    window.anlSetView = wrapped;
    try { if (!_anlView || _anlView === 'harvest') _anlView = 'fin'; } catch(e){}
    // if Analytics is already open, show it
    const p = document.getElementById('panel-analytics'); if (p && p.classList.contains('active')) wrapped('fin');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();
