# frozen_string_literal: true

module ClaudeCode
  class SettingsController < ApplicationController
    def show
      @settings = ClaudeSettings.read
      @env_vars = ClaudeSettings.env
      @attribution = ClaudeSettings.attribution
    end

    def update
      ClaudeSettings.update do |data|
        # Update env vars
        if params[:env].present?
          data["env"] ||= {}
          params[:env].each do |key, value|
            if value.blank?
              data["env"].delete(key)
            else
              data["env"][key] = value
            end
          end
          data.delete("env") if data["env"].empty?
        end

        # Update attribution
        if params.key?(:attribution)
          if params[:attribution].present?
            data["attribution"] ||= {}
            data["attribution"]["commit"] = params[:attribution][:commit]
          else
            data.delete("attribution")
          end
        end
      end

      redirect_to claude_code_settings_path, notice: "Settings saved"
    end
  end
end
