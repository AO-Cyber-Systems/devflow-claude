require "test_helper"

class SmtpServerManagerTest < ActiveSupport::TestCase
  test "status returns stopped when not started" do
    SmtpServerManager.stop
    status = SmtpServerManager.status

    assert_equal "stopped", status[:status]
    assert_equal 1025, status[:port]
    assert_nil status[:error]
  end

  test "status includes port number" do
    status = SmtpServerManager.status
    assert_equal 1025, status[:port]
  end

  test "PORT constant is 1025" do
    assert_equal 1025, SmtpServerManager::PORT
  end

  test "HOST constant is localhost" do
    assert_equal "127.0.0.1", SmtpServerManager::HOST
  end

  test "running? returns false when stopped" do
    SmtpServerManager.stop
    assert_not SmtpServerManager.running?
  end
end
