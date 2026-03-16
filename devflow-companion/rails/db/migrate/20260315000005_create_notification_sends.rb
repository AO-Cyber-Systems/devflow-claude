class CreateNotificationSends < ActiveRecord::Migration[8.0]
  def change
    create_table :notification_sends, id: :string do |t|
      t.references :event, type: :string, foreign_key: true, null: false
      t.string :channel, null: false
      t.string :status, default: "pending"
      t.datetime :sent_at
      t.datetime :delivered_at
      t.text :error_message
      t.json :metadata, default: {}
      t.timestamps
    end

    add_index :notification_sends, [:event_id, :channel]
    add_index :notification_sends, :status
  end
end
