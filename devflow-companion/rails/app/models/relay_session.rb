class RelaySession < ApplicationRecord
  include Turbo::Broadcastable
  include SessionColor

  has_many :events, dependent: :destroy
  has_many :work_summaries, dependent: :destroy
  has_many :prompt_runs, dependent: :destroy
  has_many :auto_response_logs, dependent: :destroy

  enum :status, { active: "active", idle: "idle", completed: "completed", abandoned: "abandoned" }
  enum :autonomy_level, { supervised: "supervised", assisted: "assisted", autonomous: "autonomous" }

  validates :name, presence: true
  validates :session_key, presence: true, uniqueness: true
  validates :claude_session_id, uniqueness: true, allow_nil: true

  before_validation :generate_session_key, on: :create
  before_create :set_id

  scope :alive, -> { where(status: %w[active idle]) }
  scope :remote_enabled, -> { where(remote_enabled: true) }

  # Turbo broadcasts for relay web UI
  after_create_commit -> { broadcast_prepend_to "relay_dashboard", target: "active-sessions", partial: "relay/sessions/card", locals: { session: self } }
  after_update_commit -> { broadcast_replace_to "relay_dashboard", target: "relay-session-#{id}", partial: "relay/sessions/card", locals: { session: self } }
  after_destroy_commit -> { broadcast_remove_to "relay_dashboard", target: "relay-session-#{id}" }

  def self.find_or_create_from_event(event_data)
    data = event_data.respond_to?(:to_unsafe_h) ? event_data.to_unsafe_h.with_indifferent_access : event_data.with_indifferent_access

    claude_id = data[:claude_session_id]
    if claude_id.present?
      session = find_by(claude_session_id: claude_id)
      return session if session
    end

    session_id = data[:session_id]
    if session_id.present?
      session = find_by(session_key: session_id)
      return session if session
    end

    create!(
      name: data[:project_name] || data[:ide] || "Unknown Session",
      claude_session_id: claude_id,
      ide: data[:ide],
      project_name: data[:project_name],
      branch: data[:branch],
      cwd: data[:cwd],
      agent: data[:agent] || "claude-code",
      last_activity_at: Time.current
    )
  end

  def touch_activity
    update_column(:last_activity_at, Time.current)
  end

  private

  def set_id
    self.id ||= SecureRandom.uuid
  end

  def generate_session_key
    self.session_key ||= "rly_#{SecureRandom.hex(16)}"
  end
end
