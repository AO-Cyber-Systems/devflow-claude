class BrewPackagesController < ApplicationController
  def index
    # Renders page shell instantly — data loads via Turbo Frame
  end

  def installed
    @packages = BrewPackage.all_installed
    @formulae_count = @packages.count(&:formula?)
    @casks_count = @packages.count(&:cask?)
    @outdated_count = @packages.count(&:outdated?)
    render layout: false
  end

  def search
    results = BrewPackage.search(params[:q].to_s)
    render json: results
  end

  def install_package
    name = params[:id].to_s
    cask = params[:cask] == "true"
    result = BrewPackage.install(name, cask: cask)
    render json: {
      success: result[:success],
      output: result[:stdout].to_s.slice(0, 2000),
      error: result[:stderr].to_s.slice(0, 2000)
    }
  end

  def uninstall_package
    name = params[:id].to_s
    cask = params[:cask] == "true"
    result = BrewPackage.uninstall(name, cask: cask)
    render json: {
      success: result[:success],
      output: result[:stdout].to_s.slice(0, 2000),
      error: result[:stderr].to_s.slice(0, 2000)
    }
  end

  def upgrade_package
    name = params[:id].to_s
    cask = params[:cask] == "true"
    result = BrewPackage.upgrade(name, cask: cask)
    render json: {
      success: result[:success],
      output: result[:stdout].to_s.slice(0, 2000),
      error: result[:stderr].to_s.slice(0, 2000)
    }
  end

  def upgrade_all
    result = BrewPackage.upgrade_all
    render json: {
      success: result[:success],
      output: result[:stdout].to_s.slice(0, 2000),
      error: result[:stderr].to_s.slice(0, 2000)
    }
  end
end
