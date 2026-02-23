class ProxyRequest < ApplicationRecord
  belongs_to :proxy_account, optional: true

  scope :recent, -> { where("created_at >= ?", 24.hours.ago) }
  scope :errors, -> { where.not(status_code: 200..299) }
  scope :by_model, ->(model) { where(model: model) }

  def self.avg_response_time
    recent.average(:response_time_ms)&.round || 0
  end

  def self.total_today
    where("created_at >= ?", Time.current.beginning_of_day).count
  end

  def self.error_rate
    total = recent.count
    return 0.0 if total.zero?

    (errors.recent.count.to_f / total * 100).round(1)
  end
end
