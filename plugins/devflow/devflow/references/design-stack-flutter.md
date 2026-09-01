# Design stack: Flutter + eden-ui

Concrete implementation for DevFlow Flutter surfaces. `design-craft.md` says what
to decide; this file says how to build it with `eden-ui-flutter`.

> **Adapted from [taste-skill](https://github.com/Leonxlnx/taste-skill) by
> Leonxlnx (MIT)**, whose stack section targets React, Next.js and Motion. Its
> rules have been rewritten against Flutter's widget model and the `EdenTheme`
> token set. Full attribution and licence: `NOTICE.md`.

**The theme wins.** `EdenTheme` and the active brand preset are the answer. Every
rule below operates inside them, never around them.

---

## 1. Typography

`EdenTypography` already resolves the three families — **Outfit** (display),
**Plus Jakarta Sans** (body and UI), **JetBrains Mono** (code and data). Use the
scale methods, never a raw `TextStyle`:

```dart
// GOOD
Text('Revenue', style: EdenTypography.headlineMedium(context))
Text('47.2%',  style: EdenTypography.codeLarge(context))

// BAD — bypasses the scale and breaks under theme change
Text('Revenue', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600))
```

**Bundle the fonts; do not fetch them at runtime.** `google_fonts` downloads on
first use by default, which means a visible fallback flash on a cold start and a
hard dependency on the network. Vendor the files and declare them:

```yaml
# pubspec.yaml
flutter:
  fonts:
    - family: Outfit
      fonts:
        - asset: assets/fonts/Outfit-VariableFont_wght.ttf
    - family: Plus Jakarta Sans
      fonts:
        - asset: assets/fonts/PlusJakartaSans-VariableFont_wght.ttf
```

### Serif discipline

The upstream rule — a serif is not the reward for a "premium" brief — lands here
as: **do not override `EdenTypography.displayFont` with a serif to make a screen
feel considered.** Outfit is the display face. If a brand genuinely requires a
serif, that belongs in the brand preset and `EdenTheme`, decided once, not
introduced per screen.

### Mechanics

- **Measure.** Constrain long-form text; past roughly 65 characters a line is
  hard to track. `ConstrainedBox(constraints: BoxConstraints(maxWidth: 640))`.
- **Never `TextOverflow.ellipsis` on a heading you have not size-tested** at the
  narrowest supported width. A clipped headline is a font-scale error.
- **Respect the platform text scale.** Do not clamp `MediaQuery.textScaler` to 1;
  test at 200%. A layout that breaks under accessibility text sizing is broken.

---

## 2. Colour

**Never hardcode.** Every colour comes from the scheme or the token set:

```dart
// GOOD
Container(color: Theme.of(context).colorScheme.surface)
Text('…', style: TextStyle(color: Theme.of(context).colorScheme.onSurface))

// BAD
Container(color: Colors.white)
Container(color: const Color(0xFF1E1E22))
```

`EdenTheme.light()` / `EdenTheme.dark()` resolve `surface`, `onSurface` and the
primary shade correctly per mode. Build neither `ThemeData` by hand.

**The two default palettes to avoid** (`design-craft.md` §6) apply to brand
authoring, not to screen code: do not push a brand preset toward violet-glow
gradients, or toward the cream-plus-brass-plus-espresso family on a
premium-consumer product. Inside a screen, the palette question is already
settled by the preset.

**Semantic colour needs a second channel.** A status conveyed only by
`colorScheme.error` fails for a colour-blind user and in a greyscale screenshot.
Pair it with an icon or a label.

**Shadows** come from `EdenShadows`, which takes `dark:` and adjusts. Never a raw
`BoxShadow`. `EdenShadows.glow()` is for a genuine brand moment, not a default
card treatment.

---

## 3. Icons

- **One family per app.** Material Symbols is the default and is already
  available; `phosphor_flutter` is a reasonable alternative if the brand calls
  for it. Do not mix.
- **One optical weight and one size scale**, set once. Material Symbols exposes
  weight and fill as axes — pick values and hold them.
- **Never hand-roll an icon in `CustomPainter`.** If a glyph is missing, add the
  package that has it.
- **Icon-only controls need a semantic label:**

```dart
IconButton(
  icon: const Icon(Icons.filter_list),
  tooltip: 'Filter results',        // also the accessible name
  onPressed: _openFilters,
)
```

**Emoji are discouraged** in UI strings. Use an icon.

---

## 4. Layout mechanics

Breakpoints come from `EdenResponsive` and **differ from the web scale** — do not
carry Tailwind's numbers across:

| Band | Width |
|---|---|
| `mobile` | under 600dp |
| `tablet` | 600-1024dp |
| `desktop` | over 1024dp |

```dart
EdenResponsive(
  mobile:  (context) => const _MobileLayout(),
  tablet:  (context) => const _TabletLayout(),
  desktop: (context) => const _DesktopLayout(),
)
```

- **Spacing from `EdenSpacing`**, radius from `EdenRadii`. No raw `EdgeInsets`
  numbers, no raw `BorderRadius.circular(12)`.
- **Density maps to the spacing scale.** DENSITY 1-3 uses `space12`-`space20`
  between sections; 4-7 uses `space6`-`space8`; 8-10 uses `space2`-`space3` with
  dividers instead of cards.
- **Asymmetric desktop layouts collapse to a single column on `mobile`.** State
  the collapse in the same widget rather than assuming.
- **Wide content scrolls inside its own container.** A horizontally scrolling
  page is a bug; wrap a wide table in a `SingleChildScrollView(scrollDirection:
  Axis.horizontal)`, not the screen.
- **Never nest unbounded scrollables.** A `ListView` inside a `Column` inside a
  `SingleChildScrollView` throws or silently mis-sizes. Use slivers.

---

## 5. Motion

`EdenDurations` supplies the vocabulary: `fast` 150ms, `normal` 250ms, `slow`
400ms, and `easeOutExpo` as the standard curve. Use them rather than inventing
durations per widget.

**Implicit animation first.** Most motion needs no controller:

```dart
AnimatedContainer(
  duration: EdenDurations.normal,
  curve: EdenDurations.easeOutExpo,
  padding: EdgeInsets.all(_expanded ? EdenSpacing.space6 : EdenSpacing.space4),
  child: child,
)
```

**Explicit animation when you need control** — and it must dispose:

```dart
class _RevealState extends State<Reveal> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this, duration: EdenDurations.slow,
  );

  @override
  void dispose() {
    _c.dispose();          // a leaked controller keeps ticking after the route pops
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // AnimatedBuilder with a `child` rebuilds only the transform, not the subtree.
    return AnimatedBuilder(
      animation: _c,
      child: widget.child,
      builder: (context, child) => Opacity(opacity: _c.value, child: child),
    );
  }
}
```

### Hard rules

- **Reduced motion is mandatory above MOTION 3.** Flutter exposes the platform
  setting; honour it by removing movement, not by shortening it:

```dart
final reduce = MediaQuery.disableAnimationsOf(context);
// or: MediaQuery.of(context).disableAnimations
if (reduce) return child;                      // static, no transition
```

- **Never call `setState` per frame.** Driving a continuous value through
  `setState` rebuilds the subtree every tick. Use an `AnimationController` with
  `AnimatedBuilder`, or a `ValueListenable`.
- **Prefer `FadeTransition` / `SlideTransition` over `Opacity` / `Transform`**
  inside an animation: the transition widgets repaint without rebuilding.
- **Avoid `Opacity` on a large or complex subtree** — it triggers `saveLayer`,
  which is expensive. Fade a colour or use `FadeTransition` on a leaf.
- **Motivate every animation.** Hierarchy, storytelling, feedback, or state
  transition. Implicit animation on every property because it is one parameter
  away is the Flutter version of animating everything.
- **One "marquee" or auto-advancing carousel per screen**, and it pauses under
  reduced motion.

---

## 6. Interactive states

Generated Flutter screens ship the populated state and nothing else. All four are
required, and `/devflow:ui-eval` scores each one:

| State | Use |
|---|---|
| Loading | A skeleton shaped like the final layout, not a centred `CircularProgressIndicator` |
| Empty | `EdenEmptyState`, saying how to populate it |
| Error | Inline for form fields; `EdenAlert` or a contextual surface for failures |
| Populated | The happy path |

- **Tap targets are 48×48dp** on Flutter — the Material minimum, larger than the
  web's 24×24 floor. `IconButton` gives this by default; a bare `GestureDetector`
  on an icon does not.
- **Forms use `EdenForm`** with validation, label above the field, error below.
  Never placeholder-as-label.
- **Every custom interactive widget needs `Semantics`**, and decorative ones need
  `excludeSemantics`.

---

## 7. Performance

- **`const` constructors everywhere they are possible.** A non-const widget in a
  rebuilt subtree is rebuilt for nothing; this is the single cheapest win.
- **Keep rebuild scope narrow.** A whole screen rebuilding for one changed field
  is the most common Flutter performance defect.
- **`RepaintBoundary`** around an animating subtree that sits inside otherwise
  static content.
- **Long lists use `ListView.builder`** with an `itemExtent` or
  `prototypeItem` where the height is uniform.
- **Images:** `cacheWidth` / `cacheHeight` on `Image.asset` and `Image.network`
  so the decode is sized to the display, not the source.
- **Profile in profile mode**, never debug — debug-mode jank is not real jank.
- **Check for overflow warnings** in logs before shipping. `/devflow:ui-eval`
  surfaces these; an overflow is a real layout failure, not a warning to ignore.

---

## 8. Dependency verification

```bash
# Is the package actually declared before you import it?
grep -q 'phosphor_flutter:' pubspec.yaml || echo "not declared"

# Resolve and analyse before claiming a screen builds
flutter pub get
flutter analyze
```

Never import a package on the assumption it is present. If it is missing, output
the `flutter pub add` command before writing code against it.
