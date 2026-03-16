class CreateRelaySessions < ActiveRecord::Migration[8.0]
  def change
    create_table :relay_sessions, id: :string do |t|
      t.string :name, null: false
      t.string :session_key, null: false
      t.string :claude_session_id
      t.string :ide
      t.string :project_name
      t.string :branch
      t.string :cwd
      t.string :agent, default: "claude-code"
      t.string :status, default: "active", null: false
      t.string :autonomy_level, default: "assisted", null: false
      t.string :session_color
      t.boolean :remote_enabled, default: false, null: false
      t.boolean :imessage_enabled, default: false, null: false
      t.integer :pending_requests_count, default: 0, null: false
      t.datetime :last_activity_at
      t.json :metadata, default: {}
      t.timestamps
    end

    add_index :relay_sessions, :session_key, unique: true
    add_index :relay_sessions, :claude_session_id, unique: true
    add_index :relay_sessions, :status
    add_index :relay_sessions, :project_name
  end
end
