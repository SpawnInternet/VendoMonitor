/* ══════════════════════════════════════════════════════════════════════════
   DUE BY GROUP  (dash.16)  —  Harvest ▸ ⏳ Overdue ▸ 🗂 By group
   ------------------------------------------------------------------------
   Wendell, 2026-10-31: "easy to copy and paste, see immediately per group,
   last harvest date, add notes, inactivate, and check ALL sources (sheet
   and app) before calling a vendo not harvested."

   Last harvest = latest of
     • vendos.last_harvest_date
     • harvest_group_items.harvested_at (status = 'harvested')
     • harvests.harvest_date            (the collector app)
     • office_harvest_records.record_date (the BASHANG book, as imported)
   Due = active AND days since that date > the vendo's interval (default 30),
   or never harvested.

   Self-installing: adds a third view button to the Overdue tab and its own
   panel, so dashboard.html only needs the <script> tag.

   Reads through the admin gateway (REST GET on harvest_groups,
   harvest_group_items, vendos, harvests, office_harvest_records).
   Writes: PATCH vendos (due_note, status) — owner actions only.
   Server-side equivalents: spawn_group_due(), spawn_group_due_text(),
   spawn_vendo_due_flag() — same rule, used for checks.
   ══════════════════════════════════════════════════════════════════════════ */

var _gdRaw = null, _gdTs = 0, _gdBusy = false, _gdSel = null, _gdRows = [], _gdSum = [];
var _gdFilter = 'due';           // 'due' | 'all'
const _GD_TTL   = 5*60*1000;
const _GD_SINCE_DAYS = 180;      // app/book rows older than this are covered by vendos.last_harvest_date

const _gdEsc = s => String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const _gdPad = n => String(n).padStart(2,'0');
function _gdManilaToday(){
  const d = new Date(Date.now() + 8*3600*1000);
  return d.getUTCFullYear()+'-'+_gdPad(d.getUTCMonth()+1)+'-'+_gdPad(d.getUTCDate());
}
function _gdIsoToManila(ts){            // timestamptz -> Manila calendar date
  if(!ts) return null;
  const d = new Date(new Date(ts).getTime() + 8*3600*1000);
  return d.getUTCFullYear()+'-'+_gdPad(d.getUTCMonth()+1)+'-'+_gdPad(d.getUTCDate());
}
function _gdDaysBetween(a, b){ return Math.round((Date.parse(b) - Date.parse(a))/86400000); }
function _gdMonDD(iso){
  if(!iso) return '';
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return m[parseInt(iso.slice(5,7),10)-1]+' '+parseInt(iso.slice(8,10),10);
}
const _gdPeso = n => n==null ? '' : '₱'+Math.round(n).toLocaleString();

/* ── 1. FETCH ─────────────────────────────────────────────────────────── */
async function _gdGet(url, what){
  const r = await fetch(url, {headers:_HDR});
  const b = await r.json().catch(() => null);
  if(!Array.isArray(b)){
    const why = (b && (b.message || b.hint || b.error)) || ('HTTP '+r.status);
    throw new Error(what+': '+why);
  }
  return b;
}
async function _gdPaged(base, what){
  const out = [];
  for(let off = 0; off < 40000; off += 900){
    const b = await _gdGet(base+'&limit=900&offset='+off, what);
    out.push(...b);
    if(b.length < 900) break;
  }
  return out;
}

