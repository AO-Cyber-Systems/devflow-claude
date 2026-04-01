# frozen_string_literal: true

class GetSpendSummary < MCP::Tool
  description "Get global spend summary across all API keys, with optional date filtering."

  input_schema(
    properties: {
      start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
      end_date: { type: "string", description: "End date (YYYY-MM-DD)" }
    },
  )

  def self.call(start_date: nil, end_date: nil, server_context: nil)
    params = {}
    params[:start_date] = start_date if start_date
    params[:end_date] = end_date if end_date
    result = AOSentry.client.spend.global_spend(**params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class GetSpendByKeys < MCP::Tool
  description "Get spend breakdown by API key."

  input_schema(
    properties: {
      start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
      end_date: { type: "string", description: "End date (YYYY-MM-DD)" }
    },
  )

  def self.call(start_date: nil, end_date: nil, server_context: nil)
    params = {}
    params[:start_date] = start_date if start_date
    params[:end_date] = end_date if end_date
    result = AOSentry.client.spend.keys(**params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class GetSpendByModels < MCP::Tool
  description "Get spend breakdown by model."

  input_schema(
    properties: {
      start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
      end_date: { type: "string", description: "End date (YYYY-MM-DD)" }
    },
  )

  def self.call(start_date: nil, end_date: nil, server_context: nil)
    params = {}
    params[:start_date] = start_date if start_date
    params[:end_date] = end_date if end_date
    result = AOSentry.client.spend.global_models(**params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class GetSpendByProvider < MCP::Tool
  description "Get spend breakdown by provider (OpenAI, Anthropic, etc.)."

  input_schema(
    properties: {
      start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
      end_date: { type: "string", description: "End date (YYYY-MM-DD)" }
    },
  )

  def self.call(start_date: nil, end_date: nil, server_context: nil)
    params = {}
    params[:start_date] = start_date if start_date
    params[:end_date] = end_date if end_date
    result = AOSentry.client.spend.by_provider(**params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end

class GetSpendLogs < MCP::Tool
  description "Get detailed spend logs for individual API calls."

  input_schema(
    properties: {
      start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
      end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
      limit: { type: "integer", description: "Maximum number of log entries to return" }
    },
  )

  def self.call(start_date: nil, end_date: nil, limit: nil, server_context: nil)
    params = {}
    params[:start_date] = start_date if start_date
    params[:end_date] = end_date if end_date
    params[:limit] = limit if limit
    result = AOSentry.client.spend.logs(**params)
    MCP::Tool::Response.new([{ type: "text", text: JSON.pretty_generate(result) }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end
