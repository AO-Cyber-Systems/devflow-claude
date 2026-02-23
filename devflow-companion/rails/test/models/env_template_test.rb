require "test_helper"

class EnvTemplateTest < ActiveSupport::TestCase
  test "validates name presence" do
    template = EnvTemplate.new(content: "KEY=value")
    assert_not template.valid?
    assert_includes template.errors[:name], "can't be blank"
  end

  test "validates content presence" do
    template = EnvTemplate.new(name: "test")
    assert_not template.valid?
    assert_includes template.errors[:content], "can't be blank"
  end

  test "validates name uniqueness" do
    EnvTemplate.create!(name: "production", content: "KEY=val")
    duplicate = EnvTemplate.new(name: "production", content: "OTHER=val")
    assert_not duplicate.valid?
    assert_includes duplicate.errors[:name], "has already been taken"
  end

  test "creates valid template" do
    template = EnvTemplate.create!(name: "staging", content: "DATABASE_URL=postgres://localhost/staging")
    assert template.persisted?
    assert_equal "staging", template.name
  end
end
