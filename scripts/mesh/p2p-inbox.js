#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
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
  summarizeTaskForConversation,
  buildConversationEvent,
  summarizePeerResponse,
  redactSensitiveText,
  upsertConversation,
  requestJson,
  toRepoPath,
} = require('./p2p-common');

const allowedStatuses = new Set([
  'received',
  'accepted',
  'rejected',
  'replied',
  'auto_accepted',
  'auto_processing',
  'auto_replied',
  'auto_boundary_replied',
  'auto_failed',
  'needs_review',
]);

function usage() {
  return [
    'Usage:',
    '  node scripts/mesh/p2p-inbox.js list [--peer <peer_id>] [--status <status>]',
    '  node scripts/mesh/p2p-inbox.js show <local_record_id>',
    '  node scripts/mesh/p2p-inbox.js accept <local_record_id> [--note <text>]',
    '  node scripts/mesh/p2p-inbox.js reject <local_record_id> --note <text>',
    '  node scripts/mesh/p2p-inbox.js reply <local_record_id> --text <text> [--local-address <lan-ip>]',
  ].join('\n');
}

function loadContext(args) {
  const configPath = path.resolve(args.config || defaultConfigPath);
  const stateRoot = path.resolve(args['state-root'] || defaultStateRoot);
  const validation = validateConfig(readJsonFile(configPath), { requireKeys: !!args.requireKeys });
  if (!validation.ok) throw new Error(`Config invalid: ${validation.errors.join('; ')}`);
  return { configPath, stateRoot, config: validation.config };
}

async function walkJsonFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.json')) files.push(fullPath);
    }
  }
  return files;
}

function getInboxStatus(record) {
  return record.local_status && allowedStatuses.has(record.local_status) ? record.local_status : 'received';
}

async function loadInboxRecords(stateRoot) {
  const files = await walkJsonFiles(path.join(stateRoot, 'inbox'));
  const records = [];
  for (const file of files) {
    try {
      const record = JSON.parse(await fsp.readFile(file, 'utf8'));
      records.push({ ...record, _file: file, local_status: getInboxStatus(record) });
    } catch {
      // Ignore broken runtime records.
    }
  }
  records.sort((a, b) => String(b.received_at || '').localeCompare(String(a.received_at || '')));
  return records;
}

async function findInboxRecord(stateRoot, recordId) {
  const records = await loadInboxRecords(stateRoot);
  const record = records.find((item) => item.local_record_id === recordId || path.basename(item._file, '.json') === recordId);
  if (!record) throw new Error(`Inbox record not found: ${recordId}`);
  return record;
}

async function saveRecord(record) {
  const file = record._file;
  const copy = { ...record };
  delete copy._file;
  await writeJsonFile(file, copy);
}

function summarizeRecord(record) {
  const task = record.task || {};
  return {
    local_record_id: record.local_record_id,
    status: getInboxStatus(record),
    received_at: record.received_at || '',
    peer_id: record.peer_id || task.from_node || '',
    capability: task.capability || '',
    mode: task.mode || '',
    remote_task_id: task.remote_task_id || '',
    conversation_id: task.trace && task.trace.conversation_id ? task.trace.conversation_id : '',
    objective: task.objective || '',
  };
}

function filteredText(value, fieldName, maxLength = 20000) {
  if (!value || typeof value !== 'string') throw new Error(`Missing ${fieldName}.`);
  if (value.length > maxLength) throw new Error(`${fieldName} is too long; max ${maxLength} characters.`);
  return value;
}

async function listCommand(args) {
  const { stateRoot } = loadContext(args);
  let records = await loadInboxRecords(stateRoot);
  if (args.peer) records = records.filter((record) => record.peer_id === args.peer);
  if (args.status) records = records.filter((record) => getInboxStatus(record) === args.status);
  const limit = Number(args.limit || 20);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    state_root: toRepoPath(stateRoot),
    count: records.length,
    records: records.slice(0, limit).map(summarizeRecord),
  }, null, 2)}\n`);
}

async function showCommand(args, recordId) {
  const { stateRoot } = loadContext(args);
  const record = await findInboxRecord(stateRoot, recordId);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    record: {
      ...summarizeRecord(record),
      local_notes: record.local_notes || [],
      local_reply: record.local_reply || null,
      task: record.task || {},
      file: toRepoPath(record._file),
    },
  }, null, 2)}\n`);
}

