class Devflow::ContextsController < ApplicationController
  def show
    @context = ContextMonitor.current

    respond_to do |format|
      format.html
      format.turbo_stream { render turbo_stream: turbo_stream.replace("context-monitor", partial: "devflow/context/monitor", locals: { context: @context }) }
    end
  end
end
