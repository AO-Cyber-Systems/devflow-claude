require "midi-smtp-server"

class SmtpServer < MidiSmtpServer::Smtpd

  def initialize(port: 1025, host: "127.0.0.1")
    super(
      ports: port.to_s,
      hosts: host,
      max_processings: 4,
      auth_mode: :AUTH_FORBIDDEN,
      tls_mode: :TLS_FORBIDDEN,
      logger_severity: Logger::INFO
    )
  end

  def on_message_data_event(ctx)
    raw_data = ctx[:message][:data]
    MailMessage.create_from_raw(raw_data)
    Rails.logger.info "[MailCatcher] Message received (#{raw_data.bytesize} bytes)"
  rescue => e
    Rails.logger.error "[MailCatcher] Error processing message: #{e.message}"
  end

end
