require "test_helper"

class ProxyAccountsControllerTest < ActionDispatch::IntegrationTest
  setup do
    Setting.set("setup_completed", "true")
    @account = ProxyAccount.create!(name: "Test Account", api_key: "sk-ant-test-key", auth_type: "api_key")
  end

  test "index renders proxy dashboard" do
    get proxy_accounts_path
    assert_response :success
    assert_select "h1", "Claude Proxy"
  end

  test "index shows stats" do
    get proxy_accounts_path
    assert_response :success
    assert_select ".stat-card", minimum: 4
  end

  test "index shows accounts table" do
    get proxy_accounts_path
    assert_response :success
    assert_select "table.data-table"
    assert_select "td strong", "Test Account"
  end

  test "index shows auth type badge for api_key account" do
    get proxy_accounts_path
    assert_response :success
    assert_select ".badge.badge-neutral", "API Key"
  end

  test "index shows auth type badge for oauth account" do
    ProxyAccount.create!(
      name: "OAuth Account", auth_type: "oauth",
      access_token: "at-123", refresh_token: "rt-456",
      token_expires_at: 4.hours.from_now
    )
    get proxy_accounts_path
    assert_response :success
    assert_select ".badge.badge-info", /Max/
  end

  test "index shows Add Claude Max Account button" do
    get proxy_accounts_path
    assert_response :success
    assert_select "button", /Add Claude Max Account/
  end

  test "create adds new api_key account" do
    assert_difference "ProxyAccount.count", 1 do
      post proxy_accounts_path, params: {
        proxy_account: { name: "New Account", api_key: "sk-ant-new-key" }
      }
    end
    assert_redirected_to proxy_accounts_path

    account = ProxyAccount.last
    assert_equal "api_key", account.auth_type
    follow_redirect!
    assert_select ".alert-success"
  end

  test "create with missing fields shows error" do
    assert_no_difference "ProxyAccount.count" do
      post proxy_accounts_path, params: {
        proxy_account: { name: "", api_key: "" }
      }
    end
    assert_redirected_to proxy_accounts_path
  end

  test "destroy removes account" do
    assert_difference "ProxyAccount.count", -1 do
      delete proxy_account_path(@account)
    end
    assert_redirected_to proxy_accounts_path
  end

  test "pause pauses account" do
    post pause_proxy_account_path(@account)
    assert_redirected_to proxy_accounts_path
    @account.reload
    assert @account.paused?
  end

  test "unpause resumes account" do
    @account.update!(paused: true)
    post unpause_proxy_account_path(@account)
    assert_redirected_to proxy_accounts_path
    @account.reload
    assert_not @account.paused?
    assert_equal "active", @account.status
  end

  test "stats responds to turbo_stream" do
    get stats_proxy_accounts_path(format: :turbo_stream)
    assert_response :success
  end

  test "oauth_status returns current status" do
    Setting.set("oauth_status", "waiting")
    get oauth_status_proxy_accounts_path, headers: { "Accept" => "application/json" }
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal "waiting", body["status"]
  end

  test "oauth_status returns unknown when no status set" do
    Setting.find_by(key: "oauth_status")&.destroy
    get oauth_status_proxy_accounts_path, headers: { "Accept" => "application/json" }
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal "unknown", body["status"]
  end

  test "authorize route exists" do
    assert_routing(
      { method: :post, path: "/proxy_accounts/authorize" },
      { controller: "proxy_accounts", action: "authorize" }
    )
  end

  test "oauth_status route exists" do
    assert_routing(
      { method: :get, path: "/proxy_accounts/oauth_status" },
      { controller: "proxy_accounts", action: "oauth_status" }
    )
  end
end
