class AddOauthToProxyAccounts < ActiveRecord::Migration[8.1]
  def change
    add_column :proxy_accounts, :auth_type, :string, default: "oauth"
    add_column :proxy_accounts, :access_token, :string
    add_column :proxy_accounts, :refresh_token, :string
    add_column :proxy_accounts, :token_expires_at, :datetime

    change_column_null :proxy_accounts, :api_key, true
  end
end
