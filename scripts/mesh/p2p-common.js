const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');

const agentsRoot = path.resolve(__dirname, '..', '..');
const defaultConfigPath = path.join(agentsRoot, 'runtime', 'local-secrets', 'mesh-p2p', 'peers.json');
const defaultStateRoot = path.join(agentsRoot, 'runtime', 'state', 'mesh-p2p');
const protocolVersion = '0.1';
const defaultPublicCapabilities = ['readonly_diagnosis', 'test_plan_review', 'test_data_suggestion', 'bug_summary', 'report_drafting', 'route_review'];
const allowedModes = new Set(['record_only', 'request_local_review']);
const blockedPayloadKeys = new Set(['execute', 'shell', 'mcp_server', 'db', 'file_path', 'env', 'credential', 'secret', 'token', 'cookie', 'password']);
const allowedTaskKeys = new Set(['protocol_version', 'message_id', 'task_id', 'from_node', 'to_node', 'capability', 'mode', 'objective', 'constraints', 'expected_output', 'payload', 'reply_policy', 'trace']);
const allowedPayloadKeys = new Set(['text']);
const allowedReplyPolicyKeys = new Set(['max_wait_seconds', 'receipt_only']);
const allowedTraceKeys = new Set(['conversation_id', 'source', 'reply_to_task_id', 'reply_to_message_id', 'reply_to_inbox_record_id']);
const conversationStatusRank = new Map([
  ['prepared_not_sent', 0],
  ['pending', 1],
  ['send_failed', 2],
  ['sent', 3],
  ['poll_failed', 4],
  ['receipt_seen', 5],
  ['inbound_received', 5],
  ['reply_pending', 5],
  ['needs_review', 6],
  ['inbound_reply_unmatched', 6],
  ['reply_send_failed', 6],
  ['reply_received', 7],
  ['reply_sent', 7],
  ['completed', 8],
  ['expired', 9],
]);

function toRepoPath(filePath) {
  return path.relative(agentsRoot, filePath).split(path.sep).join('/');
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      args._.push(item);
      continue;
    }
    const eqIndex = item.indexOf('=');
    if (eqIndex > 2) {
      args[item.slice(2, eqIndex)] = item.slice(eqIndex + 1);
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readOptionalSecretFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const normalized = path.normalize(filePath);
  if (!path.isAbsolute(normalized) && (normalized === '..' || normalized.startsWith(`..${path.sep}`))) return '';
  try {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(agentsRoot, filePath);
    const relative = path.relative(agentsRoot, resolved);
    if (!path.isAbsolute(filePath) && (relative === '..' || relative.startsWith(`..${path.sep}`))) return '';
    return fs.readFileSync(resolved, 'utf8').trim();
  } catch {
    return '';
  }
}

async function writeJsonFile(filePath, data) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`,
  );
  await fsp.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fsp.rename(tmpPath, filePath);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildSigningString(method, requestPath, timestamp, nonce, rawBody) {
  return [String(method || '').toUpperCase(), requestPath, timestamp, nonce, sha256Hex(rawBody || '')].join('\n');
}

function signRequest(sharedKey, method, requestPath, timestamp, nonce, rawBody) {
  return crypto.createHmac('sha256', sharedKey).update(buildSigningString(method, requestPath, timestamp, nonce, rawBody)).digest('hex');
}

function constantTimeEqualHex(left, right) {
  if (!/^[0-9a-f]+$/i.test(left || '') || !/^[0-9a-f]+$/i.test(right || '')) return false;
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function randomId(prefix) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17);
  return `${prefix}-${stamp}-${crypto.randomBytes(6).toString('hex')}`;
}

function truncateText(value, maxChars = 4000) {
  const text = String(value || '');
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 18))}\n...[truncated]`;
}

