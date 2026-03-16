# frozen_string_literal: true

class GetHealthStatus < MCP::Tool
  description "Check the health status of the AOSentry instance, including all connected services."

  input_schema(properties: {})

  def self.call(server_context: nil)
    client = AOSentry.client
    health = client.health.check
    services = client.health.services

    MCP::Tool::Response.new([{
      type: "text",
      text: JSON.pretty_generate({ health: health, services: services })
    }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end
