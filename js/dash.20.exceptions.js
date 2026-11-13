/* ⚠ Exceptions — the office answers the digital employee's questions INSIDE Vendo Monitor (2026-11-13; Wendell: "it should be vendo monitor").
   Same two PIN-checked functions as Spawn Text (pay_exceptions_v1 = the five lists, pay_exception_v1 = one tap), called through the admin
   gateway (RPC allow-list). The office PIN is typed once per session (kept in sessionStorage for 3 h, never in localStorage, never logged).
   Lists: 📷 unnamed receipts · ⚡ name conflicts · 💸 unclaimed GCash money · 🧾 paper ORs not in the book · ⚠ checks (decided in GCash review).
   Rules from docs/pay-chain-design.md: "record is right" never learns the bubble name; unclaimed money has confirm / block / undo; a weak guess
   is only a suggestion; every tap is logged by the database with the name behind the PIN; the lists re-load after each tap. */
(function(){
  const SB = () => window.__SPAWN_SB || 'https://cviraqfhphhsonjmrtvu.supabase.co';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
  const dt = ts => ts ? new Date(ts).toLocaleString('en-PH', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:'Asia/Manila' }) : '';
  const mon = ym => ym ? new Date(String(ym).slice(0,10)+'T12:00:00').toLocaleDateString('en-PH', { month:'short', year:'2-digit' }) : '';
  const say = m => { if (window.toast) toast(m); };
  const ERR = { bad_pin:'Wrong PIN.', too_many_attempts:'Too many tries — wait 10 minutes.', screen_off:'The exceptions screen is switched off.', subscriber_needed:'Pick the subscriber first.',
                not_a_conflict:'Already settled — refreshing.', no_sender_number:'No sender number on this payment — it cannot be learned.', no_such_subscriber:'That subscriber is gone — search again.',
                no_such_read:'This receipt is gone — refreshing.', bad_list:'Not a choice here.', bad_request:'Not a choice here.' };
  const SESS = 'vm_office_pin';
  const S = { pin:'', data:null, list:'unnamed', open:null, q:'', res:[], none:false, busy:false, err:'' };
  function pinGet(){ try { const j = JSON.parse(sessionStorage.getItem(SESS) || 'null'); if (j && j.p && Date.now() - j.t < 3 * 3600e3) return j.p; } catch (e) {} return ''; }
  function pinSet(p){ try { sessionStorage.setItem(SESS, JSON.stringify({ p, t: Date.now() })); } catch (e) {} }
  function pinClear(){ S.pin = ''; try { sessionStorage.removeItem(SESS); } catch (e) {} }
  async function rpc(fn, args){
    let r; try { r = await fetch(`${SB()}/rest/v1/rpc/${fn}`, { method:'POST', headers:{ apikey:'gw', 'Content-Type':'application/json' }, body:JSON.stringify(args) }); }
    catch (e) { throw new Error('No signal — try again.'); }
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) { const m = (j && (j.message || j.error || j.hint)) || ('Error ' + r.status); throw new Error(/not allowed/.test(m) ? 'The gateway does not allow this yet (needs the RPC line).' : (ERR[m] || m)); }
    if (j && j.ok === false) { const e = new Error(ERR[j.error] || j.error || 'Not done'); e.pin = (j.error === 'bad_pin' || j.error === 'too_many_attempts'); throw e; }
    return j;
  }
  const body = () => document.getElementById('st-body');
  function card(h){ const b = body(); if (b) b.innerHTML = h; }
  // ── PIN pad (office PIN, same one Spawn Text asks for) ──
  function pinScreen(msg){
    card(`<div class="cx-card" style="max-width:360px;margin:20px auto;text-align:center"><div class="cx-head">⚠ Exceptions · office PIN</div>
      <p style="font-size:13px;color:#4b5563;margin:6px 0 12px">The same PIN as Spawn Text. Every answer is saved with the name behind it.</p>
      <input id="ex-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" style="font-size:24px;letter-spacing:10px;text-align:center;width:150px;padding:8px;border:1.5px solid #e5e7eb;border-radius:10px">
      <div id="ex-pin-err" style="color:#b91c1c;font-size:12px;min-height:16px;margin-top:6px">${esc(msg || '')}</div>
      <button type="button" id="ex-pin-go" style="margin-top:8px;padding:8px 18px;border-radius:10px;border:0;background:#025ac6;color:#fff;font-weight:800;cursor:pointer">Open</button></div>`);
    const i = document.getElementById('ex-pin'); const go = document.getElementById('ex-pin-go');
    const submit = () => { const p = (i.value || '').trim(); if (!/^\d{4}$/.test(p)) { document.getElementById('ex-pin-err').textContent = 'Type the 4-digit PIN.'; return; } go.disabled = true; load(p); };
    go.onclick = submit; i.onkeydown = e => { if (e.key === 'Enter') submit(); }; i.focus();
  }
  // ── load the five lists ──
  async function load(pin){
    S.busy = true; S.err = '';
    try {
      const j = await rpc('pay_exceptions_v1', { p_pin: pin });
      if (!j.on) { S.data = null; card('<div class="sc-empty">⚠ The exceptions screen is switched off (setting pay_exceptions).</div>'); return; }
      S.pin = pin; pinSet(pin); S.data = j; render();
    } catch (e) {
      if (e.pin) { pinClear(); pinScreen(e.message); return; }
      S.err = e.message; card(`<div class="sc-empty">⚠ ${esc(e.message)}</div>`);
    } finally { S.busy = false; }
  }
  function entry(){ const p = pinGet(); if (p) load(p); else pinScreen(''); }
  // ── render ──
  const LISTS = [['unnamed','📷 Unnamed','Receipts nobody has named yet'], ['conflict','⚡ Conflicts','The staff bubble says one name, the record says another'],
                 ['unclaimed','💸 Unclaimed','GCash money in that no book row, app record, text or receipt claims'], ['cash_or','🧾 ORs','Paper official receipts photographed but not written in the book'],
                 ['check','⚠ Checks','Claims the GCash export disputes — decided in 🔍 GCash review']];
  const GUESS = { override:'✔ answered', blocked:'⛔ never guess this number', learned_strong:'💡 paid before for', phone:'📱 this is the number of', learned_weak:'💭 maybe (paid once for)',
                  shared:'👥 this number pays for several people', ambiguous_phone:'👥 several subscribers have this number', unknown_phone:'❓ number not on file', no_sender:'❓ no sender shown (bank transfer)' };
  const MATCH = { confirmed:'✅ in GCash', amount_diff:'⚠ amount differs', money_out:'🔴 money out', near_match:'≈ near match', wait:'⏳ waiting for export', not_found:'✗ not in GCash', no_ref:'✗ no ref read' };
  const btn = (label, attrs, primary, danger) => `<button type="button" ${attrs} style="padding:6px 11px;border-radius:9px;border:1px solid ${danger ? '#fecaca' : primary ? '#025ac6' : '#e5e7eb'};background:${danger ? '#fef2f2' : primary ? '#025ac6' : '#fff'};color:${danger ? '#b91c1c' : primary ? '#fff' : '#374151'};font-size:12px;font-weight:700;cursor:pointer;margin:4px 6px 0 0">${label}</button>`;
  const picker = key => S.open && S.open.key === key ? `<div style="margin-top:6px"><input id="ex-q" type="search" placeholder="Search name (2+ letters)" value="${esc(S.q)}" style="font-size:13px;padding:6px 10px;border-radius:9px;border:1px solid #e5e7eb;min-width:240px">
      <div style="margin-top:4px">${S.res.map(x => btn('✔ ' + esc(x.name) + (x.area ? ' · ' + esc(x.area) : ''), `data-expick="${x.id}" data-exname="${esc(x.name)}"`)).join('') || (S.none ? '<span style="color:#9ca3af;font-size:12px">No subscriber with that name</span>' : '')}
      ${btn('Cancel', 'data-exclose="1"')}</div></div>` : '';
  const months = (a, b) => a ? 'for ' + mon(a) + (b && b !== a ? ' – ' + mon(b) : '') : '';
  function item(inner, key, list, color){ return `<div class="cx-card" data-exkey="${esc(key)}" data-exlist="${list}" style="border-left:5px solid ${color};margin-bottom:8px">${inner}</div>`; }
  function render(){
    const X = S.data; if (!X) return;
    const C = X.counts || {}, k = S.list;
    const open = (C.unnamed||0) + (C.conflict||0) + (C.unclaimed||0) + (C.cash_or||0);
    const chips = LISTS.map(([kk, l]) => `<button type="button" data-exf="${kk}" style="padding:5px 11px;border-radius:999px;border:1px solid ${k===kk?'#025ac6':'#e5e7eb'};background:${k===kk?'#e0ecff':'#fff'};color:${k===kk?'#0146a0':'#374151'};font-size:12px;font-weight:700;cursor:pointer">${l} ${C[kk] || 0}</button>`).join(' ');
    let h = `<div class="cx-card"><div class="cx-head">⚠ Exceptions <span style="font-weight:500;text-transform:none;letter-spacing:0;color:#6b7280">· <b>${open}</b> to answer · ${C.check || 0} for review · since ${esc(String(X.from || '').slice(0,10))} · answering as <b>${esc(X.who || '')}</b></span>
        <span style="float:right"><button type="button" id="ex-refresh" style="font-size:12px;border:0;background:none;color:#025ac6;font-weight:700;cursor:pointer">↻ Refresh</button> <button type="button" id="ex-lock" style="font-size:12px;border:0;background:none;color:#6b7280;cursor:pointer">🔒 Lock</button></span></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px">${chips}</div>
      <div style="font-size:12px;color:#6b7280">${esc(LISTS.find(l => l[0] === k)[2])} · rows leave by themselves once the record catches up.</div></div>`;
    const rows = X[k] || [];
    if (!rows.length) { card(h + '<div class="sc-empty">Nothing here ✓</div>'); wire(); return; }
    if (k === 'unnamed') h += rows.map(r => item(`<div><b>${peso(r.amount)}</b> · ${esc(dt(r.at))} · ${esc(MATCH[r.match] || r.match || '')}${r.ref ? ' · ref …' + esc(String(r.ref).slice(-4)) : ''} · posted by ${esc(r.poster || '?')}${r.low_conf ? ' · ⚠ hard to read' : ''}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px">${r.bubble ? 'Bubble: “' + esc(r.bubble) + '” ' + esc(months(r.month_from, r.month_to)) : 'No name bubble next to this photo.'}</div>
        <div>${(r.candidates || []).map(c => btn('✔ ' + esc(c.name) + (c.area ? ' · ' + esc(c.area) : '') + ' ' + Math.round(c.score * 100) + '%', `data-exact="set" data-exsub="${c.id}" data-exname="${esc(c.name)}"`, true)).join('')}
        ${S.open && S.open.key === String(r.id) ? '' : btn('🔎 Another name', 'data-exsearch="1"') + btn('Nobody / skip', 'data-exact="none"')}</div>${picker(String(r.id))}`, r.id, 'unnamed', '#9ca3af')).join('');
    else if (k === 'conflict') h += rows.map(r => item(`<div><b>${peso(r.amount)}</b> · ${esc(dt(r.at))} · ${esc(MATCH[r.match] || r.match || '')}${r.ref ? ' · ref …' + esc(String(r.ref).slice(-4)) : ''} · posted by ${esc(r.poster || '?')}</div>
        <div style="margin-top:4px">On record: <b>${esc(r.current_name || '?')}</b> <span style="color:#6b7280;font-size:12px">(from ${esc(r.current_source === 'ref' ? 'the book / ref' : r.current_source || '?')})</span></div>
        <div>Bubble says: <b>${esc(r.bubble_name || r.name_text || '?')}</b> <span style="color:#6b7280;font-size:12px">“${esc(r.bubble || '')}” ${esc(months(r.month_from, r.month_to))}${r.bubble_score ? ' · ' + Math.round(r.bubble_score * 100) + '%' : ''}</span></div>
        <div>${S.open && S.open.key === String(r.id) ? '' : btn('✔ Record is right', `data-exact="book" data-exsub="${r.current_id}"`, true) + (r.bubble_id ? btn('Bubble is right → ' + esc(r.bubble_name), `data-exact="bubble" data-exsub="${r.bubble_id}" data-exname="${esc(r.bubble_name)}"`) : '') + btn('🔎 Another name', 'data-exsearch="1"')}</div>${picker(String(r.id))}`, r.id, 'conflict', '#f59e0b')).join('');
    else if (k === 'unclaimed') h += rows.map(r => { const answered = r.status === 'override' || r.status === 'blocked';
      return item(`<div><b>${peso(r.amount)}</b> · ${esc(dt(r.at))} · GCash in · ref …${esc(String(r.ref).slice(-4))}${r.last4 ? ' · from …' + esc(r.last4) : ''}</div>
        <div style="margin-top:4px">${esc(GUESS[r.status] || r.status)}${r.guess_name ? ' <b>' + esc(r.guess_name) + '</b>' + (r.guess_area ? ' (' + esc(r.guess_area) + ')' : '') : ''}${r.map_payments ? ` <span style="color:#6b7280;font-size:12px">· ${r.map_payments} payment${r.map_payments > 1 ? 's' : ''} in ${r.map_months} month${r.map_months > 1 ? 's' : ''}</span>` : ''}${r.override_by ? ` <span style="color:#6b7280;font-size:12px">· by ${esc(r.override_by)}</span>` : ''}</div>
        <div>${S.open && S.open.key === r.ref ? '' : answered ? btn('↩ Undo', 'data-exact="undo"') : (r.guess_id ? btn('✔ Yes, ' + esc(r.guess_name), `data-exact="confirm" data-exsub="${r.guess_id}" data-exname="${esc(r.guess_name)}"`, true) : '') + (r.last4 ? btn('🔎 Who sent it?', 'data-exsearch="1"') + btn('⛔ Never guess this number', 'data-exact="block"', false, true) : '')}</div>${picker(r.ref)}`,
        r.ref, 'unclaimed', answered ? '#027e60' : r.status === 'learned_strong' || r.status === 'phone' ? '#025ac6' : '#9ca3af'); }).join('');
    else if (k === 'cash_or') h += rows.map(r => item(`<div><b>OR ${esc(r.or_no || '?')}</b>${r.date_txt ? ' · dated ' + esc(r.date_txt) : ''} · ${r.status === 'in_book_far' ? 'in the book, but a month apart — same serial re-used?' : 'not in the book'} · photo ${esc(dt(r.at))} · posted by ${esc(r.poster || '?')}${r.duplicate ? ' · 📷 photographed twice' : ''}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px">Ask the collector who issued it; once it is written in BASHANG this row leaves by itself.</div>
        <div>${btn('Not a real gap — skip', 'data-exact="skip"')}</div>`, r.id, 'cash_or', '#9ca3af')).join('');
    else h += rows.map(r => item(`<div><b>${esc(MATCH[r.verdict] || r.verdict)}</b> · ${r.claimed != null ? 'claimed ' + peso(r.claimed) : ''}${r.gcash != null ? ' · GCash ' + peso(r.gcash) : ''} · ${esc(r.source)} · ${esc(dt(r.at))}${r.ref ? ' · ref …' + esc(String(r.ref).slice(-4)) : r.given ? ' · ref on record …' + esc(String(r.given).slice(-4)) : ''}</div>
        <div style="margin-top:4px">${r.name ? '<b>' + esc(r.name) + '</b>' : 'No subscriber'} ${esc(months(r.month_from, r.month_to))} <span style="color:#6b7280;font-size:12px">· decide in 🔍 GCash review</span></div>`, r.key, 'check', '#f59e0b')).join('');
    card(h); wire();
  }
  // ── taps ──
  async function act(list, key, action, sub, name){
    try {
      await rpc('pay_exception_v1', { p_pin: S.pin, p_list: list, p_key: String(key), p_subscriber_id: sub || null, p_action: action, p_note: null });
      say(action === 'undo' ? 'Undone' : action === 'block' ? 'Saved: never guess this number' : action === 'none' || action === 'skip' ? 'Skipped' : action === 'book' ? 'Saved: record is right' : `Saved: ${name || 'answered'}`);
      S.open = null; S.q = ''; S.res = []; S.none = false; await load(S.pin);
    } catch (e) { say(e.message); if (e.pin) { pinClear(); pinScreen(e.message); } else render(); }
  }
  let qT = null;
  async function search(q){
    try { const r = await sb('subscribers', `status=eq.active&name=ilike.*${encodeURIComponent(q)}*&select=id,name,area&order=name.asc`, 8);
      if ((S.q || '').trim() !== q) return; S.res = Array.isArray(r) ? r : []; S.none = !S.res.length; render(); const i = document.getElementById('ex-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    catch (e) { say(e.message); }
  }
  function wire(){
    const b = body(); if (!b) return;
    const rf = b.querySelector('#ex-refresh'); if (rf) rf.onclick = () => load(S.pin);
    const lk = b.querySelector('#ex-lock'); if (lk) lk.onclick = () => { pinClear(); pinScreen(''); };
    b.querySelectorAll('[data-exf]').forEach(x => x.onclick = () => { S.list = x.dataset.exf; S.open = null; render(); });
    b.querySelectorAll('[data-exkey]').forEach(cardEl => {
      const key = cardEl.dataset.exkey, list = cardEl.dataset.exlist;
      cardEl.querySelectorAll('[data-exsearch]').forEach(x => x.onclick = () => { S.open = { list, key }; S.q = ''; S.res = []; S.none = false; render(); const i = document.getElementById('ex-q'); if (i) i.focus(); });
      cardEl.querySelectorAll('[data-exclose]').forEach(x => x.onclick = () => { S.open = null; S.q = ''; S.res = []; S.none = false; render(); });
      cardEl.querySelectorAll('[data-expick]').forEach(x => x.onclick = () => { x.disabled = true; act(list, key, list === 'unclaimed' ? 'confirm' : list === 'conflict' ? 'bubble' : 'set', +x.dataset.expick, x.dataset.exname); });
      cardEl.querySelectorAll('[data-exact]').forEach(x => x.onclick = () => { x.disabled = true; act(list, key, x.dataset.exact, x.dataset.exsub ? +x.dataset.exsub : null, x.dataset.exname); });
      const qi = cardEl.querySelector('#ex-q'); if (qi) qi.oninput = () => { S.q = qi.value; clearTimeout(qT); const q = S.q.trim(); if (q.length < 2) { S.res = []; S.none = false; return; } qT = setTimeout(() => search(q), 350); };
    });
  }
  window.excTabLoad = entry;
})();