function redactSensitiveText(value, maxChars = 4000) {
  return truncateText(String(value || '')
    .replace(/hmac-sha256=[0-9a-f]+/gi, 'hmac-sha256=[redacted]')
    .replace(/\bAuthorization\s*[:=]\s*Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Authorization: Bearer [redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/([A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY|COOKIE|CREDENTIAL|SESSION)[A-Za-z0-9_]*)\s*[:=]\s*([^&\s"'<>;,]+)/gi, '$1=[redacted]')
    .replace(/\b(api[_-]?key|access[_-]?key|secret[_-]?key|client[_-]?secret|refresh[_-]?token|access[_-]?token|password|passwd|pwd|cookie|set-cookie|credential)\s*[:=]\s*([^&\s"'<>;,]+)/gi, '$1=[redacted]')
    .replace(/\b(?:jdbc:)?(?:mysql|postgres(?:ql)?|mongodb|redis):\/\/[^\s"'<>]+/gi, '[connection-string]')
    .replace(/([A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY|COOKIE)[A-Za-z0-9_]*)=([^&\s]+)/gi, '$1=[redacted]')
    .replace(/[A-Za-z]:\\[^\s"'<>]+/g, '[local-path]')
    .replace(/\/(?:Users|home|root|var|etc|opt|srv|tmp)\/[^\s"'<>]+/g, '[local-path]'), maxChars);
}

function summarizeResultObject(result) {
  const safe = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  const summary = {};
  for (const key of ['final_summary', 'verification_note', 'next_action']) {
    if (safe[key] !== undefined) summary[key] = redactSensitiveText(safe[key], 2000);
  }
  if (safe.evidence_reference !== undefined) {
    summary.evidence_reference = Array.isArray(safe.evidence_reference)
      ? safe.evidence_reference.slice(0, 20).map((item) => redactSensitiveText(item, 500))
      : redactSensitiveText(safe.evidence_reference, 1000);
  }
  if (safe.structured_finding !== undefined) {
    summary.structured_finding = Array.isArray(safe.structured_finding)
      ? safe.structured_finding.slice(0, 20).map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return redactSensitiveText(item, 500);
        const finding = {};
        for (const [key, itemValue] of Object.entries(item).slice(0, 20)) {
          finding[key] = typeof itemValue === 'string' ? redactSensitiveText(itemValue, 1000) : itemValue;
        }
        return finding;
      })
      : redactSensitiveText(safe.structured_finding, 1000);
  }
  return summary;
}

function summarizePeerResponse(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { raw_summary: redactSensitiveText(data, 1000) };
  }
  const summary = {};
  for (const key of ['ok', 'status', 'protocol_version', 'task_id', 'receipt_id', 'capability', 'accepted_at', 'next_action']) {
    if (data[key] !== undefined) {
      summary[key] = typeof data[key] === 'string' ? redactSensitiveText(data[key], 1000) : data[key];
    }
  }
  if (data.error && typeof data.error === 'object' && !Array.isArray(data.error)) {
    summary.error = {
      code: redactSensitiveText(data.error.code || '', 200),
      message: redactSensitiveText(data.error.message || '', 1000),
    };
  }
  if (data.result !== undefined) summary.result = summarizeResultObject(data.result);
  if (data.audit && typeof data.audit === 'object' && !Array.isArray(data.audit)) {
    summary.audit = {};
    for (const key of ['inbox_record_id', 'receipt_record_id', 'conversation_id', 'conversation_status']) {
      if (data.audit[key] !== undefined) summary.audit[key] = redactSensitiveText(data.audit[key], 300);
    }
  }
  if (Object.keys(summary).length === 0) summary.raw_object_keys = Object.keys(data).slice(0, 20);
  return summary;
}

function dateSegment(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function loadPublicCapabilities() {
  const registryPath = path.join(agentsRoot, 'governance', 'capability-registry.yml');
  try {
    const content = fs.readFileSync(registryPath, 'utf8');
    const result = [];
    let current = '';
    for (const rawLine of content.split(/\r?\n/)) {
      const capabilityMatch = rawLine.match(/^  ([A-Za-z0-9_]+):\s*$/);
      if (capabilityMatch) {
        current = capabilityMatch[1];
        continue;
      }
      if (current && rawLine.match(/^\s{4}public_mesh:\s*true\s*$/)) {
        result.push(current);
        current = '';
      }
    }
    return result.length > 0 ? result : [...defaultPublicCapabilities];
  } catch {
    return [...defaultPublicCapabilities];
  }
}

function normalizeConfig(rawConfig) {
  const config = rawConfig && typeof rawConfig === 'object' ? { ...rawConfig } : {};
  config.local_node = config.local_node || {};
  config.security = {
    auth_scheme: 'hmac-sha256-v1',
    clock_skew_seconds: 300,
    nonce_ttl_seconds: 600,
    max_body_bytes: 65536,
    max_requests_per_minute: 30,
    max_peer_pending_inbox: 200,
    max_global_pending_inbox: 1000,
    ...(config.security || {}),
  };
  config.defaults = config.defaults || {};
  config.peers = Array.isArray(config.peers) ? config.peers : [];
  return config;
}

function isValidNodeId(value) {
  return /^[A-Za-z0-9._-]{3,80}$/.test(String(value || ''));
}

function uniqueItems(items) {
  return [...new Set(items)];
}

function getPeerCapabilities(config, peer) {
  const peerCaps = Array.isArray(peer.allowed_capabilities) ? peer.allowed_capabilities : [];
  const inbound = Array.isArray(config.defaults.allowed_inbound_capabilities) ? config.defaults.allowed_inbound_capabilities : [];
  return uniqueItems(peerCaps.length > 0 ? peerCaps : inbound);
}

function validateConfig(config, options = {}) {
  const normalized = normalizeConfig(config);
  const publicCapabilities = loadPublicCapabilities();
  const publicSet = new Set(publicCapabilities);
  const errors = [];
  const warnings = [];
  const local = normalized.local_node;

  if (!isValidNodeId(local.node_id)) errors.push('local_node.node_id is required and may contain only letters, numbers, dot, underscore, or dash.');
  if (!local.display_name || typeof local.display_name !== 'string') errors.push('local_node.display_name is required.');
  const port = Number(local.listen_port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) errors.push('local_node.listen_port must be an integer from 1024 to 65535.');
  if (!local.listen_host || typeof local.listen_host !== 'string') {
    errors.push('local_node.listen_host is required.');
  } else if (local.listen_host === '0.0.0.0') {
    warnings.push('listen_host is 0.0.0.0; ensure firewall limits this listener to the LAN.');
  }

  if (local.public_base_url) {
    try {
      const parsed = new URL(local.public_base_url);
      if (parsed.protocol !== 'http:') errors.push('local_node.public_base_url must use http:// for the LAN P2P v0.1 transport.');
    } catch {
      errors.push('local_node.public_base_url must be a valid URL.');
    }
  }

  if (normalized.security.auth_scheme !== 'hmac-sha256-v1') errors.push('security.auth_scheme must be hmac-sha256-v1.');
  for (const [field, min, max] of [
    ['clock_skew_seconds', 30, 3600],
    ['nonce_ttl_seconds', 60, 86400],
    ['max_body_bytes', 1024, 1024 * 1024],
    ['max_requests_per_minute', 1, 600],
    ['max_peer_pending_inbox', 1, 10000],
    ['max_global_pending_inbox', 1, 100000],
  ]) {
    const value = Number(normalized.security[field]);
    if (!Number.isInteger(value) || value < min || value > max) errors.push(`security.${field} must be an integer from ${min} to ${max}.`);
  }

  const seenPeers = new Set();
  for (const peer of normalized.peers) {
    if (!isValidNodeId(peer.peer_id)) {
      errors.push(`peer_id is invalid: ${peer.peer_id || '<empty>'}`);
      continue;
    }
    if (seenPeers.has(peer.peer_id)) errors.push(`duplicate peer_id: ${peer.peer_id}`);
    seenPeers.add(peer.peer_id);
    if (peer.peer_id === local.node_id) errors.push(`peer_id must not equal local node_id: ${peer.peer_id}`);
    if ('shared_key' in peer) errors.push(`peer ${peer.peer_id} must not contain shared_key; use shared_key_env or shared_key_file.`);
    if (peer.shared_key_file !== undefined && typeof peer.shared_key_file !== 'string') {
      errors.push(`peer ${peer.peer_id} shared_key_file must be a string when present.`);
    }
    if (!peer.shared_key_env || typeof peer.shared_key_env !== 'string') {
      errors.push(`peer ${peer.peer_id} must define shared_key_env.`);
    } else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(peer.shared_key_env)) {
      errors.push(`peer ${peer.peer_id} has invalid shared_key_env name.`);
    } else {
      const value = getPeerSharedKey(peer);
      if (!value) {
        const message = `peer ${peer.peer_id} shared key is not loaded from env or file: ${peer.shared_key_env}`;
        if (options.requireKeys) errors.push(message);
        else warnings.push(message);
      } else if (value.length < 16) {
        warnings.push(`peer ${peer.peer_id} shared key is shorter than 16 characters.`);
      }
    }

    if (peer.base_url) {
      try {
        const parsed = new URL(peer.base_url);
        if (parsed.protocol !== 'http:') errors.push(`peer ${peer.peer_id} base_url must use http:// for v0.1.`);
      } catch {
        errors.push(`peer ${peer.peer_id} base_url must be a valid URL.`);
      }
    }

    const capabilities = getPeerCapabilities(normalized, peer);
    if (capabilities.length === 0) errors.push(`peer ${peer.peer_id} must define allowed_capabilities or defaults.allowed_inbound_capabilities.`);
    for (const capability of capabilities) {
      if (!publicSet.has(capability)) errors.push(`peer ${peer.peer_id} capability is not public: ${capability}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, config: normalized, publicCapabilities };
}

function findPeer(config, peerId) {
  return config.peers.find((peer) => peer.peer_id === peerId) || null;
}

function getPeerSharedKey(peer) {
  if (!peer || !peer.shared_key_env) return '';
  return process.env[peer.shared_key_env] || readOptionalSecretFile(peer.shared_key_file);
}

function getPeerSharedKeyStatus(peer, options = {}) {
  const sharedKey = getPeerSharedKey(peer);
  const prefixLength = Number(options.prefixLength || 12);
  return {
    peer_id: peer && peer.peer_id ? peer.peer_id : '',
    shared_key_env: peer && peer.shared_key_env ? peer.shared_key_env : '',
    shared_key_file_configured: Boolean(peer && peer.shared_key_file),
    key_loaded: Boolean(sharedKey),
    key_fingerprint_prefix: sharedKey
      ? sha256Hex(`agents-p2p-shared-key-fingerprint-v1\n${sharedKey}`).slice(0, Math.max(4, Math.min(prefixLength, 32)))
      : '',
  };
}

function validateTaskEnvelope(task, config, peer, direction = 'inbound') {
  const errors = [];
  const publicSet = new Set(loadPublicCapabilities());
  const allowedCaps = new Set(getPeerCapabilities(config, peer));
  const localId = config.local_node.node_id;

  if (!task || typeof task !== 'object' || Array.isArray(task)) return ['task body must be an object.'];
  for (const key of Object.keys(task)) {
    if (blockedPayloadKeys.has(key)) errors.push(`task contains forbidden field: ${key}`);
    else if (!allowedTaskKeys.has(key)) errors.push(`task contains unsupported field: ${key}`);
  }
  for (const field of ['protocol_version', 'message_id', 'task_id', 'from_node', 'to_node', 'capability', 'mode', 'objective']) {
    if (!task[field] || typeof task[field] !== 'string') errors.push(`${field} is required and must be a string.`);
  }
  if (task.protocol_version && task.protocol_version !== protocolVersion) errors.push(`protocol_version must be ${protocolVersion}.`);
  if (task.mode && !allowedModes.has(task.mode)) errors.push(`mode is not allowed: ${task.mode}`);
  if (task.capability && !publicSet.has(task.capability)) errors.push(`capability is not public: ${task.capability}`);
  if (task.capability && !allowedCaps.has(task.capability)) errors.push(`capability is not allowed for this peer: ${task.capability}`);

  if (direction === 'inbound') {
    if (task.from_node !== peer.peer_id) errors.push('from_node must match authenticated peer.');
    if (task.to_node !== localId) errors.push('to_node must match local node_id.');
  } else {
    if (task.from_node !== localId) errors.push('from_node must match local node_id.');
    if (task.to_node !== peer.peer_id) errors.push('to_node must match target peer_id.');
  }

  for (const field of ['constraints', 'expected_output']) {
    if (!Array.isArray(task[field])) {
      errors.push(`${field} must be an array.`);
      continue;
    }
    if (task[field].length > 20) errors.push(`${field} must contain at most 20 items.`);
    for (const item of task[field]) {
      if (typeof item !== 'string' || item.length > 80) errors.push(`${field} items must be strings up to 80 characters.`);
    }
  }

  if (!task.payload || typeof task.payload !== 'object' || Array.isArray(task.payload)) {
    errors.push('payload must be an object.');
  } else {
    const text = task.payload.text;
    if (text !== undefined && (typeof text !== 'string' || text.length > 20000)) errors.push('payload.text must be a string up to 20000 characters.');
    for (const key of Object.keys(task.payload)) {
      if (blockedPayloadKeys.has(key)) errors.push(`payload contains forbidden field: ${key}`);
      else if (!allowedPayloadKeys.has(key)) errors.push(`payload contains unsupported field: ${key}`);
    }
  }

  if (task.reply_policy !== undefined) {
    if (!task.reply_policy || typeof task.reply_policy !== 'object' || Array.isArray(task.reply_policy)) {
      errors.push('reply_policy must be an object.');
    } else {
      for (const key of Object.keys(task.reply_policy)) {
        if (blockedPayloadKeys.has(key)) errors.push(`reply_policy contains forbidden field: ${key}`);
        else if (!allowedReplyPolicyKeys.has(key)) errors.push(`reply_policy contains unsupported field: ${key}`);
      }
      if (task.reply_policy.max_wait_seconds !== undefined) {
        const wait = Number(task.reply_policy.max_wait_seconds);
        if (!Number.isInteger(wait) || wait < 0 || wait > 3600) errors.push('reply_policy.max_wait_seconds must be an integer from 0 to 3600.');
      }
      if (task.reply_policy.receipt_only !== undefined && typeof task.reply_policy.receipt_only !== 'boolean') {
        errors.push('reply_policy.receipt_only must be a boolean.');
      }
    }
  }

  if (task.trace !== undefined) {
    if (!task.trace || typeof task.trace !== 'object' || Array.isArray(task.trace)) {
      errors.push('trace must be an object.');
    } else {
      for (const key of Object.keys(task.trace)) {
        if (blockedPayloadKeys.has(key)) errors.push(`trace contains forbidden field: ${key}`);
        if (!allowedTraceKeys.has(key)) errors.push(`trace contains unsupported field: ${key}`);
        if (typeof task.trace[key] !== 'string' || task.trace[key].length > 160) errors.push(`trace.${key} must be a string up to 160 characters.`);
      }
    }
  }

  return errors;
}

function filterTaskForStorage(task, headers = {}) {
  const trace = task.trace && typeof task.trace === 'object' ? task.trace : {};
  return {
    protocol_version: task.protocol_version,
    message_id: task.message_id,
    remote_task_id: task.task_id,
    from_node: task.from_node,
    to_node: task.to_node,
    capability: task.capability,
    mode: task.mode,
    objective: task.objective,
    constraints: Array.isArray(task.constraints) ? task.constraints : [],
    expected_output: Array.isArray(task.expected_output) ? task.expected_output : [],
    payload: { text: task.payload && typeof task.payload.text === 'string' ? task.payload.text : '' },
    reply_policy: task.reply_policy && typeof task.reply_policy === 'object'
      ? { max_wait_seconds: Number(task.reply_policy.max_wait_seconds) || 0, receipt_only: task.reply_policy.receipt_only !== false }
      : { max_wait_seconds: 0, receipt_only: true },
    trace: {
      conversation_id: typeof trace.conversation_id === 'string' ? trace.conversation_id : '',
      source: typeof trace.source === 'string' ? trace.source : '',
      reply_to_task_id: typeof trace.reply_to_task_id === 'string' ? trace.reply_to_task_id : '',
      reply_to_message_id: typeof trace.reply_to_message_id === 'string' ? trace.reply_to_message_id : '',
      reply_to_inbox_record_id: typeof trace.reply_to_inbox_record_id === 'string' ? trace.reply_to_inbox_record_id : '',
    },
    auth: {
      node_id: headers.nodeId || '',
      peer_id: headers.peerId || '',
      timestamp: headers.timestamp || '',
      nonce_hash: headers.nonce ? sha256Hex(headers.nonce) : '',
    },
  };
}

function buildReceipt(task, status = 'accepted_recorded') {
  return {
    ok: true,
    status,
    protocol_version: protocolVersion,
    task_id: task.task_id,
    receipt_id: randomId('receipt'),
    capability: task.capability,
    accepted_at: new Date().toISOString(),
    next_action: 'Recorded in local inbox. Local owner must review before execution.',
    result: {
      final_summary: 'Task accepted as a record-only request.',
      structured_finding: [],
      verification_note: 'No local execution was triggered.',
      next_action: 'Wait for the receiver to review the inbox record.',
    },
  };
}

function filteredError(code, message, status = 'rejected_filtered') {
  return { ok: false, status, error: { code, message } };
}

async function ensureStateDirs(stateRoot) {
  for (const dir of ['inbox', 'outbox', 'receipts', 'nonce-cache', 'logs', 'work', 'locks', 'auto', 'conversations']) {
    await fsp.mkdir(path.join(stateRoot, dir), { recursive: true });
  }
}

async function writeDatedRecord(stateRoot, bucket, data) {
  const id = randomId(bucket.replace(/s$/, ''));
  const filePath = path.join(stateRoot, bucket, dateSegment(), `${id}.json`);
  await writeJsonFile(filePath, { local_record_id: id, ...data });
  return { id, filePath };
}

async function readJsonFileIfExists(filePath, fallback = null) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
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

function conversationHash(conversationId) {
  return sha256Hex(String(conversationId || '')).slice(0, 40);
}

function getConversationFilePath(stateRoot, conversationId) {
  return path.join(stateRoot, 'conversations', `${conversationHash(conversationId)}.json`);
}

function getTaskConversationId(task) {
  const trace = task && task.trace && typeof task.trace === 'object' ? task.trace : {};
  return String(trace.conversation_id || task.task_id || task.remote_task_id || randomId('conversation')).slice(0, 160);
}

function summarizeTaskForConversation(task) {
  const safeTask = task && typeof task === 'object' ? task : {};
  const trace = safeTask.trace && typeof safeTask.trace === 'object' ? safeTask.trace : {};
  const payload = safeTask.payload && typeof safeTask.payload === 'object' ? safeTask.payload : {};
  return {
    protocol_version: safeTask.protocol_version || '',
    message_id: safeTask.message_id || '',
    task_id: safeTask.task_id || safeTask.remote_task_id || '',
    from_node: safeTask.from_node || '',
    to_node: safeTask.to_node || '',
    capability: safeTask.capability || '',
    mode: safeTask.mode || '',
    objective: truncateText(safeTask.objective || '', 500),
    payload_text: truncateText(payload.text || '', 8000),
    trace: {
      conversation_id: trace.conversation_id || '',
      source: trace.source || '',
      reply_to_task_id: trace.reply_to_task_id || '',
      reply_to_message_id: trace.reply_to_message_id || '',
      reply_to_inbox_record_id: trace.reply_to_inbox_record_id || '',
    },
  };
}

function buildConversationEvent(kind, taskId, data = {}) {
  const event = {
    event_id: '',
    kind,
    task_id: taskId || '',
    recorded_at: new Date().toISOString(),
    ...data,
  };
  event.event_id = sha256Hex([
    kind,
    event.task_id,
    event.stage || '',
    event.inbox_record_id || '',
    event.outbox_record_id || '',
    event.receipt_id || '',
    event.recorded_at,
  ].join('\n'));
  return event;
}

async function acquireRuntimeLock(stateRoot, lockName, ttlSeconds = 30) {
  const lockPath = path.join(stateRoot, 'locks', `${sha256Hex(lockName)}.lock`);
  await fsp.mkdir(path.dirname(lockPath), { recursive: true });
  const payload = `${JSON.stringify({ lock: lockName, pid: process.pid, created_at: new Date().toISOString() })}\n`;
  try {
    await fsp.writeFile(lockPath, payload, { flag: 'wx' });
    return async () => { await fsp.rm(lockPath, { force: true }); };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let stale = false;
    try {
      const stat = await fsp.stat(lockPath);
      stale = Date.now() - stat.mtimeMs > ttlSeconds * 1000;
    } catch {
      stale = true;
    }
    if (!stale) throw new Error(`runtime lock is busy: ${lockName}`);
    await fsp.rm(lockPath, { force: true });
    await fsp.writeFile(lockPath, payload, { flag: 'wx' });
    return async () => { await fsp.rm(lockPath, { force: true }); };
  }
}

function shouldReplaceStatus(currentStatus, nextStatus) {
  if (!nextStatus) return false;
  if (!currentStatus) return true;
  const currentRank = conversationStatusRank.has(currentStatus) ? conversationStatusRank.get(currentStatus) : 0;
  const nextRank = conversationStatusRank.has(nextStatus) ? conversationStatusRank.get(nextStatus) : currentRank;
  return nextRank >= currentRank;
}

function mergeStringArray(left = [], right = []) {
  return [...new Set([...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])].filter(Boolean))];
}

function mergeConversationPatch(current, patch) {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value === undefined || key === 'events') continue;
    if (key === 'status') {
      if (shouldReplaceStatus(next.status, value)) next.status = value;
      continue;
    }
    if (Array.isArray(value)) {
      next[key] = mergeStringArray(next[key], value);
      continue;
    }
    if (value && typeof value === 'object') {
      next[key] = { ...(next[key] && typeof next[key] === 'object' ? next[key] : {}), ...value };
      continue;
    }
    if (value !== '' || next[key] === undefined || next[key] === '') {
      next[key] = value;
    }
  }
  return next;
}

function appendConversationEvent(conversation, event) {
  if (!event) return conversation;
  const existing = Array.isArray(conversation.events) ? conversation.events : [];
  const seen = new Set(existing.map((item) => item.event_id).filter(Boolean));
  if (!event.event_id || !seen.has(event.event_id)) {
    conversation.events = [...existing, event].slice(-500);
  } else {
    conversation.events = existing;
  }
  return conversation;
}

async function upsertConversation(stateRoot, conversationId, patch = {}, event = null, options = {}) {
  const id = String(conversationId || randomId('conversation')).slice(0, 160);
  await ensureStateDirs(stateRoot);
  const release = await acquireRuntimeLock(stateRoot, `conversation:${id}`, Number(options.lockTtlSeconds || 30));
  try {
    const filePath = getConversationFilePath(stateRoot, id);
    const now = new Date().toISOString();
    const current = await readJsonFileIfExists(filePath, {
      schema_version: 1,
      conversation_id: id,
      status: '',
      created_at: now,
      updated_at: now,
      events: [],
    });
    let next = mergeConversationPatch(current, { ...patch, conversation_id: current.conversation_id || id, updated_at: now });
    next = appendConversationEvent(next, event);
    next.updated_at = now;
    await writeJsonFile(filePath, next);
    return { conversation: next, filePath };
  } finally {
    await release();
  }
}

async function loadConversationRecords(stateRoot) {
  const files = await walkJsonFiles(path.join(stateRoot, 'conversations'));
  const records = [];
  for (const file of files) {
    try {
      records.push({ ...(await readJsonFileIfExists(file, {})), _file: file });
    } catch {
      // Ignore broken runtime records in read-only summaries.
    }
  }
  records.sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
  return records;
}

async function findConversationByTaskId(stateRoot, taskId) {
  if (!taskId) return null;
  const records = await loadConversationRecords(stateRoot);
  return records.find((record) => {
    if (record.original_task_id === taskId || record.reply_to_task_id === taskId) return true;
    if (Array.isArray(record.task_ids) && record.task_ids.includes(taskId)) return true;
    if (record.last_task && record.last_task.task_id === taskId) return true;
    if (record.last_reply && record.last_reply.task_id === taskId) return true;
    return false;
  }) || null;
}

async function findRecentConversationCandidate(stateRoot, { peerId = '', capability = '', maxAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  const records = await loadConversationRecords(stateRoot);
  const now = Date.now();
  return records.find((record) => {
    const updated = Date.parse(record.updated_at || record.created_at || '');
    if (Number.isNaN(updated) || now - updated > maxAgeMs) return false;
    if (peerId && record.peer_id !== peerId) return false;
    if (capability && record.capability !== capability) return false;
    return ['pending', 'sent', 'poll_failed', 'receipt_seen'].includes(record.status);
  }) || null;
}

async function countJsonFiles(rootDir, limit = Number.POSITIVE_INFINITY) {
  const stack = [rootDir];
  let count = 0;
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
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        count += 1;
        if (count >= limit) return count;
      }
    }
  }
  return count;
}

async function countInboxRecordsForPeer(stateRoot, peerId, limit = Number.POSITIVE_INFINITY) {
  const stack = [path.join(stateRoot, 'inbox')];
  let count = 0;
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
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const record = JSON.parse(await fsp.readFile(fullPath, 'utf8'));
        if (record.peer_id === peerId) {
          count += 1;
          if (count >= limit) return count;
        }
      } catch {
        // Ignore broken runtime records when enforcing a conservative count.
      }
    }
  }
  return count;
}

async function checkInboxQuota(stateRoot, peerId, security) {
  const peerLimit = Number(security.max_peer_pending_inbox);
  const globalLimit = Number(security.max_global_pending_inbox);
  const inboxRoot = path.join(stateRoot, 'inbox');
  const globalCount = await countJsonFiles(inboxRoot, globalLimit);
  if (globalCount >= globalLimit) {
    return { ok: false, code: 'inbox_quota_exceeded', message: 'Global inbox quota has been reached.' };
  }
  const peerCount = await countInboxRecordsForPeer(stateRoot, peerId, peerLimit);
  if (peerCount >= peerLimit) {
    return { ok: false, code: 'inbox_quota_exceeded', message: 'Peer inbox quota has been reached.' };
  }
  return { ok: true };
}

async function registerRateLimitEvent(stateRoot, peerId, security) {
  const limit = Number(security.max_requests_per_minute);
  const now = new Date();
  const minute = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const bucket = path.join(stateRoot, 'logs', 'rate-limit', peerId, minute);
  await fsp.mkdir(bucket, { recursive: true });
  const entries = await fsp.readdir(bucket).catch(() => []);
  const count = entries.filter((entry) => entry.endsWith('.json')).length;
  if (count >= limit) {
    return { ok: false, code: 'rate_limited', message: 'Peer request rate limit has been reached.' };
  }
  await writeJsonFile(path.join(bucket, `${randomId('request')}.json`), {
    peer_id: peerId,
    recorded_at: now.toISOString(),
    minute,
  });
  return { ok: true };
}

async function nonceExists(stateRoot, peerId, nonce) {
  const filePath = path.join(stateRoot, 'nonce-cache', peerId, `${sha256Hex(nonce)}.json`);
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function storeNonce(stateRoot, peerId, nonce, ttlSeconds) {
  const filePath = path.join(stateRoot, 'nonce-cache', peerId, `${sha256Hex(nonce)}.json`);
  const now = Date.now();
  await writeJsonFile(filePath, {
    peer_id: peerId,
    nonce_hash: sha256Hex(nonce),
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttlSeconds * 1000).toISOString(),
  });
}

async function claimNonce(stateRoot, peerId, nonce, ttlSeconds) {
  const filePath = path.join(stateRoot, 'nonce-cache', peerId, `${sha256Hex(nonce)}.json`);
  const now = Date.now();
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fsp.writeFile(filePath, `${JSON.stringify({
      peer_id: peerId,
      nonce_hash: sha256Hex(nonce),
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + ttlSeconds * 1000).toISOString(),
    }, null, 2)}\n`, { flag: 'wx' });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

function checkTimestamp(timestamp, skewSeconds) {
  const parsed = Date.parse(timestamp);
  return !Number.isNaN(parsed) && Math.abs(Date.now() - parsed) <= skewSeconds * 1000;
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const length = Number(req.headers['content-length'] || 0);
    if (length > limitBytes) {
      reject(Object.assign(new Error('request_too_large'), { code: 'request_too_large' }));
      req.destroy();
      return;
    }
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(Object.assign(new Error('request_too_large'), { code: 'request_too_large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function normalizeRequestOptions(timeoutOrOptions) {
  if (timeoutOrOptions && typeof timeoutOrOptions === 'object') {
    return {
      timeoutMs: Number(timeoutOrOptions.timeoutMs || timeoutOrOptions.timeout || 15000),
      localAddress: timeoutOrOptions.localAddress || '',
    };
  }
  return { timeoutMs: Number(timeoutOrOptions || 15000), localAddress: '' };
}

function requestJson(method, targetUrl, body, headers = {}, timeoutOrOptions = 15000) {
  return new Promise((resolve, reject) => {
    const options = normalizeRequestOptions(timeoutOrOptions);
    const url = new URL(targetUrl);
    const rawBody = body ? JSON.stringify(body) : '';
    const req = http.request({
      method,
      hostname: url.hostname,
      port: url.port || 80,
      path: `${url.pathname}${url.search}`,
      timeout: options.timeoutMs,
      ...(options.localAddress ? { localAddress: options.localAddress } : {}),
      headers: {
        Accept: 'application/json',
        ...(rawBody ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(rawBody) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = { raw: text };
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          localAddress: req.socket ? req.socket.localAddress : '',
          localPort: req.socket ? req.socket.localPort : 0,
          remoteAddress: req.socket ? req.socket.remoteAddress : '',
          remotePort: req.socket ? req.socket.remotePort : 0,
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`request timeout: ${targetUrl}`)));
    req.on('error', reject);
    if (rawBody) req.write(rawBody);
    req.end();
  });
}

function checkPortAvailable(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error) => resolve({ ok: false, error: error.message }));
    server.once('listening', () => server.close(() => resolve({ ok: true })));
    server.listen(port, host);
  });
}

function respondJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

module.exports = {
  agentsRoot,
  defaultConfigPath,
  defaultStateRoot,
  protocolVersion,
  allowedModes,
  parseArgs,
  readJsonFile,
  writeJsonFile,
  readJsonFileIfExists,
  toRepoPath,
  sha256Hex,
  signRequest,
  buildSigningString,
  constantTimeEqualHex,
  randomId,
  dateSegment,
  truncateText,
  redactSensitiveText,
  summarizePeerResponse,
  loadPublicCapabilities,
  normalizeConfig,
  validateConfig,
  findPeer,
  getPeerSharedKey,
  getPeerSharedKeyStatus,
  getPeerCapabilities,
  validateTaskEnvelope,
  filterTaskForStorage,
  buildReceipt,
  filteredError,
  ensureStateDirs,
  writeDatedRecord,
  walkJsonFiles,
  getTaskConversationId,
  summarizeTaskForConversation,
  buildConversationEvent,
  upsertConversation,
  loadConversationRecords,
  findConversationByTaskId,
  findRecentConversationCandidate,
  checkInboxQuota,
  registerRateLimitEvent,
  nonceExists,
  storeNonce,
  claimNonce,
  checkTimestamp,
  readBody,
  requestJson,
  checkPortAvailable,
  respondJson,
};
