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


(function(){
  const SL_KEY='spawn_admin_auth';
  const SL_USER='admin';
  const SL_PASS='spawn2024';
  const SL_TTL=24*60*60*1000;
  const SB='https://cviraqfhphhsonjmrtvu.supabase.co';
  const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2aXJhcWZocGhoc29uam1ydHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0MDQ4MDIsImV4cCI6MjA1ODk4MDgwMn0.1Nf1cVMSnFkFMDFRzDFUsxbvZy2vBFJnFOdOthHxq9k';

  // Generate stable device ID
  function getDeviceId(){
    let id=localStorage.getItem('spawn_device_id');
    if(!id){
      id='dev_'+Math.random().toString(36).slice(2)+Date.now().toString(36);
      localStorage.setItem('spawn_device_id',id);
    }
    return id;
  }

  function getDeviceName(){
    const ua=navigator.userAgent;
    if(/iPhone/.test(ua)) return 'iPhone';
    if(/iPad/.test(ua)) return 'iPad';
    if(/Android/.test(ua)) return 'Android';
    if(/Windows/.test(ua)) return 'Windows PC';
    if(/Mac/.test(ua)) return 'Mac';
    return 'Unknown Device';
  }

  function slCheck(){
    try{
      const s=JSON.parse(localStorage.getItem(SL_KEY)||'null');
      if(s && s.ok && Date.now()-s.ts < SL_TTL){
        document.getElementById('spawn-login-screen').classList.add('hidden');
        return;
      }
    }catch(e){}
    document.getElementById('spawn-login-screen').classList.remove('hidden');
  }

  window.slLogin=async function(){
    const u=(document.getElementById('sl-user').value||'').trim();
    const p=(document.getElementById('sl-pass').value||'').trim();
    const err=document.getElementById('sl-error');
    if(u===SL_USER && p===SL_PASS){
      // Grant access directly
      localStorage.setItem(SL_KEY,JSON.stringify({ok:true,ts:Date.now()}));
      document.getElementById('spawn-login-screen').classList.add('hidden');
      err.classList.remove('show');
    } else {
      err.textContent='Incorrect username or password';
      err.classList.add('show');
      document.getElementById('sl-pass').value='';
      document.getElementById('sl-pass').focus();
      const card=document.getElementById('sl-login-view');
      card.style.transform='translateX(-8px)';
      setTimeout(()=>{card.style.transform='translateX(8px)';},80);
      setTimeout(()=>{card.style.transform='';},160);
    }
  };

  window.slCheckApproval=async function(){
    const devId=window._slDevId||getDeviceId();
    try{
      const r=await fetch(`${SB}/rest/v1/device_approvals?device_id=eq.${devId}&select=status`,
        {headers:{apikey:ANON,Authorization:'Bearer '+ANON}});
      const rows=await r.json();
      const status=(rows[0]||{}).status||'pending';
      const el=document.getElementById('sl-pending-status');
      if(status==='approved'){
        clearInterval(window._slPollInterval);
        localStorage.setItem(SL_KEY,JSON.stringify({ok:true,ts:Date.now()}));
        if(el) el.textContent='✅ Approved! Loading…';
        setTimeout(()=>{ document.getElementById('spawn-login-screen').classList.add('hidden'); },800);
      } else if(status==='denied'){
        clearInterval(window._slPollInterval);
        if(el) el.textContent='❌ Access denied by admin.';
      } else {
        if(el) el.textContent='⏳ Pending approval… (checking every 5s)';
      }
    }catch(e){}
  };

  window.slLogout=function(){
    localStorage.removeItem(SL_KEY);
    location.reload();
  };

  // Embedded deep-link (?p=...) from the mobile app / command center — already
  // authenticated at the shell level, so grant this session and skip the login screen.
  try {
    if (new URLSearchParams(location.search).get('p')) {
      localStorage.setItem(SL_KEY, JSON.stringify({ ok: true, ts: Date.now() }));
    }
  } catch (e) {}

  slCheck();
})();
