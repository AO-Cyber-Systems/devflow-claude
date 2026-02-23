# frozen_string_literal: true

module Devflow
  # Ports saveLocalPatches() from bin/install.js.
  # Reads df-file-manifest.json, computes SHA256 of each installed file,
  # backs up modified files to df-local-patches/.
  class PatchSaver
    MANIFEST_NAME = "df-file-manifest.json"
    PATCHES_DIR_NAME = "df-local-patches"

    attr_reader :config_dir

    def initialize(config_dir:)
      @config_dir = config_dir
    end

    def save_local_patches
      manifest_path = File.join(config_dir, MANIFEST_NAME)
      return [] unless File.exist?(manifest_path)

      manifest = JSON.parse(File.read(manifest_path))
      patches_dir = File.join(config_dir, PATCHES_DIR_NAME)
      modified = []

      (manifest["files"] || {}).each do |rel_path, original_hash|
        full_path = File.join(config_dir, rel_path)
        next unless File.exist?(full_path)

        current_hash = file_hash(full_path)
        next if current_hash == original_hash

        backup_path = File.join(patches_dir, rel_path)
        FileUtils.mkdir_p(File.dirname(backup_path))
        FileUtils.cp(full_path, backup_path)
        modified << rel_path
      end

      if modified.any?
        meta = {
          backed_up_at: Time.current.iso8601,
          from_version: manifest["version"],
          files: modified
        }
        File.write(File.join(patches_dir, "backup-meta.json"), JSON.pretty_generate(meta))
      end

      modified
    rescue JSON::ParserError
      []
    end

    def local_patches_info
      meta_path = File.join(config_dir, PATCHES_DIR_NAME, "backup-meta.json")
      return nil unless File.exist?(meta_path)
      JSON.parse(File.read(meta_path))
    rescue JSON::ParserError
      nil
    end

    private

    def file_hash(path)
      Digest::SHA256.hexdigest(File.read(path))
    end
  end
end
