module Claude
  class OAuthFlow
    CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
    AUTHORIZE_URL = "https://claude.ai/oauth/authorize"
    TOKEN_URL = "https://console.anthropic.com/v1/oauth/token"
    CALLBACK_PORT = 7856
    REDIRECT_URI = "http://localhost:#{CALLBACK_PORT}/oauth/callback"
    SCOPES = "user:inference user:profile org:create_api_key"

    class TimeoutError < StandardError; end
    class CallbackError < StandardError; end

    def start!
      code_verifier = generate_code_verifier
      code_challenge = generate_code_challenge(code_verifier)
      state = SecureRandom.hex(32)

      # Store PKCE verifier keyed by state for later retrieval
      Setting.set("oauth_verifier_#{state}", code_verifier)
      Setting.set("oauth_state", state)
      Setting.set("oauth_status", "pending")

      authorize_url = build_authorize_url(code_challenge: code_challenge, state: state)

      { authorize_url: authorize_url, state: state }
    end

    def wait_for_callback(state:, timeout: 120)
      server = TCPServer.new("127.0.0.1", CALLBACK_PORT)
      server.setsockopt(Socket::SOL_SOCKET, Socket::SO_REUSEADDR, true)

      code = nil
      deadline = Time.now + timeout

      loop do
        remaining = deadline - Time.now
        raise TimeoutError, "OAuth callback timed out after #{timeout}s" if remaining <= 0

        readable = IO.select([server], nil, nil, [remaining, 1].min)
        next unless readable

        client = server.accept
        request_line = client.gets
        break unless request_line

        if request_line.include?("/oauth/callback")
          params = parse_query_params(request_line)
          received_state = params["state"]

          if received_state == state && params["code"]
            code = params["code"]
            send_success_response(client)
          else
            error = params["error"] || "state_mismatch"
            send_error_response(client, error)
          end
        else
          send_error_response(client, "unexpected_path")
        end

        client.close
        break if code
      end

      raise CallbackError, "No authorization code received" unless code
      code
    ensure
      server&.close
    end

    def exchange_code(code:, code_verifier:)
      uri = URI(TOKEN_URL)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 10
      http.read_timeout = 10

      req = Net::HTTP::Post.new(uri)
      req["content-type"] = "application/x-www-form-urlencoded"
      req.body = URI.encode_www_form(
        grant_type: "authorization_code",
        code: code,
        code_verifier: code_verifier,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI
      )

      response = http.request(req)
      body = JSON.parse(response.body)

      unless response.code.to_i == 200
        raise CallbackError, "Token exchange failed: #{body["error_description"] || body["error"] || response.code}"
      end

      {
        access_token: body["access_token"],
        refresh_token: body["refresh_token"],
        expires_in: body["expires_in"]&.to_i || 28800
      }
    end

    def refresh_token(refresh_token:)
      uri = URI(TOKEN_URL)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 10
      http.read_timeout = 10

      req = Net::HTTP::Post.new(uri)
      req["content-type"] = "application/x-www-form-urlencoded"
      req.body = URI.encode_www_form(
        grant_type: "refresh_token",
        refresh_token: refresh_token,
        client_id: CLIENT_ID
      )

      response = http.request(req)
      body = JSON.parse(response.body)

      unless response.code.to_i == 200
        raise CallbackError, "Token refresh failed: #{body["error_description"] || body["error"] || response.code}"
      end

      {
        access_token: body["access_token"],
        refresh_token: body["refresh_token"],
        expires_in: body["expires_in"]&.to_i || 28800
      }
    end

    private

    def generate_code_verifier
      SecureRandom.urlsafe_base64(32).tr("=", "")
    end

    def generate_code_challenge(verifier)
      digest = Digest::SHA256.digest(verifier)
      Base64.urlsafe_encode64(digest, padding: false)
    end

    def build_authorize_url(code_challenge:, state:)
      params = URI.encode_www_form(
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        code_challenge: code_challenge,
        code_challenge_method: "S256",
        state: state
      )
      "#{AUTHORIZE_URL}?#{params}"
    end

    def parse_query_params(request_line)
      # Parse "GET /oauth/callback?code=xxx&state=yyy HTTP/1.1"
      path = request_line.split(" ")[1]
      query = URI.parse(path).query
      return {} unless query
      URI.decode_www_form(query).to_h
    end

    def send_success_response(client)
      body = <<~HTML
        <html><body style="font-family: system-ui; text-align: center; padding: 40px;">
          <h2>Authorization Complete</h2>
          <p>You can close this tab and return to DevFlow.</p>
        </body></html>
      HTML
      client.print "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: #{body.bytesize}\r\nConnection: close\r\n\r\n#{body}"
    end

    def send_error_response(client, error)
      body = <<~HTML
        <html><body style="font-family: system-ui; text-align: center; padding: 40px;">
          <h2>Authorization Failed</h2>
          <p>Error: #{error}</p>
        </body></html>
      HTML
      client.print "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\nContent-Length: #{body.bytesize}\r\nConnection: close\r\n\r\n#{body}"
    end
  end
end
