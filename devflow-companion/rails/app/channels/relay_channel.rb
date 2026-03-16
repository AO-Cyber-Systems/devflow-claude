class RelayChannel < ApplicationCable::Channel
  def subscribed
    stream_from "relay_dashboard"
  end
end
