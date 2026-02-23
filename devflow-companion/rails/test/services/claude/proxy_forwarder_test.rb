require "test_helper"

class Claude::ProxyForwarderTest < ActiveSupport::TestCase
  setup do
    @api_account = ProxyAccount.create!(name: "API Test", api_key: "sk-ant-test-key", auth_type: "api_key")
    @oauth_account = ProxyAccount.create!(
      name: "OAuth Test", auth_type: "oauth",
      access_token: "at-test-token",
      refresh_token: "rt-test-token",
      token_expires_at: 4.hours.from_now
    )
  end

  test "initializes with required attributes" do
    forwarder = Claude::ProxyForwarder.new(
      account: @api_account,
      request_body: '{"model":"claude-sonnet-4-20250514","messages":[]}',
      headers: { "content-type" => "application/json", "anthropic-version" => "2023-06-01" },
      path: "/v1/messages",
      method: "POST"
    )

    assert_equal @api_account, forwarder.account
    assert_equal "/v1/messages", forwarder.path
    assert_equal "POST", forwarder.method
  end

  test "ANTHROPIC_HOST is set correctly" do
    assert_equal "api.anthropic.com", Claude::ProxyForwarder::ANTHROPIC_HOST
  end

  test "FORWARDED_REQUEST_HEADERS includes expected headers" do
    expected = %w[content-type anthropic-version anthropic-beta x-session-id]
    expected.each do |header|
      assert_includes Claude::ProxyForwarder::FORWARDED_REQUEST_HEADERS, header
    end
  end

  test "RATE_LIMIT_HEADERS includes anthropic rate limit headers" do
    assert_includes Claude::ProxyForwarder::RATE_LIMIT_HEADERS, "anthropic-ratelimit-requests-remaining"
    assert_includes Claude::ProxyForwarder::RATE_LIMIT_HEADERS, "anthropic-ratelimit-requests-limit"
    assert_includes Claude::ProxyForwarder::RATE_LIMIT_HEADERS, "anthropic-ratelimit-requests-reset"
    assert_includes Claude::ProxyForwarder::RATE_LIMIT_HEADERS, "anthropic-ratelimit-tokens-remaining"
    assert_includes Claude::ProxyForwarder::RATE_LIMIT_HEADERS, "anthropic-ratelimit-tokens-limit"
    assert_includes Claude::ProxyForwarder::RATE_LIMIT_HEADERS, "anthropic-ratelimit-tokens-reset"
  end

  test "OAUTH_BETA_HEADERS is set" do
    assert_equal "oauth-2025-04-20", Claude::ProxyForwarder::OAUTH_BETA_HEADERS
  end

  test "build_request sets x-api-key for api_key accounts" do
    forwarder = Claude::ProxyForwarder.new(
      account: @api_account,
      request_body: '{"messages":[]}',
      headers: { "content-type" => "application/json" },
      path: "/v1/messages",
      method: "POST"
    )

    uri = URI("https://api.anthropic.com/v1/messages")
    req = forwarder.send(:build_request, uri)

    assert_equal "sk-ant-test-key", req["x-api-key"]
    assert_nil req["authorization"]
  end

  test "build_request sets Bearer token for oauth accounts" do
    # Token is valid (4 hours from now), so TokenManager won't try to refresh
    forwarder = Claude::ProxyForwarder.new(
      account: @oauth_account,
      request_body: '{"messages":[]}',
      headers: { "content-type" => "application/json" },
      path: "/v1/messages",
      method: "POST"
    )

    uri = URI("https://api.anthropic.com/v1/messages")
    req = forwarder.send(:build_request, uri)

    assert_equal "Bearer at-test-token", req["authorization"]
    assert_includes req["anthropic-beta"], "oauth-2025-04-20"
    assert_nil req["x-api-key"]
  end

  test "build_request preserves existing anthropic-beta headers for oauth" do
    forwarder = Claude::ProxyForwarder.new(
      account: @oauth_account,
      request_body: '{"messages":[]}',
      headers: { "content-type" => "application/json", "anthropic-beta" => "max-tokens-3-5-sonnet-2024-07-15" },
      path: "/v1/messages",
      method: "POST"
    )

    uri = URI("https://api.anthropic.com/v1/messages")
    req = forwarder.send(:build_request, uri)

    assert_includes req["anthropic-beta"], "max-tokens-3-5-sonnet-2024-07-15"
    assert_includes req["anthropic-beta"], "oauth-2025-04-20"
  end
end
