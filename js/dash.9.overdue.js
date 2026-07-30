/* ══════════════════════════════════════════════════════════════════════════
   OVERDUE TAB  (dash.9)  —  Harvest ▸ ⏳ Overdue
   ------------------------------------------------------------------------
   Mirrors the overdue rule inside Spawn Harvest (harvest_v3.html →
   computeOverdue) EXACTLY, so the dashboard and the collector PWA can never
   disagree again:

     A vendo is overdue when
       • vendos.status = 'active', AND
       • its harvest_group_items row is not 'pulled_out', AND
       • more than N days (default 30) since last harvest.

     Last harvest = MAX( vendos.last_harvest_date ,
                         harvest_group_items.harvested_at where status='harvested' )
     compared in Manila calendar days (harvested_at is UTC timestamptz — slicing
     the raw string would read a 06:00 Manila harvest as the previous day).
     Never harvested = 9999 days.

   Read-only. No writes anywhere in this file.
   ══════════════════════════════════════════════════════════════════════════ */

var _ovdRaw    = null;          // {gs, items, V} — one fetch, reused when threshold changes
var _ovdTs     = 0;
var _ovdRows   = [];            // one row per overdue (vendo, group)
var _ovdArea   = {};            // AREA -> {overdue, oldest, groups:Set}
var _ovdGroup  = {};            // group id -> {overdue, oldest, label, area, collector}
var _ovdSelArea  = '';
var _ovdSelGroup = '';
var _ovdThresh = 30;
var _ovdSort   = {k:'days', dir:-1};
var _ovdBusy   = false;
const _OVD_TTL = 5*60*1000;

const _ovdFmtDays = d => {
  d = parseInt(d)||0;
  if(d >= 9999) return 'never';
  if(d < 30) return d+'d';
  const mo = Math.floor(d/30), rd = d%30;
  return rd > 0 ? mo+'mo '+rd+'d' : mo+'mo';
};
// badge colour by COUNT — same tiers as the PWA home screen
const _ovdTier = n => n>=100 ? '#DF1A35' : n>=50 ? '#FEB30C' : '#028867';
// badge colour by AGE of one machine
function _ovdAgeTier(d){
  if(d>=9999) return {bg:'#f5f3ff', fg:'#311A8E', bd:'#ddd6fe'};
  if(d>=180)  return {bg:'#fef2f2', fg:'#DF1A35', bd:'#fecaca'};
  if(d>=90)   return {bg:'#fff7ed', fg:'#c2410c', bd:'#fed7aa'};
  return {bg:'#fffbeb', fg:'#a16207', bd:'#fde68a'};
}
const _ovdEsc = s => String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const _ovdTitle = a => a ? a.charAt(0)+a.slice(1).toLowerCase() : '—';

/* ── 1. FETCH ─────────────────────────────────────────────────────────── */
async function _ovdFetchAll(){
  const SB = _SB, H = _HDR;

  // groups — treated as permanent defs, deduped per (group_id, area) like the PWA
  const rg = await fetch(`${SB}/rest/v1/harvest_groups?select=id,group_id,group_label,area,collector&order=area.asc,group_id.asc,id.asc&limit=200`, {headers:H});
  const graw = await rg.json();
  if(!Array.isArray(graw)) throw new Error('harvest_groups fetch failed');
  const seen = {}, gs = [];
  graw.forEach(r => {
    const k = (r.group_id||r.id)+'__'+(r.area||'');
    if(!seen[k]){ seen[k] = 1; gs.push(r); }
  });
  const ids = gs.map(g=>g.id).filter(x=>x!=null);
  if(!ids.length) return {gs:[], items:[], V:{}};

  // items — PostgREST caps at 1000 rows, so page it
  const items = [];
  for(let off = 0; off < 20000; off += 900){
    const r = await fetch(`${SB}/rest/v1/harvest_group_items?group_run_id=in.(${ids.join(',')})&select=group_run_id,vendo_id,status,harvested_at&order=id.asc&limit=900&offset=${off}`, {headers:H});
    const b = await r.json();
    if(!Array.isArray(b) || !b.length) break;
    items.push(...b);
    if(b.length < 900) break;
  }

  // live vendo state — NOT the vendos_table cache (that is a nightly cron snapshot
  // and is exactly why these counts used to lag reality)
  const vids = [...new Set(items.map(i=>i.vendo_id).filter(x=>x!=null))];
  const V = {};
  for(let i = 0; i < vids.length; i += 250){
    const chunk = vids.slice(i, i+250);
    const r = await fetch(`${SB}/rest/v1/vendos?id=in.(${chunk.join(',')})&select=id,vendo_code,sheet_name,tg_name,owner_name,area,barangay,address,vlan,last_harvest_date,status,contact_number,is_online&limit=300`, {headers:H});
    const b = await r.json();
    if(Array.isArray(b)) b.forEach(v => V[v.id] = v);
  }
  return {gs, items, V};
}

