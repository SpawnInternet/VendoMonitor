// Global toast notification (was missing — caused silent failures in save handlers)
window.toast = window.toast || function(msg, ms){
  ms = ms || 2500;
  var t = document.getElementById('_global_toast');
  if(!t){
    t = document.createElement('div');
    t.id = '_global_toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(16px);background:#1e293b;color:#fff;padding:11px 22px;border-radius:10px;font-size:13px;font-weight:600;z-index:99999;opacity:0;transition:.25s;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:90vw;text-align:center';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(function(){
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(16px)';
  }, ms);
};


// ============================================================
// SECURITY: no service_role key in any dashboard file.
// Login posts the admin password to the spawn-admin-login edge
// function; on success it returns the admin gateway token, held
// in memory only. All DB/storage calls are transparently routed
// through spawn-gw-admin by the interceptor below.
// ============================================================
(function(){
  const SL_KEY='spawn_admin_auth';
  const SL_TTL=24*60*60*1000;
  const SB='https://cviraqfhphhsonjmrtvu.supabase.co';
  const LOGIN_URL = SB + '/functions/v1/spawn-admin-login';
  const GW_URL    = SB + '/functions/v1/spawn-gw-admin';

  window.__SPAWN_SB = SB;
  window.__ADMIN_GW_TOKEN = null;   // set after successful login

  // ── Transparent fetch interceptor: reroute REST + rpc + storage via admin gateway ──
  (function installAdminGatewayInterceptor(){
    const _origFetch = window.fetch.bind(window);
    const REST_RE   = /\/rest\/v1\/([a-z_0-9]+)(\?([^#]*))?$/;
    const RPC_RE    = /\/rest\/v1\/rpc\/([a-z_0-9]+)$/;
    const STOR_UP_RE= /\/storage\/v1\/object\/(?!public\/)([a-z0-9_-]+)\/(.+)$/i;

    const _inflight = new Map();
    function _dedupe(key, makeReq){
      const hit = _inflight.get(key);
      if(hit) return hit.then(r=>r.clone());
      const p = makeReq().finally(()=>_inflight.delete(key));
      _inflight.set(key, p);
      return p.then(r=>r.clone());
    }

    window.fetch = async function(input, init){
      try {
        const url = (typeof input === 'string') ? input : (input && input.url) || '';
        const opts = init || {};
        const hdrs = opts.headers || {};
        const isGw = (hdrs['x-spawn-gw'] === '1') || (hdrs.apikey === 'gw');

        if (url.indexOf(SB) === 0 && isGw) {
          const TOKEN = window.__ADMIN_GW_TOKEN;
          if(!TOKEN){ return new Response(JSON.stringify({error:'not authenticated'}), {status:401}); }
          const method = (opts.method || 'GET').toUpperCase();

          // ---- RPC (must be checked before generic REST) ----
          const rpcm = url.match(RPC_RE);
          if (rpcm) {
            const fn = rpcm[1];
            const body = opts.body ? JSON.parse(opts.body) : undefined;
            return _origFetch(GW_URL, {
              method:'POST',
              headers:{ 'Content-Type':'application/json', 'x-gw-token': TOKEN },
              body: JSON.stringify({ kind:'rpc', fn, body })
            });
          }

          // ---- REST ----
          const m = url.match(REST_RE);
          if (m) {
            const table = m[1];
            const query = m[3] || '';
            const prefer = hdrs['Prefer'] || hdrs['prefer'] || '';
            const body = opts.body ? JSON.parse(opts.body) : undefined;
            const send = () => _origFetch(GW_URL, {
              method:'POST',
              headers:{ 'Content-Type':'application/json', 'x-gw-token': TOKEN },
              body: JSON.stringify({ kind:'rest', table, method, query, body, prefer })
            });
            if (method === 'GET') return _dedupe('GET|'+table+'|'+query, send);
            return send();
          }

          // ---- Storage upload ----
          const s = url.match(STOR_UP_RE);
          if (s && (method === 'POST' || method === 'PUT')) {
            const bucket = s[1];
            const path = s[2];
            const ctype = hdrs['Content-Type'] || 'image/jpeg';
            const buf = (opts.body instanceof Blob) ? await opts.body.arrayBuffer() : opts.body;
            const bytes = new Uint8Array(buf);
            let bin=''; for(let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
            const data_base64 = btoa(bin);
            const r = await _origFetch(GW_URL, {
              method:'POST',
              headers:{ 'Content-Type':'application/json', 'x-gw-token': TOKEN },
              body: JSON.stringify({ kind:'storage', bucket, path, data_base64, content_type: ctype })
            });
            return new Response(await r.text(), { status: r.status });
          }
        }
      } catch(e){ console.warn('[ADMIN-GW] intercept fallthrough:', e && e.message); }
      return _origFetch(input, init);
    };
  })();

  function reveal(){ const el=document.getElementById('spawn-login-screen'); if(el) el.classList.add('hidden'); }

  function slCheck(){
    try{
      const s=JSON.parse(localStorage.getItem(SL_KEY)||'null');
      if(s && s.ok && s.token && Date.now()-s.ts < SL_TTL){
        window.__ADMIN_GW_TOKEN = s.token;
        reveal();
        return;
      }
    }catch(e){}
    const el=document.getElementById('spawn-login-screen'); if(el) el.classList.remove('hidden');
  }

  window.slLogin=async function(){
    const p=(document.getElementById('sl-pass').value||'').trim();
    const err=document.getElementById('sl-error');
    const btn=document.querySelector('#sl-login-view .sl-btn');
    if(btn){ btn.disabled=true; btn.textContent='Signing in…'; }
    try{
      const r = await fetch(LOGIN_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ password: p })
      });
      const d = await r.json().catch(()=>({}));
      if(r.ok && d.ok && d.token){
        window.__ADMIN_GW_TOKEN = d.token;
        localStorage.setItem(SL_KEY, JSON.stringify({ ok:true, token:d.token, ts:Date.now() }));
        if(err) err.classList.remove('show');
        reveal();
        setTimeout(()=>{ try{ location.reload(); }catch(_){} }, 100);
        return;
      }
      throw new Error('invalid');
    }catch(e){
      if(err){ err.textContent='Incorrect password'; err.classList.add('show'); }
      const pass=document.getElementById('sl-pass'); if(pass){ pass.value=''; pass.focus(); }
      const card=document.getElementById('sl-login-view');
      if(card){ card.style.transform='translateX(-8px)'; setTimeout(()=>{card.style.transform='translateX(8px)';},80); setTimeout(()=>{card.style.transform='';},160); }
    }finally{
      if(btn){ btn.disabled=false; btn.textContent='Sign in →'; }
    }
  };

  window.slLogout=function(){
    localStorage.removeItem(SL_KEY);
    window.__ADMIN_GW_TOKEN=null;
    location.reload();
  };

  // device-approval flow retired under password login; stub kept so any stray call is harmless
  window.slCheckApproval = window.slCheckApproval || function(){};

  slCheck();
})();
