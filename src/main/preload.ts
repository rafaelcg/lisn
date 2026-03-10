import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type { AppSettings, ExportFormat, LissenApi, SessionEvent, StartSessionInput } from "@shared/types";

const api: LissenApi = {
  listSources: () => ipcRenderer.invoke(IPC_CHANNELS.listSources),
  startSession: (input: StartSessionInput) => ipcRenderer.invoke(IPC_CHANNELS.startSession, input),
  stopSession: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.stopSession, sessionId),
  subscribeSessionEvents: (sessionId: string, callback: (event: SessionEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: SessionEvent) => {
      if (payload.sessionId === sessionId) {
        callback(payload);
      }
    };

    ipcRenderer.send(IPC_CHANNELS.sessionEvent, sessionId);
    ipcRenderer.on(IPC_CHANNELS.sessionEvent, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.sessionEvent, listener);
    };
  },
  getSessions: () => ipcRenderer.invoke(IPC_CHANNELS.getSessions),
  getSession: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.getSession, sessionId),
  exportSession: (sessionId: string, format: ExportFormat) => ipcRenderer.invoke(IPC_CHANNELS.exportSession, sessionId, format),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  updateSettings: (partial: Partial<AppSettings>) => ipcRenderer.invoke(IPC_CHANNELS.updateSettings, partial),
  getRuntimeStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getRuntimeStatus),
  openPermissionsSettings: () => ipcRenderer.invoke(IPC_CHANNELS.openPermissionsSettings),
  openDashboard: () => ipcRenderer.invoke(IPC_CHANNELS.openDashboard),
  chooseTranscriptDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.chooseTranscriptDirectory)
};

contextBridge.exposeInMainWorld("lissen", api);
