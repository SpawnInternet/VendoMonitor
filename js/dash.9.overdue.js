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

var _ovdView   = 'list';
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
// A non-array reply means PostgREST rejected the query (bad column, bad filter,
// gateway ALLOW miss). Swallowing it produces a screen full of "vendo #4 / never"
// and badly inflated counts, which looks like real data. Fail loudly instead.
async function _ovdGet(url, what){
  const r = await fetch(url, {headers:_HDR});
  const b = await r.json().catch(() => null);
  if(!Array.isArray(b)){
    const why = (b && (b.message || b.hint || b.error)) || ('HTTP '+r.status);
    throw new Error(what+': '+why);
  }
  return b;
}

async function _ovdFetchAll(){
  const SB = _SB;

  // groups — treated as permanent defs, deduped per (group_id, area) like the PWA
  const graw = await _ovdGet(`${SB}/rest/v1/harvest_groups?select=id,group_id,group_label,area,collector&order=area.asc,group_id.asc,id.asc&limit=200`, 'harvest_groups');
  const seen = {}, gs = [];
  graw.forEach(r => {
    const k = (r.group_id||r.id)+'__'+(r.area||'');
    if(!seen[k]){ seen[k] = 1; gs.push(r); }
  });
  const ids = gs.map(g=>g.id).filter(x=>x!=null);
  if(!ids.length) return {gs:[], items:[], V:{}};

  // items — PostgREST caps at 1000 rows, so page it.
  // NOTE: `barangay` lives on harvest_group_items, NOT on vendos. Asking vendos for
  // it 400s the whole request and leaves every machine unresolved.
  const items = [];
  for(let off = 0; off < 20000; off += 900){
    const b = await _ovdGet(`${SB}/rest/v1/harvest_group_items?group_run_id=in.(${ids.join(',')})&select=group_run_id,vendo_id,status,harvested_at,barangay&order=id.asc&limit=900&offset=${off}`, 'harvest_group_items');
    if(!b.length) break;
    items.push(...b);
    if(b.length < 900) break;
  }
  if(!items.length) return {gs, items:[], V:{}};

  // live vendo state — NOT the vendos_table cache (that is a nightly cron snapshot
  // and is exactly why these counts used to lag reality)
  const vids = [...new Set(items.map(i=>i.vendo_id).filter(x=>x!=null))];
  const V = {};
  for(let i = 0; i < vids.length; i += 250){
    const chunk = vids.slice(i, i+250);
    const b = await _ovdGet(`${SB}/rest/v1/vendos?id=in.(${chunk.join(',')})&select=id,vendo_code,sheet_name,tg_name,owner_name,area,address,vlan,last_harvest_date,status,contact_number,is_online&limit=300`, 'vendos');
    b.forEach(v => V[v.id] = v);
  }
  // a vendo missing from V would silently read as "active, never harvested" —
  // count it so the UI can say so out loud rather than inventing overdue machines
  const missing = vids.filter(id => !V[id]).length;
  return {gs, items, V, missing};
}

/* Free-text address -> barangay. Ported from the SQL used to verify these counts.
   Order matters: DIPOLOG is tested before DAPITAN because "dipolog" contains the
   substring "polo", which otherwise tags 47 Dipolog machines as Dapitan's Polo. */
const _OVD_BGY_RULES = [
  // DIPOLOG
  ['Dicayas',      ['dicayas','diccayas','lalawan','reloc','bayugo','talipapa','slaughter','kan-anan','city jail','sinay','beracha','cedric','ruth 2','kalye','gemilina']],
  ['Minaog',       ['minaog','minao','tonggo','tunggo','tungo','catalina','cacao','bulitong','bantay dagat','tabok']],
  ['Miputak',      ['miputak','quezon ave','lee plaza','velasco','cagatan','lapu-lapu']],
  ['Sta. Isabel',  ['isabel']],
  ['Estaka',       ['estaka','igot','egot','lailay','padre ramon','tabiliran']],
  ['Gulayon',      ['gulayon','bauno','balabag','lumangkad']],
  ['Turno',        ['turno','d.b.p']],
  ['Cogon',        ['cogon','diwan','tingcogas','tingkugas','gusawan']],
  ['Punta',        ['punta','balintawak']],
  ['Sinaman',      ['sinaman']],
  ['Sangkol',      ['sangkol']],
  ['Olingan',      ['olingan']],
  ['Galas',        ['galas']],
  ['Katipunan',    ['katipunan','new tambo']],
  ['Laoy',         ['laoy']],
  // POLANCO
  ['Bandera',      ['bandera']],
  ['Guinles',      ['guinle']],
  ['San Antonio',  ['san antonio','san. antonio','mahogany']],
  ['Maralag',      ['maralag']],
  ['Obay',         ['obay']],
  ['Isis',         ['isis']],
  ['Villahermosa', ['villahermosa']],
  ['Pob. North',   ['north polanco','pob. north','conacon','pon north']],
  ['Polanco',      ['taub','polanco']],
  // ROXAS
  ['Dohinob',      ['dohinob']],
  ['Galukso',      ['galukso','galokso']],
  ['Upper Irasan', ['irasan']],
  ['Roxas',        ['roxas']],
  // SINDANGAN
  ['Goleo',        ['goleo','tansyang','magallanes']],
  ['Dapaon',       ['dapaon']],
  ['Disud',        ['disud']],
  ['Mandih',       ['mandih']],
  ['Bantayan',     ['bantayan']],
  ['Magsaysay',    ['magsaysay']],
  ['Balik-Balik',  ['balik']],
  ['Datu Tangkilan',['tangkilan']],
  ['Piao',         ['piao','piano','piso','lalangan']],
  ['Upper Inuman', ['inuman']],
  ['Tanjay',       ['tanjay']],
  ['Sivilino',     ['sivilino']],
  ['Calatunan',    ['calatunan']],
  ['Lawis',        ['lawis']],
  ['Poblacion',    ['poblacion','burgos','hluillier','jsb']],
  // DAPITAN
  ['Cawa-Cawa',    ['cawa','palaran']],
  ['Sta. Cruz',    ['sta. cruz','sta.cruz','sta cruz','santa cruz','jrmsu','ochotorena']],
  ['Talisay',      ['talisay','maasim','maasin','parki','jerusalem','jerosalim','mahayahay','matagobtob','linao']],
  ['Taguilon',     ['taguilon','taguion','bayanihan','balao','balaw','gemelina','gemalina','lipata','bagong silang','tuyac']],
  ['Sto. Niño',    ['niño','nino','tabiong','biyasong','patag','lucas']],
  ['Banonong',     ['banonong','tambak','dapdap','agriculture','ultimo adios']],
  ['Potol',        ['potol','lourdes','lamatik','punong']],
  ['Canlucani',    ['canlucani','lucktosand','lactusan']],
  ['Lawaan',       ['lawaan','dampa']],
  ['Linabo',       ['linabo','sinonoc']],
  ['Dawo',         ['dawo','mango drive','boulevard','city hall']],
  ['Bagting',      ['bagting','vallecer']],
  ['San Pedro',    ['san pedro']],
  ['Pantalan',     ['pantalan']],
  ['San Vicente',  ['san vicente','kawayan']],
  ['Maria Cristina',['maria cristina']],
  ['Sudlunon',     ['sudlunon']]
];
// Short names that are substrings of other place names. These need a word boundary
// AND must be tested before the generic rules, or "Pian, Polanco" reads as plain
// Polanco and "Polo, Dapitan" loses to nothing at all.
const _OVD_BGY_PRE  = [['Polo','polo'], ['Pian','pian']];
// Tested last: "gusawan" belongs to Cogon, so Gusa must not win first.
const _OVD_BGY_POST = [['Gusa','gusa']];
const _ovdWord = (s,w) => new RegExp('\\b'+w+'\\b').test(s);

