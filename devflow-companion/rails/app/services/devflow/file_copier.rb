# frozen_string_literal: true

module Devflow
  # Ports the file copying logic from bin/install.js:
  # - copySkills(), copyWithPathReplacement(), agent copying, hook copying
  # - Path replacement in .md files (global vs local)
  # - Attribution processing (Co-Authored-By lines)
  # - Clean install (removes existing dirs before copying)
  class FileCopier
    attr_reader :bundle, :config_dir, :scope, :attribution

    def initialize(bundle:, config_dir:, scope:, attribution: :keep)
      @bundle = bundle
      @config_dir = config_dir
      @scope = scope
      @attribution = attribution # :keep, :remove, or a String
    end

    def copy_all
      results = []
      results << copy_skills
      results << copy_devflow
      results << copy_agents
      results << copy_hooks
      results << copy_changelog
      results << write_version
      results << write_package_json
      results
    end

    def copy_skills
      src = bundle.skills_path
      dest = File.join(config_dir, "skills")
      return { component: "skills", status: :skipped } unless File.directory?(src)

      # Remove old df-* directories
      if File.directory?(dest)
        Dir.children(dest).each do |entry|
          full = File.join(dest, entry)
          FileUtils.rm_rf(full) if File.directory?(full) && entry.start_with?("df-")
        end
      else
        FileUtils.mkdir_p(dest)
      end

      # Remove legacy commands/df/
      legacy = File.join(config_dir, "commands", "df")
      FileUtils.rm_rf(legacy) if File.directory?(legacy)

      # Copy skill directories
      count = 0
      Dir.children(src).each do |entry|
        next unless entry.start_with?("df-")
        skill_src = File.join(src, entry)
        next unless File.directory?(skill_src)

        skill_dest = File.join(dest, entry)
        FileUtils.mkdir_p(skill_dest)

        Dir.glob(File.join(skill_src, "**", "*"), File::FNM_DOTMATCH).each do |file|
          next if File.directory?(file)
          rel = file.sub("#{skill_src}/", "")
          dest_file = File.join(skill_dest, rel)
          FileUtils.mkdir_p(File.dirname(dest_file))

          if file.end_with?(".md")
            content = File.read(file)
            content = replace_paths(content)
            content = apply_attribution(content)
            File.write(dest_file, content)
          else
            FileUtils.cp(file, dest_file)
          end
        end
        count += 1
      end

      { component: "skills", status: :ok, count: count }
    end

    def copy_devflow
      src = bundle.devflow_path
      dest = File.join(config_dir, "devflow")
      return { component: "devflow", status: :skipped } unless File.directory?(src)

      copy_recursive(src, dest, clean: true)
      { component: "devflow", status: :ok }
    end

    def copy_agents
      src = bundle.agents_path
      dest = File.join(config_dir, "agents")
      return { component: "agents", status: :skipped } unless File.directory?(src)

      FileUtils.mkdir_p(dest)

      # Remove old df-*.md agent files
      Dir.children(dest).each do |file|
        FileUtils.rm(File.join(dest, file)) if file.start_with?("df-") && file.end_with?(".md")
      end

      # Copy new agents
      count = 0
      Dir.children(src).each do |file|
        next unless file.end_with?(".md")
        src_file = File.join(src, file)
        dest_file = File.join(dest, file)

        content = File.read(src_file)
        content = replace_paths(content)
        content = apply_attribution(content)
        File.write(dest_file, content)
        count += 1
      end

      { component: "agents", status: :ok, count: count }
    end

    def copy_hooks
      src = bundle.hooks_path
      dest = File.join(config_dir, "hooks")
      return { component: "hooks", status: :skipped } unless File.directory?(src)

      FileUtils.mkdir_p(dest)

      count = 0
      Dir.children(src).each do |file|
        src_file = File.join(src, file)
        next unless File.file?(src_file)
        dest_file = File.join(dest, file)
        FileUtils.cp(src_file, dest_file)
        count += 1
      end

      { component: "hooks", status: :ok, count: count }
    end

    def copy_changelog
      src = bundle.changelog_path
      return { component: "changelog", status: :skipped } unless File.exist?(src)

      dest = File.join(config_dir, "devflow", "CHANGELOG.md")
      FileUtils.mkdir_p(File.dirname(dest))
      FileUtils.cp(src, dest)
      { component: "changelog", status: :ok }
    end

    def write_version
      version = bundle.version
      return { component: "version", status: :skipped } if version.blank?

      dest = File.join(config_dir, "devflow", "VERSION")
      FileUtils.mkdir_p(File.dirname(dest))
      File.write(dest, version)
      { component: "version", status: :ok, version: version }
    end

    def write_package_json
      dest = File.join(config_dir, "package.json")
      File.write(dest, "{\"type\":\"commonjs\"}\n")
      { component: "package_json", status: :ok }
    end

    private

    def path_prefix
      @path_prefix ||= if scope == "global"
        "#{config_dir.gsub('\\', '/')}/"
      else
        "./.claude/"
      end
    end

    def replace_paths(content)
      content
        .gsub("~/.claude/", path_prefix)
        .gsub("./.claude/", "./.claude/")
    end

    def apply_attribution(content)
      case attribution
      when :keep, nil
        content
      when :remove
        content.gsub(/(\r?\n){2}Co-Authored-By:.*$/im, "")
      else
        safe = attribution.to_s.gsub("$", "$$")
        content.gsub(/Co-Authored-By:.*$/i, "Co-Authored-By: #{safe}")
      end
    end

    def copy_recursive(src, dest, clean: false)
      if clean && File.directory?(dest)
        FileUtils.rm_rf(dest)
      end
      FileUtils.mkdir_p(dest)

      Dir.glob(File.join(src, "**", "*"), File::FNM_DOTMATCH).each do |file|
        next if File.directory?(file)
        rel = file.sub("#{src}/", "")
        dest_file = File.join(dest, rel)
        FileUtils.mkdir_p(File.dirname(dest_file))

        if file.end_with?(".md")
          content = File.read(file)
          content = replace_paths(content)
          content = apply_attribution(content)
          File.write(dest_file, content)
        else
          FileUtils.cp(file, dest_file)
        end
      end
    end
  end
end