async function _gdFetchAll(){
  const SB = _SB;
  const graw = await _gdGet(`${SB}/rest/v1/harvest_groups?select=id,group_id,group_label,area,collector&order=area.asc,group_id.asc,id.asc&limit=200`, 'harvest_groups');
  const seen = {}, gs = [];
  graw.forEach(r => { const k=(r.group_id||r.id)+'__'+(r.area||''); if(!seen[k]){ seen[k]=1; gs.push(r); } });
  const ids = gs.map(g=>g.id).filter(x=>x!=null);
  if(!ids.length) return {gs:[], items:[], V:{}, app:{}, book:{}};

  const items = await _gdPaged(`${SB}/rest/v1/harvest_group_items?group_run_id=in.(${ids.join(',')})&select=group_run_id,vendo_id,status,harvested_at&order=id.asc`, 'harvest_group_items');
  const vids = [...new Set(items.map(i=>i.vendo_id).filter(x=>x!=null))];
  const V = {};
  for(let i=0; i<vids.length; i+=250){
    const chunk = vids.slice(i, i+250);
    const b = await _gdGet(`${SB}/rest/v1/vendos?id=in.(${chunk.join(',')})&select=id,vendo_code,sheet_name,tg_name,owner_name,area,address,vlan,last_harvest_date,status,harvest_interval_days,harvest_interval,due_note&limit=300`, 'vendos');
    b.forEach(v => V[v.id] = v);
  }

  // app + book, last N days only (older is covered by vendos.last_harvest_date)
  const sinceD = new Date(Date.now() - _GD_SINCE_DAYS*86400000);
  const since = sinceD.getUTCFullYear()+'-'+_gdPad(sinceD.getUTCMonth()+1)+'-'+_gdPad(sinceD.getUTCDate());
  const today = _gdManilaToday();
  const app = {}, book = {};
  const h = await _gdPaged(`${SB}/rest/v1/harvests?select=vendo_id,harvest_date,spawn_share,is_test&harvest_date=gte.${since}&vendo_id=not.is.null&order=id.asc`, 'harvests');
  h.forEach(r => {
    if(r.is_test) return;
    const cur = app[r.vendo_id];
    if(!cur || r.harvest_date > cur.d) app[r.vendo_id] = {d:r.harvest_date, amt:r.spawn_share};
  });
  const o = await _gdPaged(`${SB}/rest/v1/office_harvest_records?select=vendo_id,record_date,amount&record_date=gte.${since}&record_date=lte.${today}&vendo_id=not.is.null&order=id.asc`, 'office_harvest_records');
  o.forEach(r => {
    const cur = book[r.vendo_id];
    if(!cur || r.record_date > cur.d) book[r.vendo_id] = {d:r.record_date, amt:r.amount};
  });
  return {gs, items, V, app, book};
}

/* ── 2. COMPUTE ───────────────────────────────────────────────────────── */
function _gdCompute(raw){
  const {gs, items, V, app, book} = raw;
  const today = _gdManilaToday();
  const byGroup = {};
  gs.forEach(g => byGroup[g.id] = {g, rows:[]});
  const seenGV = {};
  items.forEach(it => {
    if(it.vendo_id==null || !byGroup[it.group_run_id]) return;
    if(it.status === 'pulled_out') return;
    const key = it.group_run_id+'|'+it.vendo_id;
    if(seenGV[key]) return; seenGV[key] = 1;
    const v = V[it.vendo_id]; if(!v) return;
    const cands = [];
    if(v.last_harvest_date) cands.push({d:v.last_harvest_date, src:'vendo', amt:null});
    if(it.status==='harvested' && it.harvested_at) cands.push({d:_gdIsoToManila(it.harvested_at), src:'app', amt:null});
    const a = app[v.id];  if(a) cands.push({d:a.d, src:'app', amt:a.amt});
    const b = book[v.id]; if(b) cands.push({d:b.d, src:'book', amt:b.amt});
    cands.sort((x,y) => x.d < y.d ? 1 : x.d > y.d ? -1 : (x.src==='app' ? -1 : 1));
    const last = cands[0] || null;
    const days = last ? _gdDaysBetween(last.d, today) : 9999;
    const iv = parseInt(v.harvest_interval_days || v.harvest_interval || 30, 10) || 30;
    byGroup[it.group_run_id].rows.push({
      id: v.id, code: v.vendo_code||'', name: v.sheet_name||v.tg_name||v.owner_name||('vendo #'+v.id),
      vlan: v.vlan, address: v.address||'', status: v.status||'', note: v.due_note||'',
      last: last ? last.d : null, src: last ? last.src : null, amt: last ? last.amt : null,
      days, iv, due: (v.status==='active') && (!last || days > iv)
    });
  });
  const sum = Object.values(byGroup).map(x => {
    const act = x.rows.filter(r => r.status==='active');
    return {
      id: x.g.id, label: x.g.group_label||('Group '+x.g.id), area: x.g.area||'', collector: x.g.collector||'',
      active: act.length, due: act.filter(r=>r.due).length, never: act.filter(r=>!r.last).length,
      over60: act.filter(r=>r.last && r.days>60).length, over90: act.filter(r=>r.last && r.days>90).length,
      rows: x.rows.sort((p,q) => (p.last||'') < (q.last||'') ? -1 : (p.last||'') > (q.last||'') ? 1 : p.name.localeCompare(q.name))
    };
  }).sort((p,q) => (p.area+p.label).localeCompare(q.area+q.label));
  return sum;
}

