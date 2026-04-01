# frozen_string_literal: true

class ListTeams < MCP::Tool
  description "List all teams in AOSentry."

  input_schema(properties: {})

  def self.call(server_context: nil)
    result = AOSentry.client.teams.list
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class CreateTeam < MCP::Tool
  description "Create a new team."

  input_schema(
    properties: {
      team_alias: { type: "string", description: "Team display name" },
      organization_id: { type: "string", description: "Organization to assign the team to" },
      max_budget: { type: "number", description: "Maximum budget for this team" },
      budget_duration: { type: "string", description: "Budget period" },
      models: { type: "array", items: { type: "string" }, description: "Allowed models" },
      metadata: { type: "object", description: "Additional metadata" }
    },
  )

  def self.call(server_context: nil, **params)
    result = AOSentry.client.teams.create(**params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class UpdateTeam < MCP::Tool
  description "Update an existing team."

  input_schema(
    properties: {
      team_id: { type: "string", description: "Team ID to update" },
      team_alias: { type: "string", description: "Updated team name" },
      max_budget: { type: "number", description: "Updated budget limit" },
      models: { type: "array", items: { type: "string" }, description: "Updated allowed models" },
      metadata: { type: "object", description: "Updated metadata" }
    },
    required: ["team_id"]
  )

  def self.call(team_id:, server_context: nil, **params)
    result = AOSentry.client.teams.update(team_id: team_id, **params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class DeleteTeam < MCP::Tool
  description "Delete a team."

  input_schema(
    properties: {
      team_id: { type: "string", description: "Team ID to delete" }
    },
    required: ["team_id"]
  )

  def self.call(team_id:, server_context: nil)
    result = AOSentry.client.teams.delete(team_id: team_id)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class AddTeamMember < MCP::Tool
  description "Add a user to a team."

  input_schema(
    properties: {
      team_id: { type: "string", description: "Team ID" },
      user_id: { type: "string", description: "User ID to add" },
      role: { type: "string", description: "Role within the team" }
    },
    required: ["team_id", "user_id"]
  )

  def self.call(team_id:, user_id:, role: nil, server_context: nil)
    params = { team_id: team_id, user_id: user_id }
    params[:role] = role if role
    result = AOSentry.client.teams.member_add(**params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class RemoveTeamMember < MCP::Tool
  description "Remove a user from a team."

  input_schema(
    properties: {
      team_id: { type: "string", description: "Team ID" },
      user_id: { type: "string", description: "User ID to remove" }
    },
    required: ["team_id", "user_id"]
  )

  def self.call(team_id:, user_id:, server_context: nil)
    result = AOSentry.client.teams.member_delete(team_id: team_id, user_id: user_id)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end
