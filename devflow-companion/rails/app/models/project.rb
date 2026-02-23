class Project < ApplicationRecord
  validates :name, presence: true
  validates :path, presence: true, uniqueness: true

  def devflow_state_path
    File.join(path, ".planning", "STATE.md")
  end

  def devflow_roadmap_path
    File.join(path, ".planning", "ROADMAP.md")
  end

  def devflow_config_path
    File.join(path, ".planning", "config.json")
  end

  def has_devflow?
    File.exist?(devflow_state_path)
  end
end