/* ── 2. COMPUTE ───────────────────────────────────────────────────────── */
function _ovdComputeFrom(raw, thresh){
  const {gs, items, V} = raw;
  const dateMap = {}, statusMap = {};
  Object.values(V).forEach(v => { dateMap[v.id] = v.last_harvest_date; statusMap[v.id] = v.status; });

  // item rows are fresher than any vendo snapshot — let them win
  items.forEach(row => {
    if(row.vendo_id == null) return;
    if(row.status === 'pulled_out'){ statusMap[row.vendo_id] = 'pulled_out'; return; }
    if(row.status === 'harvested' && row.harvested_at){
      const d = new Date(row.harvested_at).toLocaleDateString('en-CA', {timeZone:'Asia/Manila'});
      if(d > (dateMap[row.vendo_id]||'')) dateMap[row.vendo_id] = d;
    }
  });

  const now = Date.now();
  const gmap = {}; gs.forEach(g => gmap[g.id] = g);
  const rows = [], byArea = {}, byGroup = {};

  gs.forEach(g => {
    byGroup[g.id] = {
      overdue: 0, oldest: 0, total: 0,
      label: g.group_label || g.group_id || ('Group '+g.id),
      area: (g.area||'').toUpperCase(),
      collector: g.collector || ''
    };
  });

  items.forEach(row => {
    const g = gmap[row.group_run_id]; if(!g) return;
    const gb = byGroup[g.id]; if(!gb) return;
    const st = statusMap[row.vendo_id];
    if(st && st !== 'active') return;              // gone
    if(row.status === 'pulled_out') return;        // gone
    gb.total++;

    const lhd  = dateMap[row.vendo_id];
    const days = lhd ? Math.floor((now - new Date(lhd+'T12:00:00'))/86400000) : 9999;
    const area = (g.area||'').toUpperCase(); if(!area) return;
    if(!byArea[area]) byArea[area] = {overdue:0, oldest:0, groups:new Set()};
    byArea[area].groups.add(g.id);
    if(days < 9999){
      if(days > gb.oldest) gb.oldest = days;
      if(days > byArea[area].oldest) byArea[area].oldest = days;
    }
    if(days <= thresh) return;

    gb.overdue++;
    byArea[area].overdue++;
    const v = V[row.vendo_id] || {};
    rows.push({
      vendo_id: row.vendo_id,
      code: v.vendo_code || '',
      name: v.sheet_name || v.tg_name || v.owner_name || ('vendo #'+row.vendo_id),
      tg:   v.tg_name || '',
      owner: v.owner_name || '',
      area, barangay: v.barangay || v.address || '',
      vlan: v.vlan == null ? '' : v.vlan,
      lhd: lhd || '',
      days,
      online: v.is_online === true,
      contact: v.contact_number || '',
      gid: g.id,
      glabel: gb.label
    });
  });

  // one vendo can sit in more than one group — collapse to one table row, keep both labels
  const merged = {};
  rows.forEach(r => {
    const k = r.vendo_id;
    if(!merged[k]){ merged[k] = Object.assign({}, r, {groups:[r.glabel], gids:[r.gid]}); }
    else {
      if(merged[k].groups.indexOf(r.glabel) < 0) merged[k].groups.push(r.glabel);
      merged[k].gids.push(r.gid);
    }
  });

  return {rows: Object.values(merged), rowCount: rows.length, byArea, byGroup};
}

