# Mesh

This directory contains public-safe peer collaboration notes and scripts.

Current public scope:

| File | Purpose |
|------|---------|
| `p2p-peer-onboarding-card.md` | Minimal instructions for a colleague's local agent to prepare LAN P2P trusted peer onboarding |

Operational baseline:

- `/health` only proves that the peer listener is alive.
- `scripts/mesh/p2p-doctor.js --signed` is the required HMAC readiness check.
- On Windows, use `scripts/mesh/restart-windows-p2p.ps1` after changing local HMAC values so the running listener reloads them and performs a signed self-check.

Local-only runtime configuration:

```text
runtime/local-secrets/mesh-p2p/peers.json
runtime/state/mesh-p2p/
```

Do not commit shared keys, real peer details, local runtime state, or private logs.
