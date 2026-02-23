# frozen_string_literal: true

module ClaudeCode
  class McpServersController < ApplicationController
    def index
      @mcp_servers = ClaudeSettings.mcp_servers
    end

    def create
      name = params[:name]
      command = params[:command]
      args = params[:args]&.split("\n")&.map(&:strip)&.reject(&:blank?) || []
      env_vars = parse_env_params

      return redirect_to(claude_code_mcp_servers_path, alert: "Name and command required") if name.blank? || command.blank?

      ClaudeSettings.update do |data|
        data["mcpServers"] ||= {}
        server = { "command" => command }
        server["args"] = args if args.any?
        server["env"] = env_vars if env_vars.any?
        data["mcpServers"][name] = server
      end

      redirect_to claude_code_mcp_servers_path, notice: "MCP server '#{name}' added"
    end

    def destroy
      name = params[:id]

      ClaudeSettings.update do |data|
        data["mcpServers"]&.delete(name)
        data.delete("mcpServers") if data["mcpServers"]&.empty?
      end

      redirect_to claude_code_mcp_servers_path, notice: "MCP server '#{name}' removed"
    end

    private

    def parse_env_params
      return {} unless params[:env_keys].present?

      keys = params[:env_keys].split("\n").map(&:strip)
      values = params[:env_values].split("\n").map(&:strip)

      keys.zip(values).reject { |k, _| k.blank? }.to_h
    end
  end
end
