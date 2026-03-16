module Relay
  class SettingsController < BaseController
    def index
      @settings = {
        timeout_first_minutes: Setting.get("relay_timeout_first_minutes", "5"),
        timeout_second_minutes: Setting.get("relay_timeout_second_minutes", "30"),
        imessage_recipient: Setting.get("imessage_recipient", ""),
        tunnel_url: Setting.get("relay_tunnel_url", ""),
        auth_token: Setting.get("relay_auth_token", "")
      }
    end

    def update
      params[:settings]&.each do |key, value|
        if allowed_settings.include?(key.to_s)
          setting_key = key.to_s.start_with?("imessage_") ? key.to_s : "relay_#{key}"
          Setting.set(setting_key, value)
        end
      end
      redirect_to relay_settings_path, notice: "Settings updated"
    end

    private

    def allowed_settings
      %w[timeout_first_minutes timeout_second_minutes imessage_recipient tunnel_url]
    end
  end
end
