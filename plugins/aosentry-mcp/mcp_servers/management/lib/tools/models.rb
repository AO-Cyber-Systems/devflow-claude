# frozen_string_literal: true

class ListModels < MCP::Tool
  description "List all available AI models in AOSentry."

  input_schema(
    properties: {
      extended: { type: "boolean", description: "Include extended model info (pricing, context window, etc.)" }
    },
  )

  def self.call(extended: nil, server_context: nil)
    options = {}
    options[:extended] = extended unless extended.nil?
    result = AOSentry.client.models.list(**options)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class GetModelInfo < MCP::Tool
  description "Get detailed information about a specific model."

  input_schema(
    properties: {
      model: { type: "string", description: "Model ID (e.g. gpt-4o, claude-sonnet-4-20250514)" }
    },
    required: ["model"]
  )

  def self.call(model:, server_context: nil)
    result = AOSentry.client.models.retrieve(model)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result.to_h) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end
