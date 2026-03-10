export const IPC_CHANNELS = {
  listSources: "lisn:list-sources",
  startSession: "lisn:start-session",
  stopSession: "lisn:stop-session",
  getSessions: "lisn:get-sessions",
  getSession: "lisn:get-session",
  exportSession: "lisn:export-session",
  getSettings: "lisn:get-settings",
  updateSettings: "lisn:update-settings",
  getRuntimeStatus: "lisn:get-runtime-status",
  openPermissionsSettings: "lisn:open-permissions-settings",
  openDashboard: "lisn:open-dashboard",
  chooseTranscriptDirectory: "lisn:choose-transcript-directory",
  sessionEvent: "lisn:session-event"
} as const;
