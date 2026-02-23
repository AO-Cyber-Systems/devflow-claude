# frozen_string_literal: true

module Devflow
  # Orchestrator for DevFlow installation.
  # Calls PatchSaver, FileCopier, SettingsConfigurator, ManifestWriter in sequence.
  # Creates/updates DevflowInstallation record.
  class Installer
    attr_reader :config_dir, :scope, :bundle, :configure_statusline

    def initialize(config_dir:, scope:, bundle: nil, configure_statusline: true)
      @config_dir = File.expand_path(config_dir)
      @scope = scope
      @bundle = bundle || DevflowBundle.instance
      @configure_statusline = configure_statusline
    end

    def install!
      raise "Bundle not valid" unless bundle.valid?

      FileUtils.mkdir_p(config_dir)

      results = {
        local_patches: [],
        copy_results: [],
        manifest: nil,
        settings_configured: false,
        version: bundle.version
      }

      # 1. Save local patches before overwriting
      patch_saver = PatchSaver.new(config_dir: config_dir)
      results[:local_patches] = patch_saver.save_local_patches

      # 2. Read attribution setting
      attribution = read_attribution

      # 3. Copy all files
      copier = FileCopier.new(
        bundle: bundle,
        config_dir: config_dir,
        scope: scope,
        attribution: attribution
      )
      results[:copy_results] = copier.copy_all

      # 4. Configure settings.json (hooks, cleanup)
      configurator = SettingsConfigurator.new(config_dir: config_dir, scope: scope)
      configurator.configure

      # 5. Optionally configure statusline
      if configure_statusline && !configurator.has_existing_statusline?
        configurator.configure_statusline
      end
      results[:settings_configured] = true

      # 6. Write file manifest
      writer = ManifestWriter.new(config_dir: config_dir, version: bundle.version)
      results[:manifest] = writer.write_manifest

      # 7. Create/update installation record
      installation = DevflowInstallation.find_or_initialize_by(config_dir: config_dir)
      installation.assign_attributes(
        scope: scope,
        version: bundle.version,
        status: "installed",
        file_manifest: results[:manifest]["files"],
        local_patches: results[:local_patches],
        installed_at: installation.new_record? ? Time.current : installation.installed_at,
        updated_at_version: Time.current
      )
      installation.save!

      results[:installation] = installation
      results
    end

    private

    def read_attribution
      settings_path = File.join(config_dir, "settings.json")
      return :keep unless File.exist?(settings_path)

      settings = JSON.parse(File.read(settings_path))
      commit_attr = settings.dig("attribution", "commit")

      if commit_attr.nil? && !settings.key?("attribution")
        :keep
      elsif commit_attr == ""
        :remove
      elsif commit_attr.nil?
        :keep
      else
        commit_attr
      end
    rescue JSON::ParserError
      :keep
    end
  end
end
