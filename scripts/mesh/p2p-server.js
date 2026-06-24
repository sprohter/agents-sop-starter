#!/usr/bin/env node

const http = require('node:http');
const path = require('node:path');
const fsp = require('node:fs/promises');
const {
  protocolVersion,
  defaultConfigPath,
  defaultStateRoot,
  parseArgs,
  readJsonFile,
  validateConfig,
  findPeer,
  getPeerSharedKey,
  validateTaskEnvelope,
  filterTaskForStorage,
  buildReceipt,
  filteredError,
  ensureStateDirs,
  writeDatedRecord,
  getTaskConversationId,
  summarizeTaskForConversation,
  buildConversationEvent,
  upsertConversation,
  findConversationByTaskId,
  findRecentConversationCandidate,
  checkInboxQuota,
  registerRateLimitEvent,
  claimNonce,
  checkTimestamp,
  readBody,
  signRequest,
  constantTimeEqualHex,
  respondJson,
  toRepoPath,
} = require('./p2p-common');

const httpStatusByCode = {
  request_too_large: 413,
  missing_header: 400,
  unsupported_version: 400,
  unknown_peer: 403,
  peer_disabled: 403,
  timestamp_out_of_range: 401,
  replay_nonce: 401,
  invalid_signature: 401,
  invalid_json: 400,
  schema_invalid: 400,
  capability_not_allowed: 403,
  mode_not_allowed: 403,
  storage_error: 500,
  rate_limited: 429,
  inbox_quota_exceeded: 429,
  internal_error: 500,
  receipt_not_found: 404,
};

function errorResponse(res, code, message) {
  respondJson(res, httpStatusByCode[code] || 500, filteredError(code, message));
}

function getHeader(req, name) {
  return req.headers[name.toLowerCase()] || '';
}

function parseSignature(value) {
  const match = String(value || '').match(/^hmac-sha256=([0-9a-f]+)$/i);
  return match ? match[1] : '';
}

async function authenticateRequest(req, config, stateRoot, rawBody, requestPath) {
  const headers = {
    version: getHeader(req, 'x-agents-p2p-version'),
    nodeId: getHeader(req, 'x-agents-node-id'),
    peerId: getHeader(req, 'x-agents-peer-id'),
    timestamp: getHeader(req, 'x-agents-timestamp'),
    nonce: getHeader(req, 'x-agents-nonce'),
    signature: getHeader(req, 'x-agents-signature'),
  };
  for (const [key, value] of Object.entries(headers)) {
    if (!value) return { ok: false, code: 'missing_header', message: `Missing header: ${key}` };
  }
  if (headers.version !== protocolVersion) return { ok: false, code: 'unsupported_version', message: 'Unsupported protocol version.' };
  if (headers.peerId !== config.local_node.node_id) return { ok: false, code: 'unknown_peer', message: 'Receiver node id does not match local node.' };

  const peer = findPeer(config, headers.nodeId);
  if (!peer) return { ok: false, code: 'unknown_peer', message: 'Peer is not allowed.' };
  if (peer.allow_inbound !== true) return { ok: false, code: 'peer_disabled', message: 'Peer inbound is disabled.' };
  const sharedKey = getPeerSharedKey(peer);
  if (!sharedKey) return { ok: false, code: 'peer_disabled', message: 'Peer shared key is not configured.' };
  if (!checkTimestamp(headers.timestamp, Number(config.security.clock_skew_seconds))) {
    return { ok: false, code: 'timestamp_out_of_range', message: 'Timestamp is outside the allowed clock skew.' };
  }

  const expected = signRequest(sharedKey, req.method, requestPath, headers.timestamp, headers.nonce, rawBody);
  if (!constantTimeEqualHex(expected, parseSignature(headers.signature))) {
    return { ok: false, code: 'invalid_signature', message: 'Signature is invalid.' };
  }
  const nonceClaimed = await claimNonce(stateRoot, peer.peer_id, headers.nonce, Number(config.security.nonce_ttl_seconds));
  if (!nonceClaimed) {
    return { ok: false, code: 'replay_nonce', message: 'Nonce was already used.' };
  }
  return { ok: true, peer, headers };
}

