---
status: complete
trd: 10-08
objective: 10-flutter-ui-verification-process
completed: 2026-05-24
---

# TRD 10-08 SUMMARY — api-contract.cjs SHA pinning helper

## What shipped

`lib/api-contract.cjs` (~80 lines including the custom parser) exports:

- **`sha256File(filePath, cwd)`** — hex SHA256 string when the file exists, `null` when missing. No exception thrown on missing file.
- **`detectDrift(contract, cwd)`** — accepts `[{path, sha}, ...]` and returns `{drift: [...], ok: boolean}`. Status entries are `MISSING` (path no longer on disk) or `DRIFTED` (current SHA ≠ expected). Empty/undefined contract returns `{drift: [], ok: true}` cleanly.
- **`parseApiContractBlock(rawContent)`** — custom YAML lifter for the `api_contract:` block. Required because `extractFrontmatter` in `frontmatter.cjs` flattens `- key: value` array entries to strings (dropping `sha:`). Documented in `frontmatter.test.cjs` Case 6 as locked behavior of the permissive parser.
- **`cmdVerifyApiContract(cwd, trdPath, raw)`** — df-tools handler. Reads TRD, runs detection, emits `{drift, ok, trd_path}` JSON. **Advisory** — exits 0 always so the verifier (TRD 10-05) can decide loudness without ever blocking on drift.

`df-tools.cjs` registers `verify api-contract <trd-path> [--raw]` and includes it in the help comment + the verify-subcommand-list error message.

## Test coverage

13 tests in `api-contract.test.cjs`, all hand-built fixtures (zero LLM-generated SHAs):

- **A1-A4 (Task 1):** sha256File — match, missing-file, relative-path, absolute-path
- **B1-B6 (Task 2):** detectDrift — empty, undefined, all-match, DRIFTED, MISSING, mixed
- **C1-C3 (Task 2):** df-tools verify api-contract — `--raw` JSON shape, advisory exit 0 on drift, no-block returns ok:true

Fixtures: `__fixtures__/api-contract/stable.txt` (`hello\n` → `5891b5b5...be03`), `__fixtures__/api-contract/drifted.txt` (`world\n` → `7755d31c...7019`).

## Atomic commits

| Hash | Type | Phase |
|------|------|-------|
| `8a1ae34` | test(10-08) | Task 1 RED — sha256File failing tests |
| `76ed297` | feat(10-08) | Task 1 GREEN — sha256File implementation |
| `4db3405` | test(10-08) | Task 2 RED — detectDrift + df-tools failing tests |
| `c1a88a4` | feat(10-08) | Task 2 GREEN — detectDrift + parseApiContractBlock + subcommand wiring |

Two RED→GREEN cycles. Linear history, no squash. RED commits demonstrate failing tests; GREEN commits resolve them.

## Notable deviations

- **`parseApiContractBlock` added** — not in the original TRD task spec. The TRD's pseudocode for `cmdVerifyApiContract` called `extractFrontmatter(content)` and read `fm.api_contract` as a structured array of `{path, sha}` objects. Wave 1 confirmed (frontmatter.test.cjs Case 6) that the permissive parser captures block-array items as flat strings of `"path: value"`, dropping `sha:`. The custom raw-FM scanner sidesteps this without changing the locked parser behavior.
- **Execution required orchestrator takeover** — two consecutive df-executor subagent stalls (600s watchdog) on this TRD. First agent completed Task 1; second agent stalled before any progress. Third attempt (orchestrator with `.skill-active` marker set) completed Task 2 cleanly. No code-quality impact — same atomic-commit cadence, same test discipline.

## Verification

- `npm test`: 2301/2358 pass; 7 failing are pre-existing devflow-watch daemon tests unrelated to api-contract.cjs (none reference api-contract).
- `node --test plugins/devflow/devflow/bin/lib/api-contract.test.cjs`: 13/13 pass.
- Smoke test: `df-tools verify api-contract .planning/objectives/10-flutter-ui-verification-process/10-08-TRD.md --raw` returns `{"drift":[],"ok":true,"trd_path":"..."}` and exits 0.

## Files changed

- `plugins/devflow/devflow/bin/lib/api-contract.cjs` (new, 78 lines)
- `plugins/devflow/devflow/bin/lib/api-contract.test.cjs` (new, 174 lines)
- `plugins/devflow/devflow/bin/lib/__fixtures__/api-contract/stable.txt` (new, 6 bytes)
- `plugins/devflow/devflow/bin/lib/__fixtures__/api-contract/drifted.txt` (new, 6 bytes)
- `plugins/devflow/devflow/bin/df-tools.cjs` (modified — require + subcommand branch + help comment)

## Downstream enablement

TRD 10-05 (verifier extensions) Step 4.5 "API Contract Drift" can now invoke `df-tools verify api-contract <trd-path>` per type:ui TRD and record drift entries in VERIFICATION.md's `drift:` section as advisory. TRD 10-07 (dogfood test) exercises this in Case 3 of its chain assertion.
