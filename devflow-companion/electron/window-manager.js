const { BrowserWindow } = require("electron");
const path = require("path");

class WindowManager {
  constructor() {
    this.window = null;
  }

  create(url, options = {}) {
    const shouldShow = options.show !== false;

    this.window = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      show: shouldShow,
      title: "DevFlow Companion",
      titleBarStyle: "hiddenInset",
      backgroundColor: "#0f172a",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.window.loadURL(url);

    this.window.on("close", (event) => {
      // Hide to tray instead of quitting
      event.preventDefault();
      this.window.hide();
    });

    this.window.on("closed", () => {
      this.window = null;
    });

    return this.window;
  }

  show() {
    if (this.window) {
      this.window.show();
      this.window.focus();
    }
  }

  hide() {
    if (this.window) {
      this.window.hide();
    }
  }

  isVisible() {
    return this.window && this.window.isVisible();
  }

  destroy() {
    if (this.window) {
      this.window.removeAllListeners("close");
      this.window.close();
      this.window = null;
    }
  }
}

module.exports = WindowManager;
