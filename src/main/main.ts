import { app, BrowserWindow, Menu, Tray, nativeImage, screen } from "electron";
import started from "electron-squirrel-startup";
import { join } from "node:path";
import trayIconPng from "./assets/tray-icon.png?inline";
import { MacCaptureAdapter } from "./capture/mac-adapter";
import { WindowsCaptureAdapter } from "./capture/windows-adapter";
import { registerIpc } from "./ipc/register-ipc";
import { SessionManager } from "./session-manager";
import { SessionStore } from "./storage/session-store";
import { SettingsStore } from "./storage/settings-store";
import { WhisperProvider } from "./transcription/whisper-provider";

if (started) {
  app.quit();
}

let tray: Tray | null = null;
let trayWindow: BrowserWindow | null = null;
let dashboardWindow: BrowserWindow | null = null;
let isQuitting = false;
let trayMenu: Menu | null = null;

process.on("uncaughtException", (error) => {
  console.error("[Lisn main] uncaughtException", error);
});

process.on("unhandledRejection", (error) => {
  console.error("[Lisn main] unhandledRejection", error);
});

const getRendererUrl = (mode: "tray" | "dashboard") => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return new URL(`src/renderer/index.html?mode=${mode}`, MAIN_WINDOW_VITE_DEV_SERVER_URL).toString();
  }

  return join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
};

const createTrayWindow = () => {
  const window = new BrowserWindow({
    width: 440,
    height: 560,
    minWidth: 420,
    minHeight: 520,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    movable: false,
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    window.loadURL(getRendererUrl("tray"));
  } else {
    window.loadFile(getRendererUrl("tray"), { search: "mode=tray" });
  }
  window.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    window.hide();
  });
  window.on("blur", () => {
    if (!window.webContents.isDevToolsOpened()) {
      window.hide();
    }
  });
  window.on("closed", () => {
    if (trayWindow === window) {
      trayWindow = null;
    }
  });
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  return window;
};

const createDashboardWindow = () => {
  const window = new BrowserWindow({
    width: 1080,
    height: 860,
    minWidth: 960,
    minHeight: 760,
    show: false,
    resizable: true,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    window.loadURL(getRendererUrl("dashboard"));
  } else {
    window.loadFile(getRendererUrl("dashboard"), { search: "mode=dashboard" });
  }

  window.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    window.hide();
    if (process.platform === "darwin") {
      app.dock?.hide();
    }
  });
  window.on("closed", () => {
    if (dashboardWindow === window) {
      dashboardWindow = null;
    }
  });

  return window;
};

const ensureTrayWindow = () => {
  if (!trayWindow || trayWindow.isDestroyed()) {
    trayWindow = createTrayWindow();
  }

  return trayWindow;
};

const getLiveTrayWindow = () => {
  try {
    const window = ensureTrayWindow();
    void window.isVisible();
    return window;
  } catch (error) {
    console.error("[Lisn main] recreating destroyed tray window", error);
    trayWindow = createTrayWindow();
    return trayWindow;
  }
};

const ensureDashboardWindow = () => {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) {
    dashboardWindow = createDashboardWindow();
  }

  return dashboardWindow;
};

const getTrayImage = () => {
  const image = nativeImage.createFromDataURL(trayIconPng);

  if (image.isEmpty()) {
    return nativeImage.createEmpty();
  }

  const resized = image.resize({ width: 22, height: 22 });
  resized.setTemplateImage(true);
  return resized;
};

const getTrayAsset = () => getTrayImage();

const togglePanel = () => {
  if (!tray) {
    return;
  }

  const panelWindow = getLiveTrayWindow();

  try {
    if (panelWindow.isVisible()) {
      panelWindow.hide();
      return;
    }

    const trayBounds = tray.getBounds();
    const windowBounds = panelWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
    const padding = 10;
    const x = Math.round(
      Math.min(
        Math.max(display.workArea.x + padding, trayBounds.x + Math.round(trayBounds.width / 2) - Math.round(windowBounds.width / 2)),
        display.workArea.x + display.workArea.width - windowBounds.width - padding
      )
    );
    const y = process.platform === "darwin"
      ? Math.round(trayBounds.y + trayBounds.height + 8)
      : Math.round(trayBounds.y - windowBounds.height - 8);

    panelWindow.setPosition(x, y, false);
    panelWindow.show();
    panelWindow.focus();
  } catch (error) {
    console.error("[Lisn main] tray toggle failed", error);
    trayWindow = createTrayWindow();
  }
};

const openDashboard = () => {
  const window = ensureDashboardWindow();

  if (process.platform === "darwin") {
    app.dock?.show();
  }
  window.show();
  window.focus();
};

const createTray = () => {
  const trayAsset = getTrayAsset();
  tray = new Tray(trayAsset);
  tray.setToolTip("Lisn");
  if (process.platform === "darwin" && trayAsset.isEmpty()) {
    tray.setTitle("Lis");
  }
  tray.on("click", togglePanel);
  trayMenu = Menu.buildFromTemplate([
    { label: "Quick Capture", click: togglePanel },
    { label: "Open Dashboard", click: openDashboard },
    { type: "separator" },
    { label: "Quit", role: "quit" }
  ]);
  tray.on("right-click", () => {
    tray?.popUpContextMenu(trayMenu ?? undefined);
  });
};

const createSessionManager = () => {
  const captureAdapter = process.platform === "darwin" ? new MacCaptureAdapter() : new WindowsCaptureAdapter();
  const settingsStore = new SettingsStore();
  const sessionStore = new SessionStore();
  const modelsDirectory = join(process.cwd(), "models");
  const transcriptionProvider = new WhisperProvider(modelsDirectory);
  return new SessionManager(captureAdapter, sessionStore, settingsStore, transcriptionProvider);
};

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.whenReady().then(() => {
  trayWindow = createTrayWindow();
  createTray();
  if (process.platform === "darwin") {
    app.dock?.hide();
  }
  registerIpc(
    {
      getMainWindow: () => trayWindow,
      openDashboard
    },
    createSessionManager()
  );
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  console.error("[Lisn main] will-quit");
});

app.on("activate", () => {
  openDashboard();
});

app.on("window-all-closed", () => {
  // Keep the app alive for tray-first behavior.
});
