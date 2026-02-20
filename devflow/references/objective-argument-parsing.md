# Objective Argument Parsing

Parse and normalize objective arguments for commands that operate on objectives.

## Extraction

From `$ARGUMENTS`:
- Extract objective number (first numeric argument)
- Extract flags (prefixed with `--`)
- Remaining text is description (for insert/add commands)

## Using df-tools

The `find-objective` command handles normalization and validation in one step:

```bash
PHASE_INFO=$(node ~/.claude/devflow/bin/df-tools.cjs find-objective "${OBJECTIVE}")
```

Returns JSON with:
- `found`: true/false
- `directory`: Full path to objective directory
- `phase_number`: Normalized number (e.g., "06", "06.1")
- `phase_name`: Name portion (e.g., "foundation")
- `plans`: Array of JOB.md files
- `summaries`: Array of SUMMARY.md files

## Manual Normalization (Legacy)

Zero-pad integer objectives to 2 digits. Preserve decimal suffixes.

```bash
# Normalize objective number
if [[ "$OBJECTIVE" =~ ^[0-9]+$ ]]; then
  # Integer: 8 → 08
  OBJECTIVE=$(printf "%02d" "$OBJECTIVE")
elif [[ "$OBJECTIVE" =~ ^([0-9]+)\.([0-9]+)$ ]]; then
  # Decimal: 2.1 → 02.1
  OBJECTIVE=$(printf "%02d.%s" "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}")
fi
```

## Validation

Use `roadmap get-objective` to validate objective exists:

```bash
PHASE_CHECK=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap get-objective "${OBJECTIVE}")
if [ "$(echo "$PHASE_CHECK" | jq -r '.found')" = "false" ]; then
  echo "ERROR: Objective ${OBJECTIVE} not found in roadmap"
  exit 1
fi
```

## Directory Lookup

Use `find-objective` for directory lookup:

```bash
PHASE_DIR=$(node ~/.claude/devflow/bin/df-tools.cjs find-objective "${OBJECTIVE}" --raw)
```
