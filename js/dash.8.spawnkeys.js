/* SPAWN KEYS — borrow logbook (monitor view, mirrors the Keys tab layout).
   No scanner, no form: it's a read-only record of who borrowed which area
   ring, from whom, and whether it's back. Area keys are scanned by QR in the
   phone apps (harvest_v4 + spawn-keys); this tab just shows the result. */
(function(){
  'use strict';

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function ago(t){
    if(!t) return '';
    var s=(Date.now()-new Date(t).getTime())/1000;
    if(s<60) return 'just now';
    if(s<3600) return Math.floor(s/60)+'m ago';
    if(s<86400) return Math.floor(s/3600)+'h ago';
    return Math.floor(s/86400)+'d ago';
  }

  var SK_SB  = 'https://cviraqfhphhsonjmrtvu.supabase.co';
  var SK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2aXJhcWZocGhoc29uam1ydHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2OTY2MTksImV4cCI6MjA5MTI3MjYxOX0.7xtCIZvwIOgYXvaj1fLokiOKXylnxhwbWC4PCwb_D1o';
  var SK_HDR = {apikey:SK_KEY, Authorization:'Bearer '+SK_KEY, 'Content-Type':'application/json'};

  async function skGet(path){
    var r = await fetch(SK_SB+'/rest/v1/'+path, {headers:SK_HDR});
    if(!r.ok) throw new Error('HTTP '+r.status+' on '+path.split('?')[0]);
    return r.json();
  }

  var _rings = [], _logs = [];

  function ringsPanel(filter){
    var rows = _rings.slice();
    if(filter==='out') rows = rows.filter(function(r){ return r.status==='out'; });
    else if(filter==='in') rows = rows.filter(function(r){ return r.status!=='out'; });

    var outN = _rings.filter(function(r){ return r.status==='out'; }).length;

    var h = '<div style="padding:12px 14px;border-bottom:1.5px solid #f1f5f9;flex-shrink:0;">'
      + '<div style="font-size:15px;font-weight:800;color:#DF1A35;margin-bottom:8px;">&#128273; Rings — who is holding them</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
      + '<select id="sk-ring-filter" onchange="skRerender()" style="padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:12px;font-family:inherit;">'
      +   '<option value="out"'+(filter==='out'?' selected':'')+'>&#128308; Out now ('+outN+')</option>'
      +   '<option value="all"'+(filter==='all'?' selected':'')+'>All rings ('+_rings.length+')</option>'
      +   '<option value="in"'+(filter==='in'?' selected':'')+'>&#9989; In</option>'
      + '</select>'
      + '</div></div>'
      + '<div style="flex:1;overflow-y:auto;padding:12px 14px;">';

    if(!rows.length){
      h += '<div style="color:#6b7280;font-size:13px;text-align:center;padding:20px 0;">'
         + (filter==='out'?'&#9989; All rings are in — nobody is holding a key.':'No rings.')+'</div>';
    } else {
      var byArea = {};
      rows.forEach(function(r){ var a=r.area||'(no area)'; (byArea[a]=byArea[a]||[]).push(r); });
      Object.keys(byArea).sort().forEach(function(area){
        h += '<div style="font-size:11px;font-weight:800;color:#311A8E;margin:10px 0 6px;padding-bottom:3px;border-bottom:2px solid #eef1f6;">&#128205; '+esc(area)+'</div>';
        byArea[area].forEach(function(r){
          var isOut = r.status==='out';
          h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;'
            + 'background:'+(isOut?'#fef2f2':'#fff')+';border:1px solid #e5e7eb;'
            + 'border-left:4px solid '+(isOut?'#DF1A35':'#028867')+';border-radius:0 10px 10px 0;'
            + 'padding:10px 12px;margin-bottom:6px;">'
            + '<div style="min-width:0;"><div style="font-weight:800;font-size:13px;">'
            +   (r.short_code?'<span style="color:#025AC6;">'+esc(r.short_code)+'</span> &middot; ':'')+esc(r.label)+'</div>'
            + '<div style="font-size:11px;color:#6b7280;">'
            +   (isOut? '&#128100; '+esc(r.out_to||'someone')+' &middot; '+esc(ago(r.out_at)) : 'in the office')+'</div></div>'
            + '<span style="font-size:10px;font-weight:800;padding:3px 9px;border-radius:99px;flex:none;'
            + 'background:'+(isOut?'#fde8ea':'#E6F7F5')+';color:'+(isOut?'#DF1A35':'#028867')+';">'
            + (isOut?'OUT':'IN')+'</span></div>';
        });
      });
    }
    h += '</div>';
    return h;
  }

  function logPanel(filter, q){
    var rows = _logs.slice();
    if(filter==='out') rows = rows.filter(function(l){ return !l.returned; });
    else if(filter==='returned') rows = rows.filter(function(l){ return l.returned; });
    if(q){
      var ql = q.toLowerCase();
      rows = rows.filter(function(l){
        return ((l.area||'')+' '+(l.collector_name||'')+' '+(l.lineman||'')+' '+(l.notes||'')).toLowerCase().indexOf(ql)>=0;
      });
    }
    var openN = _logs.filter(function(l){ return !l.returned; }).length;

    var h = '<div style="padding:12px 14px;border-bottom:1.5px solid #f1f5f9;flex-shrink:0;">'
      + '<div style="font-size:15px;font-weight:800;color:#025AC6;margin-bottom:8px;">&#128203; Borrow Log</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
      + '<select id="sk-log-filter" onchange="skRerender()" style="padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:12px;font-family:inherit;">'
      +   '<option value="out"'+(filter==='out'?' selected':'')+'>&#128308; Not returned ('+openN+')</option>'
      +   '<option value="all"'+(filter==='all'?' selected':'')+'>All records</option>'
      +   '<option value="returned"'+(filter==='returned'?' selected':'')+'>&#9989; Returned</option>'
      + '</select>'
      + '<input id="sk-log-search" value="'+esc(q||'')+'" placeholder="&#128269; Search area / name..." oninput="skRerender()" style="flex:1;min-width:120px;padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:12px;font-family:inherit;outline:none;">'
      + '</div>'
      + '<div style="font-size:11px;color:#6b7280;margin-top:6px;">'+rows.length+' record'+(rows.length===1?'':'s')+' shown</div>'
      + '</div>'
      + '<div style="flex:1;overflow-y:auto;padding:12px 14px;">';

    if(!rows.length){
      h += '<div style="color:#6b7280;font-size:13px;text-align:center;padding:20px 0;">No borrow records.</div>';
    } else {
      rows.slice(0,60).forEach(function(l){
        var who = l.collector_name || l.lineman || '—';
        var auto = (l.notes||'').indexOf('Auto')===0;
        h += '<div style="background:'+(l.returned?'#fff':'#fef2f2')+';border:1px solid #e5e7eb;'
          + 'border-left:4px solid '+(l.returned?'#028867':'#DF1A35')+';border-radius:0 10px 10px 0;'
          + 'padding:10px 12px;margin-bottom:7px;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'
          +   '<div style="font-weight:800;font-size:13px;color:#111;">'+esc(l.area||'—')+'</div>'
          +   '<span style="font-size:9px;font-weight:800;padding:2px 8px;border-radius:99px;flex:none;'
          +     'background:'+(l.returned?'#E6F7F5;color:#028867':'#fde8ea;color:#DF1A35')+';">'
          +     (l.returned?'BACK':'OUT')+'</span>'
          + '</div>'
          + '<div style="font-size:11px;color:#374151;margin-top:3px;">&#128100; <b>'+esc(who)+'</b>'
          +   (l.lineman&&!l.collector_name?' <span style="color:#025AC6;">(lineman)</span>':'')+'</div>'
          + '<div style="font-size:11px;color:#6b7280;margin-top:2px;">'
          +   '&#128337; taken '+esc(ago(l.taken_at))
          +   (l.returned&&l.returned_at? ' &middot; returned '+esc(ago(l.returned_at)) : '')
          +   ' &middot; <span style="font-weight:700;color:'+(auto?'#025AC6':'#5F5E5A')+';">'+(auto?'SCAN':'MANUAL')+'</span></div>'
          + (l.notes&&!auto?'<div style="font-size:11px;color:#C01176;margin-top:2px;">&#128221; '+esc(l.notes)+'</div>':'')
          + '</div>';
      });
    }
    h += '</div>';
    return h;
  }

  window.skRerender = function(){
    var root=document.getElementById('sk-body');
    if(!root) return;
    var rf = (document.getElementById('sk-ring-filter')||{}).value || 'out';
    var lf = (document.getElementById('sk-log-filter')||{}).value || 'out';
    var q  = (document.getElementById('sk-log-search')||{}).value || '';
    var outN = _rings.filter(function(r){ return r.status==='out'; }).length;
    var openN = _logs.filter(function(l){ return !l.returned; }).length;

    root.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
      +   '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:8px 14px;">'
      +     '<span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Rings out</span> '
      +     '<span style="font-size:18px;font-weight:800;color:'+(outN?'#DF1A35':'#028867')+';margin-left:6px;">'+outN+'</span></div>'
      +   '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:8px 14px;">'
      +     '<span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Not returned</span> '
      +     '<span style="font-size:18px;font-weight:800;color:'+(openN?'#DF1A35':'#028867')+';margin-left:6px;">'+openN+'</span></div>'
      + '</div>'
      + '<button onclick="skLoad()" style="padding:7px 14px;background:#025AC6;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">&#8635; Refresh</button>'
      + '</div>'
      + '<div style="display:flex;gap:0;border:1.5px solid #e5e7eb;border-radius:14px;overflow:hidden;height:calc(100vh - 210px);min-height:340px;background:#fff;">'
      +   '<div style="flex:1;min-width:0;display:flex;flex-direction:column;border-right:2px solid #e5e7eb;">'+ringsPanel(rf)+'</div>'
      +   '<div style="flex:1;min-width:0;display:flex;flex-direction:column;background:#fafbfc;">'+logPanel(lf,q)+'</div>'
      + '</div>';
  };

  window.skLoad = async function(){
    var root=document.getElementById('sk-body');
    if(!root) return;
    root.innerHTML='<div style="padding:24px;color:#6b7280">Loading&hellip;</div>';
    try{
      var rings = await skGet('key_rings?select=*&active=eq.true&order=area.asc,label.asc');
      if(!Array.isArray(rings)) throw new Error('key_rings not readable — check gateway allowlist');
      var logs = await skGet('key_logs?select=*&order=taken_at.desc&limit=120');
      if(!Array.isArray(logs)) logs=[];
      _rings = rings; _logs = logs;
      skRerender();
    }catch(err){
      root.innerHTML='<div style="padding:20px;color:#DF1A35;font-size:13px">'
        + 'Could not load SPAWN KEYS: '+esc(err && err.message)
        + '</div>';
    }
  };
})();
