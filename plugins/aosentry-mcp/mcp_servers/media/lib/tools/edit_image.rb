# frozen_string_literal: true

require "tempfile"
require "base64"

class EditImage < MCP::Tool
  description "Edit an existing image using a text prompt. Provide the image as base64-encoded data. Optionally provide a mask to specify which areas to edit."

  input_schema(
    properties: {
      image_base64: {
        type: "string",
        description: "Base64-encoded image data (PNG format required)"
      },
      prompt: {
        type: "string",
        description: "Text description of the desired edit"
      },
      mask_base64: {
        type: "string",
        description: "Base64-encoded mask image (PNG with transparency indicating edit areas)"
      },
      model: {
        type: "string",
        description: "Model to use (e.g. dall-e-2)"
      },
      size: {
        type: "string",
        description: "Output image size",
        enum: ["256x256", "512x512", "1024x1024"]
      },
      n: {
        type: "integer",
        description: "Number of images to generate",
        minimum: 1,
        maximum: 10
      }
    },
    required: ["image_base64", "prompt"]
  )

  def self.call(image_base64:, prompt:, mask_base64: nil, model: nil, size: nil, n: nil, server_context: nil)
    client = AOSentry.client

    image_file = decode_to_tempfile(image_base64, "image", ".png")
    mask_file = mask_base64 ? decode_to_tempfile(mask_base64, "mask", ".png") : nil

    options = { image: image_file.path, prompt: prompt }
    options[:mask] = mask_file.path if mask_file
    options[:model] = model if model
    options[:size] = size if size
    options[:n] = n if n

    result = client.images.edit(**options)
    images = result.images.map { |img| { url: img.url, revised_prompt: img.revised_prompt } }

    MCP::Tool::Response.new([{
      type: "text",
      text: JSON.pretty_generate({ images: images })
    }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  ensure
    image_file&.close!
    mask_file&.close!
  end

  def self.decode_to_tempfile(base64_data, prefix, suffix)
    tempfile = Tempfile.new([prefix, suffix])
    tempfile.binmode
    tempfile.write(Base64.decode64(base64_data))
    tempfile.rewind
    tempfile
  end
end
