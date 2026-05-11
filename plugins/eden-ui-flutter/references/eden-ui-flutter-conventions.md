<eden_ui_flutter_conventions>

Reference for building and reviewing Flutter UI with the eden-ui-flutter design system. Eden-UI-Flutter is a Dart package providing 150+ widgets, 6 brand presets, light/dark themes, pre-built pages, and responsive layout utilities.

**Source:** `ao-cyber-systems/eden-ui-flutter` on GitHub (private)
**Local:** `../eden-ui-flutter` (sibling directory to project root)
**Package:** `eden_ui` (import `package:eden_ui/eden_ui.dart`)

## Widget Usage Pattern

All widgets are standard Flutter widgets with named constructors:

```dart
// Standard widget
EdenButton(
  label: 'Save Changes',
  variant: EdenButtonVariant.primary,
  size: EdenSize.md,
  onPressed: () => _save(),
)

// With icon
EdenButton.icon(
  icon: Icons.add,
  label: 'Add Item',
  variant: EdenButtonVariant.primary,
  onPressed: () => _add(),
)

// Composition
EdenCard(
  child: Column(
    children: [
      EdenPageHeader(title: 'Settings'),
      _buildForm(),
    ],
  ),
)
```

**Widget naming:** `Eden{ComponentName}` — e.g., `EdenButton`, `EdenCard`, `EdenDataTable`

## Widget Inventory

### Core UI

| Category | Widgets |
|----------|---------|
| **Buttons** | `EdenButton`, `EdenIconButton` |
| **Navigation** | `EdenBottomNav`, `EdenBreadcrumb`, `EdenTabs` |
| **Data Display** | `EdenDataTable`, `EdenDataGrid`, `EdenListGroup`, `EdenTimeline`, `EdenActivityFeed`, `EdenDescriptionList`, `EdenKeyValueTable` |
| **Forms** | `EdenForm`, `EdenInput`, `EdenSelect`, `EdenToggle`, `EdenSearchInput`, `EdenDatePicker`, `EdenMultiSelect`, `EdenCombobox`, `EdenFileUpload`, `EdenTagInput`, `EdenFormWizard` |
| **Overlays** | `EdenModal`, `EdenDrawer`, `EdenBottomSheet`, `EdenPopover` (via `EdenTooltip`), `EdenConfirmDialog`, `EdenCommandPalette` |
| **Feedback** | `EdenAlert`, `EdenBanner`, `EdenToast`, `EdenNotificationList` |
| **Cards** | `EdenCard`, `EdenStatCard`, `EdenProjectCard`, `EdenAccountCard`, `EdenCertificateCard`, `EdenEnvironmentCard`, `EdenToolCard`, `EdenFileCard` (via `EdenFileListTile`) |
| **Content** | `EdenAccordion`, `EdenCarousel`, `EdenStepper`, `EdenDropdown`, `EdenCodeBlock`, `EdenRichTextEditor`, `EdenMarkdownEditor`, `EdenDocumentViewer` |
| **Charts** | `EdenChart`, `EdenBurndownChart`, `EdenCodeFrequencyChart`, `EdenContributionGraph`, `EdenValueStreamMap` |
| **Status** | `EdenBadge`, `EdenIndicator`, `EdenProgress`, `EdenRating`, `EdenSkeleton`, `EdenSpinner`, `EdenLiveIndicator`, `EdenHealthCheck` |
| **Layout** | `EdenLayout` (exports), `EdenPageHeader`, `EdenSectionHeader`, `EdenSettingsSection`, `EdenDivider`, `EdenEmptyState`, `EdenErrorPage`, `EdenToolbar` |

### Messaging & Communication

