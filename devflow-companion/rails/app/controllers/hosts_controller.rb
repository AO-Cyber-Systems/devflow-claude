class HostsController < ApplicationController
  def index
    @entries = HostsEntry.all
    @raw_content = HostsEntry.raw_content
  end

  def create
    ip = params[:ip]
    hostname = params[:hostname]

    unless ip.present? && hostname.present?
      redirect_to hosts_path, alert: "IP and hostname are required"
      return
    end

    new_line = "#{ip}\t#{hostname}"
    new_line += " # #{params[:comment]}" if params[:comment].present?

    # Append via sudo
    result = sudo_append_hosts(new_line)
    if result[:success]
      redirect_to hosts_path, notice: "Host entry added"
    else
      redirect_to hosts_path, alert: "Failed to add entry: #{result[:error]}"
    end
  end

  def destroy
    line_number = params[:id].to_i
    result = sudo_remove_hosts_line(line_number)
    if result[:success]
      redirect_to hosts_path, notice: "Host entry removed"
    else
      redirect_to hosts_path, alert: "Failed to remove entry: #{result[:error]}"
    end
  end

  private

  def sudo_append_hosts(line)
    escaped = line.gsub('"', '\\"')
    script = "do shell script \"echo '#{escaped}' >> /etc/hosts\" with administrator privileges"
    stdout, stderr, status = Open3.capture3("osascript", "-e", script)
    { success: status.success?, error: stderr }
  end

  def sudo_remove_hosts_line(line_number)
    script = "do shell script \"sed -i '' '#{line_number}d' /etc/hosts\" with administrator privileges"
    stdout, stderr, status = Open3.capture3("osascript", "-e", script)
    { success: status.success?, error: stderr }
  end
end
