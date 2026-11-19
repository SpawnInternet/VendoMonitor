/* 🤖 The digital employee as a row of AGENTS — one strip on the home page (2026-11-13; Wendell: "make it agents").
   Reads view v_employee_counts_v1 (one row: every agent's switch + today's numbers; service_role only, through the admin gateway).
   Absent → the strip stays empty. Counts only. Decisions are taken in Spawn Text → 💳 GCash → ⚠ Exceptions; this strip only shows them. */
(function(){
  const el = () => document.getElementById('employee-strip');
  const n = v => Number(v || 0).toLocaleString('en-PH');
  const peso = v => '₱' + Number(v || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  // switch value → light + word
  const MODE = { on:['#027e60', 'on'], watch:['#b45309', 'watch'], once:['#b45309', 'test'], shadow:['#7c3aed', 'shadow'], off:['#9ca3af', 'off'] };
  const light = m => { const [c, w] = MODE[m] || MODE.off; return `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${c};margin-right:4px;vertical-align:middle"></span><span style="font-size:9px;color:${c};font-weight:700">${w}</span>`; };
  function agent(icon, name, mode, main, sub, title){
    return `<div title="${esc(title || '')}" style="flex:1 1 120px;min-width:120px;padding:7px 10px;border-radius:8px;background:var(--bg2, #f8fafc);border:1px solid var(--line, #e5e7eb)">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;font-weight:700;color:var(--mu,#6b7280);text-transform:uppercase;letter-spacing:.04em"><span>${icon} ${name}</span>${light(mode)}</div>
      <div style="font-size:16px;font-weight:800;margin-top:2px">${main}</div>
      <div style="font-size:10px;color:var(--mu,#6b7280)">${sub}</div></div>`;
  }
  function render(r){
    const host = el(); if (!host) return;
    if (!r) { host.innerHTML = ''; return; }
    host.innerHTML = `<div class="cs"><div class="cs-t">🤖 Digital employee · the agents today
        <span style="float:right;font-size:9px;color:var(--mu);font-weight:400;text-transform:none;letter-spacing:0">decide in Spawn Text → 💳 GCash → ⚠ Exceptions</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${agent('📷', 'Reader', r.reader_mode, n(r.reads_24h) + ' <span style="font-size:11px;color:#027e60">' + n(r.confirmed_24h) + ' in GCash</span>', 'receipts read, last 24 h', 'Messenger receipts read in the last 24 hours, and how many the GCash export confirms')}
        ${agent('🏷', 'Namer', r.pair_mode, n(r.unnamed) + ' <span style="font-size:11px;color:#b45309">' + n(r.conflicts) + ' conflicts</span>', 'receipts still unnamed', 'receipts nobody has named · bubble name vs record conflicts')}
        ${agent('💸', 'Collector', 'on', n(r.unclaimed) + ' <span style="font-size:11px;color:#b91c1c">' + peso(r.unclaimed_amount) + '</span>', 'GCash in, nobody claims (60 d)', 'GCash money in that no book row, app record, text or receipt claims')}
        ${agent('🧾', 'Cashier', 'on', n(r.or_gaps) + (r.week_booked_no_photo != null ? ' <span style="font-size:11px;color:#b45309">' + n(r.week_booked_no_photo) + ' no photo</span>' : ''),
                r.week_booked_no_photo != null ? 'OR gaps · this week: ' + n(r.week_booked_no_photo) + ' booked without a photo' + (r.week_amount_no_photo ? ' (' + peso(r.week_amount_no_photo) + ')' : '') : 'paper ORs not in the book',
                'official receipts photographed in the chat but not written in BASHANG · this week: cash in the book with no OR photo (office counter can be exempt)')}
        ${agent('🤖', 'Recorder', r.record_mode, n(r.record_mode === 'on' ? r.recorded_fb : r.would_record), r.record_mode === 'on' ? 'screenshot payments recorded' : 'would record (watch)', 'screenshot payments confirmed by the export and written into the subscriber\'s months')}
        ${agent('📇', 'Clerk', r.fill_mode, n(r.fills_today), 'subscriber fields filled today', 'mobile, install date, PPPoE and address filled from the New Subscriber chat (empty fields only)')}
        ${agent('📱', 'Texter', r.sms_mode === 'live' ? 'on' : r.sms_mode === 'dry_run' ? 'watch' : 'off', n(r.texts_out_today) + ' <span style="font-size:11px;color:var(--mu)">' + n(r.texts_in_today) + ' in</span>', 'texts sent today', 'Spawn Text reminders and replies sent today · texts received')}
        ${agent('✂', 'Disconnector', r.disc_mode === 'on' ? 'shadow' : 'off', n(r.disc_candidates) + ' <span style="font-size:11px;color:var(--mu)">' + n(r.disc_hold) + ' hold</span>', 'shadow list' + (r.disc_as_of ? ' · as of ' + new Date(r.disc_as_of).toLocaleTimeString('en-PH', { hour:'numeric', minute:'2-digit', timeZone:'Asia/Manila' }) : ''), '2+ unpaid months and no evidence of paying · on hold for a reason · computed once a day at 09:30 · nobody is disconnected by this')}
        ${agent('🧑‍💼', 'Office', r.exceptions_mode, n(r.taps_today), 'answers given today', 'taps on the exceptions screen today')}
        ${harvestCard(r)}
      </div>${harvestPanel(r)}</div>`;
    host.querySelectorAll('details[data-hk]').forEach(d => d.addEventListener('toggle', () => { d.open ? OPEN.add(d.dataset.hk) : OPEN.delete(d.dataset.hk); }));
  }

  /* 🧺 Harvest agent (2026-11-19, eod_harvest): card on the home strip; the report itself is a chat in the Employees tab. */
  const OPEN = new Set();                      // which <details> stay open across the 5-minute refresh
  const tm = iso => iso ? new Date(iso).toLocaleTimeString('en-PH', { hour:'numeric', minute:'2-digit', timeZone:'Asia/Manila' }) : '';
  const det = (key, summary, body, style) => `<details data-hk="${esc(key)}" ${OPEN.has(key) ? 'open' : ''} style="margin-top:6px;${style || ''}">
      <summary style="cursor:pointer;font-size:12px;font-weight:700">${summary}</summary>${body}</details>`;
  function harvestCard(r){
    const R = r.harvest_report; if (!R) return '';
    const T = R.totals || {}, cols = R.collectors || [];
    const last = cols.map(c => c.last).filter(Boolean).sort().pop();
    const warn = (R.advice || []).filter(a => a.level === 'warn').length;
    return agent('🧺', 'Harvest', r.harvest_mode, n(T.harvests) + ' <span style="font-size:11px;color:#027e60">' + peso(T.spawn) + '</span>',
                 (R.final ? 'final · ' : 'so far · ') + n(T.collectors) + ' collectors' + (last ? ' · last ' + last : '') + (warn ? ' · ' + warn + ' ⚠' : ''),
                 'Harvests saved today and Spawn share · live every 30 min, final at 18:30 · open the Harvest agent report below');
  }
  /* Home page shows only the notification line; the full report lives in the Employees tab (chat). */
  function harvestPanel(r){
    const S = window.__empChatSummary || [];
    const open = S.reduce((a, x) => a + Number(x.open_questions || 0), 0);
    const unread = S.filter(x => x.last_agent_msg_id && Number(x.last_agent_msg_id) > seenId(x.employee_id)).length;
    const R = r.harvest_report; if (!R && !S.length) return '';
    const T = (R && R.totals) || {};
    const last = S.filter(x => x.last_text).sort((a, b) => new Date(b.last_at) - new Date(a.last_at))[0];
    return `<div style="margin-top:6px;padding:7px 10px;border-radius:8px;border:1px solid var(--line,#e5e7eb);background:var(--bg2,#f8fafc);display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12px">
      <span style="font-weight:800">💬 Employees</span>
      ${unread ? `<span style="background:#dc2626;color:#fff;border-radius:999px;padding:0 7px;font-weight:800">${unread} new</span>` : '<span style="color:var(--mu,#6b7280)">nothing new</span>'}
      ${open ? `<span style="color:#b45309;font-weight:700">❓ ${open} question${open === 1 ? '' : 's'} for you</span>` : ''}
      <span style="color:var(--mu,#6b7280);flex:1;min-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${last ? esc(last.employee) + ': ' + esc(last.last_text) : ''}</span>
      <button onclick="showP('employees')" style="padding:4px 12px;border:1px solid #c4b5fd;border-radius:7px;background:#fff;color:#7c3aed;font-weight:700;cursor:pointer">Open chat</button>
    </div>`;
  }

  /* ── Employees tab: the chat (2026-11-19). Reads v_hq_chat_summary_v1 + v_hq_chat_v1 through the admin gateway;
     answers go through spawn_hq_chat_reply. Seen-state is per browser (localStorage). ── */
  const SEEN_KEY = 'spawn_emp_seen';
  const seen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch (_) { return {}; } };
  const seenId = id => Number(seen()[id] || 0);
  const markSeen = (id, msgId) => { const s = seen(); if (Number(msgId) > Number(s[id] || 0)) { s[id] = Number(msgId); try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (_) {} } };
  const ICON = { eod_harvest: '🧺', supervisor: '🧑‍💼', job_dispatcher: '📋', gcash_autopay: '📷', spawn_remind: '📱' };
  let chatEmp = null, chatBusy = false, chatTimer = null;
  const tmFull = iso => new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });

  async function chatSummary(){
    try { const rows = await sb('v_hq_chat_summary_v1', 'select=*&order=last_at.desc.nullslast', 50); window.__empChatSummary = Array.isArray(rows) ? rows : []; }
    catch (_) { window.__empChatSummary = []; }
    const S = window.__empChatSummary;
    const unread = S.filter(x => x.last_agent_msg_id && Number(x.last_agent_msg_id) > seenId(x.employee_id)).length;
    const open = S.reduce((a, x) => a + Number(x.open_questions || 0), 0);
    const b = document.getElementById('nav-employees-badge');
    if (b) { const n = unread + open; b.textContent = n; b.style.display = n ? 'block' : 'none'; }
    return S;
  }
  function chatListRender(){
    const host = document.getElementById('emp-chat-list'); if (!host) return;
    const S = window.__empChatSummary || [];
    if (!S.length) { host.innerHTML = '<div style="padding:14px;font-size:12px;color:var(--mu,#6b7280)">No employee has written yet. The Harvest agent posts from 09:00; the Supervisor at 07:10, 12:10 and 18:40.</div>'; return; }
    host.innerHTML = S.map(x => {
      const unread = x.last_agent_msg_id && Number(x.last_agent_msg_id) > seenId(x.employee_id);
      const dot = { red: '#dc2626', amber: '#d97706', green: '#059669' }[x.light] || '#9ca3af';
      return `<div data-emp="${esc(x.employee_id)}" style="padding:10px 12px;border-bottom:1px solid var(--line,#e5e7eb);cursor:pointer;background:${chatEmp === x.employee_id ? '#ede9fe' : 'transparent'}">
        <div style="display:flex;align-items:center;gap:6px;font-weight:${unread ? 800 : 600};font-size:13px"><span>${ICON[x.employee_id] || '🤖'}</span><span style="flex:1">${esc(x.employee)}</span>
          <span title="${esc(x.reason || x.light || '')}" style="width:8px;height:8px;border-radius:50%;background:${dot}"></span>
          ${Number(x.open_questions) ? `<span style="background:#fde68a;color:#92400e;border-radius:999px;padding:0 6px;font-size:10px;font-weight:800">${x.open_questions}❓</span>` : ''}
          ${unread ? '<span style="width:8px;height:8px;border-radius:50%;background:#7c3aed"></span>' : ''}</div>
        <div style="font-size:11px;color:var(--mu,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${esc((x.last_text || '').split('\n')[0])}</div>
        <div style="font-size:10px;color:var(--mu,#6b7280)">${x.last_at ? tmFull(x.last_at) : ''}</div>
      </div>`;
    }).join('');
    host.querySelectorAll('[data-emp]').forEach(el => el.onclick = () => chatOpen(el.dataset.emp));
  }
  function bubble(m){
    const mine = m.role === 'owner';
    const base = 'max-width:78%;padding:8px 12px;border-radius:14px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word;';
    const style = mine ? base + 'align-self:flex-end;background:#7c3aed;color:#fff;border-bottom-right-radius:4px'
                       : base + 'align-self:flex-start;background:var(--bg2,#f1f5f9);border:1px solid var(--line,#e5e7eb);border-bottom-left-radius:4px'
                              + (m.kind === 'question' && m.status === 'open' ? ';border-color:#f59e0b;background:#fffbeb' : '');
    let foot = '';
    if (m.kind === 'question') {
      if (m.status === 'open') {
        const btns = (m.options || []).map(o => `<button data-ans="${esc(o.v)}" data-id="${m.id}" style="padding:4px 10px;border:1px solid #c4b5fd;border-radius:7px;background:#fff;color:#5b21b6;font-size:12px;font-weight:700;cursor:pointer">${esc(o.label)}</button>`).join(' ');
        const free = m.free_text ? `<input data-free="${m.id}" placeholder="or type the vendo…" style="padding:4px 8px;border:1px solid var(--bd,#e5e7eb);border-radius:7px;font-size:12px;min-width:160px">` : '';
        foot = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center">${btns}${free}</div>`;
      } else {
        foot = `<div style="margin-top:4px;font-size:11px;color:var(--mu,#6b7280)">${m.status === 'answered' ? '✓ answered' : 'skipped'}${m.answered_at ? ' · ' + tmFull(m.answered_at) : ''}</div>`;
      }
    }
    return `<div style="display:flex;flex-direction:column;align-self:${mine ? 'flex-end' : 'flex-start'};max-width:100%">
      <div style="${style}">${esc(m.text)}${foot}</div>
      <div style="font-size:10px;color:var(--mu,#6b7280);margin:2px 6px;align-self:${mine ? 'flex-end' : 'flex-start'}">${mine ? 'You' : esc(m.employee)} · ${tmFull(m.at)}</div></div>`;
  }
  async function chatOpen(emp){
    chatEmp = emp; chatListRender();
    const head = document.getElementById('emp-chat-head'), box = document.getElementById('emp-chat-msgs'); if (!box) return;
    const S = (window.__empChatSummary || []).find(x => x.employee_id === emp) || {};
    head.innerHTML = `${ICON[emp] || '🤖'} ${esc(S.employee || emp)} <span style="font-weight:400;font-size:12px;color:var(--mu,#6b7280)">· ${esc(S.reason || S.light || '')}</span>`;
    box.innerHTML = '<div style="color:var(--mu,#6b7280);font-size:12px">Loading…</div>';
    let rows = [];
    try { rows = await sb('v_hq_chat_v1', 'select=*&employee_id=eq.' + encodeURIComponent(emp) + '&order=id.desc', 200); } catch (_) {}
    rows = (rows || []).slice().reverse();
    // open questions last so they sit by the reply box
    const openQ = rows.filter(m => m.kind === 'question' && m.status === 'open'), rest = rows.filter(m => !(m.kind === 'question' && m.status === 'open'));
    box.innerHTML = (rest.map(bubble).join('') + (openQ.length ? `<div style="font-size:11px;color:#92400e;font-weight:700;margin-top:6px">❓ Waiting for your answer · ${openQ.length}</div>` + openQ.map(bubble).join('') : ''))
                 || '<div style="color:var(--mu,#6b7280);font-size:12px">No messages yet.</div>';
    box.scrollTop = box.scrollHeight;
    box.querySelectorAll('[data-ans]').forEach(b => b.onclick = () => chatAnswer(Number(b.dataset.id), b.dataset.ans, (box.querySelector(`[data-free="${b.dataset.id}"]`) || {}).value || ''));
    box.querySelectorAll('[data-free]').forEach(i => i.onkeydown = e => { if (e.key === 'Enter' && i.value.trim()) chatAnswer(Number(i.dataset.free), '', i.value.trim()); });
    const maxAgent = rows.filter(m => m.role === 'agent').reduce((a, m) => Math.max(a, Number(m.id)), 0);
    if (maxAgent) markSeen(emp, maxAgent);
    chatSummary().then(chatListRender);
  }
  async function chatReply(body){
    if (chatBusy) return null; chatBusy = true;
    try {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/spawn_hq_chat_reply`, { method: 'POST', headers: { ...HDR, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
      return j;
    } catch (e) { alert('Could not send: ' + e.message); return null; }
    finally { chatBusy = false; }
  }
  async function chatAnswer(id, answer, note){
    const j = await chatReply({ p_id: id, p_answer: answer || null, p_note: note || null });
    if (j) chatOpen(chatEmp);
  }
  async function chatSend(){
    const inp = document.getElementById('emp-chat-input'); const t = (inp.value || '').trim(); if (!t || !chatEmp) return;
    const j = await chatReply({ p_employee: chatEmp, p_note: t });
    if (j) { inp.value = ''; chatOpen(chatEmp); }
  }
  window.employeesTabShown = async function(){
    await chatSummary(); chatListRender();
    const S = window.__empChatSummary || [];
    if (!chatEmp && S.length) chatOpen((S.find(x => Number(x.open_questions) > 0) || S[0]).employee_id);
    else if (chatEmp) chatOpen(chatEmp);
    clearInterval(chatTimer);
    chatTimer = setInterval(() => { const p = document.getElementById('panel-employees'); if (p && p.classList.contains('active') && document.visibilityState === 'visible') { chatSummary().then(chatListRender); } }, 60000);
  };
  document.addEventListener('DOMContentLoaded', () => {
    const f = document.getElementById('emp-chat-form'); if (f) f.addEventListener('submit', e => { e.preventDefault(); chatSend(); });
    chatSummary();
    setInterval(chatSummary, 5 * 60 * 1000);
  });

  async function load(){
    if (!el()) return;
    try {
      const rows = await sb('v_employee_counts_v1', 'select=*', 1);
      render(Array.isArray(rows) && rows.length ? rows[0] : null);
    } catch (e) { render(null); }
  }
  window.employeeStripLoad = load;
  document.addEventListener('DOMContentLoaded', () => { load(); setInterval(load, 5 * 60 * 1000); });
})();