| Widget | Purpose |
|--------|---------|
| `EdenChatBubble` | Chat message display |
| `EdenMessageBubble` | Rich message with metadata |
| `EdenMessageInput` | Compose message with attachments |
| `EdenReactionBar` | Emoji reactions on messages |
| `EdenLinkPreview` | URL preview cards |
| `EdenAttachmentPreview` | File/image attachment previews |
| `EdenMentionOverlay` | @mention autocomplete |
| `EdenConversationTile` | Conversation list item |
| `EdenConversationThread` | Threaded replies |
| `EdenDateSeparator` | Date dividers in chat |
| `EdenTypingIndicator` | "..." typing animation |
| `EdenBouncingDots` | Animated loading dots |
| `EdenStreamingIndicator` | AI streaming response indicator |

### Git & Source Code

| Widget | Purpose |
|--------|---------|
| `EdenCommitRow` | Commit list item |
| `EdenCommitDetail` | Full commit view |
| `EdenIssueRow` | Issue list item |
| `EdenIssueDetail` | Full issue view |
| `EdenLabelBadge` | Color-coded label |
| `EdenMilestoneCard` | Milestone progress card |
| `EdenFileTree` | File/folder tree browser |
| `EdenBlameView` | Git blame annotations |
| `EdenBranchSelector` | Branch dropdown selector |
| `EdenDiffViewer` | Side-by-side/unified diff |
| `EdenFileDiffHeader` | Diff file header bar |
| `EdenSuggestionBlock` | Code suggestion inline |

### Pull Requests & Code Review

| Widget | Purpose |
|--------|---------|
| `EdenPullRequestRow` | PR list item |
| `EdenPullRequestDetail` | Full PR view |
| `EdenReviewerList` | Reviewer avatars with status |
| `EdenMergeControls` | Merge/squash/rebase buttons |
| `EdenReviewComment` | Code review comment |
| `EdenReviewSummary` | Review approval summary |
| `EdenDiscussionThread` | PR discussion thread |
| `EdenDesignDiffViewer` | Visual design comparison |

### CI/CD & DevOps

| Widget | Purpose |
|--------|---------|
| `EdenPipelineGraph` | CI/CD pipeline visualization |
| `EdenJobCard` | Build/deploy job card |
| `EdenJobLog` | Job log output viewer |
| `EdenCheckStatusRow` | CI check status |
| `EdenDeploymentTimeline` | Deploy history timeline |
| `EdenRoadmapView` | Project roadmap visualization |
| `EdenServiceRow` | Service status row |
| `EdenPortRow` | Port/endpoint row |
| `EdenDomainRow` | Domain configuration row |
| `EdenReleaseCard` | Release version card |
| `EdenChangelogSection` | Release notes section |
| `EdenRegistryRow` | Container/package registry item |
| `EdenTagList` | Release/version tag list |

### Infrastructure & Config

| Widget | Purpose |
|--------|---------|
| `EdenLogViewer` | Scrolling log output |
| `EdenTerminalOutput` | Terminal/shell output |
| `EdenEnvEditor` | Environment variable editor |
| `EdenSecretField` | Masked secret input |
| `EdenRequestLog` | API request/response log |
| `EdenPollingContainer` | Auto-refresh wrapper |
| `EdenTerraformStateCard` | Infrastructure state card |

### Security & Compliance

| Widget | Purpose |
|--------|---------|
| `EdenVulnerabilityRow` | CVE/vulnerability item |
| `EdenSecurityAlert` | Security warning banner |
| `EdenComplianceBadge` | Compliance status badge |
| `EdenFeatureFlagRow` | Feature flag toggle row |
| `EdenIncidentCard` | Incident report card |
| `EdenErrorTracker` | Error tracking dashboard |

### Project Management

| Widget | Purpose |
|--------|---------|
| `EdenKanban` | Kanban board with columns |
| `EdenTaskList` | Task checklist |
| `EdenCalendar` | Event calendar |
| `EdenObjectiveProgress` | OKR/objective progress |
| `EdenWorkflowStepper` | Multi-step workflow |
| `EdenEpicCard` | Epic/feature card |
| `EdenProjectTable` | Project list table |
| `EdenScheduler` | Time-based scheduler |

### Agent & AI

