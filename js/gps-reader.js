/* ══════════════════════════════════════════════════════════════════════
   SPAWN GPS READER  (2026-11-26)
   One reader for every place in Vendo Monitor that takes a GPS:
     • vendo card (Info tab)          • Harvest → 📍 GPS tab
     • Harvest → Installs form        • subscriber page
   How a photo is read, most exact first:
     1. EXIF GPS tag written by the camera (exact).
     2. OCR of the stamp burned into the picture (Conota, GPS Map Camera,
        Timestamp Camera). Several strips, two image treatments; a stamp
        read counts as CONFIRMED only when two separate reads agree to
        within ~15 m. A single read is shown as "single read — check it".
   Every result is then checked against the pins we already have:
   which area / harvest group the nearest vendos belong to, how far the
   nearest one is, and whether the place printed on the stamp agrees.
   Nothing is saved without the owner pressing Save (admin password).
   ══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const SB  = window.__SPAWN_SB || 'https://cviraqfhphhsonjmrtvu.supabase.co';
const HDR = {apikey:'gw', Authorization:'Bearer gw', 'Content-Type':'application/json'};
const ADMIN_PW = '101510';

/* Zamboanga del Norte service area */
const BOX = {la0:7.5, la1:9.5, ln0:122.5, ln1:124.0};
const inBox = (la,ln) => la > BOX.la0 && la < BOX.la1 && ln > BOX.ln0 && ln < BOX.ln1;

/* SINAMAN / MINAOG / MIX AREAS vendos are harvested by DIPOLOG groups */
const FAMILY = {SINAMAN:'DIPOLOG', MINAOG:'DIPOLOG', 'MIX AREAS':'DIPOLOG'};
const fam = a => { a = String(a||'').toUpperCase().trim(); return FAMILY[a] || a; };

/* city / town words a stamp prints, mapped to our area labels */
const PLACE_AREA = [
  [/dipolog/i,'DIPOLOG'], [/dapitan/i,'DAPITAN'], [/sindangan/i,'SINDANGAN'],
  [/polanco/i,'POLANCO'], [/roxas/i,'ROXAS'], [/katipunan/i,'KATIPUNAN'], [/manukan/i,'MANUKAN']
];

const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const r6  = n => +(+n).toFixed(6);
const decs = s => { const m = String(s).match(/[.,](\d+)/); return m ? m[1].length : 0; };

/* metres between two points (equirectangular is plenty at this scale) */
function km(la1,ln1,la2,ln2){
  const x = (ln2-ln1) * Math.cos((la1+la2)/2*Math.PI/180), y = la2-la1;
  return Math.sqrt(x*x+y*y) * 111.195;
}
function fmtDist(k){ return k < 1 ? Math.round(k*1000)+' m' : k.toFixed(1)+' km'; }

/* ── sanity ─────────────────────────────────────────────────────────── */
function sane(g){
  if(!g || !isFinite(g.lat) || !isFinite(g.lng)) return {ok:false, why:'Could not read coordinates'};
  if(g.lat === 0 && g.lng === 0) return {ok:false, why:'0, 0 is not a real location'};
  if(inBox(g.lat, g.lng)) return {ok:true};
  if(inBox(g.lng, g.lat)) return {ok:false, why:'Looks reversed — lat and lng are swapped', swapped:true};
  if(Math.abs(g.lat) > 90 || Math.abs(g.lng) > 180) return {ok:false, why:'Out of range for a coordinate'};
  return {ok:false, why:'Outside Zamboanga del Norte'};
}

/* ── text → coordinates ─────────────────────────────────────────────────
   OCR confuses letters inside numbers. Fix only inside runs that already
   hold digits, so words ("Long", "Sicayab") are never touched.           */
function fixOcr(t){
  let s = String(t||'').replace(/\r/g,'\n');
  s = s.replace(/[0-9OoQDIl|!SsBZ.,°º'′"″]+/g, run => {
    if((run.match(/\d/g)||[]).length < 2) return run;
    return run.replace(/[OoQD]/g,'0').replace(/[Il|!]/g,'1').replace(/[Ss]/g,'5').replace(/B/g,'8').replace(/Z/g,'2');
  });
  // decimal comma: 8,594080 → 8.594080 (a comma followed by 4+ digits and no further dot)
  s = s.replace(/(\d{1,3}),(\d{4,})(?![\d.])/g, '$1.$2');
  return s;
}

