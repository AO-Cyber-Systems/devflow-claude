require "test_helper"

class Claude::TokenManagerTest < ActiveSupport::TestCase
  setup do
    @oauth_account = ProxyAccount.create!(
      name: "OAuth Test",
      auth_type: "oauth",
      access_token: "at-old",
      refresh_token: "rt-old",
      token_expires_at: 2.hours.from_now
    )
    @api_account = ProxyAccount.create!(
      name: "API Test",
      auth_type: "api_key",
      api_key: "sk-ant-test"
    )
  end

  test "skips non-oauth accounts" do
    # Should not attempt any refresh (would error if it did)
    Claude::TokenManager.ensure_valid_token!(@api_account)
    @api_account.reload
    assert_equal "sk-ant-test", @api_account.api_key
  end

  test "skips oauth accounts with valid tokens" do
    # Token expires in 2 hours, well beyond the 30-minute threshold
    Claude::TokenManager.ensure_valid_token!(@oauth_account)
    @oauth_account.reload
    assert_equal "at-old", @oauth_account.access_token
  end

  test "detects expired tokens need refresh" do
    @oauth_account.update!(token_expires_at: 1.hour.ago)
    assert @oauth_account.token_expired?
  end

  test "detects soon-to-expire tokens need refresh" do
    @oauth_account.update!(token_expires_at: 15.minutes.from_now)
    assert @oauth_account.token_expiring_soon?
  end

  test "does not flag tokens far from expiry" do
    @oauth_account.update!(token_expires_at: 2.hours.from_now)
    assert_not @oauth_account.token_expired?
    assert_not @oauth_account.token_expiring_soon?
  end
end