| Widget | Purpose |
|--------|---------|
| `EdenAgentRunCard` | Agent execution card |
| `EdenPlanViewer` | Execution plan viewer |
| `EdenAgentDecisionLog` | Agent decision history |
| `EdenPulsingWrapper` | Pulsing animation wrapper |
| `EdenSourcesFooter` | AI source citations |

### Enterprise

| Widget | Purpose |
|--------|---------|
| `EdenDocumentViewer` | Document/PDF viewer |
| `EdenSignaturePad` | Digital signature capture |
| `EdenApprovalQueue` | Approval workflow queue |
| `EdenPhotoGallery` | Image gallery with zoom |
| `EdenChecklistBuilder` | Dynamic checklist creation |
| `EdenPermissionMatrix` | Role-permission grid |
| `EdenSyncIndicator` | Sync status display |
| `EdenMapView` | Map with markers |
| `EdenBarcodeScanner` | QR/barcode scanner |
| `EdenDiagram` (exports) | Diagramming widgets |

### Pre-Built Pages

| Page | Purpose |
|------|---------|
| `EdenLoginPage` | Login screen with form |
| `EdenSignupPage` | Registration screen |
| `EdenForgotPasswordPage` | Password reset request |
| `EdenResetPasswordPage` | Password reset form |
| `EdenProfilePage` | User profile screen |
| `EdenSettingsPage` | App settings screen |
| `EdenSplashPage` | App splash/loading screen |
| `EdenOnboardingPage` | Onboarding flow |
| `EdenMaintenancePage` | Maintenance mode screen |

### Utilities

| Utility | Purpose |
|---------|---------|
| `responsive.dart` | Breakpoint-aware layout builder |
| `EdenOAuthButtons` | Social login buttons |
| `EdenThemeSelector` | Theme/brand picker |
| `EdenDocumentStatusBadge` | Document workflow status |
| `EdenLabelPicker` | Label selection widget |
| `EdenWorkspaceSwitcher` | Multi-workspace selector |
| `EdenSearchResultCard` | Search result display |

## Design Tokens

### Colors (`EdenColors`)

**Brand presets** — Each is a `MaterialColor` with shades 50–950:

| Preset | Primary (500) | Usage |
|--------|--------------|-------|
| `EdenColors.gold` | `#D4A853` | Default — warm, premium |
| `EdenColors.blue` | `#3B82F6` | Tech, trust |
| `EdenColors.emerald` | `#10B981` | Health, growth |
| `EdenColors.purple` | `#A855F7` | Creative, AI |
| `EdenColors.red` | `#EF4444` | Urgent, alerts |
| `EdenColors.slate` | `#64748B` | Neutral, minimal |

Access shades: `EdenColors.gold[500]`, `EdenColors.blue[50]`, etc.

**Neutral (Zinc):** `EdenColors.neutral` — shades 50–950 including 850. Use for text, backgrounds, borders.

**Status colors:**
- `EdenColors.success` / `.successBg` — `#10B981`
- `EdenColors.warning` / `.warningBg` — `#F59E0B`
- `EdenColors.error` / `.errorBg` — `#EF4444`
- `EdenColors.info` / `.infoBg` — `#3B82F6`

**Aurora accents:** `EdenColors.auroraPurple`, `.auroraBlue`, `.auroraCyan`, `.auroraEmerald`

**Preset lookup:** `EdenColors.presets['gold']` returns the `MaterialColor`.

### Typography (`EdenTypography`)

Three font families via Google Fonts:

| Family | Usage | Access |
|--------|-------|--------|
| **Outfit** | Display & headings | `EdenTypography.displayFont` |
| **Plus Jakarta Sans** | Body, labels, UI | `EdenTypography.bodyFont` |
| **JetBrains Mono** | Code, data | `EdenTypography.monoFont` |

**Scale** (all take `BuildContext`):

