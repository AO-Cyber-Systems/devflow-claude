class MiseToolsController < ApplicationController
  def index
    # Renders page shell instantly — data loads via Turbo Frame
  end

  def installed
    @tools = MiseTool.all_installed
    @active_count = @tools.count(&:active?)
    @outdated_count = @tools.count(&:outdated?)
    render layout: false
  end

  def search
    results = MiseTool.search(params[:q].to_s)
    render json: results
  end

  def versions
    tool = params[:tool].to_s
    versions = MiseTool.available_versions(tool)
    render json: versions
  end

  def install_tool
    tool = params[:id].to_s
    version = params[:version].to_s
    if version.blank?
      render json: { success: false, error: "Version is required" }, status: :unprocessable_entity
      return
    end
    result = MiseTool.install(tool, version)
    render json: {
      success: result[:success],
      output: result[:stdout].to_s.slice(0, 2000),
      error: result[:stderr].to_s.slice(0, 2000)
    }
  end

  def uninstall_tool
    tool = params[:id].to_s
    version = params[:version].to_s
    if version.blank?
      render json: { success: false, error: "Version is required" }, status: :unprocessable_entity
      return
    end
    result = MiseTool.uninstall(tool, version)
    render json: {
      success: result[:success],
      output: result[:stdout].to_s.slice(0, 2000),
      error: result[:stderr].to_s.slice(0, 2000)
    }
  end

  def upgrade_tool
    tool = params[:id].to_s
    result = MiseTool.upgrade(tool)
    render json: {
      success: result[:success],
      output: result[:stdout].to_s.slice(0, 2000),
      error: result[:stderr].to_s.slice(0, 2000)
    }
  end
end
