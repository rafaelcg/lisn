export const IPC_CHANNELS = {
  listSources: "lissen:list-sources",
  startSession: "lissen:start-session",
  stopSession: "lissen:stop-session",
  getSessions: "lissen:get-sessions",
  getSession: "lissen:get-session",
  exportSession: "lissen:export-session",
  getSettings: "lissen:get-settings",
  updateSettings: "lissen:update-settings",
  getRuntimeStatus: "lissen:get-runtime-status",
  openPermissionsSettings: "lissen:open-permissions-settings",
  openDashboard: "lissen:open-dashboard",
  chooseTranscriptDirectory: "lissen:choose-transcript-directory",
  sessionEvent: "lissen:session-event"
} as const;
