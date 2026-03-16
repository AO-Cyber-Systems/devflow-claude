module Relay
  class EventsController < BaseController
    def resolve
      @event = Event.find(params[:id])

      decision = params[:decision]
      reason = params[:reason] || ""

      # For question responses, store response data
      if params[:response_value].present?
        @event.update!(response_data: { value: params[:response_value] })
      elsif params[:response_data].present?
        @event.update!(response_data: params[:response_data].to_unsafe_h)
      end

      @event.resolve!(decision, reason, "web_ui")

      respond_to do |format|
        format.html { redirect_to relay_session_path(@event.relay_session), notice: "Event #{decision}" }
        format.turbo_stream
      end
    end
  end
end
