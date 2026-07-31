
function fmtPeso(n) {
  if (n === null || n === undefined || isNaN(n)) return "₱0";
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtNum(n) { if (!n) return "0"; return Number(n).toLocaleString("en-PH"); }
function fmtDateShort(d) { if (!d) return "—"; return new Date(d + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" }); }
function fmtTime(ts) { if (!ts) return "—"; return new Date(ts).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }); }

// Moved here from dash.1.harvest.js so harvest can be lazy-loaded.
// Used by dash.4 (39x), dash.6 (18x), dash.9 (2x) and harvest itself.
const _php = v => v==null?'—':'₱'+Math.round(Number(v)).toLocaleString();

// Supabase config moved from dash.1.harvest.js: that bundle now loads late,
// but ledger/map/overview/overdue need these as soon as they run.
var _SB  = "https://cviraqfhphhsonjmrtvu.supabase.co";
var _KEY = "gw";
var _HDR = {'apikey':_KEY,'Authorization':'Bearer '+_KEY,'Content-Type':'application/json'};
var _ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2aXJhcWZocGhoc29uam1ydHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2OTY2MTksImV4cCI6MjA5MTI3MjYxOX0.7xtCIZvwIOgYXvaj1fLokiOKXylnxhwbWC4PCwb_D1o";
