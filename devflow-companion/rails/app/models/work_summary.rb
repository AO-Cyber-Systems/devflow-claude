class WorkSummary < ApplicationRecord
  include Turbo::Broadcastable

  belongs_to :relay_session

  validates :content, presence: true

  before_create :set_id

  scope :unread, -> { where(read: false) }

  # Turbo broadcasts for relay web UI
  after_create_commit -> {
    broadcast_prepend_to "relay_session_#{relay_session_id}", target: "work-summaries", partial: "relay/work_summaries/summary", locals: { summary: self }
  }

  def mark_read!
    update!(read: true)
  end

  private

  def set_id
    self.id ||= SecureRandom.uuid
  end
end
