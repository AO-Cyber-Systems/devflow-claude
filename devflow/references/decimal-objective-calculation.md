# Decimal Objective Calculation

Calculate the next decimal objective number for urgent insertions.

## Using df-tools

```bash
# Get next decimal objective after objective 6
node ~/.claude/devflow/bin/df-tools.cjs objective next-decimal 6
```

Output:
```json
{
  "found": true,
  "base_phase": "06",
  "next": "06.1",
  "existing": []
}
```

With existing decimals:
```json
{
  "found": true,
  "base_phase": "06",
  "next": "06.3",
  "existing": ["06.1", "06.2"]
}
```

## Extract Values

```bash
DECIMAL_INFO=$(node ~/.claude/devflow/bin/df-tools.cjs objective next-decimal "${AFTER_PHASE}")
DECIMAL_PHASE=$(echo "$DECIMAL_INFO" | jq -r '.next')
BASE_PHASE=$(echo "$DECIMAL_INFO" | jq -r '.base_phase')
```

Or with --raw flag:
```bash
DECIMAL_PHASE=$(node ~/.claude/devflow/bin/df-tools.cjs objective next-decimal "${AFTER_PHASE}" --raw)
# Returns just: 06.1
```

## Examples

| Existing Objectives | Next Objective |
|-----------------|------------|
| 06 only | 06.1 |
| 06, 06.1 | 06.2 |
| 06, 06.1, 06.2 | 06.3 |
| 06, 06.1, 06.3 (gap) | 06.4 |

## Directory Naming

Decimal objective directories use the full decimal number:

```bash
SLUG=$(node ~/.claude/devflow/bin/df-tools.cjs generate-slug "$DESCRIPTION" --raw)
PHASE_DIR=".planning/objectives/${DECIMAL_PHASE}-${SLUG}"
mkdir -p "$OBJECTIVE_DIR"
```

Example: `.planning/objectives/06.1-fix-critical-auth-bug/`
