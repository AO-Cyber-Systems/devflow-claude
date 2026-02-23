class API::SettingsController < ActionController::Base
  skip_forgery_protection

  def show
    key = params[:key]
    value = Setting.get(key)
    render json: { key: key, value: value }
  end
end
