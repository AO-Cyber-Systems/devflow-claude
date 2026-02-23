require "test_helper"

class HealthControllerTest < ActionDispatch::IntegrationTest
  test "returns ok status" do
    get "/health"
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal "ok", body["status"]
    assert body["timestamp"].present?
  end
end
