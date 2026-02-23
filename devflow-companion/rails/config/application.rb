require_relative "boot"

require "rails/all"

Bundler.require(*Rails.groups)

module DevflowCompanion
  class Application < Rails::Application
    config.load_defaults 8.0
    # Disable YJIT (not needed for Electron-embedded app)
    # config.yjit = true

    config.autoload_lib(ignore: %w[assets tasks])

    # Bind to localhost only for security
    config.hosts << "127.0.0.1"
    config.hosts << "localhost"
    config.hosts << "devflow.dev"
    config.hosts << "devflow.test"

    # Don't generate system test files
    config.generators.system_tests = nil
  end
end
