# frozen_string_literal: true

# DevflowBundle provides access to bundled DevFlow source files.
#
# In the Electron app, files are bundled inside the app resources.
# In development, they're read from the repo root or a cache directory.
# For registry-fetched updates, falls back to ~/.devflow-companion/cache/bundle.
class DevflowBundle
  CACHE_DIR = File.expand_path("~/.devflow-companion/cache/bundle")

  class << self
    def instance
      @instance ||= new
    end

    delegate :skills_path, :agents_path, :devflow_path, :hooks_path,
             :changelog_path, :version, :valid?, :bundle_path, to: :instance
  end

  def initialize(path: nil)
    @bundle_path = path || resolve_bundle_path
  end

  attr_reader :bundle_path

  def skills_path
    return nil if bundle_path.nil?
    File.join(bundle_path, "skills")
  end

  def agents_path
    return nil if bundle_path.nil?
    File.join(bundle_path, "agents")
  end

  def devflow_path
    return nil if bundle_path.nil?
    File.join(bundle_path, "devflow")
  end

  def hooks_path
    return nil if bundle_path.nil?
    # In bundled form, hooks are at hooks/. In repo root, at hooks/dist/
    direct = File.join(bundle_path, "hooks")
    dist = File.join(bundle_path, "hooks", "dist")
    File.directory?(dist) ? dist : direct
  end

  def changelog_path
    return nil if bundle_path.nil?
    File.join(bundle_path, "CHANGELOG.md")
  end

  def version
    return nil if bundle_path.nil?

    # Check VERSION file first
    version_file = File.join(bundle_path, "VERSION")
    return File.read(version_file).strip if File.exist?(version_file)

    # Fall back to devflow/VERSION
    devflow_version = File.join(bundle_path, "devflow", "VERSION")
    return File.read(devflow_version).strip if File.exist?(devflow_version)

    # Fall back to package.json (dev mode, repo root)
    pkg_json = File.join(bundle_path, "package.json")
    if File.exist?(pkg_json)
      pkg = JSON.parse(File.read(pkg_json))
      return pkg["version"] if pkg["version"]
    end

    nil
  rescue JSON::ParserError
    nil
  end

  def valid?
    return false if bundle_path.nil?
    File.directory?(bundle_path) &&
      File.directory?(skills_path) &&
      File.directory?(devflow_path) &&
      version.present?
  end

  private

  def resolve_bundle_path
    # 1. Explicit env var (set by Electron when spawning Rails)
    env_path = ENV["DEVFLOW_BUNDLE_PATH"]
    return env_path if env_path.present? && File.directory?(env_path)

    # 2. Cache directory (for registry-fetched updates)
    return CACHE_DIR if File.directory?(CACHE_DIR) && File.exist?(File.join(CACHE_DIR, "VERSION"))

    # 3. Development fallback: repo root
    # Rails.root is devflow-companion/rails, so ../.. is the repo root
    repo_root = File.expand_path("../..", Rails.root)
    dev_bundle = File.join(repo_root, "devflow-companion", "electron", "devflow-bundle")
    return dev_bundle if File.directory?(dev_bundle)

    # 4. Development fallback: source dirs directly from repo root
    # (before bundle-devflow.js has been run)
    if File.directory?(File.join(repo_root, "skills")) && File.directory?(File.join(repo_root, "devflow"))
      return repo_root
    end

    nil
  end
end
