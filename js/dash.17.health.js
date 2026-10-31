/* ══════════════════════════════════════════════════════════════════════════
   DATA HEALTH TAB  (dash.17)  —  🩺 Health
   ------------------------------------------------------------------------
   The morning cards that keep the reports exact (Wendell, 2026-10-31):
     1. Names to link      — BASHANG box names with no vendo (+ suggested match, one-tap link)
     2. Bad dates          — book rows held by the column guard, and dates corrected from the column
     3. Possible doubles   — same day/item/amount in the expense sheet, daily book, and BASHANG
     4. Imports            — sheet sync status, rejected rows, stale copies, auto-voids
     5. Cash book vs harvest — monthly gap, from the financial pack (loaded on demand)
   Each card is green at zero.

   Reads: rpc spawn_data_health (all cards but #5), rpc spawn_financial_pack (#5).
   Writes: rpc spawn_office_alias_confirm (one-tap link; owner-confirmed alias).
   Self-installing: adds the nav button + panel; dashboard.html only needs the <script>.
   ══════════════════════════════════════════════════════════════════════════ */

var _dhData = null, _dhTs = 0, _dhBusy = false, _dhPack = null, _dhOpen = {};
const _dhEsc = s => String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const _dhPeso = n => n==null ? '' : '₱'+Math.round(Number(n)).toLocaleString();
const _dhMon = ym => { const m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return m[parseInt(ym.slice(5,7),10)-1]+' '+ym.slice(0,4); };

async function _dhRpc(fn, body){
  const r = await fetch(`${_SB}/rest/v1/rpc/${fn}`, {method:'POST', headers:Object.assign({}, _HDR, {'Content-Type':'application/json'}), body:JSON.stringify(body||{})});
  const b = await r.json().catch(() => null);
  if(!r.ok || (b && b.error)) throw new Error(fn+': '+((b && (b.error||b.message)) || ('HTTP '+r.status)));
  return b;
}
function _dhCopy(txt, msg){
  navigator.clipboard.writeText(txt).then(() => { if(typeof toast==='function') toast(msg||'Copied'); },
                                          () => { if(typeof toast==='function') toast('Copy blocked by browser'); });
}

/* ── load ─────────────────────────────────────────────────────────────── */
async function dhLoad(force){
  if(_dhBusy) return;
  const box = document.getElementById('dh-cards'); if(!box) return;
  if(!_dhData || force || Date.now()-_dhTs > 5*60*1000){
    _dhBusy = true;
    box.innerHTML = '<div style="padding:22px;color:#6b7280;font-size:13px;">Checking names, dates, doubles and imports…</div>';
    try{ _dhData = await _dhRpc('spawn_data_health'); _dhTs = Date.now(); }
    catch(e){ _dhBusy=false; box.innerHTML = '<div style="padding:16px;border-radius:11px;background:#fef2f2;border:1px solid #fecaca;color:#DF1A35;font-size:13px;font-weight:700;">Load failed — '+_dhEsc(e.message)+'</div>'; return; }
    _dhBusy = false;
  }
  dhRender();
}