/* ── 3. LOAD ──────────────────────────────────────────────────────────── */
async function ovdLoad(force){
  if(_ovdBusy) return;
  const tb = document.getElementById('ovd-tbody');
  if(!_ovdRaw || force || (Date.now() - _ovdTs > _OVD_TTL)){
    _ovdBusy = true;
    const cards = document.getElementById('ovd-cards');
    if(cards) cards.innerHTML = '<div style="padding:22px;color:#6b7280;font-size:13px;">Computing overdue from live vendo state…</div>';
    if(tb) tb.innerHTML = '<tr><td colspan="8" style="padding:26px;text-align:center;color:#9ca3af;font-size:12px;">Loading…</td></tr>';
    try{
      _ovdRaw = await _ovdFetchAll();
      _ovdTs = Date.now();
    }catch(e){
      _ovdBusy = false;
      if(cards) cards.innerHTML = '<div style="padding:18px;color:#DF1A35;font-size:13px;font-weight:700;">Load failed: '+_ovdEsc(e.message)+'</div>';
      if(tb) tb.innerHTML = '';
      return;
    }
    _ovdBusy = false;
  }
  ovdRecompute();
}

function ovdRecompute(){
  if(!_ovdRaw) return;
  const sel = document.getElementById('ovd-thresh');
  _ovdThresh = sel ? parseInt(sel.value) : 30;
  const out = _ovdComputeFrom(_ovdRaw, _ovdThresh);
  _ovdRows  = out.rows;
  _ovdArea  = out.byArea;
  _ovdGroup = out.byGroup;
  _ovdRowCount = out.rowCount;
  ovdRender();
}
var _ovdRowCount = 0;

/* ── 4. RENDER ────────────────────────────────────────────────────────── */
function ovdRender(){
  ovdRenderCards();
  ovdRenderGroups();
  ovdRenderTable();
  const age = document.getElementById('ovd-age');
  if(age) age.textContent = _ovdTs ? 'live · '+Math.max(0, Math.round((Date.now()-_ovdTs)/60000))+'min ago' : '';
}

function ovdRenderCards(){
  const el = document.getElementById('ovd-cards'); if(!el) return;
  const ranked = Object.entries(_ovdArea)
    .map(([area,o]) => ({area, overdue:o.overdue, oldest:o.oldest, groups:o.groups.size}))
    .filter(x => x.overdue > 0)
    .sort((a,b) => b.overdue - a.overdue);

  const total  = ranked.reduce((s,x)=>s+x.overdue, 0);
  const never  = _ovdRows.filter(r=>r.days>=9999).length;
  const worst  = _ovdRows.reduce((m,r)=> r.days<9999 && r.days>m ? r.days : m, 0);

  if(!ranked.length){
    el.innerHTML = '<div style="padding:26px;text-align:center;color:#028867;font-size:14px;font-weight:700;">✅ Nothing overdue past '+_ovdThresh+' days.</div>';
    return;
  }

  const stat = (label, val, color) =>
    `<div style="flex:1;min-width:120px;background:#fff;border:1px solid #e5e7eb;border-bottom:3px solid ${color};border-radius:11px;padding:10px 13px;">
       <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">${label}</div>
       <div style="font-size:21px;font-weight:800;color:${color};line-height:1.25;">${val}</div>
     </div>`;

  const cards = ranked.map(x => {
    const on = _ovdSelArea === x.area;
    return `<div onclick="ovdPickArea('${x.area}')" style="cursor:pointer;background:${on?'#eff6ff':'#fff'};border:1.5px solid ${on?'#025AC6':'#e5e7eb'};border-radius:13px;padding:11px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 8px rgba(2,90,198,.05);transition:.15s;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:15px;font-weight:800;color:#083A82;">${_ovdTitle(x.area)}</div>
        <div style="font-size:11px;color:#6b87a8;">${x.overdue} overdue · ${x.groups} group${x.groups>1?'s':''}${x.oldest?' · oldest '+_ovdFmtDays(x.oldest):''}</div>
      </div>
      <span style="min-width:38px;height:30px;padding:0 11px;border-radius:15px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#fff;background:${_ovdTier(x.overdue)};">${x.overdue}</span>
      <span style="color:#B9C7DC;font-size:16px;">${on?'▾':'›'}</span>
    </div>`;
  }).join('');

  el.innerHTML =
    `<div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:12px;">
       ${stat('Overdue &gt;'+_ovdThresh+'d', total, '#DF1A35')}
       ${stat('Never harvested', never, '#311A8E')}
       ${stat('Oldest machine', _ovdFmtDays(worst), '#FEB30C')}
       ${stat('Areas affected', ranked.length, '#025AC6')}
     </div>
     <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:9px;">${cards}</div>`;
}

