# frozen_string_literal: true

# Plain Ruby object wrapping ~/.claude/settings.json.
# Provides atomic read-modify-write to prevent clobbering.
class ClaudeSettings
  SETTINGS_PATH = File.expand_path("~/.claude/settings.json")

  class << self
    def read
      return {} unless File.exist?(SETTINGS_PATH)
      JSON.parse(File.read(SETTINGS_PATH))
    rescue JSON::ParserError
      {}
    end

    def write(data)
      FileUtils.mkdir_p(File.dirname(SETTINGS_PATH))
      File.write(SETTINGS_PATH, JSON.pretty_generate(data) + "\n")
    end

    def update
      data = read
      yield data
      write(data)
      data
    end

    # Convenience readers

    def hooks
      read["hooks"] || {}
    end

    def status_line
      read["statusLine"]
    end

    def permissions
      data = read
      {
        "allow" => data["permissions"]&.dig("allow") || [],
        "deny" => data["permissions"]&.dig("deny") || [],
        "skipDangerousModePermissionPrompt" => data["skipDangerousModePermissionPrompt"] || false
      }
    end

    def enabled_plugins
      read["enabledPlugins"] || []
    end

    def mcp_servers
      read["mcpServers"] || {}
    end

    def env
      read["env"] || {}
    end

    def attribution
      read["attribution"] || {}
    end
  end
end
