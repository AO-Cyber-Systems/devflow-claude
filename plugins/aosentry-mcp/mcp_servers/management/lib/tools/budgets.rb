# frozen_string_literal: true

class ListBudgets < MCP::Tool
  description "List all budgets configured in AOSentry."

  input_schema(properties: {})

  def self.call(server_context: nil)
    result = AOSentry.client.budgets.list
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class CreateBudget < MCP::Tool
  description "Create a new budget."

  input_schema(
    properties: {
      max_budget: { type: "number", description: "Maximum budget amount in USD" },
      budget_duration: { type: "string", description: "Budget period (e.g. monthly, daily, 30d)" },
      soft_budget: { type: "number", description: "Soft limit that triggers alerts" },
      metadata: { type: "object", description: "Additional metadata" }
    },
    required: ["max_budget"]
  )

  def self.call(server_context: nil, **params)
    result = AOSentry.client.budgets.create(**params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class UpdateBudget < MCP::Tool
  description "Update an existing budget."

  input_schema(
    properties: {
      budget_id: { type: "string", description: "Budget ID to update" },
      max_budget: { type: "number", description: "Updated maximum budget" },
      budget_duration: { type: "string", description: "Updated budget period" },
      soft_budget: { type: "number", description: "Updated soft limit" }
    },
    required: ["budget_id"]
  )

  def self.call(budget_id:, server_context: nil, **params)
    result = AOSentry.client.budgets.update(budget_id: budget_id, **params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class DeleteBudget < MCP::Tool
  description "Delete a budget."

  input_schema(
    properties: {
      budget_id: { type: "string", description: "Budget ID to delete" }
    },
    required: ["budget_id"]
  )

  def self.call(budget_id:, server_context: nil)
    result = AOSentry.client.budgets.delete(budget_id: budget_id)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class GetBudgetInfo < MCP::Tool
  description "Get detailed information about a specific budget."

  input_schema(
    properties: {
      budget_id: { type: "string", description: "Budget ID" }
    },
    required: ["budget_id"]
  )

  def self.call(budget_id:, server_context: nil)
    result = AOSentry.client.budgets.info(budget_id: budget_id)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end
