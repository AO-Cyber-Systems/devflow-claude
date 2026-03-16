class ImessageBridgeService
  def initialize(event)
    @event = event
    @session = event.relay_session
  end

  def send_notification
    return unless @session.imessage_enabled?
    recipient = Setting.get("imessage_recipient")
    return if recipient.blank?

    message = format_message
    script = build_applescript(recipient, message)

    output = `osascript -e #{Shellwords.escape(script)} 2>&1`
    success = $?.success?

    @event.notification_sends.create!(
      channel: "imessage",
      status: success ? "sent" : "failed",
      sent_at: success ? Time.current : nil,
      error_message: success ? nil : output.strip
    )

    success
  rescue => e
    Rails.logger.error("iMessage bridge error: #{e.message}")
    false
  end

  private

  def format_message
    emoji = @session.color_emoji || "white_circle"
    lines = []
    lines << ":#{emoji}: [#{@session.project_name || @session.name}/#{@session.branch || 'main'} -- #{@session.ide || 'cli'}]"
    lines << ""

    case @event.event_type
    when "action_request"
      classification = @event.classification.present? ? @event.classification.upcase : "ACTION"
      lines << "[#{classification}] #{@event.tool_name}"
      lines << @event.command.to_s.truncate(200) if @event.command.present?
    when "question"
      action_data = @event.action_data || {}
      lines << action_data["question"].to_s.truncate(300) if action_data["question"].present?
      options = action_data["options"] || []
      options.each_with_index { |opt, i| lines << "  #{i + 1}. #{opt}" }
    end

    lines << ""
    lines << "Reply at #{Setting.get('relay_tunnel_url', 'http://localhost:3100/relay')}"
    lines.join("\n")
  end

  def build_applescript(recipient, message)
    escaped = message.gsub("\\", "\\\\\\\\").gsub('"', '\\"')
    <<~APPLESCRIPT
      tell application "Messages"
        set targetService to 1st account whose service type = iMessage
        set targetBuddy to participant "#{recipient}" of targetService
        send "#{escaped}" to targetBuddy
      end tell
    APPLESCRIPT
  end
end
