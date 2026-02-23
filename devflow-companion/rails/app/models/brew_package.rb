class BrewPackage
  attr_reader :name, :full_name, :desc, :version, :installed_version,
              :outdated, :outdated_version, :pinned, :type, :homepage

  def initialize(attrs = {})
    @name = attrs[:name]
    @full_name = attrs[:full_name] || @name
    @desc = attrs[:desc]
    @version = attrs[:version]
    @installed_version = attrs[:installed_version]
    @outdated = attrs[:outdated] || false
    @outdated_version = attrs[:outdated_version]
    @pinned = attrs[:pinned] || false
    @type = attrs[:type] || "formula"
    @homepage = attrs[:homepage]
  end

  def outdated?
    @outdated
  end

  def formula?
    @type == "formula"
  end

  def cask?
    @type == "cask"
  end

  def self.all_installed
    result = CommandExecutor.run("brew", "info", "--json=v2", "--installed", timeout: 15)
    return [] unless result[:success]

    data = JSON.parse(result[:stdout]) rescue (return [])
    outdated = outdated_index

    packages = []

    (data["formulae"] || []).each do |f|
      installed = f["installed"]&.first
      next unless installed

      oinfo = outdated[f["name"]]
      packages << new(
        name: f["name"],
        full_name: f["full_name"] || f["name"],
        desc: f["desc"],
        version: f["versions"]&.dig("stable"),
        installed_version: installed["version"],
        outdated: oinfo.present?,
        outdated_version: oinfo&.dig(:available),
        pinned: f["pinned"] || false,
        type: "formula",
        homepage: f["homepage"]
      )
    end

    (data["casks"] || []).each do |c|
      oinfo = outdated[c["token"]]
      packages << new(
        name: c["token"],
        full_name: c["full_token"] || c["token"],
        desc: c["desc"],
        version: c["version"],
        installed_version: c["installed"] || c["version"],
        outdated: oinfo.present?,
        outdated_version: oinfo&.dig(:available),
        pinned: false,
        type: "cask",
        homepage: c["homepage"]
      )
    end

    packages.sort_by(&:name)
  end

  def self.outdated_index
    result = CommandExecutor.run("brew", "outdated", "--json=v2", timeout: 15)
    return {} unless result[:success]

    data = JSON.parse(result[:stdout]) rescue (return {})
    index = {}

    (data["formulae"] || []).each do |f|
      index[f["name"]] = {
        current: f["installed_versions"]&.first,
        available: f["current_version"]
      }
    end

    (data["casks"] || []).each do |c|
      index[c["name"]] = {
        current: c["installed_versions"],
        available: c["current_version"]
      }
    end

    index
  end

  def self.search(term)
    sanitized = sanitize_name(term)
    return [] if sanitized.blank?

    result = CommandExecutor.run("brew", "search", sanitized, timeout: 10)
    return [] unless result[:success]

    names = result[:stdout].lines.map(&:strip).reject(&:blank?)
    # Filter out header lines like "==> Formulae" and "==> Casks"
    names = names.reject { |n| n.start_with?("==>") }
    names = names.first(20)
    return [] if names.empty?

    # Get details for search results
    info_result = CommandExecutor.run("brew", "info", "--json=v2", *names, timeout: 15)
    return names.map { |n| { name: n, desc: nil, version: nil, type: "formula" } } unless info_result[:success]

    data = JSON.parse(info_result[:stdout]) rescue (return names.map { |n| { name: n, desc: nil, version: nil, type: "formula" } })

    results = []

    (data["formulae"] || []).each do |f|
      results << {
        name: f["name"],
        desc: f["desc"],
        version: f["versions"]&.dig("stable"),
        type: "formula",
        installed: f["installed"]&.any?
      }
    end

    (data["casks"] || []).each do |c|
      results << {
        name: c["token"],
        desc: c["desc"],
        version: c["version"],
        type: "cask",
        installed: c["installed"].present?
      }
    end

    results
  end

  def self.install(name, cask: false)
    sanitized = sanitize_name(name)
    args = ["brew", "install"]
    args << "--cask" if cask
    args << sanitized
    CommandExecutor.run(*args, timeout: 120)
  end

  def self.uninstall(name, cask: false)
    sanitized = sanitize_name(name)
    args = ["brew", "uninstall"]
    args << "--cask" if cask
    args << sanitized
    CommandExecutor.run(*args, timeout: 120)
  end

  def self.upgrade(name, cask: false)
    sanitized = sanitize_name(name)
    args = ["brew", "upgrade"]
    args << "--cask" if cask
    args << sanitized
    CommandExecutor.run(*args, timeout: 120)
  end

  def self.upgrade_all
    CommandExecutor.run("brew", "upgrade", timeout: 300)
  end

  def self.sanitize_name(name)
    name.to_s.gsub(/[^a-zA-Z0-9\-_@\/]/, "")
  end
end
