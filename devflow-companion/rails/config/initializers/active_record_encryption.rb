# Active Record Encryption for proxy API keys
# Local-only app — derive deterministic keys from machine identity (same as secret_key_base)
require "digest"

base = "devflow-companion-#{Socket.gethostname}-#{File.expand_path('~')}"

Rails.application.config.active_record.encryption.primary_key = Digest::SHA256.hexdigest("#{base}-primary")
Rails.application.config.active_record.encryption.deterministic_key = Digest::SHA256.hexdigest("#{base}-deterministic")
Rails.application.config.active_record.encryption.key_derivation_salt = Digest::SHA256.hexdigest("#{base}-salt")
