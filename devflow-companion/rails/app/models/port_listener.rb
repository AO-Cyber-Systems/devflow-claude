class PortListener
  attr_reader :command, :pid, :user, :port, :protocol, :node

  def initialize(attrs = {})
    @command = attrs[:command]
    @pid = attrs[:pid]
    @user = attrs[:user]
    @port = attrs[:port]
    @protocol = attrs[:protocol] || "TCP"
    @node = attrs[:node]
  end

  def self.all
    result = CommandExecutor.run("lsof", "-iTCP", "-sTCP:LISTEN", "-nP")
    return [] unless result[:success]

    result[:stdout].lines.drop(1).filter_map do |line|
      parts = line.strip.split(/\s+/)
      next if parts.length < 9

      port_match = parts[8].match(/:(\d+)$/)
      next unless port_match

      new(
        command: parts[0],
        pid: parts[1].to_i,
        user: parts[2],
        node: parts[7],
        port: port_match[1].to_i
      )
    end.uniq { |l| [l.pid, l.port] }.sort_by(&:port)
  end

  def self.kill(pid)
    pid = pid.to_i
    return { success: false, error: "Invalid PID" } if pid <= 0

    # Verify PID ownership before killing
    current_user = ENV["USER"]
    result = CommandExecutor.run("ps", "-p", pid.to_s, "-o", "user=")
    unless result[:success]
      return { success: false, error: "Process not found" }
    end

    owner = result[:stdout].strip
    unless owner == current_user || current_user == "root"
      return { success: false, error: "Cannot kill process owned by #{owner}" }
    end

    kill_result = CommandExecutor.run("kill", "-TERM", pid.to_s)
    if kill_result[:success]
      { success: true }
    else
      { success: false, error: kill_result[:stderr] }
    end
  end
end
