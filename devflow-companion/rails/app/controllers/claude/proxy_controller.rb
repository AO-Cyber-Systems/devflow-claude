module Claude
  class ProxyController < ActionController::API
    class NoAccountAvailable < StandardError; end
    class AccountRateLimited < StandardError
      attr_reader :account
      def initialize(account)
        @account = account
        super("Account #{account.name} rate limited")
      end
    end

    def messages
      account = AccountRouter.new(session_id: extract_session_id).select_account
      raise NoAccountAvailable unless account

      forwarder = ProxyForwarder.new(
        account: account,
        request_body: request.raw_post,
        headers: proxy_headers,
        path: "/v1/messages",
        method: "POST"
      )

      if streaming_request?
        stream_response(forwarder)
      else
        result = forwarder.forward

        if result[:status] == 429
          account = try_failover(account)
          raise NoAccountAvailable unless account

          forwarder = ProxyForwarder.new(
            account: account,
            request_body: request.raw_post,
            headers: proxy_headers,
            path: "/v1/messages",
            method: "POST"
          )
          result = forwarder.forward
        end

        result[:headers].each { |k, v| response.headers[k] = v }
        render json: result[:body], status: result[:status]
      end
    rescue NoAccountAvailable
      self.status = 529
      self.content_type = "application/json"
      self.response_body = { error: { type: "overloaded_error", message: "No proxy accounts available" } }.to_json
    end

    private

    def stream_response(forwarder)
      response.headers["Content-Type"] = "text/event-stream"
      response.headers["Cache-Control"] = "no-cache"
      response.headers["X-Accel-Buffering"] = "no"

      # Use ActionController::Live-style streaming
      self.response_body = Enumerator.new do |yielder|
        forwarder.forward_stream do |chunk|
          yielder << chunk
        end
      end
    rescue => e
      Rails.logger.error("[Claude::Proxy] Stream error: #{e.message}")
    end

    def try_failover(current_account)
      AccountRouter.new(session_id: extract_session_id).failover(current_account)
    end

    def streaming_request?
      body = parse_request_body
      body&.dig("stream") == true
    end

    def parse_request_body
      @parsed_body ||= JSON.parse(request.raw_post)
    rescue JSON::ParserError
      nil
    end

    def extract_session_id
      request.headers["X-Session-Id"] || request.headers["HTTP_X_SESSION_ID"]
    end

    def proxy_headers
      {
        "content-type" => request.content_type,
        "anthropic-version" => request.headers["Anthropic-Version"] || request.headers["HTTP_ANTHROPIC_VERSION"],
        "anthropic-beta" => request.headers["Anthropic-Beta"] || request.headers["HTTP_ANTHROPIC_BETA"],
        "x-session-id" => extract_session_id
      }.compact
    end
  end
end
