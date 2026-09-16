---
name: zentao-bug
description: Use a ZenTao-style issue tracker workflow for creating, updating, verifying, activating, and closing defects with structured evidence. Keep account credentials and real project mappings outside the shared repository.
---

# ZenTao Bug Lifecycle Skill

Use this skill when a SOP reaches the "needs development fix" branch and a defect or task must be tracked in an issue system.

## Public-Safe Rules

- Do not store usernames, passwords, cookies, tokens, real project IDs, or internal URLs in the shared repository.
- Write defect content with three primary sections: steps, actual result, expected result.
- Keep root-cause analysis separate from directly observed evidence unless it is already confirmed.
- After creating or updating an issue, read it back and verify title, status, assignee, description, and attachments if used.

## Generic Flow

1. Confirm the issue is not a usage explanation, external factor, or new requirement.
2. Draft title as `[module] symptom`.
3. Draft body with steps, actual result, and expected result.
4. Add concise evidence and reproduction data.
5. Create or update the issue through the local private tool.
6. Read back the issue and continue verification until closed or returned.
