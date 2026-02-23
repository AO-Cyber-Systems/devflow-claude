class PrerequisitesController < ApplicationController
  skip_before_action :check_prerequisites_on_first_visit

  def index
    # Renders loading skeleton immediately — no checks
  end

  def results
    @summary = PrerequisiteCheck.summary
    @checks_by_category = @summary[:checks].group_by(&:category)
    render layout: false
  end

  def install
    recipe_key = params[:recipe]
    step_key = params[:step]

    # Validate recipe exists
    recipe = PrerequisiteCheck::INSTALL_RECIPES[recipe_key]
    unless recipe
      render json: { success: false, error: "Unknown recipe: #{recipe_key}" }, status: :unprocessable_entity
      return
    end

    # Validate step key exists in the recipe's server steps
    step = recipe[:steps].find { |s| s[:type] == "server" && s[:key] == step_key }
    unless step
      render json: { success: false, error: "Unknown step: #{step_key}" }, status: :unprocessable_entity
      return
    end

    result = PrerequisiteInstaller.run(step_key)
    render json: {
      success: result[:success],
      output: result[:stdout].to_s.slice(0, 2000),
      error: result[:stderr].to_s.slice(0, 2000)
    }
  end

  def recheck
    # Clear the "checked" flag so user can re-trigger the redirect
    Setting.set("prerequisites_checked", "false")
    redirect_to prerequisites_path
  end

  def dismiss
    Setting.set("prerequisites_checked", "true")
    redirect_to root_path
  end
end
