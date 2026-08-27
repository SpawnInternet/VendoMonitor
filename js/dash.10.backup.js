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
    'summary_by_vendo','summary_by_area','summary_totals',
    /* money + subscriber records - previously omitted */
    'office_harvest_records','subscriber_payments','expenses','cash_receipts',
    'subscribers','ppp_roster','vendo_key_qr'
  ];

  /* tables with no id column - ordering by id 400s. Small enough for one page. */
  const NO_ID = new Set(['summary_by_area','summary_by_vendo']);

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

  function saveBlob(name, blob){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 15000);
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
      const ord = NO_ID.has(table) ? '' : '&order=id.asc';
      const q=`select=*${ord}&limit=1000&offset=${off}${filter?'&'+filter:''}`;
      let r=await fetch(`${SB}/rest/v1/${table}?${q}`,{headers:HDRS});
      if(r.status===400 && ord){
        /* no id column - retry unordered rather than losing the table */
        NO_ID.add(table);
        const q2=`select=*&limit=1000&offset=${off}${filter?'&'+filter:''}`;
        r=await fetch(`${SB}/rest/v1/${table}?${q2}`,{headers:HDRS});
      }
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
      if(typeof JSZip==='undefined' && window.spawnLazy){ await window.spawnLazy('zip'); }
      if(typeof JSZip==='undefined') throw new Error('JSZip not loaded — hard-refresh the page');
      const zip=new JSZip();
      const manifest=[`Spawn Internetan — core data export`,`Taken: ${nowPH()}`,``];
      let done=0, grand=0; const failed=[];
      for(const t of CORE){
        say(`Reading ${t}…`, (done/CORE.length)*95);
        let rows=[];
        try{ rows=await pull(t); }
        catch(e){ manifest.push(`${t}: *** FAILED *** (${e.message})`); failed.push(t); done++; continue; }
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
      if(failed.length) manifest.splice(2,0,
        `*** INCOMPLETE - ${failed.length} table(s) failed: ${failed.join(', ')} ***`, '');
      zip.file('MANIFEST.txt', manifest.join('\n'));
      say('Compressing…', 97);
      const blob=await zip.generateAsync({type:'blob', compression:'DEFLATE'});
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download = failed.length
        ? `spawn_core_INCOMPLETE_${stamp()}.zip`
        : `spawn_core_backup_${stamp()}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(a.href),8000);

      const lbt=document.getElementById('last-backup-time');
      if(failed.length){
        /* a partial export must never look like a good one */
        if(lbt) lbt.textContent=`⚠ Last attempt: ${nowPH()} — INCOMPLETE, ${failed.length} table(s) failed`;
        say(`❌ INCOMPLETE — failed: ${failed.join(', ')}`, 100);
        if(btn){ btn.textContent='❌ Incomplete'; }
        throw new Error('incomplete: '+failed.join(', '));
      }
      localStorage.setItem('last_backup', nowPH());
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
  /* ── all transactions, one click ──────────────────────────────────────────
     Deliberately NOT one 200 MB file: JS strings are 2 bytes/char, so the
     whole table as a single CSV is ~400 MB of heap before zipping starts and
     the tab dies partway. Instead we walk month by month, write each out, and
     drop the reference so the GC can reclaim it before the next one. */
  window.backupAllTxn = async function(){
    const btn=document.getElementById('backup-alltxn-btn');
    const old=btn?btn.textContent:'';
    if(btn){ btn.disabled=true; }
    const t0=Date.now();
    try{
      say('Finding months…', 1);
      const months=[]; const now=new Date();
      for(let i=0;i<36;i++){
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
      if(!found.length){ say('No transactions found.',100); hide(4000); return; }
      found.sort((a,b)=>a[0]<b[0]?-1:1);

      const grand=found.reduce((s,[,n])=>s+n,0);
      if(!confirm(`Download ${grand.toLocaleString()} transactions across `+
                  `${found.length} months?\n\nOne ZIP per month, about `+
                  `${Math.round(grand*150/1024/1024/10)} MB total.\n`+
                  `Takes several minutes — keep this tab open.`)){
        say('Cancelled.',100); hide(2500); return;
      }

      let done=0; const failed=[]; const report=[];
      for(const [ym,expected] of found){
        const [y,m]=ym.split('-').map(Number);
        const to=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
        const filter=`date=gte.${ym}-01&date=lt.${to}`;
        const pct=()=>Math.round(done/grand*95);
        try{
          if(btn) btn.textContent=`⏳ ${ym}`;
          let rows=await pull('transactions', filter, n=>
            say(`${ym}: ${n.toLocaleString()} / ${expected.toLocaleString()}  `+
                `(${done.toLocaleString()} of ${grand.toLocaleString()} total)`, pct()));
          if(rows.length!==expected)
            throw new Error(`got ${rows.length} of ${expected} rows`);

          say(`${ym}: compressing ${rows.length.toLocaleString()} rows…`, pct());
          let csv=toCsv(rows);
          rows=null;                                  /* free the row objects */
          const zip=new JSZip();
          zip.file(`spawn_transactions_${ym}.csv`, csv);
          csv=null;                                   /* free the CSV string  */
          const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
          saveBlob(`spawn_transactions_${ym}.zip`, blob);
          report.push(`${ym}: ${expected.toLocaleString()} rows, `+
                      `${(blob.size/1048576).toFixed(1)} MB`);
          done+=expected;
          await new Promise(r=>setTimeout(r,600));    /* let the GC catch up  */
        }catch(e){
          failed.push(`${ym}: ${e.message}`);
          say(`⚠ ${ym} failed — continuing`, pct());
        }
      }

      const mins=((Date.now()-t0)/60000).toFixed(1);
      if(failed.length){
        save(`spawn_transactions_INCOMPLETE_${stamp()}.txt`,
             'FAILED MONTHS — these were NOT downloaded:\n'+failed.join('\n')+
             '\n\nSucceeded:\n'+report.join('\n'),'text/plain');
        say(`❌ ${failed.length} month(s) failed — see the .txt file`, 100);
        if(btn) btn.textContent='❌ Incomplete';
      }else{
        save(`spawn_transactions_MANIFEST_${stamp()}.txt`,
             `All transactions exported ${nowPH()}\n`+
             `${grand.toLocaleString()} rows across ${found.length} months, ${mins} min\n\n`+
             report.join('\n'),'text/plain');
        say(`✅ ${grand.toLocaleString()} rows across ${found.length} months (${mins} min)`,100);
        if(btn) btn.textContent='✅ Done';
      }
      hide(9000);
    }catch(e){
      say('❌ '+e.message,100);
      if(btn) btn.textContent='❌ Failed';
    }finally{
      setTimeout(()=>{ if(btn){ btn.disabled=false; btn.textContent=old||'⬇ All Transactions'; } },6000);
    }
  };

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

  /* ── schema + functions (what pg_dump would give you) ──────────────────── */
  window.backupSchema = async function(pwd){
    const btn=document.getElementById('backup-schema-btn');
    const msg=document.getElementById('backup-schema-msg');
    const fld=document.getElementById('backup-schema-pwd');
    const note=(t,bad)=>{ if(msg){ msg.textContent=t; msg.style.color = bad?'#dc2626':'#7c3aed'; } };
    /* argument > password field > prompt. Never depends on prompt() alone -
       Chrome suppresses it once the user ticks "don't allow prompts". */
    const p = pwd || (fld && fld.value) || prompt('Admin password (schema export):');
    if(!p){ note('Password required.', true); return null; }
    const old = btn ? btn.textContent : '';
    if(btn){ btn.disabled=true; btn.textContent='Exporting…'; }
    try{
      const r = await fetch(`${SB}/rest/v1/rpc/spawn_export_schema`,
        {method:'POST', headers:HDRS, body:JSON.stringify({p_pwd:p})});
      if(!r.ok) throw new Error('HTTP '+r.status+' '+(await r.text()).slice(0,120));
      const sql = await r.json();
      if(sql === '-- DENIED') throw new Error('Wrong password');
      /* the function stamps this last - its absence means a truncated response */
      if(!sql || !sql.includes('-- END OF EXPORT'))
        throw new Error('truncated response — not saved');
      save(`spawn_schema_${stamp()}.sql`, sql, 'text/plain');
      const fns=(sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length;
      note(`✅ ${Math.round(sql.length/1024)} KB · ${fns} functions — commit as schema/current.sql`);
      if(fld) fld.value='';
      if(btn) btn.textContent='✅ Downloaded';
      return sql;
    }catch(e){
      note('❌ '+e.message, true);
      if(btn) btn.textContent='❌ Failed';
      throw e;
    }finally{
      setTimeout(()=>{ if(btn){ btn.disabled=false; btn.textContent=old||'⬇ Schema (.sql)'; } },4000);
    }
  };

  /* ── full backup = core + schema + rendered dashboard + manifest ────────── */
  window.fullBackup = async function(){
    say('Starting…', 2);
    /* collect the password up front - asking after two downloads is how the
       schema step got silently skipped */
    const fld=document.getElementById('backup-schema-pwd');
    let pwd=(fld && fld.value) || prompt('Admin password (for schema export):') || '';
    let coreOk=true;
    try{ await window.backupCore(); }
    catch(e){ coreOk=false; }
    try{
      const html=document.documentElement.outerHTML;
      save(`dashboard_snapshot_${stamp()}.html`, html, 'text/html');
    }catch(_){}
    let schemaOk=false;
    try{ schemaOk = pwd ? !!(await window.backupSchema(pwd)) : false; }
    catch(e){ say('⚠ schema export failed: '+e.message, 100); }
    if(!pwd) say('⚠ schema skipped — no password given', 100);
    if(!coreOk){
      say('❌ Backup INCOMPLETE — core data failed. Do not rely on these files.', 100);
      hide(9000); return;
    }
    say(`✅ Core${schemaOk?' + schema':''} + dashboard snapshot downloaded. Transactions: month buttons.`, 100);
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