/* ── styles ───────────────────────────────────────────────────────────── */
(function(){
  if(document.getElementById('dh-css')) return;
  const st=document.createElement('style'); st.id='dh-css'; st.textContent=`
  .dh-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:16px}
  .dh-tile{background:#fff;border:1px solid var(--bd,#e8eeff);border-radius:14px;padding:12px 14px;cursor:pointer;border-bottom:3px solid transparent;box-shadow:0 1px 4px rgba(2,90,198,.06);transition:transform .12s,box-shadow .12s}
  .dh-tile:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(2,90,198,.12)}
  .dh-tile.on{border-bottom-color:#025AC6;background:#f5f8ff}
  .dh-tile .t{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6b7394;display:flex;align-items:center;gap:6px}
  .dh-tile .n{font-size:26px;font-weight:800;margin-top:4px;line-height:1.1}
  .dh-tile .s{font-size:10.5px;color:#6b7280;margin-top:3px}
  .dh-sec{background:#fff;border:1px solid var(--bd,#e8eeff);border-radius:14px;box-shadow:0 1px 4px rgba(2,90,198,.05);margin-bottom:12px;overflow:hidden}
  .dh-sec .hd{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap}
  .dh-sec .hd h3{margin:0;font-size:14px;font-weight:800;color:#111827}
  .dh-sec .hd .sub{font-size:11.5px;color:#6b7280;flex:1 1 100%}
  .dh-sec .bd{padding:12px 16px}
  .dh-pill{display:inline-flex;align-items:center;justify-content:center;min-width:30px;padding:3px 9px;border-radius:99px;font-weight:800;font-size:12px;color:#fff}
  .dh-ok{background:#ecfdf5;color:#065f46;border:1px dashed #a7f3d0;border-radius:10px;padding:14px;text-align:center;font-size:12.5px;font-weight:600}
  .dh-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px}
  .dh-tbl th{font-size:10.5px;font-weight:700;color:#6b7394;text-transform:uppercase;letter-spacing:.03em;text-align:left;padding:8px 10px;background:#f8fafc;position:sticky;top:0}
  .dh-tbl td{padding:9px 10px;border-top:1px solid #f1f5f9;vertical-align:middle}
  .dh-tbl tr:hover td{background:#fafcff}
  .dh-tbl .m{font-size:10.5px;color:#9ca3af;margin-top:2px}
  .dh-chip{display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;background:#f1f5f9;color:#475569;margin-right:4px}
  .dh-chip.b{background:#fdf2f8;color:#9d174d}.dh-chip.g{background:#ecfdf5;color:#065f46}.dh-chip.a{background:#fff7ed;color:#c2410c}.dh-chip.r{background:#fef2f2;color:#DF1A35}
  .dh-btn{padding:6px 12px;border-radius:8px;border:1px solid var(--bd,#e8eeff);background:#fff;color:#374151;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
  .dh-btn:hover{background:#f5f8ff;border-color:#c7d9f5}
  .dh-btn.p{background:#025AC6;color:#fff;border-color:#025AC6}.dh-btn.p:hover{background:#0b4fa8}
  .dh-btn.g{background:#028867;color:#fff;border-color:#028867}
  .dh-bar{height:5px;border-radius:99px;background:#e5e7eb;width:70px;display:inline-block;vertical-align:middle;margin-left:6px}
  .dh-bar i{display:block;height:100%;border-radius:99px;background:#025AC6}
  .dh-inp{padding:6px 9px;border:1px solid var(--bd,#e8eeff);border-radius:8px;font-size:12px;font-family:inherit;width:120px}
  .dh-h4{font-size:11px;font-weight:800;color:#374151;margin:14px 0 6px;text-transform:uppercase;letter-spacing:.04em}
  .dh-note{font-size:11.5px;color:#6b7280;background:#f8fafc;border-radius:9px;padding:9px 12px;margin-bottom:10px;line-height:1.5}
  `; document.head.appendChild(st);
})();