function ovdRenderGroups(){
  const el = document.getElementById('ovd-groups'); if(!el) return;
  if(!_ovdSelArea){ el.innerHTML = ''; return; }
  const list = Object.entries(_ovdGroup)
    .filter(([gid,g]) => g.area === _ovdSelArea)
    .map(([gid,g]) => Object.assign({gid:+gid}, g))
    .sort((a,b) => b.overdue - a.overdue);
  if(!list.length){ el.innerHTML = ''; return; }

  const chip = (label, active, onclick, badge, tone) =>
    `<button onclick="${onclick}" style="padding:7px 12px;border-radius:9px;border:1.5px solid ${active?'#025AC6':'#e5e7eb'};background:${active?'#025AC6':'#fff'};color:${active?'#fff':'#1e293b'};font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:7px;">
       ${_ovdEsc(label)}<span style="font-size:11px;font-weight:800;padding:2px 7px;border-radius:6px;background:${active?'rgba(255,255,255,.22)':tone.bg};color:${active?'#fff':tone.fg};">${badge}</span></button>`;

  el.innerHTML =
    `<div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:12px 0 2px;">
       <span style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-right:3px;">${_ovdTitle(_ovdSelArea)} groups</span>
       ${chip('All groups', !_ovdSelGroup, "ovdPickGroup('')", list.reduce((s,g)=>s+g.overdue,0), {bg:'#fef2f2',fg:'#DF1A35'})}
       ${list.map(g => chip(g.label, _ovdSelGroup === String(g.gid), `ovdPickGroup('${g.gid}')`, g.overdue+'/'+g.total, g.overdue>=20?{bg:'#fef2f2',fg:'#DF1A35'}:{bg:'#fffbeb',fg:'#a16207'})).join('')}
       <button onclick="ovdPickArea('')" style="padding:7px 11px;border-radius:9px;border:1px solid #e5e7eb;background:#fff;color:#6b7280;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">✕ clear area</button>
     </div>`;
}

function _ovdVisible(){
  const q = (document.getElementById('ovd-search')?.value || '').trim().toLowerCase();
  let rows = _ovdRows.slice();
  if(_ovdSelArea)  rows = rows.filter(r => r.area === _ovdSelArea);
  if(_ovdSelGroup) rows = rows.filter(r => r.gids.indexOf(+_ovdSelGroup) >= 0);
  if(document.getElementById('ovd-never')?.checked) rows = rows.filter(r => r.days >= 9999);
  if(q) rows = rows.filter(r =>
    (r.name+' '+r.tg+' '+r.owner+' '+r.code+' '+r.area+' '+r.barangay+' '+r.vlan+' '+r.groups.join(' ')).toLowerCase().includes(q));
  const k = _ovdSort.k, dir = _ovdSort.dir;
  rows.sort((a,b) => {
    let x = a[k], y = b[k];
    if(k === 'days'){ x = +x; y = +y; }
    else { x = String(x==null?'':x).toLowerCase(); y = String(y==null?'':y).toLowerCase(); }
    return x < y ? -dir : x > y ? dir : 0;
  });
  return rows;
}

