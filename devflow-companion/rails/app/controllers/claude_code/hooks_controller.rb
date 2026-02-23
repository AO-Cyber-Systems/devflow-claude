# frozen_string_literal: true

module ClaudeCode
  class HooksController < ApplicationController
    def index
      @hooks_by_event = ClaudeSettings.hooks
    end

    def create
      event_type = params[:event_type]
      command = params[:command]
      matcher = params[:matcher]
      timeout = params[:timeout]

      return redirect_to(claude_code_hooks_path, alert: "Event type and command required") if event_type.blank? || command.blank?

      ClaudeSettings.update do |data|
        data["hooks"] ||= {}
        data["hooks"][event_type] ||= []

        hook_entry = { "type" => "command", "command" => command }
        hook_entry["timeout"] = timeout.to_i if timeout.present?

        entry = { "hooks" => [hook_entry] }
        entry["matcher"] = matcher if matcher.present?

        data["hooks"][event_type] << entry
      end

      redirect_to claude_code_hooks_path, notice: "Hook added to #{event_type}"
    end

    def update
      event_type = params[:event_type]
      index = params[:id].to_i

      ClaudeSettings.update do |data|
        entry = data.dig("hooks", event_type, index)
        if entry
          if params[:command].present? && entry["hooks"]&.first
            entry["hooks"].first["command"] = params[:command]
          end
          if params.key?(:matcher)
            if params[:matcher].present?
              entry["matcher"] = params[:matcher]
            else
              entry.delete("matcher")
            end
          end
          if params[:timeout].present? && entry["hooks"]&.first
            entry["hooks"].first["timeout"] = params[:timeout].to_i
          end
        end
      end

      redirect_to claude_code_hooks_path, notice: "Hook updated"
    end

    def destroy
      event_type = params[:event_type]
      index = params[:id].to_i

      ClaudeSettings.update do |data|
        data.dig("hooks", event_type)&.delete_at(index)
        if data.dig("hooks", event_type)&.empty?
          data["hooks"].delete(event_type)
        end
        data.delete("hooks") if data["hooks"]&.empty?
      end

      redirect_to claude_code_hooks_path, notice: "Hook removed"
    end
  end
end
