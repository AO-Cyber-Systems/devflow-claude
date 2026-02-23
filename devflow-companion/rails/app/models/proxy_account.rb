class ProxyAccount < ApplicationRecord
  encrypts :api_key, :access_token, :refresh_token

  validates :name, presence: true
  validates :api_key, presence: true, if: :api_key?
  validates :access_token, presence: true, if: :oauth?
  validates :refresh_token, presence: true, if: :oauth?

  SESSION_DURATION = 5.hours

  scope :not_paused, -> { where(paused: false) }
  scope :active, -> {
    not_paused.where.not(status: "rate_limited")
      .or(not_paused.where(status: "rate_limited").where("rate_limit_reset <= ?", Time.current))
  }
  scope :available, -> {
    active.where("rate_limit_remaining IS NULL OR rate_limit_remaining > 0")
  }

  def oauth?
    auth_type == "oauth"
  end

  def api_key?
    auth_type == "api_key"
  end

  def token_expired?
    return true unless oauth?
    token_expires_at.nil? || token_expires_at <= Time.current
  end

  def token_expiring_soon?
    return false unless oauth?
    return true if token_expires_at.nil?
    token_expires_at <= 30.minutes.from_now
  end

  def update_tokens!(access_token:, refresh_token:, expires_in:)
    update!(
      access_token: access_token,
      refresh_token: refresh_token,
      token_expires_at: expires_in.seconds.from_now
    )
  end

  def rate_limited?
    status == "rate_limited" && rate_limit_reset.present? && rate_limit_reset > Time.current
  end

  def clear_rate_limit_if_expired!
    return unless status == "rate_limited"
    return if rate_limit_reset.present? && rate_limit_reset > Time.current

    update!(status: "active", rate_limit_remaining: nil, rate_limit_limit: nil, rate_limit_reset: nil)
  end

  def record_rate_limit!(remaining:, limit:, reset:)
    attrs = { rate_limit_remaining: remaining, rate_limit_limit: limit, rate_limit_reset: reset }
    attrs[:status] = "rate_limited" if remaining&.zero?
    update!(attrs)
  end

  def start_session!
    update!(session_start: Time.current, session_request_count: 0)
  end

  def session_expired?
    session_start.nil? || session_start < SESSION_DURATION.ago
  end

  def increment_request_count!
    increment!(:session_request_count)
    increment!(:total_request_count)
  end
end
