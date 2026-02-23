# frozen_string_literal: true

module ClaudeCode
  class PermissionsController < ApplicationController
    def show
      @permissions = ClaudeSettings.permissions
    end

    def update
      allow_list = params[:allow_list]&.split("\n")&.map(&:strip)&.reject(&:blank?) || []
      deny_list = params[:deny_list]&.split("\n")&.map(&:strip)&.reject(&:blank?) || []
      skip_dangerous = params[:skip_dangerous_mode] == "1"

      ClaudeSettings.update do |data|
        data["permissions"] ||= {}
        data["permissions"]["allow"] = allow_list
        data["permissions"]["deny"] = deny_list
        data["skipDangerousModePermissionPrompt"] = skip_dangerous

        data["permissions"].delete("allow") if allow_list.empty?
        data["permissions"].delete("deny") if deny_list.empty?
        data.delete("permissions") if data["permissions"].empty?
        data.delete("skipDangerousModePermissionPrompt") unless skip_dangerous
      end

      redirect_to claude_code_permissions_path, notice: "Permissions saved"
    end
  end
end
