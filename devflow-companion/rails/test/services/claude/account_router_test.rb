require "test_helper"

class Claude::AccountRouterTest < ActiveSupport::TestCase
  setup do
    @account1 = ProxyAccount.create!(name: "Account 1", api_key: "sk-ant-key-1", auth_type: "api_key")
    @account2 = ProxyAccount.create!(name: "Account 2", api_key: "sk-ant-key-2", auth_type: "api_key")
  end

  test "select_account returns an available account" do
    router = Claude::AccountRouter.new
    account = router.select_account

    assert_not_nil account
    assert_includes [@account1, @account2], account
  end

  test "select_account returns nil when no accounts exist" do
    ProxyAccount.destroy_all
    router = Claude::AccountRouter.new

    assert_nil router.select_account
  end

  test "select_account returns nil when all accounts paused" do
    @account1.update!(paused: true)
    @account2.update!(paused: true)
    router = Claude::AccountRouter.new

    assert_nil router.select_account
  end

  test "select_account uses sticky session" do
    router = Claude::AccountRouter.new
    first = router.select_account

    # Same account should be returned on subsequent calls
    second = Claude::AccountRouter.new.select_account
    assert_equal first, second
  end

  test "select_account skips rate limited accounts" do
    @account1.update!(status: "rate_limited", rate_limit_reset: 1.hour.from_now)
    router = Claude::AccountRouter.new

    assert_equal @account2, router.select_account
  end

  test "select_account clears expired rate limits" do
    @account1.update!(status: "rate_limited", rate_limit_reset: 1.hour.ago)
    @account2.update!(paused: true)
    router = Claude::AccountRouter.new
    account = router.select_account

    assert_equal @account1, account
    @account1.reload
    assert_equal "active", @account1.status
  end

  test "select_account starts a new session" do
    router = Claude::AccountRouter.new
    account = router.select_account

    account.reload
    assert_not_nil account.session_start
    assert_equal account.id.to_s, Setting.get("proxy_session_account_id")
  end

  test "select_account picks new account when session expired" do
    @account1.start_session!
    @account1.update!(session_start: 6.hours.ago)
    Setting.set("proxy_session_account_id", @account1.id.to_s)

    router = Claude::AccountRouter.new
    account = router.select_account

    # Should pick a new account (could be either, but session is refreshed)
    assert_not_nil account
    account.reload
    assert_not account.session_expired?
  end

  test "failover selects different account" do
    router = Claude::AccountRouter.new
    account = router.failover(@account1)

    assert_equal @account2, account
  end

  test "failover returns nil when no other accounts available" do
    @account2.update!(paused: true)
    router = Claude::AccountRouter.new

    assert_nil router.failover(@account1)
  end

  test "failover starts session on new account" do
    router = Claude::AccountRouter.new
    account = router.failover(@account1)

    account.reload
    assert_not_nil account.session_start
    assert_equal account.id.to_s, Setting.get("proxy_session_account_id")
  end
end
