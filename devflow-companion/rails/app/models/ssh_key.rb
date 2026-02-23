class SSHKey
  SSH_DIR = File.expand_path("~/.ssh")

  attr_reader :name, :path, :type, :fingerprint, :in_agent

  def initialize(attrs = {})
    @name = attrs[:name]
    @path = attrs[:path]
    @type = attrs[:type]
    @fingerprint = attrs[:fingerprint]
    @in_agent = attrs[:in_agent] || false
  end

  def public_key_path
    "#{path}.pub"
  end

  def has_public_key?
    File.exist?(public_key_path)
  end

  def self.all
    return [] unless File.directory?(SSH_DIR)

    agent_keys = loaded_agent_keys

    Dir.glob(File.join(SSH_DIR, "*")).filter_map do |file|
      next if File.directory?(file)
      next if file.end_with?(".pub", "config", "known_hosts", "authorized_keys", "environment")

      name = File.basename(file)
      fingerprint = key_fingerprint(file)
      key_type = detect_type(file)

      new(
        name: name,
        path: file,
        type: key_type,
        fingerprint: fingerprint,
        in_agent: agent_keys.include?(fingerprint)
      )
    end.sort_by(&:name)
  end

  def self.add_to_agent(path)
    CommandExecutor.run("ssh-add", path)
  end

  private

  def self.loaded_agent_keys
    result = CommandExecutor.run("ssh-add", "-l")
    return [] unless result[:success]

    result[:stdout].lines.map do |line|
      parts = line.strip.split(/\s+/)
      parts[1] if parts.length >= 2
    end.compact
  end

  def self.key_fingerprint(path)
    result = CommandExecutor.run("ssh-keygen", "-lf", path)
    return nil unless result[:success]

    parts = result[:stdout].strip.split(/\s+/)
    parts[1] if parts.length >= 2
  end

  def self.detect_type(path)
    first_line = File.open(path, &:readline).strip rescue ""
    case first_line
    when /RSA/ then "RSA"
    when /OPENSSH/ then "ED25519"
    when /EC/ then "ECDSA"
    when /DSA/ then "DSA"
    else "Unknown"
    end
  end
end
