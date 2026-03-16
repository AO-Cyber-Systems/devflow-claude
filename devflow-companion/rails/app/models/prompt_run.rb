class PromptRun < ApplicationRecord
  include Turbo::Broadcastable

  belongs_to :relay_session

  enum :status, { queued: "queued", running: "running", completed: "completed", failed: "failed" }
  enum :mode, { continue: "continue", fresh: "fresh" }

  validates :prompt, presence: true

  before_create :set_id

  # Broadcast status changes to the session's Turbo Stream channel
  after_update_commit -> {
    broadcast_replace_to "relay_session_#{relay_session_id}",
      target: "prompt-run-#{id}",
      partial: "relay/prompts/run",
      locals: { prompt_run: self }
  }

  def completed?
    status == "completed"
  end

  def failed?
    status == "failed"
  end

  private

  def set_id
    self.id ||= SecureRandom.uuid
  end
end
