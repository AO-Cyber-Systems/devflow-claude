class PortsController < ApplicationController
  def index
    @ports = PortListener.all

    respond_to do |format|
      format.html
      format.turbo_stream { render turbo_stream: turbo_stream.replace("ports-list", partial: "ports/list", locals: { ports: @ports }) }
    end
  end

  def kill
    result = PortListener.kill(params[:id])
    if result[:success]
      redirect_to ports_path, notice: "Process #{params[:id]} terminated"
    else
      redirect_to ports_path, alert: result[:error]
    end
  end
end
