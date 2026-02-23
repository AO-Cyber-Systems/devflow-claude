class CreateMailMessages < ActiveRecord::Migration[8.0]
  def change
    create_table :mail_messages do |t|
      t.string :from_address
      t.text :to_addresses
      t.text :cc_addresses
      t.string :subject
      t.text :body_html
      t.text :body_text
      t.text :raw_source
      t.text :headers_json
      t.integer :size_bytes, default: 0
      t.integer :attachments_count, default: 0
      t.boolean :read, default: false

      t.timestamps
    end

    add_index :mail_messages, :created_at
    add_index :mail_messages, :read
    add_index :mail_messages, :from_address
  end
end
