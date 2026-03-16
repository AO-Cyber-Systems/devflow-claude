class Event < ApplicationRecord
  include Turbo::Broadcastable

  belongs_to :relay_session
  has_many :notification_sends, dependent: :destroy
  has_many :auto_response_logs, dependent: :destroy

  validates :event_type, presence: true

  before_create :set_id

  scope :pending_decisions, -> { where(decision: "pending") }
  scope :for_type, ->(type) { where(event_type: type) }

  # Turbo broadcasts for relay web UI
  after_create_commit -> {
    broadcast_prepend_to "relay_session_#{relay_session_id}", target: "pending-requests", partial: "relay/events/event", locals: { event: self }
    broadcast_replace_to "relay_dashboard", target: "relay-session-#{relay_session_id}", partial: "relay/sessions/card", locals: { session: relay_session }
  }

  # Optional iMessage notification for pending events
  after_create_commit :dispatch_imessage, if: -> { decision == "pending" }
  after_update_commit -> {
    broadcast_replace_to "relay_session_#{relay_session_id}", target: "relay-event-#{id}", partial: "relay/events/event", locals: { event: self }
  }

  def resolve!(decision, reason, decided_by = "user")
    update!(
      decision: decision,
      decision_reason: reason,
      decided_by: decided_by,
      decided_at: Time.current
    )
  end

  private

  def set_id
    self.id ||= SecureRandom.uuid
  end

  def dispatch_imessage
    ImessageBridgeService.new(self).send_notification
  end
end
