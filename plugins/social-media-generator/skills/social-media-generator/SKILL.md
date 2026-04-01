---
name: social-media-generator
description: Generate social media images and videos using HTML/CSS templates combined with AI-generated imagery. Use when the user asks to create social media posts, graphics, videos, stories, reels, quote graphics, promotional content, or any visual content for Facebook, Instagram, or Twitter/X. Triggers include "create a social media post", "make an Instagram graphic", "design a Facebook post", "generate a Twitter image", "create a promotional video", "make a quote graphic", "design content for [platform]", "create an ad for", "make promotional material".
---

# Social Media Content Generator

Generate professional social media content by combining HTML/CSS layouts with AI-generated images/videos.

## Step 0: Detect Image Generation Backend

Before starting, check which image generation tools are available. Try calling each to detect availability:

1. **AOSentry Media** — check for `mcp__aosentry-media__generate_image` tool
2. **Replicate MCP** — check for `replicate:create_models_predictions` tool

Set the backend based on what is found:
- If **AOSentry Media** is available: use it as primary (supports generate, edit, analyze)
- If **Replicate MCP** is available: use it as primary
- If **both** are available: prefer AOSentry for simple generation, Replicate for specific model selection
- If **neither** is available: inform the user:
  > "AI image generation is not available. To enable it, install one of:
  > - **AOSentry MCP** plugin (from the devflow marketplace) — provides image generation, editing, and analysis
  > - **Replicate MCP** — run `npx replicate-mcp@latest` with a `REPLICATE_API_TOKEN`
  >
  > Without image generation, I can still create HTML/CSS templates with placeholder backgrounds. Want to proceed with CSS-only designs?"

## Workflow

### 1. Clarify Requirements

If platform not specified, confirm: "I'll create this for Facebook. Want me to also generate versions for Instagram and Twitter/X?"

Gather:
- **Platform(s)**: Facebook, Instagram, Twitter/X
- **Content type**: Static image, video, story
- **Topic/message**: What the post communicates
- **Style preference**: Or recommend based on context

### 2. Select Theme

Recommend a theme based on context, or let user choose. See `references/themes.md` for full specifications.

| Theme | Best For |
|-------|----------|
| **Cybernetic Luxury** | Tech, AI, SaaS, innovation, premium digital products |
| **Republican Campaign** | Political campaigns, conservative causes, patriotic content |
| **Ministry/Church** | Religious organizations, faith-based content, spiritual messages |
| **Auto-detect** | Analyze content and recommend appropriate theme |

### 3. Generate AI Assets

Use whichever backend was detected in Step 0.

**Prompt structure for backgrounds:**
"[style keywords from theme], abstract background, [mood/atmosphere], no text, no words, suitable for text overlay, [additional context]"

#### Option A: AOSentry Media

```
mcp__aosentry-media__generate_image
  prompt: "[detailed prompt with theme keywords from references/themes.md]"
  aspect_ratio: "16:9"  # Match platform: 1:1, 4:5, 9:16, 16:9
```

AOSentry also provides `edit_image` (inpainting/outpainting) and `analyze_image` (vision analysis) which can be useful for refining outputs.

#### Option B: Replicate MCP

**Model selection by use case:**

| Use Case | Model | Notes |
|----------|-------|-------|
| Photorealistic/general | `black-forest-labs/flux-1.1-pro` | High quality, reliable |
| Images with embedded text | `ideogram-ai/ideogram-v2` | Best text rendering |
| Video backgrounds | `minimax/video-01` | High quality video |

```
replicate:create_models_predictions
  model_owner: "black-forest-labs"
  model_name: "flux-1.1-pro"
  Prefer: "wait"
  input:
    prompt: "[detailed prompt with theme keywords from references/themes.md]"
    aspect_ratio: "16:9"  # Match platform: 1:1, 4:5, 9:16, 16:9
```

#### Option C: No Backend (CSS-only fallback)

If no image generation is available, create designs using CSS gradients, patterns, and solid backgrounds that match the selected theme's color palette. The output will still be professional but without AI-generated imagery.

### 4. Download Remote Assets Locally

**⚠️ CRITICAL: Always download generated image outputs before rendering.**

Puppeteer with `file://` protocol cannot reliably fetch remote URLs due to CORS restrictions. Output URLs (from Replicate or AOSentry) will fail silently during render, resulting in missing backgrounds.

**Always download AI-generated assets locally:**

```bash
# Download the generated output
curl -L -o background.webp "[OUTPUT_URL]"
```

**Or use the render-util.js helper:**
```javascript
const { downloadAsset } = require('./render-util.js');
const localFile = downloadAsset('[OUTPUT_URL]', 'background.webp');
```

**Why this matters:**
- `file://` protocol has CORS restrictions that block remote fetches
- Remote URLs may have auth headers or timing issues
- Local files load instantly and reliably
- Prevents silent failures where only the overlay renders (background missing)

**Skip this step** if using CSS-only fallback (Option C).