async function recordConversationForInboundTask(stateRoot, config, peer, task, inbox, receiptRecord) {
  const trace = task.trace && typeof task.trace === 'object' ? task.trace : {};
  const replyToTaskId = trace.reply_to_task_id || '';
  const taskSummary = summarizeTaskForConversation(task);
  if (replyToTaskId) {
    const matched = await findConversationByTaskId(stateRoot, replyToTaskId);
    if (matched) {
      const matchedPeer = matched.peer_id || matched.remote_node || '';
      const peerMatchesConversation = !matchedPeer || matchedPeer === peer.peer_id;
      await upsertConversation(stateRoot, matched.conversation_id, {
        status: peerMatchesConversation ? 'reply_received' : 'needs_review',
        direction: matched.direction || 'outbound',
        peer_id: matched.peer_id || peer.peer_id,
        local_node: config.local_node.node_id,
        remote_node: matched.remote_node || peer.peer_id,
        capability: task.capability,
        task_ids: [task.task_id, replyToTaskId],
        inbox_records: [inbox.id],
        receipt_records: [receiptRecord.id],
        reply_to_task_id: replyToTaskId,
        last_reply: taskSummary,
        reply_text: taskSummary.payload_text,
        ...(peerMatchesConversation ? {} : { needs_review_reason: 'reply_to_task_id_peer_mismatch' }),
      }, buildConversationEvent(peerMatchesConversation ? 'reply_received' : 'reply_peer_mismatch', task.task_id, {
        stage: peerMatchesConversation ? 'reply_received' : 'needs_review',
        peer_id: peer.peer_id,
        inbox_record_id: inbox.id,
        receipt_id: receiptRecord.id,
        reply_to_task_id: replyToTaskId,
      }));
      return {
        conversation_id: matched.conversation_id,
        status: peerMatchesConversation ? 'reply_received' : 'needs_review',
        matched: peerMatchesConversation,
      };
    }

    const candidate = await findRecentConversationCandidate(stateRoot, { peerId: peer.peer_id, capability: task.capability });
    const fallbackConversationId = candidate ? candidate.conversation_id : getTaskConversationId(task);
    await upsertConversation(stateRoot, fallbackConversationId, {
      status: 'needs_review',
      direction: candidate ? candidate.direction : 'inbound',
      peer_id: peer.peer_id,
      local_node: config.local_node.node_id,
      remote_node: peer.peer_id,
      capability: task.capability,
      task_ids: [task.task_id, replyToTaskId],
      inbox_records: [inbox.id],
      receipt_records: [receiptRecord.id],
      reply_to_task_id: replyToTaskId,
      last_reply: taskSummary,
      reply_text: taskSummary.payload_text,
      needs_review_reason: 'reply_to_task_id_unmatched',
    }, buildConversationEvent('reply_unmatched', task.task_id, {
      stage: 'needs_review',
      peer_id: peer.peer_id,
      inbox_record_id: inbox.id,
      receipt_id: receiptRecord.id,
      reply_to_task_id: replyToTaskId,
    }));
    return { conversation_id: fallbackConversationId, status: 'needs_review', matched: false };
  }

  const conversationId = getTaskConversationId(task);
  await upsertConversation(stateRoot, conversationId, {
    status: 'inbound_received',
    direction: 'inbound',
    peer_id: peer.peer_id,
    local_node: config.local_node.node_id,
    remote_node: peer.peer_id,
    capability: task.capability,
    mode: task.mode,
    original_task_id: task.task_id,
    task_ids: [task.task_id],
    inbox_records: [inbox.id],
    receipt_records: [receiptRecord.id],
    last_task: taskSummary,
  }, buildConversationEvent('inbound_received', task.task_id, {
    stage: 'inbound_received',
    peer_id: peer.peer_id,
    inbox_record_id: inbox.id,
    receipt_id: receiptRecord.id,
  }));
  return { conversation_id: conversationId, status: 'inbound_received', matched: true };
}

