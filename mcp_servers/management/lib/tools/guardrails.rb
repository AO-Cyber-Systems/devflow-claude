# frozen_string_literal: true

class ListGuardrails < MCP::Tool
  description "List all guardrails configured in AOSentry."

  input_schema(properties: {})

  def self.call(server_context: nil)
    result = AOSentry.client.managed_guardrails.list
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class GetGuardrail < MCP::Tool
  description "Get details of a specific guardrail by ID."

  input_schema(
    properties: {
      id: { type: "string", description: "Guardrail ID" }
    },
    required: ["id"]
  )

  def self.call(id:, server_context: nil)
    result = AOSentry.client.managed_guardrails.retrieve(id)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class CreateGuardrail < MCP::Tool
  description "Create a new guardrail rule."

  input_schema(
    properties: {
      name: { type: "string", description: "Guardrail name" },
      guardrail_type: { type: "string", description: "Type of guardrail (e.g. content_filter, pii_detection, topic_block)" },
      stage: { type: "string", description: "When to apply: pre (before LLM) or post (after LLM)", enum: ["pre", "post"] },
      action: { type: "string", description: "Action on match: block, redact, or log", enum: ["block", "redact", "log"] },
      config: { type: "object", description: "Guardrail-specific configuration" },
      enabled: { type: "boolean", description: "Whether the guardrail is active" }
    },
    required: ["name", "guardrail_type"]
  )

  def self.call(server_context: nil, **params)
    result = AOSentry.client.managed_guardrails.create(**params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class UpdateGuardrail < MCP::Tool
  description "Update an existing guardrail."

  input_schema(
    properties: {
      id: { type: "string", description: "Guardrail ID" },
      name: { type: "string", description: "Guardrail name" },
      guardrail_type: { type: "string", description: "Type of guardrail" },
      stage: { type: "string", description: "When to apply: pre or post" },
      action: { type: "string", description: "Action on match: block, redact, or log" },
      config: { type: "object", description: "Guardrail-specific configuration" },
      enabled: { type: "boolean", description: "Whether the guardrail is active" }
    },
    required: ["id"]
  )

  def self.call(id:, server_context: nil, **params)
    result = AOSentry.client.managed_guardrails.update(id, **params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class DeleteGuardrail < MCP::Tool
  description "Delete a guardrail by ID."

  input_schema(
    properties: {
      id: { type: "string", description: "Guardrail ID" }
    },
    required: ["id"]
  )

  def self.call(id:, server_context: nil)
    result = AOSentry.client.managed_guardrails.delete(id)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class GetGuardrailLogs < MCP::Tool
  description "Get logs of guardrail activations (blocks, redactions, etc.)."

  input_schema(
    properties: {
      start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
      end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
      guardrail_id: { type: "string", description: "Filter by specific guardrail ID" },
      limit: { type: "integer", description: "Maximum number of log entries" }
    },
  )

  def self.call(server_context: nil, **params)
    result = AOSentry.client.managed_guardrails.logs(**params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class GetGuardrailStats < MCP::Tool
  description "Get aggregate statistics on guardrail activations."

  input_schema(
    properties: {
      start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
      end_date: { type: "string", description: "End date (YYYY-MM-DD)" }
    },
  )

  def self.call(server_context: nil, **params)
    result = AOSentry.client.managed_guardrails.log_stats(**params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end
