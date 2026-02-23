class MiseTool
  attr_reader :name, :version, :requested_version, :install_path,
              :source, :active, :outdated, :latest_version

  def initialize(attrs = {})
    @name = attrs[:name]
    @version = attrs[:version]
    @requested_version = attrs[:requested_version]
    @install_path = attrs[:install_path]
    @source = attrs[:source]
    @active = attrs[:active] || false
    @outdated = attrs[:outdated] || false
    @latest_version = attrs[:latest_version]
  end

  def active?
    @active
  end

  def outdated?
    @outdated
  end

  def self.all_installed
    result = CommandExecutor.run("mise", "list", "--json", timeout: 10)
    return [] unless result[:success]

    data = JSON.parse(result[:stdout]) rescue (return [])
    outdated = outdated_index

    tools = []

    data.each do |tool_name, versions|
      versions.each do |v|
        oinfo = outdated[tool_name]
        tools << new(
          name: tool_name,
          version: v["version"],
          requested_version: v["requested_version"],
          install_path: v["install_path"],
          source: v.dig("source", "path"),
          active: v["active"] || false,
          outdated: oinfo.present?,
          latest_version: oinfo&.dig(:latest)
        )
      end
    end

    tools.sort_by { |t| [t.name, t.version] }
  end

  def self.outdated_index
    result = CommandExecutor.run("mise", "outdated", "--json", timeout: 10)
    return {} unless result[:success]

    data = JSON.parse(result[:stdout]) rescue (return {})
    index = {}

    data.each do |tool_name, info|
      if info.is_a?(Hash)
        index[tool_name] = {
          current: info["current"],
          latest: info["latest"] || info["wanted"]
        }
      end
    end

    index
  end

  def self.search(term)
    sanitized = sanitize_name(term)
    return [] if sanitized.blank?

    result = CommandExecutor.run("mise", "registry", timeout: 10)
    return [] unless result[:success]

    matches = result[:stdout].lines.filter_map do |line|
      parts = line.strip.split(/\s+/, 2)
      next unless parts[0]
      next unless parts[0].downcase.include?(sanitized.downcase)

      { name: parts[0], source: parts[1] }
    end

    matches.first(30)
  end

  def self.available_versions(tool)
    sanitized = sanitize_name(tool)
    return [] if sanitized.blank?

    result = CommandExecutor.run("mise", "ls-remote", sanitized, timeout: 10)
    return [] unless result[:success]

    versions = result[:stdout].lines.map(&:strip).reject(&:blank?)
    versions.last(20).reverse
  end

  def self.install(tool, version)
    sanitized_tool = sanitize_name(tool)
    sanitized_version = sanitize_name(version)
    CommandExecutor.run("mise", "install", "#{sanitized_tool}@#{sanitized_version}", timeout: 120)
  end

  def self.uninstall(tool, version)
    sanitized_tool = sanitize_name(tool)
    sanitized_version = sanitize_name(version)
    CommandExecutor.run("mise", "uninstall", "#{sanitized_tool}@#{sanitized_version}", timeout: 120)
  end

  def self.upgrade(tool)
    sanitized = sanitize_name(tool)
    CommandExecutor.run("mise", "upgrade", sanitized, timeout: 120)
  end

  def self.sanitize_name(name)
    name.to_s.gsub(/[^a-zA-Z0-9\-_.]/, "")
  end
end
