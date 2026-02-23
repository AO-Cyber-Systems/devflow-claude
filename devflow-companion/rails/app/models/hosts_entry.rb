class HostsEntry
  HOSTS_FILE = "/etc/hosts"

  attr_accessor :ip, :hostname, :comment, :line_number

  def initialize(attrs = {})
    @ip = attrs[:ip]
    @hostname = attrs[:hostname]
    @comment = attrs[:comment]
    @line_number = attrs[:line_number]
  end

  def self.all
    entries = []
    File.readlines(HOSTS_FILE).each_with_index do |line, idx|
      stripped = line.strip
      next if stripped.empty?

      comment = nil
      if stripped.start_with?("#")
        next # Skip pure comment lines
      end

      if stripped.include?("#")
        stripped, comment = stripped.split("#", 2).map(&:strip)
      end

      parts = stripped.split(/\s+/)
      next if parts.length < 2

      parts[1..].each do |hostname|
        entries << new(
          ip: parts[0],
          hostname: hostname,
          comment: comment,
          line_number: idx + 1
        )
      end
    end
    entries
  end

  def self.raw_content
    File.read(HOSTS_FILE)
  rescue Errno::EACCES
    "Permission denied reading #{HOSTS_FILE}"
  end
end