/* ── 3. LOAD ──────────────────────────────────────────────────────────── */
async function gdLoad(force){
  if(_gdBusy) return;
  const cards = document.getElementById('gd-groups');
  if(!_gdRaw || force || (Date.now()-_gdTs > _GD_TTL)){
    _gdBusy = true;
    if(cards) cards.innerHTML = '<div style="padding:22px;color:#6b7280;font-size:13px;">Checking app + BASHANG book for every group…</div>';
    try{ _gdRaw = await _gdFetchAll(); _gdTs = Date.now(); }
    catch(e){
      _gdBusy = false; _gdRaw = null; _gdTs = 0;
      if(cards) cards.innerHTML = '<div style="padding:16px;border-radius:11px;background:#fef2f2;border:1px solid #fecaca;color:#DF1A35;font-size:13px;font-weight:700;">Load failed — nothing below is real.<br><span style="font-weight:600;font-size:12px;color:#991b1b;">'+_gdEsc(e.message)+'</span></div>';
      return;
    }
    _gdBusy = false;
  }
  _gdSum = _gdCompute(_gdRaw);
  gdRender();
}

/* ── 4. RENDER ────────────────────────────────────────────────────────── */
function gdRender(){
  const cards = document.getElementById('gd-groups'); if(!cards) return;
  const age = document.getElementById('gd-age');
  if(age) age.textContent = _gdTs ? 'app + book · '+Math.max(0, Math.round((Date.now()-_gdTs)/60000))+'min ago' : '';
  const tier = (due, act) => { const p = act ? due/act : 0; return p>=0.5 ? '#DF1A35' : p>=0.25 ? '#FEB30C' : '#028867'; };
  cards.innerHTML = _gdSum.map(s => {
    const on = _gdSel===s.id;
    return `<div onclick="gdPick(${s.id})" style="cursor:pointer;border:2px solid ${on?'#025AC6':'#e5e7eb'};background:${on?'#eff6ff':'#fff'};border-radius:12px;padding:10px 12px;min-width:190px;flex:1;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
        <div style="font-weight:800;font-size:13px;color:#111827;">${_gdEsc(s.label)}</div>
        <span style="background:${tier(s.due,s.active)};color:#fff;font-weight:800;font-size:12px;padding:2px 9px;border-radius:99px;">${s.due}</span>
      </div>
      <div style="font-size:11px;color:#6b7280;margin-top:3px;">${_gdEsc(s.collector||'—')} · ${s.due} of ${s.active} active not yet harvested</div>
      <div style="font-size:10.5px;color:#9ca3af;margin-top:2px;">${s.never} never · ${s.over60} over 60d · ${s.over90} over 90d</div>
    </div>`;
  }).join('');
  gdRenderList();
}

