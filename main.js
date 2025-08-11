let store;

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const axios = require("axios");
const path = require("path");
const fs = require("fs/promises");
const { processListings } = require("./gfapi/google_sheets_listing.js");

let mainWindow;
let shouldStopListing = false;



// Replace entire checkLicense function with this simple one:
async function checkLicense() {
  if (mainWindow && mainWindow.webContents) {
    await mainWindow.webContents.executeJavaScript(`
      const statusEl = document.getElementById('licenseStatus');
      if (statusEl) statusEl.innerHTML = '✅ Full access enabled';
    `);
  }
  return true;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile("index.html");
}

app.whenReady().then(async () => {
  // Initialize store
  const { default: Store } = await import("electron-store");
  store = new Store({
    name: "gameflip-config",
    encryptionKey: "aff130f3f4b35dfc53716ce6cad6c4a2fd6a11abeeb7eea4c7cab6b856acdb0b",
  });

  // Check for updates (THIS IS YOUR KILL SWITCH)
  autoUpdater.checkForUpdatesAndNotify();
  
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Auto-updater events
autoUpdater.on("checking-for-update", () => {
  console.log("Checking for update...");
});

autoUpdater.on("update-available", (info) => {
  console.log("Update available.");
});

autoUpdater.on("update-not-available", (info) => {
  console.log("Update not available.");
});

autoUpdater.on("error", (err) => {
  console.log("Error in auto-updater. " + err);
});

autoUpdater.on("download-progress", (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + " - Downloaded " + progressObj.percent + "%";
  log_message =
    log_message +
    " (" +
    progressObj.transferred +
    "/" +
    progressObj.total +
    ")";
  console.log(log_message);
});

autoUpdater.on("update-downloaded", (info) => {
  console.log("Update downloaded");
  // Automatically restart and apply update
  autoUpdater.quitAndInstall();
});

// --- IPC Handlers ---

ipcMain.handle("select-csv-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "CSV Files", extensions: ["csv"] }],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle("read-csv-file", async (event, filePath) => {
  try {
    const fs = require("fs");
    const content = fs.readFileSync(filePath, "utf8");
    return content;
  } catch (error) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
});

ipcMain.handle("save-credentials", (event, key, secret) => {
  store.set("apiKey", key);
  store.set("apiSecret", secret);
});

ipcMain.handle("load-credentials", () => {
  const apiKey = store.get("apiKey");
  const apiSecret = store.get("apiSecret");
  return { key: apiKey, secret: apiSecret };
});

// Stop listing handler
ipcMain.on("stop-listing", () => {
  shouldStopListing = true;
  console.log("Stop signal received");
});

// Updated listing handler with stop functionality
ipcMain.handle(
  "start-listing",
  async (event, csvFilePath, apiKey, apiSecret, delayMs) => {
    shouldStopListing = false; // Reset stop flag

    if (!csvFilePath || !apiKey || !apiSecret) {
      return {
        success: false,
        message: "Missing CSV file or API credentials.",
      };
    }

    const onProgress = (message) => {
      if (mainWindow) {
        mainWindow.webContents.send("listing-progress", message);
      }
    };

    try {
      const results = await processListings(
        csvFilePath,
        apiKey,
        apiSecret,
        onProgress,
        delayMs,
        () => shouldStopListing // Pass stop check function
      );
      return {
        success: true,
        message: `Process finished. Listed: ${results.success.length}, Failed: ${results.errors.length}.`,
      };
    } catch (error) {
      onProgress(`\n--- FATAL ERROR --- \n${error.message}`);
      return { success: false, message: error.message };
    }
  }
);
