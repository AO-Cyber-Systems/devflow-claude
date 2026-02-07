---
paths:
  - "capacitor.config.*"
  - "ios/**"
  - "android/**"
  - "src/**/*.svelte"
  - "src/**/*.ts"
---

# Capacitor Mobile Conventions (SvelteKit)

## Project Structure
```
├── src/                    # SvelteKit app (web layer)
│   ├── routes/
│   ├── lib/
│   │   ├── native/         # Capacitor plugin wrappers
│   │   ├── components/
│   │   └── stores/
│   └── app.html
├── ios/                    # Xcode project (auto-generated)
│   └── App/
├── android/                # Android Studio project (auto-generated)
│   └── app/
├── capacitor.config.ts     # Capacitor configuration
├── svelte.config.js        # Must use adapter-static
└── package.json
```

## SvelteKit Configuration

### Static Adapter (Required)
Capacitor loads static files — SSR is not supported:
```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',  // SPA fallback for client-side routing
      precompress: false
    })
  }
};
```

### Disable SSR
```typescript
// src/routes/+layout.ts
export const ssr = false;
export const prerender = true;
```

### Capacitor Config
```typescript
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'My App',
  webDir: 'build',
  server: {
    androidScheme: 'https'
  }
};

export default config;
```

## Native Plugin Wrappers

Wrap Capacitor plugins in `src/lib/native/` for testability and platform awareness:
```typescript
// src/lib/native/camera.ts
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export async function takePhoto(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) {
    // Fallback for web: use file input
    return null;
  }
  const image = await Camera.getPhoto({
    quality: 90,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
  });
  return image.webPath ?? null;
}
```

### Platform Detection
```typescript
import { Capacitor } from '@capacitor/core';

Capacitor.isNativePlatform()     // true on iOS/Android, false on web
Capacitor.getPlatform()          // 'ios' | 'android' | 'web'
```

## Development Workflow

### Build and Sync
```bash
npm run build              # Build SvelteKit static output
npx cap sync               # Copy build + update native dependencies
npx cap open ios           # Open in Xcode
npx cap open android       # Open in Android Studio
```

### Live Reload (Development)
```bash
npm run dev                # Start Vite dev server (note the local IP)
# Edit capacitor.config.ts:
#   server: { url: 'http://192.168.x.x:5173', cleartext: true }
npx cap sync
npx cap run ios            # or android — app loads from dev server
```
Remove the `server.url` override before building for production.

### Key Commands
| Command | Purpose |
|---------|---------|
| `npx cap sync` | Copy web build + update native deps (run after every build) |
| `npx cap copy` | Copy web build only (faster, skip native dep update) |
| `npx cap run ios` | Build and run on iOS simulator/device |
| `npx cap run android` | Build and run on Android emulator/device |
| `npx cap doctor` | Diagnose config issues |
| `npx cap ls` | List installed Capacitor plugins |

## Testing Strategy

### Unit Tests (Vitest)
Mock Capacitor plugins manually — Capacitor uses JS Proxies that can't be proxied again:
```typescript
// __mocks__/@capacitor/camera.ts
export const Camera = {
  getPhoto: vi.fn().mockResolvedValue({
    webPath: 'mock-photo.jpg',
    format: 'jpeg',
  }),
  requestPermissions: vi.fn().mockResolvedValue({ camera: 'granted' }),
};
export const CameraResultType = { Uri: 'uri', Base64: 'base64' };
export const CameraSource = { Camera: 'CAMERA', Photos: 'PHOTOS' };
```

Place mocks in `__mocks__/@capacitor/` at project root. Vitest/Jest auto-resolves them.

### Component Tests
Use `@testing-library/svelte` for components that call native plugins:
```typescript
import { render, screen } from '@testing-library/svelte';
import PhotoButton from '$lib/components/PhotoButton.svelte';

// The mock from __mocks__/@capacitor/camera.ts is used automatically
test('shows captured photo', async () => {
  render(PhotoButton);
  await screen.getByRole('button', { name: /take photo/i }).click();
  expect(screen.getByRole('img')).toBeInTheDocument();
});
```

### E2E Tests

**Web layer (Playwright):**
Test the web app in a browser — covers routing, UI logic, API calls:
```typescript
test('photo flow shows preview', async ({ page }) => {
  await page.goto('/photos');
  await page.getByRole('button', { name: 'Take Photo' }).click();
  await expect(page.getByRole('img')).toBeVisible();
});
```

**Native E2E (Appium + WebdriverIO):**
For testing on real devices/simulators with native plugin behavior:
- Use WebdriverIO with `@wdio/appium-service`
- Test camera, filesystem, push notifications on actual hardware
- Run in CI via emulators (Android) or simulators (iOS on macOS)

### What to Mock vs Test Natively
| Concern | Unit/Component (mock) | E2E Native (real) |
|---------|----------------------|-------------------|
| Camera | Mock return value | Test real camera flow |
| Filesystem | Mock read/write | Test file persistence |
| Geolocation | Mock coordinates | Test permission flow |
| Push notifications | Mock token | Test delivery |
| UI routing | Playwright | Appium |

## Platform Requirements

### iOS
- macOS with Xcode 16+
- iOS 15+ deployment target
- Swift Package Manager (default in Capacitor 8) or CocoaPods

### Android
- Android Studio with SDK 36
- Java 21+ / Kotlin 2.2+
- Gradle 8.14+
- Minimum API 24 (Android 7.0)

## Common Pitfalls
- Always run `npx cap sync` after `npm run build` — forgetting this shows stale web content
- Remove `server.url` from capacitor.config.ts before production builds
- Test on both iOS and Android — WebView rendering differs subtly
- Handle permission denials gracefully (camera, location, notifications)
- Use `Capacitor.isNativePlatform()` guards for native-only features
