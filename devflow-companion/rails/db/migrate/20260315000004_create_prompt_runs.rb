class CreatePromptRuns < ActiveRecord::Migration[8.0]
  def change
    create_table :prompt_runs, id: :string do |t|
      t.references :relay_session, type: :string, foreign_key: true, null: false
      t.text :prompt, null: false
      t.string :mode, default: "continue"
      t.string :status, default: "queued"
      t.text :result
      t.integer :pid
      t.string :log_path
      t.datetime :started_at
      t.datetime :completed_at
      t.json :metadata, default: {}
      t.timestamps
    end

    add_index :prompt_runs, :status
  end
end
