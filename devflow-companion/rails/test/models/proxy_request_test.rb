require "test_helper"

class ProxyRequestTest < ActiveSupport::TestCase
  setup do
    @account = ProxyAccount.create!(name: "Test", api_key: "sk-ant-test", auth_type: "api_key")
  end

  test "belongs to proxy_account optionally" do
    req = ProxyRequest.create!(method: "POST", path: "/v1/messages")
    assert_nil req.proxy_account
  end

  test "recent scope returns last 24h" do
    old = ProxyRequest.create!(method: "POST", path: "/v1/messages", created_at: 2.days.ago)
    recent = ProxyRequest.create!(method: "POST", path: "/v1/messages")

    assert_includes ProxyRequest.recent, recent
    assert_not_includes ProxyRequest.recent, old
  end

  test "errors scope returns non-2xx" do
    ok = ProxyRequest.create!(method: "POST", path: "/v1/messages", status_code: 200)
    err = ProxyRequest.create!(method: "POST", path: "/v1/messages", status_code: 429)

    assert_not_includes ProxyRequest.errors, ok
    assert_includes ProxyRequest.errors, err
  end

  test "avg_response_time calculates from recent requests" do
    ProxyRequest.create!(method: "POST", path: "/v1/messages", response_time_ms: 100)
    ProxyRequest.create!(method: "POST", path: "/v1/messages", response_time_ms: 200)

    assert_equal 150, ProxyRequest.avg_response_time
  end

  test "avg_response_time returns 0 with no requests" do
    assert_equal 0, ProxyRequest.avg_response_time
  end

  test "total_today counts today's requests" do
    ProxyRequest.create!(method: "POST", path: "/v1/messages")
    ProxyRequest.create!(method: "POST", path: "/v1/messages")

    assert_equal 2, ProxyRequest.total_today
  end

  test "error_rate calculates percentage" do
    ProxyRequest.create!(method: "POST", path: "/v1/messages", status_code: 200)
    ProxyRequest.create!(method: "POST", path: "/v1/messages", status_code: 200)
    ProxyRequest.create!(method: "POST", path: "/v1/messages", status_code: 429)

    assert_in_delta 33.3, ProxyRequest.error_rate, 0.1
  end

  test "error_rate returns 0 with no requests" do
    assert_equal 0.0, ProxyRequest.error_rate
  end
end
