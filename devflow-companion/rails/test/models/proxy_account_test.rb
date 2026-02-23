require "test_helper"

class ProxyAccountTest < ActiveSupport::TestCase
  setup do
    @account = ProxyAccount.create!(name: "Test Account", api_key: "sk-ant-test-key-123", auth_type: "api_key")
  end

  # --- Validations ---

  test "validates name presence" do
    account = ProxyAccount.new(api_key: "sk-test", auth_type: "api_key")
    assert_not account.valid?
    assert_includes account.errors[:name], "can't be blank"
  end

  test "validates api_key presence for api_key auth_type" do
    account = ProxyAccount.new(name: "Test", auth_type: "api_key")
    assert_not account.valid?
    assert_includes account.errors[:api_key], "can't be blank"
  end

  test "does not require api_key for oauth auth_type" do
    account = ProxyAccount.new(
      name: "OAuth Account",
      auth_type: "oauth",
      access_token: "at-123",
      refresh_token: "rt-456"
    )
    assert account.valid?
  end

  test "validates access_token presence for oauth auth_type" do
    account = ProxyAccount.new(name: "OAuth", auth_type: "oauth", refresh_token: "rt-123")
    assert_not account.valid?
    assert_includes account.errors[:access_token], "can't be blank"
  end

  test "validates refresh_token presence for oauth auth_type" do
    account = ProxyAccount.new(name: "OAuth", auth_type: "oauth", access_token: "at-123")
    assert_not account.valid?
    assert_includes account.errors[:refresh_token], "can't be blank"
  end

  test "does not require access_token for api_key auth_type" do
    account = ProxyAccount.new(name: "API", auth_type: "api_key", api_key: "sk-test")
    assert account.valid?
  end

  # --- Encryption ---

  test "encrypts api_key" do
    assert_equal "sk-ant-test-key-123", @account.api_key
    raw = ActiveRecord::Base.connection.select_value(
      "SELECT api_key FROM proxy_accounts WHERE id = #{@account.id}"
    )
    assert_not_equal "sk-ant-test-key-123", raw
  end

  test "encrypts access_token" do
    oauth_account = ProxyAccount.create!(
      name: "OAuth", auth_type: "oauth",
      access_token: "secret-access-token",
      refresh_token: "secret-refresh-token"
    )
    raw = ActiveRecord::Base.connection.select_value(
      "SELECT access_token FROM proxy_accounts WHERE id = #{oauth_account.id}"
    )
    assert_not_equal "secret-access-token", raw
  end

  test "encrypts refresh_token" do
    oauth_account = ProxyAccount.create!(
      name: "OAuth", auth_type: "oauth",
      access_token: "secret-access-token",
      refresh_token: "secret-refresh-token"
    )
    raw = ActiveRecord::Base.connection.select_value(
      "SELECT refresh_token FROM proxy_accounts WHERE id = #{oauth_account.id}"
    )
    assert_not_equal "secret-refresh-token", raw
  end

  # --- Auth type helpers ---

  test "oauth? returns true for oauth accounts" do
    account = ProxyAccount.new(auth_type: "oauth")
    assert account.oauth?
    assert_not account.api_key?
  end

  test "api_key? returns true for api_key accounts" do
    assert @account.api_key?
    assert_not @account.oauth?
  end

  # --- Token methods ---

  test "token_expired? returns true when token_expires_at is in the past" do
    account = ProxyAccount.new(auth_type: "oauth", token_expires_at: 1.hour.ago)
    assert account.token_expired?
  end

  test "token_expired? returns true when token_expires_at is nil" do
    account = ProxyAccount.new(auth_type: "oauth", token_expires_at: nil)
    assert account.token_expired?
  end

  test "token_expired? returns false when token is still valid" do
    account = ProxyAccount.new(auth_type: "oauth", token_expires_at: 1.hour.from_now)
    assert_not account.token_expired?
  end

  test "token_expired? returns true for non-oauth accounts" do
    assert @account.token_expired?
  end

  test "token_expiring_soon? returns true when within 30 minutes of expiry" do
    account = ProxyAccount.new(auth_type: "oauth", token_expires_at: 20.minutes.from_now)
    assert account.token_expiring_soon?
  end

  test "token_expiring_soon? returns false when well before expiry" do
    account = ProxyAccount.new(auth_type: "oauth", token_expires_at: 2.hours.from_now)
    assert_not account.token_expiring_soon?
  end

  test "token_expiring_soon? returns false for non-oauth accounts" do
    assert_not @account.token_expiring_soon?
  end

  test "update_tokens! stores tokens and calculates expiry" do
    oauth_account = ProxyAccount.create!(
      name: "OAuth", auth_type: "oauth",
      access_token: "old-token", refresh_token: "old-refresh"
    )

    freeze_time do
      oauth_account.update_tokens!(
        access_token: "new-token",
        refresh_token: "new-refresh",
        expires_in: 28800
      )
      oauth_account.reload

      assert_equal "new-token", oauth_account.access_token
      assert_equal "new-refresh", oauth_account.refresh_token
      assert_equal 28800.seconds.from_now.to_i, oauth_account.token_expires_at.to_i
    end
  end

  # --- Rate limiting ---

  test "rate_limited? returns true when status is rate_limited and reset in future" do
    @account.update!(status: "rate_limited", rate_limit_reset: 1.hour.from_now)
    assert @account.rate_limited?
  end

  test "rate_limited? returns false when reset has passed" do
    @account.update!(status: "rate_limited", rate_limit_reset: 1.hour.ago)
    assert_not @account.rate_limited?
  end

  test "rate_limited? returns false when status is active" do
    assert_not @account.rate_limited?
  end

  test "clear_rate_limit_if_expired! clears expired rate limit" do
    @account.update!(status: "rate_limited", rate_limit_remaining: 0, rate_limit_limit: 100, rate_limit_reset: 1.hour.ago)
    @account.clear_rate_limit_if_expired!
    @account.reload

    assert_equal "active", @account.status
    assert_nil @account.rate_limit_remaining
  end

  test "clear_rate_limit_if_expired! does not clear active rate limit" do
    @account.update!(status: "rate_limited", rate_limit_remaining: 0, rate_limit_limit: 100, rate_limit_reset: 1.hour.from_now)
    @account.clear_rate_limit_if_expired!
    @account.reload

    assert_equal "rate_limited", @account.status
  end

  test "record_rate_limit! updates rate limit fields" do
    @account.record_rate_limit!(remaining: 50, limit: 100, reset: 1.hour.from_now)
    @account.reload

    assert_equal 50, @account.rate_limit_remaining
    assert_equal 100, @account.rate_limit_limit
    assert_equal "active", @account.status
  end

  test "record_rate_limit! sets rate_limited status when remaining is zero" do
    @account.record_rate_limit!(remaining: 0, limit: 100, reset: 1.hour.from_now)
    @account.reload

    assert_equal "rate_limited", @account.status
  end

  # --- Sessions ---

  test "start_session! sets session fields" do
    @account.start_session!
    @account.reload

    assert_not_nil @account.session_start
    assert_equal 0, @account.session_request_count
  end

  test "session_expired? returns true when no session" do
    assert @account.session_expired?
  end

  test "session_expired? returns true when session is old" do
    @account.update!(session_start: 6.hours.ago)
    assert @account.session_expired?
  end

  test "session_expired? returns false for recent session" do
    @account.update!(session_start: 1.hour.ago)
    assert_not @account.session_expired?
  end

  test "increment_request_count! increments both counters" do
    @account.start_session!
    @account.increment_request_count!
    @account.reload

    assert_equal 1, @account.session_request_count
    assert_equal 1, @account.total_request_count
  end

  # --- Scopes ---

  test "active scope excludes paused accounts" do
    @account.update!(paused: true)
    assert_not_includes ProxyAccount.active, @account
  end

  test "active scope excludes actively rate limited accounts" do
    @account.update!(status: "rate_limited", rate_limit_reset: 1.hour.from_now)
    assert_not_includes ProxyAccount.active, @account
  end

  test "active scope includes accounts with expired rate limits" do
    @account.update!(status: "rate_limited", rate_limit_reset: 1.hour.ago)
    assert_includes ProxyAccount.active, @account
  end

  test "available scope includes accounts with remaining capacity" do
    @account.update!(rate_limit_remaining: 50, rate_limit_limit: 100)
    assert_includes ProxyAccount.available, @account
  end

  test "available scope includes accounts with no rate limit info" do
    assert_includes ProxyAccount.available, @account
  end
end
