module Relay
  class DashboardController < BaseController
    def index
      @sessions = RelaySession.alive.order(last_activity_at: :desc)
      @total_pending = Event.joins(:relay_session)
                            .merge(RelaySession.alive)
                            .pending_decisions
                            .count
    end
  end
end
