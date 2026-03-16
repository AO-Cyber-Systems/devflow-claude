module Api
  module V1
    class EventsController < RelayBaseController
      def create
        session = RelaySession.find_or_create_from_event(event_params)

        event_attrs = event_params.except(:session_id, :claude_session_id, :ide, :project_name, :branch, :cwd)
        event = session.events.new(event_attrs)

        if event.event_type == "action_request"
          result = ActionClassifier.classify(
            tool_name: event.tool_name,
            command: event.command,
            project_dir: session.cwd,
            cwd: event.action_data["cwd"]
          )
          event.classification = result[:classification]
          event.decision = "pending"
          event.decision_reason = result[:reason]
          event.save!
          session.touch_activity

          response = AutoResponseEngine.decide(event, session)
          event.reload  # may have been resolved by engine

          render json: {
            event_id: event.id,
            decision: event.decision || response[:decision],
            classification: event.classification,
            reason: response[:reason],
            request_id: event.id
          }, status: :created
        else
          event.save!
          session.touch_activity

          render json: {
            event_id: event.id,
            decision: event.decision,
            classification: event.classification,
            reason: event.decision_reason,
            request_id: event.id
          }, status: :created
        end
      end

      def index
        events = Event.includes(:relay_session).order(created_at: :desc).limit(100)
        events = events.for_type(params[:event_type]) if params[:event_type].present?
        events = events.pending_decisions if params[:pending] == "true"

        render json: events.map { |e| event_json(e) }
      end

      def show
        event = Event.find(params[:id])

        # Trigger escalation check on poll (hooks poll every 1s)
        # This replaces Solid Queue recurring job since SQ is not configured
        if event.decision == "pending"
          TimeoutEscalationService.check_all
          event.reload
        end

        render json: event_json(event)
      end

      def resolve
        event = Event.find(params[:id])
        event.resolve!(
          params.require(:decision),
          params[:reason] || "Resolved via API",
          params[:decided_by] || "user"
        )

        render json: event_json(event)
      end

      private

      def event_params
        params.permit(
          :session_id, :event_type, :agent, :tool_name, :command,
          :claude_session_id, :ide, :project_name, :branch, :cwd,
          action_data: {}
        )
      end

      def event_json(event)
        {
          id: event.id,
          event_type: event.event_type,
          agent: event.agent,
          tool_name: event.tool_name,
          command: event.command,
          classification: event.classification,
          decision: event.decision,
          decision_reason: event.decision_reason,
          decided_by: event.decided_by,
          decided_at: event.decided_at,
          action_data: event.action_data,
          response_data: event.response_data,
          relay_session_id: event.relay_session_id,
          created_at: event.created_at,
          updated_at: event.updated_at
        }
      end
    end
  end
end
