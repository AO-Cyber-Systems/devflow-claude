class API::TrayStatusesController < ActionController::Base
  skip_forgery_protection

  def show
    services = BrewService.all.map { |s| { name: s.name, status: s.status } }
    puma_dev_apps = PumaDevApp.all.map { |a| { name: a.name, url: a.url } }
    context = ContextMonitor.current

    proxy = {
      active_accounts: ProxyAccount.active.count,
      current_account: Setting.get("proxy_session_account_id")&.then { |id| ProxyAccount.find_by(id: id)&.name },
      requests_today: ProxyRequest.total_today,
      status: ProxyAccount.active.any? ? "healthy" : "no_accounts"
    }

    render json: {
      services: services,
      puma_dev_apps: puma_dev_apps,
      context: context,
      proxy: proxy
    }
  end

  def service_action
    name = params[:name]
    action = params[:action_type] || params[:action]

    case action
    when "start" then BrewService.start(name)
    when "stop" then BrewService.stop(name)
    when "restart" then BrewService.restart(name)
    end

    render json: { success: true }
  end

  def puma_dev_restart
    app = PumaDevApp.find(params[:name])
    app&.restart!
    render json: { success: true }
  end

  def quick_action
    case params[:action_type] || params[:quick_action]
    when "restart_all"
      BrewService.all.select(&:started?).each { |s| BrewService.restart(s.name) }
    when "stop_all"
      BrewService.all.select(&:started?).each { |s| BrewService.stop(s.name) }
    when "flush_dns"
      CommandExecutor.run("dscacheutil", "-flushcache")
    end

    render json: { success: true }
  end
end
