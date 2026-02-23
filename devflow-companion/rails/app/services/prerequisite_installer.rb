class PrerequisiteInstaller
  # Closed command map — no user input reaches any shell command.
  # Each key maps to a lambda that returns a CommandExecutor-compatible result hash.
  COMMANDS = {
    "install_homebrew" => -> {
      CommandExecutor.run(
        "/bin/bash", "-c",
        'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
        timeout: 300
      )
    },
    "brew_install_mise" => -> {
      CommandExecutor.run("brew", "install", "mise", timeout: 120)
    },
    "mise_install_ruby" => -> {
      CommandExecutor.run("mise", "install", "ruby", timeout: 300)
    },
    "mise_install_node" => -> {
      CommandExecutor.run("mise", "install", "node", timeout: 300)
    },
    "xcode_select_install" => -> {
      CommandExecutor.run("xcode-select", "--install", timeout: 30)
    },
    "gem_install_bundler" => -> {
      CommandExecutor.run("gem", "install", "bundler", timeout: 60)
    },
    "brew_install_puma_dev" => -> {
      CommandExecutor.run("brew", "install", "puma/puma/puma-dev", timeout: 120)
    },
    "setup_puma_dev_dir" => -> {
      dir = File.expand_path("~/.puma-dev")
      FileUtils.mkdir_p(dir)
      { success: true, stdout: "Created #{dir}", stderr: "", exit_code: 0 }
    },
    "launchctl_load_puma_dev" => -> {
      plist = File.expand_path("~/Library/LaunchAgents/io.puma.dev.plist")
      CommandExecutor.run("launchctl", "load", plist, timeout: 10)
    },
    "brew_install_postgresql" => -> {
      CommandExecutor.run("brew", "install", "postgresql@17", timeout: 180)
    },
    "brew_start_postgresql" => -> {
      # Try common postgresql formula names
      result = CommandExecutor.run("brew", "services", "start", "postgresql@17", timeout: 30)
      unless result[:success]
        result = CommandExecutor.run("brew", "services", "start", "postgresql", timeout: 30)
      end
      result
    },
    "brew_install_redis" => -> {
      CommandExecutor.run("brew", "install", "redis", timeout: 120)
    },
    "brew_start_redis" => -> {
      CommandExecutor.run("brew", "services", "start", "redis", timeout: 30)
    },
    "npm_install_claude" => -> {
      CommandExecutor.run("npm", "install", "-g", "@anthropic-ai/claude-code", timeout: 120)
    },
    "npx_install_devflow" => -> {
      CommandExecutor.run("npx", "@ao-cyber-systems/devflow-cc", timeout: 120)
    }
  }.freeze

  def self.run(key)
    command = COMMANDS[key]
    return { success: false, stderr: "Unknown install command: #{key}", exit_code: -1 } unless command

    Rails.logger.info("[PrerequisiteInstaller] Running: #{key}")
    result = command.call
    Rails.logger.info("[PrerequisiteInstaller] #{key} => success=#{result[:success]}")
    result
  rescue => e
    Rails.logger.error("[PrerequisiteInstaller] #{key} failed: #{e.message}")
    { success: false, stderr: e.message, exit_code: -1 }
  end
end
