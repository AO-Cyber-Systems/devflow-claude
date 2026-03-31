/**
 * Social Media Render Utility
 * 
 * Uses puppeteer-core with automatic browser detection to avoid version coupling issues.
 * This approach finds whatever Chrome/Chromium is available in the environment.
 * 
 * v1.2.0 - Added downloadAsset() for reliable remote image handling
 */

const puppeteer = require('puppeteer-core');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Browser search paths in order of preference
const CHROME_SEARCH_PATHS = [
  // System-installed browsers
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  // Playwright pre-installed browsers (search dynamically)
  '/opt/pw-browsers',
];

/**
 * Download a remote asset to a local file
 * 
 * IMPORTANT: Always use this for Replicate output URLs before rendering.
 * Puppeteer with file:// protocol cannot reliably fetch remote URLs.
 * 
 * @param {string} url - Remote URL to download
 * @param {string} filename - Local filename to save as
 * @param {string} [directory='.'] - Directory to save in
 * @returns {string} - Full path to downloaded file
 */
function downloadAsset(url, filename, directory = '.') {
  const filepath = path.join(directory, filename);
  console.log(`Downloading: ${filename}`);
  
  try {
    // Use curl with follow redirects, silent mode, and fail on HTTP errors
    execSync(`curl -sL --fail -o "${filepath}" "${url}"`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000 // 60 second timeout
    });
    
    // Verify file exists and has content
    if (!fs.existsSync(filepath)) {
      throw new Error(`Download failed: file not created`);
    }
    
    const stats = fs.statSync(filepath);
    if (stats.size === 0) {
      fs.unlinkSync(filepath);
      throw new Error(`Download failed: empty file`);
    }
    
    console.log(`Downloaded: ${filepath} (${(stats.size / 1024).toFixed(1)} KB)`);
    return filepath;
  } catch (error) {
    throw new Error(`Failed to download ${url}: ${error.message}`);
  }
}

/**
 * Download multiple assets in parallel
 * 
 * @param {Array<{url: string, filename: string}>} assets - Array of assets to download
 * @param {string} [directory='.'] - Directory to save in
 * @returns {Array<string>} - Array of local file paths
 */
function downloadAssets(assets, directory = '.') {
  return assets.map(({ url, filename }) => downloadAsset(url, filename, directory));
}

/**
 * Find an available Chrome/Chromium executable
 */
async function findChrome() {
  // Check direct paths first
  for (const chromePath of CHROME_SEARCH_PATHS) {
    if (chromePath === '/opt/pw-browsers') continue; // Handle separately
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }
  
  // Search Playwright browser directory
  const pwBrowsers = '/opt/pw-browsers';
  if (fs.existsSync(pwBrowsers)) {
    const dirs = fs.readdirSync(pwBrowsers)
      .filter(d => d.startsWith('chromium-') && !d.includes('headless_shell'))
      .sort()
      .reverse(); // Newest version first
    
    for (const dir of dirs) {
      const chromePath = path.join(pwBrowsers, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    }
  }
  
  throw new Error(
    'No Chrome executable found. Searched:\n' +
    CHROME_SEARCH_PATHS.join('\n') +
    '\n\nInstall Chrome/Chromium or ensure Playwright browsers are available.'
  );
}

/**
 * Render an HTML file to PNG
 * 
 * @param {Object} options
 * @param {string} options.htmlPath - Path to HTML file
 * @param {string} options.outputPath - Path for output PNG
 * @param {number} options.width - Viewport width
 * @param {number} options.height - Viewport height
 * @param {number} [options.waitMs=1500] - Time to wait for fonts/assets to load
 */
async function renderToPng({ htmlPath, outputPath, width, height, waitMs = 1500 }) {
  const executablePath = await findChrome();
  console.log(`Using Chrome at: ${executablePath}`);
  
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ]
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    
    // Handle both file paths and URLs
    const url = htmlPath.startsWith('http') 
      ? htmlPath 
      : `file://${path.resolve(htmlPath)}`;
    
    await page.goto(url, { waitUntil: 'networkidle0' });
    
    // Wait for fonts and images to load
    await new Promise(resolve => setTimeout(resolve, waitMs));
    
    await page.screenshot({
      path: outputPath,
      clip: { x: 0, y: 0, width, height }
    });
    
    console.log(`Rendered: ${outputPath} (${width}x${height})`);
    return outputPath;
  } finally {
    await browser.close();
  }
}

