module Relay
  class BaseController < ApplicationController
    layout "relay"
    skip_before_action :check_prerequisites_on_first_visit

    # Web UI uses cookie session (no bearer token needed -- same origin)
    # Bearer token auth is for the API only (TRD 01)
  end
end
