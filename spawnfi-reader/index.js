'use strict';
// SpawnFi reader — READ ONLY. Never writes to a router.
// Every INTERVAL_SEC it reads, from each SpawnFi router (RouterOS v7 REST, same calls the Spawn Internet Panel uses):
//   /tool/netwatch  -> vendo board keep-alive up/down (the panel's "boards down")
//   /ppp/secret + /ppp/active -> PPPoE accounts, online now, last logged out
// and sends them to Supabase (spawnfi_status_ingest). Routers behind the WireGuard hub are reached through
// wireproxy (userspace WireGuard -> local SOCKS5), started by start.sh when WG_* variables are set.
const http = require('http'), https = require('https');
const { SocksProxyAgent } = require('socks-proxy-agent');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://cviraqfhphhsonjmrtvu.supabase.co').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const READER_TOKEN = process.env.READER_TOKEN || '';
const INTERVAL = Math.max(30, parseInt(process.env.INTERVAL_SEC || '90', 10)) * 1000;
const SOCKS = process.env.SOCKS_PROXY || (process.env.WG_PRIVATE_KEY ? 'socks5h://127.0.0.1:1080' : '');
let ROUTERS = [];
try { ROUTERS = JSON.parse(process.env.ROUTERS || '[]'); } catch (e) { console.error('ROUTERS is not valid JSON'); process.exit(1); }
if (!SUPABASE_KEY || !READER_TOKEN || !ROUTERS.length) { console.error('Missing SUPABASE_KEY, READER_TOKEN or ROUTERS'); process.exit(1); }
const agentFor = u => SOCKS ? new SocksProxyAgent(SOCKS) : (u.protocol === 'https:' ? new https.Agent({ rejectUnauthorized: false }) : undefined);
const log = (...a) => console.log(new Date().toISOString(), ...a);

function rest(r, path, proplist){
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(r.url.replace(/\/+$/, '') + '/rest/' + path + (proplist ? '?.proplist=' + encodeURIComponent(proplist.join(',')) : '')); }
    catch (e) { return reject(new Error('bad router url')); }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method:'GET', agent:agentFor(u), timeout:20000, rejectUnauthorized:false,
      headers:{ Authorization:'Basic ' + Buffer.from(`${r.user || process.env.ROUTER_USER || "spawnjobs-ro"}:${r.pass || process.env.ROUTER_PASS || ""}`).toString('base64'), Accept:'application/json' } }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 401) return reject(new Error('router refused the login (401)'));
        if (res.statusCode >= 400) return reject(new Error(`router answered ${res.statusCode} on ${path}`));
        try { resolve(JSON.parse(body || '[]')); } catch (e) { reject(new Error('router sent non-JSON on ' + path)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('router did not answer in 20 s')));
    req.on('error', reject); req.end();
  });
}
function ingest(router, boards, ppp, error){
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ p_token:READER_TOKEN, p_router:router, p_boards:boards, p_ppp:ppp, p_error:error || null });
    const lib = SUPABASE_URL.startsWith('http:') ? http : https;
    const req = lib.request(SUPABASE_URL + '/rest/v1/rpc/spawnfi_status_ingest', { method:'POST', timeout:20000,
      headers:{ apikey:SUPABASE_KEY, 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(body) } }, res => {
      let t = ''; res.on('data', c => t += c); res.on('end', () => res.statusCode < 300 ? resolve(t) : reject(new Error(`supabase ${res.statusCode}: ${t.slice(0, 200)}`)));
    });
    req.on('timeout', () => req.destroy(new Error('supabase timeout'))); req.on('error', reject); req.write(body); req.end();
  });
}
const yes = v => v === true || v === 'true' || v === 'yes';
// board host 10.<V div 256>.<V mod 256>.2 -> VLAN V (the panel's addressing rule); else "vlanN" in the comment
function vlanOf(host, comment){
  const m = /^10\.(\d+)\.(\d+)\.2$/.exec(host || ''); if (m) return (+m[1]) * 256 + (+m[2]);
  const c = /vlan\s*(\d+)/i.exec(comment || ''); return c ? +c[1] : null;
}
async function readRouter(r){
  const [watch, secrets, active] = await Promise.all([
    rest(r, 'tool/netwatch', ['host', 'status', 'since', 'disabled', 'comment']),
    rest(r, 'ppp/secret', ['name', 'profile', 'service', 'disabled', 'comment', 'last-logged-out']),
    rest(r, 'ppp/active', ['name'])
  ]);
  const boards = (watch || []).map(w => ({ host:w.host, vlan:vlanOf(w.host, w.comment), status:w.status || 'unknown', since:w.since || null, disabled:yes(w.disabled), comment:w.comment || null }));
  const on = new Set((active || []).map(a => a.name));
  const ppp = (secrets || []).filter(s => !s.service || s.service === 'any' || s.service === 'pppoe')
    .map(s => ({ name:s.name, profile:s.profile || null, disabled:yes(s.disabled), comment:s.comment || null, online:on.has(s.name), last_logged_out:s['last-logged-out'] || null }));
  return { boards, ppp };
}
async function cycle(){
  for (const r of ROUTERS) {
    try {
      const { boards, ppp } = await readRouter(r);
      const res = JSON.parse(await ingest(r.name, boards, ppp));
      log(`${r.name}: boards ${res.boards} (down ${res.down}) · PPPoE ${res.ppp} (online ${res.ppp_online})`);
    } catch (e) {
      log(`${r.name}: ${e.message}`);
      try { await ingest(r.name, null, null, e.message); } catch (e2) { log('could not record the error:', e2.message); }
    }
  }
}
// Log this reader's WireGuard PUBLIC key (safe to show) so it can be checked against the hub's peer entry.
try {
  if (process.env.WG_PRIVATE_KEY) {
    const der = Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), Buffer.from(process.env.WG_PRIVATE_KEY.trim(), 'base64')]);
    const pub = require('crypto').createPublicKey({ key: der, format: 'der', type: 'pkcs8' }).export({ format: 'jwk' }).x;
    log('WireGuard public key of this reader:', Buffer.from(pub, 'base64url').toString('base64'));
  }
} catch (e) { log('Could not derive WireGuard public key:', e.message); }
log(`SpawnFi reader starting: ${ROUTERS.map(r => r.name).join(', ')} every ${INTERVAL / 1000}s${SOCKS ? ' via WireGuard' : ' direct'}`);
(async function loop(){ await cycle(); setTimeout(loop, INTERVAL); })();
process.on('SIGTERM', () => process.exit(0));
