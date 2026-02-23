require "test_helper"

class DashboardControllerTest < ActionDispatch::IntegrationTest
  setup do
    Setting.set("setup_completed", "true")
  end

  test "renders dashboard" do
    get "/"
    assert_response :success
    assert_select "h1", "Dashboard"
  end
end
