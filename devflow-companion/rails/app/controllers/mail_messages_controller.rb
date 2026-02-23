class MailMessagesController < ApplicationController
  def index
    @messages = MailMessage.recent.limit(200)
    @smtp_status = SmtpServerManager.status
    @stats = {
      total: MailMessage.count,
      unread: MailMessage.unread.count,
      today: MailMessage.today.count
    }

    respond_to do |format|
      format.html
      format.turbo_stream { render turbo_stream: turbo_stream.replace("mail-inbox", partial: "mail_messages/inbox", locals: { messages: @messages, stats: @stats, smtp_status: @smtp_status }) }
    end
  end

  def show
    @message = MailMessage.find(params[:id])
    @message.mark_read!
  end

  def destroy
    message = MailMessage.find(params[:id])
    message.destroy
    redirect_to mail_messages_path, notice: "Message deleted."
  end

  def destroy_all
    MailMessage.delete_all
    redirect_to mail_messages_path, notice: "All messages deleted."
  end

  def body
    @message = MailMessage.find(params[:id])
    render html: (@message.body_html || "").html_safe, layout: false
  end

  def toggle_read
    message = MailMessage.find(params[:id])
    message.toggle_read!
    redirect_back fallback_location: mail_messages_path
  end
end
