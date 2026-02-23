const { contextBridge, ipcRenderer, shell } = require("electron");

contextBridge.exposeInMainWorld("devflow", {
  sendNotification: (title, body) => {
    ipcRenderer.send("notification", { title, body });
  },

  requestSudo: (command) => {
    return ipcRenderer.invoke("sudo-request", command);
  },

  openExternal: (url) => {
    shell.openExternal(url);
  },

  getVersion: () => {
    return ipcRenderer.invoke("get-version");
  },

  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  getUpdateStatus: () => ipcRenderer.invoke("get-update-status"),
  onUpdateStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("update-status", handler);
    return () => ipcRenderer.removeListener("update-status", handler);
  },
});
