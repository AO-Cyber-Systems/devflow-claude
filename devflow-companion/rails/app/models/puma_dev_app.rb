class PumaDevApp
  PUMA_DEV_DIR = File.expand_path("~/.puma-dev")
  LOG_PATH = File.expand_path("~/Library/Logs/puma-dev.log")

  attr_reader :name, :path, :symlink_path

  def initialize(attrs = {})
    @name = attrs[:name]
    @path = attrs[:path]
    @symlink_path = attrs[:symlink_path]
  end

  def url
    tld = PumaDev::Config.current.primary_tld
    "https://#{name}.#{tld}"
  end

  def app_exists?
    path && File.directory?(path)
  end

  def restart!
    restart_file = File.join(path, "tmp", "restart.txt")
    dir = File.dirname(restart_file)
    FileUtils.mkdir_p(dir) unless File.directory?(dir)
    FileUtils.touch(restart_file)
  end

  def self.all
    return [] unless File.directory?(PUMA_DEV_DIR)

    Dir.entries(PUMA_DEV_DIR).filter_map do |entry|
      next if entry.start_with?(".")
      full_path = File.join(PUMA_DEV_DIR, entry)
      next unless File.symlink?(full_path)

      target = File.readlink(full_path) rescue nil
      new(name: entry, path: target, symlink_path: full_path)
    end.sort_by(&:name)
  end

  def self.find(name)
    all.find { |a| a.name == name }
  end

  def self.create(name:, path:)
    symlink = File.join(PUMA_DEV_DIR, name)
    return { success: false, error: "App already exists" } if File.exist?(symlink)
    return { success: false, error: "Path does not exist" } unless File.directory?(path)

    File.symlink(path, symlink)
    { success: true }
  rescue => e
    { success: false, error: e.message }
  end

  def self.remove(name)
    symlink = File.join(PUMA_DEV_DIR, name)
    return { success: false, error: "App not found" } unless File.symlink?(symlink)

    File.delete(symlink)
    { success: true }
  rescue => e
    { success: false, error: e.message }
  end

  def self.tail_log(lines: 50)
    return "" unless File.exist?(LOG_PATH)
    CommandExecutor.run("tail", "-n", lines.to_s, LOG_PATH)[:stdout]
  end

  def self.ssl_status
    cert_path = File.expand_path("~/Library/Application Support/io.puma.dev/cert.pem")
    return { installed: false } unless File.exist?(cert_path)

    result = CommandExecutor.run("openssl", "x509", "-enddate", "-noout", "-in", cert_path)
    if result[:success]
      expiry = result[:stdout].strip.sub("notAfter=", "")
      { installed: true, expires: expiry }
    else
      { installed: true, expires: "unknown" }
    end
  end
end