function _ovdNormBgy(raw){
  const s = (raw||'').toLowerCase().trim();
  if(!s) return null;
  for(const [name, w] of _OVD_BGY_PRE)  if(_ovdWord(s,w)) return name;
  for(const [name, keys] of _OVD_BGY_RULES){
    for(const k of keys) if(s.indexOf(k) >= 0) return name;
  }
  for(const [name, w] of _OVD_BGY_POST) if(_ovdWord(s,w)) return name;
  if(s.indexOf('pasil')>=0 || s.indexOf('lagbas')>=0 || s.indexOf('lukon')>=0 || s.indexOf('lucon')>=0 || s.indexOf('island')>=0) return 'Polo';
  return null;
}

/* ── 2. COMPUTE ───────────────────────────────────────────────────────── */
function _ovdComputeFrom(raw, thresh){
  const {gs, items, V} = raw;
  const dateMap = {}, statusMap = {}, bgyMap = {};
  items.forEach(row => { if(row.barangay && !bgyMap[row.vendo_id]) bgyMap[row.vendo_id] = row.barangay; });
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
      never: 0, d181: 0, d91: 0, dle90: 0,   // severity split of the overdue machines
      members: [], bgy: {},                  // for the cycle-plan view
      label: g.group_label || g.group_id || ('Group '+g.id),
      code: g.group_id || '',
      area: (g.area||'').toUpperCase(),
      collector: g.collector || ''
    };
  });

  items.forEach(row => {
    const g = gmap[row.group_run_id]; if(!g) return;
    const gb = byGroup[g.id]; if(!gb) return;
    if(!V[row.vendo_id]) return;                   // orphan item row — no vendo behind it
    const st = statusMap[row.vendo_id];
    if(st && st !== 'active') return;              // gone
    if(row.status === 'pulled_out') return;        // gone
    gb.total++;
    if(gb.members.indexOf(row.vendo_id) < 0){
      gb.members.push(row.vendo_id);
      const b = _ovdNormBgy(bgyMap[row.vendo_id] || (V[row.vendo_id]||{}).address);
      const key = b || '(no address)';
      gb.bgy[key] = (gb.bgy[key]||0) + 1;
    }

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
    if(days >= 9999)     gb.never++;
    else if(days > 180)  gb.d181++;
    else if(days > 90)   gb.d91++;
    else                 gb.dle90++;
    byArea[area].overdue++;
    const v = V[row.vendo_id] || {};
    rows.push({
      vendo_id: row.vendo_id,
      code: v.vendo_code || '',
      name: v.sheet_name || v.tg_name || v.owner_name || ('vendo #'+row.vendo_id),
      tg:   v.tg_name || '',
      owner: v.owner_name || '',
      area, barangay: bgyMap[row.vendo_id] || v.address || '',
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
    if(force) _ovdAvgSpawn = null;
    const cards = document.getElementById('ovd-cards');
    if(cards) cards.innerHTML = '<div style="padding:22px;color:#6b7280;font-size:13px;">Computing overdue from live vendo state…</div>';
    if(tb) tb.innerHTML = '<tr><td colspan="8" style="padding:26px;text-align:center;color:#9ca3af;font-size:12px;">Loading…</td></tr>';
    try{
      _ovdRaw = await _ovdFetchAll();
      _ovdTs = Date.now();
    }catch(e){
      _ovdBusy = false; _ovdRaw = null; _ovdTs = 0;
      if(cards) cards.innerHTML = '<div style="padding:16px;border-radius:11px;background:#fef2f2;border:1px solid #fecaca;color:#DF1A35;font-size:13px;font-weight:700;">Load failed — nothing below is real. <br><span style="font-weight:600;font-size:12px;color:#991b1b;">'+_ovdEsc(e.message)+'</span></div>';
      if(tb) tb.innerHTML = '<tr><td colspan="8" style="padding:22px;text-align:center;color:#9ca3af;font-size:12px;">No data.</td></tr>';
      const g = document.getElementById('ovd-groups'); if(g) g.innerHTML = '';
      const c = document.getElementById('ovd-count'); if(c) c.textContent = '';
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
  if(_ovdView === 'plan' && _ovdAvgSpawn) { try{ ovdPlanRender(); }catch(_){} }
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

  const orphan = (_ovdRaw && _ovdRaw.missing) || 0;
  const warn = orphan ? `<div style="margin-bottom:10px;padding:8px 12px;border-radius:9px;background:#fffbeb;border:1px solid #fde68a;color:#a16207;font-size:11.5px;font-weight:700;">⚠ ${orphan} group item row${orphan===1?'':'s'} point at a vendo that no longer exists — excluded from these counts.</div>` : '';

  el.innerHTML = warn +
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
  let list = Object.entries(_ovdGroup)
    .map(([gid,g]) => Object.assign({gid:+gid}, g))
    .filter(g => g.total > 0);
  if(_ovdSelArea) list = list.filter(g => g.area === _ovdSelArea);
  if(!list.length){ el.innerHTML = ''; return; }
  list.sort((a,b) => b.overdue - a.overdue || b.total - a.total);

  const SEG = [
    {k:'never', c:'#311A8E', t:'never harvested'},
    {k:'d181',  c:'#DF1A35', t:'180d+'},
    {k:'d91',   c:'#ea580c', t:'91–180d'},
    {k:'dle90', c:'#FFB725', t:'up to 90d'}
  ];

  const bar = g => {
    const segs = SEG.filter(s => g[s.k] > 0).map(s =>
      `<div title="${g[s.k]} ${s.t}" style="width:${(g[s.k]/g.total*100).toFixed(2)}%;background:${s.c};"></div>`).join('');
    const ok = g.total - g.overdue;
    return `<div style="display:flex;height:9px;border-radius:5px;overflow:hidden;background:#e8f5ef;min-width:90px;">
      ${segs}${ok>0?`<div title="${ok} on time" style="flex:1;background:#d1fae5;"></div>`:''}</div>`;
  };
  const num = (v, color) => `<td style="padding:7px 8px;text-align:center;font-size:12px;font-weight:${v?'800':'400'};color:${v?color:'#d1d5db'};">${v||'·'}</td>`;

  const rows = list.map(g => {
    const on  = _ovdSelGroup === String(g.gid);
    const pct = Math.round(g.overdue/g.total*100);
    const tone = pct>=50 ? '#DF1A35' : pct>=30 ? '#c2410c' : '#a16207';
    return `<tr onclick="ovdPickGroup('${g.gid}','${g.area}')" style="cursor:pointer;border-bottom:1px solid #f1f5f9;background:${on?'#eff6ff':'#fff'};">
      <td style="padding:7px 8px;">
        <div style="font-size:12.5px;font-weight:800;color:${on?'#025AC6':'#1e293b'};">${on?'▸ ':''}${_ovdEsc(g.label)}</div>
        <div style="font-size:10.5px;color:#9ca3af;">${_ovdEsc(g.code)}${g.collector?' · '+_ovdEsc(g.collector):''}</div>
      </td>
      <td style="padding:7px 8px;font-size:11.5px;color:#6b7280;">${_ovdTitle(g.area)}</td>
      <td style="padding:7px 8px;text-align:center;font-size:12px;color:#374151;">${g.total}</td>
      <td style="padding:7px 8px;text-align:center;">
        <span style="display:inline-block;min-width:34px;padding:3px 9px;border-radius:7px;font-size:12.5px;font-weight:800;color:#fff;background:${_ovdTier(g.overdue)};">${g.overdue}</span>
      </td>
      <td style="padding:7px 8px;text-align:right;font-size:12px;font-weight:800;color:${tone};white-space:nowrap;">${pct}%</td>
      <td style="padding:7px 10px 7px 4px;min-width:110px;">${bar(g)}</td>
      ${num(g.dle90,'#a16207')}${num(g.d91,'#ea580c')}${num(g.d181,'#DF1A35')}${num(g.never,'#311A8E')}
      <td style="padding:7px 8px;text-align:right;font-size:11.5px;color:#6b7280;white-space:nowrap;">${g.oldest?_ovdFmtDays(g.oldest):'—'}</td>
    </tr>`;
  }).join('');

  const T = list.reduce((a,g) => {
    ['total','overdue','dle90','d91','d181','never'].forEach(k => a[k] = (a[k]||0)+g[k]);
    a.oldest = Math.max(a.oldest||0, g.oldest||0); return a;
  }, {});
  const Tpct = T.total ? Math.round(T.overdue/T.total*100) : 0;

  const th = (t, align) => `<th style="padding:7px 8px;text-align:${align||'center'};font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;">${t}</th>`;
  const tf = (v, color) => `<td style="padding:8px;text-align:center;font-size:12px;font-weight:800;color:${v?color:'#d1d5db'};">${v||'·'}</td>`;

  el.innerHTML =
  `<div style="margin-top:14px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
    <div style="padding:10px 13px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:9px;flex-wrap:wrap;">
      <span style="font-size:13px;font-weight:800;color:#1e293b;">Breakdown by harvest group</span>
      <span style="font-size:10.5px;color:#9ca3af;">${_ovdSelArea ? _ovdTitle(_ovdSelArea)+' only' : 'all '+list.length+' groups'} · click a row to filter the list below</span>
      <span style="flex:1"></span>
      ${_ovdSelGroup ? `<button onclick="event.stopPropagation();ovdPickGroup('')" style="padding:4px 10px;border-radius:7px;border:1px solid #e5e7eb;background:#fff;color:#6b7280;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">✕ clear group</button>` : ''}
      ${_ovdSelArea ? `<button onclick="event.stopPropagation();ovdPickArea('')" style="padding:4px 10px;border-radius:7px;border:1px solid #e5e7eb;background:#fff;color:#6b7280;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">✕ clear area</button>` : ''}
    </div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#f8fafc;border-bottom:1.5px solid #e5e7eb;">
          ${th('Group','left')}${th('Area','left')}${th('Machines')}${th('Overdue')}${th('Share','right')}${th('Severity mix','left')}
          ${th('≤90d')}${th('91–180d')}${th('180d+')}${th('Never')}${th('Oldest','right')}
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="background:#f8fafc;border-top:1.5px solid #e5e7eb;">
          <td style="padding:8px;font-size:12px;font-weight:800;color:#1e293b;">Total</td>
          <td></td>
          <td style="padding:8px;text-align:center;font-size:12px;font-weight:800;color:#374151;">${T.total||0}</td>
          <td style="padding:8px;text-align:center;font-size:12.5px;font-weight:800;color:#DF1A35;">${T.overdue||0}</td>
          <td style="padding:8px;text-align:right;font-size:12px;font-weight:800;color:#DF1A35;">${Tpct}%</td>
          <td></td>
          ${tf(T.dle90,'#a16207')}${tf(T.d91,'#ea580c')}${tf(T.d181,'#DF1A35')}${tf(T.never,'#311A8E')}
          <td style="padding:8px;text-align:right;font-size:11.5px;font-weight:700;color:#6b7280;">${T.oldest?_ovdFmtDays(T.oldest):'—'}</td>
        </tr></tfoot>
      </table>
    </div>
    <div style="padding:7px 13px;border-top:1px solid #f1f5f9;display:flex;gap:13px;flex-wrap:wrap;font-size:10px;color:#6b7280;">
      ${SEG.map(s=>`<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:9px;height:9px;border-radius:2px;background:${s.c};display:inline-block;"></span>${s.t}</span>`).join('')}
      <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:9px;height:9px;border-radius:2px;background:#d1fae5;display:inline-block;"></span>on time</span>
      <span style="margin-left:auto;">“Machines” = active, not pulled out. Collector shown is the group’s nominal assignment, not who harvested last.</span>
    </div>
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
  const t = document.getElementById('ovd-groups');
  if(t && _ovdSelArea) t.scrollIntoView({behavior:'smooth', block:'nearest'});
}
function ovdPickGroup(g, area){
  const s = String(g||'');
  if(s && _ovdSelGroup === s){ _ovdSelGroup = ''; }   // re-click clears
  else {
    _ovdSelGroup = s;
    if(s && area) _ovdSelArea = area;                 // keep the area cards in step
  }
  ovdRender();
}
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

/* ══════════════════════════════════════════════════════════════════════════
   CYCLE PLAN VIEW  —  Harvest ▸ ⏳ Overdue ▸ 🗓 Cycle plan
   ------------------------------------------------------------------------
   HOW THE REAL ROUTE WORKS (confirmed with Wendell, Jul 2026)

   Two teams. Gilbert + Daryl take everything except Dapitan (697 machines);
   Tandoy takes Dapitan alone (256). Within a team the collectors work the
   queue TOGETHER — combined throughput, not one group each — except that a
   group can be marked SOLO: one collector peels off and runs it alone while
   the rest of the team carries on down the queue. Sindangan is the solo run.

   So daily capacity on the main queue is (collectors − solo runners) × rate,
   and it rises again the day the solo group finishes. Splitting costs nothing
   in total throughput; it only changes routing.

   Everything here is a planning overlay. It reads live machine counts and
   180 days of harvest history, and writes NOTHING to the database — group
   order, collector counts, rates and solo flags live in localStorage.
   ══════════════════════════════════════════════════════════════════════════ */

var _ovdAvgSpawn = null;   // vendo_id -> mean spawn_share (last 180d), fetched lazily
var _ovdPlanBusy = false;
var _ovdPlanLast = null;   // last computed schedule, for CSV

const _OVP_TEAM = {
  A:{label:'Team A', who:'Gilbert + Daryl', areas:'Dipolog · Sindangan · Polanco · Roxas', bg:'#025AC6'},
  B:{label:'Team B', who:'Tandoy',          areas:'Dapitan',                               bg:'#028867'}
};
const _OVP_HUE = {A1:'#025AC6',A2:'#1E7BE8',A3:'#311A8E',A4:'#C01176',A5:'#B45309',A6:'#DF1A35',
                  B1:'#028867',B2:'#0E9F7B',B3:'#116149'};
const _OVP_DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const _OVP_MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const _ovpHue  = c => _OVP_HUE[c] || '#6b7280';
const _ovpIso  = d => d.toISOString().slice(0,10);
const _ovpMk   = s => { const p=(s||'').split('-').map(Number); return new Date(Date.UTC(p[0],p[1]-1,p[2])); };
const _ovpAdd  = (d,n) => new Date(d.getTime()+n*86400000);
const _ovpSun  = d => d.getUTCDay()===0;
const _ovpFmt  = d => d ? _OVP_DOW[(d.getUTCDay()+6)%7]+' '+d.getUTCDate()+' '+_OVP_MON[d.getUTCMonth()].slice(0,3) : '—';

/* ── settings (localStorage; NOT the 'spawn_' prefix, which dash.1 wipes on version bump) ── */
const _OVP_CFG_KEY = 'ovd_plan_cfg_v1';
var _ovdPlanCfg = (function(){
  const dflt = {
    order: ['A1','A4','A2','A5','A3','A6','B1','B2','B3'],  // the rotation Wendell described
    solo:  {A4:true},                                       // Sindangan runs solo, in parallel
    col:   {A:2, B:1},
    rate:  {A:14, B:10}
  };
  try{
    const s=JSON.parse(localStorage.getItem(_OVP_CFG_KEY)||'null');
    if(s && s.order && s.col && s.rate) return Object.assign(dflt, s);
  }catch(_){}
  return dflt;
})();
function _ovdPlanSave(){ try{ localStorage.setItem(_OVP_CFG_KEY, JSON.stringify(_ovdPlanCfg)); }catch(_){} }

function ovdPlanReset(){
  try{ localStorage.removeItem(_OVP_CFG_KEY); }catch(_){}
  _ovdPlanCfg = {order:['A1','A4','A2','A5','A3','A6','B1','B2','B3'], solo:{A4:true}, col:{A:2,B:1}, rate:{A:14,B:10}};
  _ovdPlanSyncInputs();
  ovdPlanRender();
  if(typeof toast==='function') toast('Plan settings reset');
}
function _ovdPlanSyncInputs(){
  const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.value=v; };
  set('ovp-col-a',_ovdPlanCfg.col.A); set('ovp-rate-a',_ovdPlanCfg.rate.A);
  set('ovp-col-b',_ovdPlanCfg.col.B); set('ovp-rate-b',_ovdPlanCfg.rate.B);
}
function ovdPlanCfgFromInputs(){
  const n=(id,d)=>{ const e=document.getElementById(id); const v=e?parseInt(e.value,10):NaN; return isNaN(v)||v<1?d:v; };
  _ovdPlanCfg.col.A=Math.min(9,n('ovp-col-a',2)); _ovdPlanCfg.rate.A=Math.min(80,n('ovp-rate-a',14));
  _ovdPlanCfg.col.B=Math.min(9,n('ovp-col-b',1)); _ovdPlanCfg.rate.B=Math.min(80,n('ovp-rate-b',10));
  _ovdPlanSave(); ovdPlanRender();
}
function ovdPlanToggleSolo(code){
  if(_ovdPlanCfg.solo[code]) delete _ovdPlanCfg.solo[code]; else _ovdPlanCfg.solo[code]=true;
  _ovdPlanSave(); ovdPlanRender();
}
function ovdPlanMove(code, dir){
  const o=_ovdPlanCfg.order.slice();
  const i=o.indexOf(code); if(i<0) return;
  // only swap with the neighbour on the same team, so A and B queues stay separate
  const team=c=>c.charAt(0);
  let j=i+dir;
  while(j>=0 && j<o.length && team(o[j])!==team(code)) j+=dir;
  if(j<0 || j>=o.length) return;
  o[i]=o[j]; o[j]=code;
  _ovdPlanCfg.order=o; _ovdPlanSave(); ovdPlanRender();
}

function ovdSetView(v){
  _ovdView = v;
  const L=document.getElementById('ovd-view-list'), P=document.getElementById('ovd-view-plan');
  if(L) L.style.display = v==='list' ? 'block' : 'none';
  if(P) P.style.display = v==='plan' ? 'block' : 'none';
  [['list','ovd-vb-list'],['plan','ovd-vb-plan']].forEach(([k,id])=>{
    const b=document.getElementById(id); if(!b) return;
    b.style.background = k===v ? '#025AC6' : '#fff';
    b.style.color      = k===v ? '#fff'    : '#025AC6';
  });
  if(v==='plan'){
    const s=document.getElementById('ovp-start');
    if(s && !s.value){                       // default: the 1st of next month
      const t=new Date();
      s.value=_ovpIso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth()+1, 1)));
    }
    _ovdPlanSyncInputs();
    ovdPlanLoad();
  }
}