| Method | Size | Weight | Font |
|--------|------|--------|------|
| `displayLarge(ctx)` | 48px | w800 | Outfit |
| `displayMedium(ctx)` | 36px | w700 | Outfit |
| `displaySmall(ctx)` | 30px | w700 | Outfit |
| `headlineLarge(ctx)` | 24px | w700 | Outfit |
| `headlineMedium(ctx)` | 20px | w600 | Outfit |
| `headlineSmall(ctx)` | 18px | w600 | Outfit |
| `bodyLarge(ctx)` | 16px | w400 | Plus Jakarta Sans |
| `bodyMedium(ctx)` | 14px | w400 | Plus Jakarta Sans |
| `bodySmall(ctx)` | 12px | w400 | Plus Jakarta Sans |
| `labelLarge(ctx)` | 14px | w600 | Plus Jakarta Sans |
| `labelMedium(ctx)` | 12px | w600 | Plus Jakarta Sans |
| `labelSmall(ctx)` | 11px | w500 | Plus Jakarta Sans |
| `codeLarge(ctx)` | 15px | w400 | JetBrains Mono |
| `codeMedium(ctx)` | 13px | w400 | JetBrains Mono |
| `codeSmall(ctx)` | 12px | w400 | JetBrains Mono |

### Spacing (`EdenSpacing`)

4dp base unit:

| Token | Value |
|-------|-------|
| `EdenSpacing.space0` | 0 |
| `EdenSpacing.space1` | 4dp |
| `EdenSpacing.space2` | 8dp |
| `EdenSpacing.space3` | 12dp |
| `EdenSpacing.space4` | 16dp |
| `EdenSpacing.space5` | 20dp |
| `EdenSpacing.space6` | 24dp |
| `EdenSpacing.space8` | 32dp |
| `EdenSpacing.space10` | 40dp |
| `EdenSpacing.space12` | 48dp |
| `EdenSpacing.space16` | 64dp |
| `EdenSpacing.space20` | 80dp |

### Border Radius (`EdenRadii`)

| Token | Value | BorderRadius |
|-------|-------|-------------|
| `EdenRadii.sm` | 6dp | `EdenRadii.borderRadiusSm` |
| `EdenRadii.md` | 8dp | `EdenRadii.borderRadiusMd` |
| `EdenRadii.lg` | 12dp | `EdenRadii.borderRadiusLg` |
| `EdenRadii.xl` | 16dp | `EdenRadii.borderRadiusXl` |
| `EdenRadii.xxl` | 24dp | `EdenRadii.borderRadiusXxl` |
| `EdenRadii.full` | 9999dp | `EdenRadii.borderRadiusFull` |

### Shadows (`EdenShadows`)

All accept `dark: bool` parameter for dark mode adjustment:

| Method | Usage |
|--------|-------|
| `EdenShadows.sm()` | Subtle (inputs, small cards) |
| `EdenShadows.md()` | Medium (dropdowns, popovers) |
| `EdenShadows.lg()` | High (dialogs, drawers) |
| `EdenShadows.xl()` | Max elevation |
| `EdenShadows.glow(color)` | Brand glow for primary elements |
| `EdenShadows.glowStrong(color)` | Prominent glow for CTAs |

### Animation (`EdenDurations`)

| Token | Value |
|-------|-------|
| `EdenDurations.fast` | 150ms |
| `EdenDurations.normal` | 250ms |
| `EdenDurations.slow` | 400ms |
| `EdenDurations.easeOutExpo` | Cubic(0.19, 1, 0.22, 1) |

## Theme Configuration (`EdenTheme`)

```dart
// Set brand before creating themes
EdenTheme.brandColor = EdenColors.blue;

// In MaterialApp
MaterialApp(
  theme: EdenTheme.light(),
  darkTheme: EdenTheme.dark(),
  themeMode: ThemeMode.system,
)

// Or pass brand inline
EdenTheme.light(brand: EdenColors.emerald)
EdenTheme.dark(brand: EdenColors.emerald)
```

