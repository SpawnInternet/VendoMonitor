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
      <span style="color:var(--mu,#6b7280);flex:1;min-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${last ? esc(last.employee) + ': ' + esc(window.spawnTo12h ? spawnTo12h(last.last_text) : last.last_text) : ''}</span>
      <button onclick="showP('employees')" style="padding:4px 12px;border:1px solid #c4b5fd;border-radius:7px;background:#fff;color:#7c3aed;font-weight:700;cursor:pointer">Open chat</button>
    </div>`;
  }

  /* ── Employees tab: the chat (2026-11-19). Reads v_hq_chat_summary_v1 + v_hq_chat_v2 through the admin gateway;
     answers go through spawn_hq_chat_reply_v2. Seen-state is per browser (localStorage).
     2026-11-20 (companions framework): ↩ Reply on any bubble (not on an open question — that is answered with its buttons),
     the reply shows the line it answers; ✦ Claude tag on notes written by the companion routine. Falls back to
     v_hq_chat_v1 / spawn_hq_chat_reply if the gateway does not have the v2 names yet. ── */
  const SEEN_KEY = 'spawn_emp_seen';
  const seen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch (_) { return {}; } };
  const seenId = id => Number(seen()[id] || 0);
  const markSeen = (id, msgId) => { const s = seen(); if (Number(msgId) > Number(s[id] || 0)) { s[id] = Number(msgId); try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (_) {} } };
  const ICON = { eod_harvest: '🧺', supervisor: '🧑‍💼', job_dispatcher: '📋', gcash_autopay: '📷', spawn_remind: '📱', poller_dicayas: '📡', poller_dapitan: '📡', name_matcher: '🔗', audit_harvest: '🔎', overdue: '🗓', pullout: '📍', income_checker: '📈', newly_installed: '🆕', network_watch: '📡', sms_gateway: '📱', system_doctor: '🩺' };
  /* 2026-11-24 (Needs you queue): the decision handlers below take an optional last argument ctx = { after(ok), notice(msg) }.
     With ctx, after(ok) replaces the chat re-render and notice() replaces the chat-pane notice; without it (the chat itself)
     nothing changes. Exposed as window.employeesChatActions so the queue presses the very same buttons. */
  const ctxAfter = (ctx, ok) => { if (ctx && typeof ctx.after === 'function') ctx.after(!!ok); else chatOpen(chatEmp); };
  const ctxNotice = ctx => (ctx && typeof ctx.notice === 'function') ? ctx.notice : chatNotice;
  let chatEmp = null, chatBusy = false, chatTimer = null, replyTo = null;   // replyTo = { id, text } while replying to a bubble
  const tmFull = iso => new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });

  async function chatSummary(){
    try { const rows = await sb('v_hq_chat_summary_v1', 'select=*&order=last_at.desc.nullslast', 50); window.__empChatSummary = Array.isArray(rows) ? rows : []; }
    catch (_) { window.__empChatSummary = []; }
    const S = window.__empChatSummary;
    const unread = S.filter(x => x.last_agent_msg_id && Number(x.last_agent_msg_id) > seenId(x.employee_id)).length;
    const open = S.reduce((a, x) => a + Number(x.open_questions || 0), 0);
    if (typeof window.navTickerRefresh === 'function') setTimeout(window.navTickerRefresh, 0);
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
        <div style="font-size:11px;color:var(--mu,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${esc((window.spawnTo12h ? spawnTo12h(x.last_text || '') : (x.last_text || '')).split('\n')[0])}</div>
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
        const autoDays = (window.__hqSwitches && window.__hqSwitches.hq_needs_you_expire_days) || 7;
        const word = m.status === 'answered' ? '✓ answered' : (m.status === 'closed' && m.answer === 'later_auto') ? '⏱ closed after ' + autoDays + ' days (no answer)' : 'skipped';
        foot = `<div style="margin-top:4px;font-size:11px;color:var(--mu,#6b7280)">${word}${m.answered_at ? ' · ' + tmFull(m.answered_at) : ''}</div>`;
      }
    }
    // an owner reply quotes the line it answers
    const quote = (m.topic === 'reply' && m.reply_to_text)
      ? `<div style="font-size:11px;opacity:.85;border-left:3px solid ${mine ? 'rgba(255,255,255,.6)' : '#c4b5fd'};padding:1px 0 1px 7px;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">↩ ${esc(String(m.reply_to_text).split('\n')[0])}</div>` : '';
    const canReply = !(m.kind === 'question' && m.status === 'open');
    // 2026-11-20: "Fix it ›" opens the tab where this employee's problems get fixed; ↗ opens it in a new window (dash.22.nav.js)
    const F = !mine && window.SPAWN_FIX ? window.SPAWN_FIX[m.employee_id] : null;
    const fix = F ? `<div style="margin-top:6px;font-size:11px;display:flex;gap:10px;align-items:center"><a href="#" data-fix="${esc(m.employee_id)}" style="color:#1B6BE0;text-decoration:none;font-weight:700">${esc(F.label)} ›</a><a href="#" data-fixwin="${esc(m.employee_id)}" title="Open in a new window" style="color:#1B6BE0;text-decoration:none">↗</a></div>` : '';
    return `<div style="display:flex;flex-direction:column;align-self:${mine ? 'flex-end' : 'flex-start'};max-width:100%">
      <div style="${style}">${quote}${esc(window.spawnTo12h ? spawnTo12h(m.text) : m.text)}${foot}${fix}</div>
      <div style="display:flex;gap:8px;align-items:center;font-size:10px;color:var(--mu,#6b7280);margin:2px 6px;align-self:${mine ? 'flex-end' : 'flex-start'}">${mine ? 'You' : esc(m.employee)} · ${tmFull(m.at)}${m.is_claude ? ' <span title="Written by the Claude companion routine" style="background:#f5f3ff;color:#6d28d9;border:1px solid #ddd6fe;border-radius:999px;padding:0 6px;font-weight:700">✦ Claude</span>' : ''}${canReply ? ` <button data-reply="${m.id}" title="Reply to this message" style="border:0;background:none;color:#7c3aed;cursor:pointer;font-size:11px;padding:0 2px">↩ Reply</button>` : ''}${mine ? '' : ` <button data-copy="${m.id}" title="Copy this message" style="border:0;background:none;color:#1B6BE0;cursor:pointer;font-size:11px;padding:0 2px">📋 Copy</button>`}</div></div>`;
  }
  async function chatOpen(emp){
    if (chatEmp !== emp) setReply(null);
    chatEmp = emp; chatListRender();
    const head = document.getElementById('emp-chat-head'), box = document.getElementById('emp-chat-msgs'); if (!box) return;
    const S = (window.__empChatSummary || []).find(x => x.employee_id === emp) || {};
    head.innerHTML = `${ICON[emp] || '🤖'} ${esc(S.employee || emp)} <span style="font-weight:400;font-size:12px;color:var(--mu,#6b7280)">· ${esc(S.reason || S.light || '')}</span>
      <button id="emp-copy-all" title="Copy today's messages from this agent" style="float:right;border:1px solid #c7d2fe;background:#fff;color:#1B6BE0;border-radius:7px;font-size:11px;font-weight:700;padding:3px 8px;cursor:pointer">📋 Copy today</button>`;
    box.innerHTML = '<div style="color:var(--mu,#6b7280);font-size:12px">Loading…</div>';
    let rows = [];
    const q = 'select=*&employee_id=eq.' + encodeURIComponent(emp) + '&order=id.desc';
    try { rows = await sb('v_hq_chat_v2', q, 200); } catch (_) {}
    if (!rows || !rows.length) { try { rows = await sb('v_hq_chat_v1', q, 200); } catch (_) {} }   // gateway without v2 yet
    rows = (rows || []).slice().reverse();
    // open questions last so they sit by the reply box
    const openQ = rows.filter(m => m.kind === 'question' && m.status === 'open'), rest = rows.filter(m => !(m.kind === 'question' && m.status === 'open'));
    box.innerHTML = (rest.map(bubble).join('') + (openQ.length ? `<div style="font-size:11px;color:#92400e;font-weight:700;margin-top:6px">❓ Waiting for your answer · ${openQ.length}</div>` + openQ.map(bubble).join('') : ''))
                 || '<div style="color:var(--mu,#6b7280);font-size:12px">No messages yet.</div>';
    box.scrollTop = box.scrollHeight;
    box.querySelectorAll('[data-ans]').forEach(b => b.onclick = () => {
      const m = rows.find(r => Number(r.id) === Number(b.dataset.id));
      // 2026-11-21: Audit harvest money questions go through hq_audit_decide (admin gateway only), never the chat reply
      // 2026-11-21: Pull-out questions go through hq_pullout_decide the same way
      return m && m.topic === 'audit_money' ? chatDecide(m, b.dataset.ans, b.textContent)
        : m && m.topic === 'pullout' ? chatPullout(m, b.dataset.ans)
        : m && m.topic === 'newvendo' ? chatNewVendo(m, b.dataset.ans)
        : chatAnswer(Number(b.dataset.id), b.dataset.ans, (box.querySelector(`[data-free="${b.dataset.id}"]`) || {}).value || '');
    });
    box.querySelectorAll('[data-free]').forEach(i => i.onkeydown = e => { if (e.key === 'Enter' && i.value.trim()) chatAnswer(Number(i.dataset.free), '', i.value.trim()); });
    box.querySelectorAll('[data-fix]').forEach(a => a.onclick = e => { e.preventDefault(); const F = (window.SPAWN_FIX || {})[a.dataset.fix]; if (F && window.spawnOpenPanel) spawnOpenPanel(F.panel, F.sub); });
    box.querySelectorAll('[data-fixwin]').forEach(a => a.onclick = e => { e.preventDefault(); const F = (window.SPAWN_FIX || {})[a.dataset.fixwin]; if (F && window.spawnOpenNewWindow) spawnOpenNewWindow(F.panel, F.sub); });
    box.querySelectorAll('[data-reply]').forEach(b => b.onclick = () => {
      const m = rows.find(r => Number(r.id) === Number(b.dataset.reply)); if (!m) return;
      setReply({ id: Number(m.id), text: (m.role === 'owner' ? 'You: ' : '') + String(m.text || '').split('\n')[0] });
    });
    box.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
      const m = rows.find(r => Number(r.id) === Number(b.dataset.copy)); if (!m) return;
      const txt = `${m.employee} · ${tmFull(m.at)}\n${m.text}`;
      try { await navigator.clipboard.writeText(txt); } catch (e) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
      b.textContent = '✓ Copied'; setTimeout(() => b.textContent = '📋 Copy', 1500);
    });
    const ca = document.getElementById('emp-copy-all'); if (ca) ca.onclick = async () => {
      const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      const txt = rows.filter(m => m.role === 'agent' && new Date(m.at).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) === day)
                      .map(m => `${m.employee} · ${tmFull(m.at)}\n${m.text}`).join('\n\n');
      try { await navigator.clipboard.writeText(txt || 'No messages today.'); } catch (e) {}
      ca.textContent = '✓ Copied'; setTimeout(() => ca.textContent = '📋 Copy today', 1500);
    };
    const maxAgent = rows.filter(m => m.role === 'agent').reduce((a, m) => Math.max(a, Number(m.id)), 0);
    if (maxAgent) markSeen(emp, maxAgent);
    chatSummary().then(chatListRender);
  }
  async function callReply(fn, body){
    const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { ...HDR, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { r, j };
  }
  async function chatReply(body, ctx){
    if (chatBusy) return null; chatBusy = true;
    try {
      let { r, j } = await callReply('spawn_hq_chat_reply_v2', body);
      // gateway still on v86 (no v2 name): answers and new messages still work through v1; replies need v2
      if (!r.ok && /rpc not allowed/.test(String(j.error || '')) && !body.p_reply_to) ({ r, j } = await callReply('spawn_hq_chat_reply', body));
      if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
      return j;
    } catch (e) { ctxNotice(ctx)('Could not send: ' + e.message); return null; }
    finally { chatBusy = false; }
  }
  /* inline notice above the reply box (no pop-up) */
  function chatNotice(msg){
    const n = document.getElementById('emp-chat-notice'); if (!n) { alert(msg); return; }
    n.textContent = msg; n.style.display = msg ? 'block' : 'none';
    clearTimeout(chatNotice.t); if (msg) chatNotice.t = setTimeout(() => { n.style.display = 'none'; }, 6000);
  }
  /* reply mode: a strip above the input says what is being answered; ✕ or Esc cancels */
  function setReply(rt){
    replyTo = rt;
    const bar = document.getElementById('emp-chat-replying'), inp = document.getElementById('emp-chat-input');
    if (!bar || !inp) return;
    if (!rt) { bar.style.display = 'none'; inp.placeholder = 'Write a note… (saved to the thread; nobody acts on it)'; return; }
    bar.querySelector('[data-rt]').textContent = rt.text;
    bar.style.display = 'flex'; inp.placeholder = 'Your note…'; inp.focus();
  }
  /* 🔎 Audit harvest: Charge / It's OK / Later on a money question. hq_audit_decide is granted to the service role only, so it
     works only through the admin gateway this dashboard is logged in to; it writes the same fields as the Recon tab's buttons. */
  async function chatDecide(m, choice, label, ctx){
    if (chatBusy) return;
    // the button label is "Charge <collector> ₱<amount>"; that amount is what the owner confirms, and decide refuses if the
    // shortfall moved since (late sales rows) — the button is then refreshed with the new amount
    const amt = String(label || '').replace(/^\s*Charge\s*/i, '') || 'this shortfall';
    const num = (String(label || '').match(/₱\s*([\d,]+(?:\.\d+)?)/) || [])[1];
    const expect = choice === 'charge' && num ? Number(num.replace(/,/g, '')) : null;
    if (choice === 'charge') {
      const go = typeof window.askConfirm === 'function'
        ? await window.askConfirm({ title: '💳 Charge as utang', body: 'Charge ' + esc(amt) + ' as utang? You can undo it in the Recon tab.', ok: 'Charge ' + esc(amt), danger: true })
        : confirm('Charge ' + amt + ' as utang? You can undo it in the Recon tab.');
      if (!go) return;
    }
    chatBusy = true; let ok = false;
    try {
      const { r, j } = await callReply('hq_audit_decide', { p_msg: Number(m.id), p_choice: choice, p_note: null, p_expect: expect });
      if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
      ok = true;
    } catch (e) { ctxNotice(ctx)('Not saved: ' + e.message); }
    finally { chatBusy = false; }
    ctxAfter(ctx, ok);
  }
  /* 📍 Pull-out: Flag for pull-out / It's still there / Later. hq_pullout_decide is service-role only (admin gateway); it sets
     only the vendo card's pull-out flag, never its status. */
  async function chatPullout(m, choice, ctx){
    if (chatBusy) return;
    if (choice === 'flag') {
      const body = 'Flag this vendo for pull-out on its card? Its status is not changed; pulling it out stays an office job. You can clear the flag on the vendo card.';
      const go = typeof window.askConfirm === 'function'
        ? await window.askConfirm({ title: '📍 Flag for pull-out', body, ok: 'Flag for pull-out', danger: true })
        : confirm(body);
      if (!go) return;
    }
    chatBusy = true; let ok = false;
    try {
      const { r, j } = await callReply('hq_pullout_decide', { p_msg: Number(m.id), p_choice: choice, p_note: null });
      if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
      ok = true;
    } catch (e) { ctxNotice(ctx)('Not saved: ' + e.message); }
    finally { chatBusy = false; }
    ctxAfter(ctx, ok);
  }
  /* 🆕 Newly installed: Same as … / New vendo / Ignore on a group-chat post. hq_newvendo_decide is service-role only (admin
     gateway); "Same as" fills blanks on that vendo only, "New vendo" creates one. */
  async function chatNewVendo(m, choice, ctx){
    if (chatBusy) return;
    if (choice === 'create') {
      const body = 'Create a new vendo from this post? It is added as active and joins the first harvest group of its area; you can move or retire it on the vendo card.';
      const go = typeof window.askConfirm === 'function'
        ? await window.askConfirm({ title: '🆕 New vendo', body, ok: 'Create vendo' })
        : confirm(body);
      if (!go) return;
    }
    chatBusy = true; let ok = false;
    try {
      const { r, j } = await callReply('hq_newvendo_decide', { p_msg: Number(m.id), p_choice: choice, p_note: null });
      if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
      ok = true;
    } catch (e) { ctxNotice(ctx)('Not saved: ' + e.message); }
    finally { chatBusy = false; }
    ctxAfter(ctx, ok);
  }
  async function chatAnswer(id, answer, note, ctx){
    const j = await chatReply({ p_id: id, p_answer: answer || null, p_note: note || null }, ctx);
    if (ctx) { if (typeof ctx.after === 'function') ctx.after(!!j); }
    else if (j) chatOpen(chatEmp);
  }
  window.employeesChatActions = { decide: chatDecide, pullout: chatPullout, newvendo: chatNewVendo, answer: chatAnswer, ICON };
  async function chatSend(){
    const inp = document.getElementById('emp-chat-input'); const t = (inp.value || '').trim(); if (!t || !chatEmp) return;
    const j = replyTo ? await chatReply({ p_reply_to: replyTo.id, p_note: t })
                      : await chatReply({ p_employee: chatEmp, p_note: t });
    if (j) { inp.value = ''; setReply(null); chatOpen(chatEmp); }
  }
  window.employeesOpenThread = emp => chatOpen(emp);
  window.employeesTabShown = async function(){
    await chatSummary(); chatListRender();
    const S = window.__empChatSummary || [];
    if (!chatEmp && S.length) chatOpen((S.find(x => Number(x.open_questions) > 0) || S[0]).employee_id);
    else if (chatEmp) chatOpen(chatEmp);
    clearInterval(chatTimer);
    chatTimer = setInterval(() => { const p = document.getElementById('panel-employees'); if (p && p.classList.contains('active') && document.visibilityState === 'visible') { chatSummary().then(chatListRender); } }, 60000);
  };
  document.addEventListener('DOMContentLoaded', () => {
    const f = document.getElementById('emp-chat-form');
    if (f) {
      f.addEventListener('submit', e => { e.preventDefault(); chatSend(); });
      if (!document.getElementById('emp-chat-replying')) {
        f.insertAdjacentHTML('beforebegin',
          `<div id="emp-chat-notice" style="display:none;margin:0 12px;padding:5px 10px;border-radius:7px;background:#fef2f2;color:#b91c1c;font-size:12px;font-weight:700"></div>
           <div id="emp-chat-replying" style="display:none;align-items:center;gap:8px;margin:0 12px;padding:5px 10px;border-left:3px solid #7c3aed;background:#f5f3ff;border-radius:6px;font-size:12px">
             <span style="font-weight:800;color:#6d28d9">↩ Note on</span>
             <span data-rt style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#4b5563"></span>
             <button type="button" data-rt-x title="Cancel the reply (Esc)" style="border:0;background:none;color:#6b7280;font-size:14px;cursor:pointer;padding:0 4px">✕</button>
           </div>`);
        document.querySelector('#emp-chat-replying [data-rt-x]').onclick = () => setReply(null);
        const inp = document.getElementById('emp-chat-input');
        if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Escape' && replyTo) setReply(null); });
      }
    }
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

/* ── Merged nav tabs (2026-11-19): 15 top buttons → 9. The original buttons stay in the DOM (class "sub", hidden)
   so role-based hiding and every onclick keep working; a hub button per group + a sub-tab row re-use them. ── */
(function(){
  const GROUPS = {
    reports:   { hub: 'reports',   tabs: [['reports', '📄 Reports'], ['analytics', '📊 Analytics']] },
    vendos:    { hub: 'vendos',    tabs: [['vendos', '📟 Telegram vendos'], ['vmap-top', '📍 Map'], ['spawncloud', '☁ Cloud'], ['suspicious', '⚠️ Suspicious'], ['notsus', '✅ Not Sus'], ['skipped', '⏭ Skipped']] },
    system:    { hub: 'system',    tabs: [['health', '🩺 Health'], ['status', '🖥 System']] },
    employees: { hub: 'employees', tabs: [['needsyou', '🧾 Needs you'], ['employees', '💬 Chat'], ['agents', '🤖 Agents']] }   // needsyou: shown only when spawn_settings.hq_needs_you = on (dash.23)
  };
  const groupOf = id => Object.keys(GROUPS).find(g => GROUPS[g].tabs.some(t => t[0] === id));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  function origBtn(id){ return document.querySelector('.nav-bar button.sub[data-panel="' + id + '"]') || document.querySelector('.nav-bar button[data-panel="' + id + '"]:not([data-hub])'); }
  function render(id){
    const bar = document.getElementById('subnav'); if (!bar) return;
    const g = groupOf(id);
    document.querySelectorAll('.nav-bar button[data-hub]').forEach(b => b.classList.toggle('active', !!g && b.dataset.hub === g));
    if (!g) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
    bar.style.display = 'flex';
    // 2026-11-24: the Needs you tab exists only while spawn_settings.hq_needs_you = on (dash.23 reads the switch and re-renders)
    const tabs = GROUPS[g].tabs.filter(([pid]) => pid !== 'needsyou' || (window.__hqSwitches && String(window.__hqSwitches.hq_needs_you || '').trim().toLowerCase() === 'on'));
    bar.innerHTML = tabs.map(([pid, label]) => {
      const ob = origBtn(pid); const hidden = ob && ob.offsetParent === null && getComputedStyle(ob).display === 'none' && !ob.classList.contains('sub');
      const badge = ob && ob.querySelector('.nbadge') && ob.querySelector('.nbadge').textContent.trim();
      return `<button data-sub="${esc(pid)}" ${hidden ? 'style="display:none"' : ''} class="subnav-btn${pid === id ? ' on' : ''}" style="padding:5px 12px;border:1px solid ${pid === id ? '#025AC6' : '#dbe3f4'};border-radius:999px;background:${pid === id ? '#025AC6' : '#fff'};color:${pid === id ? '#fff' : '#334155'};font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">${label}${badge ? ` <span style="background:#dc2626;color:#fff;border-radius:999px;padding:0 6px;font-size:10px">${esc(badge)}</span>` : ''}</button>`;
    }).join('');
    bar.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => {
      const pid = b.dataset.sub;
      if (pid === 'agents' || pid === 'needsyou') { window.showP(pid, null); return; }
      const ob = origBtn(pid); if (ob) ob.click(); else window.showP(pid, null);
    });
  }
  window.subnavRender = render;
  function hookShowP(){
    if (typeof window.showP !== 'function' || window.showP.__hub) return false;
    const orig = window.showP;
    const wrapped = function(id, btn){
      const r = orig.apply(this, arguments);
      try { render(id); if (id === 'agents' && typeof window.agentsTabShown === 'function') window.agentsTabShown(); if (id === 'needsyou' && typeof window.needsYouTabShown === 'function') window.needsYouTabShown(); } catch (_) {}
      return r;
    };
    wrapped.__hub = true; window.showP = wrapped; return true;
  }
  function mirrorBadges(){
    const sus = document.getElementById('nav-sus-badge'), hb = document.getElementById('hub-vendos-badge');
    if (sus && hb) { const t = sus.textContent.trim(); hb.textContent = t; hb.style.display = t && t !== '0' ? 'block' : 'none'; }
    const e1 = document.getElementById('nav-employees-badge'), e2 = document.getElementById('nav-employees-badge2');
    if (e1 && e2) { e2.textContent = e1.textContent; e2.style.display = e1.style.display; }
  }
  document.addEventListener('DOMContentLoaded', () => {
    hookShowP();
    // the Health tab is injected by dash.17.health.js a moment later; fold it into the System group when it appears
    const fold = () => { const h = document.querySelector('.nav-bar button[data-panel="health"]:not([data-hub])'); if (h) h.classList.add('sub'); };
    fold(); setTimeout(fold, 800); setTimeout(fold, 3000);
    const act = document.querySelector('.panel.active'); if (act) render(act.id.replace('panel-', ''));
    mirrorBadges(); setInterval(mirrorBadges, 3000);
  });
})();

/* ── Employees → Agents: the roll call of every digital employee (reads v_hq_employees_v1) ── */
window.agentsTabShown = async function(){
  const host = document.getElementById('agents-roll'); if (!host) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  let rows = [];
  try { rows = await sb('v_hq_employees_v1', 'select=*&order=active.desc,name.asc', 100); } catch (_) {}
  if (!rows || !rows.length) { host.innerHTML = '<p style="color:var(--mu,#6b7280);font-size:12px;padding:8px 12px">No employee status yet (needs gateway v85).</p>'; return; }
  const C = { red: '#dc2626', amber: '#d97706', green: '#059669' };
  const ago = iso => { if (!iso) return 'never'; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 60 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const n = { red: 0, amber: 0, green: 0 }; rows.forEach(r => { if (n[r.light] != null) n[r.light]++; });
  host.innerHTML = `<div id="agents-companions" style="padding:0 12px 10px"></div><div style="display:flex;gap:10px;align-items:center;padding:0 12px 8px;flex-wrap:wrap">
      <span style="font-weight:800;font-size:15px">🤖 Digital employees · ${rows.length}</span>
      <span style="font-size:12px;color:${C.red};font-weight:700">● ${n.red} red</span><span style="font-size:12px;color:${C.amber};font-weight:700">● ${n.amber} amber</span><span style="font-size:12px;color:${C.green};font-weight:700">● ${n.green} green</span>
      <span style="font-size:11px;color:var(--mu,#6b7280)">Tap a row to open its chat. Decisions are made in the Chat tab; this is the roll call.</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px;padding:0 12px">${rows.map(r => `
      <div data-agent="${esc(r.id)}" style="padding:10px 12px;border-radius:10px;border:1px solid ${C[r.light] || '#e5e7eb'};border-left-width:5px;background:#fff;cursor:pointer">
        <div style="display:flex;align-items:center;gap:6px"><span style="font-weight:800;font-size:13px;flex:1">${esc(r.name)}</span>
          <span style="font-size:10px;padding:0 6px;border-radius:999px;border:1px solid #e5e7eb;color:#6b7280">${esc(r.permission)}</span>
          ${Number(r.open_questions) ? `<span style="font-size:10px;padding:0 6px;border-radius:999px;background:#fde68a;color:#92400e;font-weight:800">${r.open_questions}❓</span>` : ''}
          ${!r.active ? '<span style="font-size:10px;color:#9ca3af">off</span>' : ''}</div>
        <div style="font-size:11px;color:var(--mu,#6b7280);margin-top:2px">${esc(r.job)}</div>
        <div style="font-size:11px;margin-top:4px">seen ${esc(ago(r.last_seen))} · ${r.runs_24h} runs / ${r.fails_24h} failed in 24 h</div>
        ${r.reason ? `<div style="font-size:11px;color:${C[r.light] || '#6b7280'};font-weight:700;margin-top:2px">${esc(r.reason)}</div>` : ''}
        ${r.last_summary ? `<div style="font-size:11px;color:var(--mu,#6b7280);margin-top:2px">${esc(r.last_summary)}</div>` : ''}
        ${r.last_error ? `<div style="font-size:11px;color:#b91c1c;margin-top:2px">${esc(r.last_error).slice(0, 160)}</div>` : ''}
      </div>`).join('')}</div>`;
  host.querySelectorAll('[data-agent]').forEach(el => el.onclick = () => { window.showP('employees', null); setTimeout(() => { if (typeof window.employeesOpenThread === 'function') window.employeesOpenThread(el.dataset.agent); }, 300); });
  companionsCard();
};

