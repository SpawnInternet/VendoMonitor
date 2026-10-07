/* ============================================================
   dash.14.cash.js — Recon ▸ 💵 Cash hand-in
   ------------------------------------------------------------
   Adds a third mode to the Reconciliation tab. Self-contained:
   it injects its own button + panel and wraps rcSetMode() so the
   existing Recent / History modes keep working unchanged.

   Data comes from SPAWN Finance's PIN-checked functions
   (fin_collector_status, fin_cash_book) called directly with the
   publishable key — NOT through spawn-gw-admin — so no gateway
   change is needed. The PIN is held in memory for this page only.
   ============================================================ */
(function () {
  'use strict';
  const SB  = 'https://cviraqfhphhsonjmrtvu.supabase.co';
  const KEY = 'sb_publishable_6J1xIrlkpHf6jir4DtUh4g_xX7Fm9ln';
  const FIN_URL = 'https://spawninternet.github.io/spawn-finance/';
  const IDLE_MS = 30 * 60 * 1000;

  let pin = null, who = null, idleT = null, active = false, busy = false;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const dLbl = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—';
  const tLbl = ts => ts ? new Date(ts).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) : '';
  const ERR = { bad_pin: 'Wrong PIN.', too_many_attempts: 'Too many wrong PINs. Wait 10 minutes.' };

  async function rpc(fn, args) {
    let r;
    try {
      r = await fetch(SB + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
    } catch (e) { throw new Error('No connection. Try again.'); }
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error((j && (j.message || j.hint)) || ('Error ' + r.status));
    if (j && j.ok === false) { const e = new Error(ERR[j.error] || j.error); e.code = j.error; throw e; }
    return j;
  }

  /* ---------- styles ---------- */
  const css = `
  #rc-panel-cash{padding:12px}
  .fcx-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
  .fcx-bar h3{font-size:15px;font-weight:800;color:#1a1d2e;margin:0}
  .fcx-bar .sub{font-size:12px;color:#6b7280}
  .fcx-btn{padding:5px 11px;border:1px solid #dbe3f1;border-radius:7px;background:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;color:#1a1d2e;text-decoration:none}
  .fcx-btn.pri{background:#025AC6;border-color:#025AC6;color:#fff}
  .fcx-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:12px}
  .fcx-kpi{background:#fff;border:1px solid #e5e9f2;border-radius:10px;padding:10px 12px;border-bottom:3px solid #025AC6}
  .fcx-kpi .k{font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.03em}
  .fcx-kpi .v{font-size:21px;font-weight:800;color:#1a1d2e;margin-top:2px;font-variant-numeric:tabular-nums}
  .fcx-kpi .s{font-size:11px;color:#6b7280;margin-top:1px}
  .fcx-card{background:#fff;border:1px solid #e5e9f2;border-radius:10px;padding:10px 12px;margin-bottom:12px}
  .fcx-card h4{font-size:13px;font-weight:800;color:#025AC6;margin:0 0 8px}
  .fcx-scroll{overflow-x:auto}
  .fcx-t{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
  .fcx-t th{text-align:left;font-size:10.5px;color:#6b7280;text-transform:uppercase;font-weight:700;padding:6px 8px;border-bottom:2px solid #eef2f8;white-space:nowrap}
  .fcx-t td{padding:7px 8px;border-bottom:1px solid #f1f4f9;vertical-align:top}
  .fcx-t .n{text-align:right;white-space:nowrap}
  .fcx-t tr.late td{background:#fff6f6}
  .fcx-t tr.due td{background:#fffaf0}
  .fcx-red{color:#c62828;font-weight:700}.fcx-green{color:#1b7a52;font-weight:700}.fcx-mu{color:#6b7280}
  .fcx-pill{display:inline-block;font-size:10.5px;font-weight:700;border-radius:999px;padding:1px 7px;background:#eef2f8;color:#4a5468;margin:1px 2px 1px 0;white-space:nowrap}
  .fcx-pill.late{background:#fde8e8;color:#b42318}
  .fcx-lock{max-width:340px;margin:30px auto;background:#fff;border:1px solid #e5e9f2;border-radius:12px;padding:18px;text-align:center}
  .fcx-lock input{width:140px;text-align:center;font-size:22px;letter-spacing:8px;padding:8px;border:1px solid #dbe3f1;border-radius:8px;margin:10px 0}
  .fcx-msg{font-size:12px;font-weight:700;color:#c62828;min-height:16px}
  .fcx-empty{padding:14px;text-align:center;color:#6b7280;font-size:12.5px}
  `;

  /* ---------- mount into the Recon tab ---------- */
  function mount() {
    const bh = document.getElementById('rc-mode-history');
    const hp = document.getElementById('rc-panel-history');
    if (!bh || !hp || document.getElementById('rc-mode-cash')) return false;

    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    const btn = document.createElement('button');
    btn.id = 'rc-mode-cash';
    btn.type = 'button';
    btn.textContent = '💵 Cash hand-in';
    btn.style.cssText = bh.style.cssText;
    btn.style.borderBottomColor = 'transparent';
    btn.style.color = '#6b7280';
    btn.addEventListener('click', openCash);
    bh.parentNode.insertBefore(btn, bh.nextSibling);

    const panel = document.createElement('div');
    panel.id = 'rc-panel-cash';
    panel.style.display = 'none';
    hp.parentNode.insertBefore(panel, hp.nextSibling);

    // Keep Recent / History working: hide our panel whenever they are chosen.
    const orig = window.rcSetMode;
    if (typeof orig === 'function') {
      window.rcSetMode = function (mode) {
        active = false;
        panel.style.display = 'none';
        btn.style.borderBottomColor = 'transparent'; btn.style.color = '#6b7280';
        return orig.apply(this, arguments);
      };
    }
    return true;
  }

  function openCash() {
    active = true;
    ['rc-panel-recent', 'rc-panel-history'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    ['rc-mode-recent', 'rc-mode-history'].forEach(id => { const b = document.getElementById(id); if (b) { b.style.borderBottomColor = 'transparent'; b.style.color = '#6b7280'; } });
    const btn = document.getElementById('rc-mode-cash'); btn.style.borderBottomColor = '#1565c0'; btn.style.color = '#1565c0';
    document.getElementById('rc-panel-cash').style.display = '';
    if (pin) load(); else drawLock('');
  }

  function bumpIdle() { clearTimeout(idleT); idleT = setTimeout(() => { pin = null; who = null; if (active) drawLock('Locked after 30 minutes. Enter the PIN again.'); }, IDLE_MS); }

  function drawLock(msg) {
    const p = document.getElementById('rc-panel-cash');
    p.innerHTML = `<div class="fcx-lock">
      <div style="font-size:15px;font-weight:800;color:#1a1d2e">💵 Cash hand-in check</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">Enter your SPAWN Finance PIN to see collectors' hand-ins, drawer counts and deposits.</div>
      <input id="fcx-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••">
      <div><button class="fcx-btn pri" id="fcx-go" type="button">Unlock</button></div>
      <div class="fcx-msg" id="fcx-msg">${esc(msg)}</div></div>`;
    const inp = document.getElementById('fcx-pin');
    const go = async () => {
      const v = inp.value.trim(); if (!/^\d{4}$/.test(v)) { document.getElementById('fcx-msg').textContent = 'Enter the 4-digit PIN.'; return; }
      document.getElementById('fcx-msg').textContent = 'Checking…';
      try { const r = await rpc('fin_login', { p_pin: v }); pin = v; who = r.name; bumpIdle(); load(); }
      catch (e) { document.getElementById('fcx-msg').textContent = e.message; inp.value = ''; inp.focus(); }
    };
    document.getElementById('fcx-go').onclick = go;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    inp.addEventListener('input', () => { if (inp.value.length === 4) go(); });
    setTimeout(() => inp.focus(), 50);
  }

  async function load() {
    if (busy) return; busy = true;
    const p = document.getElementById('rc-panel-cash');
    if (!p.querySelector('.fcx-bar')) p.innerHTML = '<div class="fcx-empty">Loading…</div>';
    try {
      const t = today();
      const [coll, book] = await Promise.all([
        rpc('fin_collector_status', { p_pin: pin }),
        rpc('fin_cash_book', { p_pin: pin, p_from: addDays(t, -13), p_to: t })
      ]);
      bumpIdle(); draw(coll, book);
    } catch (e) {
      if (e.code === 'bad_pin') { pin = null; drawLock('PIN no longer valid. Enter it again.'); }
      else p.innerHTML = `<div class="fcx-empty fcx-red">${esc(e.message)} <button class="fcx-btn" id="fcx-retry" type="button">Retry</button></div>`;
      const rb = document.getElementById('fcx-retry'); if (rb) rb.onclick = load;
    } finally { busy = false; }
  }

  function draw(C, B) {
    const p = document.getElementById('rc-panel-cash');
    const t = today();
    const cols = C.collectors || [];
    const owing = cols.filter(c => Number(c.unremitted) > 0);
    const toHand = owing.reduce((s, c) => s + Number(c.unremitted), 0);
    const handed = cols.reduce((s, c) => s + Number(c.handed), 0);
    const so = cols.reduce((s, c) => s + Number(c.short_over || 0), 0);
    const counts = (B.counts || []).filter(c => !c.voided_at);
    const lastCount = counts[counts.length - 1];
    const deps = (B.deposits || []).filter(d => !d.voided_at);
    const depTot = deps.reduce((s, d) => s + Number(d.amount), 0);
    const late = c => (c.open_days || []).some(d => d.date < t);

    const kpis = `<div class="fcx-kpis">
      <div class="fcx-kpi" style="border-bottom-color:${toHand > 0 ? '#e65100' : '#1b7a52'}"><div class="k">Still to hand in</div><div class="v">${peso(toHand)}</div><div class="s">${owing.length} collector${owing.length === 1 ? '' : 's'}${owing.some(late) ? ' · <span class="fcx-red">some from earlier days</span>' : ''}</div></div>
      <div class="fcx-kpi"><div class="k">Handed in since ${esc(dLbl(C.start))}</div><div class="v">${peso(handed)}</div><div class="s">Spawn share (75%) covered</div></div>
      <div class="fcx-kpi" style="border-bottom-color:${so < 0 ? '#c62828' : '#1b7a52'}"><div class="k">Net short / over</div><div class="v ${so < 0 ? 'fcx-red' : so > 0 ? 'fcx-green' : ''}">${so < 0 ? '−' + peso(-so) : so > 0 ? '+' + peso(so) : '₱0'}</div><div class="s">collector hand-ins since ${esc(dLbl(C.start))}</div></div>
      <div class="fcx-kpi" style="border-bottom-color:#F5A623"><div class="k">Office cash (book)</div><div class="v">${peso(B.balance_now)}</div><div class="s">${lastCount ? `last count ${esc(tLbl(lastCount.counted_at))}: ${Number(lastCount.difference) === 0 ? '<span class="fcx-green">balanced</span>' : `<span class="fcx-red">${Number(lastCount.difference) < 0 ? 'short' : 'over'} ${peso(Math.abs(lastCount.difference))}</span>`}` : 'no count yet'}</div></div>
    </div>`;

    const collRows = cols.length ? cols.map(c => {
      const u = Number(c.unremitted), s = Number(c.short_over || 0);
      const cls = u > 0 ? (late(c) ? 'late' : 'due') : '';
      const days = (c.open_days || []).map(d => `<span class="fcx-pill ${d.date < t ? 'late' : ''}">${esc(dLbl(d.date))} · ${d.vendos}v · ${peso(d.pending)}${Number(d.pending) < Number(d.spawn) ? ' (part)' : ''}</span>`).join('');
      return `<tr class="${cls}"><td><b>${esc(c.collector)}</b></td>
        <td class="n">${peso(c.harvested)}</td><td class="n">${peso(c.handed)}</td>
        <td class="n">${u > 0 ? `<b>${peso(u)}</b>` : u < 0 ? `<span class="fcx-mu">ahead ${peso(-u)}</span>` : '<span class="fcx-green">✓</span>'}</td>
        <td class="n">${s < 0 ? `<span class="fcx-red">−${peso(-s)}</span>` : s > 0 ? `<span class="fcx-green">+${peso(s)}</span>` : '<span class="fcx-mu">—</span>'}</td>
        <td>${days || '<span class="fcx-mu">—</span>'}</td><td class="fcx-mu">${c.last_handin ? esc(dLbl(c.last_handin)) : 'none yet'}</td></tr>`;
    }).join('') : `<tr><td colspan="7" class="fcx-empty">No harvests or hand-ins since ${esc(dLbl(C.start))}.</td></tr>`;

    const cntRows = counts.length ? counts.slice().reverse().map(c => {
      const d = Number(c.difference);
      const kind = c.kind === 'handover' ? `Handover ${esc(c.handed_from)} → ${esc(c.handed_to)}` : c.kind === 'closing' ? 'Closing count' : 'Count';
      return `<tr><td class="fcx-mu">${esc(tLbl(c.counted_at))}</td><td>${kind}</td><td>${esc(c.counted_by)}</td><td class="n">${peso(c.counted_total)}</td><td class="n">${peso(c.book_balance)}</td>
        <td class="n">${d === 0 ? '<span class="fcx-green">✓</span>' : `<span class="fcx-red">${d < 0 ? '−' : '+'}${peso(Math.abs(d))}</span>`}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="fcx-empty">No counts or handovers in the last 14 days.</td></tr>';

    const depRows = deps.length ? deps.slice().reverse().map(d => `<tr><td>${esc(dLbl(d.deposit_date))}</td><td>${esc(d.bank)}</td><td class="n">${peso(d.amount)}</td>
        <td class="fcx-mu">${esc(d.reference_no || '—')}</td><td class="fcx-mu">${d.covers_from ? esc(dLbl(d.covers_from)) + (d.covers_to && d.covers_to !== d.covers_from ? ' – ' + esc(dLbl(d.covers_to)) : '') : '—'}</td><td>${esc(d.deposited_by)}</td></tr>`).join('')
      : '<tr><td colspan="6" class="fcx-empty">No deposits in the last 14 days.</td></tr>';

    const days = (B.days || []).filter(d => d.locked_at).slice().reverse();
    const dayRows = days.length ? days.map(d => `<tr><td>${esc(dLbl(d.entry_date))}</td><td>${esc(d.locked_by)}</td><td class="n">${peso(d.closing_balance)}</td><td class="fcx-mu">${d.posted_at ? 'posted to books' : 'not posted yet'}</td></tr>`).join('')
      : '<tr><td colspan="4" class="fcx-empty">No closed days in the last 14 days.</td></tr>';

    p.innerHTML = `<div class="fcx-bar"><h3>💵 Cash hand-in check</h3><span class="sub">Spawn Harvest (75% share) vs SPAWN Finance · since ${esc(dLbl(C.start))} · unlocked as ${esc(who)}</span>
        <span style="flex:1"></span><button class="fcx-btn" id="fcx-refresh" type="button">🔄 Refresh</button>
        <a class="fcx-btn" href="${FIN_URL}" target="_blank" rel="noopener">Open SPAWN Finance ↗</a><button class="fcx-btn" id="fcx-lockbtn" type="button">🔒 Lock</button></div>
      ${kpis}
      <div class="fcx-card"><h4>Collectors — Spawn share harvested vs handed in</h4><div class="fcx-scroll"><table class="fcx-t"><thead><tr>
        <th>Collector</th><th class="n">Harvested (75%)</th><th class="n">Handed in</th><th class="n">Still to hand in</th><th class="n">Short / over</th><th>Days still out</th><th>Last hand-in</th></tr></thead>
        <tbody>${collRows}</tbody></table></div>
        <div style="font-size:11px;color:#6b7280;margin-top:6px">Hand-ins pay off the oldest harvest day first. <span class="fcx-pill late">red</span> = a day before today is still not handed in.</div></div>
      <div class="fcx-card"><h4>Drawer — counts and handovers (last 14 days)</h4><div class="fcx-scroll"><table class="fcx-t"><thead><tr><th>When</th><th>Type</th><th>By</th><th class="n">Counted</th><th class="n">Book said</th><th class="n">Difference</th></tr></thead><tbody>${cntRows}</tbody></table></div></div>
      <div class="fcx-card"><h4>Bank deposits (last 14 days) · ${peso(depTot)}</h4><div class="fcx-scroll"><table class="fcx-t"><thead><tr><th>Date</th><th>Bank</th><th class="n">Amount</th><th>Reference</th><th>Covers</th><th>By</th></tr></thead><tbody>${depRows}</tbody></table></div></div>
      <div class="fcx-card"><h4>Closed days</h4><div class="fcx-scroll"><table class="fcx-t"><thead><tr><th>Day</th><th>Closed by</th><th class="n">Closing balance</th><th>Books</th></tr></thead><tbody>${dayRows}</tbody></table></div></div>`;
    document.getElementById('fcx-refresh').onclick = load;
    document.getElementById('fcx-lockbtn').onclick = () => { pin = null; who = null; clearTimeout(idleT); drawLock(''); };
  }

  function init() { if (!mount()) setTimeout(() => { mount(); }, 1500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
