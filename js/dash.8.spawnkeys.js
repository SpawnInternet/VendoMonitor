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
      + '<button onclick="skOpenManual()" style="padding:7px 14px;background:#028867;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;margin-left:8px;">&#10133; Log manually</button>'
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
  // ── Manual entry ────────────────────────────────────────────────
  // Covers what QR can't: an individual vendo key, a duplicate handed out,
  // a lineman/tech pull, or any borrow that never went through the scan flow.
  // Writes to key_logs marked MANUAL, same table the log reads.
  var _mVendo = null;   // {id,name,area} chosen (optional)
  var _mSearchT = null;

  window.skOpenManual = function(){
    var old=document.getElementById('sk-manual-modal'); if(old) old.remove();
    _mVendo = null;
    var now=new Date();
    var today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
    var ov=document.createElement('div');
    ov.id='sk-manual-modal';
    ov.style.cssText='position:fixed;inset:0;background:rgba(17,10,60,.55);backdrop-filter:blur(3px);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit;';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:18px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.35);">'
      + '<div style="background:linear-gradient(135deg,#028867,#025AC6);padding:18px 22px;color:#fff;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2;">'
      +   '<div style="font-size:18px;font-weight:800;">&#10133; Log a key manually</div>'
      +   '<button onclick="skCloseManual()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:30px;height:30px;border-radius:8px;font-size:17px;cursor:pointer;font-family:inherit;">&#10005;</button>'
      + '</div>'
      + '<div style="padding:18px 22px;">'
      +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Who took the key</label>'
      +   '<input id="sk-m-who" placeholder="e.g. Jericho, Gilbert, a tech..." style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:14px;outline:none;">'

      +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">What key</label>'
      +   '<select id="sk-m-kind" onchange="skManualKindChange()" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:14px;outline:none;">'
      +     '<option value="vendo">Individual vendo key</option>'
      +     '<option value="duplicate">Duplicate key</option>'
      +     '<option value="area">Area / ring key</option>'
      +     '<option value="other">Other</option>'
      +   '</select>'

      +   '<div id="sk-m-vendo-wrap">'
      +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Vendo (search &amp; pick)</label>'
      +   '<div style="position:relative;margin-bottom:8px;">'
      +     '<input id="sk-m-vq" placeholder="&#128269; Search vendo name / code..." oninput="skManualSearch()" autocomplete="off" style="width:100%;padding:10px 12px;border:1.5px solid #025AC6;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;">'
      +     '<div id="sk-m-vres" style="position:absolute;top:100%;left:0;right:0;background:#fff;border:1.5px solid #025AC6;border-radius:8px;max-height:200px;overflow-y:auto;z-index:60;display:none;box-shadow:0 8px 20px rgba(0,0,0,.15);"></div>'
      +   '</div>'
      +   '<div id="sk-m-vpick" style="margin-bottom:14px;"></div>'
      +   '</div>'

      +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Area <span style="font-weight:500;color:#9ca3af;">(auto-fills from vendo)</span></label>'
      +   '<input id="sk-m-area" placeholder="e.g. DIPOLOG" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:14px;outline:none;">'

      +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Reason / notes</label>'
      +   '<input id="sk-m-reason" placeholder="e.g. move the box, repair, duplicate given..." style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:14px;outline:none;">'

      +   '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Date</label>'
      +   '<input id="sk-m-date" type="date" value="'+today+'" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:18px;outline:none;">'

      +   '<div style="display:flex;gap:10px;">'
      +     '<button onclick="skCloseManual()" style="flex:1;padding:12px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Cancel</button>'
      +     '<button id="sk-m-save" onclick="skManualSave()" style="flex:2;padding:12px;background:#028867;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;">&#10003; Log this key</button>'
      +   '</div>'
      + '</div></div>';
    ov.addEventListener('click',function(e){ if(e.target===ov) skCloseManual(); });
    document.body.appendChild(ov);
    setTimeout(function(){ var i=document.getElementById('sk-m-who'); if(i) i.focus(); },80);
  };

  window.skCloseManual = function(){ var m=document.getElementById('sk-manual-modal'); if(m) m.remove(); };

  window.skManualKindChange = function(){
    var kind=(document.getElementById('sk-m-kind')||{}).value;
    var wrap=document.getElementById('sk-m-vendo-wrap');
    if(wrap) wrap.style.display = (kind==='vendo'||kind==='duplicate') ? '' : 'none';
  };

  window.skManualSearch = function(){
    clearTimeout(_mSearchT);
    _mSearchT = setTimeout(async function(){
      var q=((document.getElementById('sk-m-vq')||{}).value||'').trim();
      var box=document.getElementById('sk-m-vres');
      if(!box) return;
      if(q.length<2){ box.style.display='none'; return; }
      try{
        var like='*'+q.replace(/[(),*]/g,'')+'*';
        var f='or=(sheet_name.ilike.'+encodeURIComponent(like)+',tg_name.ilike.'+encodeURIComponent(like)+',owner_name.ilike.'+encodeURIComponent(like)+',vendo_code.ilike.'+encodeURIComponent(like)+')';
        var rows=await skGet('vendos?'+f+'&select=id,sheet_name,tg_name,owner_name,area,vendo_code&limit=20');
        if(!Array.isArray(rows)||!rows.length){ box.innerHTML='<div style="padding:9px 12px;color:#9ca3af;font-size:12px;">No match.</div>'; box.style.display='block'; return; }
        box.innerHTML=rows.map(function(v){
          var nm=v.sheet_name||v.tg_name||v.owner_name||('#'+v.id);
          return '<div onclick=\'skManualPick('+v.id+','+JSON.stringify(nm)+','+JSON.stringify(v.area||'')+','+JSON.stringify(v.vendo_code||'')+')\' style="padding:9px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:12px;">'
            + '<b style="color:#311A8E;">'+esc(nm)+'</b>'+(v.vendo_code?' <span style="background:#311A8E;color:#fff;padding:1px 5px;border-radius:4px;font-size:9px;">'+esc(v.vendo_code)+'</span>':'')
            + '<span style="color:#6b7280;"> &middot; '+esc(v.area||'')+'</span></div>';
        }).join('');
        box.style.display='block';
      }catch(e){ box.innerHTML='<div style="padding:9px 12px;color:#DF1A35;font-size:12px;">Search failed.</div>'; box.style.display='block'; }
    }, 260);
  };

  window.skManualPick = function(id,name,area,code){
    _mVendo={id:id,name:name,area:area,code:code};
    var box=document.getElementById('sk-m-vres'); if(box){ box.style.display='none'; }
    var vq=document.getElementById('sk-m-vq'); if(vq){ vq.value=''; }
    var pick=document.getElementById('sk-m-vpick');
    if(pick){
      pick.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;background:#EEF1FA;border:1.5px solid #C7D2FE;border-radius:10px;padding:9px 12px;">'
        + '<div style="font-size:12px;font-weight:800;color:#311A8E;">&#128273; '+esc(name)+(code?' <span style="background:#311A8E;color:#fff;padding:1px 5px;border-radius:4px;font-size:9px;">'+esc(code)+'</span>':'')+'</div>'
        + '<button onclick="skManualClearPick()" style="background:#fff;border:1.5px solid #fca5a5;color:#DF1A35;width:24px;height:24px;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;">&#10005;</button></div>';
    }
    var af=document.getElementById('sk-m-area'); if(af && area && !af.value){ af.value=area; }
  };
  window.skManualClearPick = function(){ _mVendo=null; var p=document.getElementById('sk-m-vpick'); if(p) p.innerHTML=''; };

  window.skManualSave = async function(){
    var who=((document.getElementById('sk-m-who')||{}).value||'').trim();
    var kind=(document.getElementById('sk-m-kind')||{}).value||'vendo';
    var area=((document.getElementById('sk-m-area')||{}).value||'').trim();
    var reason=((document.getElementById('sk-m-reason')||{}).value||'').trim();
    var kdate=(document.getElementById('sk-m-date')||{}).value||null;
    if(!who){ alert('Enter who took the key'); return; }
    if((kind==='vendo'||kind==='duplicate') && !_mVendo){ alert('Search and pick a vendo'); return; }

    var kindLabel = kind==='vendo'?'individual vendo':kind==='duplicate'?'duplicate':kind==='area'?'area / ring':'other';
    var target = _mVendo ? (_mVendo.name+(_mVendo.code?' ['+_mVendo.code+']':'')) : (area||'—');
    var notes = 'Manual · '+kindLabel+' · '+target+(reason?' · '+reason:'');

    var body = {
      record_type: kind==='area'?'ring':'lineman',
      collector_name: who,
      lineman: who,
      area: (_mVendo && _mVendo.area) ? _mVendo.area : (area||null),
      wifi_key: target,
      lineman_reason: reason||null,
      notes: notes,
      key_date: kdate,
      keys_taken: 1,
      returned: false,
      is_test: false
    };
    var btn=document.getElementById('sk-m-save');
    if(btn){ btn.disabled=true; btn.style.opacity='.6'; btn.textContent='Saving…'; }
    try{
      var r=await fetch(SK_SB+'/rest/v1/key_logs',{method:'POST',headers:Object.assign({'Prefer':'return=minimal'},SK_HDR),body:JSON.stringify(body)});
      if(!r.ok){ var t=await r.text(); throw new Error(t); }
      skCloseManual();
      await skLoad();
    }catch(e){
      if(btn){ btn.disabled=false; btn.style.opacity='1'; btn.textContent='✓ Log this key'; }
      alert('Save failed: '+String(e && e.message || e));
    }
  };

})();