/* ── render ───────────────────────────────────────────────────────────── */
var _dhSel = 'names';
function dhToggle(k){ _dhSel = k; dhRender(); if(k==='cash' && !_dhPack) dhLoadPack(); }
const _dhCol = (n, warn) => !n ? '#028867' : (warn ? '#FEB30C' : '#DF1A35');
const _dhTable = (cols, rows, empty) => rows.length
  ? `<div style="overflow:auto;border:1px solid #f1f5f9;border-radius:10px;max-height:520px;"><table class="dh-tbl"><thead><tr>${cols.map(c=>'<th>'+c+'</th>').join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  : `<div class="dh-ok">✓ ${empty||'Nothing here'}</div>`;
const _dhBtn = (label, onclick, cls) => `<button class="dh-btn ${cls||''}" onclick="${onclick}">${label}</button>`;
const _dhJ = v => JSON.stringify(v==null?'':v).replace(/"/g,'&quot;');

function dhRender(){
  const box = document.getElementById('dh-cards'); if(!box || !_dhData) return;
  const d = _dhData;
  const age = document.getElementById('dh-age'); if(age) age.textContent = 'checked '+Math.max(0,Math.round((Date.now()-_dhTs)/60000))+' min ago';

  const nm = d.names_to_link || {items:[]};
  const bd = d.bad_dates || {held:[],corrected_from_column:[]};
  const db = d.double_entries || {admin:[],daily:[],book:[]};
  const im = d.imports || {sheets:[]};
  const badSheets = (im.sheets||[]).filter(s => s.enabled!==false && s.status && !/^ok$/.test(s.status) && !/mirror only/.test(s.status) && !/never run/.test(s.status));
  const stale = (im.stale_office_rows||0) + (im.stale_admin_rows||0);
  let cashBad = 0; if(_dhPack) (_dhPack.rows||[]).forEach(r => { if(r.pct!=null && Math.abs(r.pct)>=5 && !r.current) cashBad++; });

  const tiles = [
    {k:'names',   t:'🔗 Names to link',   n:nm.count||0,          s:`${nm.rows||0} rows · ${_dhPeso(nm.amount)}`, warn:true},
    {k:'dates',   t:'📅 Bad dates',        n:bd.held_count||0,     s:`${bd.corrected_count||0} fixed by column`, warn:true},
    {k:'doubles', t:'👯 Possible doubles', n:db.count||0,          s:'last 90 days', warn:true},
    {k:'imports', t:'🔄 Imports',          n:stale+badSheets.length, s:`${(im.sheets||[]).length} sheets · ${stale} stale`, warn:true},
    {k:'cash',    t:'💵 Cash vs harvest',  n:_dhPack?cashBad:null, s:_dhPack?'months off by 5%+':'tap to load', warn:true},
  ];
  const tilesHtml = '<div class="dh-tiles">'+tiles.map(x => {
    const col = x.n==null ? '#9ca3af' : _dhCol(x.n, x.warn);
    return `<div class="dh-tile ${_dhSel===x.k?'on':''}" onclick="dhToggle('${x.k}')">
      <div class="t">${x.t}</div><div class="n" style="color:${col}">${x.n==null?'…':(x.n||'✓')}</div><div class="s">${x.s}</div></div>`; }).join('')+'</div>';

  let sec = '';
  if(_dhSel==='names'){
    const rows = (nm.items||[]).map(x => `<tr>
      <td><b>${_dhEsc(x.raw_name)}</b><div class="m"><span class="dh-chip">${_dhEsc(x.source_tab)}</span>${x.sheet_area?'<span class="dh-chip">'+_dhEsc(x.sheet_area)+'</span>':''}${x.vlan?'<span class="dh-chip">VLAN '+_dhEsc(x.vlan)+'</span>':''}</div></td>
      <td><b>${x.rows}</b> <span style="color:#9ca3af">rows</span><div class="m">${_dhPeso(x.amount)}</div></td>
      <td style="color:#6b7280;white-space:nowrap;">${_dhEsc(x.first_date)}<div class="m">to ${_dhEsc(x.last_date)}</div></td>
      <td>${x.suggest_id ? `<b>${_dhEsc(x.suggest_name)}</b> <span class="dh-chip">#${x.suggest_id}</span><span class="dh-chip">${_dhEsc(x.suggest_area)}</span><span class="dh-bar" title="name similarity"><i style="width:${Math.round(x.suggest_sim*100)}%"></i></span>` : '<span style="color:#9ca3af;font-size:12px;">No vendo with a name like this — probably a new box that needs a vendo record.</span>'}</td>
      <td style="white-space:nowrap;text-align:right;">${x.suggest_id ? _dhBtn('✓ Link to #'+x.suggest_id, `dhLink(${_dhJ(x.raw_name)}, ${x.suggest_id}, ${_dhJ(x.suggest_name)})`, 'p')+' ' : ''}
        <span style="display:inline-flex;gap:4px;align-items:center;"><input class="dh-inp" id="dh-lid-${_dhEsc(x.raw_name).replace(/[^a-z0-9]/gi,'_')}" placeholder="vendo ID"> ${_dhBtn('Link', `dhLinkInput(${_dhJ(x.raw_name)})`)}</span></td></tr>`);
    window._dhNamesTxt = () => 'BASHANG names with no vendo ('+(nm.items||[]).length+'):\n\n'+(nm.items||[]).map((x,i)=>(i+1)+'. '+x.raw_name+'\n    '+x.source_tab+' · '+x.sheet_area+(x.vlan?' · VLAN '+x.vlan:'')+'\n    '+x.rows+' rows · ₱'+Math.round(x.amount).toLocaleString()+' · '+x.first_date+' to '+x.last_date+(x.suggest_id?'\n    maybe: '+x.suggest_name+' #'+x.suggest_id:'')).join('\n\n');
    sec = `<div class="dh-sec"><div class="hd"><span class="dh-pill" style="background:${_dhCol(nm.count,true)}">${nm.count||'✓'}</span><h3>Names to link</h3><span style="flex:1"></span>${_dhBtn('📋 Copy list', "_dhCopy(window._dhNamesTxt(), 'Copied names')")}
      <div class="sub">BASHANG box names that match no vendo. Link a name once and every row with that name, now and in future imports, counts under that vendo. A name with no match is usually a new box the collectors haven't created yet.</div></div>
      <div class="bd">${_dhTable(['Book name','Rows','Dates','Suggested vendo',''], rows, 'Every BASHANG name is linked')}</div></div>`;
  }
  if(_dhSel==='dates'){
    const held = (bd.held||[]).map(x => `<tr><td><span class="dh-chip">${_dhEsc(x.tab)}</span></td><td><b>row ${x.sheet_row}</b></td><td>${_dhEsc(x.name)}</td><td><span class="dh-chip r">${_dhEsc(x.typed_date)}</span></td><td>${_dhEsc(x.column_month)} column</td><td>${_dhPeso(x.amount)}</td></tr>`);
    const fix = (bd.corrected_from_column||[]).map(x => `<tr><td><span class="dh-chip">${_dhEsc(x.tab)}</span></td><td><b>row ${x.sheet_row}</b></td><td>${_dhEsc(x.name)}</td><td><span class="dh-chip a">${_dhEsc(x.typed_date)}</span></td><td>${_dhEsc(x.column_month)} column</td><td><span class="dh-chip g">${_dhEsc(x.used_date)}</span></td><td>${_dhPeso(x.amount)}</td></tr>`);
    window._dhDatesTxt = () => 'BASHANG dates to fix:\n\n'+[...(bd.held||[]).map(x=>'• '+x.tab+', row '+x.sheet_row+' — '+x.name+'\n    typed '+x.typed_date+' but sits in the '+x.column_month+' column (held out of totals)'),
      ...(bd.corrected_from_column||[]).map(x=>'• '+x.tab+', row '+x.sheet_row+' — '+x.name+'\n    typed '+x.typed_date+' but sits in the '+x.column_month+' column (counted as '+x.used_date+')')].join('\n\n');
    sec = `<div class="dh-sec"><div class="hd"><span class="dh-pill" style="background:${_dhCol(bd.held_count,true)}">${bd.held_count||'✓'}</span><h3>Bad dates in BASHANG</h3><span style="flex:1"></span>${_dhBtn('📋 Copy for office', "_dhCopy(window._dhDatesTxt(), 'Copied date fixes')")}
      <div class="sub">The month column is trusted over the typed date. A row whose column is still in the future is held out of the totals until the office fixes it.</div></div>
      <div class="bd"><div class="dh-h4" style="color:#DF1A35;margin-top:0">Held — column month in the future (${(bd.held||[]).length})</div>${_dhTable(['Tab','Row','Name','Typed','In','₱'], held, 'No rows held')}
      <div class="dh-h4" style="color:#c2410c">Counted by column — typed date disagrees with its column (${(bd.corrected_from_column||[]).length})</div>${_dhTable(['Tab','Row','Name','Typed','In','Used as','₱'], fix, 'Every date matches its column')}</div></div>`;
  }
  if(_dhSel==='doubles'){
    const ex = x => `<tr><td style="white-space:nowrap;">${_dhEsc(x.expense_date)}</td><td>${_dhEsc(x.description)}</td><td><b>${_dhPeso(x.amount)}</b> <span class="dh-chip a">×2</span></td><td style="color:#9ca3af;">IDs ${x.id_a}, ${x.id_b}</td></tr>`;
    const bk = x => `<tr><td style="white-space:nowrap;">${_dhEsc(x.record_date)}</td><td>${_dhEsc(x.name)}</td><td><b>${_dhPeso(x.amount)}</b> <span class="dh-chip a">×${(x.sheet_rows||[]).length}</span></td><td style="color:#9ca3af;">${_dhEsc(x.source_tab)} rows ${(x.sheet_rows||[]).join(', ')}</td></tr>`;
    sec = `<div class="dh-sec"><div class="hd"><span class="dh-pill" style="background:${_dhCol(db.count,true)}">${db.count||'✓'}</span><h3>Possible double entries</h3>
      <div class="sub">Same day, same item, same amount, last 90 days. Not every one is wrong (two riders both buy ₱300 gas), so check before removing. To remove: delete the extra row in the sheet, or void by ID in the Financial tab.</div></div>
      <div class="bd"><div class="dh-h4" style="margin-top:0">Expenses paid by Wendell (${(db.admin||[]).length})</div>${_dhTable(['Date','Item','Amount','IDs'], (db.admin||[]).map(ex), 'No doubles in your expense sheet')}
      <div class="dh-h4">Daily book, ₱1,000 and up (${(db.daily||[]).length})</div>${_dhTable(['Date','Item','Amount','IDs'], (db.daily||[]).map(ex), 'No doubles in the daily book')}
      <div class="dh-h4">BASHANG harvests — reports already count these once (${(db.book||[]).length})</div>${_dhTable(['Date','Vendo','Amount','Where'], (db.book||[]).map(bk), 'No doubles in BASHANG')}</div></div>`;
  }
  if(_dhSel==='imports'){
    const rows = (im.sheets||[]).map(s => { const st = s.status||'—'; const cls = /^ok$/.test(st) ? 'g' : /mirror only|never run/.test(st) ? '' : 'a';
      return `<tr><td><b>${_dhEsc(s.source)}</b><div class="m">${_dhEsc(s.tab_name||'')}</div></td><td><span class="dh-chip ${cls}">${_dhEsc(st)}</span></td><td style="color:#6b7280;white-space:nowrap;">${s.last_ok?_dhEsc(String(s.last_ok).replace('T',' ').slice(0,16)):'—'}</td><td>${s.rows_seen==null?'':s.rows_seen.toLocaleString()}</td></tr>`; });
    const av = im.auto_voided_30d || {n:0,amount:0};
    sec = `<div class="dh-sec"><div class="hd"><span class="dh-pill" style="background:${_dhCol(stale+badSheets.length,true)}">${(stale+badSheets.length)||'✓'}</span><h3>Imports</h3>
      <div class="sub">Every sheet the bridge reads, and whether its last run was clean. "N rejected" = rows the bridge could not read (blank date, text in the amount cell). Those rows are in no total until fixed in the sheet.</div></div>
      <div class="bd"><div class="dh-tiles" style="margin-bottom:12px">
        <div class="dh-tile" style="cursor:default"><div class="t">Stale copies counted</div><div class="n" style="color:${_dhCol(stale,true)}">${stale||'✓'}</div><div class="s">harvest ${im.stale_office_rows||0} · expenses ${im.stale_admin_rows||0}</div></div>
        <div class="dh-tile" style="cursor:default"><div class="t">Auto-removed, 30 days</div><div class="n" style="color:#025AC6">${av.n||0}</div><div class="s">${_dhPeso(av.amount)} old copies dropped by the imports</div></div>
        <div class="dh-tile" style="cursor:default"><div class="t">Last BASHANG load</div><div class="n" style="color:#111827;font-size:16px">${im.last_office_load?_dhEsc(String(im.last_office_load).replace('T',' ').slice(0,16)):'—'}</div><div class="s">safety stop ${_dhEsc(im.office_guard_pct||'25')}%</div></div>
      </div>${_dhTable(['Sheet','Last run','Last OK','Rows'], rows)}</div></div>`;
  }
  if(_dhSel==='cash'){
    let body = '<div class="dh-note">Loading the financial pack… (a few seconds)</div>';
    if(_dhPack){
      const rows = (_dhPack.rows||[]).map(r => { const big = r.pct!=null && Math.abs(r.pct)>=5 && !r.current;
        return `<tr><td><b>${_dhMon(r.ym)}</b>${r.current?' <span class="dh-chip">open</span>':''}</td><td>${_dhPeso(r.cash)}</td><td>${_dhPeso(r.harvest)}</td><td><span class="dh-chip ${big?'r':'g'}">${r.diff>=0?'+':''}${_dhPeso(r.diff)}</span> <span style="color:#6b7280">${r.pct==null?'':r.pct.toFixed(1)+'%'}</span></td></tr>`; });
      body = `<div class="dh-note">Cash book = Piso WiFi cash the office received (Cash Receipts sheet). Harvests = app + BASHANG, each counted once. Hand-ins land days after the harvest date, so ±3% is normal. The open month is always short until it closes.</div>`+_dhTable(['Month','Cash book','Harvests','Harvests − cash'], rows);
    }
    sec = `<div class="dh-sec"><div class="hd"><span class="dh-pill" style="background:${_dhPack?_dhCol(cashBad,true):'#9ca3af'}">${_dhPack?(cashBad||'✓'):'…'}</span><h3>Cash book vs harvests</h3><div class="sub">Months where the two books disagree by 5% or more.</div></div><div class="bd">${body}</div></div>`;
  }
  box.innerHTML = tilesHtml + sec;
  const badge = document.getElementById('nav-health-badge');
  if(badge){ const n = (nm.count||0) + (bd.held_count||0) + (db.count||0) + stale + badSheets.length; badge.textContent = n ? n : ''; badge.style.display = n ? '' : 'none'; }
}

function dhLinkInput(officeName){
  const el = document.getElementById('dh-lid-'+officeName.replace(/[^a-z0-9]/gi,'_'));
  const id = el ? parseInt(el.value, 10) : 0;
  if(!id){ if(typeof toast==='function') toast('Type the vendo ID first'); return; }
  dhLink(officeName, id, null);
}

async function dhLoadPack(){
  try{
    const p = await _dhRpc('spawn_financial_pack', {p_from: new Date().getUTCFullYear()+'-01-01'});
    const hc = {}; (p.harvest_check||[]).forEach(h => hc[h.ym] = Number(h.spawn_share));
    _dhPack = { rows: (p.revenue||[]).map(r => { const cash = Number(r.vendo_sales||0), harvest = hc[r.ym]||0, diff = harvest - cash;
      return {ym:r.ym, cash, harvest, diff, pct: cash ? diff*100/cash : null, current: r.ym === new Date(Date.now()+8*3600*1000).toISOString().slice(0,7)}; }) };
  }catch(e){ _dhPack = {rows:[]}; if(typeof toast==='function') toast('Financial pack: '+e.message); }
  dhRender();
}

/* ── one-tap link ─────────────────────────────────────────────────────── */
async function dhLink(officeName, vendoId, vendoName){
  if(!confirm('Link "'+officeName+'" → '+(vendoName||('vendo #'+vendoId))+' (#'+vendoId+')?\n\nSaves it as a confirmed alias; every BASHANG row with this name links to that vendo now and on future imports.')) return;
  try{
    const r = await _dhRpc('spawn_office_alias_confirm', {p_office_name: officeName, p_vendo_id: vendoId, p_by: 'dashboard'});
    if(!r.ok) throw new Error(r.error||'failed');
    if(typeof toast==='function') toast('Linked · '+r.rows_linked+' rows now under '+(r.vendo||('#'+vendoId)));
    dhLoad(true);
  }catch(e){ if(typeof toast==='function') toast('Link failed: '+e.message); }
}

/* ── install nav button + panel ───────────────────────────────────────── */
(function dhInstall(){
  function go(){
    if(document.getElementById('panel-health')) return;
    const nav = document.querySelector('.nav-bar'); const skipBtn = document.querySelector('.nav-bar button[data-panel="skipped"]');
    const skipPanel = document.getElementById('panel-skipped');
    if(!nav || !skipPanel) return;
    const b = document.createElement('button');
    b.setAttribute('data-panel','health');
    b.onclick = function(){ showP('health', this); dhLoad(); };
    b.innerHTML = `<span class="nbadge am" id="nav-health-badge" style="display:none;"></span>
      <div class="ni" style="background:#ecfdf5"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#028867" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>
      <span class="nl">Health</span>`;
    if(skipBtn && skipBtn.nextSibling) nav.insertBefore(b, skipBtn.nextSibling); else nav.appendChild(b);

    const panel = document.createElement('div');
    panel.id = 'panel-health'; panel.className = 'panel';
    panel.innerHTML = `<div style="padding:14px;max-width:1200px;">
      <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:12px;">
        <div style="font-size:16px;font-weight:800;color:#025AC6;">🩺 Data Health</div>
        <span style="font-size:10px;font-weight:700;color:#065f46;background:#ecfdf5;padding:3px 8px;border-radius:5px;">green = nothing to do</span>
        <span id="dh-age" style="font-size:10px;color:var(--mu);"></span>
        <span style="flex:1"></span>
        <button onclick="dhLoad(true)" style="padding:5px 12px;border-radius:7px;border:1px solid var(--bd);background:#fff;font-size:12px;cursor:pointer;font-family:inherit;height:30px;">↺ Refresh</button>
      </div>
      <div id="dh-cards"></div>
    </div>`;
    skipPanel.parentNode.insertBefore(panel, skipPanel.nextSibling);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
