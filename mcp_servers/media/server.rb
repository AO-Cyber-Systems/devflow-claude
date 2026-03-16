# frozen_string_literal: true

require "bundler/setup"
require "mcp"
require "aosentry"

# Disable SSL verification for self-signed certs (e.g. local puma-dev)
if ENV["AOSENTRY_SSL_VERIFY"] == "false"
  require "openssl"
  OpenSSL::SSL::SSLContext.prepend(Module.new do
    def set_params(params = {})
      params[:verify_mode] = OpenSSL::SSL::VERIFY_NONE
      super(params)
    end
  end)
end

# Load all tools
Dir[File.join(__dir__, "lib", "tools", "*.rb")].each { |f| require f }

# Configure AOSentry client from environment
AOSentry.configure do |config|
  config.base_url = ENV.fetch("AOSENTRY_URL")
  config.api_key = ENV.fetch("AOSENTRY_API_KEY")
end

# Initialize and start the MCP server
server = MCP::Server.new(
  name: "aosentry-media",
  version: "1.0.0",
  tools: [
    GenerateImage,
    EditImage,
    AnalyzeImage,
    TextToSpeech,
    TranscribeAudio,
    TranslateAudio
  ]
)

transport = MCP::Server::Transports::StdioTransport.new(server)
transport.open
