class ClaudePromptJob < ApplicationJob
  queue_as :default

  # Serialize concurrency: only one claude prompt runs at a time.
  # Uses a class-level Mutex since we're using the async queue adapter
  # (in-process threading). For Solid Queue, replace with:
  #   limits_concurrency to: 1, key: "claude_prompt"
  PROMPT_MUTEX = Mutex.new

  def perform(prompt_run_id)
    prompt_run = PromptRun.find_by(id: prompt_run_id)
    return if prompt_run.nil?
    return if prompt_run.status != "queued"

    PROMPT_MUTEX.synchronize do
      ClaudePromptService.new(prompt_run).execute
    end
  end
end
