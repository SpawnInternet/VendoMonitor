
// ══════════════════════════════════════════════════════════
// IMPORT MODULE
// ══════════════════════════════════════════════════════════
const IMP_URL  = 'https://cviraqfhphhsonjmrtvu.supabase.co';
const IMP_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2aXJhcWZocGhoc29uam1ydHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2OTY2MTksImV4cCI6MjA5MTI3MjYxOX0.7xtCIZvwIOgYXvaj1fLokiOKXylnxhwbWC4PCwb_D1o';
const OCR_KEY  = 'K83477038988957'; // OCR.space free key

let impTgNames = [];
let stgData    = [];
let stgEditId  = null;
let currentScanFile = null;

async function importInit() {
  if (!impTgNames.length) await impLoadTgNames();
  await importRefreshStaging();
}

async function impLoadTgNames() {
  try {
    const r = await fetch(`${IMP_URL}/rest/v1/vendos?select=tg_name&tg_name=not.is.null&order=tg_name.asc&limit=5000`, {
      headers:{'apikey':IMP_KEY,'Authorization':'Bearer '+IMP_KEY}
    });
    const d = await r.json();
    impTgNames = [...new Set(d.map(x=>x.tg_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  } catch(e){ impTgNames=[]; }
}

// ── TABS ──────────────────────────────────────────────────
function impTab(mode, btn) {
  document.querySelectorAll('#panel-import .imp-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#panel-import .imp-mode').forEach(m=>m.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('imp-mode-'+mode).classList.add('active');
  if (mode==='queue') renderStaging();
}

// ── TG SEARCH ─────────────────────────────────────────────
function impTgSearch(inputId, suggId) {
  const q = document.getElementById(inputId).value.toLowerCase().trim();
  const box = document.getElementById(suggId);
  if (!q) { box.style.display='none'; return; }
  const results = impTgNames.filter(n=>n.toLowerCase().includes(q)).slice(0,12);
  if (!results.length) { box.style.display='none'; return; }
  box.innerHTML = results.map(n=>`<div onclick="impSelectTg('${inputId}','${suggId}','${n.replace(/'/g,"\\'")}')">${n}</div>`).join('');
  box.style.display='block';
}

function impSelectTg(inputId, suggId, name) {
  document.getElementById(inputId).value = name;
  document.getElementById(inputId).classList.add('matched');
  document.getElementById(suggId).style.display='none';
  if (inputId === 'se-tg') seLoadLastHarvest();
}

function impUseSheetName(tgId, nameId) {
  const name = document.getElementById(nameId).value.trim();
  if (!name) return;
  document.getElementById(tgId).value = name;
  document.getElementById(tgId).classList.add('matched');
}

document.addEventListener('click', e=>{
  if (!e.target.closest('.tg-wrap')) {
    document.querySelectorAll('.tg-sugg').forEach(b=>b.style.display='none');
  }
});

// ── SCANNER ───────────────────────────────────────────────
function onScanFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  currentScanFile = file;
  const url = URL.createObjectURL(file);
  const prev = document.getElementById('scanPreview');
  prev.src = url; prev.style.display='block';
  document.getElementById('btnRunOCR').style.display='block';
  document.getElementById('btnClearScan').style.display='block';
  document.getElementById('ocrStatus').textContent='Image ready. Click "Extract Text" to run OCR.';
}

function clearScan() {
  currentScanFile = null;
  document.getElementById('scanPreview').style.display='none';
  document.getElementById('scanPreview').src='';
  document.getElementById('btnRunOCR').style.display='none';
  document.getElementById('btnClearScan').style.display='none';
  document.getElementById('scanFileInput').value='';
  document.getElementById('ocrStatus').textContent='';
  document.getElementById('ocrRawBox').style.display='none';
  document.getElementById('ocrRawText').textContent='';
  ['sf-name','sf-address','sf-date','sf-collector','sf-total','sf-customer','sf-spawn','sf-old','sf-free','sf-saloy','sf-tg'].forEach(id=>{
    document.getElementById(id).value='';
  });
  document.getElementById('sf-net-display').style.display='none';
}

async function runOCR() {
  if (!currentScanFile) return;
  const btn = document.getElementById('btnRunOCR');
  btn.textContent='⏳ Extracting…'; btn.disabled=true;
  document.getElementById('ocrStatus').textContent='Sending to OCR.space…';
  try {
    const fd = new FormData();
    fd.append('file', currentScanFile);
    fd.append('apikey', OCR_KEY);
    fd.append('language', 'eng');
    fd.append('isOverlayRequired', 'false');
    fd.append('scale', 'true');
    fd.append('OCREngine', '2');
    const res = await fetch('https://api.ocr.space/parse/image', {method:'POST', body:fd});
    const data = await res.json();
    if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage || 'OCR failed');
    const rawText = data.ParsedResults?.[0]?.ParsedText || '';
    document.getElementById('ocrRawText').textContent = rawText;
    document.getElementById('ocrRawBox').style.display='block';
    parseOCRText(rawText);
    document.getElementById('ocrStatus').textContent='✅ OCR complete — review and edit fields below.';
  } catch(e) {
    document.getElementById('ocrStatus').textContent='❌ OCR error: '+e.message;
  }
  btn.textContent='🔍 Extract Text (OCR)'; btn.disabled=false;
}

function parseOCRText(text) {
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  const get = (patterns) => {
    for (const line of lines) {
      for (const p of patterns) {
        const m = line.match(p);
        if (m) return m[1]?.trim().replace(/,/g,'') || '';
      }
    }
    return '';
  };
  // Name & address — usually first 2 non-header lines
  const nameLines = lines.filter(l => !l.match(/spawn|internet|contact|fb page|piso wifi name|address|date|total|customer|collector|signature/i));
  if (nameLines[0]) document.getElementById('sf-name').value = nameLines[0];
  if (nameLines[1]) document.getElementById('sf-address').value = nameLines[1];

  const total    = get([/total[\s\-:]+([0-9,]+)/i, /total coin[\s\-:]*([0-9,]+)/i]);
  const customer = get([/customer[\s\-:]+([0-9,]+)/i]);
  const spawn    = get([/spawn[\s\-:]+([0-9,]+)/i]);
  const old      = get([/old coins?[\s\-:]+([0-9,]+)/i, /old[\s\-:]+([0-9,]+)/i]);
  const free     = get([/free\s*time[\s\-:]+([0-9,]+)/i, /freetime[\s\-:]+([0-9,]+)/i]);
  const saloy    = get([/saloy[\s\-:]+([0-9,]+)/i]);
  const collector= get([/gilbert|tandoy|ailyn|nelmar|joely/i]);
  const dateM    = text.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);

  if (total)    document.getElementById('sf-total').value    = total;
  if (customer) document.getElementById('sf-customer').value = customer;
  if (spawn)    document.getElementById('sf-spawn').value    = spawn;
  if (old)      document.getElementById('sf-old').value      = old;
  if (free)     document.getElementById('sf-free').value     = free;
  if (saloy)    document.getElementById('sf-saloy').value    = saloy;

  // Parse collector name from text
  const collectorMatch = text.match(/\b(gilbert|tandoy|ailyn|nelmar|joely)\b/i);
  if (collectorMatch) document.getElementById('sf-collector').value = collectorMatch[1];

  // Parse date
  if (dateM) {
    const parts = dateM[1].split(/[\/-]/);
    if (parts.length===3) {
      let [m,d,y] = parts;
      if (y.length===2) y='20'+y;
      document.getElementById('sf-date').value = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }
  }
  scanCalcNet();
}

function scanCalcNet() {
  const t=+document.getElementById('sf-total').value||0;
  const f=+document.getElementById('sf-free').value||0;
  const o=+document.getElementById('sf-old').value||0;
  const s=+document.getElementById('sf-saloy').value||0;
  const net=t-f-o-s;
  const disp=document.getElementById('sf-net-display');
  if(t>0){disp.style.display='block';document.getElementById('sf-net-val').textContent=net.toLocaleString();}
  else disp.style.display='none';
  // Auto-calc spawn if missing
  const sp=document.getElementById('sf-spawn');
  if(!sp.value && net>0) sp.value=Math.round(net*0.75);
  const cu=document.getElementById('sf-customer');
  if(!cu.value && net>0) cu.value=Math.round(net*0.25);
}

async function saveScanRow() {
  const row = {
    source:'scan',
    sheet_name: document.getElementById('sf-name').value.trim(),
    address:    document.getElementById('sf-address').value.trim(),
    harvest_date: document.getElementById('sf-date').value||null,
    collector:  document.getElementById('sf-collector').value.trim(),
    total_coins: +document.getElementById('sf-total').value||0,
    customer_share: +document.getElementById('sf-customer').value||0,
    spawn_share: +document.getElementById('sf-spawn').value||0,
    old_coins:  +document.getElementById('sf-old').value||0,
    free_coins: +document.getElementById('sf-free').value||0,
    saloy_coins:+document.getElementById('sf-saloy').value||0,
    tg_name:    document.getElementById('sf-tg').value.trim()||null,
    status:     document.getElementById('sf-tg').value.trim() ? 'matched' : 'pending',
    ocr_raw:    document.getElementById('ocrRawText').textContent||null,
  };
  if (!row.sheet_name) return alert('Please enter the Piso Wifi Name.');
  await impSaveRows([row]);
  alert('✅ Saved to staging!');
  clearScan();
  importRefreshStaging();
}

// ── CSV ───────────────────────────────────────────────────
let csvParsedRows = [];

function onCSVFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const text = ev.target.result;
    csvParsedRows = parseCSV(text);
    renderCSVPreview();
    document.getElementById('btnCSVImport').style.display='block';
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h=>h.trim().replace(/"/g,'').toLowerCase());
  return lines.slice(1).map(line => {
    const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || line.split(',');
    const clean = v => (v||'').replace(/"/g,'').trim().replace(/,/g,'');
    const idx = k => headers.findIndex(h=>h.includes(k));
    return {
      source:'csv',
      import_batch: document.getElementById('csvBatchLabel').value.trim()||'CSV Import',
      sheet_name: clean(vals[idx('name')]),
      address: clean(vals[idx('address')]),
      vendo_no: clean(vals[idx('vendo')]),
      harvest_date: parseDate(clean(vals[idx('date')])),
      collector: clean(vals[idx('collector')]),
      total_coins: +clean(vals[idx('total')])||0,
      customer_share: +clean(vals[idx('customer')])||0,
      spawn_share: +clean(vals[idx('spawn')])||0,
      old_coins: +clean(vals[idx('old')])||0,
      free_coins: +clean(vals[idx('free')])||0,
      saloy_coins: +clean(vals[idx('saloy')])||0,
      status:'pending',
    };
  }).filter(r=>r.sheet_name);
}

function parseDate(d) {
  if (!d) return null;
  const parts = d.split('/');
  if (parts.length===3) {
    let [m,day,y]=parts;
    if(y.length===2) y='20'+y;
    return `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  return null;
}

function renderCSVPreview() {
  const area = document.getElementById('csvPreviewArea');
  if (!csvParsedRows.length) { area.innerHTML='<div style="color:#dc2626;font-size:12px">No rows parsed.</div>'; return; }
  area.innerHTML = `<div style="font-size:12px;color:#16a34a;font-weight:600;margin-bottom:8px">✅ ${csvParsedRows.length} rows parsed — ready to save</div>
  <div style="overflow-x:auto;max-height:240px;font-size:11px;border:1px solid #e8eeff;border-radius:6px">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f0f4ff">${['#','Name','Address','Date','Total','Customer','Spawn','Collector'].map(h=>`<th style="padding:5px 8px;text-align:left;font-size:10px;font-weight:700;color:#1565c0;border-bottom:1px solid #e8eeff">${h}</th>`).join('')}</tr></thead>
      <tbody>${csvParsedRows.map((r,i)=>`<tr style="border-bottom:1px solid #f0f4ff">
        <td style="padding:4px 8px">${i+1}</td>
        <td style="padding:4px 8px;font-weight:600">${r.sheet_name}</td>
        <td style="padding:4px 8px;color:#6b7394">${r.address}</td>
        <td style="padding:4px 8px">${r.harvest_date||'—'}</td>
        <td style="padding:4px 8px">₱${r.total_coins.toLocaleString()}</td>
        <td style="padding:4px 8px">₱${r.customer_share.toLocaleString()}</td>
        <td style="padding:4px 8px">₱${r.spawn_share.toLocaleString()}</td>
        <td style="padding:4px 8px">${r.collector}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
}

async function saveCSVToStaging() {
  if (!csvParsedRows.length) return;
  const label = document.getElementById('csvBatchLabel').value.trim()||'CSV Import';
  const rows = csvParsedRows.map(r=>({...r, import_batch:label}));
  await impSaveRows(rows);
  alert(`✅ ${rows.length} rows saved to staging!`);
  document.getElementById('csvPreviewArea').innerHTML='';
  document.getElementById('btnCSVImport').style.display='none';
  document.getElementById('csvFileInput').value='';
  csvParsedRows=[];
  importRefreshStaging();
  impTab('queue', document.getElementById('imp-queue-tab'));
}

// ── MANUAL ────────────────────────────────────────────────
function manualCalcNet() {
  const t=+document.getElementById('mf-total').value||0;
  const f=+document.getElementById('mf-free').value||0;
  const o=+document.getElementById('mf-old').value||0;
  const s=+document.getElementById('mf-saloy').value||0;
  const net=t-f-o-s;
  const disp=document.getElementById('mf-net-display');
  if(t>0){disp.style.display='block';document.getElementById('mf-net-val').textContent=net.toLocaleString();}
  else disp.style.display='none';
}

async function saveManualRow() {
  const row = {
    source:'manual',
    sheet_name: document.getElementById('mf-name').value.trim(),
    address:    document.getElementById('mf-address').value.trim(),
    harvest_date: document.getElementById('mf-date').value||null,
    collector:  document.getElementById('mf-collector').value.trim(),
    total_coins: +document.getElementById('mf-total').value||0,
    customer_share: +document.getElementById('mf-customer').value||0,
    spawn_share: +document.getElementById('mf-spawn').value||0,
    old_coins:  +document.getElementById('mf-old').value||0,
    free_coins: +document.getElementById('mf-free').value||0,
    saloy_coins:+document.getElementById('mf-saloy').value||0,
    tg_name:    document.getElementById('mf-tg').value.trim()||null,
    status:     document.getElementById('mf-tg').value.trim() ? 'matched' : 'pending',
  };
  if (!row.sheet_name) return alert('Please enter the Piso Wifi Name.');
  await impSaveRows([row]);
  alert('✅ Saved to staging!');
  clearManual();
  importRefreshStaging();
}

function clearManual() {
  ['mf-name','mf-address','mf-date','mf-collector','mf-total','mf-customer','mf-spawn','mf-old','mf-free','mf-saloy','mf-tg'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('mf-net-display').style.display='none';
}

// ── SUPABASE SAVE ─────────────────────────────────────────
async function impSaveRows(rows) {
  const CHUNK = 50;
  for (let i=0; i<rows.length; i+=CHUNK) {
    const chunk = rows.slice(i, i+CHUNK);
    await fetch(`${IMP_URL}/rest/v1/harvest_staging`, {
      method:'POST',
      headers:{'apikey':IMP_KEY,'Authorization':'Bearer '+IMP_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body: JSON.stringify(chunk)
    });
  }
}

// ── STAGING QUEUE ─────────────────────────────────────────
async function importRefreshStaging() {
  try {
    const r = await fetch(`${IMP_URL}/rest/v1/harvest_staging?order=created_at.desc&limit=500`, {
      headers:{'apikey':IMP_KEY,'Authorization':'Bearer '+IMP_KEY}
    });
    stgData = await r.json();
    const pending = stgData.filter(r=>r.status==='pending'||r.status==='matched').length;
    document.getElementById('imp-queue-badge').textContent = pending;
    renderStaging();
    updateStgProgress();
  } catch(e){}
}

function renderStaging() {
  const q = (document.getElementById('stgSearch')?.value||'').toLowerCase();
  const f = document.getElementById('stgFilter')?.value||'all';
  const filtered = stgData.filter(r=>{
    const matchF = f==='all' || r.status===f;
    const matchQ = !q || (r.sheet_name||'').toLowerCase().includes(q) || (r.tg_name||'').toLowerCase().includes(q) || (r.address||'').toLowerCase().includes(q);
    return matchF && matchQ;
  });
  const list = document.getElementById('stgList');
  const empty = document.getElementById('stgEmpty');
  if (!filtered.length) { list.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  list.innerHTML = filtered.map(r => {
    const net = (r.total_coins||0)-(r.free_coins||0)-(r.old_coins||0)-(r.saloy_coins||0);
    return `<div class="stg-row" onclick="stgEditRow(${r.id})" style="cursor:pointer">
      <div style="font-size:10px;color:#6b7394">${r.source==='scan'?'📷':r.source==='csv'?'📄':'✏️'}</div>
      <div style="font-weight:600">${r.sheet_name||'—'}</div>
      <div style="color:#6b7394;font-size:11px">${r.address||'—'}</div>
      <div style="font-size:11px">${r.harvest_date||'—'}</div>
      <div style="font-size:11px">₱${(r.total_coins||0).toLocaleString()}</div>
      <div style="font-size:11px;color:#16a34a">₱${net.toLocaleString()}</div>
      <div style="font-size:11px;color:${r.tg_name?'#16a34a':'#d97706'}">${r.tg_name||'— unmatched'}</div>
      <div><span class="stg-status ${r.status||'pending'}">${r.status||'pending'}</span></div>
    </div>`;
  }).join('');
}

function updateStgProgress() {
  const total = stgData.length;
  if (!total) return;
  const done = stgData.filter(r=>r.status==='imported'||r.status==='skipped').length;
  const pct = Math.round(done/total*100);
  document.getElementById('imp-progress').style.display='block';
  document.getElementById('imp-progress-bar').style.width=pct+'%';
}

function stgEditRow(id) {
  const r = stgData.find(x=>x.id===id);
  if (!r) return;
  stgEditId = id;
  document.getElementById('stgEditName').textContent = `#${stgData.indexOf(r)+1} · ${r.sheet_name||''} · ${r.address||''}`;
  document.getElementById('se-name').value = r.sheet_name||'';
  document.getElementById('se-address').value = r.address||'';
  document.getElementById('se-date').value = r.harvest_date||'';
  document.getElementById('se-collector').value = r.collector||'';
  document.getElementById('se-total').value = r.total_coins||'';
  document.getElementById('se-customer').value = r.customer_share||'';
  document.getElementById('se-spawn').value = r.spawn_share||'';
  document.getElementById('se-old').value = r.old_coins||'';
  document.getElementById('se-free').value = r.free_coins||'';
  document.getElementById('se-saloy').value = r.saloy_coins||'';
  document.getElementById('se-tg').value = r.tg_name||'';
  if (r.tg_name) document.getElementById('se-tg').classList.add('matched');
  else document.getElementById('se-tg').classList.remove('matched');
  // Clear previous harvest fields
  ['se-prev-date','se-prev-total','se-prev-net','se-prev-collector'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('se-recon-window-display').textContent='set prev harvest date →';
  document.getElementById('se-last-harvest').style.display='none';
  document.getElementById('se-last-harvest-none').style.display='none';
  document.getElementById('stgEditPanel').style.display='flex';
  document.getElementById('stgEditPanel').scrollTop=0;
  setTimeout(()=>document.getElementById('se-tg').focus(),100);
  // Load last harvest if TG name already set
  if (document.getElementById('se-tg').value.trim()) seLoadLastHarvest();
}

function closeStgModal() {
  document.getElementById('stgEditPanel').style.display='none';
  stgEditId=null;
}

function seUpdateReconWindow() {
  const d = document.getElementById('se-prev-date').value;
  const disp = document.getElementById('se-recon-window-display');
  if (!d) { disp.textContent = 'set prev harvest date →'; return; }
  const harvestDate = document.getElementById('se-date').value;
  const days = harvestDate ? Math.round((new Date(harvestDate)-new Date(d))/86400000) : '?';
  disp.textContent = d + ' → ' + (harvestDate||'harvest date') + (days !== '?' ? ' (' + days + ' days)' : '');
}

async function seLoadLastHarvest() {
  const tg = document.getElementById('se-tg').value.trim();
  const lhBox  = document.getElementById('se-last-harvest');
  const lhNone = document.getElementById('se-last-harvest-none');
  if (!tg || tg.length < 2) { lhBox.style.display='none'; lhNone.style.display='none'; return; }
  try {
    // Get the harvest date currently being imported for this row
    const currentDate = document.getElementById('se-date').value || '9999-12-31';
    const r = await fetch(
      `${IMP_URL}/rest/v1/harvests?tg_name=eq.${encodeURIComponent(tg)}&harvest_date=lt.${currentDate}&order=harvest_date.desc&limit=1&select=harvest_date,coins_total,net_collectible,coins_free,coins_old,coins_saloy,collector,harvest_window_start`,
      {headers:{'apikey':IMP_KEY,'Authorization':'Bearer '+IMP_KEY}}
    );
    const data = await r.json();
    if (!data.length) {
      lhBox.style.display='none';
      lhNone.style.display='block';
      return;
    }
    const lh = data[0];
    const lhDate = lh.harvest_date || '—';
    const net = lh.net_collectible || ((lh.coins_total||0)-(lh.coins_free||0)-(lh.coins_old||0)-(lh.coins_saloy||0));
    const windowStart = lh.harvest_window_start || lhDate;
    // Days since last harvest
    let daysSince = '—';
    if (lhDate !== '—') {
      const diff = Math.round((new Date() - new Date(lhDate)) / 86400000);
      daysSince = diff + ' days ago';
    }
    document.getElementById('se-lh-date').textContent      = lhDate;
    document.getElementById('se-lh-total').textContent     = '₱' + (lh.coins_total||0).toLocaleString();
    document.getElementById('se-lh-net').textContent       = '₱' + net.toLocaleString();
    document.getElementById('se-lh-window').textContent    = windowStart;
    document.getElementById('se-lh-collector').textContent = lh.collector || '—';
    document.getElementById('se-lh-days').textContent      = daysSince;
    lhBox.style.display='block';
    lhNone.style.display='none';
    // Auto-fill manual fields from fetched data
    document.getElementById('se-prev-date').value      = lhDate !== '—' ? lhDate : '';
    document.getElementById('se-prev-total').value     = lh.coins_total || '';
    document.getElementById('se-prev-net').value       = net || '';
    document.getElementById('se-prev-collector').value = lh.collector || '';
    seUpdateReconWindow();
  } catch(e) {
    lhBox.style.display='none';
    lhNone.style.display='none';
  }
}

function stgNavRow(dir) {
  if (!stgEditId) return;
  const q=(document.getElementById('stgSearch')?.value||'').toLowerCase();
  const f=document.getElementById('stgFilter')?.value||'all';
  const filtered=stgData.filter(r=>{
    const matchF=f==='all'||r.status===f;
    const matchQ=!q||(r.sheet_name||'').toLowerCase().includes(q)||(r.tg_name||'').toLowerCase().includes(q);
    return matchF&&matchQ;
  });
  const idx=filtered.findIndex(r=>r.id===stgEditId);
  const next=filtered[idx+dir];
  if(next) stgEditRow(next.id);
}

async function saveStgEdit() {
  if (!stgEditId) return;
  const tg = document.getElementById('se-tg').value.trim();
  const updates = {
    sheet_name: document.getElementById('se-name').value.trim(),
    address: document.getElementById('se-address').value.trim(),
    harvest_date: document.getElementById('se-date').value||null,
    collector: document.getElementById('se-collector').value.trim(),
    total_coins: +document.getElementById('se-total').value||0,
    customer_share: +document.getElementById('se-customer').value||0,
    spawn_share: +document.getElementById('se-spawn').value||0,
    old_coins: +document.getElementById('se-old').value||0,
    free_coins: +document.getElementById('se-free').value||0,
    saloy_coins: +document.getElementById('se-saloy').value||0,
    tg_name: tg||null,
    status: tg ? 'matched' : 'pending',
  };
  await fetch(`${IMP_URL}/rest/v1/harvest_staging?id=eq.${stgEditId}`, {
    method:'PATCH',
    headers:{'apikey':IMP_KEY,'Authorization':'Bearer '+IMP_KEY,'Content-Type':'application/json'},
    body: JSON.stringify(updates)
  });
  await importRefreshStaging();
  renderStaging();
  alert('✅ Saved!');
}

async function importStgRow() {
  if (!stgEditId) return;
  const r = stgData.find(x=>x.id===stgEditId);
  if (!r) return;
  const tg = document.getElementById('se-tg').value.trim();
  if (!tg) return alert('Please match a TG name first.');
  // Insert into harvests
  const net = (r.total_coins||0)-(r.free_coins||0)-(r.old_coins||0)-(r.saloy_coins||0);
  const harvest = {
    tg_name: tg,
    sheet_name: document.getElementById('se-name').value.trim(),
    harvest_date: document.getElementById('se-date').value||null,
    collector: document.getElementById('se-collector').value.trim(),
    coins_total: +document.getElementById('se-total').value||0,
    customer_share: +document.getElementById('se-customer').value||0,
    spawn_share: +document.getElementById('se-spawn').value||0,
    coins_old: +document.getElementById('se-old').value||0,
    coins_free: +document.getElementById('se-free').value||0,
    coins_saloy: +document.getElementById('se-saloy').value||0,
    net_collectible: net,
    source: 'import',
    status: 'harvested',
    harvest_window_start: document.getElementById('se-prev-date').value || null,
  };
  const res = await fetch(`${IMP_URL}/rest/v1/harvests`, {
    method:'POST',
    headers:{'apikey':IMP_KEY,'Authorization':'Bearer '+IMP_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
    body: JSON.stringify(harvest)
  });
  if (res.ok) {
    // Mark staging as imported
    await fetch(`${IMP_URL}/rest/v1/harvest_staging?id=eq.${stgEditId}`, {
      method:'PATCH',
      headers:{'apikey':IMP_KEY,'Authorization':'Bearer '+IMP_KEY,'Content-Type':'application/json'},
      body: JSON.stringify({status:'imported', imported_at: new Date().toISOString()})
    });
    alert('✅ Imported to harvests!');
    closeStgModal(); stgNavRow(1);
    await importRefreshStaging();
    renderStaging();
  } else {
    alert('❌ Import failed.');
  }
}

async function skipStgRow() {
  if (!stgEditId) return;
  await fetch(`${IMP_URL}/rest/v1/harvest_staging?id=eq.${stgEditId}`, {
    method:'PATCH',
    headers:{'apikey':IMP_KEY,'Authorization':'Bearer '+IMP_KEY,'Content-Type':'application/json'},
    body: JSON.stringify({status:'skipped'})
  });
  closeStgModal();
  await importRefreshStaging();
  renderStaging();
}

async function deleteBulkStg() {
  const done = stgData.filter(r=>r.status==='imported'||r.status==='skipped');
  if (!done.length) return alert('No imported or skipped rows to delete.');
  if (!confirm(`Delete ${done.length} imported/skipped rows from staging?`)) return;
  for (const r of done) {
    await fetch(`${IMP_URL}/rest/v1/harvest_staging?id=eq.${r.id}`, {
      method:'DELETE',
      headers:{'apikey':IMP_KEY,'Authorization':'Bearer '+IMP_KEY}
    });
  }
  await importRefreshStaging();
  renderStaging();
  alert(`✅ ${done.length} rows deleted.`);
}

async function deleteStgRow() {
  if (!stgEditId) return;
  if (!confirm('Delete this row from staging? This cannot be undone.')) return;
  await fetch(`${IMP_URL}/rest/v1/harvest_staging?id=eq.${stgEditId}`, {
    method:'DELETE',
    headers:{'apikey':IMP_KEY,'Authorization':'Bearer '+IMP_KEY}
  });
  closeStgModal();
  await importRefreshStaging();
  renderStaging();
}

async function importConfirmAll() {
  const matched = stgData.filter(r=>r.status==='matched'&&r.tg_name);
  if (!matched.length) return alert('No matched rows to import.');
  if (!confirm(`Import ${matched.length} matched rows to harvests?`)) return;
  let ok=0;
  for (const r of matched) {
    const net=(r.total_coins||0)-(r.free_coins||0)-(r.old_coins||0)-(r.saloy_coins||0);
    const harvest={
      tg_name:r.tg_name, sheet_name:r.sheet_name,
      harvest_date:r.harvest_date, collector:r.collector,
      coins_total:r.total_coins, customer_share:r.customer_share,
      spawn_share:r.spawn_share, coins_old:r.old_coins,
      coins_free:r.free_coins, coins_saloy:r.saloy_coins,
      net_collectible:net, source:'import', status:'harvested',
    };
    const res=await fetch(`${IMP_URL}/rest/v1/harvests`,{
      method:'POST',
      headers:{'apikey':IMP_KEY,'Authorization':'Bearer '+IMP_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify(harvest)
    });
    if (res.ok) {
      await fetch(`${IMP_URL}/rest/v1/harvest_staging?id=eq.${r.id}`,{
        method:'PATCH',
        headers:{'apikey':IMP_KEY,'Authorization':'Bearer '+IMP_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({status:'imported',imported_at:new Date().toISOString()})
      });
      ok++;
    }
  }
  alert(`✅ ${ok} rows imported to harvests!`);
  await importRefreshStaging();
  renderStaging();
}
