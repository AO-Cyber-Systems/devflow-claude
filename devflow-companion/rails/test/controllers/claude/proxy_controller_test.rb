require "test_helper"

class Claude::ProxyControllerTest < ActionDispatch::IntegrationTest
  test "returns 529 when no accounts available" do
    post "/claude/v1/messages",
      params: { model: "claude-sonnet-4-20250514", messages: [{ role: "user", content: "hi" }] }.to_json,
      headers: {
        "Content-Type" => "application/json",
        "Anthropic-Version" => "2023-06-01"
      }

    assert_equal 529, response.status
    body = JSON.parse(response.body)
    assert_equal "overloaded_error", body["error"]["type"]
    assert_match(/no proxy accounts/i, body["error"]["message"])
  end

  test "returns 529 when all accounts paused" do
    ProxyAccount.create!(name: "Test", api_key: "sk-ant-test", auth_type: "api_key", paused: true)

    post "/claude/v1/messages",
      params: { model: "claude-sonnet-4-20250514", messages: [{ role: "user", content: "hi" }] }.to_json,
      headers: {
        "Content-Type" => "application/json",
        "Anthropic-Version" => "2023-06-01"
      }

    assert_equal 529, response.status
  end

  test "returns 529 when all oauth accounts paused" do
    ProxyAccount.create!(
      name: "OAuth Test", auth_type: "oauth",
      access_token: "at-123", refresh_token: "rt-456",
      token_expires_at: 4.hours.from_now, paused: true
    )

    post "/claude/v1/messages",
      params: { model: "claude-sonnet-4-20250514", messages: [{ role: "user", content: "hi" }] }.to_json,
      headers: {
        "Content-Type" => "application/json",
        "Anthropic-Version" => "2023-06-01"
      }

    assert_equal 529, response.status
  end

  test "route exists for POST /claude/v1/messages" do
    assert_routing(
      { method: :post, path: "/claude/v1/messages" },
      { controller: "claude/proxy", action: "messages" }
    )
  end
end
