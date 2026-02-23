class PumaDev::AppsController < ApplicationController
  def index
    @apps = PumaDevApp.all
    @ssl_status = PumaDevApp.ssl_status
  end

  def create
    result = PumaDevApp.create(name: params[:name], path: params[:path])
    if result[:success]
      redirect_to puma_dev_apps_path, notice: "App '#{params[:name]}' linked"
    else
      redirect_to puma_dev_apps_path, alert: result[:error]
    end
  end

  def destroy
    result = PumaDevApp.remove(params[:id])
    if result[:success]
      redirect_to puma_dev_apps_path, notice: "App removed"
    else
      redirect_to puma_dev_apps_path, alert: result[:error]
    end
  end

  def restart
    app = PumaDevApp.find(params[:id])
    if app
      app.restart!
      redirect_to puma_dev_apps_path, notice: "#{app.name} restarting"
    else
      redirect_to puma_dev_apps_path, alert: "App not found"
    end
  end

  def logs
    @logs = PumaDevApp.tail_log(lines: params.fetch(:lines, 100).to_i)

    respond_to do |format|
      format.html
      format.turbo_stream { render turbo_stream: turbo_stream.replace("puma-dev-logs", partial: "puma_dev/apps/logs", locals: { logs: @logs }) }
    end
  end
end
