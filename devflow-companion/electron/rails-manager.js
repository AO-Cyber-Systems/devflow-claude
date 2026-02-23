const { spawn } = require("child_process");
const path = require("path");
const net = require("net");
const http = require("http");
const { app } = require("electron");

class RailsManager {
  constructor() {
    this.process = null;
    this.port = null;
    this.railsDir = app.isPackaged
      ? path.join(process.resourcesPath, "rails")
      : path.join(__dirname, "..", "rails");
  }

  getBundlePath() {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, "devflow-bundle");
    }
    // Development: use bundled dir if it exists, otherwise repo root
    const bundled = path.join(__dirname, "devflow-bundle");
    if (require("fs").existsSync(bundled)) return bundled;
    return path.join(__dirname, "..", "..");
  }

  getAppVersion() {
    try {
      return require("./package.json").version;
    } catch {
      return "0.0.0";
    }
  }

  async findFreePort() {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });
      server.on("error", reject);
    });
  }

  async start() {
    this.port = await this.findFreePort();
    console.log(`[rails-manager] Starting Rails on port ${this.port}`);

    this.process = spawn(
      "bundle",
      ["exec", "rails", "server", "-p", String(this.port), "-b", "127.0.0.1"],
      {
        cwd: this.railsDir,
        env: {
          ...process.env,
          RAILS_ENV: app.isPackaged ? "production" : "development",
          PORT: String(this.port),
          DEVFLOW_BUNDLE_PATH: this.getBundlePath(),
          DEVFLOW_APP_VERSION: this.getAppVersion(),
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    this.process.stdout.on("data", (data) => {
      console.log(`[rails] ${data.toString().trimEnd()}`);
    });

    this.process.stderr.on("data", (data) => {
      console.error(`[rails:err] ${data.toString().trimEnd()}`);
    });

    this.process.on("exit", (code, signal) => {
      console.log(`[rails-manager] Rails exited with code=${code} signal=${signal}`);
      this.process = null;
    });

    await this.waitForHealth();
    return this.port;
  }

  async waitForHealth(maxAttempts = 60, intervalMs = 500) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.checkHealth();
        console.log(`[rails-manager] Rails is healthy on port ${this.port}`);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
    throw new Error("Rails server failed to start within timeout");
  }

  checkHealth() {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${this.port}/health`, (res) => {
        if (res.statusCode === 200) resolve();
        else reject(new Error(`Health check returned ${res.statusCode}`));
      });
      req.on("error", reject);
      req.setTimeout(2000, () => {
        req.destroy();
        reject(new Error("Health check timeout"));
      });
    });
  }

  async stop() {
    if (!this.process) return;
    console.log("[rails-manager] Stopping Rails...");

    this.process.kill("SIGTERM");

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.process) {
          console.log("[rails-manager] Force killing Rails after 5s grace period");
          this.process.kill("SIGKILL");
        }
        resolve();
      }, 5000);

      if (this.process) {
        this.process.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });

    this.process = null;
  }

  getUrl() {
    return `http://127.0.0.1:${this.port}`;
  }

  isRunning() {
    return this.process !== null;
  }
}

module.exports = RailsManager;
