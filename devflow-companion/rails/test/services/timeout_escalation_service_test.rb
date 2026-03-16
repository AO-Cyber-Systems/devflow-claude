require "test_helper"

class TimeoutEscalationServiceTest < ActiveSupport::TestCase
  setup do
    @session = RelaySession.create!(
      name: "Test Session",
      session_key: "rly_#{SecureRandom.hex(16)}",
      autonomy_level: "assisted",
      cwd: "/home/user/project"
    )
  end

  private

  def create_pending_event(created_at: Time.current)
    event = Event.create!(
      relay_session: @session,
      event_type: "action_request",
      tool_name: "Bash",
      command: "rm -rf /tmp/dangerous",
      classification: "destructive",
      decision: "pending",
      decision_reason: "Waiting for human",
      action_data: {}
    )
    # Use update_column to bypass validations and set exact created_at
    event.update_column(:created_at, created_at)
    event.reload
  end

  # --- No escalation ---

  test "event pending less than 5 minutes -> no escalation" do
    event = create_pending_event(created_at: 3.minutes.ago)

    TimeoutEscalationService.check_all

    event.reload
    assert_nil event.action_data["escalation_level"]
  end

  # --- First threshold ---

  test "event pending >= 5 minutes -> escalation level 1" do
    event = create_pending_event(created_at: 6.minutes.ago)

    TimeoutEscalationService.check_all

    event.reload
    assert_equal 1, event.action_data["escalation_level"]
    assert_not_nil event.action_data["escalation_at"]
  end

  test "event pending >= 5 minutes but already at level 1 -> no re-escalation" do
    event = create_pending_event(created_at: 10.minutes.ago)

    # First escalation
    TimeoutEscalationService.check_all
    event.reload
    assert_equal 1, event.action_data["escalation_level"]
    first_escalation_at = event.action_data["escalation_at"]

    # Second check should NOT re-escalate (still under 30 min)
    TimeoutEscalationService.check_all
    event.reload
    assert_equal 1, event.action_data["escalation_level"]
    assert_equal first_escalation_at, event.action_data["escalation_at"]
  end

  # --- Second threshold ---

  test "event pending >= 30 minutes -> escalation level 2" do
    event = create_pending_event(created_at: 31.minutes.ago)

    TimeoutEscalationService.check_all

    event.reload
    assert_equal 2, event.action_data["escalation_level"]
  end

  test "event pending >= 30 minutes already at level 2 -> no re-escalation" do
    event = create_pending_event(created_at: 45.minutes.ago)

    # First check -> level 2
    TimeoutEscalationService.check_all
    event.reload
    assert_equal 2, event.action_data["escalation_level"]
    escalation_at = event.action_data["escalation_at"]

    # Second check -> should not change
    TimeoutEscalationService.check_all
    event.reload
    assert_equal 2, event.action_data["escalation_level"]
    assert_equal escalation_at, event.action_data["escalation_at"]
  end

  # --- Custom timeout settings ---

  test "custom timeout settings are respected" do
    # Set custom thresholds: 2 min first, 10 min second
    Setting.set("relay_timeout_first_minutes", "2")
    Setting.set("relay_timeout_second_minutes", "10")

    event = create_pending_event(created_at: 3.minutes.ago)

    TimeoutEscalationService.check_all

    event.reload
    assert_equal 1, event.action_data["escalation_level"]

    # Clean up settings
    Setting.where(key: ["relay_timeout_first_minutes", "relay_timeout_second_minutes"]).delete_all
  end

  test "custom second threshold triggers level 2" do
    Setting.set("relay_timeout_first_minutes", "1")
    Setting.set("relay_timeout_second_minutes", "5")

    event = create_pending_event(created_at: 6.minutes.ago)

    TimeoutEscalationService.check_all

    event.reload
    assert_equal 2, event.action_data["escalation_level"]

    Setting.where(key: ["relay_timeout_first_minutes", "relay_timeout_second_minutes"]).delete_all
  end

  # --- Only pending events ---

  test "resolved events are not checked" do
    event = create_pending_event(created_at: 10.minutes.ago)
    event.resolve!("approve", "Approved by user", "user")

    TimeoutEscalationService.check_all

    event.reload
    assert_nil event.action_data["escalation_level"]
  end

  # --- Multiple events ---

  test "check_all processes multiple pending events" do
    event1 = create_pending_event(created_at: 6.minutes.ago)
    event2 = create_pending_event(created_at: 31.minutes.ago)
    event3 = create_pending_event(created_at: 2.minutes.ago)

    TimeoutEscalationService.check_all

    assert_equal 1, event1.reload.action_data["escalation_level"]
    assert_equal 2, event2.reload.action_data["escalation_level"]
    assert_nil event3.reload.action_data["escalation_level"]
  end
end
