class CreateAutoResponseLogs < ActiveRecord::Migration[8.0]
  def change
    create_table :auto_response_logs, id: :string do |t|
      t.references :event, type: :string, foreign_key: true, null: false
      t.references :relay_session, type: :string, foreign_key: true, null: false
      t.string :decision, null: false
      t.string :classification, null: false
      t.string :autonomy_level, null: false
      t.string :tool_name
      t.string :command
      t.timestamps
    end

    add_index :auto_response_logs, [:relay_session_id, :created_at], name: "idx_auto_logs_session_time"
  end
end
