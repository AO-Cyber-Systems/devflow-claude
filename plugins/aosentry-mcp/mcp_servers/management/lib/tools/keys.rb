# frozen_string_literal: true

class ListKeys < MCP::Tool
  description "List all API keys managed by AOSentry."

  input_schema(properties: {})

  def self.call(server_context: nil)
    result = AOSentry.client.keys.list
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class GenerateKey < MCP::Tool
  description "Generate a new API key."

  input_schema(
    properties: {
      key_alias: { type: "string", description: "Human-readable name for the key" },
      user_id: { type: "string", description: "User ID to associate with the key" },
      team_id: { type: "string", description: "Team ID to associate with the key" },
      budget_id: { type: "string", description: "Budget ID to associate with the key" },
      models: { type: "array", items: { type: "string" }, description: "Allowed models for this key" },
      max_budget: { type: "number", description: "Maximum budget for this key" },
      duration: { type: "string", description: "Key validity duration (e.g. 30d, 1h)" },
      metadata: { type: "object", description: "Additional metadata" },
      tags: { type: "array", items: { type: "string" }, description: "Tags for the key" }
    },
  )

  def self.call(server_context: nil, **params)
    result = AOSentry.client.keys.generate(**params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class GetKeyInfo < MCP::Tool
  description "Get detailed information about a specific API key."

  input_schema(
    properties: {
      key: { type: "string", description: "The API key or key hash to look up" }
    },
    required: ["key"]
  )

  def self.call(key:, server_context: nil)
    result = AOSentry.client.keys.info(key: key)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class RotateKey < MCP::Tool
  description "Rotate (regenerate) an API key, invalidating the old one."

  input_schema(
    properties: {
      key: { type: "string", description: "The API key to rotate" }
    },
    required: ["key"]
  )

  def self.call(key:, server_context: nil)
    result = AOSentry.client.keys.regenerate(key)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class BlockKey < MCP::Tool
  description "Block an API key, preventing it from being used."

  input_schema(
    properties: {
      key: { type: "string", description: "The API key to block" }
    },
    required: ["key"]
  )

  def self.call(key:, server_context: nil)
    result = AOSentry.client.keys.block(key: key)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class UnblockKey < MCP::Tool
  description "Unblock a previously blocked API key."

  input_schema(
    properties: {
      key: { type: "string", description: "The API key to unblock" }
    },
    required: ["key"]
  )

  def self.call(key:, server_context: nil)
    result = AOSentry.client.keys.unblock(key: key)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class DeleteKey < MCP::Tool
  description "Permanently delete an API key."

  input_schema(
    properties: {
      key: { type: "string", description: "The API key to delete" }
    },
    required: ["key"]
  )

  def self.call(key:, server_context: nil)
    result = AOSentry.client.keys.delete(key: key)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end
