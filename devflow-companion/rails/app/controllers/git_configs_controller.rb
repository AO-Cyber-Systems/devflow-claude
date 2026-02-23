class GitConfigsController < ApplicationController
  def show
    @global_config = GitConfig.global
    @local_config = current_project ? GitConfig.local(current_project.path) : []
  end

  def update
    scope = params[:scope] == "local" ? "--local" : "--global"
    key = params[:key]
    value = params[:value]

    if value.blank?
      GitConfig.unset(key, scope: scope)
      redirect_to git_config_path, notice: "#{key} removed"
    else
      result = GitConfig.set(key, value, scope: scope)
      if result[:success]
        redirect_to git_config_path, notice: "#{key} updated"
      else
        redirect_to git_config_path, alert: "Failed: #{result[:stderr]}"
      end
    end
  end
end
