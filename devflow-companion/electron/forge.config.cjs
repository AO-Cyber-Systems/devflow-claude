const path = require("path");
const { execSync } = require("child_process");

module.exports = {
  packagerConfig: {
    appBundleId: "com.aocybersystems.devflow-companion",
    name: "DevFlow Companion",
    icon: path.resolve(__dirname, "assets", "icon"),
    extraResource: [
      path.resolve(__dirname, "devflow-bundle"),
      path.resolve(__dirname, "..", "rails"),
    ],
    osxSign: {},
    ignore: [
      /\.git/,
      /node_modules\/\.cache/,
    ],
  },
  makers: [
    {
      name: "@electron-forge/maker-dmg",
      config: {
        name: "DevFlow Companion",
        icon: path.resolve(__dirname, "assets", "icon.icns"),
        background: path.resolve(__dirname, "assets", "dmg-background.png"),
        format: "ULFO",
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "AO-Cyber-Systems",
          name: "devflow-claude",
        },
        prerelease: false,
      },
    },
  ],
  hooks: {
    preMake: async () => {
      console.log("[forge] Running bundle-devflow.js...");
      execSync("node ../scripts/bundle-devflow.js", {
        cwd: __dirname,
        stdio: "inherit",
      });
    },
  },
};
