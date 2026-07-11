
// ── OVERVIEW TAB (rebuilt: Telegram sales + Harvest spawn share, brand colors) ──
let _overviewChart = null;
let _areaChart = null;

// Brand palette
const BRAND = {
  blue:'#025AC6', gold:'#FFB725', teal:'#028867', magenta:'#C01176',
  red:'#DF1A35', purple:'#311A8E', sky:'#0EA5E9', slate:'#475569'
};
const BRAND_SERIES = [BRAND.blue, BRAND.gold, BRAND.teal, BRAND.magenta, BRAND.purple, BRAND.red, BRAND.sky, BRAND.slate];

async function overviewLoad() {
  document.getElementById("dash-stats").innerHTML =
    '<div style="padding:20px;color:var(--mu);font-size:13px">Loading...</div>';
  // fetch the combined overview (TG sales + harvest spawn) via gateway RPC
  let ov = null;
  try {
    const r = await fetch(`${_SB||SB_URL}/rest/v1/rpc/dashboard_overview_v2`, {
      method:'POST',
      headers: (typeof _HDR!=='undefined'?_HDR:{apikey:'gw',Authorization:'Bearer gw','Content-Type':'application/json','x-spawn-gw':'1'}),
      body: '{}'
    });
    ov = await r.json();
  } catch(e){ console.warn('overview rpc failed', e && e.message); }
  // suspicious count still from the existing summary
  const data = await apiLoad().catch(()=>null);
  overviewRender(ov||{}, data||{});
}

function _php(v){ return '₱'+Math.round(Number(v||0)).toLocaleString(); }

