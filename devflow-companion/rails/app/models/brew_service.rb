class BrewService
  attr_reader :name, :status, :user, :file

  KNOWN_SERVICES = %w[
    postgresql@14 postgresql@15 postgresql@16 postgresql
    redis memcached elasticsearch
    mysql mysql@8.0
    rabbitmq
    mailhog
    minio
  ].freeze

  def initialize(attrs = {})
    @name = attrs[:name]
    @status = attrs[:status] || "stopped"
    @user = attrs[:user]
    @file = attrs[:file]
  end

  def started?
    status == "started"
  end

  def stopped?
    !started?
  end

  def self.all
    result = CommandExecutor.run("brew", "services", "list")
    return [] unless result[:success]

    result[:stdout].lines.drop(1).filter_map do |line|
      parts = line.strip.split(/\s+/)
      next if parts.length < 2

      new(
        name: parts[0],
        status: parts[1],
        user: parts[2],
        file: parts[3]
      )
    end
  end

  def self.find(name)
    all.find { |s| s.name == name }
  end

  def self.start(name)
    CommandExecutor.run("brew", "services", "start", name)
  end

  def self.stop(name)
    CommandExecutor.run("brew", "services", "stop", name)
  end

  def self.restart(name)
    CommandExecutor.run("brew", "services", "restart", name)
  end
end
