require "net/http"
require "uri"

module Claude
  class ProxyForwarder
    ANTHROPIC_HOST = "api.anthropic.com"
    ANTHROPIC_PORT = 443
    TIMEOUT = 300 # 5 minutes for long completions

    FORWARDED_REQUEST_HEADERS = %w[
      content-type
      anthropic-version
      anthropic-beta
      x-session-id
    ].freeze

    OAUTH_BETA_HEADERS = "oauth-2025-04-20"

    RATE_LIMIT_HEADERS = %w[
      anthropic-ratelimit-requests-remaining
      anthropic-ratelimit-requests-limit
      anthropic-ratelimit-requests-reset
      anthropic-ratelimit-tokens-remaining
      anthropic-ratelimit-tokens-limit
      anthropic-ratelimit-tokens-reset
    ].freeze

    attr_reader :account, :request_body, :headers, :path, :method

    def initialize(account:, request_body:, headers:, path:, method:)
      @account = account
      @request_body = request_body
      @headers = headers
      @path = path
      @method = method
    end

    def forward
      start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)

      uri = URI("https://#{ANTHROPIC_HOST}#{path}")
      http = build_http(uri)
      request = build_request(uri)

      response = http.request(request)
      elapsed_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round

      update_rate_limits(response)
      account.increment_request_count!
      log_request(response, elapsed_ms, streamed: false)

      { body: response.body, status: response.code.to_i, headers: extract_response_headers(response) }
    end

    def forward_stream(&chunk_handler)
      start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)

      uri = URI("https://#{ANTHROPIC_HOST}#{path}")
      http = build_http(uri)
      request = build_request(uri)

      status_code = nil
      response_headers = nil

      http.request(request) do |response|
        status_code = response.code.to_i
        response_headers = response
        update_rate_limits(response)
        account.increment_request_count!

        response.read_body do |chunk|
          chunk_handler.call(chunk)
        end
      end

      elapsed_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
      log_request_from_status(status_code, elapsed_ms, streamed: true)

      { status: status_code, headers: extract_response_headers(response_headers) }
    end

    private

    def build_http(uri)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 10
      http.read_timeout = TIMEOUT
      http
    end

    def build_request(uri)
      req = Net::HTTP::Post.new(uri)
      req.body = request_body

      # Forward relevant headers
      FORWARDED_REQUEST_HEADERS.each do |header|
        value = headers[header] || headers[header.tr("-", "_")]
        req[header] = value if value
      end

      if account.oauth?
        # Ensure token is fresh before sending
        Claude::TokenManager.ensure_valid_token!(account)
        account.reload

        req["authorization"] = "Bearer #{account.access_token}"
        # Append OAuth beta flag to any existing beta headers
        existing_beta = req["anthropic-beta"]
        req["anthropic-beta"] = [existing_beta, OAUTH_BETA_HEADERS].compact.join(",")
        req.delete("x-api-key")
      else
        req["x-api-key"] = account.api_key
      end

      req["content-type"] ||= "application/json"

      req
    end

    def update_rate_limits(response)
      remaining = response["anthropic-ratelimit-requests-remaining"]&.to_i
      limit = response["anthropic-ratelimit-requests-limit"]&.to_i
      reset = response["anthropic-ratelimit-requests-reset"]

      return unless remaining

      reset_time = reset ? Time.parse(reset) : nil
      account.record_rate_limit!(remaining: remaining, limit: limit, reset: reset_time)
    rescue ArgumentError
      # Invalid time format, skip
    end

    def extract_response_headers(response)
      return {} unless response

      headers = {}
      RATE_LIMIT_HEADERS.each do |header|
        value = response[header]
        headers[header] = value if value
      end
      headers["content-type"] = response["content-type"] if response["content-type"]
      headers
    end

    def log_request(response, elapsed_ms, streamed:)
      body = parse_json(response.body)
      ProxyRequest.create(
        proxy_account: account,
        method: method,
        path: path,
        status_code: response.code.to_i,
        response_time_ms: elapsed_ms,
        model: body&.dig("model"),
        input_tokens: body&.dig("usage", "input_tokens"),
        output_tokens: body&.dig("usage", "output_tokens"),
        streamed: streamed,
        error_type: error_type_from(response.code.to_i)
      )
    end

    def log_request_from_status(status_code, elapsed_ms, streamed:)
      ProxyRequest.create(
        proxy_account: account,
        method: method,
        path: path,
        status_code: status_code,
        response_time_ms: elapsed_ms,
        streamed: streamed,
        error_type: error_type_from(status_code)
      )
    end

    def error_type_from(status_code)
      case status_code
      when 200..299 then nil
      when 429 then "rate_limit"
      when 408, 504 then "timeout"
      when 500..599 then "server_error"
      when 400..499 then "client_error"
      else "unknown"
      end
    end

    def parse_json(body)
      JSON.parse(body)
    rescue JSON::ParserError, TypeError
      nil
    end
  end
end
