# TRD 01-05: route-results.js — Result-injection Hook

type: tdd
status: pending

## Behaviour list

1. Returns silently (no output) when no `.devflow-handoff/done/` directory exists in cwd or any parent.
2. Returns silently when `done/` is empty.
3. Returns silently when all done records have `consumed: true`.
4. With one unconsumed record, emits `{ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: <text> } }`.
5. The injected text includes the cmd, exit_code, stdout, stderr, and the handoff id.
6. After emission, the consumed record on disk has `consumed: true`.
7. Multiple unconsumed records are concatenated in `completed_at` order.
8. Records with `status: rejected` produce a clear "the daemon refused this command because…" message that prompts Claude not to retry.
9. Records with `status: timeout` produce a "command exceeded timeout" message.
10. Reads from the closest ancestor `.devflow-handoff` directory (mirrors `route-intent.js` behaviour).
11. Records older than `DEVFLOW_HANDOFF_RESULT_TTL_MS` (default 1 hour) are skipped.
12. Malformed JSON in done/ is skipped (not crashed on).

## Fixtures

- `seedDoneRecord(dir, { overrides })` writes a known-shape done record.
- `runHook(payload, cwd)` spawns `route-results.js` and returns parsed stdout.

## Files

- src: `plugins/devflow/hooks/route-results.js`
- test: `plugins/devflow/hooks/route-results.test.js`
- registration: add to `hooks.json` UserPromptSubmit (after `route-intent.js`)
