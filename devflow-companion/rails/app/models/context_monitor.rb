class ContextMonitor
  TODOS_DIR = File.expand_path("~/.claude/todos")

  # Same thresholds as df-statusline.js
  THRESHOLDS = {
    green: 0.63,
    yellow: 0.81,
    orange: 0.95,
    red: 1.0
  }.freeze

  def self.current
    {
      usage_percent: read_usage_percent,
      status_color: status_color,
      current_task: current_task,
      thresholds: THRESHOLDS
    }
  end

  def self.read_usage_percent
    # Read from Claude's context tracking if available
    status_file = File.expand_path("~/.claude/context_status.json")
    if File.exist?(status_file)
      data = JSON.parse(File.read(status_file))
      return data["usage_percent"] || 0
    end
    0
  rescue
    0
  end

  def self.status_color
    pct = read_usage_percent / 100.0
    case
    when pct < THRESHOLDS[:green] then "green"
    when pct < THRESHOLDS[:yellow] then "yellow"
    when pct < THRESHOLDS[:orange] then "orange"
    else "red"
    end
  end

  def self.current_task
    return nil unless File.directory?(TODOS_DIR)

    todo_files = Dir.glob(File.join(TODOS_DIR, "*.json")).sort_by { |f| File.mtime(f) }.reverse
    return nil if todo_files.empty?

    data = JSON.parse(File.read(todo_files.first))
    # Find active task
    tasks = data["todos"] || data["tasks"] || []
    active = tasks.find { |t| t["status"] == "in_progress" }
    active ||= tasks.find { |t| t["status"] == "pending" }
    active&.dig("content") || active&.dig("subject")
  rescue
    nil
  end
end
