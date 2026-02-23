module ProjectsHelper
  FRAMEWORK_BADGE_CLASSES = {
    "Rails" => "badge-danger",
    "Ruby" => "badge-danger",
    "Node" => "badge-success",
    "Python" => "badge-warning",
    "Go" => "badge-info",
    "Elixir" => "badge-info",
    "Rust" => "badge-info",
    "Java" => "badge-neutral",
  }.freeze

  def framework_badge_class(framework)
    FRAMEWORK_BADGE_CLASSES.fetch(framework, "badge-neutral")
  end
end
