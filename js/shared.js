// ── SPAWN INTERNET — SHARED UTILITIES ─────────────────────────────
// Version: 1.0.0
// Loaded by dashboard.html before all other scripts

const SB_URL = "https://cviraqfhphhsonjmrtvu.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2aXJhcWZocGhoc29uam1ydHZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY5NjYxOSwiZXhwIjoyMDkxMjcyNjE5fQ.qLPX_TW2U6W51nbOiotRdjUoofXnoWHi3oNfcIDmsek";
const HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
const AREAS = ["DIPOLOG","DAPITAN","SINDANGAN","POLANCO","ROXAS","SINAMAN","MINAOG","MIX AREAS"];

// ── Supabase fetch helpers ─────────────────────────────────────────
async function sb(table, params="", limit=1000) {
  const sep = params ? "&" : "";
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?${params}${sep}limit=${limit}`, {
      headers: HDR, signal: ctrl.signal
    });
    clearTimeout(tid);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch(e) {
    clearTimeout(tid);
    const msg = e.name === "AbortError" || e.name === "TimeoutError"
      ? "Supabase is slow — retrying" : e.message;
    showConnError(msg);
    return [];
  }
}

async function sbAll(table, params="") {
  let all = [], offset = 0;
  while(true) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12000);
    try {
      const sep = params ? "&" : "";
      const r = await fetch(`${SB_URL}/rest/v1/${table}?${params}${sep}limit=1000&offset=${offset}`, {
        headers: HDR, signal: ctrl.signal
      });
      clearTimeout(tid);
      if (!r.ok) break;
      const batch = await r.json();
      if (!Array.isArray(batch) || !batch.length) break;
      all.push(...batch);
      if (batch.length < 1000) break;
      offset += 1000;
    } catch(e) {
      clearTimeout(tid);
      break;
    }
  }
  return all;
}

async function sbPost(table, body, prefer="return=representation") {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...HDR, Prefer: prefer },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    clearTimeout(tid);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return prefer.includes("representation") ? await r.json() : true;
  } catch(e) { clearTimeout(tid); return null; }
}

async function sbPatch(table, filter, body) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
      method: "PATCH",
      headers: { ...HDR, Prefer: "return=minimal" },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    clearTimeout(tid);
    return r.ok;
  } catch(e) { clearTimeout(tid); return false; }
}

// ── Connection error banner ────────────────────────────────────────
let _connBannerTimer = null;
function showConnError(msg) {
  let el = document.getElementById("conn-error-banner");
  if (!el) {
    el = document.createElement("div");
    el.id = "conn-error-banner";
    el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;background:#dc2626;color:#fff;padding:8px 16px;font-size:12px;display:flex;align-items:center;gap:10px";
    document.body.prepend(el);
  }
  el.innerHTML = `⚠️ Cannot reach Supabase — ${msg}
    <button onclick="document.getElementById('conn-error-banner').remove();loadDashboard();"
      style="margin-left:auto;padding:3px 10px;background:white;color:#dc2626;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600">
      Retry
    </button>`;
  if (_connBannerTimer) clearTimeout(_connBannerTimer);
  _connBannerTimer = setTimeout(() => {
    const b = document.getElementById("conn-error-banner");
    if (b) b.remove();
  }, 30000);
}

function hideConnError() {
  const el = document.getElementById("conn-error-banner");
  if (el) el.remove();
}

// ── Formatters ────────────────────────────────────────────────────
function fmtPeso(n) {
  if (n === null || n === undefined || isNaN(n)) return "₱0";
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtNum(n) {
  if (!n) return "0";
  return Number(n).toLocaleString("en-PH");
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateShort(d) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}

function daysSince(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr + "T12:00:00")) / 86400000);
}

function todayPHT() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

// ── Toast ─────────────────────────────────────────────────────────
function toast(msg, duration=2500) {
  let t = document.getElementById("_toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "_toast";
    t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e3cb8;color:#fff;padding:8px 18px;border-radius:20px;font-size:13px;z-index:9999;pointer-events:none;transition:opacity .3s";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._tid);
  t._tid = setTimeout(() => { t.style.opacity = "0"; }, duration);
}

// ── Clock ─────────────────────────────────────────────────────────
function startClock() {
  const el = document.getElementById("clock");
  if (!el) return;
  function tick() {
    el.textContent = new Date().toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  tick();
  setInterval(tick, 1000);
}
