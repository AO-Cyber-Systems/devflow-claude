module Claude
  class TokenManager
    @mutexes = {}
    @mutex_lock = Mutex.new

    class << self
      def ensure_valid_token!(account)
        return unless account.oauth?
        return unless account.token_expired? || account.token_expiring_soon?

        refresh!(account)
      end

      private

      def refresh!(account)
        mutex = mutex_for(account.id)

        mutex.synchronize do
          # Re-check after acquiring lock — another thread may have refreshed
          account.reload
          return unless account.token_expired? || account.token_expiring_soon?

          tokens = Claude::OAuthFlow.new.refresh_token(refresh_token: account.refresh_token)
          account.update_tokens!(
            access_token: tokens[:access_token],
            refresh_token: tokens[:refresh_token],
            expires_in: tokens[:expires_in]
          )
        end
      end

      def mutex_for(account_id)
        @mutex_lock.synchronize do
          @mutexes[account_id] ||= Mutex.new
        end
      end
    end
  end
end
