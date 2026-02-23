class MailMessage < ApplicationRecord
  MAX_SIZE = 5.megabytes

  serialize :to_addresses, coder: JSON
  serialize :cc_addresses, coder: JSON
  serialize :headers_json, coder: JSON

  scope :unread, -> { where(read: false) }
  scope :today, -> { where("created_at >= ?", Time.current.beginning_of_day) }
  scope :recent, -> { order(created_at: :desc) }

  def self.create_from_raw(raw_data)
    return nil if raw_data.bytesize > MAX_SIZE

    mail = begin
      Mail.new(raw_data)
    rescue => e
      nil
    end

    attrs = { raw_source: raw_data, size_bytes: raw_data.bytesize }

    if mail
      attrs[:from_address] = mail.from&.first
      attrs[:to_addresses] = mail.to || []
      attrs[:cc_addresses] = mail.cc || []
      attrs[:subject] = mail.subject
      attrs[:body_html] = extract_html(mail)
      attrs[:body_text] = extract_text(mail)
      attrs[:attachments_count] = mail.attachments.size
      attrs[:headers_json] = mail.header.fields.map { |f| [f.name, f.value.to_s] }.to_h
    else
      attrs[:subject] = "(parse error)"
      attrs[:to_addresses] = []
      attrs[:cc_addresses] = []
      attrs[:headers_json] = {}
    end

    create!(attrs)
  rescue => e
    Rails.logger.error "[MailCatcher] Failed to save message: #{e.message}"
    nil
  end

  def formatted_size
    if size_bytes < 1024
      "#{size_bytes} B"
    elsif size_bytes < 1024 * 1024
      "#{(size_bytes / 1024.0).round(1)} KB"
    else
      "#{(size_bytes / (1024.0 * 1024)).round(1)} MB"
    end
  end

  def recipients_summary
    all = Array(to_addresses) + Array(cc_addresses)
    return "—" if all.empty?
    all.length > 2 ? "#{all.first(2).join(', ')} +#{all.length - 2}" : all.join(", ")
  end

  def toggle_read!
    update!(read: !read)
  end

  def mark_read!
    update!(read: true) unless read?
  end

  private

  def self.extract_html(mail)
    if mail.multipart?
      html_part = mail.html_part
      html_part&.decoded
    elsif mail.content_type&.include?("text/html")
      mail.decoded
    end
  rescue => e
    nil
  end

  def self.extract_text(mail)
    if mail.multipart?
      text_part = mail.text_part
      text_part&.decoded
    elsif mail.content_type.nil? || mail.content_type.include?("text/plain")
      mail.decoded
    end
  rescue => e
    nil
  end
end
