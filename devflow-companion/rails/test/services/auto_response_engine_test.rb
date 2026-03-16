require "test_helper"

class AutoResponseEngineTest < ActiveSupport::TestCase
  setup do
    @session = RelaySession.create!(
      name: "Test Session",
      session_key: "rly_#{SecureRandom.hex(16)}",
      autonomy_level: "assisted",
      cwd: "/home/user/project"
    )
  end

  private

  def create_event(classification:, tool_name: "Bash", command: "npm test")
    Event.create!(
      relay_session: @session,
      event_type: "action_request",
      tool_name: tool_name,
      command: command,
      classification: classification,
      decision: "pending",
      decision_reason: "Test event"
    )
  end

  # --- Supervised mode (everything waits) ---

  test "supervised + safe -> pending" do
    @session.update!(autonomy_level: "supervised")
    event = create_event(classification: "safe")

    result = AutoResponseEngine.decide(event, @session)

    assert_equal "pending", result[:decision]
    assert_includes result[:reason], "Waiting for human"
    assert_equal "pending", event.reload.decision
  end

  test "supervised + scoped -> pending" do
    @session.update!(autonomy_level: "supervised")
    event = create_event(classification: "scoped")

    result = AutoResponseEngine.decide(event, @session)

    assert_equal "pending", result[:decision]
    assert_equal "pending", event.reload.decision
  end

  test "supervised + review -> pending" do
    @session.update!(autonomy_level: "supervised")
    event = create_event(classification: "review")

    result = AutoResponseEngine.decide(event, @session)

    assert_equal "pending", result[:decision]
  end

  test "supervised + destructive -> pending" do
    @session.update!(autonomy_level: "supervised")
    event = create_event(classification: "destructive")

    result = AutoResponseEngine.decide(event, @session)

    assert_equal "pending", result[:decision]
  end

  # --- Assisted mode (default) ---

  test "assisted + safe -> approve (no log)" do
    event = create_event(classification: "safe")

    result = AutoResponseEngine.decide(event, @session)

    assert_equal "approve", result[:decision]
    assert_equal "approve", event.reload.decision
    assert_equal "auto", event.decided_by
    assert_equal 0, AutoResponseLog.where(event: event).count
  end

  test "assisted + scoped -> approve (logged)" do
    event = create_event(classification: "scoped")

    result = AutoResponseEngine.decide(event, @session)

    assert_equal "approve", result[:decision]
    assert_includes result[:reason], "logged"
    assert_equal "approve", event.reload.decision
    assert_equal "auto", event.decided_by

    log = AutoResponseLog.find_by(event: event)
    assert_not_nil log
    assert_equal "approve", log.decision
    assert_equal "scoped", log.classification
    assert_equal "assisted", log.autonomy_level
    assert_equal event.tool_name, log.tool_name
    assert_equal event.command, log.command
  end

  test "assisted + review -> pending" do
    event = create_event(classification: "review")

    result = AutoResponseEngine.decide(event, @session)

    assert_equal "pending", result[:decision]
    assert_equal "pending", event.reload.decision
    assert_equal 0, AutoResponseLog.where(event: event).count
  end

  test "assisted + destructive -> pending" do
    event = create_event(classification: "destructive")

    result = AutoResponseEngine.decide(event, @session)

    assert_equal "pending", result[:decision]
    assert_equal "pending", event.reload.decision
  end

  # --- Autonomous mode ---

  test "autonomous + safe -> approve (no log)" do
    @session.update!(autonomy_level: "autonomous")
    event = create_event(classification: "safe")

    result = AutoResponseEngine.decide(event, @session)

    assert_equal "approve", result[:decision]
    assert_equal "approve", event.reload.decision
    assert_equal 0, AutoResponseLog.where(event: event).count
  end

  test "autonomous + scoped -> approve (logged)" do
    @session.update!(autonomy_level: "autonomous")
    event = create_event(classification: "scoped")

    result = AutoResponseEngine.decide(event, @session)

    assert_equal "approve", result[:decision]

    log = AutoResponseLog.find_by(event: event)
    assert_not_nil log
    assert_equal "autonomous", log.autonomy_level
  end

  test "autonomous + review -> approve (logged)" do
    @session.update!(autonomy_level: "autonomous")
    event = create_event(classification: "review")

    result = AutoResponseEngine.decide(event, @session)

    assert_equal "approve", result[:decision]
    assert_includes result[:reason], "logged"
    assert_equal "approve", event.reload.decision

    log = AutoResponseLog.find_by(event: event)
    assert_not_nil log
    assert_equal "review", log.classification
    assert_equal "autonomous", log.autonomy_level
  end

  test "autonomous + destructive -> pending (NEVER auto-approve)" do
    @session.update!(autonomy_level: "autonomous")
    event = create_event(classification: "destructive")

    result = AutoResponseEngine.decide(event, @session)

    assert_equal "pending", result[:decision]
    assert_equal "pending", event.reload.decision
    assert_equal 0, AutoResponseLog.where(event: event).count
  end

  # --- Error handling ---

  test "error in engine -> pending (fail-open)" do
    event = create_event(classification: "safe")

    # Create an engine with a session that raises on autonomy_level access
    error_session = Object.new
    def error_session.autonomy_level
      raise "DB connection lost"
    end

    result = AutoResponseEngine.new(event, error_session).decide

    assert_equal "pending", result[:decision]
    assert_includes result[:reason], "Error in auto-response"
  end

  # --- Edge cases ---

  test "nil classification defaults to review behavior" do
    event = create_event(classification: "safe")
    event.update_column(:classification, nil)

    result = AutoResponseEngine.decide(event, @session)

    # nil classification -> "review" default -> assisted + review = pending
    assert_equal "pending", result[:decision]
  end

  test "unknown autonomy_level defaults to pending" do
    # autonomy_level has NOT NULL, so test with an engine that receives
    # a session-like object with an unknown autonomy level
    event = create_event(classification: "safe")

    # Build a mock session with unknown autonomy
    mock_session = Struct.new(:autonomy_level).new("unknown_level")

    result = AutoResponseEngine.new(event, mock_session).decide

    # Unknown autonomy -> DECISION_MATRIX.dig returns nil -> :pending
    assert_equal "pending", result[:decision]
  end

  test "auto_response_log has UUID id" do
    event = create_event(classification: "scoped")

    AutoResponseEngine.decide(event, @session)

    log = AutoResponseLog.find_by(event: event)
    assert_match(/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/, log.id)
  end
end