/**
 * Platform dimension presets
 */
const PLATFORMS = {
  facebook: { width: 1200, height: 630 },
  instagram_square: { width: 1080, height: 1080 },
  instagram_portrait: { width: 1080, height: 1350 },
  instagram_story: { width: 1080, height: 1920 },
  twitter: { width: 1200, height: 675 },
};

/**
 * Replicate aspect ratios for each platform
 */
const PLATFORM_ASPECT_RATIOS = {
  facebook: '16:9',
  instagram_square: '1:1',
  instagram_portrait: '4:5',
  instagram_story: '9:16',
  twitter: '16:9',
};

/**
 * Render for a specific platform
 * 
 * @param {string} htmlPath - Path to HTML template
 * @param {string} outputPath - Path for output image
 * @param {string} platform - Platform key (facebook, instagram_square, etc.)
 * @param {number} [waitMs] - Optional wait time override
 */
async function renderForPlatform(htmlPath, outputPath, platform, waitMs) {
  const dimensions = PLATFORMS[platform];
  if (!dimensions) {
    throw new Error(`Unknown platform: ${platform}. Available: ${Object.keys(PLATFORMS).join(', ')}`);
  }
  return renderToPng({
    htmlPath,
    outputPath,
    ...dimensions,
    ...(waitMs && { waitMs })
  });
}

/**
 * Get the recommended Replicate aspect ratio for a platform
 * 
 * @param {string} platform - Platform key
 * @returns {string} - Aspect ratio string (e.g., "16:9")
 */
function getAspectRatio(platform) {
  return PLATFORM_ASPECT_RATIOS[platform] || '16:9';
}

/**
 * Complete workflow helper: download asset and prepare for rendering
 * 
 * @param {string} replicateUrl - URL from Replicate prediction output
 * @param {string} workDir - Working directory for files
 * @returns {string} - Local path to downloaded asset
 */
function prepareAsset(replicateUrl, workDir = '.') {
  // Extract extension from URL or default to webp
  const urlPath = new URL(replicateUrl).pathname;
  const ext = path.extname(urlPath) || '.webp';
  const filename = `background${ext}`;
  
  return downloadAsset(replicateUrl, filename, workDir);
}

module.exports = {
  // Asset management
  downloadAsset,
  downloadAssets,
  prepareAsset,
  
  // Rendering
  findChrome,
  renderToPng,
  renderForPlatform,
  
  // Constants
  PLATFORMS,
  PLATFORM_ASPECT_RATIOS,
  getAspectRatio,
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Check for download command
  if (args[0] === 'download' && args.length >= 3) {
    const [, url, filename] = args;
    try {
      downloadAsset(url, filename);
      console.log('Done!');
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  }
  // Render command
  else if (args.length >= 3) {
    const [htmlPath, outputPath, platform] = args;
    renderForPlatform(htmlPath, outputPath, platform)
      .then(() => console.log('Done!'))
      .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
      });
  }
  // Help
  else {
    console.log('Social Media Generator - Render Utility');
    console.log('');
    console.log('Usage:');
    console.log('  Render:   node render-util.js <html-file> <output.png> <platform>');
    console.log('  Download: node render-util.js download <url> <filename>');
    console.log('');
    console.log('Platforms:', Object.keys(PLATFORMS).join(', '));
    process.exit(1);
  }
}
