port ENV.fetch("PORT") { 3000 }
bind "tcp://127.0.0.1:#{ENV.fetch('PORT') { 3000 }}"

threads_count = ENV.fetch("RAILS_MAX_THREADS") { 5 }
threads threads_count, threads_count

environment ENV.fetch("RAILS_ENV") { "development" }

# Single mode — no workers, simpler for Electron embedding
workers 0

pidfile ENV.fetch("PIDFILE") { "tmp/pids/server.pid" }
