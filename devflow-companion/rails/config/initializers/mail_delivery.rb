Rails.application.config.action_mailer.delivery_method = :smtp
Rails.application.config.action_mailer.smtp_settings = {
  address: "127.0.0.1",
  port: 1025
}
