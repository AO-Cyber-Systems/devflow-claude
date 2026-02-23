class ProxyAccountsController < ApplicationController
  def index
    @accounts = ProxyAccount.order(:name)
    @recent_requests = ProxyRequest.recent.order(created_at: :desc).limit(20)
    @stats = {
      active_accounts: ProxyAccount.active.count,
      requests_today: ProxyRequest.total_today,
      avg_response_time: ProxyRequest.avg_response_time,
      error_rate: ProxyRequest.error_rate
    }

    respond_to do |format|
      format.html
      format.turbo_stream {
        render turbo_stream: turbo_stream.replace("proxy-dashboard",
          partial: "proxy_accounts/dashboard", locals: {
            accounts: @accounts, recent_requests: @recent_requests, stats: @stats
          })
      }
    end
  end

  def create
    @account = ProxyAccount.new(account_params)
    @account.auth_type = "api_key"
    if @account.save
      redirect_to proxy_accounts_path, notice: "Account '#{@account.name}' added"
    else
      redirect_to proxy_accounts_path, alert: @account.errors.full_messages.join(", ")
    end
  end

  def destroy
    account = ProxyAccount.find(params[:id])
    account.destroy
    redirect_to proxy_accounts_path, notice: "Account '#{account.name}' removed"
  end

  def pause
    account = ProxyAccount.find(params[:id])
    account.update!(paused: true)
    redirect_to proxy_accounts_path, notice: "Account '#{account.name}' paused"
  end

  def unpause
    account = ProxyAccount.find(params[:id])
    account.update!(paused: false, status: "active")
    redirect_to proxy_accounts_path, notice: "Account '#{account.name}' resumed"
  end

  def test_connection
    account = ProxyAccount.find(params[:id])
    uri = URI("https://api.anthropic.com/v1/messages")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = 5
    http.read_timeout = 5

    req = Net::HTTP::Post.new(uri)

    if account.oauth?
      Claude::TokenManager.ensure_valid_token!(account)
      account.reload
      req["authorization"] = "Bearer #{account.access_token}"
      req["anthropic-beta"] = Claude::ProxyForwarder::OAUTH_BETA_HEADERS
    else
      req["x-api-key"] = account.api_key
    end

    req["anthropic-version"] = "2023-06-01"
    req["content-type"] = "application/json"
    req.body = { model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }.to_json

    response = http.request(req)
    if response.code.to_i < 400 || response.code.to_i == 400
      redirect_to proxy_accounts_path, notice: "Account '#{account.name}' connection OK (HTTP #{response.code})"
    else
      redirect_to proxy_accounts_path, alert: "Account '#{account.name}' failed: HTTP #{response.code}"
    end
  rescue => e
    redirect_to proxy_accounts_path, alert: "Connection test failed: #{e.message}"
  end

  def authorize
    flow = Claude::OAuthFlow.new
    result = flow.start!

    # Launch background thread to wait for callback and complete the flow
    state = result[:state]
    Thread.new do
      begin
        Setting.set("oauth_status", "waiting")
        code = flow.wait_for_callback(state: state, timeout: 120)

        code_verifier = Setting.get("oauth_verifier_#{state}")
        tokens = flow.exchange_code(code: code, code_verifier: code_verifier)

        ProxyAccount.create!(
          name: "Claude Max #{ProxyAccount.where(auth_type: "oauth").count + 1}",
          auth_type: "oauth",
          access_token: tokens[:access_token],
          refresh_token: tokens[:refresh_token],
          token_expires_at: tokens[:expires_in].seconds.from_now
        )

        Setting.set("oauth_status", "complete")
      rescue Claude::OAuthFlow::TimeoutError
        Setting.set("oauth_status", "timeout")
      rescue => e
        Setting.set("oauth_status", "error:#{e.message}")
      ensure
        # Clean up PKCE verifier
        Setting.find_by(key: "oauth_verifier_#{state}")&.destroy
      end
    end

    render json: { authorize_url: result[:authorize_url], state: state }
  end

  def oauth_status
    status = Setting.get("oauth_status", "unknown")
    render json: { status: status }
  end

  def stats
    @accounts = ProxyAccount.order(:name)
    @recent_requests = ProxyRequest.recent.order(created_at: :desc).limit(20)
    @stats = {
      active_accounts: ProxyAccount.active.count,
      requests_today: ProxyRequest.total_today,
      avg_response_time: ProxyRequest.avg_response_time,
      error_rate: ProxyRequest.error_rate
    }

    respond_to do |format|
      format.turbo_stream {
        render turbo_stream: turbo_stream.replace("proxy-dashboard",
          partial: "proxy_accounts/dashboard", locals: {
            accounts: @accounts, recent_requests: @recent_requests, stats: @stats
          })
      }
    end
  end

  private

  def account_params
    params.require(:proxy_account).permit(:name, :api_key)
  end
end
