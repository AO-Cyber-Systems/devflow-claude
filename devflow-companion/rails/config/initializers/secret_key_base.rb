# Local-only app, doesn't need rotating secrets
# Generate a stable key from machine identity
require "digest"
Rails.application.config.secret_key_base = Digest::SHA256.hexdigest(
  "devflow-companion-#{Socket.gethostname}-#{File.expand_path('~')}"
)
