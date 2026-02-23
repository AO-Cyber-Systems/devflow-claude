class ProjectsController < ApplicationController
  def index
    @projects = Project.order(:name)
    @scan_roots = scan_roots
    @scan_results = ProjectScanner.new(@scan_roots).scan if session[:scan_triggered]
  end

  def create
    path = params[:path].to_s.strip
    path = File.expand_path(path) if path.start_with?("~")

    @project = Project.new(name: params[:name], path: path)

    if @project.save
      # Auto-activate if this is the first project
      if Project.count == 1
        Setting.set("current_project_path", @project.path)
      end
      redirect_to projects_path, notice: "Project '#{@project.name}' added."
    else
      redirect_to projects_path, alert: @project.errors.full_messages.join(", ")
    end
  end

  def destroy
    project = Project.find(params[:id])

    # Clear active project if we're removing it
    if Setting.get("current_project_path") == project.path
      Setting.set("current_project_path", "")
    end

    project.destroy
    redirect_to projects_path, notice: "Project removed."
  end

  def activate
    project = Project.find(params[:id])
    Setting.set("current_project_path", project.path)
    redirect_to projects_path, notice: "'#{project.name}' is now the active project."
  end

  def onboard
    project = Project.find(params[:id])
    Setting.set("current_project_path", project.path)

    TerminalLauncher.open_claude(project.path)
    redirect_to projects_path, notice: "Terminal opened for '#{project.name}'. Run /df:new-project to start onboarding."
  rescue TerminalLauncher::LaunchError => e
    redirect_to projects_path, alert: "Failed to open terminal: #{e.message}"
  end

  def scan
    if scan_roots.empty?
      redirect_to projects_path, alert: "Add at least one scan root before scanning."
    else
      session[:scan_triggered] = true
      redirect_to projects_path, notice: "Scan complete."
    end
  end

  def adopt
    path = params[:path].to_s.strip
    name = params[:name].to_s.strip

    project = Project.new(name: name, path: path)
    if project.save
      if Project.count == 1
        Setting.set("current_project_path", project.path)
      end
      session[:scan_triggered] = true
      redirect_to projects_path, notice: "Project '#{name}' adopted."
    else
      session[:scan_triggered] = true
      redirect_to projects_path, alert: project.errors.full_messages.join(", ")
    end
  end

  def add_scan_root
    path = params[:path].to_s.strip
    path = File.expand_path(path) if path.start_with?("~")

    unless Dir.exist?(path)
      redirect_to projects_path, alert: "Directory does not exist: #{path}"
      return
    end

    roots = scan_roots
    unless roots.include?(path)
      roots << path
      Setting.set("scan_roots", roots.to_json)
    end

    redirect_to projects_path, notice: "Scan root added."
  end

  def remove_scan_root
    path = params[:path].to_s.strip
    roots = scan_roots
    roots.delete(path)
    Setting.set("scan_roots", roots.to_json)
    session.delete(:scan_triggered)
    redirect_to projects_path, notice: "Scan root removed."
  end

  private

  def scan_roots
    raw = Setting.get("scan_roots", "[]")
    JSON.parse(raw)
  rescue JSON::ParserError
    []
  end
end