### 5. Build HTML/CSS Composite

Create HTML that composites the **local** AI image with text overlays:

```html
<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=[Theme+Font]&display=swap" rel="stylesheet">
  <style>
    .post {
      width: [PLATFORM_WIDTH]px;
      height: [PLATFORM_HEIGHT]px;
      position: relative;
      overflow: hidden;
    }
    .background {
      position: absolute;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 40px;
      /* Theme-specific gradient overlay */
    }
    .headline {
      font-family: '[Theme Font]', sans-serif;
      /* Theme colors and sizing */
    }
  </style>
</head>
<body>
  <div class="post">
    <!-- IMPORTANT: Use local file path, NOT remote URL -->
    <img src="background.webp" class="background" />
    <div class="overlay">
      <h1 class="headline">[Main Message]</h1>
      <p class="subtext">[Supporting text]</p>
    </div>
  </div>
</body>
</html>
```

### 6. Render Final Output

**IMPORTANT: Use `puppeteer-core` instead of Playwright.**

Playwright bundles specific browser versions that may not match the environment. `puppeteer-core` allows pointing to any available Chrome executable, making it robust across environments.

**Setup:**
```bash
npm install puppeteer-core
```

**Using render-util.js (recommended):**
```javascript
const { renderForPlatform } = require('./render-util.js');

// Render for specific platform
await renderForPlatform('template.html', 'output.png', 'facebook');
await renderForPlatform('template.html', 'output-ig.png', 'instagram_square');
```

**Manual render script:**
```javascript
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

// Find available Chrome - check multiple locations
async function findChrome() {
  const paths = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  
  // Also check Playwright browser directory
  const pwBrowsers = '/opt/pw-browsers';
  if (fs.existsSync(pwBrowsers)) {
    const dirs = fs.readdirSync(pwBrowsers)
      .filter(d => d.startsWith('chromium-') && !d.includes('headless_shell'))
      .sort().reverse();
    for (const dir of dirs) {
      const chromePath = path.join(pwBrowsers, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(chromePath)) return chromePath;
    }
  }
  
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chrome found');
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: await findChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });
  await page.goto(`file://${path.resolve('template.html')}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500)); // Wait for fonts
  await page.screenshot({ path: 'output.png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await browser.close();
})();
```

**Video content:** Generate video via Replicate (if available), then overlay text using ffmpeg or create animated HTML.

### 7. Multi-Platform Export

When multiple platforms requested, create optimized versions:

| Platform | Format | Dimensions | Notes |
|----------|--------|------------|-------|
| Facebook | Post | 1200×630 | Primary default |
| Instagram | Square | 1080×1080 | Feed posts |
| Instagram | Portrait | 1080×1350 | Better engagement |
| Instagram | Story/Reel | 1080×1920 | Vertical video |
| Twitter/X | Post | 1200×675 | Timeline optimized |

Adjust per platform:
- Scale text for readability
- Recompose for aspect ratio
- Respect safe zones (stories have top/bottom UI)

## Pre-Render Checklist

Before rendering, verify:

- [ ] AI image downloaded locally (not using remote URL)
- [ ] HTML template references local file: `src="background.webp"`
- [ ] Template file and image are in the same directory
- [ ] Fonts are loaded from Google Fonts CDN (these work with file://)

## Quick Examples

**Quote graphic:**
1. User: "Create a quote graphic: 'Faith moves mountains' for our church Facebook"
2. Select Ministry/Church theme
3. Generate: serene landscape or abstract spiritual background via Flux
4. **Download the image locally**
5. Composite: Theme typography over local image with subtle gradient overlay
6. Render at 1200×630

**Tech product announcement:**
1. User: "Make an Instagram post announcing our new AI feature"
2. Select Cybernetic Luxury theme
3. Generate: futuristic abstract tech background
4. **Download the image locally**
5. Composite: Bold headline, feature highlights, CTA
6. Render at 1080×1080, offer 1080×1350 variant

**Political campaign:**
1. User: "Create a Facebook post for rally announcement"
2. Select Republican Campaign theme
3. Generate: patriotic imagery, American iconography
4. **Download the image locally**
5. Composite: Event details, candidate name, date/location
6. Render at 1200×630

## Troubleshooting

### Background image not appearing
**Cause:** Using remote URL in `<img src="...">` with `file://` protocol.
**Fix:** Download the image locally first and reference the local file.

### Fonts not loading
**Cause:** Insufficient wait time after page load.
**Fix:** Increase `waitMs` parameter in render call (default 1500ms).

### Chrome not found
**Cause:** No Chrome/Chromium installed in expected locations.
**Fix:** The render-util.js searches multiple paths including Playwright browsers.

## References

- `references/themes.md` - Complete theme specs: colors, fonts, Replicate prompt keywords
- `references/platforms.md` - Platform dimensions, safe zones, best practices
- `render-util.js` - Reusable rendering utility with browser detection and asset download
