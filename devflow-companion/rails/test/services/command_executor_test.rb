require "test_helper"

class CommandExecutorTest < ActiveSupport::TestCase
  test "runs allowed commands" do
    result = CommandExecutor.run("git", "--version")
    assert result[:success]
    assert_match(/git version/, result[:stdout])
  end

  test "blocks disallowed commands" do
    result = CommandExecutor.run("rm", "-rf", "/")
    assert_not result[:success]
    assert_match(/not in allowlist/, result[:stderr])
  end

  test "blocks commands with path traversal" do
    result = CommandExecutor.run("/usr/bin/rm", "-rf", "/tmp")
    # basename is "rm" which is not in allowlist
    assert_not result[:success]
  end

  test "returns exit code" do
    result = CommandExecutor.run("git", "status")
    assert_kind_of Integer, result[:exit_code]
  end
end
