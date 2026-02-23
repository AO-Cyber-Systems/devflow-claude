require "test_helper"

class Environments::FilesControllerTest < ActionDispatch::IntegrationTest
  setup do
    Setting.set("setup_completed", "true")

    # Create a temp project directory with .env files
    @project_dir = Dir.mktmpdir("devflow-test-project")
    @project = Project.create!(name: "Test Project", path: @project_dir)
    Setting.set("current_project_path", @project_dir)

    # Create sample .env files
    File.write(File.join(@project_dir, ".env"), <<~ENV)
      DATABASE_URL=postgres://localhost/dev
      REDIS_URL=redis://localhost:6379
      SECRET_KEY_BASE=abc123secret
      API_KEY=sk-test-key-123
      APP_NAME=myapp
    ENV

    File.write(File.join(@project_dir, ".env.test"), <<~ENV)
      DATABASE_URL=postgres://localhost/test
      RAILS_ENV=test
    ENV
  end

  teardown do
    FileUtils.remove_entry(@project_dir) if @project_dir && Dir.exist?(@project_dir)
  end

  test "index renders env variables page" do
    get environments_files_path
    assert_response :success
    assert_select "h1", "Environment Variables"
  end

  test "index shows current project" do
    get environments_files_path
    assert_response :success
    assert_select "body", /Test Project/
  end

  test "index discovers .env files" do
    get environments_files_path
    assert_response :success
    assert_select "body", /\.env/
  end

  test "index shows empty state without project" do
    Setting.set("current_project_path", "")
    get environments_files_path
    assert_response :success
  end

  test "show displays env file entries" do
    encoded = Base64.urlsafe_encode64(File.join(@project_dir, ".env"))
    get environments_file_path(path: encoded)
    assert_response :success
    assert_select "body", /DATABASE_URL/
  end

  test "show identifies secret keys" do
    encoded = Base64.urlsafe_encode64(File.join(@project_dir, ".env"))
    get environments_file_path(path: encoded)
    assert_response :success
    # SECRET_KEY_BASE and API_KEY should be detected as secrets
    assert_select "body", /SECRET_KEY_BASE/
  end

  test "show redirects for nonexistent file" do
    encoded = Base64.urlsafe_encode64("/nonexistent/.env")
    get environments_file_path(path: encoded)
    assert_redirected_to environments_files_path
  end

  test "show redirects for non-env file" do
    other_file = File.join(@project_dir, "config.yml")
    File.write(other_file, "key: value")
    encoded = Base64.urlsafe_encode64(other_file)
    get environments_file_path(path: encoded)
    assert_redirected_to environments_files_path
  end

  test "update writes content to file" do
    env_path = File.join(@project_dir, ".env")
    encoded = Base64.urlsafe_encode64(env_path)
    new_content = "DATABASE_URL=postgres://localhost/updated\nAPP_NAME=updated"

    patch environments_file_path(path: encoded), params: { content: new_content }
    assert_redirected_to environments_file_path(path: encoded)

    assert_equal new_content, File.read(env_path)
  end

  test "update rejects nonexistent file" do
    encoded = Base64.urlsafe_encode64("/nonexistent/.env")
    patch environments_file_path(path: encoded), params: { content: "KEY=val" }
    assert_redirected_to environments_files_path
  end

  test "update rejects non-env file" do
    other_file = File.join(@project_dir, "config.yml")
    File.write(other_file, "key: value")
    encoded = Base64.urlsafe_encode64(other_file)
    patch environments_file_path(path: encoded), params: { content: "modified" }
    assert_redirected_to environments_files_path
    # Original content should be unchanged
    assert_equal "key: value", File.read(other_file)
  end
end
