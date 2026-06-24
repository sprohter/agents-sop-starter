#!/usr/bin/env node

const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const {
  defaultConfigPath,
  parseArgs,
  readJsonFile,
  validateConfig,
  findPeer,
  toRepoPath,
} = require('./p2p-common');

function usage() {
  return [
    'Usage:',
    '  node scripts/mesh/p2p-doctor.js --peer <peer_id>',
    '  node scripts/mesh/p2p-doctor.js --url http://<lan-ip>:8788',
    '  node scripts/mesh/p2p-doctor.js --url http://<lan-ip>:8788 --local-address <this-machine-lan-ip>',
  ].join('\n');
}

function checkTcp(host, port, timeoutMs, localAddress = '') {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, ...(localAddress ? { localAddress } : {}) });
    let settled = false;
    const done = (ok, detail) => {
      if (settled) return;
      settled = true;
      const network = {
        local_address: socket.localAddress || localAddress || '',
        local_port: socket.localPort || 0,
        remote_address: socket.remoteAddress || host,
        remote_port: socket.remotePort || port,
      };
      socket.destroy();
      resolve({ ok, detail, network });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true, 'tcp_connect_ok'));
    socket.once('timeout', () => done(false, `tcp_timeout_${timeoutMs}ms`));
    socket.once('error', (error) => done(false, error.message));
  });
}

function checkHttpHealth(targetUrl, timeoutMs, localAddress = '') {
  return new Promise((resolve) => {
    const url = new URL('/health', targetUrl);
    const req = http.request({
      method: 'GET',
      hostname: url.hostname,
      port: url.port || 80,
      path: `${url.pathname}${url.search}`,
      timeout: timeoutMs,
      ...(localAddress ? { localAddress } : {}),
      headers: { Accept: 'application/json' },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = { raw: text.slice(0, 200) };
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status_code: res.statusCode,
          body,
          network: {
            local_address: req.socket ? req.socket.localAddress : localAddress || '',
            local_port: req.socket ? req.socket.localPort : 0,
            remote_address: req.socket ? req.socket.remoteAddress : '',
            remote_port: req.socket ? req.socket.remotePort : 0,
          },
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`http_timeout_${timeoutMs}ms`)));
    req.on('error', (error) => resolve({
      ok: false,
      error: error.message,
      network: {
        local_address: req.socket ? req.socket.localAddress : localAddress || '',
        local_port: req.socket ? req.socket.localPort : 0,
        remote_address: req.socket ? req.socket.remoteAddress : '',
        remote_port: req.socket ? req.socket.remotePort : 0,
      },
    }));
    req.end();
  });
}

function looksLikeTunnelAddress(address) {
  const value = String(address || '');
  return /^198\.(18|19)\./.test(value) || /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(value);
}

function buildHints(tcp, health) {
  const hints = [];
  const localAddress = (health.network && health.network.local_address) || (tcp.network && tcp.network.local_address) || '';
  if (looksLikeTunnelAddress(localAddress)) {
    hints.push('traffic_uses_tunnel_or_proxy_address');
    hints.push('for LAN P2P, prefer a same-subnet physical LAN address or pass --local-address <this-machine-lan-ip>');
    hints.push('client-to-site VPN may allow peer-to-this-machine traffic without allowing this-machine-to-peer callbacks');
  }
  if (health.ok) return [...hints, 'peer_health_ok'];
  if (!tcp.ok) {
    return [
      ...hints,
      'peer_tcp_unreachable',
      'confirm the peer machine is awake and on the same LAN',
      'confirm the peer IP address did not change',
      'start p2p-server.js on the peer with --host <peer-lan-ip> or --host 0.0.0.0',
      'allow the Node process or selected port in the peer firewall',
    ];
  }
  return [
    ...hints,
    'peer_tcp_reachable_but_health_failed',
    'confirm the peer process is p2p-server.js, not another service on the same port',
    'check the peer terminal for startup errors',
    'run curl http://127.0.0.1:<port>/health on the peer',
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const timeoutMs = Number(args.timeoutMs || args.timeout || 3000);
  const localAddress = args['local-address'] || '';
  let targetUrl = args.url || '';
  let peerId = args.peer || '';
  let configPath = '';
  let configStatus = { ok: true, detail: 'not_used' };

  if (!targetUrl) {
    if (!peerId) throw new Error('Missing --peer or --url.');
    configPath = path.resolve(args.config || defaultConfigPath);
    const validation = validateConfig(readJsonFile(configPath), { requireKeys: false });
    configStatus = {
      ok: validation.ok,
      detail: validation.errors.join('; ') || 'OK',
      warnings: validation.warnings,
    };
    if (!validation.ok) throw new Error(`Config invalid: ${validation.errors.join('; ')}`);
    const peer = findPeer(validation.config, peerId);
    if (!peer) throw new Error(`Peer not found: ${peerId}`);
    if (!peer.base_url) throw new Error(`Peer base_url is required: ${peerId}`);
    targetUrl = peer.base_url;
  }

  const parsed = new URL(targetUrl);
  const host = parsed.hostname;
  const port = Number(parsed.port || 80);
  const tcp = await checkTcp(host, port, timeoutMs, localAddress);
  const health = tcp.ok ? await checkHttpHealth(targetUrl, timeoutMs, localAddress) : { ok: false, skipped: true, reason: 'tcp_unreachable' };
  const ok = tcp.ok && health.ok;

  process.stdout.write(`${JSON.stringify({
    ok,
    checked_at: new Date().toISOString(),
    config: configPath ? toRepoPath(configPath) : '',
    peer_id: peerId,
    target_url: targetUrl,
    requested_local_address: localAddress,
    tcp,
    health,
    hints: buildHints(tcp, health),
  }, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
  process.exit(1);
});
