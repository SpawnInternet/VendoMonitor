/* 🔗 SpawnFi link widget (2026-11-27, SpawnFi everywhere). ONE place to link / move / unlink a SpawnFi line (router + VLAN)
   to a vendo, opened from the SpawnFi tab, the Recon flag cell, the vendo card and the Name-matcher question.
   Switch spawn_settings.hq_link_widget (window.__hqSwitches, set by dash.23): off = nothing mounts, open() does nothing.
   Write: ONE gateway RPC, hq_spawnfi_link_apply_v2 (definer; logs hq.actions; re-tags the line's sales) — gateway v92.
   Reads: v_spawnfi_sales_v1 (the line), vendos (the picker). Admin password asked first, as Link Doctor does.
   Spec: brain docs/superpowers/specs/2026-11-26-spawnfi-everywhere-design.md §7.3 */
(function(){
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 });
  const SBU = () => window.SB_URL || window.__SPAWN_SB || 'https://cviraqfhphhsonjmrtvu.supabase.co';
  const hdr = () => Object.assign({}, window.HDR || {}, { 'Content-Type': 'application/json' });
  const enabled = () => !!(window.__hqSwitches && String(window.__hqSwitches.hq_link_widget || '').trim().toLowerCase() === 'on');

  /* ── pure parts (tests/spawnfi/link.test.mjs) ── */
  function payload(st){
    return { p_router: st.router, p_vlan: Number(st.vlan), p_vendo: st.vendo_id == null ? null : Number(st.vendo_id),
             p_by: 'dashboard: ' + (st.user || 'admin'), p_switch_date: st.switch_date || null, p_msg: st.msg == null ? null : st.msg };
  }
  function needsConfirm(st){ return st.current_vendo_id != null && st.vendo_id != null && Number(st.current_vendo_id) !== Number(st.vendo_id); }
  function defaultSwitchDate(iso){
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
  /* the Name matcher's question always starts "SpawnFi <router> · VLAN <n> · panel name …" */
  function fromQuestionText(t){ const m = /^SpawnFi\s+(\S+)\s+·\s+VLAN\s+(\d+)/.exec(String(t || '').trim()); return m ? { router: m[1], vlan: Number(m[2]) } : null; }
  function user(){ try { return (JSON.parse(localStorage.getItem('spawn_admin_auth') || 'null') || {}).user || window.__ADMIN_USER || 'admin'; } catch (_) { return 'admin'; } }

  /* ── data ── */
  async function getJson(path){
    const r = await fetch(`${SBU()}/rest/v1/${path}`, { headers: hdr() });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  const lineQ = (router, vlan) => `v_spawnfi_sales_v1?router_name=eq.${encodeURIComponent(router)}&vlan=eq.${Number(vlan)}&select=*&limit=1`;
  async function searchVendos(q){
    q = String(q || '').trim(); if (!q) return [];
    const e = encodeURIComponent('*' + q + '*');
    let f = `or=(sheet_name.ilike.${e},owner_name.ilike.${e},tg_name.ilike.${e},vendo_code.ilike.${e},area.ilike.${e})`;
    if (/^\d+$/.test(q)) f = `or=(vlan.eq.${q},id.eq.${q},sheet_name.ilike.${e},owner_name.ilike.${e},tg_name.ilike.${e},vendo_code.ilike.${e})`;
    return getJson(`vendos?select=id,vendo_code,sheet_name,owner_name,tg_name,area,vlan&status=eq.active&${f}&order=sheet_name.asc&limit=20`);
  }
  async function searchLines(q){
    q = String(q || '').trim();
    const e = encodeURIComponent('*' + q + '*');
    const f = !q ? 'link_status=neq.linked' : /^\d+$/.test(q) ? `vlan=eq.${q}` : `site_name.ilike.${e}`;
    return getJson(`v_spawnfi_sales_v1?select=router_name,vlan,site_name,link_status,vendo_id,vendo_name,d30_pesos,last_sale&${f}&order=link_status.desc,d30_pesos.desc.nullslast&limit=20`);
  }
  let pwOk = false;   // asked once per page load, as Link Doctor's flow does
  async function gate(){
    if (pwOk) return true;
    if (typeof window.askAdminPw !== 'function') return true;        // no prompt available → the gateway login is the gate
    const pw = await window.askAdminPw('Enter admin password to change a SpawnFi link.');
    if (pw === null) return false;
    if (typeof window.spawnAdminPwOk === 'function' && !window.spawnAdminPwOk(pw)) { if (typeof window.toast === 'function') window.toast('Wrong password'); return false; }
    pwOk = true; return true;
  }
  async function apply(st){
    const r = await fetch(`${SBU()}/rest/v1/rpc/hq_spawnfi_link_apply_v2`, { method: 'POST', headers: hdr(), body: JSON.stringify(payload(st)) });
    let j = null; try { j = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error((j && (j.message || j.error)) || ('HTTP ' + r.status));
    if (!j || j.ok !== true) throw new Error((j && j.error) || 'The link was not saved');
    return j;
  }

  /* ── modal ── */
  const S = { el: null, st: null, picked: null, line: null, mode: 'vendo', from: '' };
  function close(){ if (S.el) S.el.remove(); S.el = null; S.st = null; S.picked = null; S.line = null; }
  function tm(t){ return t ? new Date(t).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—'; }
  function lineHead(l){
    if (!l) return '<div style="color:#6b7280;font-size:12px">No SpawnFi line chosen yet.</div>';
    const cur = l.link_status === 'linked' && l.vendo_id != null
      ? `<span style="color:#0E8A5F;font-weight:700">✓ linked to #${esc(l.vendo_id)} ${esc(l.vendo_name || '')}</span>`
      : '<span style="color:#b45309;font-weight:700">not linked</span>';
    return `<div style="font-weight:800;font-size:14px;color:#1a2250;word-break:break-word">${esc(l.site_name || ('VLAN ' + l.vlan))}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px">${esc(l.router_name)} · VLAN <b>${esc(l.vlan)}</b> · 30 d ${peso(l.d30_pesos)} · last sale ${esc(tm(l.last_sale))}</div>
      <div style="font-size:12px;margin-top:4px">${cur}</div>`;
  }
  function vendoRow(v, on){
    const nm = v.sheet_name || v.tg_name || v.owner_name || ('#' + v.id);
    const bits = [v.area || null, v.vlan ? 'VLAN ' + v.vlan : null, v.vendo_code || null, (v.tg_name && v.tg_name !== nm) ? 'TG ' + v.tg_name : null].filter(Boolean).join(' · ');
    return `<div data-pick="${Number(v.id)}" style="padding:7px 10px;border-radius:9px;cursor:pointer;border:1px solid ${on ? '#311A8E' : '#e5e7eb'};background:${on ? '#f3f0ff' : '#fff'}">
      <div style="font-weight:700;font-size:13px">${esc(nm)} <span style="color:#9ca3af;font-weight:400">#${Number(v.id)}</span></div><div style="font-size:11px;color:#6b7280">${esc(bits)}</div></div>`;
  }
  function lineRow(l, on){
    return `<div data-pickline="${esc(l.router_name)}|${Number(l.vlan)}" style="padding:7px 10px;border-radius:9px;cursor:pointer;border:1px solid ${on ? '#311A8E' : '#e5e7eb'};background:${on ? '#f3f0ff' : '#fff'}">
      <div style="font-weight:700;font-size:13px">${esc(l.site_name || ('VLAN ' + l.vlan))}</div>
      <div style="font-size:11px;color:#6b7280">${esc(l.router_name)} · VLAN ${Number(l.vlan)} · 30 d ${peso(l.d30_pesos)} · ${l.link_status === 'linked' ? 'linked to #' + esc(l.vendo_id) + ' ' + esc(l.vendo_name || '') : 'not linked'}</div></div>`;
  }
  function render(){
    if (!S.el) return;
    const st = S.st, l = S.line;
    const canLink = !!(l && S.picked && S.picked.id != null);
    const canUnlink = !!(l && l.link_status === 'linked' && l.vendo_id != null);
    const box = S.el.querySelector('#sfl-box');
    box.innerHTML = `
      <div style="background:linear-gradient(130deg,#311A8E 0%,#1e3cb8 60%,#025AC6 100%);padding:14px 18px;color:#fff;display:flex;align-items:center;gap:9px">
        <span style="font-size:16px;font-weight:900">⚡ SpawnFi line → vendo</span><span style="flex:1"></span>
        <button id="sfl-x" style="background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:8px;width:30px;height:30px;font-size:16px;cursor:pointer">✕</button></div>
      <div style="padding:14px 18px;display:grid;gap:12px">
        <div id="sfl-line" style="background:#f8f7ff;border:1px solid #e4e0f7;border-radius:11px;padding:10px 12px">${lineHead(l)}</div>
        ${S.mode === 'line' ? `
        <div><div style="font-size:11px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Which SpawnFi line belongs to this vendo?</div>
          <input id="sfl-q" placeholder="panel site name or VLAN… (empty = not-linked lines)" style="width:100%;padding:9px 11px;border:1.5px solid #e2e8f6;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box">
          <div id="sfl-res" style="display:grid;gap:5px;margin-top:7px;max-height:220px;overflow:auto"></div></div>` : `
        <div><div style="font-size:11px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Vendo (ours)</div>
          <input id="sfl-q" placeholder="search name, owner, code, VLAN or area…" value="${esc(st.q || '')}" style="width:100%;padding:9px 11px;border:1.5px solid #e2e8f6;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box">
          <div id="sfl-res" style="display:grid;gap:5px;margin-top:7px;max-height:220px;overflow:auto"></div></div>`}
        <div id="sfl-picked" style="font-size:12px;color:#1a2250">${S.picked ? `Chosen: <b>${esc(S.picked.sheet_name || S.picked.tg_name || S.picked.owner_name || '')}</b> <span style="color:#9ca3af">#${Number(S.picked.id)}</span>` : '<span style="color:#9ca3af">Nothing chosen yet.</span>'}</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <label style="font-size:12px;color:#374151;font-weight:700">Count sales from</label>
          <input id="sfl-date" type="date" value="${esc(st.switch_date || '')}" style="padding:7px 9px;border:1.5px solid #e2e8f6;border-radius:9px;font-size:13px;font-family:inherit">
          <span style="font-size:11px;color:#6b7280">empty = every sale on this line counts for the vendo</span></div>
        <div id="sfl-err" style="display:none;color:#DF1A35;font-size:12px;font-weight:700"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button id="sfl-cancel" style="padding:9px 14px;background:#fff;color:#6b7280;border:1.5px solid #e2e8f6;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit">Cancel</button>
          ${canUnlink ? '<button id="sfl-unlink" style="padding:9px 14px;background:#fff;color:#DF1A35;border:1.5px solid #fecaca;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit">Unlink</button>' : ''}
          <button id="sfl-link" ${canLink ? '' : 'disabled'} style="padding:9px 16px;background:${canLink ? 'linear-gradient(135deg,#311A8E,#1e3cb8)' : '#c7cedb'};color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:900;cursor:${canLink ? 'pointer' : 'default'};font-family:inherit">${l && l.link_status === 'linked' && S.picked && Number(l.vendo_id) !== Number(S.picked.id) ? 'Move link' : 'Link'}</button></div>
      </div>`;
    box.querySelector('#sfl-x').onclick = close; box.querySelector('#sfl-cancel').onclick = close;
    const q = box.querySelector('#sfl-q'); let t = null;
    const run = async () => { st.q = q.value; try { const rows = S.mode === 'line' ? await searchLines(q.value) : await searchVendos(q.value); showRes(rows); } catch (e) { showErr(e.message); } };
    q.oninput = () => { clearTimeout(t); t = setTimeout(run, 250); };
    if (S.mode === 'line' || st.q) run();
    box.querySelector('#sfl-date').onchange = e => { st.switch_date = e.target.value; };
    box.querySelector('#sfl-link').onclick = () => submit(false);
    const ub = box.querySelector('#sfl-unlink'); if (ub) ub.onclick = () => submit(true);
    setTimeout(() => { try { q.focus(); } catch (_) {} }, 50);
  }
  function showRes(rows){
    const res = S.el && S.el.querySelector('#sfl-res'); if (!res) return;
    if (!rows.length) { res.innerHTML = '<div style="font-size:12px;color:#9ca3af;padding:6px">No match.</div>'; return; }
    if (S.mode === 'line') {
      res.innerHTML = rows.map(l => lineRow(l, S.line && S.line.router_name === l.router_name && Number(S.line.vlan) === Number(l.vlan))).join('');
      res.querySelectorAll('[data-pickline]').forEach(el => el.onclick = () => { const [r, v] = el.dataset.pickline.split('|'); S.line = rows.find(x => x.router_name === r && Number(x.vlan) === Number(v)) || null; S.st.router = S.line.router_name; S.st.vlan = S.line.vlan; S.st.current_vendo_id = S.line.link_status === 'linked' ? S.line.vendo_id : null; render(); });
    } else {
      res.innerHTML = rows.map(v => vendoRow(v, S.picked && Number(S.picked.id) === Number(v.id))).join('');
      res.querySelectorAll('[data-pick]').forEach(el => el.onclick = () => { S.picked = rows.find(x => Number(x.id) === Number(el.dataset.pick)) || null; render(); });
    }
  }
  function showErr(m){ const e = S.el && S.el.querySelector('#sfl-err'); if (!e) return; e.textContent = m || ''; e.style.display = m ? 'block' : 'none'; }
  async function submit(unlink){
    const st = S.st, l = S.line; if (!l) { showErr('Choose a SpawnFi line first.'); return; }
    const next = { router: l.router_name, vlan: l.vlan, vendo_id: unlink ? null : S.picked.id, current_vendo_id: l.link_status === 'linked' ? l.vendo_id : null, switch_date: unlink ? null : (st.switch_date || null), user: user() };
    if (!unlink && needsConfirm(next)) {
      const nm = S.picked.sheet_name || S.picked.tg_name || S.picked.owner_name || ('#' + S.picked.id);
      const ok = typeof window.askConfirm === 'function'
        ? await window.askConfirm({ title: 'Move this SpawnFi line?', body: `Currently linked to <b>#${esc(l.vendo_id)} ${esc(l.vendo_name || '')}</b> — move it to <b>${esc(nm)}</b>? Its sales move with it.`, ok: 'Move', danger: true })
        : confirm('Currently linked to #' + l.vendo_id + ' ' + (l.vendo_name || '') + ' — move it?');
      if (!ok) return;
    }
    if (!(await gate())) return;
    showErr('');
    const b = S.el.querySelector(unlink ? '#sfl-unlink' : '#sfl-link'); if (b) { b.disabled = true; b.textContent = 'Saving…'; }
    try {
      const res = await apply(next);
      const done = api.onDone; close();
      if (typeof window.toast === 'function') window.toast(res.action === 'unlink' ? 'SpawnFi line unlinked' : res.action === 'move' ? 'SpawnFi line moved' : 'SpawnFi line linked');
      if (typeof done === 'function') { try { done(Object.assign({ from: S.from }, res)); } catch (_) {} }
      // the pages that show links refresh themselves: SpawnFi tab, vendo card line, Needs-you queue (the Name matcher's question stays
      // until the agent sees the link — it closes it on its next run); the Recon table picks the change up on the next 5-min snapshot
      if (typeof window.spawnfiTabShown === 'function' && document.getElementById('spawnfi-root') && document.getElementById('spawnfi-root').innerHTML) { try { window.spawnfiTabShown(); } catch (_) {} }
      const cardEl = document.getElementById('vp-sfline'); if (cardEl && window._vpVendo) { try { mountCard(window._vpVendo.id, cardEl); } catch (_) {} }
      if (S.from === 'needsyou' && typeof window.needsYouTabShown === 'function') { try { window.needsYouTabShown(); } catch (_) {} }
    } catch (e) { showErr(e.message || String(e)); if (b) { b.disabled = false; b.textContent = unlink ? 'Unlink' : 'Link'; } }
  }
  /* open({router, vlan, site_name?, vendo_id?, current_vendo_id?, from}) — with router+vlan: pick a vendo for that line;
     with only vendo_id: pick a line for that vendo (Recon "no source linked", vendo card). Returns false when the switch is off. */
  function open(o){
    if (!enabled()) return false;
    o = o || {}; close();
    S.from = o.from || ''; S.picked = null; S.line = null;
    S.mode = (o.router && o.vlan != null) || o.vlan != null ? 'vendo' : 'line';
    S.st = { router: o.router, vlan: o.vlan, current_vendo_id: o.current_vendo_id != null ? o.current_vendo_id : null, switch_date: o.switch_date || '', q: '' };
    const ov = document.createElement('div'); ov.id = 'sfl-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(4px);z-index:100005;display:flex;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif';
    ov.innerHTML = '<div id="sfl-box" style="background:#fff;border-radius:18px;max-width:520px;width:100%;box-shadow:0 30px 80px rgba(13,8,55,.45);overflow:hidden"></div>';
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.body.appendChild(ov); S.el = ov;
    (async () => {
      if (S.mode === 'vendo') {
        try {
          let rows = o.router ? await getJson(lineQ(o.router, o.vlan)) : await getJson(`v_spawnfi_sales_v1?vlan=eq.${Number(o.vlan)}&select=*&limit=5`);
          if (rows.length > 1) { S.mode = 'line'; S.line = null; render(); showRes(rows); return; }   // the same VLAN on several routers → choose the line
          S.line = rows[0] || { router_name: o.router, vlan: o.vlan, site_name: o.site_name, link_status: 'unknown', vendo_id: null };
          S.st.current_vendo_id = S.line.link_status === 'linked' ? S.line.vendo_id : null;
        } catch (e) { S.line = { router_name: o.router, vlan: o.vlan, site_name: o.site_name, link_status: 'unknown', vendo_id: null }; }
        if (o.vendo_id != null) { try { const v = await getJson(`vendos?id=eq.${Number(o.vendo_id)}&select=id,vendo_code,sheet_name,owner_name,tg_name,area,vlan&limit=1`); S.picked = v[0] || null; } catch (_) {} }
        render();
      } else {
        try { const v = await getJson(`vendos?id=eq.${Number(o.vendo_id)}&select=id,vendo_code,sheet_name,owner_name,tg_name,area,vlan&limit=1`); S.picked = v[0] || null; } catch (_) {}
        render();
      }
    })();
    return true;
  }
  /* small helpers for the mount points */
  function button(label, opts, style){
    if (!enabled()) return '';
    return `<a href="#" class="sfl-btn" data-sfl='${esc(JSON.stringify(opts))}' style="${style || 'color:#311A8E;font-weight:800;text-decoration:none;font-size:11px;white-space:nowrap'}" onclick="window.spawnLink.open(JSON.parse(this.dataset.sfl));return false;">${esc(label)}</a>`;
  }
  /* vendo card: the vendo's SpawnFi line(s) with Change / Unlink; el is the placeholder */
  async function mountCard(vendoId, el){
    if (!el || !enabled() || vendoId == null) return;
    let rows = [];
    try { rows = await getJson(`v_spawnfi_sales_v1?vendo_id=eq.${Number(vendoId)}&link_status=eq.linked&select=router_name,vlan,site_name,link_status,vendo_id,vendo_name,d30_pesos,last_sale&limit=5`); } catch (_) { rows = []; }
    const lines = rows.map(l => `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;margin-top:4px">
        <span style="font-weight:700;color:#311A8E">⚡ ${esc(l.site_name || ('VLAN ' + l.vlan))}</span><span style="color:#6b7280">${esc(l.router_name)} · VLAN ${Number(l.vlan)} · 30 d ${peso(l.d30_pesos)}</span>
        ${button('Change ›', { router: l.router_name, vlan: l.vlan, site_name: l.site_name, from: 'card' })}</div>`).join('');
    el.innerHTML = `<div style="background:#f8f7ff;border:1px solid #e4e0f7;border-radius:10px;padding:14px;margin-bottom:16px">
      <div style="font-size:10px;font-weight:700;color:#311A8E;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">⚡ SpawnFi line</div>
      ${lines || '<div style="font-size:12px;color:#9ca3af;font-style:italic">No SpawnFi line linked to this vendo</div>'}
      <div style="margin-top:6px">${button(lines ? '+ Link another line ›' : 'Link a SpawnFi line ›', { vendo_id: Number(vendoId), from: 'card' })}</div></div>`;
  }
  const api = { open, close, payload, needsConfirm, defaultSwitchDate, fromQuestionText, enabled, button, mountCard, onDone: null };
  window.spawnLink = api;
})();
