require "test_helper"

class RelaySessionTest < ActiveSupport::TestCase
  test "generates session_key with rly_ prefix on create" do
    session = RelaySession.create!(name: "Test Session", last_activity_at: Time.current)
    assert session.session_key.start_with?("rly_")
    assert_equal 36, session.session_key.length # "rly_" + 32 hex chars
  end

  test "generates UUID id on create" do
    session = RelaySession.create!(name: "Test Session", last_activity_at: Time.current)
    assert_match(/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/, session.id)
  end

  test "find_or_create_from_event creates new session" do
    data = {
      claude_session_id: "cc-abc-123",
      project_name: "my-project",
      ide: "VS Code",
      branch: "main",
      cwd: "/tmp/my-project"
    }

    session = RelaySession.find_or_create_from_event(data)
    assert_equal "my-project", session.name
    assert_equal "cc-abc-123", session.claude_session_id
    assert_equal "VS Code", session.ide
    assert_equal "main", session.branch
    assert_equal "/tmp/my-project", session.cwd
    assert_equal "active", session.status
    assert_equal "assisted", session.autonomy_level
  end

  test "find_or_create_from_event finds existing by claude_session_id" do
    existing = RelaySession.create!(
      name: "Existing",
      claude_session_id: "cc-existing",
      last_activity_at: Time.current
    )

    found = RelaySession.find_or_create_from_event(claude_session_id: "cc-existing", project_name: "test")
    assert_equal existing.id, found.id
  end

  test "find_or_create_from_event finds existing by session_key" do
    existing = RelaySession.create!(
      name: "Existing",
      last_activity_at: Time.current
    )

    found = RelaySession.find_or_create_from_event(session_id: existing.session_key, project_name: "test")
    assert_equal existing.id, found.id
  end

  test "session color is deterministic per project_name" do
    s1 = RelaySession.create!(name: "Test", project_name: "alpha", last_activity_at: Time.current)
    s2 = RelaySession.create!(name: "Test2", project_name: "alpha", last_activity_at: Time.current)

    assert_equal s1.session_color, s2.session_color
    assert s1.session_color.present?
  end

  test "different projects get potentially different colors" do
    s1 = RelaySession.create!(name: "Test", project_name: "project-alpha", last_activity_at: Time.current)
    s2 = RelaySession.create!(name: "Test2", project_name: "project-beta", last_activity_at: Time.current)

    # Both have colors assigned
    assert s1.session_color.present?
    assert s2.session_color.present?
  end

  test "color_emoji returns matching emoji" do
    session = RelaySession.create!(name: "Test", project_name: "test-project", last_activity_at: Time.current)
    assert session.color_emoji.present?
    assert_includes SessionColor::COLOR_EMOJIS, session.color_emoji
  end

  test "autonomy_level enum works" do
    session = RelaySession.create!(name: "Test", autonomy_level: :autonomous, last_activity_at: Time.current)
    assert session.autonomous?
    assert_not session.supervised?
  end

  test "alive scope returns active and idle sessions" do
    active = RelaySession.create!(name: "Active", status: :active, last_activity_at: Time.current)
    idle = RelaySession.create!(name: "Idle", status: :idle, last_activity_at: Time.current)
    completed = RelaySession.create!(name: "Done", status: :completed, last_activity_at: Time.current)

    alive = RelaySession.alive
    assert_includes alive, active
    assert_includes alive, idle
    assert_not_includes alive, completed
  end

  test "touch_activity updates last_activity_at" do
    session = RelaySession.create!(name: "Test", last_activity_at: 1.hour.ago)
    session.touch_activity
    session.reload
    assert session.last_activity_at > 1.minute.ago
  end

  test "validates name presence" do
    session = RelaySession.new(name: nil)
    assert_not session.valid?
    assert_includes session.errors[:name], "can't be blank"
  end

  test "validates session_key uniqueness" do
    s1 = RelaySession.create!(name: "First", last_activity_at: Time.current)
    s2 = RelaySession.new(name: "Second", session_key: s1.session_key)
    assert_not s2.valid?
  end
end
