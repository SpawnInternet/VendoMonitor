/* ✔ Payments check — ONE question per paid month: was this reference actually received? (2026-11-14; Wendell: "simple, accurate,
   easily spot the problem without overloading the screen"). Reads the view v_pay_check_v1 through the admin gateway — the SAME answer the
   subscriber sheet's Comment column shows, five words only: Received · NOT received · To check · No exported file · No OR / ref (cash ORs
   are not a GCash question). One line per month with the counts; below it only the rows that need a hand (NOT received, To check), the
   reason on each row, one tap opens the subscriber. "Show all" lists every paid month of the chosen month. Read-only. */
(function(){
  const SB = () => window.__SPAWN_SB || 'https://cviraqfhphhsonjmrtvu.supabase.co';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
  const short = d => d ? new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('en-PH', { month:'short', day:'numeric' }) : '—';
  const monL = ym => new Date(String(ym).slice(0,10)+'T12:00:00').toLocaleDateString('en-PH', { month:'long', year:'numeric' });
  const WORD = { ok:['Received','#e7f6ec','#15803d'], no:['NOT received','#fee2e2','#b91c1c'], check:['To check','#fff4d6','#92400e'], wait:['—','#f1f5f9','#475569'], cash:['Cash OR','#f8fafc','#6b7280'] };
  const S = { rows:null, err:'', month:'', all:false, q:'', names:null, months:[] };
  const body = () => document.getElementById('st-body');

  async function get(path){   // through the gateway (apikey 'gw' is rewritten by dash.0.core.js); pages past 1,000 rows
    const out = [];
    for (let off = 0; off < 20000; off += 1000) {
      const r = await fetch(`${SB()}/rest/v1/${path}&limit=1000&offset=${off}`, { headers:{ apikey:'gw' } });
      if (!r.ok) { const t = await r.text(); throw new Error(/not allowed/i.test(t) ? 'The gateway does not allow this view yet.' : 'Error ' + r.status); }
      const j = await r.json(); if (!Array.isArray(j)) throw new Error('Unexpected answer');
      out.push(...j); if (j.length < 1000) break;
    }
    return out;
  }
  async function names(){
    if (S.names) return S.names;
    try { const r = await get('v_sub_book?select=id,name,area,acct_no'); S.names = {}; r.forEach(x => { S.names[x.id] = x; }); }
    catch (e) { S.names = {}; }
    return S.names;
  }
  async function load(){
    S.err = ''; S.rows = null; draw();
    const from = new Date(); from.setMonth(from.getMonth() - 5, 1);   // this month and the five before it
    const ym0 = from.toLocaleDateString('en-CA').slice(0, 7) + '-01';
    try {
      const [rows] = await Promise.all([get(`v_pay_check_v1?ym=gte.${ym0}&amount=gt.0&select=subscriber_id,ym,paid_date,amount,or_no,received_by,source,given,gcash_ref,gcash_amount,gcash_at,comment,state,label&order=ym.desc,paid_date.desc`), names()]);
      S.rows = rows;
      S.months = [...new Set(rows.map(r => String(r.ym).slice(0, 10)))].sort().reverse();
      if (!S.month || !S.months.includes(S.month)) S.month = S.months[0] || '';
    } catch (e) { S.err = e.message || 'error'; }
    draw();
  }
  function counts(list){
    const c = { ok:0, no:0, check:0, wait:0, cash:0, n:0, amt:0, noAmt:0 };
    list.forEach(r => { if (!r.state) return; c[r.state] = (c[r.state] || 0) + 1; c.n++; c.amt += Number(r.amount || 0); if (r.state === 'no') c.noAmt += Number(r.amount || 0); });
    return c;
  }
  function draw(){
    const b = body(); if (!b) return;
    if (S.rows === null && !S.err) { b.innerHTML = '<div class="sc-empty">Loading…</div>'; return; }
    if (S.err) { b.innerHTML = `<div class="sc-empty">✔ The payments check is not connected to Vendo Monitor yet (${esc(S.err)}).</div>`; return; }
    const nm = S.names || {};
    const all = S.rows.filter(r => String(r.ym).slice(0, 10) === S.month);
    const c = counts(all), q = S.q.trim().toLowerCase();
    const need = all.filter(r => r.state === 'no' || r.state === 'check');
    const list = (S.all ? all : need).filter(r => !q || [nm[r.subscriber_id] && nm[r.subscriber_id].name, r.or_no, r.gcash_ref, r.received_by].some(v => String(v || '').toLowerCase().includes(q)))
      .sort((a, b2) => ({ no:0, check:1, wait:2, ok:3, cash:4 }[a.state] - { no:0, check:1, wait:2, ok:3, cash:4 }[b2.state]) || String(b2.paid_date).localeCompare(String(a.paid_date)));
    const tile = (k, l, v, col, sub) => `<div style="background:#fff;border:1px solid #e5e7eb;border-bottom:3px solid ${col};border-radius:12px;padding:9px 12px;min-width:110px;flex:1"><b style="display:block;font-size:20px;font-weight:800;color:${col};font-variant-numeric:tabular-nums">${v}</b><span style="font-size:11px;color:#6b7280;line-height:1.3;display:block">${l}${sub ? '<br>' + sub : ''}</span></div>`;
    const monthRows = S.months.map(m => { const cc = counts(S.rows.filter(r => String(r.ym).slice(0, 10) === m)); return `<tr class="${m === S.month ? 'on' : ''}" data-m="${m}" style="cursor:pointer${m === S.month ? ';background:#eef4ff' : ''}"><td><b>${esc(monL(m))}</b></td><td class="n">${cc.n}</td><td class="n" style="color:#15803d;font-weight:700">${cc.ok}</td><td class="n" style="color:${cc.no ? '#b91c1c' : '#9ca3af'};font-weight:700">${cc.no}</td><td class="n" style="color:${cc.check ? '#92400e' : '#9ca3af'}">${cc.check}</td><td class="n" style="color:#6b7280">${cc.wait}</td><td class="n" style="color:#6b7280">${cc.cash}</td><td class="n" style="color:#6b7280">${peso(cc.amt)}</td></tr>`; }).join('');
    const trs = list.map(r => {
      const s = nm[r.subscriber_id] || {}; const [w, bg, fg] = WORD[r.state] || WORD.wait;
      const word = r.label || w;
      const reason = r.comment && r.comment !== word ? `<span style="color:#6b7280;font-size:11.5px">${esc(r.comment)}</span>` : '';
      return `<tr><td><a href="#" onclick="window.subDetail&&window.subDetail(${r.subscriber_id});return false" style="color:#025ac6;font-weight:700">${esc(s.name || ('#' + r.subscriber_id))}</a>${s.area ? ` <span style="color:#9ca3af;font-size:11px">${esc(s.area)}</span>` : ''}</td>
        <td style="white-space:nowrap">${short(r.paid_date)}</td><td class="n" style="white-space:nowrap"><b>${peso(r.amount)}</b></td>
        <td style="font-variant-numeric:tabular-nums">${esc(r.or_no || '—')}</td><td style="font-size:12px">${esc(r.received_by || '—')}</td>
        <td><span class="sd-tag" style="background:${bg};color:${fg};font-weight:700">${esc(word)}</span></td><td>${reason}${r.gcash_amount != null && r.state !== 'ok' ? `<br><span style="color:#6b7280;font-size:11px">GCash: ${peso(r.gcash_amount)} on ${short(r.gcash_at)}</span>` : ''}</td></tr>`;
    }).join('');
    b.innerHTML = `<div class="cx-card"><div class="cx-head"><b>✔ Payments check · ${esc(monL(S.month))}</b><span style="font-size:11px;color:#6b7280">one answer per paid month: was the reference actually received? · same words as the sheet's Comment column</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;padding:10px 14px">
          ${tile('ok', 'Received', c.ok, '#15803d')}${tile('no', 'NOT received', c.no, '#b91c1c', c.noAmt ? peso(c.noAmt) : '')}${tile('check', 'To check', c.check, '#b45309')}${tile('wait', 'Cannot check', c.wait, '#64748b', 'no ref / no export')}${tile('cash', 'Cash OR', c.cash, '#94a3b8')}
        </div></div>
      <div class="cx-card"><div class="sc-scroll"><table class="sc-tbl"><thead><tr><th>Month</th><th class="n">Paid</th><th class="n">Received</th><th class="n">NOT received</th><th class="n">To check</th><th class="n">Cannot check</th><th class="n">Cash OR</th><th class="n">Collected</th></tr></thead><tbody>${monthRows}</tbody></table></div></div>
      <div class="cx-card"><div class="cx-head"><b>${S.all ? 'All paid months' : 'Needs a hand'} · ${list.length}</b>
          <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input id="pck-q" type="search" placeholder="Search name, ref, received by" value="${esc(S.q)}" style="font-size:12px;padding:5px 9px;border-radius:8px;border:1px solid #e5e7eb;min-width:220px">
            <button type="button" id="pck-all" style="padding:5px 10px;border-radius:999px;border:1px solid ${S.all ? '#025ac6' : '#e5e7eb'};background:${S.all ? '#e0ecff' : '#fff'};color:${S.all ? '#0146a0' : '#374151'};font-size:12px;font-weight:600;cursor:pointer">${S.all ? 'Only the problems' : 'Show all'}</button>
            <button type="button" id="pck-re" style="padding:5px 10px;border-radius:999px;border:1px solid #e5e7eb;background:#fff;font-size:12px;cursor:pointer">↻</button></span></div>
        ${list.length ? `<div class="sc-scroll"><table class="sc-tbl"><thead><tr><th>Subscriber</th><th>Paid</th><th class="n">Amount</th><th>OR / Ref</th><th>Received by</th><th>Answer</th><th>Why</th></tr></thead><tbody>${trs}</tbody></table></div>`
                      : `<div class="sc-empty">${S.all ? 'Nothing this month.' : '✅ Nothing needs a hand this month.'}</div>`}</div>`;
    b.querySelectorAll('tr[data-m]').forEach(tr => tr.onclick = () => { S.month = tr.dataset.m; draw(); });
    b.querySelector('#pck-all').onclick = () => { S.all = !S.all; draw(); };
    b.querySelector('#pck-re').onclick = () => load();
    const qi = b.querySelector('#pck-q'); qi.oninput = () => { S.q = qi.value; const pos = qi.selectionStart; draw(); const q2 = b.querySelector('#pck-q'); if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); } };
  }
  window.pckTabLoad = () => { if (S.rows && !S.err) draw(); else load(); };
})();
