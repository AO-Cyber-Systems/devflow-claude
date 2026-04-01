# frozen_string_literal: true

class GenerateImage < MCP::Tool
  description "Generate images from a text prompt using AI models (DALL-E, etc.) through AOSentry's proxy pipeline with guardrails and spend tracking."

  input_schema(
    properties: {
      prompt: {
        type: "string",
        description: "Text description of the image to generate"
      },
      model: {
        type: "string",
        description: "Model to use (e.g. dall-e-3, dall-e-2). Defaults to dall-e-3."
      },
      size: {
        type: "string",
        description: "Image size: 256x256, 512x512, 1024x1024, 1792x1024, or 1024x1792",
        enum: ["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"]
      },
      quality: {
        type: "string",
        description: "Image quality: standard or hd",
        enum: ["standard", "hd"]
      },
      n: {
        type: "integer",
        description: "Number of images to generate (1-10)",
        minimum: 1,
        maximum: 10
      },
      style: {
        type: "string",
        description: "Image style: vivid or natural",
        enum: ["vivid", "natural"]
      }
    },
    required: ["prompt"]
  )

  def self.call(prompt:, model: nil, size: nil, quality: nil, n: nil, style: nil, server_context: nil)
    client = AOSentry.client
    options = { prompt: prompt }
    options[:model] = model if model
    options[:size] = size if size
    options[:quality] = quality if quality
    options[:n] = n if n
    options[:style] = style if style

    result = client.images.generate(**options)
    images = result.images.map { |img| { url: img.url, revised_prompt: img.revised_prompt } }

    MCP::Tool::Response.new([{
      type: "text",
      text: JSON.pretty_generate({ images: images })
    }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end
