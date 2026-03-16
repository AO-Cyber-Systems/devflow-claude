# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_03_15_000006) do
  create_table "auto_response_logs", id: :string, force: :cascade do |t|
    t.string "autonomy_level", null: false
    t.string "classification", null: false
    t.string "command"
    t.datetime "created_at", null: false
    t.string "decision", null: false
    t.string "event_id", null: false
    t.string "relay_session_id", null: false
    t.string "tool_name"
    t.datetime "updated_at", null: false
    t.index ["event_id"], name: "index_auto_response_logs_on_event_id"
    t.index ["relay_session_id", "created_at"], name: "idx_auto_logs_session_time"
    t.index ["relay_session_id"], name: "index_auto_response_logs_on_relay_session_id"
  end

  create_table "devflow_installations", force: :cascade do |t|
    t.string "config_dir", null: false
    t.datetime "created_at", null: false
    t.json "file_manifest"
    t.datetime "installed_at"
    t.json "local_patches"
    t.string "scope", null: false
    t.string "status", default: "installed"
    t.datetime "updated_at", null: false
    t.datetime "updated_at_version"
    t.string "version"
    t.index ["config_dir"], name: "index_devflow_installations_on_config_dir", unique: true
  end

  create_table "env_templates", force: :cascade do |t|
    t.text "content", null: false
    t.datetime "created_at", null: false
    t.text "description"
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_env_templates_on_name", unique: true
  end

  create_table "events", id: :string, force: :cascade do |t|
    t.json "action_data", default: {}
    t.string "agent", default: "claude-code"
    t.string "classification"
    t.string "command"
    t.datetime "created_at", null: false
    t.datetime "decided_at"
    t.string "decided_by"
    t.string "decision"
    t.string "decision_reason"
    t.string "event_type", null: false
    t.string "relay_session_id", null: false
    t.json "response_data", default: {}
    t.string "tool_name"
    t.datetime "updated_at", null: false
    t.index ["classification"], name: "index_events_on_classification"
    t.index ["created_at"], name: "index_events_on_created_at"
    t.index ["event_type"], name: "index_events_on_event_type"
    t.index ["relay_session_id", "decision"], name: "idx_events_session_decision"
    t.index ["relay_session_id"], name: "index_events_on_relay_session_id"
  end

  create_table "mail_messages", force: :cascade do |t|
    t.integer "attachments_count", default: 0
    t.text "body_html"
    t.text "body_text"
    t.text "cc_addresses"
    t.datetime "created_at", null: false
    t.string "from_address"
    t.text "headers_json"
    t.text "raw_source"
    t.boolean "read", default: false
    t.integer "size_bytes", default: 0
    t.string "subject"
    t.text "to_addresses"
    t.datetime "updated_at", null: false
    t.index ["created_at"], name: "index_mail_messages_on_created_at"
    t.index ["from_address"], name: "index_mail_messages_on_from_address"
    t.index ["read"], name: "index_mail_messages_on_read"
  end

  create_table "notification_sends", id: :string, force: :cascade do |t|
    t.string "channel", null: false
    t.datetime "created_at", null: false
    t.datetime "delivered_at"
    t.text "error_message"
    t.string "event_id", null: false
    t.json "metadata", default: {}
    t.datetime "sent_at"
    t.string "status", default: "pending"
    t.datetime "updated_at", null: false
    t.index ["event_id", "channel"], name: "index_notification_sends_on_event_id_and_channel"
    t.index ["event_id"], name: "index_notification_sends_on_event_id"
    t.index ["status"], name: "index_notification_sends_on_status"
  end

  create_table "projects", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.text "notes"
    t.string "path", null: false
    t.datetime "updated_at", null: false
    t.index ["path"], name: "index_projects_on_path", unique: true
  end

  create_table "prompt_runs", id: :string, force: :cascade do |t|
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.string "log_path"
    t.json "metadata", default: {}
    t.string "mode", default: "continue"
    t.integer "pid"
    t.text "prompt", null: false
    t.string "relay_session_id", null: false
    t.text "result"
    t.datetime "started_at"
    t.string "status", default: "queued"
    t.datetime "updated_at", null: false
    t.index ["relay_session_id"], name: "index_prompt_runs_on_relay_session_id"
    t.index ["status"], name: "index_prompt_runs_on_status"
  end

  create_table "proxy_accounts", force: :cascade do |t|
    t.string "access_token"
    t.string "api_key"
    t.string "auth_type", default: "oauth"
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.boolean "paused", default: false
    t.integer "rate_limit_limit"
    t.integer "rate_limit_remaining"
    t.datetime "rate_limit_reset"
    t.string "refresh_token"
    t.integer "session_request_count", default: 0
    t.datetime "session_start"
    t.string "status", default: "active"
    t.datetime "token_expires_at"
    t.integer "total_request_count", default: 0
    t.datetime "updated_at", null: false
    t.index ["status"], name: "index_proxy_accounts_on_status"
  end

  create_table "proxy_requests", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "error_type"
    t.integer "input_tokens"
    t.string "method", null: false
    t.string "model"
    t.integer "output_tokens"
    t.string "path", null: false
    t.integer "proxy_account_id"
    t.integer "response_time_ms"
    t.integer "status_code"
    t.boolean "streamed", default: false
    t.datetime "updated_at", null: false
    t.index ["created_at"], name: "index_proxy_requests_on_created_at"
    t.index ["proxy_account_id"], name: "index_proxy_requests_on_proxy_account_id"
  end

  create_table "relay_sessions", id: :string, force: :cascade do |t|
    t.string "agent", default: "claude-code"
    t.string "autonomy_level", default: "assisted", null: false
    t.string "branch"
    t.string "claude_session_id"
    t.datetime "created_at", null: false
    t.string "cwd"
    t.string "ide"
    t.boolean "imessage_enabled", default: false, null: false
    t.datetime "last_activity_at"
    t.json "metadata", default: {}
    t.string "name", null: false
    t.integer "pending_requests_count", default: 0, null: false
    t.string "project_name"
    t.boolean "remote_enabled", default: false, null: false
    t.string "session_color"
    t.string "session_key", null: false
    t.string "status", default: "active", null: false
    t.datetime "updated_at", null: false
    t.index ["claude_session_id"], name: "index_relay_sessions_on_claude_session_id", unique: true
    t.index ["project_name"], name: "index_relay_sessions_on_project_name"
    t.index ["session_key"], name: "index_relay_sessions_on_session_key", unique: true
    t.index ["status"], name: "index_relay_sessions_on_status"
  end

  create_table "settings", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key", null: false
    t.datetime "updated_at", null: false
    t.text "value"
    t.index ["key"], name: "index_settings_on_key", unique: true
  end

  create_table "work_summaries", id: :string, force: :cascade do |t|
    t.text "content", null: false
    t.datetime "created_at", null: false
    t.json "metadata", default: {}
    t.boolean "read", default: false, null: false
    t.string "relay_session_id", null: false
    t.string "summary_type", default: "stop"
    t.datetime "updated_at", null: false
    t.index ["created_at"], name: "index_work_summaries_on_created_at"
    t.index ["relay_session_id", "read"], name: "idx_summaries_session_read"
    t.index ["relay_session_id"], name: "index_work_summaries_on_relay_session_id"
  end

  add_foreign_key "auto_response_logs", "events"
  add_foreign_key "auto_response_logs", "relay_sessions"
  add_foreign_key "events", "relay_sessions"
  add_foreign_key "notification_sends", "events"
  add_foreign_key "prompt_runs", "relay_sessions"
  add_foreign_key "work_summaries", "relay_sessions"
end
