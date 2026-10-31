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

/* ── render ───────────────────────────────────────────────────────────── */
function _dhCard(key, title, count, sub, body, color){
  const zero = !count;
  const col = zero ? '#028867' : (color || '#DF1A35');
  const open = !!_dhOpen[key];
  return `<div style="border:1.5px solid ${zero?'#a7f3d0':'#e5e7eb'};border-left:5px solid ${col};border-radius:12px;background:#fff;margin-bottom:10px;">
    <div onclick="dhToggle('${key}')" style="display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer;">
      <span style="background:${col};color:#fff;font-weight:800;font-size:13px;min-width:34px;text-align:center;padding:3px 9px;border-radius:99px;">${zero?'✓':count}</span>
      <div style="flex:1;"><div style="font-weight:800;font-size:13.5px;color:#111827;">${title}</div><div style="font-size:11px;color:#6b7280;">${sub}</div></div>
      <span style="color:#9ca3af;font-size:12px;">${open?'▲':'▼'}</span>
    </div>
    ${open ? '<div style="padding:0 14px 12px;">'+body+'</div>' : ''}
  </div>`;
}
function dhToggle(k){ _dhOpen[k] = !_dhOpen[k]; dhRender(); if(k==='cash' && _dhOpen.cash && !_dhPack) dhLoadPack(); }
const _dhTh = cols => '<thead><tr style="color:#6b7280;font-size:10.5px;text-align:left;">'+cols.map(c=>'<th style="padding:5px 7px;">'+c+'</th>').join('')+'</tr></thead>';
const _dhTable = (cols, rows) => `<div style="overflow:auto;border:1px solid #f1f5f9;border-radius:9px;"><table style="width:100%;border-collapse:collapse;font-size:12px;">${_dhTh(cols)}<tbody>${rows.join('') || '<tr><td colspan="'+cols.length+'" style="padding:14px;text-align:center;color:#9ca3af;">Nothing.</td></tr>'}</tbody></table></div>`;
const _dhBtn = (label, onclick, primary) => `<button onclick="${onclick}" style="padding:4px 10px;border-radius:7px;border:${primary?'none':'1px solid var(--bd)'};background:${primary?'#025AC6':'#fff'};color:${primary?'#fff':'#374151'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">${label}</button>`;

