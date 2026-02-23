class PumaDev::ConfigsController < ApplicationController
  def show
    @config = PumaDev::Config.current
    @ssl_status = @config.ssl_status
    @resolver_status = @config.resolver_status
  end

  def update
    @config = PumaDev::Config.current

    case params[:action_type]
    when "update_tld"
      new_tlds = params[:tld].to_s.strip
      if new_tlds.blank?
        redirect_to puma_dev_config_path, alert: "TLD cannot be blank"
        return
      end

      @config.update_tld!(new_tlds)
      commands = @config.setup_commands(new_tlds).join("\n")
      redirect_to puma_dev_config_path, notice: "TLD updated to '#{new_tlds}'. Run these commands to configure DNS:\n#{commands}"
    when "update_timeout"
      duration = params[:timeout].to_s.strip
      if duration.blank?
        redirect_to puma_dev_config_path, alert: "Timeout cannot be blank"
        return
      end

      @config.update_timeout!(duration)
      redirect_to puma_dev_config_path, notice: "Timeout updated to #{duration}. Restart puma-dev to apply."
    when "start"
      result = @config.start!
      if result[:success]
        redirect_to puma_dev_config_path, notice: "puma-dev started"
      else
        redirect_to puma_dev_config_path, alert: "Failed to start: #{result[:stderr]}"
      end
    when "stop"
      result = @config.stop!
      if result[:success]
        redirect_to puma_dev_config_path, notice: "puma-dev stopped"
      else
        redirect_to puma_dev_config_path, alert: "Failed to stop: #{result[:stderr]}"
      end
    when "restart"
      @config.restart!
      redirect_to puma_dev_config_path, notice: "puma-dev restarted"
    when "stop_all"
      result = @config.stop_all!
      if result[:success]
        redirect_to puma_dev_config_path, notice: "All puma-dev apps stopped"
      else
        redirect_to puma_dev_config_path, alert: "Failed: #{result[:stderr]}"
      end
    else
      redirect_to puma_dev_config_path, alert: "Unknown action"
    end
  end
end
