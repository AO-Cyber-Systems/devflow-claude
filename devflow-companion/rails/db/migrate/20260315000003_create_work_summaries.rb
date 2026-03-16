class CreateWorkSummaries < ActiveRecord::Migration[8.0]
  def change
    create_table :work_summaries, id: :string do |t|
      t.references :relay_session, type: :string, foreign_key: true, null: false
      t.text :content, null: false
      t.string :summary_type, default: "stop"
      t.boolean :read, default: false, null: false
      t.json :metadata, default: {}
      t.timestamps
    end

    add_index :work_summaries, [:relay_session_id, :read], name: "idx_summaries_session_read"
    add_index :work_summaries, :created_at
  end
end
