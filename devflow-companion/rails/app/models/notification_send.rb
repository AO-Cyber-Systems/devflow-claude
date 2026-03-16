class NotificationSend < ApplicationRecord
  belongs_to :event

  enum :channel, { imessage: "imessage", web_push: "web_push", action_cable: "action_cable" }
  enum :status, { pending: "pending", sent: "sent", delivered: "delivered", failed: "failed" }, prefix: :delivery

  validates :channel, presence: true

  before_create :set_id

  def mark_sent!
    update!(status: :sent, sent_at: Time.current)
  end

  def mark_delivered!
    update!(status: :delivered, delivered_at: Time.current)
  end

  def mark_failed!(error)
    update!(status: :failed, error_message: error)
  end

  private

  def set_id
    self.id ||= SecureRandom.uuid
  end
end
