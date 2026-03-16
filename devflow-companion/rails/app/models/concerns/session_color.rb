module SessionColor
  extend ActiveSupport::Concern

  PALETTE = [
    "#3B82F6", # blue
    "#10B981", # emerald
    "#F59E0B", # amber
    "#EF4444", # red
    "#8B5CF6", # violet
    "#EC4899", # pink
    "#06B6D4", # cyan
    "#F97316", # orange
    "#84CC16", # lime
    "#6366F1", # indigo
    "#14B8A6", # teal
    "#D946EF", # fuchsia
  ].freeze

  COLOR_EMOJIS = %w[
    blue_circle
    green_circle
    yellow_circle
    red_circle
    purple_circle
    heart
    diamond_with_a_dot
    orange_circle
    green_heart
    blue_heart
    white_circle
    purple_heart
  ].freeze

  included do
    before_create :assign_color
  end

  def assign_color
    return if session_color.present?
    return unless project_name.present?

    index = Digest::SHA256.hexdigest(project_name).hex % PALETTE.size
    self.session_color = PALETTE[index]
  end

  def color_emoji
    return "white_circle" unless session_color.present?

    palette_index = PALETTE.index(session_color)
    return "white_circle" unless palette_index

    COLOR_EMOJIS[palette_index]
  end
end
