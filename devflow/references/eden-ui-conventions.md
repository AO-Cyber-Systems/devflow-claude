<eden_ui_conventions>

Reference for building and reviewing UI with the eden-ui design system. Eden-UI is a Rails engine gem providing 150+ ERB partial components built on Tailwind CSS with Stimulus.js controllers.

**Source:** `../eden-ui` (sibling directory to project root)

## Component Usage Pattern

All components are called via helper methods that render ERB partials:

```erb
<%# Block content style %>
<%= eden_button(variant: :primary, size: :lg) do %>
  Click me
<% end %>

<%# Data-driven style %>
<%= eden_data_table(columns: [...], rows: @users) %>

<%# Nested composition %>
<%= eden_breadcrumb do %>
  <%= eden_breadcrumb_item(label: "Home", href: "/") %>
  <%= eden_breadcrumb_item(label: "Current", current: true) %>
<% end %>
```

**Helper method naming:** `eden_{component_name}` — maps to `app/views/eden_ui/components/_{component_name}.html.erb`

## Component Inventory

| Category | Components |
|----------|-----------|
| **Buttons** | `button`, `button_group`, `speed_dial` |
| **Navigation** | `navbar`, `sidebar`, `sidebar_item`, `sidebar_group`, `breadcrumb`, `breadcrumb_item`, `pagination`, `tabs`, `tab_item`, `bottom_nav`, `bottom_nav_item`, `mega_menu` |
| **Data Display** | `table`, `table_head`, `table_row`, `data_table`, `list_group`, `list_group_item`, `timeline`, `timeline_item`, `activity_timeline`, `incident_timeline` |
| **Forms** | `input`, `textarea`, `select`, `checkbox`, `radio`, `toggle`, `file_input`, `dropzone`, `range`, `floating_label`, `search_input`, `phone_input`, `timepicker`, `datepicker`, `tag_input`, `label`, `form_group`, `helper_text`, `error_text`, `rich_editor` |
| **Overlays** | `modal`, `drawer`, `popover`, `tooltip`, `delete_confirm` |
| **Alerts** | `alert`, `banner`, `toast`, `flash_message`, `notification_item`, `notification_list`, `status_banner` |
| **Cards** | `card`, `stat_card`, `product_card`, `project_card`, `plan_card`, `event_card`, `file_card`, `integration_card` |
| **User/Profile** | `avatar`, `avatar_upload`, `user_card`, `profile_header`, `inbox_item`, `inbox_toolbar`, `message_view` |
| **Sections** | `hero_section`, `feature_section`, `pricing_section`, `team_section`, `testimonial_section`, `cta_section`, `contact_section`, `blog_section`, `faq_section`, `customer_logos`, `stats_section`, `content_section`, `footer`, `section_header`, `page_header` |
| **Business** | `data_table`, `kanban_board`, `kanban_column`, `kanban_card`, `task_list`, `task_item`, `ticket_item`, `ticket_detail`, `calendar`, `event_list`, `invoice`, `invoice_item`, `order_summary`, `transaction_item`, `crud_modal`, `bulk_action_bar`, `filter_dropdown`, `table_toolbar`, `service_status`, `crud_card_grid` |
| **Charts** | `bar_chart`, `line_chart`, `doughnut_chart`, `mini_chart`, `chart_card` |
| **Utilities** | `badge`, `indicator`, `kbd`, `divider`, `skeleton`, `spinner`, `progress`, `rating`, `clipboard`, `typing_indicator`, `device_mockup`, `gallery`, `empty_state`, `description_list`, `description_item`, `toolbar` |
| **Layout** | `accordion`, `accordion_item`, `stepper`, `stepper_item`, `carousel`, `dropdown`, `dropdown_item`, `dropdown_divider` |

## Layouts

Three pre-built layouts in `app/views/eden_ui/layouts/`:

| Layout | Usage | Key params |
|--------|-------|-----------|
| `_app.html.erb` | Dashboard/app pages | `app_name`, `logo_path`, `sidebar_items`, `user` |
| `_auth.html.erb` | Login/signup flows | `app_name`, `heading`, `description` |
| `_marketing.html.erb` | Landing/marketing pages | `app_name`, `nav_items`, `cta_text`, `cta_path` |

## Design Tokens

### Colors

**Brand — Primary palette (configurable, defaults to gold):**