**What `EdenTheme` configures in `ThemeData`:**
- `useMaterial3: true`
- `ColorScheme` derived from brand preset (primary, surface, outline, error)
- `TextTheme` using Outfit for display/headline, Plus Jakarta Sans for body/label
- `scaffoldBackgroundColor` — neutral-950 (dark) / neutral-50 (light)
- `CardTheme` — no elevation, `EdenRadii.lg` border radius
- `AppBarTheme` — flat, surface color background
- `InputDecorationTheme` — filled, `EdenRadii.lg`, outline borders with focus highlight
- `ElevatedButtonTheme` / `OutlinedButtonTheme` / `TextButtonTheme` — `EdenRadii.lg`, consistent padding
- `ChipTheme` — full border radius (pill)
- `DialogTheme` — `EdenRadii.xl`
- `SnackBarTheme` — floating, `EdenRadii.lg`

## Responsive Layout

```dart
import 'package:eden_ui/src/utils/responsive.dart';

// Breakpoint-aware builder
EdenResponsive(
  mobile: (context) => _MobileLayout(),
  tablet: (context) => _TabletLayout(),
  desktop: (context) => _DesktopLayout(),
)
```

Breakpoints: `mobile` (<600dp), `tablet` (600–1024dp), `desktop` (>1024dp)

## Dark Mode

All widgets support dark mode through `EdenTheme.dark()`. The theme provides correct `ColorScheme` with:
- Dark: `surface` → neutral-900, `onSurface` → neutral-100, primary uses shade 400
- Light: `surface` → white, `onSurface` → neutral-900, primary uses shade 500

**Pattern:** Always use `Theme.of(context).colorScheme` for colors — never hardcode:
```dart
// GOOD
Container(color: Theme.of(context).colorScheme.surface)
Text('Hello', style: TextStyle(color: Theme.of(context).colorScheme.onSurface))

// BAD
Container(color: Colors.white)
Container(color: Color(0xFF1E1E22))
```

## Anti-Patterns

**Do NOT:**
- Use raw `ElevatedButton`, `Card`, `TextField`, `AlertDialog` when eden-ui-flutter widgets exist
- Hardcode colors (`Color(0xFF...)`, `Colors.blue`) — use `Theme.of(context).colorScheme` or `EdenColors` tokens
- Hardcode text styles — use `EdenTypography` or `Theme.of(context).textTheme`
- Hardcode spacing — use `EdenSpacing` scale
- Hardcode border radius — use `EdenRadii` tokens
- Use raw `BoxShadow` — use `EdenShadows`
- Skip `Semantics` on custom interactive widgets
- Create ad-hoc dialogs — use `EdenModal` or `EdenConfirmDialog`
- Ignore responsive breakpoints — use `EdenResponsive`

**Do:**
- Compose from eden widgets: `EdenCard`, `EdenButton`, `EdenAlert`, `EdenDataTable`, etc.
- Use `EdenEmptyState` for zero-data scenarios
- Use `EdenForm` for forms with validation
- Use `EdenTheme.light()` / `.dark()` — never build raw `ThemeData`
- Use the pre-built pages (`EdenLoginPage`, `EdenSettingsPage`, etc.) as starting points
- Use `const` constructors wherever possible
- Test with both light and dark themes

## File Reference

| Path | Contents |
|------|----------|
| `lib/eden_ui.dart` | Package barrel export (all public API) |
| `lib/src/widgets/` | 150+ widget implementations |
| `lib/src/pages/` | 9 pre-built page screens |
| `lib/src/theme/eden_theme.dart` | `EdenTheme` — light/dark `ThemeData` builder |
| `lib/src/tokens/colors.dart` | `EdenColors` — 6 brand presets, neutral, status, aurora |
| `lib/src/tokens/typography.dart` | `EdenTypography` — display, body, label, code styles |
| `lib/src/tokens/spacing.dart` | `EdenSpacing` — 4dp-based spacing scale |
| `lib/src/tokens/radii.dart` | `EdenRadii` — border radius tokens |
| `lib/src/tokens/shadows.dart` | `EdenShadows` — elevation + glow shadows |
| `lib/src/tokens/durations.dart` | `EdenDurations` — animation timing + easing |
| `lib/src/utils/responsive.dart` | Responsive breakpoint utilities |
| `lib/dev_app/` | Dev catalog app |

</eden_ui_flutter_conventions>