/* ── Employees → Agents: companions card (2026-11-20, companions framework). Reads hq_companion_status (switches, the
   routine key's dates — never the key — and the last Claude note). "New routine key" calls hq_companion_key_new: the key
   is shown ONCE here, inline, and the previous key stops working at that moment. Both RPCs: admin gateway only. ── */
async function companionsCard(justIssued){
  const box = document.getElementById('agents-companions'); if (!box) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const day = iso => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
  const ago = iso => { if (!iso) return 'never'; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 60 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const rpc = async (fn, body) => { const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { ...HDR, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; };
  let st;
  try { st = await rpc('hq_companion_status'); }
  catch (e) { box.innerHTML = `<div style="font-size:11px;color:var(--mu,#6b7280)">Companions: status not reachable (${esc(e.message)}) — needs gateway v87.</div>`; return; }
  const SW = { on: ['#059669', 'on — links exact matches, asks the rest (max 10/day)'], watch: ['#d97706', 'watch — findings only, no links, no questions'], off: ['#9ca3af', 'off — nothing runs'] };
  const [swC, swW] = SW[st.name_matcher] || SW.off;
  const k = st.key, daysLeft = k ? Math.floor((new Date(k.expires_at) - Date.now()) / 86400000) : null;
  const keyLine = !k ? '<span style="color:#b45309;font-weight:700">no key — the morning routine cannot write notes</span>'
    : `<span style="color:${daysLeft < 14 ? '#b45309' : '#059669'};font-weight:700">active</span> · expires ${esc(day(k.expires_at))} (${daysLeft} d) · last used ${esc(ago(k.last_used))}`;
  const row = (label, val) => `<div style="display:flex;gap:8px;font-size:12px;margin-top:3px"><span style="width:118px;flex:0 0 118px;color:var(--mu,#6b7280)">${label}</span><span style="flex:1">${val}</span></div>`;
  box.innerHTML = `<div style="padding:10px 12px;border-radius:10px;border:1px solid #ddd6fe;background:#faf5ff">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-weight:800;font-size:13px">✦ Companions</span>
        <span style="font-size:11px;color:var(--mu,#6b7280);flex:1">the morning routine that writes notes into the agents' chats</span>
        <button id="cmp-key-btn" style="padding:4px 12px;border:1px solid #c4b5fd;border-radius:7px;background:#fff;color:#6d28d9;font-weight:700;font-size:12px;cursor:pointer">🔑 ${k ? 'Replace routine key' : 'New routine key'}</button></div>
      ${row('🔗 Name matcher', `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${swC};margin-right:5px"></span>${esc(swW)}`)}
      ${row('Notes written by', st.companion_model === 'claude' ? 'Claude routine (scheduled)' : esc('API worker (' + (st.companion_model || '?') + ') — the routine is refused'))}
      ${row('Routine key', keyLine)}
      ${row('Last Claude note', st.last_note_at ? esc(ago(st.last_note_at)) : 'none yet')}
      <div id="cmp-key-new" style="${justIssued ? '' : 'display:none;'}margin-top:8px;padding:8px 10px;border-radius:8px;background:#fff;border:1px dashed #7c3aed">
        <div style="font-size:11px;font-weight:700;color:#6d28d9">New key — shown once. Paste it into the companion routine's settings as HQ_COMPANION_KEY. The old key stopped working.</div>
        <div style="display:flex;gap:6px;margin-top:5px"><input id="cmp-key-val" readonly value="${esc(justIssued || '')}" style="flex:1;min-width:0;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-family:monospace;font-size:12px">
          <button id="cmp-key-copy" style="padding:4px 10px;border:1px solid #c7d2fe;border-radius:6px;background:#fff;color:#1B6BE0;font-weight:700;font-size:12px;cursor:pointer">📋 Copy</button></div></div>
      <div id="cmp-key-err" style="display:none;margin-top:6px;font-size:12px;color:#b91c1c;font-weight:700"></div>
    </div>`;
  const btn = document.getElementById('cmp-key-btn');
  let armed = false, t = null;
  btn.onclick = async () => {
    // replacing a working key breaks the routine until the new one is pasted in: second tap confirms (no pop-up)
    if (k && !armed) { armed = true; btn.textContent = 'Tap again to replace — the old key stops working'; btn.style.background = '#fef3c7'; t = setTimeout(() => { armed = false; btn.textContent = '🔑 Replace routine key'; btn.style.background = '#fff'; }, 5000); return; }
    clearTimeout(t); btn.disabled = true; btn.textContent = 'Issuing…';
    try { const j = await rpc('hq_companion_key_new', { p_days: 90, p_label: 'companion routine' }); companionsCard(j.token); }
    catch (e) { const er = document.getElementById('cmp-key-err'); er.textContent = 'Could not issue a key: ' + e.message; er.style.display = 'block'; btn.disabled = false; btn.textContent = '🔑 Try again'; }
  };
  const cp = document.getElementById('cmp-key-copy');
  if (cp) cp.onclick = async () => { const v = document.getElementById('cmp-key-val').value; try { await navigator.clipboard.writeText(v); } catch (e) { const i = document.getElementById('cmp-key-val'); i.select(); document.execCommand('copy'); } cp.textContent = '✓ Copied'; setTimeout(() => cp.textContent = '📋 Copy', 1500); };
}

/* ── Nav ticker (2026-11-19): rotates the employees' latest lines in the empty nav space ── */
(function(){
  let i = 0, items = [], timer = null;
  const ICON2 = { eod_harvest: '🧺 Harvest agent', supervisor: '🧑‍💼 Supervisor', job_dispatcher: '📋 Orders', gcash_autopay: '📷 GCash reader', spawn_remind: '📱 Texter', poller_dicayas: '📡 Dicayas poller', name_matcher: '🔗 Name matcher', audit_harvest: '🔎 Audit harvest', poller_dapitan: '📡 Dapitan poller', overdue: '🗓 Overdue', pullout: '📍 Pull-out', income_checker: '📈 Income checker', newly_installed: '🆕 Newly installed' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  function build(){
    const S = window.__empChatSummary || [];
    items = S.filter(x => x.last_text).map(x => ({ who: ICON2[x.employee_id] || ('🤖 ' + x.employee), text: String(x.last_text).split('\n').filter(Boolean).slice(0, 2).join(' · '), light: x.light, q: Number(x.open_questions || 0) }));
    const open = S.reduce((a, x) => a + Number(x.open_questions || 0), 0);
    const el = document.getElementById('nav-ticker'); if (!el) return;
    if (!items.length) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    const n = document.getElementById('nav-ticker-n'); n.textContent = open ? open + ' ❓' : 'all read'; n.style.display = 'inline-block';
    show();
  }
  function show(){
    if (!items.length) return;
    const it = items[i % items.length]; i++;
    const t = document.getElementById('nav-ticker-text'), w = document.getElementById('nav-ticker-who'), d = document.getElementById('nav-ticker-dot');
    if (!t) return;
    t.style.opacity = 0;
    setTimeout(() => { w.textContent = it.who; t.textContent = it.text; t.style.opacity = 1;
      const c = { red: '#D81E2C', amber: '#F5A623', green: '#0E8A5F' }[it.light] || '#1B6BE0'; d.style.background = c; d.style.boxShadow = '0 0 0 0 ' + c + '80'; }, 350);
  }
  window.navTickerRefresh = build;
  document.addEventListener('DOMContentLoaded', () => { setTimeout(build, 2500); timer = setInterval(show, 7000); setInterval(build, 60000); });
})();
