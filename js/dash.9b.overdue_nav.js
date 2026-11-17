/* dash.9b.overdue_nav.js — Overdue popup v2 (loads AFTER dash.9.overdue.js and replaces its popup functions)
 *
 * What it changes, nothing else:
 *  • ‹ N of TOTAL › inside the popup, following the list exactly as filtered/sorted on screen
 *    (arrows, ← → keys, swipe on phones). Moving swaps the content in place — no close/reopen, no animation.
 *  • One-screen layout: wide popup with a fixed height; info + actions on the left, the app/book ledger on the
 *    right (only the ledger scrolls, inside its own box). On phones it stacks, the ledger shows the last 6 rows
 *    with "Show all" in place.
 *  • No in-between windows: no browser prompt/confirm boxes and no new tabs. Inactivate, Fix on router and
 *    photo→GPS confirm inline; map and photo show inside the popup.
 *  • Save & next ›. After Inactivate it moves straight to the vendo that took its place.
 *  • Closing highlights the last vendo you viewed in the table.
 * Remove this one <script> tag to go back to the old popup.
 */
(function(){
  'use strict';
  const BUILD = 'ovdn1117a';
  const esc = (s)=> (typeof _ovdEsc==='function') ? _ovdEsc(s) : String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nav = { ids: [], idx: -1, vid: null, open: false, media: 'map', showAll: false, map: null, pending: null };
  window._ovdNav = nav;

  function rowOf(vid){ return (_ovdRows||[]).find(x=>x.vendo_id===vid) || null; }
  function listIds(){
    const seen = new Set(), out = [];
    (_ovdVisible()||[]).forEach(r=>{ if(!seen.has(r.vendo_id)){ seen.add(r.vendo_id); out.push(r.vendo_id); } });
    return out;
  }
  function isWide(){ return window.matchMedia('(min-width: 860px)').matches; }

  // ── shell (built once) ───────────────────────────────────────────────────
  function shell(){
    let host = document.getElementById('ovd-hist');
    if(host && host.dataset.v2==='1') return host;
    if(host) host.remove();
    host = document.createElement('div'); host.id='ovd-hist'; host.dataset.v2='1';
    host.innerHTML = `
      <style>
        #ovdn-panel *{box-sizing:border-box}
        #ovdn-panel button{font-family:inherit;cursor:pointer}
        #ovdn-panel button:disabled{opacity:.35;cursor:default}
        #ovdn-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:0;flex:1;min-height:0}
        #ovdn-left{padding:12px 16px;overflow:auto;border-right:1px solid #eef2f7}
        #ovdn-right{padding:12px 16px;overflow:auto;min-height:0}
        .ovdn-navbtn{width:40px;height:36px;border-radius:9px;border:1px solid #dbe3ee;background:#fff;color:#025AC6;font-size:20px;font-weight:800;line-height:1}
        .ovdn-btn{padding:7px 12px;border-radius:8px;font-weight:800;font-size:12px;white-space:nowrap}
        .ovdn-in{font-family:inherit;font-size:12px;padding:7px 10px;border:1px solid #e5e7eb;border-radius:8px;min-width:0;width:100%}
        .ovdn-tab{padding:4px 11px;border-radius:999px;border:1px solid #e5e7eb;background:#fff;font-size:11px;font-weight:800;color:#6b7280}
        .ovdn-tab.on{background:#025AC6;border-color:#025AC6;color:#fff}
        @media (max-width:859px){
          #ovdn-panel{width:100vw!important;height:100dvh!important;max-height:none!important;border-radius:0!important;top:0!important;left:0!important;transform:none!important}
          #ovdn-body{display:flex;flex-direction:column;overflow:auto}
          #ovdn-left{border-right:none;overflow:visible}
          #ovdn-right{overflow:visible}
          .ovdn-navbtn{width:46px;height:42px}
          #ovdn-media{height:160px!important}
          #ovdn-right div[style*="overflow:hidden"]{overflow-x:auto!important}
          #ovdn-right table{font-size:11px!important}
        }
      </style>
      <div id="ovd-hist-bg" style="position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:9998;"></div>
      <div id="ovdn-panel" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(1080px,96vw);height:min(700px,92vh);background:#fff;border-radius:16px;z-index:9999;box-shadow:0 24px 70px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden;font-family:inherit;">
        <div id="ovdn-top" style="padding:10px 14px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:10px;background:#fff;"></div>
        <div id="ovdn-body"><div id="ovdn-left"></div><div id="ovdn-right"></div></div>
      </div>`;
    document.body.appendChild(host);
    host.querySelector('#ovd-hist-bg').addEventListener('click', ovdCloseHistory);
    // swipe (phones): ignore gestures that start on inputs, buttons or the map
    let sx=0, sy=0, ok=false;
    const p = host.querySelector('#ovdn-panel');
    p.addEventListener('touchstart', e=>{ const t=e.target; ok = !t.closest('input,textarea,button,a,.leaflet-container'); sx=e.touches[0].clientX; sy=e.touches[0].clientY; }, {passive:true});
    p.addEventListener('touchend', e=>{ if(!ok) return; const dx=e.changedTouches[0].clientX-sx, dy=e.changedTouches[0].clientY-sy; if(Math.abs(dx)>60 && Math.abs(dy)<45) ovdNavStep(dx<0?1:-1); }, {passive:true});
    return host;
  }

  // ── open / move ──────────────────────────────────────────────────────────
  window.ovdOpenHistory = function(vid, fromNav){
    if(!fromNav){
      nav.ids = listIds();
      if(nav.ids.indexOf(vid) < 0) nav.ids.unshift(vid);
    }
    nav.idx = nav.ids.indexOf(vid);
    nav.vid = vid; nav.open = true; nav.pending = null; nav.showAll = false;
    const host = shell(); host.style.display = '';
    paint(vid);
    prefetch(nav.ids[nav.idx+1]); prefetch(nav.ids[nav.idx-1]);
  };
  window.ovdNavStep = function(dir){
    if(!nav.open) return;
    const j = nav.idx + dir;
    if(j<0 || j>=nav.ids.length) return;
    ovdOpenHistory(nav.ids[j], true);
  };
  window.ovdCloseHistory = function(){
    const h = document.getElementById('ovd-hist'); if(h) h.style.display='none';
    if(nav.map){ try{ nav.map.remove(); }catch(_){} nav.map=null; }
    const was = nav.vid; nav.open = false;
    // mark the last viewed row in the table (static outline, no animation)
    document.querySelectorAll('tr.ovd-row.ovdn-last').forEach(t=>{ t.classList.remove('ovdn-last'); t.style.outline=''; });
    const tr = was!=null ? document.querySelector('tr.ovd-row[data-vid="'+was+'"]') : null;
    if(tr){ tr.classList.add('ovdn-last'); tr.style.outline='2px solid #025AC6'; tr.style.outlineOffset='-2px'; tr.scrollIntoView({block:'center'}); }
  };
  document.addEventListener('keydown', e=>{
    if(!nav.open) return;
    const t = e.target, typing = t && (t.tagName==='INPUT' || t.tagName==='TEXTAREA' || t.isContentEditable);
    if(e.key==='Escape'){ ovdCloseHistory(); return; }
    if(typing) return;
    if(e.key==='ArrowRight'){ e.preventDefault(); ovdNavStep(1); }
    else if(e.key==='ArrowLeft'){ e.preventDefault(); ovdNavStep(-1); }
  });

  async function prefetch(vid){
    if(vid==null || _ovdHistCache[vid]) return;
    try{
      const resp = await fetch(`${_SB}/rest/v1/rpc/spawn_vendo_harvest_history_v1`, {method:'POST', headers:_HDR, body:JSON.stringify({p_vendo_id: vid})});
      const rows = await resp.json().catch(()=>null);
      if(Array.isArray(rows)) _ovdHistCache[vid] = rows;
    }catch(_){}
  }

  // ── paint one vendo ──────────────────────────────────────────────────────
  function paint(vid){
    const r = rowOf(vid) || {vendo_id: vid, name: 'vendo #'+vid, days: 0};
    const top = document.getElementById('ovdn-top');
    const t = _ovdAgeTier(r.days||0);
    const ageTxt = r.days>=9999 ? 'never harvested' : _ovdFmtDays(r.days)+' overdue';
    const rt = r.rt;
    const chip = (txt,c,bg,bd)=>`<span style="padding:3px 10px;border-radius:999px;font-size:11px;font-weight:800;color:${c};background:${bg};border:1px solid ${bd};white-space:nowrap;">${txt}</span>`;
    const online = rt ? (rt.online ? chip('● online','#047857','#ecfdf5','#a7f3d0') : chip('○ offline'+(rt.since?' · seen '+String(rt.since).slice(0,10):''),'#6b7280','#f3f4f6','#e5e7eb')) : '';
    const flag = rt&&rt.flag ? chip('⚑ '+esc(rt.flag).toUpperCase(),'#991b1b','#fef2f2','#fecaca') : '';
    const total = nav.ids.length, pos = nav.idx+1;
    top.innerHTML = `
      <button class="ovdn-navbtn" onclick="ovdNavStep(-1)" ${nav.idx<=0?'disabled':''} title="Previous (←)">‹</button>
      <div style="font-size:12px;font-weight:800;color:#475569;min-width:74px;text-align:center;white-space:nowrap;"><span style="color:#025AC6;">${pos}</span> of ${total}</div>
      <button class="ovdn-navbtn" onclick="ovdNavStep(1)" ${nav.idx>=total-1?'disabled':''} title="Next (→)">›</button>
      <div style="flex:1;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:4px;">
        <span style="font-size:16px;font-weight:800;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${esc(r.name||('vendo #'+vid))}</span>
        ${chip(ageTxt, t.fg, t.bg, t.bd)}${online}${flag}
      </div>
      <button onclick="ovdCloseHistory()" title="Close (Esc)" style="border:none;background:#f1f5f9;color:#475569;border-radius:8px;width:36px;height:36px;font-weight:800;flex:none;">✕</button>`;

    const where = [r.code, _ovdTitle(r.area), r.barangay, (r.vlan!==''&&r.vlan!=null)?'VLAN '+r.vlan:''].filter(Boolean).map(esc).join(' · ');
    const lastTxt = r.lhd ? `Last harvest <b style="color:#1e293b;">${r.lhd}</b>`
      : r.inst ? `Never harvested · installed <b>${r.inst}</b>${r.instRt?' <span style="color:#9ca3af;">(router)</span>':''} · first due ${_ovdAddDays(r.inst,30)}`
      : `Never harvested · no install date`;
    const has = r.lat!=null && r.lng!=null && isFinite(+r.lat) && isFinite(+r.lng);
    if(!has && nav.media==='map' && r.photo) nav.media='photo';

    document.getElementById('ovdn-left').innerHTML = `
      <div style="font-size:11.5px;color:#6b7280;">${where}</div>
      <div style="font-size:11.5px;color:#374151;margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">${lastTxt}${r.lhd&&typeof _ovdSrcTag==='function'?_ovdSrcTag(r.src).replace('margin-top:3px;','margin-top:0;'):''}</div>
      ${_ovdKeysHtml(r.keys)}

      <div style="margin-top:10px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="display:flex;align-items:center;gap:6px;padding:7px 9px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;">
          <button class="ovdn-tab ${nav.media==='map'?'on':''}" onclick="ovdnMedia('map')">📍 Map</button>
          <button class="ovdn-tab ${nav.media==='photo'?'on':''}" onclick="ovdnMedia('photo')" ${r.photo?'':'disabled'}>📷 Photo</button>
          <span style="font-size:11px;color:#374151;margin-left:4px;">${has?`<b>${(+r.lat).toFixed(5)}, ${(+r.lng).toFixed(5)}</b>`:'<b style="color:#b45309;">No GPS on record</b>'}</span>
          <span style="flex:1"></span>
          <button class="ovdn-btn" onclick="ovdPhotoGps(${vid})" style="border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;padding:4px 10px;font-size:11px;">📷 ${has?'Update from photo':'Add from photo'}</button>
        </div>
        <div id="ovdn-media" style="height:200px;background:#f8fafc;position:relative;"></div>
        <div id="ovdn-gpsfix"></div>
      </div>

      <div style="margin-top:10px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px 8px;align-items:center;">
        <input id="ovd-note" class="ovdn-in" type="text" value="${esc(r.note||'')}" placeholder="📝 Note (owner asked to pause · for pull-out · weekends only)">
        <div style="display:flex;gap:6px;">
          <button id="ovd-note-save" class="ovdn-btn" onclick="ovdSaveNote(${vid})" style="border:none;background:#025AC6;color:#fff;">Save</button>
          <button class="ovdn-btn" onclick="ovdnSaveNext(${vid})" style="border:1px solid #025AC6;background:#fff;color:#025AC6;" ${nav.idx>=nav.ids.length-1?'disabled':''}>Save &amp; next ›</button>
        </div>
        ${rt ? `
        <input id="ovd-rtname" class="ovdn-in" type="text" value="${esc(rt.name||'')}" placeholder="📡 Router name on VLAN ${esc(r.vlan)}">
        <div style="display:flex;gap:6px;">
          <button class="ovdn-btn" onclick="ovdUseRecordName(${vid})" style="border:1px solid #e5e7eb;background:#fff;color:#374151;font-weight:700;">← use record</button>
          <button id="ovd-rtname-save" class="ovdn-btn" onclick="ovdQueueRename(${vid})" style="border:none;background:#b45309;color:#fff;">Fix on router</button>
        </div>` : ''}
        <div id="ovdn-confirm" style="grid-column:1 / -1;"></div>
        <div id="ovd-act-msg" style="grid-column:1 / -1;font-size:11px;"></div>
        <div id="ovd-rt-pending" style="grid-column:1 / -1;font-size:10.5px;color:#9ca3af;display:${rt&&rt.pending?'':'none'};">${rt&&rt.pending?'Queued: "'+esc(rt.pending)+'"':''}</div>
      </div>
      <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <button class="ovdn-btn" onclick="ovdInactivate(${vid})" style="border:1px solid #fecaca;background:#fef2f2;color:#991b1b;">⏸ Inactivate</button>
        <span style="font-size:9.5px;color:#d1d5db;">${BUILD} · ← → to move</span>
      </div>`;

    renderMedia(r);
    renderLedger(vid, r);
  }

  window.ovdnMedia = function(which){
    nav.media = which; const r = rowOf(nav.vid); if(!r) return;
    document.querySelectorAll('#ovdn-left .ovdn-tab').forEach(b=>{ b.classList.toggle('on', b.textContent.indexOf(which==='map'?'Map':'Photo')>=0); });
    renderMedia(r);   // only the media box changes — typed notes stay
  };
  async function renderMedia(r, preview){
    const box = document.getElementById('ovdn-media'); if(!box) return;
    if(nav.map){ try{ nav.map.remove(); }catch(_){} nav.map=null; }
    const lat = preview ? preview.lat : r.lat, lng = preview ? preview.lng : r.lng;
    const has = lat!=null && lng!=null && isFinite(+lat) && isFinite(+lng);
    if(nav.media==='photo' && r.photo && !preview){
      box.innerHTML = `<img src="${esc(r.photo)}" alt="vendo photo" style="width:100%;height:100%;object-fit:contain;background:#0f172a;">`;
      return;
    }
    if(!has){ box.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:12px;">No GPS yet — use “Add from photo”.</div>`; return; }
    box.innerHTML = `<div id="ovdn-mapel" style="position:absolute;inset:0;"></div>`;
    try{
      if(typeof window.L==='undefined' && typeof window.spawnLazy==='function') await window.spawnLazy('leaflet');
      if(typeof window.L==='undefined') throw new Error('map library not loaded');
      const el = document.getElementById('ovdn-mapel'); if(!el) return;
      const m = L.map(el, {zoomControl:true, attributionControl:false, fadeAnimation:false, zoomAnimation:false, markerZoomAnimation:false}).setView([+lat, +lng], 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19}).addTo(m);
      L.circleMarker([+lat, +lng], {radius:8, color:preview?'#b45309':'#025AC6', weight:3, fillOpacity:.5}).addTo(m);
      nav.map = m;
      setTimeout(()=>{ try{ m.invalidateSize(); }catch(_){} }, 0);
    }catch(e){
      box.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:12px;">Map unavailable (${esc(e.message)})</div>`;
    }
  }

  async function renderLedger(vid, r){
    const right = document.getElementById('ovdn-right');
    const draw = (rows)=>{
      if(nav.vid!==vid) return;   // user already moved on
      const wide = isWide();
      const cut = (!wide && !nav.showAll && rows.length>6) ? rows.slice(0,6) : rows;
      let html = _ovdHistHtml(cut, r);
      if(cut.length < rows.length){
        html += `<div style="text-align:center;margin-top:8px;"><button class="ovdn-btn" onclick="ovdnShowAll()" style="border:1px solid #e5e7eb;background:#fff;color:#374151;">Show all ${rows.length} rows</button></div>`;
      }
      right.innerHTML = html;
    };
    const cached = _ovdHistCache[vid];
    if(cached){ draw(cached); return; }
    right.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:20px;text-align:center;">Loading app + book history…</div>';
    try{
      const resp = await fetch(`${_SB}/rest/v1/rpc/spawn_vendo_harvest_history_v1`, {method:'POST', headers:_HDR, body:JSON.stringify({p_vendo_id: vid})});
      const rows = await resp.json().catch(()=>null);
      if(!Array.isArray(rows)) throw new Error((rows&&(rows.message||rows.error))||('HTTP '+resp.status));
      _ovdHistCache[vid] = rows; draw(rows);
    }catch(e){
      if(nav.vid===vid) right.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:12px;font-size:12px;"><b>Could not load history.</b><br>${esc(e.message)}</div>`;
    }
  }
  window.ovdnShowAll = function(){ nav.showAll = true; const r=rowOf(nav.vid); if(r) renderLedger(nav.vid, r); };

  // ── inline confirm helper (replaces browser confirm/prompt) ─────────────
  function ask(html, okLabel, okStyle, onOk){
    const box = document.getElementById('ovdn-confirm'); if(!box) return;
    box.innerHTML = `<div style="border:1px solid #fde68a;background:#fffbeb;border-radius:10px;padding:9px 10px;font-size:12px;color:#1e293b;">
      ${html}
      <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px;">
        <button class="ovdn-btn" id="ovdn-ask-no" style="border:1px solid #e5e7eb;background:#fff;color:#374151;">Cancel</button>
        <button class="ovdn-btn" id="ovdn-ask-ok" style="${okStyle}">${okLabel}</button>
      </div></div>`;
    box.querySelector('#ovdn-ask-no').onclick = ()=>{ box.innerHTML=''; };
    box.querySelector('#ovdn-ask-ok').onclick = async ()=>{ const b=box.querySelector('#ovdn-ask-ok'); b.disabled=true; try{ await onOk(box); } finally { if(b.isConnected) b.disabled=false; } };
    const first = box.querySelector('input'); if(first) first.focus();
  }

  // ── Save & next ──────────────────────────────────────────────────────────
  window.ovdnSaveNext = async function(vid){
    await ovdSaveNote(vid);
    const m = document.getElementById('ovd-act-msg');
    if(m && m.style.color && m.style.color.indexOf('153, 27, 27')>=0) return;   // save failed — stay
    ovdNavStep(1);
  };

  // ── Fix on router: inline confirm ────────────────────────────────────────
  window.ovdQueueRename = function(vid){
    const r = rowOf(vid)||{}; if(!r.rt) return;
    const i = document.getElementById('ovd-rtname');
    const name = (i && i.value || '').trim();
    if(!name){ _ovdMsg('Router name cannot be blank.'); return; }
    if(name===(r.rt.name||'').trim()){ _ovdMsg('That is already the router name.'); return; }
    const server = (r.area||'').toUpperCase()==='DAPITAN' ? 'Dapitan Server' : 'Dicayas Server';
    ask(`Rename <b>VLAN ${esc(r.vlan)}</b> on ${server}<br>from <b>${esc(r.rt.name||'(blank)')}</b><br>to <b>${esc(name)}</b><div style="color:#6b7280;font-size:11px;margin-top:3px;">The router poller applies it on its next pass.</div>`,
      'Queue rename', 'border:none;background:#b45309;color:#fff;', async (box)=>{
        _ovdMsg('Queuing…');
        try{
          const resp = await fetch(`${_SB}/rest/v1/router_rename_outbox`, {method:'POST', headers:Object.assign({}, _HDR, {Prefer:'return=minimal'}),
            body: JSON.stringify({server_name:server, vlan:r.vlan, new_comment:name, old_comment:r.rt.name||null, vendo_id:vid, requested_by:'overdue-tab'})});
          if(!resp.ok){ const b=await resp.json().catch(()=>null); throw new Error((b&&(b.message||b.error))||('HTTP '+resp.status)); }
          r.rt = Object.assign({}, r.rt, {pending:name});
          box.innerHTML = '';
          const p=document.getElementById('ovd-rt-pending'); if(p){ p.style.display=''; p.style.color='#b45309'; p.textContent='Queued: "'+name+'". The poller writes it to the router within a minute or two.'; }
          _ovdMsg('Router rename queued.', true);
        }catch(e){ _ovdMsg('Could not queue: '+e.message); }
      });
  };

  // ── Inactivate: inline reason, then move to the vendo that takes its place ─
  window.ovdInactivate = function(vid){
    const row = rowOf(vid) || {};
    ask(`Inactivate <b>${esc(row.name||('vendo #'+vid))}</b>? It leaves the overdue list and collector routes (reactivate in the Vendos tab).
         <input id="ovdn-reason" class="ovdn-in" type="text" placeholder="Reason (saved to the note)" style="margin-top:7px;">`,
      '⏸ Inactivate', 'border:none;background:#991b1b;color:#fff;', async (box)=>{
        const reason = (document.getElementById('ovdn-reason')?.value||'').trim();
        _ovdMsg('Inactivating…');
        try{
          const stamp = new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
          const prev = (row.note||'').trim();
          const line = 'INACTIVE '+stamp+(reason?': '+reason:'');
          const note = prev ? prev+'\n'+line : line;
          await _ovdPatchVendo(vid, {status:'inactive', admin_notes: note});
          if(_ovdRaw && _ovdRaw.V && _ovdRaw.V[vid]){ _ovdRaw.V[vid].status='inactive'; _ovdRaw.V[vid].admin_notes=note; }
          if(_ovdRaw && _ovdRaw.list){ _ovdRaw.list.rows = _ovdRaw.list.rows.filter(y=>y.vendo_id!==vid); }
          _ovdAskRebuild();
          if(typeof toast==='function') toast('Vendo inactivated');
          const at = nav.idx;
          nav.ids = nav.ids.filter(x=>x!==vid);
          ovdRecompute();                                  // table refreshes behind the popup
          if(!nav.ids.length){ ovdCloseHistory(); return; }
          ovdOpenHistory(nav.ids[Math.min(at, nav.ids.length-1)], true);
          _ovdMsg('Previous vendo inactivated. This is the next one.', true);
        }catch(e){ _ovdMsg('Could not inactivate: '+e.message); }
      });
  };

  // ── Photo → GPS, confirmed inline with a map preview ────────────────────
  window.ovdPhotoGps = function(vid){
    const r = rowOf(vid)||{};
    const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
    inp.onchange=async()=>{
      const file=inp.files[0]; if(!file) return;
      _ovdMsg('Reading photo…');
      let g=null, how='';
      try{ const e=(typeof exifGps==='function')?exifGps(await file.arrayBuffer()):null; if(e){ g={lat:e.lat,lng:e.lng,inArea:true}; how='EXIF tag'; } }catch(_){}
      if(!g){
        try{
          _ovdMsg('No GPS tag — reading the stamp text (OCR)…');
          const img=await _ovdLoadImg(file);
          const w=await _ovdTesseract();
          for(const [a,b] of [[0.62,1],[0,0.38],[0,1]]){
            const {data}=await w.recognize(_ovdBandCanvas(img,a,b));
            const c=_ovdCoordsFromText(data.text);
            if(c){ g=c; how='stamp OCR'; break; }
          }
        }catch(e){ _ovdMsg('OCR failed: '+e.message); }
      }
      if(nav.vid!==vid) return;   // user moved to another vendo meanwhile
      _ovdMsg('');
      const fixBox = document.getElementById('ovdn-gpsfix'); if(!fixBox) return;
      const val = g ? (g.lat+', '+g.lng) : '';
      fixBox.innerHTML = `<div style="border-top:1px solid #f1f5f9;padding:8px 9px;background:#fffbeb;">
        <div style="font-size:11.5px;color:#1e293b;margin-bottom:6px;">${g ? `Found via <b>${how}</b>${g.inArea?'':' — <b style="color:#991b1b;">outside the Dipolog/Dapitan/Sindangan area</b>'}. Check the orange dot on the map, edit if needed:` : 'Could not read coordinates from the photo. Paste the stamp line (e.g. 8.57732, 123.35280):'}</div>
        <div style="display:flex;gap:6px;">
          <input id="ovdn-gpsval" class="ovdn-in" type="text" value="${esc(val)}" placeholder="lat, lng">
          <button class="ovdn-btn" id="ovdn-gps-cancel" style="border:1px solid #e5e7eb;background:#fff;color:#374151;">Cancel</button>
          <button class="ovdn-btn" id="ovdn-gps-save" style="border:none;background:#025AC6;color:#fff;">Save GPS</button>
        </div></div>`;
      const inEl = fixBox.querySelector('#ovdn-gpsval');
      const preview = ()=>{ const c=_ovdCoordsFromText(inEl.value||''); if(c){ nav.media='map'; renderMedia(r, c); } };
      if(g){ nav.media='map'; renderMedia(r, g); }
      inEl.addEventListener('change', preview); inEl.addEventListener('keyup', e=>{ if(e.key==='Enter') preview(); });
      fixBox.querySelector('#ovdn-gps-cancel').onclick = ()=>{ fixBox.innerHTML=''; renderMedia(r); _ovdMsg('Not saved.'); };
      fixBox.querySelector('#ovdn-gps-save').onclick = async ()=>{
        const fx=_ovdCoordsFromText(inEl.value||''); if(!fx){ _ovdMsg('Bad coordinates.'); return; }
        const btn=fixBox.querySelector('#ovdn-gps-save'); btn.disabled=true;
        _ovdMsg('Saving GPS…');
        try{
          await _ovdPatchVendo(vid, {lat:fx.lat, lng:fx.lng, gps:fx.lat+', '+fx.lng, gps_updated_at:new Date().toISOString()});
          try{ await fetch(`${_SB}/rest/v1/harvest_group_items?vendo_id=eq.${vid}`, {method:'PATCH', headers:Object.assign({}, _HDR, {Prefer:'return=minimal'}), body:JSON.stringify({lat:fx.lat,lng:fx.lng})}); }catch(_){}
          let photo=null;
          try{
            const path='vendo-profiles/vendo_'+vid+'.jpg';
            const up=await fetch(_SB+'/storage/v1/object/harvest-photos/'+path,{method:'POST',headers:{apikey:_KEY,Authorization:'Bearer '+_KEY,'Content-Type':file.type||'image/jpeg','x-upsert':'true'},body:file});
            if(up.ok){ photo=_SB+'/storage/v1/object/public/harvest-photos/'+path+'?t='+Date.now(); await _ovdPatchVendo(vid,{photo_url:photo}); }
          }catch(_){}
          r.lat=fx.lat; r.lng=fx.lng; if(photo) r.photo=photo;
          if(_ovdRaw&&_ovdRaw.list){ const x=_ovdRaw.list.rows.find(y=>y.vendo_id===vid); if(x){ x.lat=fx.lat; x.lng=fx.lng; if(photo) x.photo=photo; } }
          _ovdAskRebuild();
          if(typeof toast==='function') toast('GPS saved');
          if(nav.vid===vid){ nav.media='map'; paint(vid); _ovdMsg('GPS saved ('+how+')'+(photo?' and photo kept.':'.')+' Phones get it on their next route open.', true); }
        }catch(e){ _ovdMsg('Could not save GPS: '+e.message); btn.disabled=false; }
      };
      inEl.focus();
    };
    inp.click();
  };
})();
