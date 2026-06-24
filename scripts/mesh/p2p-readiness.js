#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {
  agentsRoot,
  defaultConfigPath,
  defaultStateRoot,
  parseArgs,
  readJsonFile,
  validateConfig,
  ensureStateDirs,
  checkPortAvailable,
  loadPublicCapabilities,
  toRepoPath,
} = require('./p2p-common');

function addCheck(checks, name, ok, detail) {
  checks.push({ name, ok, detail });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(args.config || defaultConfigPath);
  const stateRoot = path.resolve(args['state-root'] || defaultStateRoot);
  const checks = [];
  let config = null;

  try {
    config = readJsonFile(configPath);
    addCheck(checks, 'config_json', true, toRepoPath(configPath));
  } catch (error) {
    addCheck(checks, 'config_json', false, error.message);
  }

  if (config) {
    const validation = validateConfig(config, { requireKeys: !args['allow-missing-keys'] });
    addCheck(checks, 'config_schema', validation.ok, validation.errors.join('; ') || 'OK');
    if (validation.warnings.length > 0) addCheck(checks, 'config_warnings', true, validation.warnings.join('; '));
    addCheck(checks, 'public_capabilities_loaded', validation.publicCapabilities.length > 0, validation.publicCapabilities.join(', '));

    const portCheck = await checkPortAvailable(validation.config.local_node.listen_host || '127.0.0.1', Number(validation.config.local_node.listen_port || 0));
    addCheck(checks, 'listen_port_available', portCheck.ok, portCheck.ok ? 'OK' : portCheck.error);
  } else {
    const caps = loadPublicCapabilities();
    addCheck(checks, 'public_capabilities_loaded', caps.length > 0, caps.join(', '));
  }

  if (args['create-state']) {
    try {
      await ensureStateDirs(stateRoot);
      addCheck(checks, 'state_dirs', true, toRepoPath(stateRoot));
    } catch (error) {
      addCheck(checks, 'state_dirs', false, error.message);
    }
  } else {
    addCheck(checks, 'state_root_exists', fs.existsSync(stateRoot), fs.existsSync(stateRoot) ? toRepoPath(stateRoot) : 'Use --create-state to create runtime state dirs.');
  }

  const ignoreText = [
    path.join(agentsRoot, 'runtime', 'local-secrets', '.gitignore'),
    path.join(agentsRoot, 'runtime', 'state', '.gitignore'),
    path.join(agentsRoot, '.gitignore'),
  ].map((file) => {
    try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
  }).join('\n');
  addCheck(checks, 'gitignore_boundary', /mesh-p2p/.test(ignoreText) && /\*\.json/.test(ignoreText), 'mesh-p2p runtime/local config ignore rules detected');

  const failed = checks.filter((check) => !check.ok);
  process.stdout.write(`${JSON.stringify({
    ok: failed.length === 0,
    checked_at: new Date().toISOString(),
    config: toRepoPath(configPath),
    state_root: toRepoPath(stateRoot),
    checks,
  }, null, 2)}\n`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
  process.exit(1);
});
