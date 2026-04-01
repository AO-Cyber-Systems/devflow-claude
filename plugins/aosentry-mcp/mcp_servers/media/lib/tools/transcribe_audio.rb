# frozen_string_literal: true

require "tempfile"
require "base64"

class TranscribeAudio < MCP::Tool
  description "Transcribe audio to text using AI speech-to-text models. Provide audio as base64-encoded data."

  input_schema(
    properties: {
      audio_base64: {
        type: "string",
        description: "Base64-encoded audio data"
      },
      filename: {
        type: "string",
        description: "Original filename with extension (e.g. recording.mp3) to help identify the audio format"
      },
      model: {
        type: "string",
        description: "STT model to use (e.g. whisper-1)"
      },
      language: {
        type: "string",
        description: "Language code in ISO-639-1 format (e.g. en, es, fr)"
      },
      response_format: {
        type: "string",
        description: "Output format",
        enum: ["json", "text", "srt", "vtt", "verbose_json"]
      }
    },
    required: ["audio_base64"]
  )

  def self.call(audio_base64:, filename: nil, model: nil, language: nil, response_format: nil, server_context: nil)
    client = AOSentry.client

    ext = filename ? File.extname(filename) : ".mp3"
    audio_file = Tempfile.new(["audio", ext])
    audio_file.binmode
    audio_file.write(Base64.decode64(audio_base64))
    audio_file.rewind

    options = { file: audio_file.path }
    options[:model] = model if model
    options[:language] = language if language
    options[:response_format] = response_format if response_format

    result = client.audio.transcribe(**options)

    MCP::Tool::Response.new([{
      type: "text",
      text: JSON.pretty_generate({
        text: result.text,
        language: result.language,
        duration: result.duration
      })
    }])
  rescue AOSentry::Error => e
    MCP::Tool::Response.new([{ type: "text", text: "Error: #{e.message}" }], error: true)
  ensure
    audio_file&.close!
  end
end
