require "test_helper"

class EventTest < ActiveSupport::TestCase
  setup do
    @session = RelaySession.create!(
      name: "Test Session",
      last_activity_at: Time.current
    )
  end

  test "generates UUID id on create" do
    event = @session.events.create!(event_type: "action_request")
    assert_match(/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/, event.id)
  end

  test "validates event_type presence" do
    event = Event.new(relay_session: @session, event_type: nil)
    assert_not event.valid?
    assert_includes event.errors[:event_type], "can't be blank"
  end

  test "belongs to relay_session" do
    event = @session.events.create!(event_type: "status")
    assert_equal @session, event.relay_session
  end

  test "pending_decisions scope" do
    pending = @session.events.create!(event_type: "action_request", decision: "pending")
    approved = @session.events.create!(event_type: "action_request", decision: "approve")

    results = Event.pending_decisions
    assert_includes results, pending
    assert_not_includes results, approved
  end

  test "for_type scope" do
    action = @session.events.create!(event_type: "action_request")
    status = @session.events.create!(event_type: "status")

    results = Event.for_type("action_request")
    assert_includes results, action
    assert_not_includes results, status
  end

  test "resolve! updates decision fields" do
    event = @session.events.create!(event_type: "action_request", decision: "pending")
    event.resolve!("approve", "Looks safe", "user")

    event.reload
    assert_equal "approve", event.decision
    assert_equal "Looks safe", event.decision_reason
    assert_equal "user", event.decided_by
    assert event.decided_at.present?
  end

  test "has many notification_sends" do
    event = @session.events.create!(event_type: "action_request")
    ns = event.notification_sends.create!(channel: :imessage)
    assert_equal 1, event.notification_sends.count
    assert_equal event, ns.event
  end
end
