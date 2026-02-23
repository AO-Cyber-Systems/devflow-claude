require "test_helper"

class SettingTest < ActiveSupport::TestCase
  test "get returns default when key not found" do
    assert_equal "default", Setting.get("missing_key", "default")
  end

  test "set and get round-trips" do
    Setting.set("test_key", "test_value")
    assert_equal "test_value", Setting.get("test_key")
  end

  test "set updates existing key" do
    Setting.set("test_key", "first")
    Setting.set("test_key", "second")
    assert_equal "second", Setting.get("test_key")
    assert_equal 1, Setting.where(key: "test_key").count
  end

  test "validates key presence" do
    setting = Setting.new(key: nil)
    assert_not setting.valid?
  end
end
