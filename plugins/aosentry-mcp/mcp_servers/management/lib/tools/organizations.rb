# frozen_string_literal: true

class ListOrgs < MCP::Tool
  description "List all organizations in AOSentry."

  input_schema(properties: {})

  def self.call(server_context: nil)
    result = AOSentry.client.organizations.list
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class CreateOrg < MCP::Tool
  description "Create a new organization."

  input_schema(
    properties: {
      organization_alias: { type: "string", description: "Organization display name" },
      max_budget: { type: "number", description: "Maximum budget" },
      budget_duration: { type: "string", description: "Budget period" },
      models: { type: "array", items: { type: "string" }, description: "Allowed models" },
      metadata: { type: "object", description: "Additional metadata" }
    },
  )

  def self.call(server_context: nil, **params)
    result = AOSentry.client.organizations.create(**params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class UpdateOrg < MCP::Tool
  description "Update an existing organization."

  input_schema(
    properties: {
      organization_id: { type: "string", description: "Organization ID to update" },
      organization_alias: { type: "string", description: "Updated name" },
      max_budget: { type: "number", description: "Updated budget limit" },
      models: { type: "array", items: { type: "string" }, description: "Updated allowed models" },
      metadata: { type: "object", description: "Updated metadata" }
    },
    required: ["organization_id"]
  )

  def self.call(organization_id:, server_context: nil, **params)
    result = AOSentry.client.organizations.update(organization_id: organization_id, **params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class DeleteOrg < MCP::Tool
  description "Delete an organization."

  input_schema(
    properties: {
      organization_id: { type: "string", description: "Organization ID to delete" }
    },
    required: ["organization_id"]
  )

  def self.call(organization_id:, server_context: nil)
    result = AOSentry.client.organizations.delete(organization_id: organization_id)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end
