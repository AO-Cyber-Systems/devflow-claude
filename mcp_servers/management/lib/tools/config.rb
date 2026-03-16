# frozen_string_literal: true

class ListConfigs < MCP::Tool
  description "List all runtime configuration settings in AOSentry."

  input_schema(properties: {})

  def self.call(server_context: nil)
    result = AOSentry.client.remote_config.list
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class UpdateConfig < MCP::Tool
  description "Update a runtime configuration setting."

  input_schema(
    properties: {
      key: { type: "string", description: "Configuration key to update" },
      value: { type: "string", description: "New value for the configuration key" }
    },
    required: ["key", "value"]
  )

  def self.call(key:, value:, server_context: nil)
    result = AOSentry.client.remote_config.update(key: key, value: value)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end
