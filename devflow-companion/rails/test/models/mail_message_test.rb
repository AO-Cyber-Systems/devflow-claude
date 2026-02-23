require "test_helper"

class MailMessageTest < ActiveSupport::TestCase
  SAMPLE_EMAIL = <<~EMAIL
    From: sender@example.com
    To: recipient@example.com
    Cc: cc@example.com
    Subject: Test Subject
    Content-Type: text/plain

    Hello, this is a test email body.
  EMAIL

  HTML_EMAIL = <<~EMAIL
    From: sender@example.com
    To: recipient@example.com
    Subject: HTML Test
    Content-Type: text/html

    <html><body><h1>Hello</h1></body></html>
  EMAIL

  MULTIPART_EMAIL = <<~EMAIL
    From: sender@example.com
    To: first@example.com, second@example.com
    Subject: Multipart Test
    MIME-Version: 1.0
    Content-Type: multipart/alternative; boundary="boundary123"

    --boundary123
    Content-Type: text/plain

    Plain text body
    --boundary123
    Content-Type: text/html

    <html><body><b>HTML body</b></body></html>
    --boundary123--
  EMAIL

  test "create_from_raw parses plain text email" do
    msg = MailMessage.create_from_raw(SAMPLE_EMAIL)

    assert_not_nil msg
    assert_equal "sender@example.com", msg.from_address
    assert_equal ["recipient@example.com"], msg.to_addresses
    assert_equal ["cc@example.com"], msg.cc_addresses
    assert_equal "Test Subject", msg.subject
    assert_includes msg.body_text, "test email body"
    assert_equal SAMPLE_EMAIL.bytesize, msg.size_bytes
    assert_equal false, msg.read
  end

  test "create_from_raw parses HTML email" do
    msg = MailMessage.create_from_raw(HTML_EMAIL)

    assert_not_nil msg
    assert_equal "HTML Test", msg.subject
    assert_includes msg.body_html, "<h1>Hello</h1>"
  end

  test "create_from_raw parses multipart email" do
    msg = MailMessage.create_from_raw(MULTIPART_EMAIL)

    assert_not_nil msg
    assert_equal "Multipart Test", msg.subject
    assert_equal ["first@example.com", "second@example.com"], msg.to_addresses
    assert_includes msg.body_text, "Plain text body"
    assert_includes msg.body_html, "HTML body"
  end

  test "create_from_raw preserves raw source" do
    msg = MailMessage.create_from_raw(SAMPLE_EMAIL)
    assert_equal SAMPLE_EMAIL, msg.raw_source
  end

  test "create_from_raw stores headers as JSON" do
    msg = MailMessage.create_from_raw(SAMPLE_EMAIL)

    assert_kind_of Hash, msg.headers_json
    assert_equal "sender@example.com", msg.headers_json["From"]
    assert_equal "Test Subject", msg.headers_json["Subject"]
  end

  test "create_from_raw handles minimal input" do
    msg = MailMessage.create_from_raw("just some random text without headers")

    assert_not_nil msg
    assert msg.raw_source.present?
  end

  test "create_from_raw rejects oversized messages" do
    huge = "X" * (5.megabytes + 1)
    msg = MailMessage.create_from_raw(huge)
    assert_nil msg
  end

  test "create_from_raw handles empty to/cc" do
    simple = "From: a@b.com\nSubject: Hi\n\nBody"
    msg = MailMessage.create_from_raw(simple)

    assert_not_nil msg
    assert_equal [], msg.to_addresses
    assert_equal [], msg.cc_addresses
  end

  # Scopes

  test "unread scope returns only unread messages" do
    MailMessage.create_from_raw(SAMPLE_EMAIL)
    read_msg = MailMessage.create_from_raw(HTML_EMAIL)
    read_msg.update!(read: true)

    assert_equal 1, MailMessage.unread.count
  end

  test "today scope returns only today's messages" do
    msg = MailMessage.create_from_raw(SAMPLE_EMAIL)
    assert_equal 1, MailMessage.today.count
  end

  test "recent scope orders by created_at desc" do
    first = MailMessage.create_from_raw(SAMPLE_EMAIL)
    second = MailMessage.create_from_raw(HTML_EMAIL)

    results = MailMessage.recent
    assert_equal second.id, results.first.id
  end

  # Helpers

  test "formatted_size displays bytes" do
    msg = MailMessage.new(size_bytes: 500)
    assert_equal "500 B", msg.formatted_size
  end

  test "formatted_size displays kilobytes" do
    msg = MailMessage.new(size_bytes: 2048)
    assert_equal "2.0 KB", msg.formatted_size
  end

  test "formatted_size displays megabytes" do
    msg = MailMessage.new(size_bytes: 1_500_000)
    assert_equal "1.4 MB", msg.formatted_size
  end

  test "recipients_summary with single recipient" do
    msg = MailMessage.new(to_addresses: ["user@example.com"], cc_addresses: [])
    assert_equal "user@example.com", msg.recipients_summary
  end

  test "recipients_summary with many recipients truncates" do
    msg = MailMessage.new(
      to_addresses: ["a@example.com", "b@example.com", "c@example.com"],
      cc_addresses: []
    )
    assert_includes msg.recipients_summary, "+1"
  end

  test "recipients_summary with no recipients" do
    msg = MailMessage.new(to_addresses: [], cc_addresses: [])
    assert_equal "—", msg.recipients_summary
  end

  test "toggle_read! flips read status" do
    msg = MailMessage.create_from_raw(SAMPLE_EMAIL)
    assert_equal false, msg.read

    msg.toggle_read!
    assert_equal true, msg.read

    msg.toggle_read!
    assert_equal false, msg.read
  end

  test "mark_read! marks message as read" do
    msg = MailMessage.create_from_raw(SAMPLE_EMAIL)
    msg.mark_read!
    assert msg.read?
  end

  test "mark_read! is idempotent" do
    msg = MailMessage.create_from_raw(SAMPLE_EMAIL)
    msg.mark_read!
    msg.mark_read!
    assert msg.read?
  end
end