/* mean spawn share per machine — one lazy fetch, reused */
async function _ovdLoadAvgSpawn(){
  if(_ovdAvgSpawn) return _ovdAvgSpawn;
  const since = _ovpIso(_ovpAdd(new Date(), -180));
  const sum={}, cnt={};
  for(let off=0; off<20000; off+=900){
    const b = await _ovdGet(`${_SB}/rest/v1/harvests?select=vendo_id,spawn_share&harvest_date=gte.${since}`+
                            `&spawn_share=gt.0&is_test=is.false&order=id.asc&limit=900&offset=${off}`, 'harvests');
    if(!b.length) break;
    b.forEach(h=>{ if(h.vendo_id==null) return;
      sum[h.vendo_id]=(sum[h.vendo_id]||0)+Number(h.spawn_share); cnt[h.vendo_id]=(cnt[h.vendo_id]||0)+1; });
    if(b.length<900) break;
  }
  _ovdAvgSpawn={}; Object.keys(sum).forEach(k=>{ _ovdAvgSpawn[k]=sum[k]/cnt[k]; });
  return _ovdAvgSpawn;
}

async function ovdPlanLoad(){
  if(_ovdPlanBusy) return;
  const adv=document.getElementById('ovd-plan-advice');
  if(!_ovdRaw || !_ovdAvgSpawn){
    _ovdPlanBusy=true;
    if(adv) adv.innerHTML='<div style="padding:16px;color:#6b7280;font-size:13px;">Reading machine counts and 180 days of harvest history…</div>';
    try{
      if(!_ovdRaw){ _ovdRaw = await _ovdFetchAll(); _ovdTs=Date.now(); ovdRecompute(); }
      await _ovdLoadAvgSpawn();
    }catch(e){
      _ovdPlanBusy=false;
      if(adv) adv.innerHTML='<div style="padding:16px;border-radius:11px;background:#fef2f2;border:1px solid #fecaca;color:#DF1A35;font-size:13px;font-weight:700;">Load failed — nothing below is real.<br><span style="font-weight:600;font-size:12px;color:#991b1b;">'+_ovdEsc(e.message)+'</span></div>';
      return;
    }
    _ovdPlanBusy=false;
  }
  ovdPlanRender();
}

