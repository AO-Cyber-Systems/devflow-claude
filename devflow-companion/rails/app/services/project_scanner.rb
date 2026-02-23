class ProjectScanner
  Result = Struct.new(:name, :path, :frameworks, :has_git, :adopted, keyword_init: true)

  FRAMEWORK_MARKERS = {
    "Node" => "package.json",
    "Python" => %w[requirements.txt pyproject.toml],
    "Go" => "go.mod",
    "Rust" => "Cargo.toml",
    "Elixir" => "mix.exs",
    "Java" => %w[pom.xml build.gradle],
  }.freeze

  def initialize(roots)
    @roots = Array(roots).map { |r| File.expand_path(r) }
  end

  def scan
    adopted_paths = Project.pluck(:path).to_set

    @roots.flat_map { |root| scan_root(root, adopted_paths) }
         .sort_by(&:name)
  end

  private

  def scan_root(root, adopted_paths)
    return [] unless Dir.exist?(root)

    Dir.children(root)
       .reject { |name| name.start_with?(".") }
       .map { |name| File.join(root, name) }
       .select { |path| File.directory?(path) }
       .select { |path| File.directory?(File.join(path, ".git")) }
       .map do |path|
         Result.new(
           name: File.basename(path),
           path: path,
           frameworks: detect_frameworks(path),
           has_git: true,
           adopted: adopted_paths.include?(path)
         )
       end
  end

  def detect_frameworks(path)
    frameworks = []

    # Check Rails first (Gemfile with rails gem)
    gemfile = File.join(path, "Gemfile")
    if File.exist?(gemfile)
      content = File.read(gemfile) rescue ""
      if content.match?(/gem\s+['"]rails['"]/)
        frameworks << "Rails"
      else
        frameworks << "Ruby"
      end
    end

    FRAMEWORK_MARKERS.each do |framework, markers|
      Array(markers).each do |marker|
        if File.exist?(File.join(path, marker))
          frameworks << framework
          break
        end
      end
    end

    frameworks.uniq
  end
end
