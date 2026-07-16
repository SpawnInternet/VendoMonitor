/* SPAWN KEYS — overview summary tab */
(function(){
  'use strict';

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function ago(t){
    if(!t) return '';
    var s=(Date.now()-new Date(t).getTime())/1000;
    if(s<3600) return Math.floor(s/60)+'m ago';
    if(s<86400) return Math.floor(s/3600)+'h ago';
    return Math.floor(s/86400)+'d ago';
  }

  function evLabel(e){
    var m={ring_out:'Ring out',ring_in:'Ring returned',key_pull:'Key pulled',key_return:'Key returned'};
    return m[e.event]||e.event;
  }

  function ktLabel(k){ return k? k.replace(/_/g,' ') : ''; }

  function card(label,val,color){
    return '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px">'
      + '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">'+esc(label)+'</div>'
      + '<div style="font-size:26px;font-weight:800;margin-top:6px;color:'+color+'">'+val+'</div></div>';
  }

  async function skGet(path){
    var r = await fetch(_SB+'/rest/v1/'+path, {headers:_HDR});
    if(!r.ok) throw new Error('HTTP '+r.status+' on '+path.split('?')[0]);
    return r.json();
  }

  window.skLoad = async function(){
    var root=document.getElementById('sk-body');
    if(!root) return;
    root.innerHTML='<div style="padding:24px;color:#6b7280">Loading…</div>';
    try{
      var rings = await skGet('key_rings?select=*&active=eq.true&order=area.asc,label.asc');
      var evs   = await skGet('key_events?select=*&order=at.desc&limit=60');
      if(!Array.isArray(rings)) throw new Error('key_rings not readable — check gateway allowlist');
      if(!Array.isArray(evs)) evs=[];

      var out = rings.filter(function(r){ return r.status==='out'; });
      var pulls = evs.filter(function(e){ return e.event==='key_pull'; });
      var unver = evs.filter(function(e){ return !e.verified_at && e.auth_method==='pin'; });

      var html = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">'
        + card('Rings total', rings.length, '#2D3547')
        + card('Rings out', out.length, out.length? '#DF1A35':'#028867')
        + card('Key pulls (recent)', pulls.length, '#025AC6')
        + card('Needs your check', unver.length, unver.length? '#FFB725':'#028867')
        + '</div>';

      if(unver.length){
        html += '<div style="background:#FEF7E8;border:1px solid #f5d78e;border-radius:12px;padding:12px 14px;margin-bottom:16px">'
          + '<div style="font-weight:800;font-size:13px;color:#8a5a00;margin-bottom:8px">⚠ Self-reported — confirm when you have the key in hand</div>';
        unver.slice(0,8).forEach(function(e){
          html += '<div style="font-size:12px;color:#8a5a00;padding:3px 0">• '
            + esc(e.actor)+' — '+esc(evLabel(e))
            + (e.key_type? ' ('+esc(ktLabel(e.key_type))+')':'')
            + ' · '+esc(ago(e.at))+'</div>';
        });
        html += '</div>';
      }

      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';

      html += '<div><div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px">Rings</div>';
      if(!rings.length){
        html += '<div style="color:#6b7280;font-size:13px">No rings yet.</div>';
      } else {
        rings.forEach(function(r){
          var isOut = r.status==='out';
          html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;'
            + 'background:'+(isOut?'#fef2f2':'#fff')+';border:1px solid #e5e7eb;'
            + 'border-left:4px solid '+(isOut?'#DF1A35':'#028867')+';border-radius:0 10px 10px 0;'
            + 'padding:10px 12px;margin-bottom:6px">'
            + '<div><div style="font-weight:800;font-size:13px">'+esc(r.label)+'</div>'
            + '<div style="font-size:11px;color:#6b7280">'+esc(r.area)
            + (isOut? ' · '+esc(r.out_to||'')+' · '+esc(ago(r.out_at)) : '')+'</div></div>'
            + '<span style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:99px;'
            + 'background:'+(isOut?'#fde8ea':'#E6F7F5')+';color:'+(isOut?'#DF1A35':'#028867')+'">'
            + (isOut?'OUT':'IN')+'</span></div>';
        });
      }
      html += '</div>';

      html += '<div><div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px">Recent activity</div>';
      if(!evs.length){
        html += '<div style="color:#6b7280;font-size:13px">No activity yet.</div>';
      } else {
        html += '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:4px 14px">';
        evs.slice(0,18).forEach(function(e){
          var vf = e.auth_method==='pin';
          html += '<div style="padding:9px 0;border-bottom:1px solid #f1f3f5">'
            + '<div style="font-weight:700;font-size:13px">'+esc(evLabel(e))
            + (e.key_type? ' <span style="font-weight:400;color:#6b7280">— '+esc(ktLabel(e.key_type))+'</span>':'')
            + '</div>'
            + '<div style="font-size:11px;color:#6b7280;margin-top:2px">'+esc(e.actor)+' · '+esc(ago(e.at))
            + ' <span style="font-size:9px;font-weight:800;padding:2px 6px;border-radius:99px;margin-left:4px;'
            + 'background:'+(vf?'#FEF7E8':'#E6F7F5')+';color:'+(vf?'#8a5a00':'#028867')+'">'
            + (vf?'SELF-REPORTED':'VERIFIED')+'</span></div></div>';
        });
        html += '</div>';
      }
      html += '</div></div>';

      root.innerHTML = html;
    }catch(err){
      root.innerHTML='<div style="padding:20px;color:#DF1A35;font-size:13px">'
        + 'Could not load SPAWN KEYS: '+esc(err && err.message)
        + '<br><span style="color:#6b7280">Add <b>key_rings</b> and <b>key_events</b> to the spawn-gw-admin table allowlist.</span></div>';
    }
  };
})();
