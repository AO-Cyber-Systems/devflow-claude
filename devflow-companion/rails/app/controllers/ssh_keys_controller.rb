class SSHKeysController < ApplicationController
  def index
    @keys = SSHKey.all
  end

  def add_to_agent
    key = SSHKey.all.find { |k| k.name == params[:id] }
    if key
      result = SSHKey.add_to_agent(key.path)
      if result[:success]
        redirect_to ssh_keys_path, notice: "#{key.name} added to SSH agent"
      else
        redirect_to ssh_keys_path, alert: "Failed: #{result[:stderr]}"
      end
    else
      redirect_to ssh_keys_path, alert: "Key not found"
    end
  end
end
