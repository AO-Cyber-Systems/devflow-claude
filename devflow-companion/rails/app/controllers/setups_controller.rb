# frozen_string_literal: true

class SetupsController < ApplicationController
  skip_before_action :check_prerequisites_on_first_visit

  STEPS = %w[welcome prerequisites claude_code devflow hooks review].freeze

  def show
    @current_step = current_step
    @step_index = STEPS.index(@current_step) || 0
    @steps = STEPS
    @step_data = step_data_for(@current_step)
  end

  def update_step
    step = params[:step]

    case step
    when "welcome"
      advance_to("prerequisites")
    when "prerequisites"
      advance_to("claude_code")
    when "claude_code"
      advance_to("devflow")
    when "devflow"
      handle_devflow_step
    when "hooks"
      handle_hooks_step
    when "review"
      complete_setup
    end
  end

  private

  def current_step
    step = params[:step] || Setting.get("setup_current_step", "welcome")
    STEPS.include?(step) ? step : "welcome"
  end

  def advance_to(step)
    Setting.set("setup_current_step", step)
    redirect_to setup_path(step: step)
  end

  def step_data_for(step)
    case step
    when "prerequisites"
      { summary: PrerequisiteCheck.summary }
    when "claude_code"
      detect_claude_code
    when "devflow"
      detect_devflow
    when "hooks"
      {
        has_statusline: ClaudeSettings.status_line.present?,
        has_update_hook: has_devflow_update_hook?,
        current_statusline: ClaudeSettings.status_line
      }
    when "review"
      build_review_summary
    else
      {}
    end
  end

  def detect_claude_code
    claude_binary = `which claude 2>/dev/null`.strip
    settings_exist = File.exist?(File.expand_path("~/.claude/settings.json"))
    config_dir_exist = File.directory?(File.expand_path("~/.claude"))

    {
      binary_found: claude_binary.present?,
      binary_path: claude_binary.presence,
      settings_exist: settings_exist,
      config_dir_exist: config_dir_exist,
      settings_summary: settings_exist ? ClaudeSettings.read.keys : []
    }
  end

  def detect_devflow
    config_dir = File.expand_path("~/.claude")
    version_file = File.join(config_dir, "devflow", "VERSION")
    installed = File.exist?(version_file)
    version = installed ? File.read(version_file).strip : nil
    bundle = DevflowBundle.instance

    {
      installed: installed,
      installed_version: version,
      bundle_valid: bundle.valid?,
      bundle_version: bundle.version,
      needs_update: installed && bundle.valid? && version != bundle.version
    }
  end

  def handle_devflow_step
    if params[:install] == "true"
      config_dir = File.expand_path("~/.claude")
      installer = Devflow::Installer.new(
        config_dir: config_dir,
        scope: "global",
        configure_statusline: false
      )
      installer.install!
      flash[:notice] = "DevFlow installed successfully"
    end
    advance_to("hooks")
  rescue => e
    flash[:alert] = "Installation failed: #{e.message}"
    redirect_to setup_path(step: "devflow")
  end

  def handle_hooks_step
    config_dir = File.expand_path("~/.claude")

    if params[:configure_statusline] == "true"
      configurator = Devflow::SettingsConfigurator.new(config_dir: config_dir, scope: "global")
      configurator.configure_statusline
    end

    advance_to("review")
  end

  def complete_setup
    Setting.set("setup_completed", "true")
    Setting.set("prerequisites_checked", "true")
    redirect_to root_path, notice: "Setup complete! Welcome to DevFlow Companion."
  end

  def has_devflow_update_hook?
    hooks = ClaudeSettings.hooks
    session_start = hooks["SessionStart"] || []
    session_start.any? do |entry|
      entry["hooks"]&.any? { |h| h["command"]&.include?("df-check-update") }
    end
  end

  def build_review_summary
    config_dir = File.expand_path("~/.claude")
    {
      claude_code: detect_claude_code,
      devflow: detect_devflow,
      hooks: {
        statusline: ClaudeSettings.status_line.present?,
        update_hook: has_devflow_update_hook?
      },
      prerequisites: PrerequisiteCheck.summary
    }
  end
end
