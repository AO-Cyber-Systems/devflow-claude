# frozen_string_literal: true

module Devflow
  # Ports hook registration logic from bin/install.js.
  # Configures SessionStart hook for df-check-update.js and cleans up
  # orphaned hooks from previous versions.
  class SettingsConfigurator
    ORPHANED_HOOK_PATTERNS = %w[
      df-notify.sh
      hooks/statusline.js
      df-intel-index.js
      df-intel-session.js
      df-intel-prune.js
    ].freeze

    ORPHANED_FILES = %w[
      hooks/gsd-notify.sh
      hooks/statusline.js
    ].freeze

    attr_reader :config_dir, :scope

    def initialize(config_dir:, scope:)
      @config_dir = config_dir
      @scope = scope
    end

    def configure
      cleanup_orphaned_files
      settings = read_settings
      settings = cleanup_orphaned_hooks(settings)
      settings = ensure_update_hook(settings)
      write_settings(settings)
      settings
    end

    def configure_statusline(settings = nil)
      settings ||= read_settings
      settings["statusLine"] = {
        "type" => "command",
        "command" => hook_command("df-statusline.js")
      }
      write_settings(settings)
      settings
    end

    def has_existing_statusline?
      settings = read_settings
      settings["statusLine"].present?
    end

    def read_settings
      settings_path = File.join(config_dir, "settings.json")
      return {} unless File.exist?(settings_path)
      JSON.parse(File.read(settings_path))
    rescue JSON::ParserError
      {}
    end

    private

    def write_settings(settings)
      settings_path = File.join(config_dir, "settings.json")
      File.write(settings_path, JSON.pretty_generate(settings) + "\n")
    end

    def cleanup_orphaned_files
      ORPHANED_FILES.each do |rel_path|
        full_path = File.join(config_dir, rel_path)
        File.delete(full_path) if File.exist?(full_path)
      end
    end

    def cleanup_orphaned_hooks(settings)
      return settings unless settings["hooks"]

      settings["hooks"].each do |event_type, entries|
        next unless entries.is_a?(Array)
        settings["hooks"][event_type] = entries.reject do |entry|
          hooks = entry["hooks"]
          next false unless hooks.is_a?(Array)
          hooks.any? do |h|
            h["command"] && ORPHANED_HOOK_PATTERNS.any? { |p| h["command"].include?(p) }
          end
        end
      end

      # Fix old statusline.js -> df-statusline.js
      if settings.dig("statusLine", "command")&.include?("statusline.js") &&
         !settings.dig("statusLine", "command")&.include?("df-statusline.js")
        settings["statusLine"]["command"] = settings["statusLine"]["command"]
          .gsub("statusline.js", "df-statusline.js")
      end

      settings
    end

    def ensure_update_hook(settings)
      settings["hooks"] ||= {}
      settings["hooks"]["SessionStart"] ||= []

      has_hook = settings["hooks"]["SessionStart"].any? do |entry|
        entry["hooks"]&.any? { |h| h["command"]&.include?("df-check-update") }
      end

      unless has_hook
        settings["hooks"]["SessionStart"] << {
          "hooks" => [
            { "type" => "command", "command" => hook_command("df-check-update.js") }
          ]
        }
      end

      settings
    end

    def hook_command(hook_name)
      if scope == "global"
        hooks_path = "#{config_dir.gsub('\\', '/')}/hooks/#{hook_name}"
        "node \"#{hooks_path}\""
      else
        "node .claude/hooks/#{hook_name}"
      end
    end
  end
end