function dhRender(){
  const box = document.getElementById('dh-cards'); if(!box || !_dhData) return;
  const d = _dhData;
  const age = document.getElementById('dh-age'); if(age) age.textContent = 'checked '+Math.max(0,Math.round((Date.now()-_dhTs)/60000))+'min ago';

  // 1. names
  const nm = d.names_to_link || {items:[]};
  const nmRows = (nm.items||[]).map((x,i) => `<tr style="border-top:1px solid #f1f5f9;">
     <td style="padding:5px 7px;"><b>${_dhEsc(x.raw_name)}</b><div style="font-size:10px;color:#9ca3af;">${_dhEsc(x.source_tab)} · ${_dhEsc(x.sheet_area)}${x.vlan?' · VLAN '+_dhEsc(x.vlan):''}</div></td>
     <td style="padding:5px 7px;">${x.rows} / ${_dhPeso(x.amount)}</td>
     <td style="padding:5px 7px;color:#6b7280;">${_dhEsc(x.first_date)} → ${_dhEsc(x.last_date)}</td>
     <td style="padding:5px 7px;">${x.suggest_id ? `${_dhEsc(x.suggest_name)} <span style="font-size:10px;color:#9ca3af;">#${x.suggest_id} · ${_dhEsc(x.suggest_area)} · ${Math.round(x.suggest_sim*100)}%</span>` : '<span style="color:#9ca3af;">no vendo with a name like this</span>'}</td>
     <td style="padding:5px 7px;white-space:nowrap;">${x.suggest_id ? _dhBtn('Link → #'+x.suggest_id, `dhLink(${JSON.stringify(x.raw_name).replace(/"/g,'&quot;')}, ${x.suggest_id}, ${JSON.stringify(x.suggest_name||'').replace(/"/g,'&quot;')})`, true) : ''}
        ${_dhBtn('Link to…', `dhLinkPrompt(${JSON.stringify(x.raw_name).replace(/"/g,'&quot;')})`)}</td></tr>`);
  const nmTxt = () => (nm.items||[]).map(x => '- '+x.raw_name+' ['+x.source_tab+' / '+x.sheet_area+(x.vlan?' / VLAN '+x.vlan:'')+'] '+x.rows+' rows ₱'+Math.round(x.amount).toLocaleString()+(x.suggest_id?' → maybe '+x.suggest_name+' #'+x.suggest_id:' → no vendo yet')).join('\n');
  window._dhNamesTxt = nmTxt;
  const c1 = _dhCard('names', 'Names to link', nm.count, `${nm.rows||0} book rows · ${_dhPeso(nm.amount)} · BASHANG box names with no vendo. Linking makes them count under the right vendo.`,
     `<div style="display:flex;gap:6px;margin-bottom:8px;">${_dhBtn('📋 Copy list', "_dhCopy(window._dhNamesTxt(), 'Copied names')")}</div>`+_dhTable(['Book name','Rows / ₱','Dates','Suggested vendo',''], nmRows), '#FEB30C');

  // 2. dates
  const bd = d.bad_dates || {held:[],corrected_from_column:[]};
  const heldRows = (bd.held||[]).map(x => `<tr style="border-top:1px solid #f1f5f9;"><td style="padding:5px 7px;">${_dhEsc(x.tab)}</td><td style="padding:5px 7px;">${x.sheet_row}</td><td style="padding:5px 7px;">${_dhEsc(x.name)}</td><td style="padding:5px 7px;color:#DF1A35;font-weight:700;">${_dhEsc(x.typed_date)}</td><td style="padding:5px 7px;">${_dhEsc(x.column_month)}</td><td style="padding:5px 7px;">${_dhPeso(x.amount)}</td></tr>`);
  const fixRows = (bd.corrected_from_column||[]).map(x => `<tr style="border-top:1px solid #f1f5f9;"><td style="padding:5px 7px;">${_dhEsc(x.tab)}</td><td style="padding:5px 7px;">${x.sheet_row}</td><td style="padding:5px 7px;">${_dhEsc(x.name)}</td><td style="padding:5px 7px;color:#c2410c;">${_dhEsc(x.typed_date)}</td><td style="padding:5px 7px;">${_dhEsc(x.column_month)}</td><td style="padding:5px 7px;color:#065f46;font-weight:700;">${_dhEsc(x.used_date)}</td><td style="padding:5px 7px;">${_dhPeso(x.amount)}</td></tr>`);
  window._dhDatesTxt = () => 'BASHANG dates to fix:\n'+[...(bd.held||[]).map(x=>'- '+x.tab+' row '+x.sheet_row+': '+x.name+' dated '+x.typed_date+' in '+x.column_month+' column (HELD OUT of totals)'),
     ...(bd.corrected_from_column||[]).map(x=>'- '+x.tab+' row '+x.sheet_row+': '+x.name+' dated '+x.typed_date+' in '+x.column_month+' column → counted as '+x.used_date)].join('\n');
  const c2 = _dhCard('dates', 'Bad dates in BASHANG', (bd.held_count||0), `${bd.held_count||0} held out of the totals · ${bd.corrected_count||0} counted by their column instead of the typed date`,
     `<div style="display:flex;gap:6px;margin-bottom:8px;">${_dhBtn('📋 Copy for office', "_dhCopy(window._dhDatesTxt(), 'Copied date fixes')")}</div>
      <div style="font-size:11px;font-weight:700;color:#DF1A35;margin:6px 0 4px;">Held — column month is in the future</div>${_dhTable(['Tab','Row','Name','Typed','Column','₱'], heldRows)}
      <div style="font-size:11px;font-weight:700;color:#c2410c;margin:10px 0 4px;">Counted by column — typed date disagrees with the column it sits in</div>${_dhTable(['Tab','Row','Name','Typed','Column','Used as','₱'], fixRows)}`, '#FEB30C');

  // 3. doubles
  const db = d.double_entries || {admin:[],daily:[],book:[]};
  const exRow = x => `<tr style="border-top:1px solid #f1f5f9;"><td style="padding:5px 7px;">${_dhEsc(x.expense_date)}</td><td style="padding:5px 7px;">${_dhEsc(x.description)}</td><td style="padding:5px 7px;font-weight:700;">${_dhPeso(x.amount)} ×2</td><td style="padding:5px 7px;color:#9ca3af;">IDs ${x.id_a}, ${x.id_b}</td></tr>`;
  const bkRow = x => `<tr style="border-top:1px solid #f1f5f9;"><td style="padding:5px 7px;">${_dhEsc(x.record_date)}</td><td style="padding:5px 7px;">${_dhEsc(x.name)}</td><td style="padding:5px 7px;font-weight:700;">${_dhPeso(x.amount)}</td><td style="padding:5px 7px;color:#9ca3af;">${_dhEsc(x.source_tab)} rows ${(x.sheet_rows||[]).join(', ')}</td></tr>`;
  const c3 = _dhCard('doubles', 'Possible double entries (last 90 days)', db.count, `${(db.admin||[]).length} in your expense sheet · ${(db.daily||[]).length} in the daily book (≥ ₱1,000) · ${(db.book||[]).length} in BASHANG. Same day, same item, same amount — check, then delete the extra in the sheet or void it.`,
     `<div style="font-size:11px;font-weight:700;color:#374151;margin:6px 0 4px;">Expenses paid by Wendell</div>${_dhTable(['Date','Item','Amount','IDs'], (db.admin||[]).map(exRow))}
      <div style="font-size:11px;font-weight:700;color:#374151;margin:10px 0 4px;">Daily book</div>${_dhTable(['Date','Item','Amount','IDs'], (db.daily||[]).map(exRow))}
      <div style="font-size:11px;font-weight:700;color:#374151;margin:10px 0 4px;">BASHANG harvests (reports already count these once)</div>${_dhTable(['Date','Vendo','Amount','Where'], (db.book||[]).map(bkRow))}`, '#FEB30C');

  // 4. imports
  const im = d.imports || {sheets:[]};
  const bad = (im.sheets||[]).filter(s => s.enabled!==false && s.status && !/^ok$/.test(s.status) && !/mirror only/.test(s.status));
  const stale = (im.stale_office_rows||0) + (im.stale_admin_rows||0);
  const shRows = (im.sheets||[]).map(s => { const warn = s.status && !/^ok$/.test(s.status) && !/mirror only/.test(s.status);
    return `<tr style="border-top:1px solid #f1f5f9;"><td style="padding:5px 7px;"><b>${_dhEsc(s.source)}</b><div style="font-size:10px;color:#9ca3af;">${_dhEsc(s.tab_name||'')}</div></td><td style="padding:5px 7px;color:${warn?'#c2410c':'#065f46'};font-weight:700;">${_dhEsc(s.status||'—')}</td><td style="padding:5px 7px;color:#6b7280;">${s.last_ok?_dhEsc(String(s.last_ok).replace('T',' ').slice(0,16)):'—'}</td><td style="padding:5px 7px;">${s.rows_seen==null?'':s.rows_seen}</td></tr>`; });
  const av = im.auto_voided_30d || {n:0,amount:0};
  const c4 = _dhCard('imports', 'Imports', stale + bad.length, `${stale} stale copies still counted · ${bad.length} sheets with rejected rows · ${av.n} old copies auto-removed in 30 days (${_dhPeso(av.amount)}) · last BASHANG load ${im.last_office_load?String(im.last_office_load).replace('T',' ').slice(0,16):'—'}`,
     `<div style="font-size:11px;color:#6b7280;margin-bottom:6px;">"Rejected" rows are ones the bridge could not read — usually a blank date or text in the amount cell. They are in no total until fixed in the sheet.</div>
      ${_dhTable(['Sheet','Status','Last OK','Rows'], shRows)}
      <div style="font-size:11px;color:#6b7280;margin-top:8px;">Harvest import safety stop: ${_dhEsc(im.office_guard_pct||'25')}% · stale office rows: ${im.stale_office_rows||0} · stale expense rows: ${im.stale_admin_rows||0}</div>`, '#FEB30C');

  // 5. cash vs harvest
  let c5body = '<div style="padding:10px;color:#6b7280;font-size:12px;">Loading the financial pack…</div>';
  let c5count = 0;
  if(_dhPack){
    const rows = (_dhPack.rows||[]).map(r => { const big = Math.abs(r.pct||0) >= 5; if(big) c5count++;
      return `<tr style="border-top:1px solid #f1f5f9;"><td style="padding:5px 7px;">${_dhMon(r.ym)}</td><td style="padding:5px 7px;">${_dhPeso(r.cash)}</td><td style="padding:5px 7px;">${_dhPeso(r.harvest)}</td><td style="padding:5px 7px;font-weight:700;color:${big?'#DF1A35':'#065f46'};">${r.diff>=0?'+':''}${_dhPeso(r.diff)} (${r.pct==null?'—':r.pct.toFixed(1)+'%'})</td></tr>`; });
    c5body = `<div style="font-size:11px;color:#6b7280;margin-bottom:6px;">Cash book = Piso WiFi cash the office received (Cash Receipts sheet). Harvests = app + BASHANG, each once. Hand-ins lag harvest dates by days, so ±3% is normal; the current month is always short until closed.</div>`+_dhTable(['Month','Cash book','Harvests','Harvests − cash'], rows);
  }
  const c5 = _dhCard('cash', 'Cash book vs harvests', _dhPack ? c5count : 0, _dhPack ? `${c5count} month(s) off by 5% or more` : 'tap to load from the financial pack', c5body, '#FEB30C');

  box.innerHTML = c1 + c2 + c3 + c4 + c5;
  const badge = document.getElementById('nav-health-badge');
  if(badge){ const n = (nm.count||0) + (bd.held_count||0) + (db.count||0) + stale + bad.length; badge.textContent = n ? n : ''; badge.style.display = n ? '' : 'none'; }
}

async function dhLoadPack(){
  try{
    const p = await _dhRpc('spawn_financial_pack', {p_from: new Date().getUTCFullYear()+'-01-01'});
    const hc = {}; (p.harvest_check||[]).forEach(h => hc[h.ym] = Number(h.spawn_share));
    _dhPack = { rows: (p.revenue||[]).map(r => { const cash = Number(r.vendo_sales||0), harvest = hc[r.ym]||0, diff = harvest - cash;
      return {ym:r.ym, cash, harvest, diff, pct: cash ? diff*100/cash : null}; }) };
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
function dhLinkPrompt(officeName){
  const v = prompt('Vendo ID to link "'+officeName+'" to:\n(find it in Harvest ▸ Vendos)');
  const id = parseInt(v, 10); if(!id) return;
  dhLink(officeName, id, null);
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