/* group rows in the configured route order, with live counts + projected money */
function _ovdPlanGroups(){
  const ord=_ovdPlanCfg.order;
  const rank=c=>{ const i=ord.indexOf(c); return i<0 ? 900+c.charCodeAt(1) : i; };
  return Object.entries(_ovdGroup)
    .map(([gid,g]) => {
      const code=(g.code||'').toUpperCase();
      let sum=0, hist=0;
      (g.members||[]).forEach(vid=>{ const a=_ovdAvgSpawn && _ovdAvgSpawn[vid]; if(a){ sum+=a; hist++; } });
      const avg = hist ? sum/hist : 0;
      return {gid:+gid, code, team: code.charAt(0)==='B' ? 'B' : 'A', label:g.label,
              machines:g.total, overdue:g.overdue, avg, hist, proj:avg*g.total,
              bgys:Object.entries(g.bgy||{}).sort((a,b)=>b[1]-a[1])};
    })
    .filter(g => g.machines > 0)
    .sort((a,b) => rank(a.code) - rank(b.code));
}

/* ── THE MODEL ───────────────────────────────────────────────────────────
   Per team: `col` collectors at `rate` machines/day each, working the queue
   together. Groups flagged solo are pulled onto their own single-collector
   track running from day 1; while a solo track is active the main queue only
   has (col − 1) collectives on it. With one collector a solo flag is
   meaningless, so it is ignored.                                          */
