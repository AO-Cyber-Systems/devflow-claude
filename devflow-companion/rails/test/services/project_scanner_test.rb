require "test_helper"
require "fileutils"
require "tmpdir"

class ProjectScannerTest < ActiveSupport::TestCase
  setup do
    @scan_dir = Dir.mktmpdir("scanner-test")

    # Create a Rails project
    @rails_dir = File.join(@scan_dir, "my-rails-app")
    FileUtils.mkdir_p(File.join(@rails_dir, ".git"))
    File.write(File.join(@rails_dir, "Gemfile"), "gem 'rails'\ngem 'pg'\n")

    # Create a Node project
    @node_dir = File.join(@scan_dir, "my-node-app")
    FileUtils.mkdir_p(File.join(@node_dir, ".git"))
    File.write(File.join(@node_dir, "package.json"), "{}")

    # Create a Go project
    @go_dir = File.join(@scan_dir, "my-go-app")
    FileUtils.mkdir_p(File.join(@go_dir, ".git"))
    File.write(File.join(@go_dir, "go.mod"), "module example.com/app")

    # Create a Ruby (non-Rails) project
    @ruby_dir = File.join(@scan_dir, "my-ruby-gem")
    FileUtils.mkdir_p(File.join(@ruby_dir, ".git"))
    File.write(File.join(@ruby_dir, "Gemfile"), "gem 'rspec'\n")

    # Create a dir without .git (should be skipped)
    @no_git_dir = File.join(@scan_dir, "plain-dir")
    FileUtils.mkdir_p(@no_git_dir)

    # Create a hidden dir (should be skipped)
    @hidden_dir = File.join(@scan_dir, ".hidden-repo")
    FileUtils.mkdir_p(File.join(@hidden_dir, ".git"))
  end

  teardown do
    FileUtils.rm_rf(@scan_dir)
  end

  test "discovers git repos at depth 1" do
    results = ProjectScanner.new([@scan_dir]).scan
    names = results.map(&:name)

    assert_includes names, "my-rails-app"
    assert_includes names, "my-node-app"
    assert_includes names, "my-go-app"
    assert_includes names, "my-ruby-gem"
  end

  test "skips dirs without .git" do
    results = ProjectScanner.new([@scan_dir]).scan
    names = results.map(&:name)

    assert_not_includes names, "plain-dir"
  end

  test "skips hidden dirs" do
    results = ProjectScanner.new([@scan_dir]).scan
    names = results.map(&:name)

    assert_not_includes names, ".hidden-repo"
  end

  test "detects Rails framework" do
    results = ProjectScanner.new([@scan_dir]).scan
    rails_result = results.find { |r| r.name == "my-rails-app" }

    assert_includes rails_result.frameworks, "Rails"
    assert_not_includes rails_result.frameworks, "Ruby"
  end

  test "detects Ruby without Rails" do
    results = ProjectScanner.new([@scan_dir]).scan
    ruby_result = results.find { |r| r.name == "my-ruby-gem" }

    assert_includes ruby_result.frameworks, "Ruby"
    assert_not_includes ruby_result.frameworks, "Rails"
  end

  test "detects Node framework" do
    results = ProjectScanner.new([@scan_dir]).scan
    node_result = results.find { |r| r.name == "my-node-app" }

    assert_includes node_result.frameworks, "Node"
  end

  test "detects Go framework" do
    results = ProjectScanner.new([@scan_dir]).scan
    go_result = results.find { |r| r.name == "my-go-app" }

    assert_includes go_result.frameworks, "Go"
  end

  test "marks adopted projects" do
    Project.create!(name: "my-rails-app", path: @rails_dir)

    results = ProjectScanner.new([@scan_dir]).scan
    rails_result = results.find { |r| r.name == "my-rails-app" }

    assert rails_result.adopted
  end

  test "marks non-adopted projects" do
    results = ProjectScanner.new([@scan_dir]).scan
    node_result = results.find { |r| r.name == "my-node-app" }

    assert_not node_result.adopted
  end

  test "results are sorted by name" do
    results = ProjectScanner.new([@scan_dir]).scan
    names = results.map(&:name)

    assert_equal names.sort, names
  end

  test "handles non-existent root" do
    results = ProjectScanner.new(["/nonexistent/path"]).scan

    assert_equal [], results
  end

  test "handles multiple roots" do
    second_dir = Dir.mktmpdir("scanner-test-2")
    extra = File.join(second_dir, "extra-app")
    FileUtils.mkdir_p(File.join(extra, ".git"))

    results = ProjectScanner.new([@scan_dir, second_dir]).scan
    names = results.map(&:name)

    assert_includes names, "extra-app"
    assert_includes names, "my-rails-app"
  ensure
    FileUtils.rm_rf(second_dir)
  end

  test "detects multiple frameworks in same project" do
    # Add package.json to the Rails project (Rails + Node)
    File.write(File.join(@rails_dir, "package.json"), "{}")

    results = ProjectScanner.new([@scan_dir]).scan
    rails_result = results.find { |r| r.name == "my-rails-app" }

    assert_includes rails_result.frameworks, "Rails"
    assert_includes rails_result.frameworks, "Node"
  end
end