async function handleTask(req, res, context) {
  const { config, stateRoot } = context;
  let rawBody;
  try {
    rawBody = await readBody(req, Number(config.security.max_body_bytes));
  } catch (error) {
    errorResponse(res, error.code || 'request_too_large', 'Request body is too large.');
    return;
  }

  const auth = await authenticateRequest(req, config, stateRoot, rawBody, '/v1/p2p/tasks');
  if (!auth.ok) {
    errorResponse(res, auth.code, auth.message);
    return;
  }

  const rate = await registerRateLimitEvent(stateRoot, auth.peer.peer_id, config.security);
  if (!rate.ok) {
    errorResponse(res, rate.code, rate.message);
    return;
  }

  let task;
  try {
    task = JSON.parse(rawBody);
  } catch {
    errorResponse(res, 'invalid_json', 'Request body is not valid JSON.');
    return;
  }

  const taskErrors = validateTaskEnvelope(task, config, auth.peer, 'inbound');
  if (taskErrors.length > 0) {
    const code = taskErrors.some((item) => item.includes('capability')) ? 'capability_not_allowed'
      : taskErrors.some((item) => item.includes('mode')) ? 'mode_not_allowed'
      : 'schema_invalid';
    errorResponse(res, code, taskErrors[0]);
    return;
  }

  try {
    const quota = await checkInboxQuota(stateRoot, auth.peer.peer_id, config.security);
    if (!quota.ok) {
      errorResponse(res, quota.code, quota.message);
      return;
    }
    const inbox = await writeDatedRecord(stateRoot, 'inbox', {
      received_at: new Date().toISOString(),
      peer_id: auth.peer.peer_id,
      task: filterTaskForStorage(task, auth.headers),
    });
    const receipt = buildReceipt(task);
    const receiptRecord = await writeDatedRecord(stateRoot, 'receipts', {
      received_at: new Date().toISOString(),
      peer_id: auth.peer.peer_id,
      task_id: task.task_id,
      inbox_record_id: inbox.id,
      receipt,
    });
    const conversation = await recordConversationForInboundTask(stateRoot, config, auth.peer, task, inbox, receiptRecord);
    respondJson(res, 202, {
      ok: true,
      status: 'accepted_recorded',
      protocol_version: protocolVersion,
      task_id: task.task_id,
      receipt_id: receipt.receipt_id,
      capability: task.capability,
      next_action: receipt.next_action,
      result: receipt.result,
      audit: { inbox_record_id: inbox.id, receipt_record_id: receiptRecord.id, conversation_id: conversation.conversation_id, conversation_status: conversation.status },
    });
  } catch {
    errorResponse(res, 'storage_error', 'Failed to store filtered task record.');
  }
}

async function findReceipt(stateRoot, taskId) {
  const receiptsRoot = path.join(stateRoot, 'receipts');
  let dayDirs = [];
  try {
    dayDirs = await fsp.readdir(receiptsRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const day of dayDirs.filter((item) => item.isDirectory()).sort((a, b) => b.name.localeCompare(a.name))) {
    const dir = path.join(receiptsRoot, day.name);
    const files = await fsp.readdir(dir).catch(() => []);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = readJsonFile(path.join(dir, file));
        if (data.task_id === taskId) return data.receipt;
      } catch {
        // Ignore broken runtime records.
      }
    }
  }
  return null;
}

async function handleReceipt(req, res, context, taskId) {
  const { config, stateRoot } = context;
  const auth = await authenticateRequest(req, config, stateRoot, '', `/v1/p2p/receipts/${encodeURIComponent(taskId)}`);
  if (!auth.ok) {
    errorResponse(res, auth.code, auth.message);
    return;
  }
  const receipt = await findReceipt(stateRoot, taskId);
  if (!receipt) {
    errorResponse(res, 'receipt_not_found', 'Receipt was not found.');
    return;
  }
  respondJson(res, 200, receipt);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(args.config || defaultConfigPath);
  const stateRoot = path.resolve(args['state-root'] || defaultStateRoot);
  const validation = validateConfig(readJsonFile(configPath), { requireKeys: true });
  if (!validation.ok) throw new Error(`Config invalid: ${validation.errors.join('; ')}`);
  const config = validation.config;
  await ensureStateDirs(stateRoot);

  const host = args.host || config.local_node.listen_host || '127.0.0.1';
  const port = Number(args.port || config.local_node.listen_port);
  const context = { config, stateRoot };
  let server;
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
      if (req.method === 'GET' && url.pathname === '/health') {
        respondJson(res, 200, { ok: true, protocol_version: protocolVersion, status: 'ready' });
      } else if (req.method === 'POST' && url.pathname === '/v1/p2p/tasks') {
        await handleTask(req, res, context);
        if (args.once) setImmediate(() => server.close());
      } else if (req.method === 'GET' && url.pathname.startsWith('/v1/p2p/receipts/')) {
        await handleReceipt(req, res, context, decodeURIComponent(url.pathname.slice('/v1/p2p/receipts/'.length)));
        if (args.once) setImmediate(() => server.close());
      } else {
        respondJson(res, 404, filteredError('not_found', 'Endpoint not found.'));
      }
    } catch {
      errorResponse(res, 'internal_error', 'Internal error.');
    }
  });

  server.listen(port, host, () => {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      status: 'listening',
      protocol_version: protocolVersion,
      listen_host: host,
      listen_port: port,
      config: toRepoPath(configPath),
      state_root: toRepoPath(stateRoot),
      once: !!args.once,
    })}\n`);
  });
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
  process.exit(1);
});