/* every coordinate pair the text could mean, best-labelled first */
function candidates(text){
  const out = [];
  const push = (la, ln, how, score, d) => {
    la = +la; ln = +ln;
    if(!isFinite(la) || !isFinite(ln)) return;
    let swapped = false;
    if(!inBox(la,ln) && inBox(ln,la)){ const t = la; la = ln; ln = t; swapped = true; }
    out.push({lat:r6(la), lng:r6(ln), how, score, decimals:d, swapped});
  };
  const s = fixOcr(text);

  // 1. labelled: "Lat 8.594080  Long 123.350890" (also "Lat 8 594080" when OCR loses the dot)
  const la = s.match(/Lat(?:itude)?\.?\s*[:=]?\s*(-?\d{1,2})\s*[.,\s]\s*(\d{4,8})/i);
  const lo = s.match(/Lo?ng?(?:itude)?\.?\s*[:=]?\s*(-?\d{2,3})\s*[.,\s]\s*(\d{4,8})/i);
  if(la && lo) push(la[1]+'.'+la[2], lo[1]+'.'+lo[2], 'label', 3, Math.min(la[2].length, lo[2].length));

  // 2. degrees-minutes-seconds: 8°35'38.7"N 123°21'03.2"E
  const dmsRe = /(\d{1,2})\s*[°º]\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*["″]?\s*([NS])[\s,;]*(\d{2,3})\s*[°º]\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*["″]?\s*([EW])/ig;
  let m;
  while((m = dmsRe.exec(s))){
    let a = +m[1] + m[2]/60 + m[3]/3600, b = +m[5] + m[6]/60 + m[7]/3600;
    if(/S/i.test(m[4])) a = -a; if(/W/i.test(m[8])) b = -b;
    push(a, b, 'dms', 3, 5);
  }

  // 3. decimal pair: 8.594080, 123.350890  /  8.594080°N 123.350890°E
  const pairRe = /(-?\d{1,2}\.\d{3,8})\s*[°º]?\s*[NS]?\s*[,;/\s]\s*(-?\d{2,3}\.\d{3,8})\s*[°º]?\s*[EW]?/g;
  while((m = pairRe.exec(s))) push(m[1], m[2], 'pair', 2, Math.min(decs(m[1]), decs(m[2])));

  // 3b. one side lost its decimal point ("123.006738" read as "1231006738" or "123006738").
  //     The other side tells how many decimals the stamp prints, so the run length shows whether
  //     the dot was misread as a character (3+1+d digits) or dropped (3+d) — never guessed.
  const fixLng = (run, d) => {
    if(!/^12[234]/.test(run) || d < 4) return null;
    if(run.length === 3+1+d && /[1Il|:;'`]/.test(run[3])) return run.slice(0,3)+'.'+run.slice(4);
    if(run.length === 3+d) return run.slice(0,3)+'.'+run.slice(3);
    return null;
  };
  const fixLat = (run, d) => {
    if(!/^[789]/.test(run) || d < 4) return null;
    if(run.length === 1+1+d && /[1Il|:;'`]/.test(run[1])) return run.slice(0,1)+'.'+run.slice(2);
    if(run.length === 1+d) return run.slice(0,1)+'.'+run.slice(1);
    return null;
  };
  const latOk = /(-?\d{1,2}\.(\d{4,8}))\s*[°º]?\s*[NS]?\s*[,;/\s]\s*([0-9Il|:;'`]{7,12})(?![\d.])/g;
  while((m = latOk.exec(s))){ const f = fixLng(m[3], m[2].length); if(f) push(m[1], f, 'repair', 1.5, m[2].length); }
  const lngOk = /(?<![\d.])([0-9Il|:;'`]{5,10})\s*[°º]?\s*[NS]?\s*[,;/\s]\s*(-?\d{2,3}\.(\d{4,8}))/g;
  while((m = lngOk.exec(s))){ const f = fixLat(m[1], m[3].length); if(f) push(f, m[2], 'repair', 1.5, m[3].length); }

  // 4. loose: any latitude-looking number and any longitude-looking number
  const nums = (s.match(/-?\d{1,3}\.\d{4,8}/g)||[]);
  const a = nums.find(n => +n > BOX.la0 && +n < BOX.la1), b = nums.find(n => +n > BOX.ln0 && +n < BOX.ln1);
  if(a && b) push(a, b, 'loose', 1, Math.min(decs(a), decs(b)));

  return out;
}

/* paste box / free text → one coordinate (or null) */
function parse(text){
  const c = candidates(text);
  if(!c.length){
    // plain "8.59, 123.35" with few decimals still counts when typed by hand
    const raw = String(text||'').trim();
    const n = /^[\s\d.,°º\-NSEWnsew]+$/.test(raw) ? raw.match(/-?\d+(?:\.\d+)?/g) : null;
    if(n && n.length >= 2) return {lat:r6(n[0]), lng:r6(n[1]), how:'typed', decimals:Math.min(decs(n[0]),decs(n[1]))};
    return null;
  }
  const ok = c.filter(x => inBox(x.lat,x.lng)).sort((x,y)=>y.score-x.score);
  return ok[0] || c[0];
}

/* the place line printed on a stamp, and which area it names */
function stampPlace(text){
  const lines = String(text||'').split(/\n+/).map(l=>l.trim()).filter(l=>l.length > 6 && /[a-z]{4,}/i.test(l));
  for(const l of lines){
    for(const [re, area] of PLACE_AREA) if(re.test(l)) return {line:l.replace(/\s+/g,' ').slice(0,90), area};
  }
  const z = lines.find(l => /zamboanga|philippines/i.test(l));
  return z ? {line:z.replace(/\s+/g,' ').slice(0,90), area:null} : null;
}

/* ── EXIF GPS (handles every tag type the cameras use) ──────────────── */
function exifFromTiff(dv, base){
  const le = dv.getUint16(base) === 0x4949;
  const u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le);
  if(u16(base+2) !== 0x002A) return null;
  const ifd0 = base + u32(base+4), n = u16(ifd0);
  let gpsOff = 0;
  for(let i=0;i<n;i++){ const e = ifd0+2+i*12; if(u16(e) === 0x8825){ gpsOff = base + u32(e+8); break; } }
  if(!gpsOff) return null;
  const gn = u16(gpsOff), tags = {};
  for(let i=0;i<gn;i++){
    const e = gpsOff+2+i*12, tag = u16(e), type = u16(e+2), cnt = u32(e+4);
    const unit = type===5||type===10 ? 8 : type===3 ? 2 : type===4||type===9 ? 4 : 1;
    const at = (cnt*unit > 4) ? base + u32(e+8) : e+8;
    if(type === 2){ let t=''; for(let k=0;k<cnt-1;k++) t += String.fromCharCode(dv.getUint8(at+k)); tags[tag] = t; }
    else if(type === 5 || type === 10){ const arr=[]; for(let k=0;k<cnt;k++){ const num = type===10 ? dv.getInt32(at+k*8, le) : u32(at+k*8), den = type===10 ? dv.getInt32(at+k*8+4, le) : u32(at+k*8+4); arr.push(den ? num/den : 0); } tags[tag] = arr; }
  }
  const dms = a => Array.isArray(a) ? (a[0]||0) + (a[1]||0)/60 + (a[2]||0)/3600 : null;
  let lat = dms(tags[2]), lng = dms(tags[4]);
  if(lat == null || lng == null || (!lat && !lng)) return null;
  if(String(tags[1]||'N').toUpperCase().startsWith('S')) lat = -lat;
  if(String(tags[3]||'E').toUpperCase().startsWith('W')) lng = -lng;
  return {lat:r6(lat), lng:r6(lng)};
}
async function exif(blob){
  try{
    const buf = await blob.slice(0, 512*1024).arrayBuffer();
    const dv = new DataView(buf);
    if(dv.byteLength < 4 || dv.getUint16(0) !== 0xFFD8) return null;
    let off = 2;
    while(off < dv.byteLength - 4){
      const marker = dv.getUint16(off);
      if((marker & 0xFF00) !== 0xFF00) break;
      const size = dv.getUint16(off+2);
      if(marker === 0xFFE1){
        let tag=''; for(let i=0;i<4;i++) tag += String.fromCharCode(dv.getUint8(off+4+i));
        if(tag === 'Exif'){ const g = exifFromTiff(dv, off+10); if(g) return g; }
      }
      if(size < 2) break;
      off += 2 + size;
    }
  }catch(e){}
  return null;
}

/* ── OCR of the stamp ───────────────────────────────────────────────── */
let _worker = null;
async function worker(){
  if(_worker) return _worker;
  if(!window.Tesseract){
    await new Promise((ok,bad)=>{
      const sc = document.createElement('script');
      sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      sc.onload = ok; sc.onerror = () => bad(new Error('OCR library did not load — check internet'));
      document.head.appendChild(sc);
    });
  }
  _worker = await window.Tesseract.createWorker('eng');
  try{ await _worker.setParameters({tessedit_pageseg_mode:'6', preserve_interword_spaces:'1'}); }catch(_){}
  return _worker;
}
function loadImg(blob){
  return new Promise((ok,bad)=>{ const u = URL.createObjectURL(blob), im = new Image();
    im.onload = () => { ok(im); setTimeout(()=>URL.revokeObjectURL(u), 1000); };
    im.onerror = () => bad(new Error('photo did not open')); im.src = u; });
}
/* crop a band, scale it so stamp text is ~30px high, then either stretch
   contrast (mode 0) or black-on-white threshold (mode 1, Otsu)           */
function band(img, top, bottom, mode){
  const W = img.naturalWidth, H = img.naturalHeight;
  const sy = Math.floor(H*top), sh = Math.max(1, Math.floor(H*(bottom-top)));
  const scale = Math.max(0.5, Math.min(2.5, 1600 / W));   // 1600 px wide is enough for stamp text and ~35% faster than 2000
  const c = document.createElement('canvas'); c.width = Math.round(W*scale); c.height = Math.round(sh*scale);
  const ctx = c.getContext('2d', {willReadFrequently:true});
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, sy, W, sh, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0,0,c.width,c.height), px = d.data, n = px.length/4;
  const g = new Uint8ClampedArray(n); let lo = 255, hi = 0; const hist = new Uint32Array(256);
  for(let i=0,j=0;i<px.length;i+=4,j++){ const v = (px[i]*0.299 + px[i+1]*0.587 + px[i+2]*0.114)|0; g[j]=v; hist[v]++; if(v<lo) lo=v; if(v>hi) hi=v; }
  if(mode === 1){
    // Otsu threshold; stamp text is usually white on a dark band → make text black
    let sum=0; for(let t=0;t<256;t++) sum += t*hist[t];
    let sB=0, wB=0, best=0, th=127;
    for(let t=0;t<256;t++){ wB += hist[t]; if(!wB) continue; const wF = n-wB; if(!wF) break;
      sB += t*hist[t]; const mB = sB/wB, mF = (sum-sB)/wF, between = wB*wF*(mB-mF)*(mB-mF);
      if(between > best){ best = between; th = t; } }
    let bright = 0; for(let j=0;j<n;j++) if(g[j] > th) bright++;
    const textIsBright = bright < n/2;   // the minority colour is the text
    for(let i=0,j=0;i<px.length;i+=4,j++){ const on = textIsBright ? g[j] > th : g[j] <= th; const v = on ? 0 : 255; px[i]=px[i+1]=px[i+2]=v; }
  } else {
    const span = Math.max(1, hi-lo);
    for(let i=0,j=0;i<px.length;i+=4,j++){ const v = Math.round((g[j]-lo)*255/span); px[i]=px[i+1]=px[i+2]=v; }
  }
  ctx.putImageData(d,0,0);
  return c;
}
const AGREE_KM = 0.015;   // two reads within 15 m = the same reading

/* 2026-11-26 (faster): at most 5 passes and a 12 s budget. Order: bottom strip; if it gives a
   reading, ONE confirmation pass on the same strip with the other treatment (usually done in 2 passes).
   Otherwise top strip, then the other treatment on both, then a taller bottom strip. No whole-photo pass
   (slowest, rarely helps). opts.cancel() → stop between passes. */
const OCR_BUDGET_MS = 12000;
async function ocr(blob, onStatus, opts){
  opts = opts || {};
  const t0 = Date.now();
  const img = await loadImg(blob);
  const w = await worker();
  const plan = [[0.70,1,0],[0,0.30,0],[0.70,1,1],[0,0.30,1],[0.50,1,0]];
  const reads = []; let allText = ''; let pass = 0;
  const run = async (a,b,mode) => {
    pass++;
    onStatus && onStatus('Reading the stamp… pass '+pass+' · '+Math.round((Date.now()-t0)/1000)+' s');
    let text = '';
    try{ const r = await w.recognize(band(img, a, b, mode)); text = (r && r.data && r.data.text) || ''; }catch(_){}
    allText += text + '\n';
    const good = candidates(text).filter(c => inBox(c.lat,c.lng) && c.decimals >= 4).sort((x,y)=>y.score-x.score);
    if(good.length) reads.push(Object.assign({band:a+'-'+b, mode}, good[0]));
    return good.length > 0;
  };
  for(let i=0; i<plan.length; i++){
    if(opts.cancel && opts.cancel()) return {gps:null, text:allText.trim(), error:'stopped'};
    if(Date.now()-t0 > OCR_BUDGET_MS) break;
    const [a,b,mode] = plan[i];
    const found = await run(a,b,mode);
    if(found){
      let best = cluster(reads);
      if(best.count >= 2) return finish(best, reads, allText);
      // confirm on the same strip with the other treatment
      if(!(opts.cancel && opts.cancel()) && Date.now()-t0 <= OCR_BUDGET_MS) await run(a,b,mode?0:1);
      best = cluster(reads);
      if(best.count >= 2) return finish(best, reads, allText);
    }
  }
  const best = cluster(reads);
  return best ? finish(best, reads, allText) : {gps:null, text:allText.trim(), reads:[], error: Date.now()-t0 > OCR_BUDGET_MS ? 'no readable stamp within 12 s' : 'no readable stamp'};
}
/* the reading most reads agree with (ties → better label) */
function cluster(reads){
  if(!reads.length) return null;
  let best = null;
  reads.forEach(r => {
    const near = reads.filter(o => km(r.lat,r.lng,o.lat,o.lng) <= AGREE_KM);
    const score = near.length*10 + r.score + r.decimals/10;
    if(!best || score > best.s) best = {s:score, r, count:near.length};
  });
  return best;
}
function finish(best, reads, text){
  const r = best.r;
  return {gps:{lat:r.lat, lng:r.lng}, how:'stamp', agree:best.count, decimals:r.decimals, swapped:!!r.swapped,
          disagree: reads.filter(o => km(r.lat,r.lng,o.lat,o.lng) > AGREE_KM).map(o=>({lat:o.lat,lng:o.lng})),
          text:text.trim(), place:stampPlace(text)};
}

/* photo (File/Blob) → {gps, how:'exif'|'stamp', agree, place, text} */
async function read(blob, opts){
  opts = opts || {};
  const say = opts.onStatus || (()=>{});
  say('Checking the photo for GPS data…');
  const e = await exif(blob);
  if(e && sane(e).ok) return {gps:e, how:'exif', agree:99, decimals:6, place:null, text:''};
  say('No GPS data in the file — reading the stamp on the picture…');
  try{ return await ocr(blob, say, opts); }
  catch(err){ return {gps:null, error:String(err && err.message || err), text:''}; }
}
async function readUrl(url, opts){
  const clean = String(url).split('?')[0] + '?t=' + Date.now();   // skip a stale cached copy
  const r = await fetch(clean);
  if(!r.ok) throw new Error('could not open the saved photo ('+r.status+')');
  return read(await r.blob(), opts);
}

/* ── pins we already have (vendos + their harvest group) ─────────────── */
async function fetchAll(table, query){
  const all = [];
  for(let off=0; ; off+=1000){
    const r = await fetch(SB+'/rest/v1/'+table+'?'+query+'&limit=1000&offset='+off, {headers:HDR});
    if(!r.ok) throw new Error(table+' read failed ('+r.status+')');
    const rows = await r.json();
    if(!Array.isArray(rows)) throw new Error(table+' read failed');
    all.push(...rows);
    if(rows.length < 1000) break;
  }
  return all;
}
let _pins = null, _pinsAt = 0, _pinsP = null;
async function pins(force){
  if(!force && _pins && Date.now()-_pinsAt < 10*60*1000) return _pins;
  if(_pinsP) return _pinsP;
  _pinsP = (async()=>{
    const [vs, items, groups] = await Promise.all([
      fetchAll('vendos','select=id,sheet_name,tg_name,area,lat,lng,barangay&status=eq.active&lat=not.is.null&lng=not.is.null&order=id.asc'),
      fetchAll('harvest_group_items','select=vendo_id,group_run_id&order=id.asc'),
      fetchAll('harvest_groups','select=id,group_id,group_label,collector,area&order=id.asc')
    ]);
    const gById = {}; groups.forEach(g => gById[g.id] = g);
    const gOf = {}; items.forEach(i => { if(i.vendo_id && !gOf[i.vendo_id]) gOf[i.vendo_id] = i.group_run_id; });
    _pins = vs.map(v => ({id:v.id, name:v.sheet_name||v.tg_name||('#'+v.id), area:String(v.area||'').toUpperCase(),
                          lat:+v.lat, lng:+v.lng, barangay:v.barangay||null, group:gById[gOf[v.id]]||null}))
              .filter(p => isFinite(p.lat) && isFinite(p.lng));
    _pins.groups = groups;
    _pinsAt = Date.now();
    return _pins;
  })().finally(()=>{ _pinsP = null; });
  return _pinsP;
}
function forget(){ _pins = null; }

/* which area / group the nearest vendos say this point belongs to */
async function near(lat, lng, opts){
  opts = opts || {};
  const all = await pins();
  const list = all.filter(p => p.id !== opts.excludeId)
    .map(p => Object.assign({km:km(lat,lng,p.lat,p.lng)}, p))
    .sort((a,b)=>a.km-b.km);
  const nearest = list[0] || null;
  const k = list.filter(p => p.km <= 4).slice(0, 7);
  if(!k.length) return {count:0, nearest, nearestKm: nearest ? nearest.km : null};
  const vote = (key) => {
    const t = {}; let tot = 0;
    k.forEach(p => { const v = key(p); if(!v) return; const w = 1/(p.km+0.1); t[v] = (t[v]||0)+w; tot += w; });
    const top = Object.keys(t).sort((a,b)=>t[b]-t[a])[0];
    return top ? {val:top, share:t[top]/tot} : null;
  };
  const a = vote(p => p.area), gv = vote(p => p.group ? String(p.group.id) : null);
  const group = gv ? (all.groups||[]).find(g => String(g.id) === gv.val) : null;
  return {
    count:k.length, nearest, nearestKm:nearest.km,
    area: a ? a.val : null, areaShare: a ? a.share : 0,
    areaVotes: k.filter(p => a && p.area === a.val).length,
    group, groupShare: gv ? gv.share : 0
  };
}

/* pins that look wrong (GPS tab ⚠ Check pin) → {id: reason} */
function suspects(rows){
  const P = rows.filter(v => v.lat != null && v.lng != null).map(v => ({id:v.id, name:v.sheet_name||v.tg_name||('#'+v.id),
    area:String(v.area||'').toUpperCase(), lat:+v.lat, lng:+v.lng}));
  const out = {};
  P.forEach(p => {
    const s = sane(p);
    if(!s.ok){ out[p.id] = s.why; return; }
    const others = P.filter(o => o.id !== p.id).map(o => Object.assign({km:km(p.lat,p.lng,o.lat,o.lng)}, o)).sort((a,b)=>a.km-b.km);
    const twin = others[0] && others[0].km < 0.003 ? others[0] : null;
    if(twin){ out[p.id] = 'Same pin as '+twin.name; return; }
    const f = fam(p.area);
    const n5 = others.filter(o => o.km <= 3).slice(0,5);
    if(n5.length >= 4){
      const diff = n5.filter(o => fam(o.area) !== f);
      if(diff.length >= 4){
        const t = {}; diff.forEach(o => t[o.area] = (t[o.area]||0)+1);
        const top = Object.keys(t).sort((a,b)=>t[b]-t[a])[0];
        out[p.id] = 'Listed '+(p.area||'no area')+' but the vendos around it are '+top; return;
      }
    }
    const same = others.find(o => fam(o.area) === f);
    if(same && same.km > 5) out[p.id] = 'Far from every other '+f+' vendo ('+fmtDist(same.km)+')';
  });
  return out;
}

/* ── saving ─────────────────────────────────────────────────────────── */
async function patch(table, filter, body){
  const r = await fetch(SB+'/rest/v1/'+table+'?'+filter, {method:'PATCH', headers:Object.assign({}, HDR, {Prefer:'return=minimal'}), body:JSON.stringify(body)});
  if(!r.ok){ const t = await r.text().catch(()=>''); throw new Error(table+' save failed: '+t.slice(0,120)); }
}
async function uploadPhoto(path, blob){
  const up = await fetch(SB+'/storage/v1/object/harvest-photos/'+path, {method:'POST',
    headers:{apikey:'gw', Authorization:'Bearer gw', 'Content-Type':blob.type||'image/jpeg', 'x-upsert':'true'}, body:blob});
  const txt = await up.text();
  if(!up.ok) throw new Error('photo upload failed');
  try{ const j = JSON.parse(txt); if(j && j.public_url) return j.public_url+'?t='+Date.now(); }catch(_){}
  return SB+'/storage/v1/object/public/harvest-photos/'+path+'?t='+Date.now();
}
async function rebuildCollectorCache(){
  try{
    const r = await fetch(SB+'/functions/v1/spawn-gw-admin', {method:'POST',
      headers:{'Content-Type':'application/json', 'x-gw-token':window.__ADMIN_GW_TOKEN||''},
      body:JSON.stringify({kind:'cache', fns:['write-vendo-cache','write-vendos-cache']})});
    return r.ok;
  }catch(_){ return false; }
}
/* target = {kind:'vendo'|'subscriber', id}; res = a read result or {gps, how:'typed'} */
async function save(target, res, photoBlob){
  const g = res.gps, now = new Date().toISOString();
  const src = res.how === 'exif' ? 'photo exif' : res.how === 'stamp' ? 'photo stamp' : 'manual';
  let photoUrl = null;
  if(target.kind === 'vendo'){
    await patch('vendos', 'id=eq.'+target.id, {lat:g.lat, lng:g.lng, gps:g.lat+', '+g.lng, gps_updated_at:now});
    // the collector app reads lat/lng from harvest_group_items — keep both in step
    await patch('harvest_group_items', 'vendo_id=eq.'+target.id, {lat:g.lat, lng:g.lng}).catch(()=>{});
    if(photoBlob){ photoUrl = await uploadPhoto('vendo-profiles/vendo_'+target.id+'.jpg', photoBlob); await patch('vendos','id=eq.'+target.id,{photo_url:photoUrl}); }
    forget();
    const cacheOk = await rebuildCollectorCache();
    return {photoUrl, cacheOk};
  }
  if(target.kind === 'subscriber'){
    const body = {lat:g.lat, lng:g.lng, gps_updated_at:now, gps_source:src};
    if(res.place && res.place.line) body.gps_place = res.place.line;
    await patch('subscribers', 'id=eq.'+target.id, body);
    if(photoBlob){ photoUrl = await uploadPhoto('subscriber-photos/sub_'+target.id+'.jpg', photoBlob); await patch('subscribers','id=eq.'+target.id,{photo_url:photoUrl}); }
    return {photoUrl, cacheOk:true};
  }
  throw new Error('unknown target');
}

/* ── shared inline panel (no pop-ups except the admin password) ──────────
   SpawnGps.panel(host, {kind, id, name, area, lat, lng, photoUrl, file, onSaved}) */
const BTN = 'padding:7px 12px;border:none;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;';
function panel(host, o){
  if(!host) return;
  const uid = 'sg'+Math.random().toString(36).slice(2,8);
  const st = {res:null, blob:null, busy:false};
  const word = o.kind === 'subscriber' ? 'subscriber' : 'vendo';
  host.innerHTML = `
  <div style="border:1.5px solid #c7d2fe;background:#f8faff;border-radius:12px;padding:12px;margin:6px 0 10px;font-size:12px;color:#1e293b;">
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
      <b style="font-size:12px;color:#311A8E;margin-right:4px;">📍 GPS reader</b>
      ${o.photoUrl ? `<button type="button" id="${uid}-cur" style="${BTN}background:#025AC6;color:#fff;">📷 Read the saved photo</button>` : ''}
      <button type="button" id="${uid}-pick" style="${BTN}background:#311A8E;color:#fff;">📷 Read a new photo</button>
      <input type="file" id="${uid}-file" accept="image/*" style="display:none">
    </div>
    <div style="display:flex;gap:6px;">
      <input id="${uid}-in" placeholder="or paste: 8.597090, 123.354540  ·  8°35'49.5&quot;N 123°21'16.3&quot;E" autocomplete="off"
        style="flex:1;min-width:0;height:34px;padding:0 10px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;font-family:ui-monospace,monospace;box-sizing:border-box;">
      <button type="button" id="${uid}-chk" style="${BTN}background:#fff;color:#025AC6;border:1.5px solid #025AC6;">Check</button>
    </div>
    <div id="${uid}-msg" style="margin-top:8px;color:#6b7280;min-height:16px;"></div>
    <div id="${uid}-res"></div>
  </div>`;
  const $ = s => host.querySelector('#'+uid+'-'+s);
  worker().catch(()=>{});   // start loading the OCR engine now, so the first photo does not wait for the download
  const msg = (t, c) => { const m = $('msg'); if(m){ m.style.color = c||'#6b7280'; m.innerHTML = t; } };

  async function show(res){
    st.res = res;
    const box = $('res'); if(!box) return;
    if(!res || !res.gps){
      box.innerHTML = '';
      msg('❌ No readable GPS in this photo'+(res && res.error ? ' ('+esc(res.error)+')' : '')+' — type it from the stamp in the box above.', '#b91c1c');
      return;
    }
    const g = res.gps, s = sane(g);
    if(!s.ok){
      box.innerHTML = '';
      msg('❌ '+esc(g.lat+', '+g.lng)+' — '+esc(s.why)+(s.swapped ? ` <button type="button" id="${uid}-swap" style="${BTN}padding:3px 9px;background:#025AC6;color:#fff;">Swap them</button>` : ''), '#b91c1c');
      const sw = $('swap'); if(sw) sw.onclick = () => { $('in').value = g.lng+', '+g.lat; check(); };
      return;
    }
    const how = res.how === 'exif' ? '<span style="color:#027e60;font-weight:800;">from the camera\'s GPS data (exact)</span>'
      : res.how === 'stamp' ? (res.agree >= 2 ? `<span style="color:#027e60;font-weight:800;">from the stamp · ${res.agree} reads agree</span>`
                                              : '<span style="color:#b45309;font-weight:800;">from the stamp · single read — compare with the picture</span>')
      : '<span style="color:#475569;font-weight:700;">typed</span>';
    const warn = [];
    if(res.swapped) warn.push('Lat and lng were in reverse order on the stamp — swapped.');
    if(res.decimals != null && res.decimals < 4) warn.push('Only '+res.decimals+' decimals — about '+(res.decimals===3?'110 m':'1 km')+' off at worst. Use the full number from the stamp.');
    if(res.disagree && res.disagree.length) warn.push('Another read gave '+res.disagree.map(d=>d.lat+', '+d.lng).join(' / ')+' — check the digits against the picture.');
    if(o.lat != null && o.lng != null && isFinite(+o.lat)){
      const mv = km(+o.lat, +o.lng, g.lat, g.lng);
      if(mv > 0.3) warn.push('Moves the saved pin by '+fmtDist(mv)+'.');
    }
    box.innerHTML = `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
      <div style="font-size:14px;font-weight:900;font-family:ui-monospace,monospace;">✅ ${g.lat}, ${g.lng}
        <a href="https://www.google.com/maps?q=${g.lat},${g.lng}" target="_blank" rel="noopener" style="font-family:inherit;font-size:12px;color:#025AC6;font-weight:800;margin-left:6px;">view on map ↗</a></div>
      <div style="margin-top:3px;">${how}</div>
      ${res.place ? `<div style="margin-top:3px;color:#475569;">🏷 Stamp says: <b>${esc(res.place.line)}</b></div>` : ''}
      <div id="${uid}-area" style="margin-top:6px;color:#6b7280;">Checking against nearby vendos…</div>
      ${warn.map(w=>`<div style="margin-top:5px;color:#b45309;font-weight:700;">⚠ ${esc(w)}</div>`).join('')}
      ${st.blob ? `<label style="display:flex;gap:6px;align-items:center;margin-top:8px;cursor:pointer;"><input type="checkbox" id="${uid}-keep" ${o.photoUrl?'':'checked'}> Also save this picture as the ${word} photo</label>` : ''}
      <div style="display:flex;gap:6px;margin-top:10px;">
        <button type="button" id="${uid}-save" style="${BTN}flex:1;background:#16a34a;color:#fff;padding:9px;">💾 Save GPS</button>
        <button type="button" id="${uid}-x" style="${BTN}background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;">Cancel</button>
      </div></div>`;
    msg('');
    $('save').onclick = doSave;
    $('x').onclick = () => { st.res = null; box.innerHTML = ''; };
    areaCheck(g, res.place);
  }

  async function areaCheck(g, place){
    const el = $('area'); if(!el) return;
    try{
      const n = await near(g.lat, g.lng, {excludeId: o.kind === 'vendo' ? o.id : null});
      if(!$('area')) return;
      if(!n.count){
        el.innerHTML = `<span style="color:#b45309;font-weight:800;">⚠ No vendo within 4 km${n.nearest ? ' — nearest is '+esc(n.nearest.name)+', '+fmtDist(n.nearestKm) : ''}. Check the digits.</span>`;
        return;
      }
      const bits = [`${n.areaVotes} of ${n.count} nearest vendos are <b>${esc(n.area)}</b>`,
                    `nearest ${fmtDist(n.nearestKm)} (${esc(n.nearest.name)})`];
      if(n.group && n.groupShare >= 0.5) bits.push('group <b>'+esc((n.group.group_id?n.group.group_id+' · ':'')+(n.group.group_label||''))+'</b>');
      let html = '📌 '+bits.join(' · ');
      if(o.area && fam(o.area) !== fam(n.area) && n.areaShare >= 0.6)
        html += `<div style="color:#b91c1c;font-weight:800;margin-top:3px;">⚠ This ${word} is listed as ${esc(String(o.area).toUpperCase())} — the GPS is among ${esc(n.area)} vendos.</div>`;
      if(place && place.area && n.area && fam(place.area) !== fam(n.area) && n.areaShare >= 0.6)
        html += `<div style="color:#b91c1c;font-weight:800;margin-top:3px;">⚠ The stamp says ${esc(place.area)} but the point is among ${esc(n.area)} vendos — check the numbers.</div>`;
      el.innerHTML = html;
    }catch(e){ el.textContent = 'Could not check nearby vendos ('+e.message+')'; }
  }

  async function run(getRes, blob){
    if(st.busy) return; st.busy = true; st.stop = false;
    st.blob = blob || null; $('res').innerHTML = '';
    try{
      const r = await getRes();
      if(r && r.error === 'stopped'){ msg('Stopped. Type the coordinates from the stamp in the box above.', '#6b7280'); }
      else await show(r);
    }
    catch(e){ msg('❌ '+esc(e.message||e), '#b91c1c'); }
    finally{ st.busy = false; }
  }
  const ropts = () => ({onStatus: t => { msg('⏳ '+esc(t)+` <button type="button" id="${uid}-stop" style="${BTN}padding:2px 9px;margin-left:6px;background:#fff;color:#b91c1c;border:1px solid #fca5a5;">Stop</button>`); const b=$('stop'); if(b) b.onclick=()=>{ st.stop=true; }; },
                        cancel: () => st.stop});
  function check(){
    const t = $('in').value.trim();
    if(!t){ msg('Paste coordinates first.', '#b45309'); return; }
    const p = parse(t);
    st.blob = null;
    show(p ? {gps:{lat:p.lat, lng:p.lng}, how:'typed', decimals:p.decimals, swapped:p.swapped} : null);
  }
  async function doSave(){
    if(!st.res || !st.res.gps) return;
    const pw = await window.askAdminPw('Enter admin password to save this GPS.');
    if(pw === null) return;
    if(pw !== ADMIN_PW){ if(window.markAdminPwWrong) window.markAdminPwWrong(); window.toast && toast('Wrong password'); return; }
    const keep = $('keep') && $('keep').checked ? st.blob : null;
    msg('Saving…');
    try{
      const out = await save({kind:o.kind, id:o.id}, st.res, keep);
      window.toast && toast(o.kind === 'vendo' ? (out.cacheOk ? '✅ GPS saved — collectors see it on next refresh' : '⚠ GPS saved; collector cache will update at 21:00') : '✅ GPS saved');
      o.onSaved && o.onSaved(st.res.gps, out);
    }catch(e){ msg('❌ '+esc(e.message||e), '#b91c1c'); }
  }

  if($('cur')) $('cur').onclick = () => run(() => readUrl(o.photoUrl, ropts()), null);
  $('pick').onclick = () => $('file').click();
  $('file').onchange = () => { const f = $('file').files[0]; if(f) run(() => read(f, ropts()), f); };
  $('chk').onclick = check;
  $('in').onkeydown = e => { if(e.key === 'Enter') check(); };
  if(o.file) run(() => read(o.file, ropts()), o.file);
  else if(o.lat != null && o.lng != null && isFinite(+o.lat)){
    // show how the pin already saved checks out
    msg('Saved pin: '+(+o.lat)+', '+(+o.lng)+' — checking…');
    near(+o.lat, +o.lng, {excludeId: o.kind === 'vendo' ? o.id : null}).then(n => {
      if(st.res || st.busy) return;
      if(!n.count){ msg('⚠ Saved pin has no vendo within 4 km — it may be wrong.', '#b45309'); return; }
      const bad = o.area && fam(o.area) !== fam(n.area) && n.areaShare >= 0.6;
      msg((bad ? '⚠ ' : '✓ ')+'Saved pin: '+n.areaVotes+' of '+n.count+' nearest vendos are '+esc(n.area)+' · nearest '+fmtDist(n.nearestKm)
          +(bad ? ' — but this '+word+' is listed as '+esc(String(o.area).toUpperCase()) : ''), bad ? '#b91c1c' : '#027e60');
    }).catch(()=>msg(''));
  }
}

window.SpawnGps = {sane, parse, candidates, fixOcr, stampPlace, exif, read, readUrl, near, pins, forget, suspects, save, panel, km, fmtDist, family:fam, BUILD:'gps1126d'};
})();
