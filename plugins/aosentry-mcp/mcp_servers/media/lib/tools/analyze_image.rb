# frozen_string_literal: true

class AnalyzeImage < MCP::Tool
  description "Analyze an image using a vision-capable AI model. Provide an image URL and an optional prompt describing what to analyze."

  input_schema(
    properties: {
      image_url: {
        type: "string",
        description: "URL of the image to analyze"
      },
      prompt: {
        type: "string",
        description: "What to analyze about the image (default: 'Describe this image in detail')"
      },
      model: {
        type: "string",
        description: "Vision-capable model to use (e.g. gpt-4o, claude-sonnet-4-20250514)"
      }
    },
    required: ["image_url"]
  )

  def self.call(image_url:, prompt: nil, model: nil, server_context: nil)
    client = AOSentry.client
    analysis_prompt = prompt || "Describe this image in detail"

    messages = [{
      role: "user",
      content: [
        { type: "text", text: analysis_prompt },
        { type: "image_url", image_url: { url: image_url } }
      ]
    }]

    options = { messages: messages }
    options[:model] = model if model

    result = client.chat.create(**options)

    MCP::Tool::Response.new([{
      type: "text",
      text: result.content
    }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end
