class PrerequisiteCheck
  Check = Struct.new(:name, :category, :status, :detail, :fix_hint, :install_recipe, keyword_init: true) do
    def ok? = status == :ok
    def warning? = status == :warning
    def missing? = status == :missing
    def installable? = install_recipe.present? && !ok?
  end

  INSTALL_RECIPES = {
    "brew" => {
      label: "Install Homebrew",
      steps: [
        { type: "server", key: "install_homebrew", description: "Installing Homebrew..." }
      ]
    },
    "mise" => {
      label: "Install mise",
      steps: [
        { type: "server", key: "brew_install_mise", description: "Installing mise via Homebrew..." }
      ]
    },
    "ruby" => {
      label: "Install Ruby",
      steps: [
        { type: "server", key: "mise_install_ruby", description: "Installing Ruby via mise..." }
      ]
    },
    "node" => {
      label: "Install Node.js",
      steps: [
        { type: "server", key: "mise_install_node", description: "Installing Node.js via mise..." }
      ]
    },
    "git" => {
      label: "Install Git",
      steps: [
        { type: "server", key: "xcode_select_install", description: "Installing Xcode Command Line Tools..." }
      ]
    },
    "bundle" => {
      label: "Install Bundler",
      steps: [
        { type: "server", key: "gem_install_bundler", description: "Installing Bundler..." }
      ]
    },
    "puma_dev" => {
      label: "Install puma-dev",
      steps: [
        { type: "server", key: "brew_install_puma_dev", description: "Installing puma-dev..." },
        { type: "sudo", command: "puma-dev -setup", description: "Setting up puma-dev (requires admin)..." },
        { type: "server", key: "setup_puma_dev_dir", description: "Creating ~/.puma-dev directory..." }
      ]
    },
    "puma_dev_setup" => {
      label: "Setup puma-dev",
      steps: [
        { type: "sudo", command: "puma-dev -setup", description: "Setting up puma-dev (requires admin)..." }
      ]
    },
    "puma_dev_dir" => {
      label: "Create ~/.puma-dev",
      steps: [
        { type: "server", key: "setup_puma_dev_dir", description: "Creating ~/.puma-dev directory..." }
      ]
    },
    "puma_dev_service" => {
      label: "Start puma-dev",
      steps: [
        { type: "server", key: "launchctl_load_puma_dev", description: "Starting puma-dev LaunchAgent..." }
      ]
    },
    "postgresql" => {
      label: "Install PostgreSQL",
      steps: [
        { type: "server", key: "brew_install_postgresql", description: "Installing PostgreSQL..." },
        { type: "server", key: "brew_start_postgresql", description: "Starting PostgreSQL service..." }
      ]
    },
    "postgresql_start" => {
      label: "Start PostgreSQL",
      steps: [
        { type: "server", key: "brew_start_postgresql", description: "Starting PostgreSQL service..." }
      ]
    },
    "redis" => {
      label: "Install Redis",
      steps: [
        { type: "server", key: "brew_install_redis", description: "Installing Redis..." },
        { type: "server", key: "brew_start_redis", description: "Starting Redis service..." }
      ]
    },
    "redis_start" => {
      label: "Start Redis",
      steps: [
        { type: "server", key: "brew_start_redis", description: "Starting Redis service..." }
      ]
    },
    "claude" => {
      label: "Install Claude Code",
      steps: [
        { type: "server", key: "npm_install_claude", description: "Installing Claude Code globally..." }
      ]
    },
    "devflow_skills" => {
      label: "Install DevFlow",
      steps: [
        { type: "server", key: "npx_install_devflow", description: "Installing DevFlow skills & agents..." }
      ]
    }
  }.freeze

  def self.run_all
    checks = []
    checks.concat(system_tools_checks)
    checks.concat(brew_checks)
    checks.concat(puma_dev_checks)
    checks.concat(dev_tools_checks)
    checks.concat(devflow_checks)
    checks
  end

  def self.all_ok?
    run_all.none?(&:missing?)
  end

  def self.summary
    checks = run_all
    {
      total: checks.count,
      ok: checks.count(&:ok?),
      warnings: checks.count(&:warning?),
      missing: checks.count(&:missing?),
      checks: checks
    }
  end

  private

  def self.system_tools_checks
    [
      check_executable("ruby", category: "Runtime", fix_hint: "Install via mise: `mise install ruby`", install_recipe: "ruby"),
      check_executable("node", category: "Runtime", fix_hint: "Install via mise: `mise install node`", install_recipe: "node"),
      check_executable("git", category: "Runtime", fix_hint: "Install Xcode CLT: `xcode-select --install`", install_recipe: "git"),
      check_executable("bundle", category: "Runtime", fix_hint: "Install: `gem install bundler`", install_recipe: "bundle"),
      check_executable("npm", category: "Runtime", fix_hint: "Comes with Node.js", install_recipe: "node"),
    ]
  end

  def self.brew_checks
    brew = check_executable("brew", category: "Homebrew", fix_hint: "Install: https://brew.sh", install_recipe: "brew")
    return [brew] unless brew.ok?

    checks = [brew]

    # Check if brew services command works
    result = CommandExecutor.run("brew", "services", "list")
    if result[:success]
      checks << Check.new(
        name: "brew services",
        category: "Homebrew",
        status: :ok,
        detail: "Available (#{result[:stdout].lines.count - 1} services)"
      )
    else
      checks << Check.new(
        name: "brew services",
        category: "Homebrew",
        status: :warning,
        detail: "Command failed",
        fix_hint: "Run: `brew tap homebrew/services`"
      )
    end

    checks
  end

  def self.puma_dev_checks
    checks = []

    puma_dev_bin = check_executable("puma-dev", category: "Puma-Dev", fix_hint: "Install: `brew install puma/puma/puma-dev && sudo puma-dev -setup`", install_recipe: "puma_dev")
    checks << puma_dev_bin

    puma_dev_dir = File.expand_path("~/.puma-dev")
    if File.directory?(puma_dev_dir)
      app_count = Dir.entries(puma_dev_dir).count { |e| !e.start_with?(".") && File.symlink?(File.join(puma_dev_dir, e)) }
      checks << Check.new(
        name: "~/.puma-dev/ directory",
        category: "Puma-Dev",
        status: :ok,
        detail: "#{app_count} app(s) linked"
      )
    else
      checks << Check.new(
        name: "~/.puma-dev/ directory",
        category: "Puma-Dev",
        status: puma_dev_bin.ok? ? :warning : :missing,
        detail: "Directory not found",
        fix_hint: "Run: `mkdir -p ~/.puma-dev` then `sudo puma-dev -setup`",
        install_recipe: "puma_dev_dir"
      )
    end

    # LaunchAgent plist
    if PumaDev::Config.plist_exists?
      checks << Check.new(
        name: "Puma-Dev LaunchAgent",
        category: "Puma-Dev",
        status: :ok,
        detail: "Plist found at ~/Library/LaunchAgents/io.puma.dev.plist"
      )

      config = PumaDev::Config.current
      if config.running?
        checks << Check.new(name: "Puma-Dev service", category: "Puma-Dev", status: :ok, detail: "Running")
      else
        checks << Check.new(
          name: "Puma-Dev service",
          category: "Puma-Dev",
          status: :warning,
          detail: "Not running",
          fix_hint: "Run: `launchctl load ~/Library/LaunchAgents/io.puma.dev.plist`",
          install_recipe: "puma_dev_service"
        )
      end

      # Resolver files
      config.resolver_status.each do |tld, exists|
        if exists
          checks << Check.new(name: "DNS resolver (#{tld})", category: "Puma-Dev", status: :ok, detail: "/etc/resolver/#{tld} exists")
        else
          checks << Check.new(
            name: "DNS resolver (#{tld})",
            category: "Puma-Dev",
            status: :warning,
            detail: "/etc/resolver/#{tld} not found",
            fix_hint: "Run: `sudo puma-dev -setup -d #{config.tlds.join(":")}`",
            install_recipe: "puma_dev_setup"
          )
        end
      end
    else
      checks << Check.new(
        name: "Puma-Dev LaunchAgent",
        category: "Puma-Dev",
        status: puma_dev_bin.ok? ? :warning : :missing,
        detail: "Plist not found",
        fix_hint: "Run: `sudo puma-dev -setup` to install the LaunchAgent",
        install_recipe: "puma_dev_setup"
      )
    end

    # SSL cert
    cert_path = File.expand_path("~/Library/Application Support/io.puma.dev/cert.pem")
    if File.exist?(cert_path)
      result = CommandExecutor.run("openssl", "x509", "-enddate", "-noout", "-in", cert_path)
      if result[:success]
        expiry = result[:stdout].strip.sub("notAfter=", "")
        checks << Check.new(name: "Puma-Dev SSL cert", category: "Puma-Dev", status: :ok, detail: "Expires: #{expiry}")
      else
        checks << Check.new(name: "Puma-Dev SSL cert", category: "Puma-Dev", status: :ok, detail: "Present")
      end
    else
      checks << Check.new(
        name: "Puma-Dev SSL cert",
        category: "Puma-Dev",
        status: :warning,
        detail: "Not found",
        fix_hint: "Run: `sudo puma-dev -setup` to generate SSL certificates",
        install_recipe: "puma_dev_setup"
      )
    end

    checks
  end

  def self.dev_tools_checks
    checks = []

    # PostgreSQL
    pg = check_brew_service("postgresql", display_name: "PostgreSQL")
    checks << pg

    # Redis
    checks << check_brew_service("redis", display_name: "Redis")

    # Check for common optional services
    %w[memcached elasticsearch].each do |svc|
      result = CommandExecutor.run("brew", "list", "--formula", svc)
      if result[:success]
        checks << check_brew_service(svc, display_name: svc.capitalize)
      end
    end

    # SSH agent
    result = CommandExecutor.run("ssh-add", "-l")
    if result[:success]
      key_count = result[:stdout].lines.count { |l| !l.include?("no identities") }
      if key_count > 0
        checks << Check.new(name: "SSH Agent", category: "Dev Tools", status: :ok, detail: "#{key_count} key(s) loaded")
      else
        checks << Check.new(name: "SSH Agent", category: "Dev Tools", status: :warning, detail: "Running but no keys loaded", fix_hint: "Run: `ssh-add` to load your default key")
      end
    else
      checks << Check.new(name: "SSH Agent", category: "Dev Tools", status: :warning, detail: "Not running or no keys", fix_hint: "Run: `eval $(ssh-agent) && ssh-add`")
    end

    checks
  end

  def self.devflow_checks
    checks = []

    # Claude Code
    claude_bin = check_executable("claude", category: "DevFlow", fix_hint: "Install: `npm install -g @anthropic-ai/claude-code`", install_recipe: "claude")
    checks << claude_bin

    # DevFlow installed
    devflow_global = File.expand_path("~/.claude/skills")
    devflow_installed = File.directory?(devflow_global) && Dir.glob(File.join(devflow_global, "df-*")).any?
    if devflow_installed
      skill_count = Dir.glob(File.join(devflow_global, "df-*")).count
      checks << Check.new(name: "DevFlow Skills", category: "DevFlow", status: :ok, detail: "#{skill_count} skill(s) installed in ~/.claude/skills/")
    else
      checks << Check.new(
        name: "DevFlow Skills",
        category: "DevFlow",
        status: :warning,
        detail: "Not found in ~/.claude/skills/",
        fix_hint: "Install: `npx @ao-cyber-systems/devflow-cc`",
        install_recipe: "devflow_skills"
      )
    end

    # DevFlow agents
    agents_dir = File.expand_path("~/.claude/agents")
    if File.directory?(agents_dir) && Dir.glob(File.join(agents_dir, "df-*")).any?
      agent_count = Dir.glob(File.join(agents_dir, "df-*")).count
      checks << Check.new(name: "DevFlow Agents", category: "DevFlow", status: :ok, detail: "#{agent_count} agent(s) installed")
    else
      checks << Check.new(
        name: "DevFlow Agents",
        category: "DevFlow",
        status: :warning,
        detail: "Not found",
        fix_hint: "Install: `npx @ao-cyber-systems/devflow-cc`",
        install_recipe: "devflow_skills"
      )
    end

    # Claude todos directory (for context monitor)
    todos_dir = File.expand_path("~/.claude/todos")
    if File.directory?(todos_dir)
      checks << Check.new(name: "Claude Todos", category: "DevFlow", status: :ok, detail: "Directory exists")
    else
      checks << Check.new(name: "Claude Todos", category: "DevFlow", status: :warning, detail: "~/.claude/todos/ not found (context monitor may not work)")
    end

    checks
  end

  # Helpers

  def self.check_executable(name, category:, fix_hint: nil, install_recipe: nil)
    path = `which #{name} 2>/dev/null`.strip
    if path.present? && File.executable?(path)
      version = `#{path} --version 2>&1`.lines.first&.strip&.slice(0, 60) || "installed"
      Check.new(name: name, category: category, status: :ok, detail: version)
    else
      Check.new(name: name, category: category, status: :missing, detail: "Not found in PATH", fix_hint: fix_hint, install_recipe: install_recipe)
    end
  end

  def self.check_brew_service(name, display_name: nil)
    display = display_name || name
    services = BrewService.all
    match = services.find { |s| s.name.start_with?(name) }

    if match
      if match.started?
        Check.new(name: display, category: "Dev Tools", status: :ok, detail: "Running (#{match.name})")
      else
        Check.new(name: display, category: "Dev Tools", status: :warning, detail: "Installed but stopped (#{match.name})",
          fix_hint: "Run: `brew services start #{match.name}`",
          install_recipe: "#{name}_start")
      end
    else
      # Check if installed but not as a service
      result = CommandExecutor.run("brew", "list", "--formula", name)
      if result[:success]
        Check.new(name: display, category: "Dev Tools", status: :warning, detail: "Installed but not running as service",
          fix_hint: "Run: `brew services start #{name}`",
          install_recipe: "#{name}_start")
      else
        Check.new(name: display, category: "Dev Tools", status: :warning, detail: "Not installed",
          fix_hint: "Install: `brew install #{name}`",
          install_recipe: name)
      end
    end
  end
end
