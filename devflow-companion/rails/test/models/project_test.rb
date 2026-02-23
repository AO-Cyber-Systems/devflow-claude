require "test_helper"

class ProjectTest < ActiveSupport::TestCase
  test "validates name and path presence" do
    project = Project.new
    assert_not project.valid?
    assert_includes project.errors[:name], "can't be blank"
    assert_includes project.errors[:path], "can't be blank"
  end

  test "validates path uniqueness" do
    Project.create!(name: "Test", path: "/tmp/test")
    duplicate = Project.new(name: "Test 2", path: "/tmp/test")
    assert_not duplicate.valid?
  end

  test "devflow_state_path" do
    project = Project.new(name: "Test", path: "/tmp/test")
    assert_equal "/tmp/test/.planning/STATE.md", project.devflow_state_path
  end
end
