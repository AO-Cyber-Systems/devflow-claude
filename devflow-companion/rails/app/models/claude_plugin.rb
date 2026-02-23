# frozen_string_literal: true

# Plain Ruby object reading ~/.claude/plugins/installed_plugins.json
class ClaudePlugin
  PLUGINS_PATH = File.expand_path("~/.claude/plugins/installed_plugins.json")

  PluginInfo = Struct.new(:id, :name, :version, :marketplace, :install_date, :enabled, keyword_init: true)

  class << self
    def all
      installed = read_installed
      enabled = ClaudeSettings.enabled_plugins

      installed.map do |plugin_id, records|
        # plugin_id is like "frontend-design@claude-plugins-official"
        record = records.is_a?(Array) ? records.first : records
        name, marketplace = plugin_id.split("@", 2)

        PluginInfo.new(
          id: plugin_id,
          name: name,
          version: record&.dig("version"),
          marketplace: marketplace,
          install_date: record&.dig("installedAt"),
          enabled: enabled.include?(plugin_id)
        )
      end
    end

    def toggle(plugin_id, enabled)
      ClaudeSettings.update do |data|
        data["enabledPlugins"] ||= []
        if enabled
          data["enabledPlugins"] << plugin_id unless data["enabledPlugins"].include?(plugin_id)
        else
          data["enabledPlugins"].delete(plugin_id)
        end
      end
    end

    private

    def read_installed
      return {} unless File.exist?(PLUGINS_PATH)
      data = JSON.parse(File.read(PLUGINS_PATH))
      data["plugins"] || {}
    rescue JSON::ParserError
      {}
    end
  end
end
