# frozen_string_literal: true

class ListCredentials < MCP::Tool
  description "List all LLM provider credentials configured in AOSentry."

  input_schema(properties: {})

  def self.call(server_context: nil)
    result = AOSentry.client.credentials.list
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class CreateCredential < MCP::Tool
  description "Create a new LLM provider credential."

  input_schema(
    properties: {
      provider: { type: "string", description: "Provider name (e.g. openai, anthropic, google)" },
      api_key: { type: "string", description: "API key for the provider" },
      name: { type: "string", description: "Human-readable name for this credential" },
      metadata: { type: "object", description: "Additional provider-specific configuration" }
    },
    required: ["provider", "api_key"]
  )

  def self.call(server_context: nil, **params)
    result = AOSentry.client.credentials.create(**params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class UpdateCredential < MCP::Tool
  description "Update an existing LLM provider credential."

  input_schema(
    properties: {
      id: { type: "string", description: "Credential ID to update" },
      api_key: { type: "string", description: "Updated API key" },
      name: { type: "string", description: "Updated name" },
      metadata: { type: "object", description: "Updated metadata" }
    },
    required: ["id"]
  )

  def self.call(id:, server_context: nil, **params)
    result = AOSentry.client.credentials.update(id, **params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class DeleteCredential < MCP::Tool
  description "Delete an LLM provider credential."

  input_schema(
    properties: {
      id: { type: "string", description: "Credential ID to delete" }
    },
    required: ["id"]
  )

  def self.call(id:, server_context: nil)
    result = AOSentry.client.credentials.delete(id)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end
