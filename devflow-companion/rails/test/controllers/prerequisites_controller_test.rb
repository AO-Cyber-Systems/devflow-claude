require "test_helper"

class PrerequisitesControllerTest < ActionDispatch::IntegrationTest
  test "renders prerequisites page" do
    get "/prerequisites"
    assert_response :success
    assert_select "h1", "System Prerequisites"
  end

  test "first visit to dashboard redirects to setup when not completed" do
    Setting.set("prerequisites_checked", "false")
    Setting.find_by(key: "setup_completed")&.destroy
    get "/"
    assert_redirected_to "/setup"
  end

  test "dismiss marks prerequisites as checked" do
    post "/prerequisites/dismiss"
    assert_redirected_to "/"
    assert_equal "true", Setting.get("prerequisites_checked")
  end
end
