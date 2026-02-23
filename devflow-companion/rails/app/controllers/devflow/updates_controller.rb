# frozen_string_literal: true

module Devflow
  class UpdatesController < ApplicationController
    def check
      info = Devflow::UpdateChecker.check

      if info
        render json: {
          current_version: info[:current_version],
          latest_version: info[:latest_version],
          update_available: info[:update_available]
        }
      else
        render json: { error: "Unable to check for updates" }, status: :service_unavailable
      end
    end

    def apply
      config_dir = File.expand_path("~/.claude")
      version = Devflow::UpdateChecker.download_and_install!(config_dir: config_dir)

      # Reset the bundle instance so it picks up the new path
      DevflowBundle.instance_variable_set(:@instance, nil)

      render json: {
        success: true,
        version: version,
        message: "Updated to v#{version}"
      }
    rescue => e
      render json: {
        success: false,
        error: e.message
      }, status: :unprocessable_entity
    end
  end
end
