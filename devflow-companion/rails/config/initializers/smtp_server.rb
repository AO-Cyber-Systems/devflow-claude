Rails.application.config.after_initialize do
  if defined?(Rails::Server) || defined?(Puma)
    SmtpServerManager.start
    at_exit { SmtpServerManager.stop }
  end
end
