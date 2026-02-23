class DevflowState
  attr_reader :project_path

  def initialize(project_path)
    @project_path = project_path
  end

  def state_path
    File.join(project_path, ".planning", "STATE.md")
  end

  def roadmap_path
    File.join(project_path, ".planning", "ROADMAP.md")
  end

  def config_path
    File.join(project_path, ".planning", "config.json")
  end

  def available?
    File.exist?(state_path)
  end

  def state
    return {} unless File.exist?(state_path)
    parse_state_md(File.read(state_path))
  end

  def roadmap
    return {} unless File.exist?(roadmap_path)
    parse_roadmap_md(File.read(roadmap_path))
  end

  def config
    return {} unless File.exist?(config_path)
    JSON.parse(File.read(config_path))
  rescue JSON::ParserError
    {}
  end

  def update_config(new_config)
    File.write(config_path, JSON.pretty_generate(new_config))
  end

  private

  def parse_state_md(content)
    data = { raw: content }

    # Extract workflow position
    if (match = content.match(/## Current Position\s*\n(.*?)(?=\n##|\z)/m))
      data[:position] = match[1].strip
    end

    # Extract current objective
    if (match = content.match(/Objective[:\s]*(\d+\.\d+)/))
      data[:current_objective] = match[1]
    end

    # Extract workflow step
    if (match = content.match(/Step[:\s]*([\w-]+)/i))
      data[:workflow_step] = match[1]
    end

    # Extract metrics
    if (match = content.match(/## Metrics\s*\n(.*?)(?=\n##|\z)/m))
      data[:metrics] = match[1].strip
    end

    data
  end

  def parse_roadmap_md(content)
    data = { raw: content, objectives: [] }

    content.scan(/## Objective (\d+(?:\.\d+)?)[:\s]*(.*?)(?=\n## Objective|\z)/m).each do |num, body|
      status = if body.include?("[x]") || body.include?("COMPLETE")
        "complete"
      elsif body.include?("IN PROGRESS") || body.include?("ACTIVE")
        "active"
      else
        "pending"
      end

      # Count jobs
      total_jobs = body.scan(/### Job/).length
      complete_jobs = body.scan(/\[x\]/).length

      data[:objectives] << {
        number: num,
        title: body.lines.first&.strip || "",
        status: status,
        total_jobs: total_jobs,
        complete_jobs: complete_jobs,
        progress: total_jobs > 0 ? (complete_jobs.to_f / total_jobs * 100).round : 0
      }
    end

    data
  end
end
