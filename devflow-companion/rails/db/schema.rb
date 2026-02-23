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

ActiveRecord::Schema[8.1].define(version: 2024_01_03_000005) do
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

  create_table "projects", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.text "notes"
    t.string "path", null: false
    t.datetime "updated_at", null: false
    t.index ["path"], name: "index_projects_on_path", unique: true
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

  create_table "settings", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key", null: false
    t.datetime "updated_at", null: false
    t.text "value"
    t.index ["key"], name: "index_settings_on_key", unique: true
  end
end