function overviewRender(ov, data) {
  const stats = (data && data.stats) || {};
  const hackedCnt = stats.suspicious_count || 0;

  // ── Stat cards: TG month · Harvest month · TG today · Harvest today · Suspicious ──
  document.getElementById("dash-stats").innerHTML = `
    <div class="stat" style="border-bottom-color:${BRAND.blue}">
      <div class="sl">Telegram Sales · This Month</div>
      <div class="sv" style="color:${BRAND.blue}">${_php(ov.tg_month)}</div>
    </div>
    <div class="stat" style="border-bottom-color:${BRAND.teal}">
      <div class="sl">Harvested Spawn Share · Month</div>
      <div class="sv" style="color:${BRAND.teal}">${_php(ov.harvest_month)}</div>
    </div>
    <div class="stat" style="border-bottom-color:${BRAND.gold}">
      <div class="sl">Telegram Sales · Today</div>
      <div class="sv" style="color:#B47F00">${_php(ov.tg_today)}</div>
    </div>
    <div class="stat" style="border-bottom-color:${BRAND.magenta}">
      <div class="sl">Harvest Spawn · Today</div>
      <div class="sv" style="color:${BRAND.magenta}">${_php(ov.harvest_today)}</div>
    </div>
    <div class="stat" style="border-bottom-color:${BRAND.red};border-color:rgba(223,26,53,.15)" onclick="showP('suspicious')">
      <div class="sl" style="color:${BRAND.red}">Suspicious Txns</div>
      <div class="sv" style="color:${BRAND.red}">${fmtNum(hackedCnt)}</div>
    </div>`;

  // nav badge + alert
  const nb = document.getElementById("nav-sus-badge");
  if (nb) { nb.textContent = hackedCnt > 0 ? hackedCnt : ""; nb.style.display = hackedCnt > 0 ? "" : "none"; }
  const alertEl = document.getElementById("suspicious-alert");
  if (alertEl) {
    if (hackedCnt > 0) {
      alertEl.style.display = "flex";
      const ad=document.getElementById("alert-detail"); if(ad) ad.textContent = `${hackedCnt} suspicious transactions detected`;
      const sc=document.getElementById("susp-count"); if(sc) sc.textContent = hackedCnt;
    } else alertEl.style.display = "none";
  }

  // ── 7-day trend: Telegram sales only ──
  const trend = ov.tg_trend || [];
  const tLabels = trend.map(r => fmtDateShort(r.date));
  const tData = trend.map(r => parseFloat(r.tg_sales || 0));
  const tEl = document.getElementById("trend-chart");
  if (tEl) {
    if (_overviewChart) { _overviewChart.destroy(); _overviewChart = null; }
    Chart.getChart(tEl)?.destroy();
    _overviewChart = new Chart(tEl.getContext("2d"), {
      type: "line",
      data: { labels: tLabels, datasets: [{ data: tData, borderColor: BRAND.blue, backgroundColor: "rgba(2,90,198,.10)", tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: BRAND.blue }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { ticks: { font: { size: 9 } } }, y: { ticks: { font: { size: 9 }, callback: v => "₱" + (v >= 1000 ? (v/1000).toFixed(0)+"K" : v) } } } }
    });
  }

  // ── Spawn share by group (this month) — bar chart ──
  const groups = ov.harvest_by_group || [];
  const aEl = document.getElementById("area-chart");
  if (aEl) {
    if (_areaChart) { _areaChart.destroy(); _areaChart = null; }
    Chart.getChart(aEl)?.destroy();
    _areaChart = new Chart(aEl.getContext("2d"), {
      type: "bar",
      data: { labels: groups.map(g => g.grp), datasets: [{ data: groups.map(g => parseFloat(g.spawn || 0)), backgroundColor: groups.map((g,i)=>BRAND_SERIES[i%BRAND_SERIES.length]), borderRadius:4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { ticks: { font: { size: 8 } }, grid:{display:false} }, y: { ticks: { font: { size: 9 }, callback: v => "₱" + (v >= 1000 ? (v/1000).toFixed(0)+"K" : v) } } } }
    });
  }

  // ── group grid (replaces area grid) ──
  const gGrid = document.getElementById("area-grid");
  if (gGrid) {
    const ICONS = { Dipolog:"🏙", Dapitan:"🌊", Sindangan:"🏝", Polanco:"🌿", Roxas:"🌺", "Pre-v3 / Admin":"🗂" };
    gGrid.innerHTML = groups.map((g,i) => `
      <div class="area-card" style="border-left:3px solid ${BRAND_SERIES[i%BRAND_SERIES.length]}">
        <div style="font-size:16px">${ICONS[g.grp]||"📍"}</div>
        <div style="font-size:10px;font-weight:700;color:var(--tx)">${g.grp}</div>
        <div style="font-size:11px;font-weight:700;color:${BRAND.teal}">${_php(g.spawn)}</div>
      </div>`).join("");
  }
  // ── spawn-by-group list (today-strip column) ──
  const strip = document.getElementById("today-strip");
  if (strip) {
    const gTot = groups.reduce((s,g)=>s+Number(g.spawn||0),0)||1;
    strip.innerHTML = groups.map((g,i)=>`
      <div style="padding:4px 0;border-bottom:1px solid #f0f4ff;">
        <div style="display:flex;justify-content:space-between;font-size:11px;">
          <span style="color:var(--tx);font-weight:600;">${g.grp}</span>
          <span style="font-weight:700;color:${BRAND.teal};">${_php(g.spawn)}</span>
        </div>
        <div style="height:5px;background:#eef2ff;border-radius:3px;margin-top:3px;overflow:hidden;">
          <div style="height:100%;width:${Math.round(Number(g.spawn||0)/gTot*100)}%;background:${BRAND_SERIES[i%BRAND_SERIES.length]};"></div>
        </div>
      </div>`).join("");
  }

  // ── Top 10 strongest / weakest by this month's spawn share ──
  const top = ov.top_spawn || [], bot = ov.bottom_spawn || [];
  const mkRow = (v,i,low) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid #f1f5f9;">
      <div style="width:20px;text-align:center;font-weight:800;font-size:12px;color:${low?BRAND.red:BRAND.gold};">${i+1}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${v.vendo||'—'}</div>
        <div style="font-size:9px;color:var(--mu);">${v.area||''}</div>
      </div>
      <div style="font-weight:800;font-size:13px;color:${low?BRAND.red:BRAND.teal};white-space:nowrap;">${_php(v.spawn)}</div>
    </div>`;
  const th=document.getElementById("top10-high"); if(th) th.innerHTML = top.map((v,i)=>mkRow(v,i,false)).join("") || '<div style="padding:10px;color:var(--mu);font-size:11px;">No data</div>';
  const tl=document.getElementById("top10-low");  if(tl) tl.innerHTML = bot.map((v,i)=>mkRow(v,i,true)).join("") || '<div style="padding:10px;color:var(--mu);font-size:11px;">No data</div>';

  // ── Recent + suspicious sidebar (unchanged data source) ──
  overviewRenderRecent((data && data.recent) || []);
  const susp = (data && data.suspicious) || [];
  const ssb=document.getElementById("suspicious-sidebar");
  if(ssb) ssb.innerHTML = susp.slice(0, 10).map(h => `
    <div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid #fee2e2">
      <span style="color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px">${h.vendo||"—"}</span>
      <span style="color:${BRAND.red};font-weight:600;white-space:nowrap">${fmtNum(h.txn_count)} skip</span>
    </div>`).join("") || '<div style="font-size:11px;color:var(--mu);padding:8px">No suspicious transactions</div>';
}

function overviewRenderRecent(recent) {
  const el = document.getElementById("recent-txns");
  if (!el) return;
  if (!recent || !recent.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--mu);padding:8px">No transactions today</div>';
    return;
  }
  el.innerHTML = recent.map(r => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #e8eeff;font-size:11px">
      <div style="overflow:hidden">
        <div style="font-weight:500;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">${r.vendo||"—"}</div>
        <div style="color:var(--mu);font-size:9px">${r.area||""} · ${r.time||fmtTime(r.created_at)}</div>
      </div>
      <div style="font-weight:600;color:${BRAND.blue};white-space:nowrap">₱${r.amount||0}</div>
    </div>`).join("");
}
