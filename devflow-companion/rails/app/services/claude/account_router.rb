module Claude
  class AccountRouter
    SESSION_DURATION = 5.hours

    def initialize(session_id: nil)
      @session_id = session_id
    end

    def select_account
      # Clear expired rate limits on all accounts
      ProxyAccount.where(status: "rate_limited").find_each(&:clear_rate_limit_if_expired!)

      # Check for existing sticky session
      account = sticky_session_account
      return account if account&.then { !_1.paused? && !_1.rate_limited? }

      # Select least-loaded available account
      account = ProxyAccount.available
        .order(Arel.sql("COALESCE(rate_limit_remaining, 999999) DESC"))
        .order(session_request_count: :asc)
        .first

      start_session(account) if account
      account
    end

    def failover(current_account)
      account = ProxyAccount.available
        .where.not(id: current_account.id)
        .order(Arel.sql("COALESCE(rate_limit_remaining, 999999) DESC"))
        .order(session_request_count: :asc)
        .first

      start_session(account) if account
      account
    end

    private

    def sticky_session_account
      account_id = Setting.get("proxy_session_account_id")
      return nil unless account_id

      account = ProxyAccount.find_by(id: account_id)
      return nil unless account
      return nil if account.session_expired?

      account
    end

    def start_session(account)
      account.start_session!
      Setting.set("proxy_session_account_id", account.id.to_s)
    end
  end
end