async function updateStatusCommand(args, recordId, status) {
  const { stateRoot } = loadContext(args);
  const record = await findInboxRecord(stateRoot, recordId);
  if (getInboxStatus(record) === 'replied' && status !== 'replied') throw new Error('Cannot change a replied record.');
  record.local_status = status;
  record.local_notes = Array.isArray(record.local_notes) ? record.local_notes : [];
  record.local_notes.push({
    status,
    note: args.note || '',
    updated_at: new Date().toISOString(),
  });
  if (status === 'accepted') {
    const task = record.task || {};
    const work = await writeDatedRecord(stateRoot, 'work', {
      created_at: new Date().toISOString(),
      inbox_record_id: record.local_record_id,
      peer_id: record.peer_id || task.from_node || '',
      remote_task_id: task.remote_task_id || '',
      conversation_id: task.trace && task.trace.conversation_id ? task.trace.conversation_id : '',
      capability: task.capability || '',
      objective: task.objective || '',
      payload_text: task.payload && typeof task.payload.text === 'string' ? task.payload.text : '',
      status: 'accepted_for_local_processing',
      note: args.note || '',
      next_action: 'Have the local owner or local agent prepare a filtered reply, then run p2p-inbox reply.',
    });
    record.local_work = {
      work_record_id: work.id,
      work_record: toRepoPath(work.filePath),
      created_at: new Date().toISOString(),
    };
  }
  await saveRecord(record);
  process.stdout.write(`${JSON.stringify({ ok: true, record: summarizeRecord(record), file: toRepoPath(record._file) }, null, 2)}\n`);
}

function buildReplyTask(config, peer, record, replyText, args) {
  const inbound = record.task || {};
  const trace = inbound.trace || {};
  const conversationId = args.conversation || trace.conversation_id || randomId('conversation');
  return {
    protocol_version: protocolVersion,
    message_id: randomId('msg'),
    task_id: randomId('task'),
    from_node: config.local_node.node_id,
    to_node: peer.peer_id,
    capability: args.capability || inbound.capability || 'route_review',
    mode: 'record_only',
    objective: args.objective || `Reply to ${inbound.remote_task_id || record.local_record_id}`,
    constraints: ['read_only', 'no_external_write', 'do_not_expose_local_paths_or_secrets'],
    expected_output: ['final_summary', 'structured_finding', 'verification_note', 'next_action'],
    payload: { text: replyText },
    reply_policy: { max_wait_seconds: 0, receipt_only: true },
    trace: {
      conversation_id: conversationId,
      source: 'p2p-inbox-reply',
      reply_to_task_id: inbound.remote_task_id || '',
      reply_to_message_id: inbound.message_id || '',
      reply_to_inbox_record_id: record.local_record_id || '',
    },
  };
}

