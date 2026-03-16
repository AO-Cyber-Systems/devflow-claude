class AutoResponseEngine
  # 12-cell decision matrix: classification x autonomy level
  # CRITICAL: destructive NEVER auto-approves regardless of autonomy level
  DECISION_MATRIX = {
    "supervised" => { "safe" => :pending, "scoped" => :pending, "review" => :pending, "destructive" => :pending },
    "assisted"   => { "safe" => :approve, "scoped" => :approve_logged, "review" => :pending, "destructive" => :pending },
    "autonomous" => { "safe" => :approve, "scoped" => :approve_logged, "review" => :approve_logged, "destructive" => :pending }
  }.freeze

  def self.decide(event, session)
    new(event, session).decide
  end

  def initialize(event, session)
    @event = event
    @session = session
  end

  def decide
    classification = @event.classification || "review"
    autonomy = @session.autonomy_level || "assisted"
    action = DECISION_MATRIX.dig(autonomy, classification) || :pending

    case action
    when :approve
      @event.resolve!("approve", "Auto-approved: #{classification} action in #{autonomy} mode", "auto")
      { decision: "approve", reason: "Auto-approved (#{classification})" }
    when :approve_logged
      @event.resolve!("approve", "Auto-approved with logging: #{classification} action in #{autonomy} mode", "auto")
      log_auto_response!("approve", classification, autonomy)
      { decision: "approve", reason: "Auto-approved (#{classification}, logged)" }
    when :pending
      { decision: "pending", reason: "Waiting for human response (#{classification} in #{autonomy} mode)" }
    end
  rescue => e
    Rails.logger.error("AutoResponseEngine error: #{e.message}")
    { decision: "pending", reason: "Error in auto-response, falling back to manual" }
  end

  private

  def log_auto_response!(decision, classification, autonomy)
    AutoResponseLog.create!(
      event: @event,
      relay_session: @session,
      decision: decision,
      classification: classification,
      autonomy_level: autonomy,
      tool_name: @event.tool_name,
      command: @event.command
    )
  end
end
