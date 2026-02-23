# frozen_string_literal: true

module Devflow
  # Ports generateManifest()/writeManifest() from bin/install.js.
  # Walks installed devflow/, skills/, agents/ dirs, computes SHA256 hashes,
  # writes df-file-manifest.json.
  class ManifestWriter
    MANIFEST_NAME = "df-file-manifest.json"

    attr_reader :config_dir, :version

    def initialize(config_dir:, version:)
      @config_dir = config_dir
      @version = version
    end

    def write_manifest
      manifest = {
        "version" => version,
        "timestamp" => Time.current.iso8601,
        "files" => {}
      }

      # Hash devflow/ directory
      devflow_dir = File.join(config_dir, "devflow")
      collect_hashes(devflow_dir).each do |rel, hash|
        manifest["files"]["devflow/#{rel}"] = hash
      end

      # Hash skills/ directory
      skills_dir = File.join(config_dir, "skills")
      if File.directory?(skills_dir)
        collect_hashes(skills_dir).each do |rel, hash|
          manifest["files"]["skills/#{rel}"] = hash
        end
      end

      # Hash agents/ (only df-*.md files)
      agents_dir = File.join(config_dir, "agents")
      if File.directory?(agents_dir)
        Dir.children(agents_dir).each do |file|
          next unless file.start_with?("df-") && file.end_with?(".md")
          full_path = File.join(agents_dir, file)
          manifest["files"]["agents/#{file}"] = file_hash(full_path)
        end
      end

      manifest_path = File.join(config_dir, MANIFEST_NAME)
      File.write(manifest_path, JSON.pretty_generate(manifest))
      manifest
    end

    private

    def collect_hashes(dir)
      result = {}
      return result unless File.directory?(dir)

      Dir.glob(File.join(dir, "**", "*")).each do |file|
        next if File.directory?(file)
        rel = file.sub("#{dir}/", "")
        result[rel] = file_hash(file)
      end

      result
    end

    def file_hash(path)
      Digest::SHA256.hexdigest(File.read(path))
    end
  end
end