function ovdRenderTable(){
  const tb = document.getElementById('ovd-tbody'); if(!tb) return;
  const rows = _ovdVisible();
  const cnt = document.getElementById('ovd-count');
  if(cnt){
    const extra = (!_ovdSelArea && !_ovdSelGroup && _ovdRowCount !== _ovdRows.length)
      ? ` <span style="color:#9ca3af;">(${_ovdRowCount} group rows — 1 machine sits in 2 groups)</span>` : '';
    cnt.innerHTML = rows.length + ' machine' + (rows.length===1?'':'s') + extra;
  }
  if(!rows.length){
    tb.innerHTML = '<tr><td colspan="8" style="padding:26px;text-align:center;color:#9ca3af;font-size:12px;">No machines match.</td></tr>';
    return;
  }
  tb.innerHTML = rows.map((r,i) => {
    const t = _ovdAgeTier(r.days);
    return `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:7px 8px;color:#9ca3af;font-size:11px;text-align:right;">${i+1}</td>
      <td style="padding:7px 8px;">
        <div style="font-weight:700;color:#025AC6;font-size:12.5px;cursor:pointer;" onclick="ovdGoVendo(${JSON.stringify(r.name).replace(/"/g,'&quot;')})" title="Open in Vendos tab">${_ovdEsc(r.name)}</div>
        <div style="font-size:10.5px;color:#9ca3af;">${_ovdEsc(r.code||'—')}${r.owner && r.owner!==r.name ? ' · '+_ovdEsc(r.owner) : ''}</div>
      </td>
      <td style="padding:7px 8px;font-size:11.5px;color:#374151;">${_ovdTitle(r.area)}${r.barangay?'<div style="font-size:10.5px;color:#9ca3af;">'+_ovdEsc(r.barangay)+'</div>':''}</td>
      <td style="padding:7px 8px;font-size:11.5px;color:#374151;">${_ovdEsc(r.groups.join(', '))}</td>
      <td style="padding:7px 8px;font-size:11.5px;color:#6b7280;text-align:center;">${r.vlan===''?'—':r.vlan}</td>
      <td style="padding:7px 8px;font-size:11.5px;color:#374151;">${r.lhd || '<span style="color:#311A8E;font-weight:700;">never</span>'}</td>
      <td style="padding:7px 8px;text-align:center;">
        <span style="display:inline-block;padding:3px 9px;border-radius:7px;font-size:11.5px;font-weight:800;background:${t.bg};color:${t.fg};border:1px solid ${t.bd};">${_ovdFmtDays(r.days)}</span>
      </td>
      <td style="padding:7px 8px;text-align:center;font-size:11px;">${r.online?'<span style="color:#028867;font-weight:700;">● online</span>':'<span style="color:#9ca3af;">○ offline</span>'}</td>
    </tr>`;
  }).join('');
}

/* ── 5. INTERACTION ───────────────────────────────────────────────────── */
function ovdPickArea(a){
  _ovdSelArea = (_ovdSelArea === a) ? '' : a;
  _ovdSelGroup = '';
  ovdRender();
  const t = document.getElementById('ovd-table-wrap');
  if(t && _ovdSelArea) t.scrollIntoView({behavior:'smooth', block:'start'});
}
function ovdPickGroup(g){ _ovdSelGroup = String(g||''); ovdRender(); }
function ovdSort(k){
  if(_ovdSort.k === k) _ovdSort.dir = -_ovdSort.dir;
  else _ovdSort = {k, dir: k==='days' ? -1 : 1};
  ovdRenderTable();
}
function ovdGoVendo(name){
  const btn = document.getElementById('hbtn-htable');
  if(!btn || typeof hvNewTab !== 'function') return;
  hvNewTab('htable', btn);
  const set = () => { const s = document.getElementById('ht-search'); if(s){ s.value = name; if(typeof htFilter==='function') htFilter(); } };
  set(); setTimeout(set, 700);
}
function ovdExport(){
  const rows = _ovdVisible();
  if(!rows.length){ if(typeof toast==='function') toast('Nothing to export'); return; }
  const head = ['#','Vendo','Code','Owner','Area','Barangay','Group(s)','VLAN','Last harvest','Days overdue','Online'];
  const esc = v => '"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const csv = [head.join(',')].concat(rows.map((r,i) =>
    [i+1, r.name, r.code, r.owner, r.area, r.barangay, r.groups.join(' | '), r.vlan, r.lhd || 'never',
     r.days>=9999 ? 'never' : r.days, r.online?'online':'offline'].map(esc).join(','))).join('\n');
  const scope = (_ovdSelArea || 'ALL') + (_ovdSelGroup ? '-G'+_ovdSelGroup : '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'}));
  a.download = 'spawn_overdue_'+scope+'_'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
  if(typeof toast==='function') toast('Exported '+rows.length+' machines');
}
function ovdCopyList(){
  const rows = _ovdVisible();
  if(!rows.length) return;
  const txt = rows.map((r,i) => (i+1)+'. '+r.name+(r.vlan!==''?' (VLAN '+r.vlan+')':'')+' — '+_ovdFmtDays(r.days)+' — '+r.groups.join('/')).join('\n');
  navigator.clipboard.writeText(txt).then(
    () => { if(typeof toast==='function') toast('Copied '+rows.length+' machines'); },
    () => { if(typeof toast==='function') toast('Copy blocked by browser'); });
}
