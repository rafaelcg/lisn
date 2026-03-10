import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { exportFormatSchema, settingsSchema, startSessionInputSchema } from "@shared/contracts";
import { IPC_CHANNELS } from "@shared/ipc";
import type { SessionEvent } from "@shared/types";
import { SessionManager } from "../session-manager";

interface RegisterIpcWindows {
  getMainWindow: () => BrowserWindow | null;
  openDashboard: () => void;
}

export function registerIpc(windows: RegisterIpcWindows, sessionManager: SessionManager) {
  ipcMain.handle(IPC_CHANNELS.listSources, async () => sessionManager.listSources());
  ipcMain.handle(IPC_CHANNELS.startSession, async (_event, payload) => sessionManager.startSession(startSessionInputSchema.parse(payload)));
  ipcMain.handle(IPC_CHANNELS.stopSession, async (_event, sessionId: string) => sessionManager.stopSession(sessionId));
  ipcMain.handle(IPC_CHANNELS.getSessions, async () => sessionManager.getSessions());
  ipcMain.handle(IPC_CHANNELS.getSession, async (_event, sessionId: string) => sessionManager.getSession(sessionId));
  ipcMain.handle(IPC_CHANNELS.exportSession, async (_event, sessionId: string, format: unknown) =>
    sessionManager.exportSession(sessionId, exportFormatSchema.parse(format))
  );
  ipcMain.handle(IPC_CHANNELS.getSettings, async () => sessionManager.getSettings());
  ipcMain.handle(IPC_CHANNELS.getRuntimeStatus, async () => sessionManager.getRuntimeStatus());
  ipcMain.handle(IPC_CHANNELS.updateSettings, async (_event, partial) => {
    const merged = {
      ...sessionManager.getSettings(),
      ...partial
    };
    settingsSchema.parse(merged);
    return sessionManager.updateSettings(partial);
  });
  ipcMain.handle(IPC_CHANNELS.openPermissionsSettings, async () => {
    if (process.platform === "darwin") {
      await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
      return;
    }

    if (process.platform === "win32") {
      await shell.openExternal("ms-settings:privacy-broadfilesystemaccess");
      return;
    }
  });
  ipcMain.handle(IPC_CHANNELS.openDashboard, async () => {
    windows.openDashboard();
  });
  ipcMain.handle(IPC_CHANNELS.chooseTranscriptDirectory, async () => {
    const ownerWindow = windows.getMainWindow();
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, {
          properties: ["openDirectory", "createDirectory"]
        })
      : await dialog.showOpenDialog({
          properties: ["openDirectory", "createDirectory"]
        });

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });

  ipcMain.on(IPC_CHANNELS.sessionEvent, (event, sessionId: string) => {
    const unsubscribe = sessionManager.subscribeSessionEvents(sessionId, (payload: SessionEvent) => {
      const mainWindow = windows.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.sessionEvent, payload);
      }
    });

    event.sender.once("destroyed", unsubscribe);
  });
}
