/* 🧾 Needs you (2026-11-24) — one ranked queue of every open question and red light the digital employees are waiting on.
   Reads v_hq_switches_v1 (is the queue on?), v_hq_needs_you_v1 (the rows) and v_hq_needs_you_summary_v1 (N shown, M waiting)
   through the admin gateway (v91). Every button calls the SAME handler the chat uses (window.employeesChatActions, dash.19),
   so a decision here is byte-for-byte a decision in the chat. Switch spawn_settings.hq_needs_you: off = the sub-tab is
   removed and nothing is read. Spec: brain repo docs/superpowers/specs/2026-11-24-needs-you-queue-design.md */
(function(){
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const GROUPS = [
    { key: 'money',    title: '💰 MONEY',          match: r => r.item === 'q' && r.rank === 1 },
    { key: 'lights',   title: '🔴 RED LIGHTS',     match: r => r.item === 'light' },
    { key: 'identity', title: '🆕 VENDO IDENTITY', match: r => r.item === 'q' && r.rank === 3 },
    { key: 'doubts',   title: '🔎 HARVEST DOUBTS', match: r => r.item === 'q' && r.rank === 4 },
    { key: 'other',    title: '🔗 OTHER',          match: r => r.item === 'q' },
  ];
  const icon = id => ((window.employeesChatActions || {}).ICON || {})[id] || '🤖';
  const ago = iso => {
    if (!iso) return '';
    const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
    return m < 60 ? m + ' min' : m < 1440 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' d';
  };
  const firstLines = (t, n) => String(t || '').split('\n').filter(Boolean).slice(0, n).join('\n');
  const to12 = t => window.spawnTo12h ? spawnTo12h(t) : t;

  /* ── pure builders (unit-tested in tests/needsyou/build.test.mjs) ── */
  function tabVisible(switchRows){
    const r = (switchRows || []).find(x => x && x.key === 'hq_needs_you');
    return !!r && String(r.value || '').trim().toLowerCase() === 'on';
  }
  function buildGroups(rows){
    const out = [];
    const left = (rows || []).slice();
    for (const g of GROUPS) {
      const mine = left.filter(g.match);
      if (!mine.length) continue;
      mine.forEach(r => left.splice(left.indexOf(r), 1));
      out.push({ key: g.key, title: g.title, rows: mine });
    }
    return out;
  }
  function rowHtml(r){
    const head = `<span style="font-weight:800">${icon(r.employee_id)} ${esc(r.employee || r.employee_id)}</span>` +
                 `<span style="color:var(--mu,#6b7280);font-size:11px"> · ${r.item === 'light' ? 'since ' : ''}${esc(ago(r.at))}</span>`;
    if (r.item === 'light') {
      const F = (window.SPAWN_FIX || {})[r.employee_id];
      const panel = F ? F.panel : 'agents', sub = F && F.sub ? F.sub : '';
      const label = F ? F.label : '🤖 Open Agents';
      return `<div data-row="light:${esc(r.employee_id)}" style="padding:8px 12px;border-bottom:1px solid var(--line,#e5e7eb);display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:240px">${head}<div style="font-size:13px;margin-top:2px;white-space:pre-wrap">${esc(r.text)}</div></div>
        <div style="font-size:12px;display:flex;gap:10px;align-items:center;white-space:nowrap">
          <a href="#" data-fix="${esc(panel)}" data-fixsub="${esc(sub)}" style="color:#1B6BE0;text-decoration:none;font-weight:700">${esc(label)} ›</a>
          <a href="#" data-fixwin="${esc(panel)}" data-fixsub="${esc(sub)}" title="Open in a new window" style="color:#1B6BE0;text-decoration:none">↗</a></div></div>`;
    }
    const btns = (r.options || []).map(o => `<button data-ans="${esc(o.v)}" data-id="${r.msg_id}" style="padding:4px 10px;border:1px solid #c4b5fd;border-radius:7px;background:#fff;color:#5b21b6;font-size:12px;font-weight:700;cursor:pointer">${esc(o.label)}</button>`).join(' ');
    const free = r.free_text ? `<input data-free="${r.msg_id}" placeholder="or type the vendo…" style="padding:4px 8px;border:1px solid var(--bd,#e5e7eb);border-radius:7px;font-size:12px;min-width:160px">` : '';
    return `<div data-row="q:${r.msg_id}" style="padding:8px 12px;border-bottom:1px solid var(--line,#e5e7eb)${r.rank === 1 ? ';background:#fffbeb' : ''}">
      <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">${head}
        <a href="#" data-thread="${esc(r.employee_id)}" style="margin-left:auto;font-size:11px;color:#7c3aed;text-decoration:none;font-weight:700">Open thread ›</a></div>
      <div title="${esc(r.text)}" style="font-size:13px;margin-top:2px;white-space:pre-wrap;word-break:break-word">${esc(to12(firstLines(r.text, 2)))}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center">${btns}${free}</div></div>`;
  }
  function summaryLine(summary){
    return (summary || []).filter(s => Number(s.hidden_by_cap) > 0)
      .map(s => `${esc(s.employee)}: ${Number(s.in_queue)} shown, ${Number(s.hidden_by_cap)} waiting`).join(' · ');
  }

  /* ── panel wiring ── */
  let rows = [], timer = null, busyRefresh = false;
  const host = () => document.getElementById('needsyou-host');
  function showTab(on){
    // the sub-bar (dash.19 render) filters the tab by window.__hqSwitches; re-render it so the change shows at once
    const act = document.querySelector('.panel.active');
    if (act && typeof window.subnavRender === 'function') window.subnavRender(act.id.replace('panel-', ''));
    if (!on && act && act.id === 'panel-needsyou' && typeof window.showP === 'function') window.showP('employees', null);
  }
  function badge(n){
    const nb = document.getElementById('nav-needsyou'); if (!nb) return;
    let s = nb.querySelector('.nbadge'); if (!s) { s = document.createElement('span'); s.className = 'nbadge'; nb.appendChild(s); }
    s.textContent = n ? String(n) : ''; s.style.display = n ? 'block' : 'none';   // the sub-bar copies .nbadge on render
  }
  function notice(msg){
    const n = document.getElementById('needsyou-notice'); if (!n) return;
    n.textContent = msg || ''; n.style.display = msg ? 'block' : 'none';
    clearTimeout(notice.t); if (msg) notice.t = setTimeout(() => { n.style.display = 'none'; }, 6000);
  }
  function ctxFor(rowEl){
    return { after: ok => { if (ok && rowEl) rowEl.remove(); refresh(); }, notice };
  }
  function render(groups, summary){
    const h = host(); if (!h) return;
    const total = groups.reduce((a, g) => a + g.rows.length, 0);
    const sl = summaryLine(summary);
    h.innerHTML = `<div style="padding:8px 12px;border-bottom:1px solid var(--line,#e5e7eb);display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12px">
        <span style="font-weight:800;font-size:14px">🧾 Needs you · ${total} item${total === 1 ? '' : 's'}</span>
        <span style="color:var(--mu,#6b7280)">${sl}</span></div>
      <div id="needsyou-notice" style="display:none;margin:8px 12px;padding:5px 10px;border-radius:7px;background:#fef2f2;color:#b91c1c;font-size:12px;font-weight:700"></div>` +
      (total ? groups.map(g => `<div style="padding:8px 12px 2px;font-size:11px;font-weight:800;color:var(--mu,#6b7280);letter-spacing:.04em">${g.title} (${g.rows.length})</div>${g.rows.map(rowHtml).join('')}`).join('')
             : '<div style="padding:24px 12px;color:var(--mu,#6b7280);font-size:13px">Nothing needs you 🎉</div>');
    const A = window.employeesChatActions || {};
    h.querySelectorAll('[data-ans]').forEach(b => b.onclick = () => {
      const m = rows.find(r => r.item === 'q' && Number(r.msg_id) === Number(b.dataset.id)); if (!m) return;
      const rowEl = b.closest('[data-row]'); const ctx = ctxFor(rowEl); const mm = { id: m.msg_id, topic: m.topic, text: m.text };
      const freeVal = (h.querySelector(`[data-free="${m.msg_id}"]`) || {}).value || '';
      return m.topic === 'audit_money' ? A.decide(mm, b.dataset.ans, b.textContent, ctx)
        : m.topic === 'pullout' ? A.pullout(mm, b.dataset.ans, ctx)
        : m.topic === 'newvendo' ? A.newvendo(mm, b.dataset.ans, ctx)
        : A.answer(Number(m.msg_id), b.dataset.ans, freeVal, ctx);
    });
    h.querySelectorAll('[data-free]').forEach(i => i.onkeydown = e => {
      if (e.key !== 'Enter' || !i.value.trim()) return;
      const rowEl = i.closest('[data-row]'); A.answer(Number(i.dataset.free), '', i.value.trim(), ctxFor(rowEl));
    });
    h.querySelectorAll('[data-thread]').forEach(a => a.onclick = e => { e.preventDefault(); window.showP('employees', null); setTimeout(() => { if (window.employeesOpenThread) window.employeesOpenThread(a.dataset.thread); }, 300); });
    h.querySelectorAll('[data-fix]').forEach(a => a.onclick = e => { e.preventDefault(); if (window.spawnOpenPanel) spawnOpenPanel(a.dataset.fix, a.dataset.fixsub || undefined); else window.showP(a.dataset.fix, null); });
    h.querySelectorAll('[data-fixwin]').forEach(a => a.onclick = e => { e.preventDefault(); if (window.spawnOpenNewWindow) spawnOpenNewWindow(a.dataset.fixwin, a.dataset.fixsub || undefined); });
  }
  /* like sb() in dash.4.map.js (the core fetch interceptor routes /rest/v1/* through the admin gateway), but keeps the
     HTTP status so "gateway not yet v91" (403 table not allowed) can be told apart from an empty queue */
  async function read(table, params, limit){
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${table}?${params}&limit=${limit}`, { headers: HDR, signal: AbortSignal.timeout(12000) });
      const rows = r.ok ? await r.json() : [];
      return { rows: Array.isArray(rows) ? rows : [], status: r.status };
    } catch (_) { return { rows: [], status: 0 }; }
  }
  async function refresh(){
    if (busyRefresh) return; busyRefresh = true;
    try {
      const sw = await read('v_hq_switches_v1', 'select=key,value', 50);
      window.__hqSwitches = {}; sw.rows.forEach(s => { window.__hqSwitches[s.key] = s.value; });
      const on = tabVisible(sw.rows);
      showTab(on);                                   // switches view not allowed (gateway < v91) → [] → tab hidden, silently
      if (!on) { rows = []; badge(0); return; }
      const [q, s] = await Promise.all([
        read('v_hq_needs_you_v1', 'select=*&order=rank,at', 1000),
        read('v_hq_needs_you_summary_v1', 'select=*', 100),
      ]);
      rows = q.rows;
      badge(rows.length);
      const h = host();
      if (q.status === 403 && h) { h.innerHTML = '<div style="padding:24px 12px;color:var(--mu,#6b7280);font-size:13px">Needs the gateway update (v91).</div>'; return; }
      render(buildGroups(rows), s.rows);
    } finally { busyRefresh = false; }
  }
  window.needsYou = { tabVisible, buildGroups, rowHtml, summaryLine, refresh };
  window.needsYouTabShown = function(){
    refresh();
    clearInterval(timer);
    timer = setInterval(() => { const p = document.getElementById('panel-needsyou'); if (p && p.classList.contains('active') && document.visibilityState === 'visible') refresh(); }, 60000);
  };
  document.addEventListener('DOMContentLoaded', () => { setTimeout(refresh, 1200); });
})();
