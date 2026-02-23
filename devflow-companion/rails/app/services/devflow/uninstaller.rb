# frozen_string_literal: true

module Devflow
  # Ports uninstall() from bin/install.js.
  # Removes skills, agents, devflow dir, hooks, package.json.
  # Cleans hook entries from settings.json.
  class Uninstaller
    attr_reader :config_dir

    def initialize(config_dir:)
      @config_dir = config_dir
    end

    def uninstall!
      return { success: false, error: "Directory not found" } unless File.directory?(config_dir)

      results = []
      results << remove_skills
      results << remove_legacy_commands
      results << remove_devflow_dir
      results << remove_agents
      results << remove_hooks
      results << remove_package_json
      results << clean_settings
      results << remove_manifest

      # Update installation record
      installation = DevflowInstallation.for_config_dir(config_dir).first
      installation&.update!(status: "uninstalled")

      { success: true, results: results }
    end

    private

    def remove_skills
      skills_dir = File.join(config_dir, "skills")
      return { component: "skills", removed: 0 } unless File.directory?(skills_dir)

      count = 0
      Dir.children(skills_dir).each do |entry|
        full = File.join(skills_dir, entry)
        if File.directory?(full) && entry.start_with?("df-")
          FileUtils.rm_rf(full)
          count += 1
        end
      end
      { component: "skills", removed: count }
    end

    def remove_legacy_commands
      legacy = File.join(config_dir, "commands", "df")
      if File.directory?(legacy)
        FileUtils.rm_rf(legacy)
        { component: "legacy_commands", removed: true }
      else
        { component: "legacy_commands", removed: false }
      end
    end

    def remove_devflow_dir
      df_dir = File.join(config_dir, "devflow")
      if File.directory?(df_dir)
        FileUtils.rm_rf(df_dir)
        { component: "devflow", removed: true }
      else
        { component: "devflow", removed: false }
      end
    end

    def remove_agents
      agents_dir = File.join(config_dir, "agents")
      return { component: "agents", removed: 0 } unless File.directory?(agents_dir)

      count = 0
      Dir.children(agents_dir).each do |file|
        if file.start_with?("df-") && file.end_with?(".md")
          File.delete(File.join(agents_dir, file))
          count += 1
        end
      end
      { component: "agents", removed: count }
    end

    def remove_hooks
      hooks_dir = File.join(config_dir, "hooks")
      return { component: "hooks", removed: 0 } unless File.directory?(hooks_dir)

      df_hooks = %w[df-statusline.js df-check-update.js df-check-update.sh]
      count = 0
      df_hooks.each do |hook|
        hook_path = File.join(hooks_dir, hook)
        if File.exist?(hook_path)
          File.delete(hook_path)
          count += 1
        end
      end
      { component: "hooks", removed: count }
    end

    def remove_package_json
      pkg_path = File.join(config_dir, "package.json")
      if File.exist?(pkg_path)
        content = File.read(pkg_path).strip
        if content == '{"type":"commonjs"}'
          File.delete(pkg_path)
          return { component: "package_json", removed: true }
        end
      end
      { component: "package_json", removed: false }
    end

    def clean_settings
      settings_path = File.join(config_dir, "settings.json")
      return { component: "settings", modified: false } unless File.exist?(settings_path)

      settings = JSON.parse(File.read(settings_path))
      modified = false

      # Remove statusline
      if settings.dig("statusLine", "command")&.include?("df-statusline")
        settings.delete("statusLine")
        modified = true
      end

      # Remove SessionStart hooks
      if settings.dig("hooks", "SessionStart")
        before = settings["hooks"]["SessionStart"].length
        settings["hooks"]["SessionStart"] = settings["hooks"]["SessionStart"].reject do |entry|
          entry["hooks"]&.any? do |h|
            h["command"]&.include?("df-check-update") || h["command"]&.include?("df-statusline")
          end
        end

        if settings["hooks"]["SessionStart"].length < before
          modified = true
        end

        settings["hooks"].delete("SessionStart") if settings["hooks"]["SessionStart"].empty?
        settings.delete("hooks") if settings["hooks"]&.empty?
      end

      if modified
        File.write(settings_path, JSON.pretty_generate(settings) + "\n")
      end

      { component: "settings", modified: modified }
    rescue JSON::ParserError
      { component: "settings", modified: false, error: "Invalid JSON" }
    end

    def remove_manifest
      manifest_path = File.join(config_dir, "df-file-manifest.json")
      if File.exist?(manifest_path)
        File.delete(manifest_path)
        { component: "manifest", removed: true }
      else
        { component: "manifest", removed: false }
      end
    end
  end
end