function gdRenderList(){
  const box = document.getElementById('gd-list'); if(!box) return;
  const s = _gdSum.find(x => x.id===_gdSel);
  const title = document.getElementById('gd-title');
  if(!s){ if(title) title.textContent=''; box.innerHTML = '<div style="padding:18px;color:#9ca3af;font-size:12px;">Tap a group above.</div>'; return; }
  const q = (document.getElementById('gd-search')||{}).value || '';
  const ql = q.trim().toLowerCase();
  let rows = s.rows.filter(r => _gdFilter==='all' ? true : r.due);
  if(ql) rows = rows.filter(r => (r.name+' '+r.code+' '+r.address+' '+(r.vlan||'')).toLowerCase().indexOf(ql)>=0);
  _gdRows = rows;
  if(title) title.innerHTML = `<b>${_gdEsc(s.label)}</b> — ${s.due} of ${s.active} active not yet harvested <span style="color:#9ca3af;font-weight:600;">· ${_gdEsc(s.collector||'')}</span>`;
  const srcTag = r => r.src==='book' ? '<span style="font-size:9px;font-weight:800;color:#9d174d;background:#fdf2f8;border:1px solid #f9a8d4;padding:1px 5px;border-radius:5px;" title="Last record is in the BASHANG book only — not yet in the app">BOOK</span>'
                   : r.src==='app' ? '<span style="font-size:9px;font-weight:800;color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0;padding:1px 5px;border-radius:5px;">APP</span>' : '';
  const ageCol = r => r.days>=9999 ? '#311A8E' : r.days>90 ? '#DF1A35' : r.days>60 ? '#c2410c' : r.due ? '#a16207' : '#028867';
  box.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr style="color:#6b7280;font-size:10.5px;text-align:left;">
      <th style="padding:6px 8px;">#</th><th style="padding:6px 8px;">Vendo</th><th style="padding:6px 8px;">VLAN</th>
      <th style="padding:6px 8px;">Last harvest</th><th style="padding:6px 8px;">Days</th><th style="padding:6px 8px;">Last ₱</th>
      <th style="padding:6px 8px;">Note</th><th style="padding:6px 8px;"></th></tr></thead>
    <tbody>${rows.map((r,i) => `<tr style="border-top:1px solid #f1f5f9;${r.status!=='active'?'opacity:.55;':''}">
      <td style="padding:6px 8px;color:#9ca3af;">${i+1}</td>
      <td style="padding:6px 8px;"><b>${_gdEsc(r.code)}</b> ${_gdEsc(r.name)}${r.status!=='active'?' <span style="font-size:9px;color:#6b7280;">('+_gdEsc(r.status)+')</span>':''}<div style="font-size:10px;color:#9ca3af;">${_gdEsc(r.address)}</div></td>
      <td style="padding:6px 8px;">${r.vlan==null?'—':r.vlan}</td>
      <td style="padding:6px 8px;">${r.last ? _gdMonDD(r.last)+' '+srcTag(r) : '<span style="color:#311A8E;font-weight:700;">never</span>'}</td>
      <td style="padding:6px 8px;font-weight:800;color:${ageCol(r)};">${r.days>=9999?'—':r.days}</td>
      <td style="padding:6px 8px;color:#6b7280;">${_gdPeso(r.amt)}</td>
      <td style="padding:6px 8px;"><input value="${_gdEsc(r.note)}" placeholder="note…" onchange="gdNote(${r.id}, this.value)" style="width:170px;padding:4px 6px;border:1px solid #e5e7eb;border-radius:6px;font-size:11px;font-family:inherit;"></td>
      <td style="padding:6px 8px;white-space:nowrap;">${r.status==='active'
        ? `<button onclick="gdInactivate(${r.id})" title="Set inactive — drops off the due list" style="padding:3px 9px;border-radius:6px;border:1px solid #fecaca;background:#fff;color:#DF1A35;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Inactivate</button>`
        : `<button onclick="gdReactivate(${r.id})" style="padding:3px 9px;border-radius:6px;border:1px solid #a7f3d0;background:#fff;color:#065f46;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Activate</button>`}</td>
    </tr>`).join('') || '<tr><td colspan="8" style="padding:18px;text-align:center;color:#9ca3af;">Nothing here.</td></tr>'}</tbody></table>`;
}

function gdPick(id){ _gdSel = id; gdRender(); }
function gdSetFilter(f){
  _gdFilter = f;
  ['due','all'].forEach(k => { const b=document.getElementById('gd-fb-'+k); if(!b) return;
    b.style.background = k===f ? '#025AC6' : '#fff'; b.style.color = k===f ? '#fff' : '#025AC6'; });
  gdRenderList();
}

/* ── 5. COPY (Messenger text, due vendos only, grouped by how late) ───── */
function gdCopyText(){
  const s = _gdSum.find(x => x.id===_gdSel);
  if(!s){ if(typeof toast==='function') toast('Pick a group first'); return; }
  const due = s.rows.filter(r => r.due);
  const line = r => '- '+(r.code?r.code+' ':'')+r.name+(r.vlan!=null?' (VLAN '+r.vlan+')':'')
    +(r.last ? ' — last '+_gdMonDD(r.last)+' ('+r.days+' days)' : ' — never harvested')
    +(r.note ? ' · '+r.note : '');
  const bucket = (t, arr) => arr.length ? '\n\n'+t+':\n'+arr.map(line).join('\n') : '';
  const txt = s.label+' — NOT YET HARVESTED as of '+_gdMonDD(_gdManilaToday())+' ('+due.length+' of '+s.active+' active)'
    + bucket('NEVER HARVESTED', due.filter(r=>!r.last))
    + bucket('90+ DAYS',        due.filter(r=>r.last && r.days>90))
    + bucket('60–90 DAYS',      due.filter(r=>r.last && r.days>60 && r.days<=90))
    + bucket('PAST DUE (30–60 DAYS)', due.filter(r=>r.last && r.days<=60));
  navigator.clipboard.writeText(txt).then(
    () => { if(typeof toast==='function') toast('Copied '+due.length+' vendos for '+s.label); },
    () => { if(typeof toast==='function') toast('Copy blocked by browser'); });
}

/* ── 6. WRITES (owner actions, through the admin gateway) ────────────── */
async function _gdPatch(id, body, okMsg){
  const r = await fetch(`${_SB}/rest/v1/vendos?id=eq.${id}`, {method:'PATCH', headers:Object.assign({}, _HDR, {'Content-Type':'application/json', 'Prefer':'return=minimal'}), body:JSON.stringify(body)});
  if(!r.ok){ const t = await r.text().catch(()=>''); if(typeof toast==='function') toast('Save failed: '+t.slice(0,80)); return false; }
  if(typeof toast==='function') toast(okMsg);
  return true;
}
async function gdNote(id, val){
  const note = (val||'').trim() || null;
  if(await _gdPatch(id, {due_note: note}, 'Note saved')){
    if(_gdRaw && _gdRaw.V[id]) _gdRaw.V[id].due_note = note;
  }
}
async function gdInactivate(id){
  const v = _gdRaw && _gdRaw.V[id]; const nm = v ? (v.sheet_name||v.tg_name||('#'+id)) : ('#'+id);
  if(!confirm('Set "'+nm+'" INACTIVE?\n\nIt drops off every due list and the collectors stop seeing it as overdue. You can activate it again from here.')) return;
  if(await _gdPatch(id, {status:'inactive'}, 'Set inactive')){
    if(v) v.status = 'inactive'; _gdSum = _gdCompute(_gdRaw); gdRender();
  }
}
async function gdReactivate(id){
  const v = _gdRaw && _gdRaw.V[id];
  if(await _gdPatch(id, {status:'active'}, 'Set active')){
    if(v) v.status = 'active'; _gdSum = _gdCompute(_gdRaw); gdRender();
  }
}

/* ── 7. INSTALL into the Overdue tab ─────────────────────────────────── */
(function gdInstall(){
  function go(){
    const planBtn = document.getElementById('ovd-vb-plan');
    const planView = document.getElementById('ovd-view-plan');
    if(!planBtn || !planView || document.getElementById('ovd-vb-group')) return;
    const b = document.createElement('button');
    b.id = 'ovd-vb-group'; b.textContent = '🗂 By group';
    b.setAttribute('style', planBtn.getAttribute('style'));
    b.onclick = () => ovdSetView('group');
    planBtn.parentNode.appendChild(b);

    const panel = document.createElement('div');
    panel.id = 'ovd-view-group'; panel.style.display = 'none';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:10px;">
        <span style="font-size:10px;font-weight:700;color:#9d174d;background:#fdf2f8;padding:3px 8px;border-radius:5px;">checks the app AND the BASHANG book before calling a vendo not harvested</span>
        <span id="gd-age" style="font-size:10px;color:var(--mu);"></span>
        <span style="flex:1"></span>
        <button onclick="gdLoad(true)" style="padding:5px 12px;border-radius:7px;border:1px solid var(--bd);background:#fff;font-size:12px;cursor:pointer;font-family:inherit;height:30px;">↺ Refresh</button>
      </div>
      <div id="gd-groups" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;"></div>
      <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:8px;">
        <div id="gd-title" style="font-size:13px;color:#111827;"></div>
        <span style="flex:1"></span>
        <div style="display:flex;border:1.5px solid #dbeafe;border-radius:9px;overflow:hidden;">
          <button id="gd-fb-due" onclick="gdSetFilter('due')" style="padding:5px 12px;border:none;background:#025AC6;color:#fff;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;">Not yet harvested</button>
          <button id="gd-fb-all" onclick="gdSetFilter('all')" style="padding:5px 12px;border:none;background:#fff;color:#025AC6;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;">All in group</button>
        </div>
        <input type="text" id="gd-search" placeholder="🔍 name, code, VLAN, address…" oninput="gdRenderList()" style="padding:5px 9px;border:1px solid var(--bd);border-radius:7px;font-size:12px;font-family:inherit;width:220px;height:30px;">
        <button onclick="gdCopyText()" style="padding:5px 12px;border-radius:7px;border:none;background:#028867;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;height:30px;">📋 Copy for Messenger</button>
      </div>
      <div id="gd-list" style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:auto;"></div>`;
    planView.parentNode.insertBefore(panel, planView.nextSibling);

    // extend the view switcher
    const _orig = window.ovdSetView;
    window.ovdSetView = function(v){
      const G = document.getElementById('ovd-view-group');
      if(v === 'group'){
        _ovdView = 'group';
        const L=document.getElementById('ovd-view-list'), P=document.getElementById('ovd-view-plan');
        if(L) L.style.display='none'; if(P) P.style.display='none'; if(G) G.style.display='block';
        [['list','ovd-vb-list'],['plan','ovd-vb-plan'],['group','ovd-vb-group']].forEach(([k,id])=>{
          const bb=document.getElementById(id); if(!bb) return;
          bb.style.background = k===v ? '#025AC6' : '#fff'; bb.style.color = k===v ? '#fff' : '#025AC6'; });
        gdLoad();
        return;
      }
      if(G) G.style.display='none';
      const gb=document.getElementById('ovd-vb-group'); if(gb){ gb.style.background='#fff'; gb.style.color='#025AC6'; }
      return _orig.apply(this, arguments);
    };
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