The `primary-*` classes map to whichever brand is configured via `EdenUi.configure { |c| c.brand_color = :blue }`. Available presets: `:gold`, `:blue`, `:emerald`, `:purple`, `:red`, `:slate`, or a custom hash.

| Token | Usage |
|-------|-------|
| `primary-500` | Primary actions, links, focus rings |
| `primary-600` | Hover states |
| `primary-700` | Active/pressed states |
| `primary-50` | Light backgrounds |

The `gold-*` classes always reference the gold palette directly (useful for elements that should stay gold regardless of brand).

**Neutral — Zinc scale:**
`neutral-50` (#fafafa) through `neutral-950` (#0a0a0a). Use for text, backgrounds, borders.

**Aurora accents:**
| Token | Hex | Usage |
|-------|-----|-------|
| `aurora-purple` | `#a855f7` | Gradient accents |
| `aurora-blue` | `#3b82f6` | Info states, links |
| `aurora-cyan` | `#06b6d4` | Secondary accents |
| `aurora-emerald` | `#10b981` | Success states |

**Status:** `success` (#10b981), `warning` (#f59e0b), `error` (#ef4444), `info` (#3b82f6)

### Typography

| Token | Font | Usage |
|-------|------|-------|
| `--eden-font-display` | Outfit | Headings (h1-h6) |
| `--eden-font-body` | Plus Jakarta Sans | Body text, UI |
| `--eden-font-mono` | JetBrains Mono | Code, data |

Tailwind mapping: `font-sans` → body, `font-display` → headings, `font-mono` → code.

### Shadows

| Token | Usage |
|-------|-------|
| `shadow-sm` | Subtle elevation (inputs, small cards) |
| `shadow-md` | Medium elevation (dropdowns, popovers) |
| `shadow-lg` | High elevation (modals, drawers) |
| `shadow-glow` | Subtle brand glow for primary elements |
| `shadow-glow-strong` | Prominent brand glow for CTAs, focus |

### Animations

Built-in keyframes: `eden-fade-in`, `eden-slide-in-left/right/top/bottom`, `eden-scale-in`, `eden-pulse-glow`, `eden-shimmer`. All respect `prefers-reduced-motion`.

Timing: `--eden-duration-fast` (150ms), `--eden-duration-normal` (250ms), `--eden-duration-slow` (400ms). Easing: `--eden-ease-out-expo`.

### Z-Index Scale

`dropdown` (100), `sticky` (200), `modal-backdrop` (300), `modal` (400), `toast` (500), `command-palette` (600).

## ERB Partial Pattern

Components follow this internal structure:

```erb
<%
  # 1. Options with defaults
  variant ||= :primary
  size ||= :md
  disabled ||= false
  html_options ||= {}
  content ||= nil

  # 2. Variant class mapping
  variant_classes = case variant.to_sym
  when :primary then "bg-primary-600 text-white hover:bg-primary-700..."
  when :secondary then "bg-white border border-gray-300..."
  end

  # 3. Size class mapping
  size_classes = case size.to_sym
  when :sm then "px-3 py-2 text-xs"
  when :md then "px-5 py-2.5 text-sm"
  when :lg then "px-5 py-3 text-base"
  end

  # 4. Assemble final classes
  classes = [base, size_classes, variant_classes, html_options.delete(:class)].compact_blank.join(" ")
%>

<%# 5. Render with tag.attributes for passthrough %>
<element class="<%= classes %>" <%= tag.attributes(html_options) %>>
  <%= content %>
</element>
```

**Key conventions:**
- `||=` for all defaults at top
- `variant.to_sym` / `size.to_sym` for symbol-safe comparison
- `html_options.delete(:class)` to merge custom classes
- `tag.attributes(html_options)` for data-* and aria-* passthrough
- `content` variable holds block capture from helper
- `compact_blank.join(" ")` for clean class assembly

## Stimulus Controller Pattern

Interactive components use Stimulus.js with `eden-` prefix:

```erb
<div data-controller="eden-modal"
     data-eden-modal-static-value="true">
  <button data-action="eden-modal#open">Open</button>
  <div data-eden-modal-target="overlay">...</div>
</div>
```

**Available controllers:** accordion, carousel, clipboard, dark_mode, drawer, dropdown, flash, modal, popover, sidebar, speed_dial, tab, toast, tooltip, tag_input, datepicker, chart.

**Controller structure:**
- `static targets = [...]` — DOM element references
- `static values = { key: { type: Boolean, default: false } }` — configurable values
- `connect()` / `disconnect()` — lifecycle hooks with event listener cleanup
- Keyboard handling (Escape to close, Tab trapping, Arrow navigation)

## Form Builder

Custom form builder for model-backed forms:

```erb
<%= form_with model: @user, builder: EdenUi::FormBuilder do |f| %>
  <%= f.eden_text_field :name, label: "Full Name", hint: "Your legal name" %>
  <%= f.eden_email_field :email, label: "Email" %>
  <%= f.eden_select :role, options_for_select(roles), label: "Role" %>
  <%= f.eden_toggle :active, label: "Active" %>
<% end %>
```

## Icon System

80+ Heroicons (outline, 24x24) via `eden_icon(name, class: "w-4 h-4")`. Kebab-case names: `chevron-down`, `user-plus`, `arrow-right`, `magnifying-glass`, `home`, `cog`, etc.

## Dark Mode

All components support dark mode via Tailwind `dark:` variants. Eden-UI defaults to `dark_mode: true` in configuration. Classes follow the pattern: `bg-white dark:bg-gray-800 text-gray-900 dark:text-white`.

## Anti-Patterns

**Do NOT:**
- Write raw Tailwind HTML when an eden-ui component exists for that pattern
- Use Flowbite classes/JS directly — use eden-ui's Stimulus controllers instead
- Mix component styles (e.g., don't use eden_button inside a non-eden form)
- Hardcode colors instead of using design tokens (`bg-yellow-500` → `bg-primary-500`)
- Skip dark mode variants on custom elements
- Use inline styles — use Tailwind utilities or eden tokens
- Forget `html_options` passthrough in new components
- Create ad-hoc modals/drawers — use eden_modal/eden_drawer with Stimulus

**Do:**
- Compose using eden helpers: `eden_card`, `eden_button`, `eden_alert`, etc.
- Use `eden_empty_state` for zero-data scenarios
- Use `eden_form_group` to wrap form fields (handles label, error, hint)
- Use the primary palette (`primary-*`) for brand/CTA elements (adapts to configured brand)
- Include icons via `eden_icon()` — never inline raw SVG in views
- Use `eden_flash_message` in layouts for flash[:notice]/flash[:alert]
- Test with dark mode enabled (default)
- Use the FormBuilder for model-backed forms

## File Reference

| Path | Contents |
|------|----------|
| `app/views/eden_ui/components/` | 150+ ERB partial components |
| `app/helpers/eden_ui/component_helper.rb` | All helper methods (1077 lines) |
| `app/helpers/eden_ui/icon_helper.rb` | Icon SVG registry |
| `app/helpers/eden_ui/form_helper.rb` | Form-specific helpers |
| `app/helpers/eden_ui/layout_helper.rb` | Layout rendering helpers |
| `app/assets/stylesheets/eden_ui/tokens.css` | Design token definitions |
| `app/assets/stylesheets/eden_ui/theme.css` | Tailwind @theme mapping |
| `app/assets/stylesheets/eden_ui/animations.css` | Keyframe animations |
| `app/assets/javascripts/eden_ui/controllers/` | 17 Stimulus controllers |
| `lib/eden_ui/form_builder.rb` | Custom FormBuilder class |
| `lib/eden_ui/engine.rb` | Engine initialization |
| `lib/eden_ui/configuration.rb` | Config options |
| `lib/eden_ui/brand_presets.rb` | Brand color + font presets |
| `app/helpers/eden_ui/brand_helper.rb` | Brand style/font head tag helpers |

## Brand Customization

Each Rails app can configure its own brand via the initializer:

```ruby
EdenUi.configure do |config|
  config.brand_color = :blue        # or :emerald, :purple, :red, :slate, or custom hash
  config.font_preset = :inter       # or :system, or custom hash
end
```

**Presets:** `:gold` (default), `:blue`, `:emerald`, `:purple`, `:red`, `:slate`

**Head tag requirements** — add to application layout `<head>`:
```erb
<%= eden_font_tags %>           <%# Google Fonts (respects font_preset) %>
<%= eden_brand_style_tag %>     <%# Brand color overrides (no-op for :gold) %>
<%= eden_design_theme_script %> <%# Dark mode init script %>
```

**How it works:** CSS custom properties `--eden-primary-*` default to gold in `tokens.css`. The `eden_brand_style_tag` helper emits a `<style>` tag that overrides these variables when a non-gold brand is configured. All `primary-*` Tailwind classes flow through this indirection. No component changes needed.

</eden_ui_conventions>
