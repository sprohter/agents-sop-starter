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
  validateTaskEnvelope,
  signRequest,
  randomId,
  writeDatedRecord,
  requestJson,
  getTaskConversationId,
  summarizeTaskForConversation,
  buildConversationEvent,
  summarizePeerResponse,
  redactSensitiveText,
  upsertConversation,
  toRepoPath,
} = require('./p2p-common');

function usage() {
  return [
    'Usage:',
    '  node scripts/mesh/p2p-send.js --peer <peer_id> --capability <capability> --text <text>',
    '  node scripts/mesh/p2p-send.js --peer <peer_id> --task-file templates/mesh-p2p-task.sample.json',
    '  node scripts/mesh/p2p-send.js --peer <peer_id> --text <text> --local-address <lan-ip>',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const configPath = path.resolve(args.config || defaultConfigPath);
  const stateRoot = path.resolve(args['state-root'] || defaultStateRoot);
  const validation = validateConfig(readJsonFile(configPath), { requireKeys: true });
  if (!validation.ok) throw new Error(`Config invalid: ${validation.errors.join('; ')}`);
  const config = validation.config;
  const peerId = args.peer || args._[0];
  if (!peerId) throw new Error('Missing --peer.');
  const peer = findPeer(config, peerId);
  if (!peer) throw new Error(`Peer not found: ${peerId}`);
  if (peer.allow_outbound !== true) throw new Error(`Peer outbound is not allowed: ${peerId}`);
  if (!peer.base_url) throw new Error(`Peer base_url is required: ${peerId}`);

  let task;
  if (args['task-file']) {
    task = readJsonFile(path.resolve(args['task-file']));
  } else {
    const text = args.text || args._.slice(1).join(' ');
    if (!text) throw new Error('Missing --text or --task-file.');
    task = {
      protocol_version: protocolVersion,
      message_id: randomId('msg'),
      task_id: randomId('task'),
      from_node: config.local_node.node_id,
      to_node: peer.peer_id,
      capability: args.capability || 'route_review',
      mode: args.mode || 'record_only',
      objective: args.objective || text.slice(0, 120),
      constraints: ['read_only', 'no_external_write', 'do_not_expose_local_paths_or_secrets'],
      expected_output: ['final_summary', 'structured_finding', 'verification_note', 'next_action'],
      payload: { text },
      reply_policy: { max_wait_seconds: 0, receipt_only: true },
      trace: { conversation_id: args.conversation || randomId('conversation'), source: 'manual' },
    };
  }

  const taskErrors = validateTaskEnvelope(task, config, peer, 'outbound');
  if (taskErrors.length > 0) throw new Error(`Task invalid: ${taskErrors.join('; ')}`);

  const conversationId = getTaskConversationId(task);
  const targetUrl = new URL('/v1/p2p/tasks', peer.base_url).toString();
  const requestPath = '/v1/p2p/tasks';
  const rawBody = JSON.stringify(task);
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const signature = signRequest(getPeerSharedKey(peer), 'POST', requestPath, timestamp, nonce, rawBody);
  const headers = {
    'X-Agents-P2P-Version': protocolVersion,
    'X-Agents-Node-Id': config.local_node.node_id,
    'X-Agents-Peer-Id': peer.peer_id,
    'X-Agents-Timestamp': timestamp,
    'X-Agents-Nonce': nonce,
    'X-Agents-Signature': `hmac-sha256=${signature}`,
  };

  const outboxPayload = {
    created_at: new Date().toISOString(),
    peer_id: peer.peer_id,
    capability: task.capability,
    mode: task.mode,
    task_id: task.task_id,
    target_url: targetUrl,
    request: task,
    sent: false,
  };
  const outbox = await writeDatedRecord(stateRoot, 'outbox', outboxPayload);
  await upsertConversation(stateRoot, conversationId, {
    status: args['dry-run'] ? 'prepared_not_sent' : 'pending',
    direction: 'outbound',
    peer_id: peer.peer_id,
    local_node: config.local_node.node_id,
    remote_node: peer.peer_id,
    capability: task.capability,
    mode: task.mode,
    original_task_id: task.task_id,
    task_ids: [task.task_id],
    outbox_records: [outbox.id],
    target_url: targetUrl,
    last_task: summarizeTaskForConversation(task),
  }, buildConversationEvent('outbox_recorded', task.task_id, {
    stage: args['dry-run'] ? 'prepared_not_sent' : 'pending',
    peer_id: peer.peer_id,
    outbox_record_id: outbox.id,
  }));

  if (args['dry-run']) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      status: 'prepared_not_sent',
      outbox_record: toRepoPath(outbox.filePath),
      peer_id: peer.peer_id,
      capability: task.capability,
      conversation_id: conversationId,
      has_signature: true,
    }, null, 2)}\n`);
    return;
  }

  let response = null;
  let errorMessage = '';
  try {
    response = await requestJson('POST', targetUrl, task, headers, {
      timeoutMs: Number(args.timeoutMs || args.timeout || 15000),
      localAddress: args['local-address'] || '',
    });
  } catch (error) {
    errorMessage = redactSensitiveText(error.message || String(error), 1000);
  }
  const ok = response ? response.statusCode >= 200 && response.statusCode < 300 : false;
  await writeJsonFile(outbox.filePath, {
    local_record_id: outbox.id,
    ...outboxPayload,
    sent: ok,
    response_status_code: response ? response.statusCode : 0,
    response_body: response ? summarizePeerResponse(response.data) : null,
    network: response ? {
      local_address: response.localAddress || '',
      local_port: response.localPort || 0,
      remote_address: response.remoteAddress || '',
      remote_port: response.remotePort || 0,
    } : {
      local_address: args['local-address'] || '',
      local_port: 0,
      remote_address: '',
      remote_port: 0,
    },
    error: errorMessage,
  });
  await upsertConversation(stateRoot, conversationId, {
    status: ok ? 'sent' : 'send_failed',
    task_ids: [task.task_id],
    outbox_records: [outbox.id],
    last_send: {
      ok,
      status_code: response ? response.statusCode : 0,
      sent_at: new Date().toISOString(),
      response: response ? summarizePeerResponse(response.data) : null,
      error: errorMessage,
    },
  }, buildConversationEvent('send_completed', task.task_id, {
    stage: ok ? 'sent' : 'send_failed',
    peer_id: peer.peer_id,
    outbox_record_id: outbox.id,
    status_code: response ? response.statusCode : 0,
  }));
  process.stdout.write(`${JSON.stringify({
    ok,
    status_code: response ? response.statusCode : 0,
    outbox_record: toRepoPath(outbox.filePath),
    conversation_id: conversationId,
    network: response ? {
      local_address: response.localAddress || '',
      local_port: response.localPort || 0,
      remote_address: response.remoteAddress || '',
      remote_port: response.remotePort || 0,
    } : null,
    response: response ? summarizePeerResponse(response.data) : null,
    error: errorMessage,
  }, null, 2)}\n`);
  if (!ok) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
  process.exit(1);
});
