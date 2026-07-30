/* ══════════════════════════════════════════════════════════════════════════
   BACKUP CENTER v2  (dash.10)
   ------------------------------------------------------------------------
   Replaces two buttons that could not finish.

   The old backupData() pulled every non-skipped transaction — 1,039,719 rows
   over 1,040 sequential gateway round-trips — into one JS array, then built a
   ~180 MB CSV string from it. fullBackup() was worse: no is_skipped filter
   (1,245,286 rows / 1,246 requests) and then JSZip compressed the whole thing
   in memory alongside the original. Neither had ever completed; the "Last
   backup: never" label was the evidence.

   What replaces them:
     • backupCore()      — the small, irreplaceable operational tables as a
                           ZIP of CSVs. ~7k rows, a couple of seconds.
     • backupTxnMonth()  — transactions one month at a time (~150k rows,
                           ~26 MB), memory freed between months, resumable.
     • fullBackup()      — core ZIP + dashboard HTML + a manifest that states
                           plainly what is and is not inside.

   This is an operational export, NOT a database backup. The 823 MB
   transactions table and everything outside the gateway's allow-list are
   covered by Supabase's own daily backups (Database ▸ Backups).
   ══════════════════════════════════════════════════════════════════════════ */

(function(){
  const SB  = window.__SPAWN_SB || 'https://cviraqfhphhsonjmrtvu.supabase.co';
  const HDRS = { apikey:'gw', Authorization:'Bearer gw', 'Content-Type':'application/json' };

  /* tables the admin gateway will actually serve, smallest-risk first.
     office_accounts is deliberately excluded — it holds staff PINs and this
     file lands in a Downloads folder. */
  const CORE = [
    'vendos','harvests','harvest_groups','harvest_group_items','harvest_pack_items',
    'harvest_reconciliations','collectors','collector_expenses','technicians',
    'key_logs','key_items','key_changes','key_transfers','key_custodians',
    'vendo_installs','routes','route_items','job_orders',
    'summary_by_vendo','summary_by_area','summary_totals'
  ];

  const stamp = () => new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
  const nowPH = () => new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila',hour12:true});

  function say(msg, pct){
    const box=document.getElementById('backup-progress');
    const m=document.getElementById('backup-progress-msg');
    const b=document.getElementById('backup-progress-bar');
    if(box) box.style.display='block';
    if(m) m.textContent=msg;
    if(b && pct!=null) b.style.width=Math.max(0,Math.min(100,pct))+'%';
  }
  function hide(after){ setTimeout(()=>{ const b=document.getElementById('backup-progress'); if(b) b.style.display='none'; }, after||3500); }

  function save(name, text, mime){
    const blob=new Blob([text],{type:(mime||'text/csv')+';charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 8000);
  }

  const cell = v => {
    if(v==null) return '';
    const s = (typeof v==='object') ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  };
  function toCsv(rows){
    if(!rows.length) return '';
    const cols=Object.keys(rows[0]);
    const out=[cols.join(',')];
    for(const r of rows) out.push(cols.map(c=>cell(r[c])).join(','));
    return out.join('\n');
  }

  async function countOf(table, filter){
    const r=await fetch(`${SB}/rest/v1/${table}?select=*&limit=1${filter?'&'+filter:''}`,
                        {headers:{...HDRS, Prefer:'count=exact'}});
    const cr=r.headers.get('content-range')||'';
    return parseInt(cr.split('/')[1]||'0',10)||0;
  }

  async function pull(table, filter, onProgress){
    const rows=[];
    for(let off=0; off<500000; off+=1000){
      const q=`select=*&order=id.asc&limit=1000&offset=${off}${filter?'&'+filter:''}`;
      const r=await fetch(`${SB}/rest/v1/${table}?${q}`,{headers:HDRS});
      if(!r.ok){
        const t=await r.text().catch(()=> '');
        throw new Error(`${table}: HTTP ${r.status} ${t.slice(0,120)}`);
      }
      const page=await r.json();
      if(!Array.isArray(page)) throw new Error(`${table}: ${(page&&page.error)||'unexpected reply'}`);
      if(!page.length) break;
      rows.push(...page);
      if(onProgress) onProgress(rows.length);
      if(page.length<1000) break;
    }
    return rows;
  }

  /* ── core operational tables → ZIP of CSVs ─────────────────────────────── */
  window.backupCore = async function(){
    const btn=document.getElementById('backup-core-btn');
    const old=btn?btn.textContent:'';
    if(btn){ btn.disabled=true; btn.textContent='⏳ Working…'; }
    try{
      if(typeof JSZip==='undefined') throw new Error('JSZip not loaded — hard-refresh the page');
      const zip=new JSZip();
      const manifest=[`Spawn Internetan — core data export`,`Taken: ${nowPH()}`,``];
      let done=0, grand=0;
      for(const t of CORE){
        say(`Reading ${t}…`, (done/CORE.length)*95);
        let rows=[];
        try{ rows=await pull(t); }
        catch(e){ manifest.push(`${t}: SKIPPED (${e.message})`); done++; continue; }
        zip.file(`${t}.csv`, toCsv(rows));
        manifest.push(`${t}: ${rows.length} rows`);
        grand+=rows.length; done++;
      }
      manifest.push('', 'NOT INCLUDED:',
        '  transactions  — 1.24M rows / 823 MB. Use the per-month buttons, or',
        '                  Supabase ▸ Database ▸ Backups for the real thing.',
        '  office_accounts, keeper_secrets — credentials, deliberately omitted.',
        '  Any table outside the admin gateway allow-list.',
        '', 'This is an operational export, not a database backup.');
      zip.file('MANIFEST.txt', manifest.join('\n'));
      say('Compressing…', 97);
      const blob=await zip.generateAsync({type:'blob', compression:'DEFLATE'});
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=`spawn_core_backup_${stamp()}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(a.href),8000);

      localStorage.setItem('last_backup', nowPH());
      const lbt=document.getElementById('last-backup-time');
      if(lbt) lbt.textContent=`Last backup: ${nowPH()} — core export, ${grand.toLocaleString()} rows`;
      say(`✅ Done — ${grand.toLocaleString()} rows across ${CORE.length} tables`, 100);
      if(btn){ btn.textContent='✅ Downloaded'; }
      hide();
    }catch(e){
      say('❌ '+e.message, 100);
      if(btn) btn.textContent='❌ Failed';
    }finally{
      setTimeout(()=>{ if(btn){ btn.disabled=false; btn.textContent=old||'⬇ Core Data (ZIP)'; } },4000);
    }
  };

  /* ── transactions, one month per file ─────────────────────────────────── */
  window.backupTxnMonth = async function(ym){
    const from=ym+'-01';
    const [y,m]=ym.split('-').map(Number);
    const to=new Date(Date.UTC(y, m, 1)).toISOString().slice(0,10);   // 1st of next month
    const filter=`date=gte.${from}&date=lt.${to}`;
    const btn=document.getElementById('btn-txn-'+ym);
    const old=btn?btn.textContent:'';
    if(btn){ btn.disabled=true; }
    try{
      const total=await countOf('transactions', filter);
      if(!total){ if(btn) btn.textContent='0 rows'; setTimeout(()=>{if(btn){btn.textContent=old;btn.disabled=false;}},2500); return; }
      say(`${ym}: 0 / ${total.toLocaleString()} rows…`, 0);
      const rows=await pull('transactions', filter, n=>{
        if(btn) btn.textContent=`⏳ ${Math.round(n/total*100)}%`;
        say(`${ym}: ${n.toLocaleString()} / ${total.toLocaleString()} rows…`, n/total*95);
      });
      say(`${ym}: building CSV…`, 97);
      save(`spawn_transactions_${ym}.csv`, toCsv(rows));
      say(`✅ ${ym} — ${rows.length.toLocaleString()} rows saved`, 100);
      if(btn) btn.textContent=`✅ ${rows.length.toLocaleString()}`;
      hide();
    }catch(e){
      say(`❌ ${ym}: ${e.message}`, 100);
      if(btn) btn.textContent='❌ failed';
    }finally{
      setTimeout(()=>{ if(btn){ btn.disabled=false; btn.textContent=old; } },5000);
    }
  };

  /* build the month buttons from what is actually in the table */
  window.backupRenderMonths = async function(){
    const host=document.getElementById('backup-months'); if(!host) return;
    host.innerHTML='<span style="font-size:11px;color:var(--mu)">Reading months…</span>';
    try{
      const months=[];
      const now=new Date();
      for(let i=0;i<24;i++){
        const d=new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()-i, 1));
        months.push(d.toISOString().slice(0,7));
      }
      const found=[];
      for(const ym of months){
        const [y,m]=ym.split('-').map(Number);
        const to=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
        const n=await countOf('transactions', `date=gte.${ym}-01&date=lt.${to}`);
        if(n) found.push([ym,n]);
      }
      if(!found.length){ host.innerHTML='<span style="font-size:11px;color:var(--mu)">No transactions found.</span>'; return; }
      host.innerHTML = found.map(([ym,n])=>
        `<button id="btn-txn-${ym}" onclick="backupTxnMonth('${ym}')"
           style="padding:5px 10px;border:1px solid rgba(22,163,74,.35);background:#fff;color:#15803d;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">
           ${ym} · ${n.toLocaleString()}</button>`).join('');
    }catch(e){
      host.innerHTML='<span style="font-size:11px;color:var(--red)">Could not read months: '+e.message+'</span>';
    }
  };

  /* ── full backup = core + rendered dashboard + manifest ────────────────── */
  window.fullBackup = async function(){
    say('Starting…', 2);
    await window.backupCore();
    try{
      const html=document.documentElement.outerHTML;
      save(`dashboard_snapshot_${stamp()}.html`, html, 'text/html');
    }catch(_){}
    say('✅ Core export + dashboard snapshot downloaded. Transactions: use the month buttons.', 100);
    hide(6000);
  };

  /* the old handler name, kept so the existing button still works */
  window.backupData = function(){ return window.backupCore(); };

  window.backupHarvesterApp = function(){
    window.open('https://github.com/SpawnInternet/VendoMonitor/blob/main/harvest_v3.html','_blank');
  };
  window.backupAppPy = function(){
    const m=document.getElementById('apypy-msg');
    if(m) m.textContent='Private repo — opening GitHub…';
    window.open('https://github.com/SpawnInternet/VendoMonitor-Cloud/blob/main/app.py','_blank');
    setTimeout(()=>{ if(m) m.textContent=''; }, 4000);
  };
})();
