# frozen_string_literal: true

class ListUsers < MCP::Tool
  description "List all managed users in AOSentry."

  input_schema(properties: {})

  def self.call(server_context: nil)
    result = AOSentry.client.managed_users.list
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class CreateUser < MCP::Tool
  description "Create a new managed user."

  input_schema(
    properties: {
      user_email: { type: "string", description: "User email address" },
      user_alias: { type: "string", description: "Display name for the user" },
      user_role: { type: "string", description: "User role (e.g. admin, user)" },
      team_id: { type: "string", description: "Team to assign the user to" },
      max_budget: { type: "number", description: "Maximum budget for this user" },
      budget_duration: { type: "string", description: "Budget period (e.g. 30d, monthly)" },
      models: { type: "array", items: { type: "string" }, description: "Allowed models" },
      metadata: { type: "object", description: "Additional metadata" }
    },
  )

  def self.call(server_context: nil, **params)
    result = AOSentry.client.managed_users.create(**params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class UpdateUser < MCP::Tool
  description "Update an existing managed user."

  input_schema(
    properties: {
      user_id: { type: "string", description: "User ID to update" },
      user_email: { type: "string", description: "Updated email" },
      user_alias: { type: "string", description: "Updated display name" },
      user_role: { type: "string", description: "Updated role" },
      max_budget: { type: "number", description: "Updated budget limit" },
      models: { type: "array", items: { type: "string" }, description: "Updated allowed models" },
      metadata: { type: "object", description: "Updated metadata" }
    },
    required: ["user_id"]
  )

  def self.call(user_id:, server_context: nil, **params)
    result = AOSentry.client.managed_users.update(user_id: user_id, **params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class DeleteUser < MCP::Tool
  description "Delete a managed user."

  input_schema(
    properties: {
      user_id: { type: "string", description: "User ID to delete" }
    },
    required: ["user_id"]
  )

  def self.call(user_id:, server_context: nil)
    result = AOSentry.client.managed_users.delete(user_id: user_id)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end
