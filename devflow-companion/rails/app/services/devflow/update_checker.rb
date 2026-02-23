# frozen_string_literal: true

module Devflow
  # Checks npm registry for the latest @ao-cyber-systems/devflow-cc version.
  # Downloads tarball, extracts to ~/.devflow-companion/cache/bundle/.
  # Calls Devflow::Installer to re-install from the cached bundle.
  class UpdateChecker
    PACKAGE_NAME = "@ao-cyber-systems/devflow-cc"
    REGISTRY_URL = "https://registry.npmjs.org/#{PACKAGE_NAME}"
    CACHE_DIR = DevflowBundle::CACHE_DIR

    class << self
      def check
        response = fetch_registry
        return nil unless response

        latest = response.dig("dist-tags", "latest")
        current = DevflowBundle.version

        {
          current_version: current,
          latest_version: latest,
          update_available: current.present? && latest.present? && Gem::Version.new(latest) > Gem::Version.new(current)
        }
      rescue => e
        Rails.logger.warn("[Devflow::UpdateChecker] Check failed: #{e.message}")
        nil
      end

      def download_and_install!(config_dir: nil)
        info = check
        raise "No update available" unless info&.dig(:update_available)

        # Get tarball URL
        registry = fetch_registry
        tarball_url = registry.dig("versions", info[:latest_version], "dist", "tarball")
        raise "Tarball URL not found" unless tarball_url

        # Download and extract
        download_and_extract(tarball_url)

        # Install from cached bundle
        if config_dir
          bundle = DevflowBundle.new(path: CACHE_DIR)
          installer = Installer.new(
            config_dir: config_dir,
            scope: "global",
            bundle: bundle,
            configure_statusline: false
          )
          installer.install!
        end

        info[:latest_version]
      end

      private

      def fetch_registry
        uri = URI(REGISTRY_URL)
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = true
        http.open_timeout = 5
        http.read_timeout = 10

        request = Net::HTTP::Get.new(uri)
        request["Accept"] = "application/json"

        response = http.request(request)
        return nil unless response.is_a?(Net::HTTPSuccess)

        JSON.parse(response.body)
      rescue => e
        Rails.logger.warn("[Devflow::UpdateChecker] Registry fetch failed: #{e.message}")
        nil
      end

      def download_and_extract(tarball_url)
        require "open-uri"
        require "rubygems/package"
        require "zlib"

        FileUtils.rm_rf(CACHE_DIR)
        FileUtils.mkdir_p(CACHE_DIR)

        # Download tarball
        tarball_path = File.join(Dir.tmpdir, "devflow-update.tgz")
        uri = URI(tarball_url)
        File.open(tarball_path, "wb") do |file|
          http = Net::HTTP.new(uri.host, uri.port)
          http.use_ssl = true
          http.request(Net::HTTP::Get.new(uri)) do |response|
            response.read_body { |chunk| file.write(chunk) }
          end
        end

        # Extract relevant directories from tarball
        # npm tarballs have a "package/" prefix
        extract_dirs = %w[skills agents devflow hooks/dist]

        Zlib::GzipReader.open(tarball_path) do |gz|
          Gem::Package::TarReader.new(gz) do |tar|
            tar.each do |entry|
              next unless entry.file?

              # Strip "package/" prefix
              rel_path = entry.full_name.sub(%r{^package/}, "")

              # Map hooks/dist -> hooks
              dest_rel = rel_path.sub(%r{^hooks/dist/}, "hooks/")

              # Only extract files in our target directories
              next unless extract_dirs.any? { |d| rel_path.start_with?("#{d}/") || rel_path.start_with?(d.sub("/dist", "/dist/")) }

              dest = File.join(CACHE_DIR, dest_rel)
              FileUtils.mkdir_p(File.dirname(dest))
              File.open(dest, "wb") { |f| f.write(entry.read) }
            end
          end
        end

        # Also extract package.json to get version
        Zlib::GzipReader.open(tarball_path) do |gz|
          Gem::Package::TarReader.new(gz) do |tar|
            tar.each do |entry|
              if entry.full_name == "package/package.json" && entry.file?
                pkg = JSON.parse(entry.read)
                File.write(File.join(CACHE_DIR, "VERSION"), pkg["version"])
                break
              end
            end
          end
        end

        # Cleanup
        File.delete(tarball_path) if File.exist?(tarball_path)
      end
    end
  end
end
