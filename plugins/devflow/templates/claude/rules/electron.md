---
paths:
  - "src/main/**"
  - "src/preload/**"
  - "src/renderer/**"
  - "electron.vite.config.*"
  - "electron-builder.*"
---

# Electron Desktop Conventions (electron-vite + Svelte)

## Project Structure
```
├── src/
│   ├── main/               # Main process (Node.js)
│   │   ├── index.ts        # App entry, window management
│   │   └── ipc.ts          # IPC handler registration
│   ├── preload/            # Preload scripts (bridge)
│   │   └── index.ts        # contextBridge API exposure
│   └── renderer/           # Renderer process (Svelte)
│       ├── src/
│       │   ├── App.svelte
│       │   ├── lib/
│       │   └── routes/     # If using SvelteKit-like routing
│       └── index.html
├── electron.vite.config.ts # Unified config for main/preload/renderer
├── electron-builder.yml    # Packaging and distribution config
├── package.json
└── resources/              # App icons, platform assets
```

## Security Model

### Context Isolation (Required)
```typescript
// src/main/index.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,      // MUST be true (default)
    nodeIntegration: false,       // MUST be false (default)
    sandbox: true,                // Enable renderer sandboxing
    preload: join(__dirname, '../preload/index.js'),
  },
});
```

### Preload Script (contextBridge)
Expose only specific, validated functions — never raw ipcRenderer:
```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (data: string) => ipcRenderer.invoke('file:save', data),
  onUpdateAvailable: (cb: () => void) =>
    ipcRenderer.on('update-available', cb),
});
```

### Renderer Access
The renderer sees `window.api` — never import `electron` directly:
```typescript
// src/renderer/src/lib/native.ts
declare global {
  interface Window {
    api: {
      openFile: () => Promise<string | null>;
      saveFile: (data: string) => Promise<void>;
      onUpdateAvailable: (cb: () => void) => void;
    };
  }
}

export const api = window.api;
```

## IPC Communication

### invoke/handle Pattern (Preferred)
Use async request-response for most operations:
```typescript
// Main process — register handler
import { ipcMain, dialog } from 'electron';

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
  });
  return canceled ? null : filePaths[0];
});

// Renderer — call via preload bridge
const filePath = await window.api.openFile();
```

### send/on Pattern (Main → Renderer)
Use for push notifications from main to renderer:
```typescript
// Main process
mainWindow.webContents.send('update-available', version);

// Preload — forward to renderer
ipcRenderer.on('update-available', (_event, version) => cb(version));
```

### Rules
- Validate all IPC arguments in the main process handler
- Never pass raw `event.sender` references to the renderer
- Use `invoke`/`handle` over `send`/`on` whenever possible
- Clean up listeners to prevent memory leaks

## Development Workflow

### electron-vite Commands
```bash
npx electron-vite dev      # Start with HMR (renderer) + hot reload (main)
npx electron-vite build    # Build all three targets for production
npx electron-vite preview  # Preview production build locally
```

### Building Distributables
```bash
# Build then package
npx electron-vite build
npx electron-builder --mac       # macOS .dmg / .app
npx electron-builder --win       # Windows .exe / .msi
npx electron-builder --linux     # Linux .AppImage / .deb
```

### electron-builder Config
```yaml
# electron-builder.yml
appId: com.example.app
productName: My App
directories:
  output: dist
  buildResources: resources
mac:
  target: [dmg, zip]
  category: public.app-category.productivity
win:
  target: [nsis, portable]
linux:
  target: [AppImage, deb]
```

## Svelte in Renderer

### electron-vite Config
```typescript
// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [svelte()],
  },
});
```

### Svelte Component Conventions
Follow standard Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`).
Access native features only through `window.api`:
```svelte
<script lang="ts">
  let filePath = $state<string | null>(null);

  async function openFile() {
    filePath = await window.api.openFile();
  }
</script>

<button onclick={openFile}>Open File</button>
{#if filePath}
  <p>Selected: {filePath}</p>
{/if}
```

## Testing Strategy

### Unit Tests — Main Process (Vitest, Node)
Test IPC handlers and business logic in isolation:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { registerHandlers } from '../src/main/ipc';

// Mock electron modules
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp') },
}));

describe('IPC handlers', () => {
  it('registers dialog:openFile handler', () => {
    registerHandlers();
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'dialog:openFile',
      expect.any(Function)
    );
  });
});
```

### Unit Tests — Renderer (Vitest, jsdom)
Test Svelte components with mocked `window.api`:
```typescript
import { render, screen } from '@testing-library/svelte';
import FileOpener from '../src/renderer/src/lib/components/FileOpener.svelte';

beforeEach(() => {
  window.api = {
    openFile: vi.fn().mockResolvedValue('/path/to/file.txt'),
    saveFile: vi.fn(),
    onUpdateAvailable: vi.fn(),
  };
});

test('displays selected file path', async () => {
  render(FileOpener);
  await screen.getByRole('button', { name: /open/i }).click();
  expect(screen.getByText('/path/to/file.txt')).toBeInTheDocument();
});
```

### E2E Tests (Playwright + Electron)
Playwright has experimental Electron support via CDP:
```typescript
import { _electron as electron, test, expect } from '@playwright/test';

test('app launches and shows main window', async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();

  await expect(window.locator('h1')).toContainText('Welcome');

  await app.close();
});

test('open file dialog returns path', async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();

  // Interact with the app UI
  await window.getByRole('button', { name: 'Open File' }).click();
  // Assert file dialog behavior (may need to mock at OS level)

  await app.close();
});
```

### IPC Testing
Use `electron-mock-ipc` for isolated IPC tests:
```typescript
import createIPCMock from 'electron-mock-ipc';

const { ipcMain, ipcRenderer } = createIPCMock();

test('request-response over IPC', async () => {
  ipcMain.handle('ping', () => 'pong');
  const result = await ipcRenderer.invoke('ping');
  expect(result).toBe('pong');
});
```

### What to Test Where
| Concern | Unit (Vitest) | E2E (Playwright) |
|---------|--------------|------------------|
| IPC handlers | Mock electron, test logic | Test real app flow |
| Svelte components | Mock window.api | Real app interaction |
| File operations | Mock fs/dialog | Test with temp files |
| Window management | Mock BrowserWindow | Verify window states |
| Auto-update | Mock electron-updater | Manual verification |

## Auto-Updates
```typescript
// src/main/updater.ts
import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update-available');
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-downloaded');
  });

  autoUpdater.checkForUpdatesAndNotify();
}
```

## Common Pitfalls
- Never enable `nodeIntegration` in the renderer — use contextBridge
- Never expose raw `ipcRenderer` — wrap each channel in a specific function
- Keep the preload API surface minimal — only expose what the renderer needs
- Main process crashes kill the entire app — handle errors and uncaught exceptions
- Use `app.requestSingleInstanceLock()` to prevent multiple instances
- Test on all target platforms — OS-level APIs behave differently
