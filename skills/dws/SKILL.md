---
name: dws
description: Use a DingTalk/DWS-style collaboration CLI for public-safe workflows such as AI table updates, group-visible status sync, todo creation, and readback checks. Keep credentials and real IDs outside the shared repository.
---

# DWS Collaboration Tool Skill

Use this skill when a SOP needs to read or update a collaboration surface such as an AI table, todo list, group message, or team status board.

## Safety Boundary

- Store tokens, app keys, user IDs, table IDs, group IDs, and webhook URLs only in local secrets.
- Prefer dry-run for write actions until the target, fields, and impact are clear.
- After any external write, read back the changed record or message and report the final state.
- If authentication or readback fails, do not claim the operation succeeded.

## Generic Flow

1. Identify the target surface and operation type.
2. Validate required IDs and field names from local private config.
3. Prepare payload with placeholder-free user content.
4. Run dry-run when supported.
5. Execute only after the caller confirms the target and impact.
6. Read back the result and summarize evidence, risk, and next step.
