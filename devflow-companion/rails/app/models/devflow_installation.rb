# frozen_string_literal: true

class DevflowInstallation < ApplicationRecord
  validates :config_dir, presence: true, uniqueness: true
  validates :scope, presence: true, inclusion: { in: %w[global local] }

  scope :global, -> { where(scope: "global") }
  scope :for_config_dir, ->(dir) { where(config_dir: dir) }

  def installed?
    status == "installed"
  end

  def needs_update?(new_version)
    return true if version.blank?
    Gem::Version.new(new_version) > Gem::Version.new(version)
  rescue ArgumentError
    true
  end
end
