class Devflow::SettingsController < ApplicationController
  def show
    if current_project&.has_devflow?
      @devflow = DevflowState.new(current_project.path)
      @config = @devflow.config
    else
      @config = {}
    end
  end

  def update
    if current_project&.has_devflow?
      devflow = DevflowState.new(current_project.path)
      config = devflow.config

      # Merge submitted settings
      params[:config]&.each do |key, value|
        keys = key.split(".")
        target = config
        keys[0..-2].each { |k| target = (target[k] ||= {}) }
        target[keys.last] = cast_value(value)
      end

      devflow.update_config(config)
      redirect_to devflow_settings_path, notice: "Settings saved"
    else
      redirect_to devflow_settings_path, alert: "No DevFlow project selected"
    end
  end

  private

  def cast_value(val)
    case val
    when "true" then true
    when "false" then false
    when /\A\d+\z/ then val.to_i
    when /\A\d+\.\d+\z/ then val.to_f
    else val
    end
  end
end
