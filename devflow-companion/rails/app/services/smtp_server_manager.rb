class SmtpServerManager
  PORT = 1025
  HOST = "127.0.0.1"

  class << self
    def start
      return if @server && !@server.stopped?

      @error = nil
      @server = SmtpServer.new(port: PORT, host: HOST)
      @thread = Thread.new do
        @server.start
      rescue Errno::EADDRINUSE => e
        @error = "Port #{PORT} already in use"
        Rails.logger.warn "[MailCatcher] #{@error}"
      rescue => e
        @error = e.message
        Rails.logger.error "[MailCatcher] SMTP server error: #{e.message}"
      end

      # Give the server a moment to bind
      sleep 0.2

      if @error
        @server = nil
        @thread = nil
      else
        Rails.logger.info "[MailCatcher] SMTP server started on #{HOST}:#{PORT}"
      end
    end

    def stop
      return unless @server

      @server.stop
      @thread&.join(5)
      @server = nil
      @thread = nil
      @error = nil
      Rails.logger.info "[MailCatcher] SMTP server stopped"
    rescue => e
      Rails.logger.error "[MailCatcher] Error stopping SMTP server: #{e.message}"
    end

    def running?
      @server && !@server.stopped?
    end

    def status
      if running?
        { status: "running", port: PORT, error: nil }
      elsif @error
        { status: "error", port: PORT, error: @error }
      else
        { status: "stopped", port: PORT, error: nil }
      end
    end
  end
end
