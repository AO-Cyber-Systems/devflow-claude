require "test_helper"

class ActionClassifierTest < ActiveSupport::TestCase
  test "Read tool is safe" do
    result = ActionClassifier.classify(tool_name: "Read")
    assert_equal "safe", result[:classification]
    assert_includes result[:reason], "Read"
  end

  test "Write tool is safe" do
    result = ActionClassifier.classify(tool_name: "Write")
    assert_equal "safe", result[:classification]
  end

  test "Edit tool is safe" do
    result = ActionClassifier.classify(tool_name: "Edit")
    assert_equal "safe", result[:classification]
  end

  test "Glob tool is safe" do
    result = ActionClassifier.classify(tool_name: "Glob")
    assert_equal "safe", result[:classification]
  end

  test "Grep tool is safe" do
    result = ActionClassifier.classify(tool_name: "Grep")
    assert_equal "safe", result[:classification]
  end

  test "Bash npm test in project dir is scoped" do
    result = ActionClassifier.classify(
      tool_name: "Bash",
      command: "npm test",
      project_dir: "/home/user/project",
      cwd: "/home/user/project"
    )
    assert_equal "scoped", result[:classification]
  end

  test "Bash npm test outside project dir is review" do
    result = ActionClassifier.classify(
      tool_name: "Bash",
      command: "npm test",
      project_dir: "/home/user/project",
      cwd: "/tmp/other"
    )
    assert_equal "review", result[:classification]
    assert_includes result[:reason], "outside project directory"
  end

  test "Bash git status in project dir is scoped" do
    result = ActionClassifier.classify(
      tool_name: "Bash",
      command: "git status",
      project_dir: "/home/user/project",
      cwd: "/home/user/project"
    )
    assert_equal "scoped", result[:classification]
  end

  test "Bash rm -rf is destructive" do
    result = ActionClassifier.classify(
      tool_name: "Bash",
      command: "rm -rf /",
      project_dir: "/home/user/project",
      cwd: "/home/user/project"
    )
    assert_equal "destructive", result[:classification]
  end

  test "Bash git push is destructive" do
    result = ActionClassifier.classify(
      tool_name: "Bash",
      command: "git push origin main",
      project_dir: "/home/user/project",
      cwd: "/home/user/project"
    )
    assert_equal "destructive", result[:classification]
  end

  test "Bash git push --force is destructive" do
    result = ActionClassifier.classify(
      tool_name: "Bash",
      command: "git push --force origin main",
      project_dir: "/home/user/project",
      cwd: "/home/user/project"
    )
    assert_equal "destructive", result[:classification]
  end

  test "Bash git reset --hard is destructive" do
    result = ActionClassifier.classify(
      tool_name: "Bash",
      command: "git reset --hard HEAD~1",
      project_dir: "/home/user/project",
      cwd: "/home/user/project"
    )
    assert_equal "destructive", result[:classification]
  end

  test "Bash --no-verify is destructive" do
    result = ActionClassifier.classify(
      tool_name: "Bash",
      command: "git commit --no-verify -m 'skip hooks'",
      project_dir: "/home/user/project",
      cwd: "/home/user/project"
    )
    assert_equal "destructive", result[:classification]
  end

  test "Bash kill is destructive" do
    result = ActionClassifier.classify(
      tool_name: "Bash",
      command: "kill -9 12345",
      project_dir: "/home/user/project",
      cwd: "/home/user/project"
    )
    assert_equal "destructive", result[:classification]
  end

  test "Bash ls outside project dir is review" do
    result = ActionClassifier.classify(
      tool_name: "Bash",
      command: "ls /etc",
      project_dir: "/home/user/project",
      cwd: "/etc"
    )
    assert_equal "review", result[:classification]
    assert_includes result[:reason], "outside project directory"
  end

  test "Bash unknown command in project dir is review" do
    result = ActionClassifier.classify(
      tool_name: "Bash",
      command: "some-random-command --flag",
      project_dir: "/home/user/project",
      cwd: "/home/user/project"
    )
    assert_equal "review", result[:classification]
    assert_includes result[:reason], "Unknown bash command"
  end

  test "AskUserQuestion is review" do
    result = ActionClassifier.classify(tool_name: "AskUserQuestion")
    assert_equal "review", result[:classification]
  end

  test "unknown tool is review" do
    result = ActionClassifier.classify(tool_name: "SomeFutureTool")
    assert_equal "review", result[:classification]
    assert_includes result[:reason], "Unknown tool"
  end

  test "Bash bundle exec rspec in project dir is scoped" do
    result = ActionClassifier.classify(
      tool_name: "Bash",
      command: "bundle exec rspec spec/models",
      project_dir: "/home/user/project",
      cwd: "/home/user/project"
    )
    assert_equal "scoped", result[:classification]
  end

  test "Bash empty command is review" do
    result = ActionClassifier.classify(
      tool_name: "Bash",
      command: "",
      project_dir: "/home/user/project",
      cwd: "/home/user/project"
    )
    assert_equal "review", result[:classification]
  end

  test "Bash npm publish is destructive" do
    result = ActionClassifier.classify(
      tool_name: "Bash",
      command: "npm publish",
      project_dir: "/home/user/project",
      cwd: "/home/user/project"
    )
    assert_equal "destructive", result[:classification]
  end

  test "Bash DROP TABLE is destructive" do
    result = ActionClassifier.classify(
      tool_name: "Bash",
      command: "sqlite3 db.sqlite 'DROP TABLE users'",
      project_dir: "/home/user/project",
      cwd: "/home/user/project"
    )
    assert_equal "destructive", result[:classification]
  end
end
