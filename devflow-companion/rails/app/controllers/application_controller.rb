class ApplicationController < ActionController::Base
  layout "application"

  before_action :check_prerequisites_on_first_visit

  private

  def check_prerequisites_on_first_visit
    return if self.is_a?(PrerequisitesController)
    return if self.is_a?(SetupsController)
    return if self.is_a?(HealthController)
    return if Setting.get("setup_completed") == "true"
    return if Setting.get("prerequisites_checked") == "true"

    redirect_to setup_path
  end

  def current_project
    @current_project ||= begin
      path = Setting.get("current_project_path")
      Project.find_by(path: path) if path
    end
  end
  helper_method :current_project

  def sidebar_items
    [
      {
        group: "Infrastructure",
        items: [
          { name: "Dashboard", path: root_path, icon: "home" },
          { name: "Puma-Dev", path: puma_dev_apps_path, icon: "server" },
          { name: "Puma-Dev Config", path: puma_dev_config_path, icon: "wrench" },
          { name: "Services", path: services_path, icon: "activity" },
          { name: "Homebrew", path: brew_packages_path, icon: "box" },
          { name: "Mise", path: mise_tools_path, icon: "layers" },
          { name: "Ports", path: ports_path, icon: "radio" },
          { name: "Hosts", path: hosts_path, icon: "globe" },
          { name: "Email", path: mail_messages_path, icon: "mail" },
        ]
      },
      {
        group: "Configuration",
        items: [
          { name: "Env Variables", path: environments_files_path, icon: "file-text" },
          { name: "SSH Keys", path: ssh_keys_path, icon: "key" },
          { name: "Git Config", path: git_config_path, icon: "git-branch" },
        ]
      },
      {
        group: "Proxy",
        items: [
          { name: "Claude Proxy", path: proxy_accounts_path, icon: "zap" },
        ]
      },
      {
        group: "Claude Code",
        items: [
          { name: "Settings", path: claude_code_settings_path, icon: "settings" },
          { name: "Hooks", path: claude_code_hooks_path, icon: "terminal" },
          { name: "MCP Servers", path: claude_code_mcp_servers_path, icon: "cpu" },
          { name: "Plugins", path: claude_code_plugins_path, icon: "package" },
          { name: "Permissions", path: claude_code_permissions_path, icon: "shield" },
        ]
      },
      {
        group: "DevFlow",
        items: [
          { name: "Projects", path: projects_path, icon: "folder" },
          { name: "Project State", path: devflow_dashboard_path, icon: "compass" },
          { name: "Settings", path: devflow_settings_path, icon: "sliders" },
          { name: "Context", path: devflow_context_path, icon: "bar-chart-2" },
        ]
      },
      {
        group: "System",
        items: [
          { name: "Prerequisites", path: prerequisites_path, icon: "check-circle" },
        ]
      }
    ]
  end
  helper_method :sidebar_items
end
