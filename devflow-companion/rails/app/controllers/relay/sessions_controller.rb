module Relay
  class SessionsController < BaseController
    def show
      @session = RelaySession.find(params[:id])
      @pending_events = @session.events.pending_decisions
                                .order(created_at: :desc)
                                .limit(50)
      @recent_events = @session.events.where.not(decision: "pending")
                               .order(created_at: :desc)
                               .limit(20)
      @work_summaries = @session.work_summaries
                                .order(created_at: :desc)
                                .limit(10)
      @unread_count = @session.work_summaries.unread.count
      @prompt_runs = @session.prompt_runs.order(created_at: :desc).limit(5)
    end

    def update
      @session = RelaySession.find(params[:id])
      @session.update!(session_params)

      respond_to do |format|
        format.html { redirect_to relay_session_path(@session), notice: "Session updated" }
        format.turbo_stream
      end
    end

    private

    def session_params
      params.require(:relay_session).permit(:autonomy_level, :remote_enabled, :imessage_enabled)
    end
  end
end
