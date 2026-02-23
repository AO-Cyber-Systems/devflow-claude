require "test_helper"

class Claude::OAuthFlowTest < ActiveSupport::TestCase
  setup do
    @flow = Claude::OAuthFlow.new
  end

  test "CLIENT_ID is set" do
    assert_equal "9d1c250a-e61b-44d9-88ed-5944d1962f5e", Claude::OAuthFlow::CLIENT_ID
  end

  test "AUTHORIZE_URL is set" do
    assert_equal "https://claude.ai/oauth/authorize", Claude::OAuthFlow::AUTHORIZE_URL
  end

  test "TOKEN_URL is set" do
    assert_equal "https://console.anthropic.com/v1/oauth/token", Claude::OAuthFlow::TOKEN_URL
  end

  test "CALLBACK_PORT is set" do
    assert_equal 7856, Claude::OAuthFlow::CALLBACK_PORT
  end

  test "REDIRECT_URI uses callback port" do
    assert_equal "http://localhost:7856/oauth/callback", Claude::OAuthFlow::REDIRECT_URI
  end

  test "start! returns authorize_url and state" do
    result = @flow.start!

    assert result[:authorize_url].present?
    assert result[:state].present?
    assert result[:authorize_url].start_with?("https://claude.ai/oauth/authorize?")
    assert_includes result[:authorize_url], "client_id=#{Claude::OAuthFlow::CLIENT_ID}"
    assert_includes result[:authorize_url], "response_type=code"
    assert_includes result[:authorize_url], "code_challenge_method=S256"
    assert_includes result[:authorize_url], "state=#{result[:state]}"
  end

  test "start! stores code_verifier in settings" do
    result = @flow.start!
    verifier = Setting.get("oauth_verifier_#{result[:state]}")
    assert verifier.present?
    assert verifier.length >= 32
  end

  test "start! stores pending status in settings" do
    @flow.start!
    assert_equal "pending", Setting.get("oauth_status")
  end

  test "start! generates unique state each time" do
    result1 = @flow.start!
    result2 = @flow.start!
    assert_not_equal result1[:state], result2[:state]
  end

  test "start! generates valid PKCE code_challenge" do
    result = @flow.start!
    assert_match(/code_challenge=[A-Za-z0-9_-]+/, result[:authorize_url])
  end

  test "start! includes required scopes in authorize URL" do
    result = @flow.start!
    # URL-encoded scopes
    assert_includes result[:authorize_url], "scope="
    assert_includes result[:authorize_url], "user%3Ainference"
  end

  test "SCOPES includes expected values" do
    assert_includes Claude::OAuthFlow::SCOPES, "user:inference"
    assert_includes Claude::OAuthFlow::SCOPES, "user:profile"
    assert_includes Claude::OAuthFlow::SCOPES, "org:create_api_key"
  end

  test "wait_for_callback raises TimeoutError on timeout" do
    assert_raises(Claude::OAuthFlow::TimeoutError) do
      @flow.wait_for_callback(state: "test-state", timeout: 1)
    end
  end
end
