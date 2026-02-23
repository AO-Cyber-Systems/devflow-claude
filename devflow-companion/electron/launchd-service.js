const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const LABEL = "com.aocybersystems.devflow-companion";
const PLIST_PATH = path.join(
  process.env.HOME,
  "Library",
  "LaunchAgents",
  `${LABEL}.plist`
);
const LOG_DIR = path.join(
  process.env.HOME,
  "Library",
  "Logs",
  "DevFlow Companion"
);

class LaunchdService {
  isInstalled() {
    return fs.existsSync(PLIST_PATH);
  }

  install() {
    // Ensure log directory exists
    fs.mkdirSync(LOG_DIR, { recursive: true });

    const programArgs = this._buildProgramArgs();
    const plist = this._buildPlist(programArgs);

    // Ensure LaunchAgents directory exists
    fs.mkdirSync(path.dirname(PLIST_PATH), { recursive: true });
    fs.writeFileSync(PLIST_PATH, plist, "utf8");

    try {
      execSync(`launchctl load -w "${PLIST_PATH}"`, { stdio: "ignore" });
      console.log("[launchd] Service installed and loaded");
    } catch (err) {
      console.error("[launchd] Failed to load service:", err.message);
      // Clean up plist if load failed
      try {
        fs.unlinkSync(PLIST_PATH);
      } catch {}
      throw err;
    }
  }

  uninstall() {
    try {
      execSync(`launchctl unload "${PLIST_PATH}"`, { stdio: "ignore" });
    } catch (err) {
      console.warn("[launchd] Failed to unload service:", err.message);
    }

    try {
      fs.unlinkSync(PLIST_PATH);
      console.log("[launchd] Service uninstalled");
    } catch (err) {
      console.warn("[launchd] Failed to remove plist:", err.message);
    }
  }

  _buildProgramArgs() {
    const { app } = require("electron");

    if (app.isPackaged) {
      // Packaged .app — execPath is the binary inside the bundle
      return [process.execPath, "--hidden"];
    }

    // Dev mode — execPath is the Electron binary, pass the app directory
    return [process.execPath, path.resolve(__dirname), "--hidden"];
  }

  _buildPlist(programArgs) {
    const argsXml = programArgs
      .map((arg) => `    <string>${this._escapeXml(arg)}</string>`)
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${argsXml}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>${this._escapeXml(path.join(LOG_DIR, "launchd-stdout.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${this._escapeXml(path.join(LOG_DIR, "launchd-stderr.log"))}</string>
</dict>
</plist>
`;
  }

  _escapeXml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

module.exports = LaunchdService;