function _ovdPlanSchedule(over){
  const startEl=document.getElementById('ovp-start');
  const start=_ovpMk(startEl && startEl.value ? startEl.value : _ovpIso(new Date()));
  if(isNaN(start.getTime())) return null;
  const skip=!!document.getElementById('ovp-sun')?.checked;
  const cfg=_ovdPlanCfg;
  const MAXD=400;

  // working-day calendar
  const DAYS=[]; let d=new Date(start.getTime());
  while(DAYS.length<MAXD){ if(!(skip && _ovpSun(d))) DAYS.push(new Date(d.getTime())); d=_ovpAdd(d,1); }

  const all=_ovdPlanGroups(), byDay={}, rows=[], teams={};
  ['A','B'].forEach(t=>{
    const G=all.filter(g=>g.team===t); if(!G.length) return;
    const N=Math.max(1, (over&&over.col&&over.col[t]) || cfg.col[t] || 1);
    const R=Math.max(1, (over&&over.rate&&over.rate[t]) || cfg.rate[t] || 12);
    const soloOn = N>1;
    const solo = soloOn ? G.filter(g=>cfg.solo[g.code]) : [];
    const main = G.filter(g=>!(soloOn && cfg.solo[g.code]));

    const busy=new Array(MAXD).fill(0);   // collectors tied up on solo runs, per working day
    let lastIdx=-1;

    // solo track — one collector, sequential
    let si=0;
    solo.forEach(g=>{
      let left=g.machines, days=0, first=null, last=null;
      while(left>0 && si<MAXD){
        const take=Math.min(R,left); left-=take; days++;
        busy[si]=Math.min(N-1, (busy[si]||0)+1);
        if(!first) first=DAYS[si];
        last=DAYS[si];
        (byDay[_ovpIso(DAYS[si])]=byDay[_ovpIso(DAYS[si])]||[]).push({code:g.code,n:take,solo:true});
        si++;
      }
      lastIdx=Math.max(lastIdx, si-1);
      rows.push(Object.assign({}, g, {days, first, last, solo:true, rate:R, hands:1}));
    });

    // main queue — (N − busy) collectors that day
    let mi=0;
    main.forEach(g=>{
      let left=g.machines, days=0, first=null, last=null, guard=0;
      while(left>0 && mi<MAXD && guard++<MAXD){
        const hands=N-(busy[mi]||0);
        if(hands<=0){ mi++; continue; }
        const take=Math.min(hands*R, left); left-=take; days++;
        if(!first) first=DAYS[mi];
        last=DAYS[mi];
        (byDay[_ovpIso(DAYS[mi])]=byDay[_ovpIso(DAYS[mi])]||[]).push({code:g.code,n:take,solo:false});
        mi++;
      }
      lastIdx=Math.max(lastIdx, mi-1);
      rows.push(Object.assign({}, g, {days, first, last, solo:false, rate:R, hands:N}));
    });

    teams[t]={N, R, used:lastIdx+1, machines:G.reduce((a,g)=>a+g.machines,0),
              soloCodes:solo.map(g=>g.code), end:DAYS[Math.max(0,lastIdx)]};
  });
  return {rows, byDay, start, skip, teams, DAYS};
}

