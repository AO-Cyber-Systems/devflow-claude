require "test_helper"

class ClaudePromptServiceTest < ActiveSupport::TestCase
  setup do
    @session = RelaySession.create!(
      name: "Test Session",
      cwd: Dir.mktmpdir("claude_prompt_test_"),
      last_activity_at: Time.current,
      claude_session_id: "cc-test-session-123"
    )

    @prompt_run = @session.prompt_runs.create!(
      prompt: "Write a hello world function",
      mode: "fresh",
      status: "queued"
    )
  end

  teardown do
    FileUtils.rm_rf(@session.cwd) if @session.cwd && Dir.exist?(@session.cwd)
  end

  test "fresh mode builds claude -p command without -c flag" do
    service = ClaudePromptService.new(@prompt_run)
    cmd = service.send(:build_command)

    assert cmd.start_with?("claude -p ")
    assert_no_match(/-c/, cmd)
    assert_match(/--output-format json/, cmd)
  end

  test "continue mode builds claude -c -p command when session has claude_session_id" do
    @prompt_run.update!(mode: "continue")
    service = ClaudePromptService.new(@prompt_run)
    cmd = service.send(:build_command)

    assert cmd.start_with?("claude -c -p ")
    assert_match(/--output-format json/, cmd)
  end

  test "continue mode falls back to fresh when session lacks claude_session_id" do
    @session.update!(claude_session_id: nil)
    @prompt_run.update!(mode: "continue")
    service = ClaudePromptService.new(@prompt_run)
    cmd = service.send(:build_command)

    assert cmd.start_with?("claude -p ")
    assert_no_match(/-c/, cmd)
  end

  test "escapes prompt with special characters" do
    @prompt_run.update!(prompt: "fix the bug; rm -rf /")
    service = ClaudePromptService.new(@prompt_run)
    cmd = service.send(:build_command)

    # Shellwords.escape should prevent command injection
    assert_no_match(/; rm/, cmd)
    # The semicolon should be escaped
    assert_match(/\\;/, cmd)
  end

  test "execute with mock claude script succeeds" do
    mock_claude = File.join(@session.cwd, "claude")
    File.write(mock_claude, <<~SCRIPT)
      #!/bin/bash
      echo '{"result": "Hello world function created", "cost": 0.01}'
    SCRIPT
    FileUtils.chmod(0o755, mock_claude)

    service = ClaudePromptService.new(@prompt_run)

    # Override instance methods for testing
    service.define_singleton_method(:claude_available?) { true }
    service.define_singleton_method(:build_command) { mock_claude }
    service.execute

    @prompt_run.reload
    assert_equal "completed", @prompt_run.status
    assert_match(/Hello world/, @prompt_run.result)
    assert_not_nil @prompt_run.started_at
    assert_not_nil @prompt_run.completed_at
  end

  test "execute marks failed when process exits non-zero" do
    mock_claude = File.join(@session.cwd, "failing_claude")
    File.write(mock_claude, "#!/bin/bash\necho 'error: something broke' >&2\nexit 1")
    FileUtils.chmod(0o755, mock_claude)

    service = ClaudePromptService.new(@prompt_run)
    service.define_singleton_method(:claude_available?) { true }
    service.define_singleton_method(:build_command) { mock_claude }
    service.execute

    @prompt_run.reload
    assert_equal "failed", @prompt_run.status
    assert_match(/exited with status 1/, @prompt_run.result)
    assert_not_nil @prompt_run.completed_at
  end

  test "execute marks failed when claude CLI not found" do
    service = ClaudePromptService.new(@prompt_run)
    service.define_singleton_method(:claude_available?) { false }
    service.execute

    @prompt_run.reload
    assert_equal "failed", @prompt_run.status
    assert_match(/Claude CLI not found/, @prompt_run.result)
  end

  test "execute marks failed when working directory does not exist" do
    @session.update!(cwd: "/nonexistent/path/that/does/not/exist")
    @prompt_run.reload

    service = ClaudePromptService.new(@prompt_run)
    service.define_singleton_method(:claude_available?) { true }
    service.execute

    @prompt_run.reload
    assert_equal "failed", @prompt_run.status
    assert_match(/Working directory does not exist/, @prompt_run.result)
  end

  test "execute sets pid and log_path on prompt run" do
    mock_claude = File.join(@session.cwd, "claude")
    File.write(mock_claude, "#!/bin/bash\necho 'done'")
    FileUtils.chmod(0o755, mock_claude)

    service = ClaudePromptService.new(@prompt_run)
    service.define_singleton_method(:claude_available?) { true }
    service.define_singleton_method(:build_command) { mock_claude }
    service.execute

    @prompt_run.reload
    assert_not_nil @prompt_run.pid
    assert_not_nil @prompt_run.log_path
    assert_match(%r{tmp/prompt_runs/}, @prompt_run.log_path)
  end

  test "log path is under tmp/prompt_runs" do
    service = ClaudePromptService.new(@prompt_run)
    path = service.send(:log_path)

    assert_match(%r{tmp/prompt_runs/}, path)
    assert_match(/#{@prompt_run.id}\.log/, path)
  end

  test "output truncation caps at 10K characters" do
    tmp = Tempfile.new("prompt_test")
    tmp.write("x" * 20_000)
    tmp.close

    service = ClaudePromptService.new(@prompt_run)
    result = service.send(:read_log, tmp.path)
    assert_equal 10_000, result.length

    tmp.unlink
  end

  test "read_log returns nil for nonexistent file" do
    service = ClaudePromptService.new(@prompt_run)
    result = service.send(:read_log, "/nonexistent/file.log")
    assert_nil result
  end

  test "uses home directory when session cwd is blank" do
    @session.update!(cwd: "")
    service = ClaudePromptService.new(@prompt_run.reload)

    assert_equal Dir.home, service.instance_variable_get(:@cwd)
  end
end
