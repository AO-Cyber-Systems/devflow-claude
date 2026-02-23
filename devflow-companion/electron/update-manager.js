const http = require("http");

class UpdateManager {
  constructor(windowManager) {
    this.windowManager = windowManager;
    this.status = "idle";
    this.updateInfo = null;
    this.downloadProgress = null;
    this.error = null;
    this.checkInterval = null;
    this.autoUpdater = null;
  }

  initialize(railsUrl) {
    try {
      const { autoUpdater } = require("electron-updater");
      this.autoUpdater = autoUpdater;
    } catch (err) {
      console.log("[update-manager] electron-updater not available:", err.message);
      return;
    }

    this.autoUpdater.setFeedURL({
      provider: "github",
      owner: "AO-Cyber-Systems",
      repo: "devflow-claude",
    });
    this.autoUpdater.autoDownload = true;
    this.autoUpdater.autoInstallOnAppQuit = true;

    this._bindEvents();
    this._fetchAutoUpdateSetting(railsUrl).then((enabled) => {
      if (enabled === false) {
        console.log("[update-manager] Auto-update disabled by user setting");
        return;
      }
      // Initial check after 10s delay
      setTimeout(() => this.checkNow(), 10000);
      // Then every 4 hours
      this.checkInterval = setInterval(() => this.checkNow(), 4 * 60 * 60 * 1000);
    });
  }

  _bindEvents() {
    this.autoUpdater.on("checking-for-update", () => {
      this.status = "checking";
      this._notify();
    });

    this.autoUpdater.on("update-available", (info) => {
      this.status = "available";
      this.updateInfo = { version: info.version };
      this._notify();
    });

    this.autoUpdater.on("update-not-available", () => {
      this.status = "idle";
      this.updateInfo = null;
      this._notify();
    });

    this.autoUpdater.on("download-progress", (progress) => {
      this.status = "downloading";
      this.downloadProgress = { percent: Math.round(progress.percent) };
      this._notify();
    });

    this.autoUpdater.on("update-downloaded", (info) => {
      this.status = "downloaded";
      this.updateInfo = { version: info.version };
      this.downloadProgress = null;
      this._notify();
    });

    this.autoUpdater.on("error", (err) => {
      this.status = "error";
      this.error = err.message;
      console.error("[update-manager] Error:", err.message);
      this._notify();
    });
  }

  _notify() {
    const win = this.windowManager.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("update-status", this.getStatus());
    }
  }

  _fetchAutoUpdateSetting(railsUrl) {
    return new Promise((resolve) => {
      const req = http.get(`${railsUrl}/api/settings/auto_update_enabled`, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            resolve(data.value !== "false");
          } catch {
            resolve(true); // default to enabled
          }
        });
      });
      req.on("error", () => resolve(true));
      req.setTimeout(5000, () => {
        req.destroy();
        resolve(true);
      });
    });
  }

  checkNow() {
    if (!this.autoUpdater) return Promise.resolve(this.getStatus());
    return this.autoUpdater.checkForUpdates().catch((err) => {
      console.error("[update-manager] Check failed:", err.message);
    });
  }

  installUpdate() {
    if (!this.autoUpdater || this.status !== "downloaded") return;
    this.autoUpdater.quitAndInstall();
  }

  getStatus() {
    return {
      status: this.status,
      updateInfo: this.updateInfo,
      downloadProgress: this.downloadProgress,
      error: this.error,
    };
  }

  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

module.exports = UpdateManager;