function _ovpWorkingDaysLeft(start, skip){
  const y=start.getUTCFullYear(), m=start.getUTCMonth();
  const dim=new Date(Date.UTC(y,m+1,0)).getUTCDate();
  let n=0;
  for(let dd=start.getUTCDate(); dd<=dim; dd++) if(!(skip && _ovpSun(new Date(Date.UTC(y,m,dd))))) n++;
  return n;
}
/* smallest rate/collector that clears the team inside W working days */
function _ovpNeededRate(t, W){
  for(let r=1;r<=80;r++){
    const s=_ovdPlanSchedule({rate:{[t]:r}});
    if(s && s.teams[t] && s.teams[t].used<=W) return r;
  }
  return null;
}

function ovdPlanRender(){
  if(!_ovdRaw || !_ovdAvgSpawn) return;
  const S=_ovdPlanSchedule(); if(!S) return;
  _ovdPlanLast=S;
  const {rows, byDay, start, skip, teams} = S;
  const wd=_ovpWorkingDaysLeft(start, skip);
  const monthName=_OVP_MON[start.getUTCMonth()];

  /* ── verdict: does the month clear? ── */
  let verdict='';
  ['A','B'].forEach(t=>{
    const T=teams[t]; if(!T) return;
    const ok=T.used<=wd;
    const need=ok?null:_ovpNeededRate(t, wd);
    const meta=_OVP_TEAM[t];
    verdict += `<div style="flex:1;min-width:290px;padding:11px 14px;border-radius:11px;border:1px solid ${ok?'#a7f3d0':'#fde68a'};border-left:4px solid ${ok?'#028867':'#FFB725'};background:${ok?'#ecfdf5':'#fffbeb'};font-size:12.5px;line-height:1.6;color:#1e293b;">
      <div style="font-weight:800;font-size:13px;margin-bottom:2px;">${ok?'✅':'⚠️'} ${meta.label} — ${ok?'clears '+monthName:'does not clear '+monthName}</div>
      ${T.machines} machines · ${T.N} collector${T.N>1?'s':''} × ${T.R}/day
      ${T.soloCodes.length?' · '+T.soloCodes.join(', ')+' run solo':''}<br>
      needs <b>${T.used} working days</b>, month has <b>${wd}</b>${ok?` — <b>${wd-T.used} spare</b>`:` — <b>${T.used-wd} over</b>`}
      ${need?`<br>Clears at <b>${need}/day each</b> (${need*T.N}/day combined).`:''}
      ${!ok&&!need?'<br>No rate up to 80/day clears it — add a collector.':''}
    </div>`;
  });
  document.getElementById('ovd-plan-advice').innerHTML =
    `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">${verdict}</div>`;

  /* ── per-team tables ── */
  const th=(x,a)=>`<th style="padding:8px;text-align:${a||'center'};font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;">${x}</th>`;
  let html='';
  ['A','B'].forEach(t=>{
    const R=rows.filter(r=>r.team===t); if(!R.length) return;
    const T=teams[t], meta=_OVP_TEAM[t];
    const tot=R.reduce((a,r)=>({m:a.m+r.machines,o:a.o+r.overdue,p:a.p+r.proj}),{m:0,o:0,p:0});
    const ends=R.map(r=>r.last).filter(Boolean).sort((a,b)=>a-b);
    html += `<div style="margin-bottom:16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="padding:9px 13px;background:${meta.bg};color:#fff;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
        <span style="font-size:14px;font-weight:800;">${meta.label}</span>
        <span style="font-size:11px;opacity:.9;font-weight:600;">${meta.who} · ${meta.areas} · ${tot.m} machines</span>
        <span style="flex:1"></span>
        <span style="font-size:12px;font-weight:800;">${_ovpFmt(R[0].first)} → ${_ovpFmt(ends[ends.length-1])} · ${T.used} working days</span>
      </div>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#f8fafc;border-bottom:1.5px solid #e5e7eb;">
          ${th('#','center')}${th('Group','left')}${th('Barangays covered','left')}${th('Machines')}${th('Overdue')}${th('Hands')}${th('Days')}${th('Projected Spawn','right')}${th('Start','right')}${th('End','right')}
        </tr></thead><tbody>
        ${R.map((r,i)=>{
          const listed=r.bgys.reduce((a,b)=>a+b[1],0), rest=r.machines-listed;
          const thin=r.hist < r.machines*0.6;
          const soloOn=!!_ovdPlanCfg.solo[r.code];
          return `<tr style="border-bottom:1px solid #f1f5f9;background:${r.solo?'#fdf4ff':'#fff'};">
            <td style="padding:7px 4px;text-align:center;white-space:nowrap;vertical-align:top;">
              <button onclick="ovdPlanMove('${r.code}',-1)" title="Move earlier" style="border:1px solid #e5e7eb;background:#fff;border-radius:4px;cursor:pointer;font-size:9px;padding:1px 4px;line-height:1.3;font-family:inherit;">▲</button>
              <button onclick="ovdPlanMove('${r.code}',1)" title="Move later" style="border:1px solid #e5e7eb;background:#fff;border-radius:4px;cursor:pointer;font-size:9px;padding:1px 4px;line-height:1.3;font-family:inherit;">▼</button>
            </td>
            <td style="padding:7px 8px;vertical-align:top;">
              <span style="font:700 10px/1 ui-monospace,Menlo,monospace;letter-spacing:.06em;color:#fff;background:${_ovpHue(r.code)};padding:3px 6px;border-radius:3px;">${_ovdEsc(r.code)}</span>
              <div style="font-size:12.5px;font-weight:800;color:#1e293b;margin-top:3px;">${_ovdEsc(r.label)}</div>
              <button onclick="ovdPlanToggleSolo('${r.code}')" title="One collector peels off and runs this group alone"
                style="margin-top:4px;border:1px solid ${soloOn?'#C01176':'#e5e7eb'};background:${soloOn?'#C01176':'#fff'};color:${soloOn?'#fff':'#6b7280'};border-radius:5px;cursor:pointer;font-size:9.5px;font-weight:800;padding:2px 7px;font-family:inherit;">
                ${soloOn?'☝ SOLO RUN':'+ solo run'}</button>
              ${soloOn&&T.N<2?'<div style="font-size:9px;color:#a16207;font-weight:700;margin-top:2px;">needs 2+ collectors</div>':''}
            </td>
            <td style="padding:7px 8px;font-size:11px;color:#6b7280;line-height:1.5;max-width:280px;">
              ${r.bgys.slice(0,6).map(b=>`<span style="color:#1e293b;font-weight:600;">${_ovdEsc(b[0])}</span>&#8202;${b[1]}`).join(' · ')}
              ${rest>0?` · <span style="color:#1e293b;font-weight:600;">+${rest}</span>&#8202;elsewhere`:''}
            </td>
            <td style="padding:7px 8px;text-align:center;font-size:12px;font-weight:700;color:#374151;">${r.machines}</td>
            <td style="padding:7px 8px;text-align:center;font-size:12px;font-weight:700;color:${r.overdue>=50?'#DF1A35':'#9ca3af'};">${r.overdue}</td>
            <td style="padding:7px 8px;text-align:center;font-size:11px;font-weight:700;color:${r.solo?'#C01176':'#6b7280'};white-space:nowrap;">${r.hands}×${r.rate}</td>
            <td style="padding:7px 8px;text-align:center;font-size:12px;font-weight:700;color:#374151;">${r.days}</td>
            <td style="padding:7px 8px;text-align:right;font-size:12px;font-weight:800;color:#028867;white-space:nowrap;">${_php(r.proj)}
              ${thin?`<div style="font-size:9.5px;font-weight:600;color:#a16207;">only ${r.hist}/${r.machines} with history</div>`:''}</td>
            <td style="padding:7px 8px;text-align:right;font-size:11.5px;font-weight:600;color:#374151;white-space:nowrap;">${_ovpFmt(r.first)}</td>
            <td style="padding:7px 8px;text-align:right;font-size:11.5px;font-weight:600;color:#374151;white-space:nowrap;">${_ovpFmt(r.last)}</td>
          </tr>`;}).join('')}
        </tbody>
        <tfoot><tr style="background:#f8fafc;border-top:1.5px solid #e5e7eb;">
          <td colspan="3" style="padding:8px;font-size:12px;font-weight:800;color:#1e293b;">Subtotal · ${meta.label} · ${T.N}×${T.R} = ${T.N*T.R}/day combined</td>
          <td style="padding:8px;text-align:center;font-size:12px;font-weight:800;">${tot.m}</td>
          <td style="padding:8px;text-align:center;font-size:12px;font-weight:800;color:#DF1A35;">${tot.o}</td>
          <td></td>
          <td style="padding:8px;text-align:center;font-size:12px;font-weight:800;">${T.used}</td>
          <td style="padding:8px;text-align:right;font-size:12.5px;font-weight:800;color:#028867;">${_php(tot.p)}</td>
          <td colspan="2" style="padding:8px;text-align:right;font-size:11.5px;font-weight:700;color:#6b7280;">${_ovpFmt(R[0].first)} → ${_ovpFmt(ends[ends.length-1])}</td>
        </tr></tfoot>
      </table></div></div>`;
  });
  document.getElementById('ovd-plan-teams').innerHTML = html;

  /* ── month grids ── */
  const days=Object.keys(byDay).sort();
  if(!days.length){ document.getElementById('ovd-plan-cal').innerHTML=''; return; }
  const lastDay=_ovpMk(days[days.length-1]);
  let cur=new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)), cal='', guard=0;
  while(cur<=lastDay && guard++<18){
    const y=cur.getUTCFullYear(), m=cur.getUTCMonth();
    const dim=new Date(Date.UTC(y,m+1,0)).getUTCDate();
    const lead=(new Date(Date.UTC(y,m,1)).getUTCDay()+6)%7;
    let cells='';
    for(let i=0;i<lead;i++) cells+='<div></div>';
    for(let dd=1;dd<=dim;dd++){
      const dt=new Date(Date.UTC(y,m,dd));
      const jobs=byDay[_ovpIso(dt)]||[];
      const rest=skip && _ovpSun(dt) && !jobs.length;
      const inMonth = m===start.getUTCMonth() && y===start.getUTCFullYear();
      cells+=`<div style="background:${rest?'repeating-linear-gradient(135deg,#fff,#fff 5px,#f1f5f9 5px,#f1f5f9 10px)':'#fff'};border:1px solid ${!inMonth?'#f1f5f9':'#e5e7eb'};border-radius:7px;min-height:70px;padding:5px 6px;">
        <div style="font-size:10.5px;font-weight:800;color:${rest?'#cbd5e1':'#9ca3af'};">${dd}</div>
        ${rest?'<div style="font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#cbd5e1;">rest</div>':''}
        ${jobs.map(j=>`<div style="display:flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;margin-top:2px;">
            <span style="width:3px;height:14px;border-radius:1px;background:${_ovpHue(j.code)};flex:0 0 3px;"></span>
            <span style="color:#1e293b;">${_ovdEsc(j.code)}${j.solo?'<span title="solo run" style="color:#C01176;">☝</span>':''}</span>
            <span style="margin-left:auto;color:#9ca3af;font-size:10px;">${j.n}</span></div>`).join('')}
      </div>`;
    }
    cal+=`<div style="font-size:14px;font-weight:800;color:#1e293b;margin:4px 0 7px;">${_OVP_MON[m]} ${y}</div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px;">
        ${_OVP_DOW.map(x=>`<div style="font-size:9.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af;text-align:center;">${x}</div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:16px;">${cells}</div>`;
    cur=new Date(Date.UTC(y,m+1,1));
  }
  cal+=`<div style="display:flex;flex-wrap:wrap;gap:11px;font-size:10.5px;color:#6b7280;padding:9px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:11px;">
    ${rows.map(r=>`<span style="display:inline-flex;align-items:center;gap:5px;color:#1e293b;"><span style="width:9px;height:9px;border-radius:2px;background:${_ovpHue(r.code)};display:inline-block;"></span>${_ovdEsc(r.code)}${r.solo?' ☝':''} ${_ovdEsc(r.label)}</span>`).join('')}
    <span style="margin-left:auto;">☝ = solo run, one collector alone while the rest work the queue. Numbers are machines that day. Nothing here is written to the database.</span>
  </div>`;
  document.getElementById('ovd-plan-cal').innerHTML = cal;
}

