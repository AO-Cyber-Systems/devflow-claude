const { app, ipcMain, Notification } = require("electron");
const { execFile } = require("child_process");
const RailsManager = require("./rails-manager");
const WindowManager = require("./window-manager");
const TrayManager = require("./tray");
const UpdateManager = require("./update-manager");
const LaunchdService = require("./launchd-service");

const startHidden = process.argv.includes("--hidden");
const railsManager = new RailsManager();
const windowManager = new WindowManager();
const launchdService = new LaunchdService();
let trayManager;
let updateManager;

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    windowManager.show();
  });
}

app.on("ready", async () => {
  try {
    const port = await railsManager.start();
    console.log(`[main] Rails started on port ${port}`);

    const url = railsManager.getUrl();
    windowManager.create(url, { show: !startHidden });

    trayManager = new TrayManager(windowManager, railsManager, launchdService);
    trayManager.create();

    // Auto-update (only in packaged builds)
    if (app.isPackaged) {
      updateManager = new UpdateManager(windowManager);
      trayManager.setUpdateManager(updateManager);
      updateManager.initialize(railsManager.getUrl());
    }
  } catch (err) {
    console.error("[main] Failed to start:", err);
    app.quit();
  }
});

app.on("activate", () => {
  windowManager.show();
});

app.on("before-quit", async () => {
  if (updateManager) updateManager.destroy();
  if (trayManager) trayManager.destroy();
  windowManager.destroy();
  await railsManager.stop();
});

// Keep app running when all windows are closed (tray mode)
app.on("window-all-closed", (e) => {
  // Don't quit — tray keeps the app alive
});

// IPC handlers
ipcMain.on("notification", (_event, { title, body }) => {
  new Notification({ title, body }).show();
});

ipcMain.handle("sudo-request", async (_event, command) => {
  return new Promise((resolve, reject) => {
    const script = `do shell script "${command}" with administrator privileges`;
    execFile("osascript", ["-e", script], (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    });
  });
});

ipcMain.handle("get-version", () => {
  const pkg = require("./package.json");
  return pkg.version;
});

ipcMain.handle("check-for-updates", () => {
  if (updateManager) return updateManager.checkNow();
  return { status: "not-packaged" };
});

ipcMain.handle("install-update", () => {
  if (updateManager) updateManager.installUpdate();
});

ipcMain.handle("get-update-status", () => {
  if (updateManager) return updateManager.getStatus();
  return { status: "not-packaged" };
});
