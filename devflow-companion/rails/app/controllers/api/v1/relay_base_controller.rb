module Api
  module V1
    class RelayBaseController < ActionController::API
      before_action :authenticate_relay!

      rescue_from ActiveRecord::RecordNotFound, with: :not_found
      rescue_from ActiveRecord::RecordInvalid, with: :unprocessable_entity_error
      rescue_from ActionController::ParameterMissing, with: :bad_request

      private

      def authenticate_relay!
        authenticate_or_request_with_http_token do |token|
          expected = Setting.get("relay_auth_token")

          if expected.blank?
            # Auto-generate token on first API access
            expected = SecureRandom.hex(32)
            Setting.set("relay_auth_token", expected)
            Rails.logger.info "[Relay] Auto-generated auth token: #{expected}"
          end

          ActiveSupport::SecurityUtils.secure_compare(token, expected)
        end
      end

      def not_found
        render json: { error: "Not found" }, status: :not_found
      end

      def unprocessable_entity_error(exception)
        render json: { error: exception.message, errors: exception.record&.errors&.full_messages }, status: :unprocessable_entity
      end

      def bad_request(exception)
        render json: { error: exception.message }, status: :bad_request
      end
    end
  end
end
