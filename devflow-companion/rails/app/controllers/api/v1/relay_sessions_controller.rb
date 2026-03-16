module Api
  module V1
    class RelaySessionsController < RelayBaseController
      def index
        sessions = RelaySession.alive.order(last_activity_at: :desc)

        render json: sessions.map { |s| session_json(s) }
      end

      def show
        session = RelaySession.find(params[:id])

        render json: session_json(session).merge(
          recent_events: session.events.order(created_at: :desc).limit(20).map { |e| event_summary(e) },
          recent_summaries: session.work_summaries.order(created_at: :desc).limit(5).map { |ws| summary_json(ws) }
        )
      end

      def update
        session = RelaySession.find(params[:id])
        session.update!(session_update_params)

        render json: session_json(session)
      end

      def destroy
        session = RelaySession.find(params[:id])
        session.update!(status: :completed)

        render json: { id: session.id, status: session.status }
      end

      private

      def session_update_params
        params.permit(:autonomy_level, :remote_enabled, :imessage_enabled)
      end

      def session_json(session)
        {
          id: session.id,
          name: session.name,
          session_key: session.session_key,
          claude_session_id: session.claude_session_id,
          ide: session.ide,
          project_name: session.project_name,
          branch: session.branch,
          cwd: session.cwd,
          agent: session.agent,
          status: session.status,
          autonomy_level: session.autonomy_level,
          session_color: session.session_color,
          remote_enabled: session.remote_enabled,
          imessage_enabled: session.imessage_enabled,
          pending_requests_count: session.pending_requests_count,
          last_activity_at: session.last_activity_at,
          created_at: session.created_at,
          updated_at: session.updated_at
        }
      end

      def event_summary(event)
        {
          id: event.id,
          event_type: event.event_type,
          tool_name: event.tool_name,
          classification: event.classification,
          decision: event.decision,
          created_at: event.created_at
        }
      end

      def summary_json(ws)
        {
          id: ws.id,
          content: ws.content,
          summary_type: ws.summary_type,
          read: ws.read,
          created_at: ws.created_at
        }
      end
    end
  end
end
