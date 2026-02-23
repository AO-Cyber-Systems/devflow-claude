# frozen_string_literal: true

module ClaudeCode
  class PluginsController < ApplicationController
    def index
      @plugins = ClaudePlugin.all
    end

    def toggle
      plugin_id = params[:id]
      enabled = params[:enabled] == "true"
      ClaudePlugin.toggle(plugin_id, enabled)
      redirect_to claude_code_plugins_path, notice: "Plugin #{enabled ? 'enabled' : 'disabled'}"
    end
  end
end
