require "open3"
require "shellwords"

class CommandExecutor
  ALLOWED_COMMANDS = %w[
    brew
    git
    lsof
    ps
    kill
    tail
    ssh-add
    ssh-keygen
    openssl
    dscacheutil
    cat
    launchctl
    puma-dev
    mise
    gem
    npm
    npx
    xcode-select
    bash
  ].freeze

  DEFAULT_TIMEOUT = 10 # seconds

  class CommandNotAllowed < StandardError; end
  class CommandTimeout < StandardError; end

  def self.run(*args, timeout: DEFAULT_TIMEOUT, cwd: nil, **_opts)
    command = args.map(&:to_s)
    executable = File.basename(command.first)

    unless ALLOWED_COMMANDS.include?(executable)
      raise CommandNotAllowed, "Command not in allowlist: #{executable}"
    end

    # Sanitize all arguments
    sanitized = command.map { |arg| Shellwords.escape(arg) }

    stdout, stderr, status = nil
    begin
      opts = {}
      opts[:chdir] = cwd if cwd

      Timeout.timeout(timeout) do
        stdout, stderr, status = Open3.capture3(*command, **opts)
      end
    rescue Timeout::Error
      raise CommandTimeout, "Command timed out after #{timeout}s: #{executable}"
    end

    {
      success: status&.success? || false,
      stdout: stdout || "",
      stderr: stderr || "",
      exit_code: status&.exitstatus
    }
  rescue CommandNotAllowed => e
    Rails.logger.warn("[CommandExecutor] Blocked: #{e.message}")
    { success: false, stdout: "", stderr: e.message, exit_code: -1 }
  rescue CommandTimeout => e
    Rails.logger.warn("[CommandExecutor] Timeout: #{e.message}")
    { success: false, stdout: "", stderr: e.message, exit_code: -1 }
  rescue => e
    Rails.logger.error("[CommandExecutor] Error: #{e.message}")
    { success: false, stdout: "", stderr: e.message, exit_code: -1 }
  end
end
