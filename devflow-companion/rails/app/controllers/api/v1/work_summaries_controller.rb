module Api
  module V1
    class WorkSummariesController < RelayBaseController
      def create
        session = RelaySession.find_or_create_from_event(summary_params)

        summary = session.work_summaries.create!(
          content: params.require(:content),
          summary_type: params[:summary_type] || "stop",
          metadata: params[:metadata] || {}
        )

        render json: {
          id: summary.id,
          relay_session_id: summary.relay_session_id,
          content: summary.content,
          summary_type: summary.summary_type,
          read: summary.read,
          created_at: summary.created_at
        }, status: :created
      end

      def index
        summaries = WorkSummary.includes(:relay_session).order(created_at: :desc)
        summaries = summaries.where(relay_session_id: params[:relay_session_id]) if params[:relay_session_id].present?
        summaries = summaries.unread if params[:unread] == "true"
        summaries = summaries.limit(50)

        render json: summaries.map { |ws|
          {
            id: ws.id,
            relay_session_id: ws.relay_session_id,
            content: ws.content,
            summary_type: ws.summary_type,
            read: ws.read,
            created_at: ws.created_at,
            session_name: ws.relay_session.name,
            session_color: ws.relay_session.session_color
          }
        }
      end

      def mark_read
        summary = WorkSummary.find(params[:id])
        summary.mark_read!

        render json: { id: summary.id, read: summary.read }
      end

      private

      def summary_params
        params.permit(:claude_session_id, :session_id, :project_name, :ide, :branch, :cwd, :agent)
      end
    end
  end
end
