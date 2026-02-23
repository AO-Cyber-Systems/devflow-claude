class ServicesController < ApplicationController
  def index
    @services = BrewService.all

    respond_to do |format|
      format.html
      format.turbo_stream { render turbo_stream: turbo_stream.replace("services-list", partial: "services/list", locals: { services: @services }) }
    end
  end

  def start
    result = BrewService.start(params[:id])
    redirect_to services_path, notice: result[:success] ? "#{params[:id]} started" : "Failed: #{result[:stderr]}"
  end

  def stop
    result = BrewService.stop(params[:id])
    redirect_to services_path, notice: result[:success] ? "#{params[:id]} stopped" : "Failed: #{result[:stderr]}"
  end

  def restart
    result = BrewService.restart(params[:id])
    redirect_to services_path, notice: result[:success] ? "#{params[:id]} restarted" : "Failed: #{result[:stderr]}"
  end
end
