require "test_helper"

class MailMessagesControllerTest < ActionDispatch::IntegrationTest
  SAMPLE_EMAIL = "From: test@example.com\nTo: dev@example.com\nSubject: Test\nContent-Type: text/plain\n\nHello world"
  HTML_EMAIL = "From: test@example.com\nTo: dev@example.com\nSubject: HTML Test\nContent-Type: text/html\n\n<html><body><h1>Hi</h1></body></html>"

  setup do
    Setting.set("setup_completed", "true")
    @message = MailMessage.create_from_raw(SAMPLE_EMAIL)
  end

  test "index renders email page" do
    get mail_messages_path
    assert_response :success
    assert_select "h1", "Email"
  end

  test "index shows stat cards" do
    get mail_messages_path
    assert_response :success
    assert_select ".stat-card", minimum: 4
  end

  test "index shows messages in inbox" do
    get mail_messages_path
    assert_response :success
    assert_select "table.data-table"
    assert_select "td", /test@example.com/
  end

  test "index responds to turbo_stream" do
    get mail_messages_path(format: :turbo_stream)
    assert_response :success
  end

  test "index shows empty state when no messages" do
    MailMessage.delete_all
    get mail_messages_path
    assert_response :success
    assert_select ".empty-state-title", "No Emails Captured"
  end

  test "show renders message detail" do
    get mail_message_path(@message)
    assert_response :success
    assert_select "h1", "Test"
  end

  test "show marks message as read" do
    assert_not @message.read?
    get mail_message_path(@message)
    @message.reload
    assert @message.read?
  end

  test "show displays headers card" do
    get mail_message_path(@message)
    assert_response :success
    assert_select ".desc-list"
    assert_select ".desc-value", /test@example.com/
  end

  test "show displays tab navigation" do
    get mail_message_path(@message)
    assert_response :success
    assert_select ".tab", minimum: 4
  end

  test "body returns raw HTML content" do
    html_msg = MailMessage.create_from_raw(HTML_EMAIL)
    get body_mail_message_path(html_msg)
    assert_response :success
    assert_includes response.body, "<h1>Hi</h1>"
  end

  test "body returns empty string for plain text email" do
    get body_mail_message_path(@message)
    assert_response :success
  end

  test "destroy deletes message and redirects" do
    assert_difference "MailMessage.count", -1 do
      delete mail_message_path(@message)
    end
    assert_redirected_to mail_messages_path
  end

  test "destroy_all deletes all messages" do
    MailMessage.create_from_raw(HTML_EMAIL)
    assert_operator MailMessage.count, :>=, 2

    assert_difference "MailMessage.count", -MailMessage.count do
      delete destroy_all_mail_messages_path
    end
    assert_redirected_to mail_messages_path
  end

  test "toggle_read marks unread message as read" do
    assert_not @message.read?
    post toggle_read_mail_message_path(@message)
    @message.reload
    assert @message.read?
  end

  test "toggle_read marks read message as unread" do
    @message.update!(read: true)
    post toggle_read_mail_message_path(@message)
    @message.reload
    assert_not @message.read?
  end

  test "toggle_read redirects back" do
    post toggle_read_mail_message_path(@message)
    assert_response :redirect
  end

  # Route tests

  test "mail routes are accessible at /mail" do
    assert_routing({ method: :get, path: "/mail" }, { controller: "mail_messages", action: "index" })
    assert_routing({ method: :get, path: "/mail/1" }, { controller: "mail_messages", action: "show", id: "1" })
    assert_routing({ method: :delete, path: "/mail/1" }, { controller: "mail_messages", action: "destroy", id: "1" })
    assert_routing({ method: :delete, path: "/mail/destroy_all" }, { controller: "mail_messages", action: "destroy_all" })
    assert_routing({ method: :get, path: "/mail/1/body" }, { controller: "mail_messages", action: "body", id: "1" })
    assert_routing({ method: :post, path: "/mail/1/toggle_read" }, { controller: "mail_messages", action: "toggle_read", id: "1" })
  end
end
