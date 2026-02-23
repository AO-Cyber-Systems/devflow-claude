class TerminalLauncher
  class LaunchError < StandardError; end

  # Opens Terminal.app with `claude --directory <path>`
  # Fire-and-forget: returns true on success, raises on failure
  def self.open_claude(project_path)
    expanded = File.expand_path(project_path)
    raise LaunchError, "Directory does not exist: #{expanded}" unless Dir.exist?(expanded)

    escaped_path = expanded.gsub("'", "'\\\\''")
    script = %(tell application "Terminal"
  activate
  do script "claude --directory '#{escaped_path}'"
end tell)

    stdout, stderr, status = Open3.capture3("osascript", "-e", script, timeout: 5)
    raise LaunchError, "osascript failed: #{stderr}" unless status.success?

    true
  end
end
