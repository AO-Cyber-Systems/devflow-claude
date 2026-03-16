class AutoResponseLog < ApplicationRecord
  belongs_to :event
  belongs_to :relay_session

  validates :decision, presence: true
  validates :classification, presence: true
  validates :autonomy_level, presence: true

  before_create :set_id

  private

  def set_id
    self.id ||= SecureRandom.uuid
  end
end
