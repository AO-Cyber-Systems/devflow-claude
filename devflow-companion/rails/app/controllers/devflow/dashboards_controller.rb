class Devflow::DashboardsController < ApplicationController
  def show
    if current_project&.has_devflow?
      @devflow = DevflowState.new(current_project.path)
      @state = @devflow.state
      @roadmap = @devflow.roadmap
    else
      @devflow = nil
      @state = {}
      @roadmap = { objectives: [] }
    end
  end
end
