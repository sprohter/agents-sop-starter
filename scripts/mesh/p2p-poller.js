#!/usr/bin/env node

const path = require('node:path');
const crypto = require('node:crypto');
const {
  protocolVersion,
  defaultConfigPath,
  defaultStateRoot,
  parseArgs,
  readJsonFile,
  writeJsonFile,
  validateConfig,
  findPeer,
  getPeerSharedKey,
  signRequest,
  requestJson,
  walkJsonFiles,
  loadConversationRecords,
  buildConversationEvent,
  summarizePeerResponse,
  redactSensitiveText,
  upsertConversation,
  toRepoPath,
} = require('./p2p-common');

const terminalConversationStatuses = new Set(['receipt_seen', 'reply_received', 'completed', 'expired']);

function usage() {
  return [
    'Usage:',
    '  node scripts/mesh/p2p-poller.js --once [--peer <peer_id>] [--limit 20]',
    '  node scripts/mesh/p2p-poller.js --watch --interval 10 [--local-address <lan-ip>]',
    '',
    'Polls signed /v1/p2p/receipts/{task_id} for outbound pending conversations.',
  ].join('\n');
}

function numberValue(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

async function loadOutboxRecords(stateRoot) {
  const files = await walkJsonFiles(path.join(stateRoot, 'outbox'));
  const records = [];
  for (const file of files) {
    try {
      const record = JSON.parse(await require('node:fs/promises').readFile(file, 'utf8'));
      records.push({ ...record, _file: file });
    } catch {
      // Ignore broken runtime records.
    }
  }
  records.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return records;
}

function shouldPollConversation(conversation, args) {
  if (!conversation || conversation.direction !== 'outbound') return false;
  if (args.peer && conversation.peer_id !== args.peer) return false;
  if (!conversation.original_task_id) return false;
  if (terminalConversationStatuses.has(conversation.status) && !args.retry) return false;
  if (!['sent', 'poll_failed', 'pending'].includes(conversation.status) && !args.retry) return false;
  return true;
}

async function buildPollTargets(stateRoot, args) {
  const allConversations = await loadConversationRecords(stateRoot);
  const terminalTaskIds = new Set();
  if (!args.retry) {
    for (const conversation of allConversations) {
      if (conversation.direction !== 'outbound') continue;
      if (terminalConversationStatuses.has(conversation.status) && conversation.original_task_id) {
        terminalTaskIds.add(conversation.original_task_id);
      }
    }
  }
  const conversations = allConversations.filter((item) => shouldPollConversation(item, args));
  const byTask = new Map();
  for (const conversation of conversations) {
    byTask.set(conversation.original_task_id, { conversation, outbox: null });
  }
  const outboxes = await loadOutboxRecords(stateRoot);
  for (const outbox of outboxes) {
    const request = outbox.request || {};
    const taskId = outbox.task_id || request.task_id || '';
    if (!taskId || outbox.sent !== true) continue;
    if (terminalTaskIds.has(taskId)) continue;
    if (args.peer && outbox.peer_id !== args.peer) continue;
    if (!byTask.has(taskId)) {
      byTask.set(taskId, {
        conversation: {
          conversation_id: request.trace && request.trace.conversation_id ? request.trace.conversation_id : taskId,
          original_task_id: taskId,
          peer_id: outbox.peer_id || request.to_node || '',
          capability: outbox.capability || request.capability || '',
          direction: 'outbound',
          status: 'sent',
        },
        outbox,
      });
    } else if (!byTask.get(taskId).outbox) {
      byTask.get(taskId).outbox = outbox;
    }
  }
  return [...byTask.values()];
}

async function pollReceipt(args, config, stateRoot, target) {
  const taskId = target.conversation.original_task_id;
  const peerId = target.conversation.peer_id;
  const peer = findPeer(config, peerId);
  if (!peer || peer.allow_outbound !== true || !peer.base_url) {
    return { ok: false, task_id: taskId, peer_id: peerId, error: 'peer_not_configured_for_outbound' };
  }
  const requestPath = `/v1/p2p/receipts/${encodeURIComponent(taskId)}`;
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const signature = signRequest(getPeerSharedKey(peer), 'GET', requestPath, timestamp, nonce, '');
  const headers = {
    'X-Agents-P2P-Version': protocolVersion,
    'X-Agents-Node-Id': config.local_node.node_id,
    'X-Agents-Peer-Id': peer.peer_id,
    'X-Agents-Timestamp': timestamp,
    'X-Agents-Nonce': nonce,
    'X-Agents-Signature': `hmac-sha256=${signature}`,
  };
  const targetUrl = new URL(requestPath, peer.base_url).toString();
  let response = null;
  let errorMessage = '';
  try {
    response = await requestJson('GET', targetUrl, null, headers, {
      timeoutMs: Number(args.timeoutMs || args.timeout || 15000),
      localAddress: args['local-address'] || '',
    });
  } catch (error) {
    errorMessage = redactSensitiveText(error.message || String(error), 1000);
  }
  const ok = response ? response.statusCode >= 200 && response.statusCode < 300 : false;
  const conversationId = target.conversation.conversation_id || taskId;
  await upsertConversation(stateRoot, conversationId, {
    status: ok ? 'receipt_seen' : 'poll_failed',
    direction: 'outbound',
    peer_id: peer.peer_id,
    local_node: config.local_node.node_id,
    remote_node: peer.peer_id,
    capability: target.conversation.capability || '',
    original_task_id: taskId,
    task_ids: [taskId],
    last_receipt: ok ? summarizePeerResponse(response.data) : null,
    last_poll: {
      ok,
      status_code: response ? response.statusCode : 0,
      polled_at: new Date().toISOString(),
      error: errorMessage,
    },
  }, buildConversationEvent('receipt_poll', taskId, {
    stage: ok ? 'receipt_seen' : 'poll_failed',
    peer_id: peer.peer_id,
    status_code: response ? response.statusCode : 0,
    receipt_id: ok && response.data ? response.data.receipt_id || '' : '',
  }));
  return {
    ok,
    task_id: taskId,
    peer_id: peer.peer_id,
    conversation_id: conversationId,
    status_code: response ? response.statusCode : 0,
    receipt_id: ok && response.data ? response.data.receipt_id || '' : '',
    error: errorMessage,
  };
}

function loadContext(args) {
  const configPath = path.resolve(args.config || defaultConfigPath);
  const stateRoot = path.resolve(args['state-root'] || defaultStateRoot);
  const validation = validateConfig(readJsonFile(configPath), { requireKeys: !args['dry-run'] });
  if (!validation.ok) throw new Error(`Config invalid: ${validation.errors.join('; ')}`);
  return { configPath, stateRoot, config: validation.config, warnings: validation.warnings };
}

async function runOnce(args) {
  const { configPath, stateRoot, config, warnings } = loadContext(args);
  const limit = numberValue(args.limit, 20, 1, 1000);
  const targets = (await buildPollTargets(stateRoot, args)).slice(0, limit);
  const results = [];
  for (const target of targets) {
    if (args['dry-run']) {
      results.push({ ok: true, dry_run: true, task_id: target.conversation.original_task_id, peer_id: target.conversation.peer_id, conversation_id: target.conversation.conversation_id });
      continue;
    }
    results.push(await pollReceipt(args, config, stateRoot, target));
  }
  return {
    ok: !results.some((item) => item.ok === false),
    checked_at: new Date().toISOString(),
    config: toRepoPath(configPath),
    state_root: toRepoPath(stateRoot),
    warnings,
    count: results.length,
    results,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (args.watch) {
    const intervalSeconds = numberValue(args.interval, 10, 1, 3600);
    process.stdout.write(`${JSON.stringify({ ok: true, status: 'watching', interval_seconds: intervalSeconds })}\n`);
    while (true) {
      process.stdout.write(`${JSON.stringify(await runOnce(args))}\n`);
      await sleep(intervalSeconds * 1000);
    }
  }
  const result = await runOnce(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
  process.exit(1);
});