function ovdPlanFit(){
  const S=_ovdPlanSchedule(); if(!S) return;
  const wd=_ovpWorkingDaysLeft(S.start, S.skip); if(!wd) return;
  let msg=[];
  ['A','B'].forEach(t=>{
    if(!S.teams[t]) return;
    const need=_ovpNeededRate(t, wd);
    if(need){ _ovdPlanCfg.rate[t]=need; msg.push(_OVP_TEAM[t].label+' '+need+'/day'); }
    else msg.push(_OVP_TEAM[t].label+' cannot fit');
  });
  _ovdPlanSave(); _ovdPlanSyncInputs(); ovdPlanRender();
  if(typeof toast==='function') toast('Set to '+msg.join(' · '));
}

function ovdPlanCsv(){
  const S=_ovdPlanLast || _ovdPlanSchedule();
  if(!S){ if(typeof toast==='function') toast('Nothing to export'); return; }
  const esc=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const head=['Team','Order','Code','Group','Solo run','Collectors','Rate/day each','Barangays','Machines','Overdue','Days','Projected Spawn','Start','End'];
  const csv=[head.join(',')].concat(S.rows.map((r,i)=>[
    'Team '+r.team, i+1, r.code, r.label, r.solo?'yes':'no', r.hands, r.rate,
    r.bgys.map(b=>b[0]+' '+b[1]).join(' | '),
    r.machines, r.overdue, r.days, Math.round(r.proj),
    r.first?_ovpIso(r.first):'', r.last?_ovpIso(r.last):''].map(esc).join(','))).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
  a.download='spawn_cycle_plan_'+_ovpIso(S.start)+'.csv';
  a.click();
  if(typeof toast==='function') toast('Exported cycle plan');
}
