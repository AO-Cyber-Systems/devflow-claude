#!/bin/bash
# DevFlow Session Start Hook
# Re-injects critical context after compaction or session resume

set -euo pipefail

# Read hook input from stdin
INPUT=$(cat)
MATCH_TYPE=$(echo "$INPUT" | jq -r '.match // "startup"')

# Get project root (where .claude and .devflow directories are)
PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
STATE_FILE="${PROJECT_ROOT}/.claude/devflow.local.md"
DESIGN_FILE="${PROJECT_ROOT}/.devflow/design.md"
ANALYSIS_FILE="${PROJECT_ROOT}/.devflow/analysis.json"

# Function to output context that gets injected into conversation
output_context() {
    local context=""

    # Check if autonomous loop is active
    if [[ -f "$STATE_FILE" ]]; then
        # Parse state file YAML frontmatter
        local iteration=$(grep -E "^iteration:" "$STATE_FILE" 2>/dev/null | cut -d: -f2 | tr -d ' ' || echo "1")
        local max_iterations=$(grep -E "^max_iterations:" "$STATE_FILE" 2>/dev/null | cut -d: -f2 | tr -d ' ' || echo "0")
        local task_file=$(grep -E "^task_file:" "$STATE_FILE" 2>/dev/null | cut -d: -f2- | tr -d ' "' || echo "")
        local completion_promise=$(grep -E "^completion_promise:" "$STATE_FILE" 2>/dev/null | cut -d: -f2- | tr -d ' "' || echo "")

        context+="## DevFlow Autonomous Loop Active\n\n"
        context+="- **Iteration**: ${iteration}"
        if [[ "$max_iterations" != "0" ]]; then
            context+=" of ${max_iterations}"
        else
            context+=" (unlimited)"
        fi
        context+="\n"

        if [[ -n "$task_file" ]]; then
            context+="- **Task File**: ${task_file}\n"

            # Show task progress if task file exists
            local full_path="${PROJECT_ROOT}/${task_file}"
            if [[ -f "$full_path" ]]; then
                local total=$(jq '[.features // .tasks // .stories // [] | .[]] | length' "$full_path" 2>/dev/null || echo "0")
                local complete=$(jq '[.features // .tasks // .stories // [] | .[] | select(.status == "complete" or .status == "done")] | length' "$full_path" 2>/dev/null || echo "0")
                local in_progress=$(jq '[.features // .tasks // .stories // [] | .[] | select(.status == "in_progress")] | length' "$full_path" 2>/dev/null || echo "0")
                context+="- **Progress**: ${complete}/${total} complete"
                if [[ "$in_progress" -gt 0 ]]; then
                    context+=", ${in_progress} in progress"
                fi
                context+="\n"
            fi
        fi

        if [[ -n "$completion_promise" ]]; then
            context+="- **Completion Promise**: \`${completion_promise}\`\n"
        fi

        context+="\n**Continue working on the current TRD or task.**\n\n"
    fi

    # Add project context if design document exists
    if [[ -f "$DESIGN_FILE" ]]; then
        # Extract just the overview section (first 30 lines after frontmatter)
        local overview=$(sed -n '/^---$/,/^---$/d; 1,30p' "$DESIGN_FILE" 2>/dev/null | head -20)
        if [[ -n "$overview" ]]; then
            context+="## Project Context\n\n"
            context+="${overview}\n\n"
        fi
    fi

    # Add tech stack from analysis if available
    if [[ -f "$ANALYSIS_FILE" ]]; then
        local stack=$(jq -r '.tech_stack // empty' "$ANALYSIS_FILE" 2>/dev/null)
        if [[ -n "$stack" && "$stack" != "null" ]]; then
            context+="## Tech Stack\n\n"
            context+="$(echo "$stack" | jq -r 'to_entries | .[] | "- **\(.key)**: \(.value)"' 2>/dev/null)\n\n"
        fi
    fi

    # Output context to be injected
    if [[ -n "$context" ]]; then
        echo -e "$context"
    fi
}

# Only output context on resume or compact (not fresh startup)
case "$MATCH_TYPE" in
    "compact")
        echo "# Context Restored After Compaction"
        echo ""
        output_context
        ;;
    "resume")
        echo "# Session Resumed"
        echo ""
        output_context
        ;;
    "startup")
        # On fresh startup, only output if loop is active
        if [[ -f "$STATE_FILE" ]]; then
            echo "# DevFlow Session Started"
            echo ""
            output_context
        fi
        ;;
esac

exit 0
