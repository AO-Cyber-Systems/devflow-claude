require "test_helper"

class PrerequisiteCheckTest < ActiveSupport::TestCase
  test "run_all returns array of checks" do
    checks = PrerequisiteCheck.run_all
    assert_kind_of Array, checks
    assert checks.any?, "Expected at least one check"
  end

  test "each check has required fields" do
    checks = PrerequisiteCheck.run_all
    checks.each do |check|
      assert check.name.present?, "Check missing name"
      assert check.category.present?, "Check missing category"
      assert %i[ok warning missing].include?(check.status), "Invalid status: #{check.status}"
    end
  end

  test "summary returns correct counts" do
    summary = PrerequisiteCheck.summary
    assert_equal summary[:total], summary[:ok] + summary[:warnings] + summary[:missing]
    assert summary[:total] > 0
  end

  test "ruby and git are detected as ok" do
    checks = PrerequisiteCheck.run_all
    ruby_check = checks.find { |c| c.name == "ruby" }
    git_check = checks.find { |c| c.name == "git" }

    assert ruby_check&.ok?, "Expected ruby to be ok"
    assert git_check&.ok?, "Expected git to be ok"
  end
end
