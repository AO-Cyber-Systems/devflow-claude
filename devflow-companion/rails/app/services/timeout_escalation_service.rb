class TimeoutEscalationService
  def self.check_all
    new.check_all
  end

  def check_all
    Event.where(decision: "pending").find_each do |event|
      check_event(event)
    end
  end

  private

  def check_event(event)
    age_minutes = ((Time.current - event.created_at) / 60).to_i
    first_threshold = Setting.get("relay_timeout_first_minutes", "5").to_i
    second_threshold = Setting.get("relay_timeout_second_minutes", "30").to_i

    current_escalation = event.action_data["escalation_level"] || 0

    if age_minutes >= second_threshold && current_escalation < 2
      escalate!(event, 2, "Pending for #{age_minutes} minutes (urgent)")
    elsif age_minutes >= first_threshold && current_escalation < 1
      escalate!(event, 1, "Pending for #{age_minutes} minutes")
    end
  end

  def escalate!(event, level, message)
    data = event.action_data.dup
    data["escalation_level"] = level
    data["escalation_at"] = Time.current.iso8601
    event.update!(action_data: data)

    Rails.logger.info("Escalation level #{level} for event #{event.id}: #{message}")
  rescue => e
    # Log failure but don't block the escalation state machine
    Rails.logger.error("Failed to escalate event #{event.id}: #{e.message}")
  end
end
