#!/usr/bin/env node

/**
 * bundle-devflow.js
 *
 * Prebuild script that copies DevFlow source files from the repo root
 * into electron/devflow-bundle/ for packaging inside the Electron app.
 *
 * Runs before Electron packaging (via forge preMake hook or manually).
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BUNDLE_DIR = path.resolve(__dirname, "..", "electron", "devflow-bundle");

const DIRS_TO_COPY = ["skills", "agents", "devflow", "hooks/dist"];

function rmrf(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;

  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function main() {
  console.log("[bundle-devflow] Bundling DevFlow source files...");

  // Clean previous bundle
  rmrf(BUNDLE_DIR);
  fs.mkdirSync(BUNDLE_DIR, { recursive: true });

  // Copy each source directory
  for (const relDir of DIRS_TO_COPY) {
    const srcDir = path.join(REPO_ROOT, relDir);
    // hooks/dist -> hooks/ in the bundle
    const destName = relDir === "hooks/dist" ? "hooks" : relDir;
    const destDir = path.join(BUNDLE_DIR, destName);

    if (!fs.existsSync(srcDir)) {
      console.log(`[bundle-devflow]   SKIP ${relDir} (not found)`);
      continue;
    }

    copyRecursive(srcDir, destDir);
    console.log(`[bundle-devflow]   ${relDir} -> devflow-bundle/${destName}`);
  }

  // Copy CHANGELOG.md
  const changelog = path.join(REPO_ROOT, "CHANGELOG.md");
  if (fs.existsSync(changelog)) {
    fs.copyFileSync(changelog, path.join(BUNDLE_DIR, "CHANGELOG.md"));
    console.log("[bundle-devflow]   CHANGELOG.md -> devflow-bundle/CHANGELOG.md");
  }

  // Write version from root package.json
  const pkg = require(path.join(REPO_ROOT, "package.json"));
  fs.writeFileSync(path.join(BUNDLE_DIR, "VERSION"), pkg.version);
  console.log(`[bundle-devflow]   VERSION: ${pkg.version}`);

  console.log("[bundle-devflow] Done.");
}

main();
