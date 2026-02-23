const { Tray, Menu, nativeImage } = require("electron");
const http = require("http");
const path = require("path");

class TrayManager {
  constructor(windowManager, railsManager, launchdService) {
    this.tray = null;
    this.windowManager = windowManager;
    this.railsManager = railsManager;
    this.launchdService = launchdService;
    this.updateManager = null;
    this.pollInterval = null;
  }

  setUpdateManager(mgr) {
    this.updateManager = mgr;
  }

  create() {
    // Load tray icon from file — "Template" suffix enables macOS dark/light mode adaptation
    // macOS automatically picks @2x variant on Retina displays
    const icon = nativeImage.createFromPath(
      path.join(__dirname, "assets", "trayTemplate.png")
    );

    this.tray = new Tray(icon);
    this.tray.setToolTip("DevFlow Companion");
    this.buildDefaultMenu();

    // Start polling for tray data
    this.startPolling();
  }

  buildDefaultMenu() {
    const menu = Menu.buildFromTemplate([
      { label: "Open DevFlow Companion", click: () => this.windowManager.show() },
      { type: "separator" },
      { label: "Loading...", enabled: false },
      { type: "separator" },
      this._startAtLoginItem(),
      { label: "Quit", click: () => this.quit() },
    ]);
    this.tray.setContextMenu(menu);
  }

  startPolling() {
    this.pollInterval = setInterval(() => this.refreshMenu(), 10000);
    // Initial fetch
    this.refreshMenu();
  }

  async refreshMenu() {
    if (!this.railsManager.isRunning()) return;

    try {
      const data = await this.fetchTrayStatus();
      this.buildMenuFromData(data);
    } catch {
      // Rails may not be ready yet, keep default menu
    }
  }

  fetchTrayStatus() {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `${this.railsManager.getUrl()}/api/tray_status`,
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on("error", reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error("Tray status timeout"));
      });
    });
  }

  buildMenuFromData(data) {
    const template = [];

    template.push({
      label: "Open DevFlow Companion",
      click: () => this.windowManager.show(),
    });
    template.push({ type: "separator" });

    // Services section
    if (data.services && data.services.length > 0) {
      template.push({ label: "Services", enabled: false });
      for (const svc of data.services) {
        const statusIcon = svc.status === "started" ? "\u2705" : "\u26AA";
        const submenu = [];
        if (svc.status === "started") {
          submenu.push({
            label: "Stop",
            click: () => this.serviceAction(svc.name, "stop"),
          });
          submenu.push({
            label: "Restart",
            click: () => this.serviceAction(svc.name, "restart"),
          });
        } else {
          submenu.push({
            label: "Start",
            click: () => this.serviceAction(svc.name, "start"),
          });
        }
        template.push({ label: `${statusIcon} ${svc.name}`, submenu });
      }
      template.push({ type: "separator" });
    }

    // Puma-Dev apps
    if (data.puma_dev_apps && data.puma_dev_apps.length > 0) {
      template.push({ label: "Puma-Dev Apps", enabled: false });
      for (const app of data.puma_dev_apps) {
        template.push({
          label: app.name,
          submenu: [
            {
              label: "Open in Browser",
              click: () => {
                const { shell } = require("electron");
                shell.openExternal(`https://${app.name}.test`);
              },
            },
            {
              label: "Restart",
              click: () => this.pumaDevRestart(app.name),
            },
          ],
        });
      }
      template.push({ type: "separator" });
    }

    // Quick Actions
    template.push({ label: "Quick Actions", enabled: false });
    template.push({
      label: "Restart All Services",
      click: () => this.quickAction("restart_all"),
    });
    template.push({
      label: "Stop All Services",
      click: () => this.quickAction("stop_all"),
    });
    template.push({
      label: "Flush DNS Cache",
      click: () => this.quickAction("flush_dns"),
    });
    template.push({ type: "separator" });

    // Claude Proxy
    if (data.proxy) {
      template.push({ label: "Claude Proxy", enabled: false });
      const statusIcon = data.proxy.status === "healthy" ? "\u2705" : "\u26AA";
      template.push({
        label: `${statusIcon} ${data.proxy.active_accounts} accounts \u2022 ${data.proxy.requests_today} reqs today`,
        enabled: false,
      });
      if (data.proxy.current_account) {
        template.push({
          label: `  Active: ${data.proxy.current_account}`,
          enabled: false,
        });
      }
      template.push({ type: "separator" });
    }

    // Context usage
    if (data.context) {
      const pct = data.context.usage_percent || 0;
      const bar = this.contextBar(pct);
      template.push({ label: `Context: ${bar} ${pct}%`, enabled: false });
      template.push({ type: "separator" });
    }

    // Update section
    if (this.updateManager) {
      const update = this.updateManager.getStatus();
      if (update.status === "downloaded") {
        template.push({
          label: `Update Available — v${update.updateInfo?.version || "?"}`,
          enabled: false,
        });
        template.push({
          label: "Install & Restart",
          click: () => this.updateManager.installUpdate(),
        });
        template.push({ type: "separator" });
      } else if (update.status === "downloading") {
        const pct = update.downloadProgress?.percent || 0;
        template.push({
          label: `Downloading Update... ${pct}%`,
          enabled: false,
        });
        template.push({ type: "separator" });
      }
    }

    template.push(this._startAtLoginItem());
    template.push({ label: "Quit", click: () => this.quit() });

    const menu = Menu.buildFromTemplate(template);
    this.tray.setContextMenu(menu);
  }

  _startAtLoginItem() {
    return {
      label: "Start at Login",
      type: "checkbox",
      checked: this.launchdService.isInstalled(),
      click: (menuItem) => {
        try {
          if (menuItem.checked) {
            this.launchdService.install();
          } else {
            this.launchdService.uninstall();
          }
        } catch (err) {
          console.error("[tray] Start at Login toggle failed:", err.message);
          // Revert the checkbox state on failure
          menuItem.checked = !menuItem.checked;
        }
      },
    };
  }

  contextBar(pct) {
    const filled = Math.round(pct / 10);
    return "\u2588".repeat(filled) + "\u2591".repeat(10 - filled);
  }

  async serviceAction(name, action) {
    try {
      await this.postAction(`/api/tray_status/service_action`, { name, action });
    } catch (e) {
      console.error(`[tray] Service action failed: ${e.message}`);
    }
  }

  async pumaDevRestart(name) {
    try {
      await this.postAction(`/api/tray_status/puma_dev_restart`, { name });
    } catch (e) {
      console.error(`[tray] Puma-dev restart failed: ${e.message}`);
    }
  }

  async quickAction(action) {
    try {
      await this.postAction(`/api/tray_status/quick_action`, { action });
    } catch (e) {
      console.error(`[tray] Quick action failed: ${e.message}`);
    }
  }

  postAction(path, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const url = new URL(path, this.railsManager.getUrl());
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data),
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve(body));
        }
      );
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }

  quit() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    const { app } = require("electron");
    this.windowManager.destroy();
    app.quit();
  }

  destroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = TrayManager;
