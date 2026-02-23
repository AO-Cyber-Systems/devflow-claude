class CreateProxyTables < ActiveRecord::Migration[8.0]
  def change
    create_table :proxy_accounts do |t|
      t.string :name, null: false
      t.string :api_key, null: false
      t.string :status, default: "active"
      t.integer :rate_limit_remaining
      t.integer :rate_limit_limit
      t.datetime :rate_limit_reset
      t.datetime :session_start
      t.integer :session_request_count, default: 0
      t.integer :total_request_count, default: 0
      t.boolean :paused, default: false
      t.timestamps
      t.index :status
    end

    create_table :proxy_requests do |t|
      t.references :proxy_account
      t.string :method, null: false
      t.string :path, null: false
      t.integer :status_code
      t.integer :response_time_ms
      t.string :model
      t.integer :input_tokens
      t.integer :output_tokens
      t.boolean :streamed, default: false
      t.string :error_type
      t.timestamps
      t.index :created_at
    end
  end
end
