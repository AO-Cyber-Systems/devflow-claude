class ActionClassifier
  SAFE_TOOLS = %w[Read Glob Grep Agent WebFetch WebSearch TodoWrite Edit Write].freeze

  SCOPED_COMMANDS = [
    "npm test", "vitest", "jest", "git status", "git diff", "git log", "ls", "tsc",
    "npm install", "git add", "git commit", "npm run build", "yarn test",
    "bundle exec rspec", "bundle exec rake", "cargo test", "go test"
  ].freeze

  DESTRUCTIVE_PATTERNS = [
    /rm\s+-rf/,
    /git\s+push/,
    /git\s+reset\s+--hard/,
    /--force/,
    /--no-verify/,
    /npm\s+publish/,
    /docker\s+rm/,
    /DROP\s+TABLE/i,
    /\bkill\b/,
    /\bpkill\b/,
    /git\s+clean\s+-f/,
  ].freeze

  def self.classify(tool_name:, command: nil, project_dir: nil, cwd: nil)
    if SAFE_TOOLS.include?(tool_name)
      return { classification: "safe", reason: "Tool #{tool_name} is always safe" }
    end

    if tool_name == "Bash"
      return classify_bash(command: command, project_dir: project_dir, cwd: cwd)
    end

    if tool_name == "AskUserQuestion"
      return { classification: "review", reason: "User questions always require review" }
    end

    { classification: "review", reason: "Unknown tool #{tool_name}" }
  end

  private_class_method def self.classify_bash(command:, project_dir:, cwd:)
    return { classification: "review", reason: "Empty bash command" } if command.blank?

    # Check destructive patterns first
    DESTRUCTIVE_PATTERNS.each do |pattern|
      if command.match?(pattern)
        return { classification: "destructive", reason: "Command matches destructive pattern: #{pattern.source}" }
      end
    end

    # Check if command is scoped (known-safe command within project dir)
    is_scoped_command = SCOPED_COMMANDS.any? { |sc| command.start_with?(sc) }
    in_project_dir = project_dir.present? && cwd.present? && cwd.start_with?(project_dir)

    if is_scoped_command && in_project_dir
      return { classification: "scoped", reason: "Known command within project directory" }
    end

    # Outside project directory
    if project_dir.present? && cwd.present? && !cwd.start_with?(project_dir)
      return { classification: "review", reason: "Command outside project directory" }
    end

    { classification: "review", reason: "Unknown bash command" }
  end
end
