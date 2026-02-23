class DashboardController < ApplicationController
  def index
    @services = BrewService.all
    @puma_dev_apps = PumaDevApp.all
    @ports = PortListener.all
    @context = ContextMonitor.current

    @smtp_status = SmtpServerManager.status

    @stats = {
      active_services: @services.count(&:started?),
      total_services: @services.count,
      puma_dev_apps: @puma_dev_apps.count,
      open_ports: @ports.count,
      context_usage: @context[:usage_percent],
      unread_emails: MailMessage.unread.count
    }
  end
end
