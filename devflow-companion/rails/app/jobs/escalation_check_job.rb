class EscalationCheckJob < ApplicationJob
  queue_as :default

  def perform
    TimeoutEscalationService.check_all
  end
end
