class Environments::FilesController < ApplicationController
  def index
    @projects = Project.all
    @current_project = current_project
    if @current_project
      @env_files = discover_env_files(@current_project.path)
    else
      @env_files = []
    end
  end

  def show
    path = Base64.urlsafe_decode64(params[:path])
    unless File.exist?(path) && path.include?(".env")
      redirect_to environments_files_path, alert: "File not found"
      return
    end

    @file_path = path
    @file_name = File.basename(path)
    @entries = parse_env_file(path)
  end

  def update
    path = Base64.urlsafe_decode64(params[:path])
    unless File.exist?(path) && path.include?(".env")
      redirect_to environments_files_path, alert: "File not found"
      return
    end

    File.write(path, params[:content])
    redirect_to environments_file_path(path: params[:path]), notice: "Saved"
  end

  private

  SECRET_PATTERN = /SECRET|PASSWORD|TOKEN|KEY|API_KEY|PRIVATE/i

  def discover_env_files(project_path)
    Dir.glob(File.join(project_path, ".env*")).filter_map do |f|
      next if File.directory?(f)
      {
        path: f,
        name: File.basename(f),
        encoded_path: Base64.urlsafe_encode64(f),
        size: File.size(f)
      }
    end.sort_by { |f| f[:name] }
  end

  def parse_env_file(path)
    File.readlines(path).filter_map do |line|
      stripped = line.strip
      next if stripped.empty? || stripped.start_with?("#")

      key, value = stripped.split("=", 2)
      next unless key && value

      {
        key: key.strip,
        value: value.strip,
        secret: key.match?(SECRET_PATTERN)
      }
    end
  end
end
