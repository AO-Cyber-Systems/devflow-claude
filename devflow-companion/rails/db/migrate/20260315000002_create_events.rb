class CreateEvents < ActiveRecord::Migration[8.0]
  def change
    create_table :events, id: :string do |t|
      t.references :relay_session, type: :string, foreign_key: true, null: false
      t.string :event_type, null: false
      t.string :agent, default: "claude-code"
      t.string :tool_name
      t.string :command
      t.string :classification
      t.string :decision
      t.string :decision_reason
      t.string :decided_by
      t.json :action_data, default: {}
      t.json :response_data, default: {}
      t.datetime :decided_at
      t.timestamps
    end

    add_index :events, :event_type
    add_index :events, :classification
    add_index :events, [:relay_session_id, :decision], name: "idx_events_session_decision"
    add_index :events, :created_at
  end
end
