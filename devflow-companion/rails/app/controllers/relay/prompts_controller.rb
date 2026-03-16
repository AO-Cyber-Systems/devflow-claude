module Relay
  class PromptsController < BaseController
    def create
      @session = RelaySession.find(params[:session_id])

      @prompt_run = @session.prompt_runs.create!(
        prompt: params[:prompt],
        mode: params[:mode] || "continue",
        status: :queued
      )

      ClaudePromptJob.perform_later(@prompt_run.id)

      respond_to do |format|
        format.html { redirect_to relay_session_path(@session), notice: "Prompt queued" }
        format.turbo_stream
      end
    end
  end
end
