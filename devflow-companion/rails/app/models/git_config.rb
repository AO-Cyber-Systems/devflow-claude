class GitConfig
  Scope = Struct.new(:entries, keyword_init: true)
  Entry = Struct.new(:key, :value, keyword_init: true)

  def self.global
    parse_config("--global")
  end

  def self.local(path = nil)
    if path
      parse_config("--local", cwd: path)
    else
      parse_config("--local")
    end
  end

  def self.get(key, scope: "--global")
    result = CommandExecutor.run("git", "config", scope, key)
    result[:success] ? result[:stdout].strip : nil
  end

  def self.set(key, value, scope: "--global")
    CommandExecutor.run("git", "config", scope, key, value)
  end

  def self.unset(key, scope: "--global")
    CommandExecutor.run("git", "config", scope, "--unset", key)
  end

  private

  def self.parse_config(scope, cwd: nil)
    args = ["git", "config", scope, "--list"]
    opts = cwd ? { cwd: cwd } : {}
    result = CommandExecutor.run(*args, **opts)
    return [] unless result[:success]

    result[:stdout].lines.map do |line|
      key, value = line.strip.split("=", 2)
      Entry.new(key: key, value: value)
    end
  end
end
