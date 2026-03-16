require "shellwords"

class ClaudePromptService
  def initialize(prompt_run)
    @prompt_run = prompt_run
    @session = prompt_run.relay_session
    @cwd = @session.cwd.presence || Dir.home
  end

  def execute
    unless claude_available?
      fail!("Claude CLI not found. Install: https://docs.anthropic.com/en/docs/claude-code")
      return
    end

    unless Dir.exist?(@cwd)
      fail!("Working directory does not exist: #{@cwd}")
      return
    end

    @prompt_run.update!(status: "running", started_at: Time.current)

    cmd = build_command
    log_file = log_path
    Rails.logger.info("ClaudePromptService: spawning #{cmd} in #{@cwd}")

    begin
      pid = Process.spawn(
        cmd,
        chdir: @cwd,
        out: [log_file, "w"],
        err: [log_file, "a"]
      )
      @prompt_run.update!(pid: pid, log_path: log_file)

      # Wait for completion -- this runs in a background job, so blocking is fine
      _pid, status = Process.waitpid2(pid)

      output = read_log(log_file)

      if status.success?
        @prompt_run.update!(
          status: "completed",
          result: output,
          completed_at: Time.current
        )
      else
        fail!("Process exited with status #{status.exitstatus}: #{output.to_s.last(500)}")
      end
    rescue Errno::ENOENT => e
      fail!("Failed to spawn process: #{e.message}")
    rescue => e
      fail!("Unexpected error: #{e.message}")
    end
  end

  private

  def build_command
    prompt_escaped = Shellwords.escape(@prompt_run.prompt)

    if @prompt_run.mode == "continue" && @session.claude_session_id.present?
      "claude -c -p #{prompt_escaped} --output-format json"
    else
      "claude -p #{prompt_escaped} --output-format json"
    end
  end

  def claude_available?
    system("which claude > /dev/null 2>&1")
  end

  def log_path
    dir = Rails.root.join("tmp", "prompt_runs")
    FileUtils.mkdir_p(dir)
    dir.join("#{@prompt_run.id}.log").to_s
  end

  def read_log(path)
    return nil unless File.exist?(path)
    output = File.read(path).to_s
    output = output[-10_000..] if output.length > 10_000
    output
  end

  def fail!(message)
    @prompt_run.update!(
      status: "failed",
      result: message,
      completed_at: Time.current
    )
    Rails.logger.error("ClaudePromptService failed: #{message}")
  end
end