async function replyCommand(args, recordId) {
  args.requireKeys = true;
  const { config, stateRoot } = loadContext(args);
  const record = await findInboxRecord(stateRoot, recordId);
  if (getInboxStatus(record) === 'replied' && !args.force) {
    throw new Error('Record already replied. Use --force to send another reply.');
  }
  const inbound = record.task || {};
  if (args.peer && args.peer !== (record.peer_id || inbound.from_node) && !args['allow-peer-override']) {
    throw new Error('Refusing to reply to a different peer without --allow-peer-override.');
  }
  const peerId = args.peer || record.peer_id || inbound.from_node;
  if (!peerId) throw new Error('Cannot resolve peer for reply.');
  const peer = findPeer(config, peerId);
  if (!peer) throw new Error(`Peer not found in config: ${peerId}`);
  if (peer.allow_outbound !== true) throw new Error(`Peer outbound is not allowed: ${peerId}`);
  if (!peer.base_url) throw new Error(`Peer base_url is required: ${peerId}`);

  const replyText = args['text-file']
    ? filteredText(fs.readFileSync(path.resolve(args['text-file']), 'utf8'), '--text-file')
    : filteredText(args.text || args._.slice(2).join(' '), '--text');
  const task = buildReplyTask(config, peer, record, replyText, args);
  const taskErrors = validateTaskEnvelope(task, config, peer, 'outbound');
  if (taskErrors.length > 0) throw new Error(`Reply task invalid: ${taskErrors.join('; ')}`);

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
    reply_to_inbox_record_id: record.local_record_id,
  };
  const outbox = await writeDatedRecord(stateRoot, 'outbox', outboxPayload);
  const inboundTrace = inbound.trace || {};
  const conversationId = inboundTrace.conversation_id || task.trace.conversation_id || inbound.remote_task_id || task.task_id;
  await upsertConversation(stateRoot, conversationId, {
    status: 'reply_pending',
    direction: 'inbound',
    peer_id: peer.peer_id,
    local_node: config.local_node.node_id,
    remote_node: peer.peer_id,
    capability: task.capability,
    task_ids: [task.task_id, inbound.remote_task_id || ''],
    outbox_records: [outbox.id],
    reply_to_task_id: inbound.remote_task_id || '',
    last_reply: summarizeTaskForConversation(task),
    reply_text: replyText,
  }, buildConversationEvent('manual_reply_prepared', task.task_id, {
    stage: 'reply_pending',
    peer_id: peer.peer_id,
    outbox_record_id: outbox.id,
    reply_to_task_id: inbound.remote_task_id || '',
  }));

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
  const sentOk = response ? response.statusCode >= 200 && response.statusCode < 300 : false;
  await writeJsonFile(outbox.filePath, {
    local_record_id: outbox.id,
    ...outboxPayload,
    sent: sentOk,
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
  record.local_status = sentOk ? 'replied' : getInboxStatus(record);
  record.local_reply_attempts = Array.isArray(record.local_reply_attempts) ? record.local_reply_attempts : [];
  const attempt = {
    replied_at: new Date().toISOString(),
    peer_id: peer.peer_id,
    task_id: task.task_id,
    message_id: task.message_id,
    target_url: targetUrl,
    status_code: response ? response.statusCode : 0,
    ok: sentOk,
    outbox_record: toRepoPath(outbox.filePath),
    network: response ? {
      local_address: response.localAddress || '',
      local_port: response.localPort || 0,
      remote_address: response.remoteAddress || '',
      remote_port: response.remotePort || 0,
    } : null,
    error: errorMessage,
  };
  record.local_reply_attempts.push(attempt);
  if (sentOk) record.local_reply = attempt;
  await upsertConversation(stateRoot, conversationId, {
    status: sentOk ? 'reply_sent' : 'reply_send_failed',
    direction: 'inbound',
    peer_id: peer.peer_id,
    local_node: config.local_node.node_id,
    remote_node: peer.peer_id,
    capability: task.capability,
    task_ids: [task.task_id, inbound.remote_task_id || ''],
    outbox_records: [outbox.id],
    reply_to_task_id: inbound.remote_task_id || '',
    last_reply: summarizeTaskForConversation(task),
    reply_text: replyText,
  }, buildConversationEvent('manual_reply_sent', task.task_id, {
    stage: sentOk ? 'reply_sent' : 'reply_send_failed',
    peer_id: peer.peer_id,
    outbox_record_id: outbox.id,
    status_code: response ? response.statusCode : 0,
    reply_to_task_id: inbound.remote_task_id || '',
  }));
  await saveRecord(record);
  process.stdout.write(`${JSON.stringify({
    ok: sentOk,
    status_code: response ? response.statusCode : 0,
    record: summarizeRecord(record),
    reply_task_id: task.task_id,
    outbox_record: toRepoPath(outbox.filePath),
    network: response ? {
      local_address: response.localAddress || '',
      local_port: response.localPort || 0,
      remote_address: response.remoteAddress || '',
      remote_port: response.remotePort || 0,
    } : null,
    response: response ? summarizePeerResponse(response.data) : null,
    error: errorMessage,
  }, null, 2)}\n`);
  if (!sentOk) process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'list';
  if (args.help || command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command === 'list') return listCommand(args);
  const recordId = args._[1];
  if (!recordId) throw new Error(`Missing record id for ${command}.`);
  if (command === 'show') return showCommand(args, recordId);
  if (command === 'accept') return updateStatusCommand(args, recordId, 'accepted');
  if (command === 'reject') {
    if (!args.note) throw new Error('Missing --note for reject.');
    return updateStatusCommand(args, recordId, 'rejected');
  }
  if (command === 'reply') return replyCommand(args, recordId);
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
  process.exit(1);
});
