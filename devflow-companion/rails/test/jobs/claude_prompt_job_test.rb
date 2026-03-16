require "test_helper"

class ClaudePromptJobTest < ActiveSupport::TestCase
  setup do
    @session = RelaySession.create!(
      name: "Test Session",
      cwd: "/tmp",
      last_activity_at: Time.current
    )

    @prompt_run = @session.prompt_runs.create!(
      prompt: "test prompt",
      mode: "fresh",
      status: "queued"
    )
  end

  test "calls ClaudePromptService for queued prompt run" do
    executed = false

    # Track that execute was called by patching the class temporarily
    original_new = ClaudePromptService.method(:new)
    ClaudePromptService.define_singleton_method(:new) do |prompt_run|
      service = original_new.call(prompt_run)
      service.define_singleton_method(:execute) { executed = true }
      service
    end

    ClaudePromptJob.new.perform(@prompt_run.id)
    assert executed, "ClaudePromptService#execute should have been called"
  ensure
    ClaudePromptService.define_singleton_method(:new, original_new) if original_new
  end

  test "skips prompt run that is not queued" do
    @prompt_run.update!(status: "running")

    # If service were called, it would raise
    original_new = ClaudePromptService.method(:new)
    called = false
    ClaudePromptService.define_singleton_method(:new) do |_|
      called = true
      raise "should not be called"
    end

    ClaudePromptJob.new.perform(@prompt_run.id)
    assert_not called
  ensure
    ClaudePromptService.define_singleton_method(:new, original_new) if original_new
  end

  test "skips when prompt run ID does not exist" do
    # Should not raise
    assert_nothing_raised do
      ClaudePromptJob.new.perform("nonexistent-id")
    end
  end

  test "job is enqueued to default queue" do
    assert_equal "default", ClaudePromptJob.new.queue_name
  end
end
