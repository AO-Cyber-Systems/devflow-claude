# frozen_string_literal: true

require "base64"

class TextToSpeech < MCP::Tool
  description "Convert text to speech audio using AI models. Returns base64-encoded audio data."

  input_schema(
    properties: {
      text: {
        type: "string",
        description: "The text to convert to speech"
      },
      voice: {
        type: "string",
        description: "Voice to use",
        enum: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
      },
      model: {
        type: "string",
        description: "TTS model to use (e.g. tts-1, tts-1-hd)"
      },
      response_format: {
        type: "string",
        description: "Audio format",
        enum: ["mp3", "opus", "aac", "flac", "wav", "pcm"]
      },
      speed: {
        type: "number",
        description: "Speech speed (0.25 to 4.0, default 1.0)",
        minimum: 0.25,
        maximum: 4.0
      }
    },
    required: ["text"]
  )

  def self.call(text:, voice: nil, model: nil, response_format: nil, speed: nil, server_context: nil)
    client = AOSentry.client

    options = { input: text }
    options[:voice] = voice if voice
    options[:model] = model if model
    options[:response_format] = response_format if response_format
    options[:speed] = speed if speed

    result = client.audio.speak(**options)
    audio_base64 = Base64.strict_encode64(result.audio_data)

    MCP::Tool::Response.new([{
      type: "text",
      text: JSON.pretty_generate({
        audio_base64: audio_base64,
        content_type: result.content_type,
        format: response_format || "mp3"
      })
    }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  end
end
