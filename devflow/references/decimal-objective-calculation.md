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
  "base_objective": "06",
  "next": "06.1",
  "existing": []
}
```

With existing decimals:
```json
{
  "found": true,
  "base_objective": "06",
  "next": "06.3",
  "existing": ["06.1", "06.2"]
}
```

## Extract Values

```bash
DECIMAL_INFO=$(node ~/.claude/devflow/bin/df-tools.cjs objective next-decimal "${AFTER_OBJECTIVE}")
DECIMAL_OBJECTIVE=$(echo "$DECIMAL_INFO" | jq -r '.next')
BASE_OBJECTIVE=$(echo "$DECIMAL_INFO" | jq -r '.base_objective')
```

Or with --raw flag:
```bash
DECIMAL_OBJECTIVE=$(node ~/.claude/devflow/bin/df-tools.cjs objective next-decimal "${AFTER_OBJECTIVE}" --raw)
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
OBJECTIVE_DIR=".planning/objectives/${DECIMAL_OBJECTIVE}-${SLUG}"
mkdir -p "$OBJECTIVE_DIR"
```

Example: `.planning/objectives/06.1-fix-critical-auth-bug/`
