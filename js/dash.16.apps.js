// ══════════════════════════════════════════════════════════
// SPAWN TEXT + SPAWN FINANCE inside Vendo Monitor (2026-11-07)
// Both apps open as tabs here (the real apps in a frame, each with its own PIN), so nothing is kept twice.
// Spawn Text is loaded at start so it can watch for new customer texts: when one arrives it tells this page
// (postMessage, same site only) and a pop-up shows here whatever tab is open; tap it → the chat opens in the 💬 tab.
// A subscriber page's "💬 Open chat" asks Spawn Text to open that customer's chat.
// ══════════════════════════════════════════════════════════
(function(){
  // same site as Vendo Monitor: GitHub Pages, or raw.githack.com for the preview branch
  const onGithack = location.hostname === 'raw.githack.com';
  const URL_TEXT = onGithack ? '/SpawnInternet/spawn-finance/preview/remind.html' : '/spawn-finance/remind.html';
  const URL_FIN  = onGithack ? '/SpawnInternet/spawn-finance/preview/index.html' : '/spawn-finance/index.html';

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const textFrame = () => $('spawntext-frame');
  const textWin = () => { const f = textFrame(); return f && f.contentWindow; };

  // ── frames ──
  function loadText(){ const f = textFrame(); if (f && (!f.getAttribute('src') || f.getAttribute('src') === 'about:blank')) f.setAttribute('src', URL_TEXT); }
  function loadFin(){ const f = $('spawnfinance-frame'); if (f && (!f.getAttribute('src') || f.getAttribute('src') === 'about:blank')) f.setAttribute('src', URL_FIN); }
  window.spawnAppsShown = function(id){ if (id === 'spawntext') loadText(); if (id === 'spawnfinance') loadFin(); };

  function openTextTab(){
    const b = document.querySelector('[data-panel="spawntext"]');
    if (typeof window.showP === 'function') window.showP('spawntext', b);
    loadText();
  }
  // ask Spawn Text to open a chat (it waits for its PIN by itself if it is still locked)
  function tell(msg){
    const w = textWin(); if (!w) return;
    const send = () => { try { w.postMessage(msg, location.origin); } catch (e) {} };
    const f = textFrame();
    if (f && f.__ready) send(); else { (f.__queue = f.__queue || []).push(msg); }
  }
  window.spawnOpenChat = function(sub){ openTextTab(); tell({ type:'spawntext:openSub', sub:Number(sub) }); };
  // 🔍 GCash review → Spawn Text's 💳 GCash › 🔍 Review, where decisions are made with the PIN (2026-11-09)
  window.spawnOpenReview = function(){ openTextTab(); tell({ type:'spawntext:openReview' }); };

  // ── pop-ups ──
  let unread = 0;
  function badge(){
    const b = document.querySelector('[data-panel="spawntext"] .nl'); if (!b) return;
    b.innerHTML = '💬 Spawn Text' + (unread ? ` <span style="background:#dc2626;color:#fff;border-radius:999px;padding:0 6px;font-size:10px;font-weight:800">${unread}</span>` : '');
  }
  function toastHost(){
    let h = $('st-popups');
    if (!h) { h = document.createElement('div'); h.id = 'st-popups';
      h.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:30000;display:flex;flex-direction:column;gap:8px;max-width:340px;font-family:Inter,system-ui,sans-serif';
      document.body.appendChild(h); }
    return h;
  }
  function popup(rows){
    const textOpen = $('panel-spawntext') && $('panel-spawntext').classList.contains('active');
    if (textOpen && !document.hidden) return;   // already looking at Spawn Text
    const h = toastHost();
    rows.slice(0, 3).forEach(r => {
      const el = document.createElement('div');
      el.style.cssText = 'background:#fff;border:1px solid #dbeafe;border-left:4px solid #025ac6;border-radius:12px;padding:10px 12px;box-shadow:0 10px 30px rgba(15,23,42,.18);cursor:pointer';
      el.innerHTML = `<div style="display:flex;gap:8px;align-items:center"><b style="font-size:13px;color:#0146a0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">💬 ${esc(r.name || 'New text')}</b>`
        + `<button type="button" aria-label="Close" style="border:0;background:none;color:#94a3b8;font-size:15px;cursor:pointer">✕</button></div>`
        + `<div style="font-size:12.5px;color:#334155;margin-top:3px;max-height:3.9em;overflow:hidden">${esc(r.body || '')}</div>`
        + `<div style="font-size:11px;color:#025ac6;font-weight:700;margin-top:5px">Tap to open the chat</div>`;
      el.querySelector('button').onclick = ev => { ev.stopPropagation(); el.remove(); };
      el.onclick = () => { el.remove(); openTextTab(); if (r.from) tell({ type:'spawntext:open', address:r.from }); };
      h.appendChild(el);
      setTimeout(() => el.remove(), 20000);
    });
    if (rows.length > 3) {
      const more = document.createElement('div');
      more.style.cssText = 'background:#025ac6;color:#fff;border-radius:12px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;text-align:center';
      more.textContent = `+${rows.length - 3} more new texts — open Spawn Text`;
      more.onclick = () => { more.remove(); openTextTab(); };
      h.appendChild(more); setTimeout(() => more.remove(), 20000);
    }
  }

  // ── messages from the Spawn Text frame (same site, that frame only) ──
  window.addEventListener('message', e => {
    const f = textFrame();
    if (e.origin !== location.origin || !f || e.source !== f.contentWindow) return;
    const d = e.data || {};
    if (d.type === 'spawntext:ready') { f.__ready = true; (f.__queue || []).splice(0).forEach(m => { try { f.contentWindow.postMessage(m, location.origin); } catch (x) {} }); }
    else if (d.type === 'spawntext:new' && Array.isArray(d.rows)) popup(d.rows);
    else if (d.type === 'spawntext:unread') { unread = Math.max(0, Number(d.n) || 0); badge(); }
    else if (d.type === 'spawntext:nochat') { popupInfo('No texts with this customer yet in Spawn Text.'); }
    else if (d.type === 'spawntext:subpage' && d.sub && typeof window.subDetail === 'function') window.subDetail(Number(d.sub));
  });
  function popupInfo(t){
    const h = toastHost(), el = document.createElement('div');
    el.style.cssText = 'background:#0f172a;color:#fff;border-radius:12px;padding:9px 12px;font-size:12.5px';
    el.textContent = t; h.appendChild(el); setTimeout(() => el.remove(), 5000);
  }

  // start Spawn Text in the background so new texts pop up here (it shows its PIN pad until someone logs in)
  function start(){ loadText(); badge(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
