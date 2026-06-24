# P2P Peer Onboarding Card

> Audience: the colleague's local agent. Read this file first when a human says they want to connect to another trusted agent over LAN P2P.
> Goal: prepare the local peer safely, generate the minimum information the human must send to the owner, then run smoke tests after the owner shares peer details and a shared key privately.

## 1. What This Enables

This starter includes a small LAN P2P transport:

```text
your local agent node  <--- HTTP + HMAC, record-only --->  trusted peer agent node
```

It is for occasional trusted collaboration:

- agent framework design consultation
- functional test plan review
- bug summary and report drafting
- read-only information consultation when the receiving owner has allowed local handlers

It is not remote execution. A peer cannot ask this machine to run shell commands, SQL, local file paths, MCP tools, service control, credential access, or external writes.

## 2. Safety Rules

Always follow these rules:

1. Do not put real shared keys in Git, chat logs, screenshots, or public documents.
2. Do not commit `runtime/local-secrets/` or `runtime/state/`.
3. Use one shared key per peer pair.
4. Use only `http://<lan-ip>:8788` style LAN URLs for this v0.1 transport.
5. Send only the onboarding information in section 5 to the owner.
6. The owner must share the key through a private channel, not in the public repository.

## 3. Files You May Use

Public files:

```text
templates/mesh-p2p-peer.example.json
templates/mesh-p2p-task.sample.json
templates/mesh-p2p-receipt.sample.json
scripts/mesh/p2p-readiness.js
scripts/mesh/p2p-doctor.js
scripts/mesh/p2p-server.js
scripts/mesh/p2p-send.js
scripts/mesh/p2p-inbox.js
scripts/mesh/p2p-poller.js
```

Local-only files you may create:

```text
runtime/local-secrets/mesh-p2p/peers.json
runtime/state/mesh-p2p/
```

## 4. Prepare Local Config

Run from the repository root.

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path .\runtime\local-secrets\mesh-p2p | Out-Null
Copy-Item .\templates\mesh-p2p-peer.example.json .\runtime\local-secrets\mesh-p2p\peers.json
```

macOS / Linux:

```bash
mkdir -p runtime/local-secrets/mesh-p2p
cp templates/mesh-p2p-peer.example.json runtime/local-secrets/mesh-p2p/peers.json
```

Edit `runtime/local-secrets/mesh-p2p/peers.json`:

```json
{
  "local_node": {
    "node_id": "<your-node-id>",
    "display_name": "<your-display-name>",
    "listen_host": "0.0.0.0",
    "listen_port": 8788,
    "public_base_url": "http://<your-lan-ip>:8788"
  },
  "peers": [
    {
      "peer_id": "<owner-node-id>",
      "display_name": "<owner-display-name>",
      "base_url": "http://<owner-lan-ip>:8788",
      "shared_key_env": "MESH_P2P_KEY_<PAIR_ALIAS>",
      "allowed_capabilities": [
        "readonly_diagnosis",
        "test_plan_review",
        "test_data_suggestion",
        "bug_summary",
        "report_drafting",
        "route_review"
      ],
      "allow_inbound": true,
      "allow_outbound": true
    }
  ]
}
```

Before the owner replies, leave unknown owner fields as placeholders. Your first job is to generate section 5.

## 5. Generate This Message For The Owner

Ask the human to send only this block to the owner:

```text
P2P trusted peer onboarding request

my_node_id:
my_display_name:
my_os:
my_lan_ip:
my_listen_port: 8788
my_public_base_url: http://<my-lan-ip>:8788
requested_capabilities:
  - readonly_diagnosis
  - test_plan_review
  - test_data_suggestion
  - bug_summary
  - report_drafting
  - route_review
can_receive_reply_on_8788: yes/no
notes:
  - I will keep runtime/local-secrets and runtime/state local-only.
  - Please send owner_node_id, owner_base_url, shared_key_env name, and the shared key through a private channel.
```

Do not include a shared key in this message.

## 6. After The Owner Replies

The owner should give the human, through a private channel:

```text
owner_node_id:
owner_base_url:
shared_key_env:
shared_key_value:
```

Update `runtime/local-secrets/mesh-p2p/peers.json` with `owner_node_id`, `owner_base_url`, and `shared_key_env`.

Set the shared key only in the local shell.

Windows PowerShell:

```powershell
$env:MESH_P2P_KEY_<PAIR_ALIAS> = '<shared-key-value>'
```

macOS / Linux:

```bash
export MESH_P2P_KEY_<PAIR_ALIAS>='<shared-key-value>'
```

## 7. Readiness Check

Windows PowerShell:

```powershell
node .\scripts\mesh\p2p-readiness.js --config .\runtime\local-secrets\mesh-p2p\peers.json --create-state
```

macOS / Linux:

```bash
node scripts/mesh/p2p-readiness.js --config runtime/local-secrets/mesh-p2p/peers.json --create-state
```

If readiness fails, fix local config before contacting the owner again.

## 8. Start Local Listener

Start the receiver so the owner can reply.

Windows PowerShell:

```powershell
node .\scripts\mesh\p2p-server.js --config .\runtime\local-secrets\mesh-p2p\peers.json --host 0.0.0.0 --port 8788
```

macOS / Linux:

```bash
node scripts/mesh/p2p-server.js --config runtime/local-secrets/mesh-p2p/peers.json --host 0.0.0.0 --port 8788
```

For first setup, keep this terminal open. Do not install a background service yet.

## 9. Doctor Check

In another terminal:

Windows PowerShell:

```powershell
node .\scripts\mesh\p2p-doctor.js --config .\runtime\local-secrets\mesh-p2p\peers.json --peer <owner-node-id>
```

macOS / Linux:

```bash
node scripts/mesh/p2p-doctor.js --config runtime/local-secrets/mesh-p2p/peers.json --peer <owner-node-id>
```

If the machine has VPN or multiple network adapters, prefer the physical LAN address:

```bash
node scripts/mesh/p2p-doctor.js --config runtime/local-secrets/mesh-p2p/peers.json --peer <owner-node-id> --local-address <your-lan-ip>
```

## 10. Send Smoke Request

```bash
node scripts/mesh/p2p-send.js --config runtime/local-secrets/mesh-p2p/peers.json --peer <owner-node-id> --capability route_review --text "P2P onboarding smoke from <your-node-id>. Please reply with one safe sentence."
```

Expected result:

```text
status_code: 202
status: accepted_recorded
```

If it returns `capability_not_allowed`, ask the owner to add the same capability for your `peer_id`.

## 11. Check Replies

If your listener is running, owner replies will appear in:

```text
runtime/state/mesh-p2p/inbox/
```

Use:

```bash
node scripts/mesh/p2p-inbox.js list --config runtime/local-secrets/mesh-p2p/peers.json --state-root runtime/state/mesh-p2p
```

Optional polling:

```bash
node scripts/mesh/p2p-poller.js --once --config runtime/local-secrets/mesh-p2p/peers.json --state-root runtime/state/mesh-p2p
```

## 12. Human Summary

After finishing, tell the human:

```text
P2P setup result:
- readiness:
- owner doctor:
- smoke send:
- local listener:
- latest inbox reply:
- unresolved issue:
```

Keep secrets out of the summary.
