#!/usr/bin/env node

const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  protocolVersion,
  defaultConfigPath,
  parseArgs,
  readJsonFile,
  validateConfig,
  findPeer,
  getPeerSharedKey,
  signRequest,
  requestJson,
  toRepoPath,
} = require('./p2p-common');

function usage() {
  return [
    'Usage:',
    '  node scripts/mesh/p2p-doctor.js --peer <peer_id>',
    '  node scripts/mesh/p2p-doctor.js --peer <peer_id> --signed',
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

function buildSignedHeaders(config, peer, requestPath, rawBody = '') {
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const sharedKey = getPeerSharedKey(peer);
  const signature = signRequest(sharedKey, 'GET', requestPath, timestamp, nonce, rawBody);
  return {
    'X-Agents-P2P-Version': protocolVersion,
    'X-Agents-Node-Id': config.local_node.node_id,
    'X-Agents-Peer-Id': peer.peer_id,
    'X-Agents-Timestamp': timestamp,
    'X-Agents-Nonce': nonce,
    'X-Agents-Signature': `hmac-sha256=${signature}`,
  };
}

function summarizeSignedResponse(response) {
  const data = response && response.data && typeof response.data === 'object' ? response.data : {};
  return {
    status_code: response ? response.statusCode : 0,
    status: data.status || '',
    ok: Boolean(data.ok),
    error_code: data.error && data.error.code ? data.error.code : '',
    error_message: data.error && data.error.message ? data.error.message : '',
    network: response ? {
      local_address: response.localAddress || '',
      local_port: response.localPort || 0,
      remote_address: response.remoteAddress || '',
      remote_port: response.remotePort || 0,
    } : null,
  };
}

async function checkSignedProbe(targetUrl, config, peer, timeoutMs, localAddress = '') {
  const probePath = '/v1/p2p/probe';
  const probeUrl = new URL(probePath, targetUrl).toString();
  const options = { timeoutMs, localAddress };
  let response = null;
  let errorMessage = '';
  try {
    response = await requestJson('GET', probeUrl, null, buildSignedHeaders(config, peer, probePath), options);
  } catch (error) {
    errorMessage = error.message || String(error);
  }

  if (response && response.statusCode >= 200 && response.statusCode < 300) {
    return {
      ok: true,
      method: 'probe_endpoint',
      detail: 'signed_probe_ok',
      ...summarizeSignedResponse(response),
    };
  }
  if (response && response.statusCode !== 404) {
    return {
      ok: false,
      method: 'probe_endpoint',
      detail: 'signed_probe_failed',
      ...summarizeSignedResponse(response),
      error: errorMessage,
    };
  }

  // Backward-compatible signed auth check for peers that do not yet expose
  // /v1/p2p/probe. receipt_not_found means HMAC auth already succeeded.
  const fallbackTaskId = `p2p-signed-doctor-${Date.now().toString(36)}`;
  const fallbackPath = `/v1/p2p/receipts/${encodeURIComponent(fallbackTaskId)}`;
  const fallbackUrl = new URL(fallbackPath, targetUrl).toString();
  let fallbackResponse = null;
  let fallbackError = '';
  try {
    fallbackResponse = await requestJson('GET', fallbackUrl, null, buildSignedHeaders(config, peer, fallbackPath), options);
  } catch (error) {
    fallbackError = error.message || String(error);
  }
  const fallbackSummary = summarizeSignedResponse(fallbackResponse);
  const authPassed = fallbackResponse
    && fallbackResponse.statusCode === 404
    && fallbackSummary.error_code === 'receipt_not_found';
  return {
    ok: Boolean(authPassed),
    method: 'receipt_fallback',
    detail: authPassed ? 'signed_auth_ok_receipt_not_found' : 'signed_auth_failed',
    ...fallbackSummary,
    error: fallbackError,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const timeoutMs = Number(args.timeoutMs || args.timeout || 3000);
  const localAddress = args['local-address'] || '';
  const signed = Boolean(args.signed);
  let targetUrl = args.url || '';
  let peerId = args.peer || '';
  let configPath = '';
  let configStatus = { ok: true, detail: 'not_used' };
  let config = null;
  let peer = null;

  if (!targetUrl) {
    if (!peerId) throw new Error('Missing --peer or --url.');
    configPath = path.resolve(args.config || defaultConfigPath);
    const validation = validateConfig(readJsonFile(configPath), { requireKeys: signed });
    configStatus = {
      ok: validation.ok,
      detail: validation.errors.join('; ') || 'OK',
      warnings: validation.warnings,
    };
    if (!validation.ok) throw new Error(`Config invalid: ${validation.errors.join('; ')}`);
    config = validation.config;
    peer = findPeer(config, peerId);
    if (!peer) throw new Error(`Peer not found: ${peerId}`);
    if (!peer.base_url) throw new Error(`Peer base_url is required: ${peerId}`);
    targetUrl = peer.base_url;
  } else if (signed) {
    throw new Error('--signed requires --peer and a local config so HMAC headers can be built safely.');
  }

  const parsed = new URL(targetUrl);
  const host = parsed.hostname;
  const port = Number(parsed.port || 80);
  const tcp = await checkTcp(host, port, timeoutMs, localAddress);
  const health = tcp.ok ? await checkHttpHealth(targetUrl, timeoutMs, localAddress) : { ok: false, skipped: true, reason: 'tcp_unreachable' };
  const signed_probe = signed && tcp.ok && health.ok
    ? await checkSignedProbe(targetUrl, config, peer, timeoutMs, localAddress)
    : { ok: !signed, skipped: !signed, reason: signed ? 'tcp_or_health_failed' : 'not_requested' };
  const ok = tcp.ok && health.ok && (!signed || signed_probe.ok);

  process.stdout.write(`${JSON.stringify({
    ok,
    checked_at: new Date().toISOString(),
    config: configPath ? toRepoPath(configPath) : '',
    peer_id: peerId,
    target_url: targetUrl,
    requested_local_address: localAddress,
    tcp,
    health,
    signed_probe,
    hints: [
      ...buildHints(tcp, health),
      ...(signed && signed_probe.ok ? ['peer_signed_auth_ok'] : []),
      ...(signed && !signed_probe.ok ? ['peer_signed_auth_failed', 'check both running processes loaded the same HMAC key material; restart via the local wrapper and retry --signed'] : []),
    ],
  }, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
  process.exit(1);
});
