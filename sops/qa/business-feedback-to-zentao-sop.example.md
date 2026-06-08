# Business Feedback To Issue Tracker SOP

> Public-safe example SOP.
> Goal: turn a user or business feedback item into the right closure path, and create a tracked issue only when development work is actually needed.

## When To Use

- A business user reports an abnormal behavior.
- A tester reproduces a production-like symptom.
- A feedback board item needs triage, evidence, and status update.

## Flow

1. Capture the symptom, source, time window, and expected behavior.
2. Classify the issue as usage explanation, external factor, product gap, data/config issue, or system defect.
3. Collect the minimum evidence needed for the selected branch.
4. If it is not a system defect, close through explanation, handoff, or product evaluation.
5. If it needs development work, draft a defect with steps, actual result, expected result, and evidence.
6. Create or update the issue through the local private issue-tracker tool.
7. Update the feedback board through the local collaboration tool.
8. Read back both the issue and the board record.
9. After the fix, verify the original scenario and close or return the issue.

## Minimum Output

- Feedback summary.
- Classification and direct evidence.
- Closure path.
- Issue link or placeholder if created.
- Board update status.
- Verification result and next step.

## Safety Notes

- Keep real account credentials, project IDs, table IDs, user IDs, group IDs, and internal URLs in local private config.
- Public SOPs may describe the workflow and field shape, but not real business data or private runtime state.
- Do not create issues automatically when evidence is insufficient.
