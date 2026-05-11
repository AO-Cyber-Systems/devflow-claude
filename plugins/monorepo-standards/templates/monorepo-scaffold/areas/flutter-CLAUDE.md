# flutter/

Flutter mobile + desktop client for {{PRODUCT_NAME}}.

## Layout

```
flutter/
├── lib/
│   ├── main.dart
│   ├── features/         # one feature per subdirectory
│   ├── core/             # routing, theme, errors, networking
│   └── widgets/          # reusable UI primitives
├── test/                 # mirrors lib/ layout
├── integration_test/     # end-to-end (real device/simulator)
├── android/
├── ios/
├── pubspec.yaml
└── analysis_options.yaml
```

## Commands

| Task | Command |
|------|---------|
| Get deps | `flutter pub get` |
| Run (dev) | `flutter run` |
| Build APK | `flutter build apk` |
| Build iOS | `flutter build ios` |
| Test | `flutter test` |
| Integration test | `flutter test integration_test/` |
| Analyze (lint) | `flutter analyze` |
| Format | `dart format lib/ test/` |

## Conventions

- **Dart version:** see `pubspec.yaml` `environment.sdk`.
- **State management:** {{STATE_LIB}} (Riverpod / Bloc / Provider — pick one per app and stick to it).
- **Theme:** centralised in `lib/core/theme/`. Use the Harbor palette tokens — never inline hex codes.
- **Networking:** Dio + interceptors. All API calls go through `lib/core/network/`.
- **Errors:** `Result<T, Failure>` sealed-class pattern, no exception throwing across layer boundaries.
- **Tests:** widget tests for every screen; mock services with `mocktail`.
- **Linting:** `analysis_options.yaml` extends `package:flutter_lints/flutter.yaml` plus repo-specific rules.

## Build artifacts

`build/`, `.dart_tool/`, `.flutter-plugins-dependencies` are gitignored. Compiled APKs / IPAs ship as release artifacts.

## When adding a new feature

1. New folder under `lib/features/<feature>/`.
2. Mirror in `test/features/<feature>/`.
3. Route registration in `lib/core/router/`.
4. Update the theme tokens if the feature introduces new colors.
