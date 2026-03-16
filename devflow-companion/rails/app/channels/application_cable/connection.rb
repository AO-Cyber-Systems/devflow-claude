module ApplicationCable
  class Connection < ActionCable::Connection::Base
    # Web UI connections use cookie session (same origin)
    # No explicit auth needed for single-user companion app
  end
end
