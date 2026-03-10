import { FormEvent, startTransition, useEffect, useMemo, useState } from "react";
import type {
  AppSettings,
  CaptureSource,
  ExportFormat,
  RuntimeStatus,
  SessionEvent,
  SessionRecord,
  SessionWithSegments,
  TranscriptSegment
} from "@shared/types";

const bridge = window.lissen;
type AppTab = "capture" | "transcript" | "settings";
const windowMode = new URLSearchParams(window.location.search).get("mode") === "tray" ? "tray" : "dashboard";

const defaultSettings: AppSettings = {
  openAiApiKey: "",
  useCloudRefinementByDefault: false,
  saveAudioByDefault: false,
  launchAtLogin: false,
  localModel: "base",
  transcriptDirectory: ""
};

const defaultRuntimeStatus: RuntimeStatus = {
  localTranscriptionAvailable: false,
  localTranscriptionReason: "Checking local transcription runtime.",
  cloudTranscriptionConfigured: false
};

const NOISY_APPS = new Set(["Control Center", "Dock", "Electron"]);
const BROWSER_APPS = new Set(["Brave Browser", "Google Chrome", "Safari", "Arc", "Microsoft Edge", "Firefox"]);
const NOISY_WINDOW_NAMES = [/^item-\d+$/i, /^window \d+$/i, /^menubar$/i, /^display \d+ backstop$/i, /^clock$/i, /^wifi$/i, /^bluetooth$/i, /^focusmodes$/i, /^bentobox-\d+$/i, /^nowplaying$/i];

function formatClock(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  }).format(new Date(iso));
}

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatRange(segment: TranscriptSegment) {
  return `${formatTime(segment.startMs)} - ${formatTime(segment.endMs)}`;
}

function emptySession(): SessionWithSegments {
  return {
    id: "",
    sourceId: "",
    sourceName: "No session selected",
    sourceKind: "window",
    sourceAppName: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    status: "idle",
    engine: "uninitialized",
    usedCloudRefinement: false,
    audioPath: null,
    exportPath: null,
    errorMessage: null,
    segments: []
  };
}

function cleanSources(sources: CaptureSource[]) {
  const browserAppProcessIds = new Set(
    sources
      .filter((source) => source.kind === "application" && BROWSER_APPS.has(source.appName ?? source.name))
      .map((source) => source.processId)
      .filter((value): value is number => typeof value === "number")
  );

  return sources
    .filter((source) => {
      const appName = source.appName?.trim() ?? "";
      const sourceName = source.name.trim();
      if (!sourceName) {
        return false;
      }

      if (NOISY_APPS.has(appName) || NOISY_APPS.has(sourceName)) {
        return false;
      }

      if (source.kind === "window" && source.processId && browserAppProcessIds.has(source.processId)) {
        return false;
      }

      return !NOISY_WINDOW_NAMES.some((pattern) => pattern.test(sourceName));
    })
    .sort((left, right) => {
      const leftPriority = BROWSER_APPS.has(left.appName ?? left.name) ? "0" : left.kind === "application" ? "1" : "2";
      const rightPriority = BROWSER_APPS.has(right.appName ?? right.name) ? "0" : right.kind === "application" ? "1" : "2";
      const leftScore = `${leftPriority}-${left.appName ?? left.name}-${left.name}`;
      const rightScore = `${rightPriority}-${right.appName ?? right.name}-${right.name}`;
      return leftScore.localeCompare(rightScore);
    });
}

function sourceLabel(source: CaptureSource) {
  if (source.kind === "application") {
    if (BROWSER_APPS.has(source.appName ?? source.name)) {
      return `${source.appName ?? source.name} · Browser app`;
    }
    return `${source.appName ?? source.name} · App`;
  }
  return `${source.name} · ${source.appName ?? "Window"}`;
}

function sessionModeLabel(session: SessionRecord | SessionWithSegments) {
  if (session.engine.startsWith("openai:")) {
    return "Cloud transcript";
  }
  if (session.engine.startsWith("whisper.cpp:")) {
    return "Local transcript";
  }
  return session.usedCloudRefinement ? "Cloud requested" : "Local requested";
}

export default function App() {
  const [rawSources, setRawSources] = useState<CaptureSource[]>([]);
  const [sessions, setSessions] = useState<SessionWithSegments[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>(defaultRuntimeStatus);
  const [useCloudRefinement, setUseCloudRefinement] = useState(false);
  const [saveAudio, setSaveAudio] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [statusBanner, setStatusBanner] = useState("Loading sources and history.");
  const [isBusy, setIsBusy] = useState(false);
  const [isRefreshingSources, setIsRefreshingSources] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [activeTab, setActiveTab] = useState<AppTab>("capture");

  const sources = useMemo(() => cleanSources(rawSources), [rawSources]);
  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? null;
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0] ?? emptySession();
  const activeSession = sessions.find((session) => session.status === "capturing" || session.status === "finalizing");

  const historySummaries = useMemo<SessionRecord[]>(
    () =>
      sessions
        .slice()
        .sort((left, right) => +new Date(right.startedAt) - +new Date(left.startedAt))
        .map(({ segments: _segments, ...summary }) => summary),
    [sessions]
  );

  const needsPermissionsHelp =
    !sources.length ||
    /screen recording|permission|privacy/i.test(statusBanner) ||
    /screen recording|permission|privacy/i.test(selectedSession.errorMessage ?? "");

  useEffect(() => {
    document.body.dataset.windowMode = windowMode;
    document.documentElement.dataset.windowMode = windowMode;

    return () => {
      delete document.body.dataset.windowMode;
      delete document.documentElement.dataset.windowMode;
    };
  }, []);

  useEffect(() => {
    if (activeSession) {
      setActiveTab("transcript");
    }
  }, [activeSession?.id]);

  async function refreshSources(options?: { preserveSelection?: boolean }) {
    const preserveSelection = options?.preserveSelection ?? true;
    setIsRefreshingSources(true);
    try {
      const nextSources = await bridge.listSources();
      const cleaned = cleanSources(nextSources);
      startTransition(() => {
        setRawSources(nextSources);
        setSelectedSourceId((current) => {
          if (preserveSelection && cleaned.some((source) => source.id === current)) {
            return current;
          }
          return cleaned[0]?.id ?? "";
        });
        setStatusBanner(
          cleaned.length
            ? "Sources refreshed. Pick a target and start capture."
            : "No useful capture sources found. Refresh after opening the app or tab you want to transcribe."
        );
      });
    } catch (error) {
      setStatusBanner(error instanceof Error ? error.message : "Failed to refresh sources.");
    } finally {
      setIsRefreshingSources(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const [nextSources, nextSettings, nextSessions] = await Promise.all([
          bridge.listSources(),
          bridge.getSettings(),
          bridge.getSessions()
        ]);
        const nextRuntimeStatus = await bridge.getRuntimeStatus();

        const detailedSessions = (await Promise.all(nextSessions.map((session) => bridge.getSession(session.id)))).filter(
          Boolean
        ) as SessionWithSegments[];

        if (cancelled) {
          return;
        }

        const cleaned = cleanSources(nextSources);
        startTransition(() => {
          setRawSources(nextSources);
          setSelectedSourceId(cleaned[0]?.id ?? "");
          setSettings(nextSettings);
          setRuntimeStatus(nextRuntimeStatus);
          setUseCloudRefinement(nextSettings.useCloudRefinementByDefault);
          setSaveAudio(nextSettings.saveAudioByDefault);
          setSessions(detailedSessions);
          setSelectedSessionId(detailedSessions[0]?.id ?? "");
          setStatusBanner(
            cleaned.length
              ? "Ready. Refresh sources any time before capture if the target window changed."
              : "No useful capture sources available yet. Open the target window, then refresh."
          );
        });
      } catch (error) {
        if (!cancelled) {
          setStatusBanner(error instanceof Error ? error.message : "Failed to load app state.");
        }
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeSession?.id) {
      return;
    }

    return bridge.subscribeSessionEvents(activeSession.id, (event: SessionEvent) => {
      setSessions((current) =>
        current.map((session) => {
          if (session.id !== event.sessionId) {
            return session;
          }

          if (event.type === "segment" && event.segment) {
            return {
              ...session,
              segments: [...session.segments, event.segment]
            };
          }

          if (event.type === "status" && event.status) {
            return {
              ...session,
              status: event.status
            };
          }

          if (event.type === "error" || event.type === "permission" || event.type === "source-fallback") {
            setStatusBanner(event.message ?? "Capture update received.");
            return {
              ...session,
              errorMessage: event.message ?? session.errorMessage
            };
          }

          return session;
        })
      );
    });
  }, [activeSession?.id]);

  async function handleStartSession() {
    if (!selectedSource) {
      setStatusBanner("Choose a source before starting capture.");
      return;
    }

    setIsBusy(true);
    setExportMessage("");

    try {
      const startedSession = await bridge.startSession({
        sourceId: selectedSource.id,
        useCloudRefinement,
        saveAudio
      });

      const detailed = (await bridge.getSession(startedSession.id)) ?? {
        ...startedSession,
        segments: []
      };

      startTransition(() => {
        setSessions((current) => [detailed, ...current.filter((entry) => entry.id !== detailed.id)]);
        setSelectedSessionId(detailed.id);
        setActiveTab("transcript");
        setStatusBanner(
          `Capturing ${selectedSource.name}.${useCloudRefinement ? " Cloud refinement enabled." : " Local transcription only."}`
        );
      });
    } catch (error) {
      setStatusBanner(error instanceof Error ? error.message : "Unable to start transcription.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleStopSession() {
    if (!activeSession) {
      return;
    }

    setIsBusy(true);
    try {
      const stoppedSession = await bridge.stopSession(activeSession.id);
      setSessions((current) => current.map((session) => (session.id === stoppedSession.id ? stoppedSession : session)));
      setSelectedSessionId(stoppedSession.id);
      setActiveTab("transcript");
      setStatusBanner(stoppedSession.errorMessage ?? "Capture stopped.");
    } catch (error) {
      setStatusBanner(error instanceof Error ? error.message : "Unable to stop transcription.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleExport(sessionId: string, format: ExportFormat) {
    if (!sessionId) {
      return;
    }

    setExportMessage("");
    try {
      const result = await bridge.exportSession(sessionId, format);
      setExportMessage(`Exported ${format === "markdown" ? "Markdown" : "plain text"} to ${result}`);
      setSessions((current) =>
        current.map((session) => (session.id === sessionId ? { ...session, exportPath: result } : session))
      );
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Export failed.");
    }
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);

    try {
      const nextSettings = await bridge.updateSettings(settings);
      const nextRuntimeStatus = await bridge.getRuntimeStatus();
      setSettings(nextSettings);
      setRuntimeStatus(nextRuntimeStatus);
      setUseCloudRefinement(nextSettings.useCloudRefinementByDefault);
      setSaveAudio(nextSettings.saveAudioByDefault);
      setStatusBanner("Preferences saved.");
    } catch (error) {
      setStatusBanner(error instanceof Error ? error.message : "Unable to save preferences.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleOpenPermissions() {
    try {
      await bridge.openPermissionsSettings();
      setStatusBanner("Opened system privacy settings. Enable Screen Recording for Lissen or Electron, then restart the app.");
    } catch (error) {
      setStatusBanner(error instanceof Error ? error.message : "Could not open system privacy settings.");
    }
  }

  async function handleOpenDashboard() {
    await bridge.openDashboard();
  }

  async function handleChooseTranscriptDirectory() {
    try {
      const directory = await bridge.chooseTranscriptDirectory();
      if (!directory) {
        return;
      }

      setSettings((current) => ({ ...current, transcriptDirectory: directory }));
      setStatusBanner("Transcript folder updated. Save preferences to keep it.");
    } catch (error) {
      setStatusBanner(error instanceof Error ? error.message : "Could not choose transcript folder.");
    }
  }

  if (windowMode === "tray") {
    return (
      <div className="shell shell-tray">
        <div className="backdrop backdrop-left" />
        <div className="backdrop backdrop-right" />

        <header className="tray-head">
          <div>
            <p className="eyebrow">Quick capture</p>
            <h1>Lissen</h1>
          </div>
          <button type="button" className="secondary-button" onClick={() => void handleOpenDashboard()}>
            Dashboard
          </button>
        </header>

        <section className="card tray-card">
          <div className="tray-status-row">
            <div>
              <p className="status-label">Status</p>
              <p className="status-copy">{statusBanner}</p>
            </div>
            <span className={`signal ${activeSession ? "signal-live" : ""}`}>{activeSession ? "Recording" : "Idle"}</span>
          </div>

          <label className="field">
            <span>Capture target</span>
            <select value={selectedSourceId} onChange={(event) => setSelectedSourceId(event.target.value)} disabled={Boolean(activeSession) || !sources.length}>
              {sources.length ? (
                sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {sourceLabel(source)}
                  </option>
                ))
              ) : (
                <option value="">No sources detected</option>
              )}
            </select>
          </label>

          <div className="tray-actions-row">
            <button className="secondary-button" type="button" onClick={() => void refreshSources()} disabled={isRefreshingSources || Boolean(activeSession)}>
              {isRefreshingSources ? "Refreshing..." : "Refresh"}
            </button>
            {needsPermissionsHelp ? (
              <button className="secondary-button" type="button" onClick={handleOpenPermissions}>
                Permissions
              </button>
            ) : null}
          </div>

          <div className="tray-mode-row">
            <button
              type="button"
              className={`mini-mode ${!useCloudRefinement ? "mini-mode-active" : ""}`}
              onClick={() => setUseCloudRefinement(false)}
            >
              Local
            </button>
            <button
              type="button"
              className={`mini-mode ${useCloudRefinement ? "mini-mode-active" : ""}`}
              onClick={() => setUseCloudRefinement(true)}
            >
              Cloud
            </button>
            <label className="toggle tray-toggle">
              <input type="checkbox" checked={saveAudio} onChange={(event) => setSaveAudio(event.target.checked)} />
              <span>Keep audio</span>
            </label>
          </div>

          {!runtimeStatus.localTranscriptionAvailable && !useCloudRefinement ? (
            <p className="mode-warning">Local mode unavailable on this machine right now.</p>
          ) : null}

          <button
            className={`action-button tray-start ${activeSession ? "action-button-stop" : ""}`}
            type="button"
            disabled={isBusy || (!activeSession && !sources.length)}
            onClick={activeSession ? handleStopSession : handleStartSession}
          >
            {activeSession ? "Stop capture" : "Start capture"}
          </button>
        </section>

        <section className="card tray-card">
          <div className="card-head">
            <div>
              <p className="eyebrow">Live transcript</p>
              <h2>{selectedSession.sourceName}</h2>
            </div>
            <span className="card-kicker">{sessionModeLabel(selectedSession)}</span>
          </div>

          <div className="transcript-stream tray-stream">
            {selectedSession.segments.length ? (
              selectedSession.segments.slice(-6).map((segment) => (
                <article className="segment" key={segment.id}>
                  <div className="segment-meta">
                    <span>{formatRange(segment)}</span>
                    <span>{segment.source}</span>
                  </div>
                  <p>{segment.text}</p>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <p>No transcript yet.</p>
                <span>Use Dashboard for full history and settings.</span>
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="backdrop backdrop-left" />
      <div className="backdrop backdrop-right" />

      <header className="masthead">
        <div className="masthead-copy">
          <p className="eyebrow">Audio window capture utility</p>
          <h1>Lissen</h1>
          <p className="masthead-note">Tray-first transcription for app or window audio, with optional cloud cleanup after capture.</p>
        </div>
        <div className="badge-cluster">
          <span className={`signal ${activeSession ? "signal-live" : ""}`}>{activeSession ? "Recording" : "Idle"}</span>
          <span className="signal signal-muted">{selectedSource ? selectedSource.kind : "No source"}</span>
        </div>
      </header>

      <section className="status-panel">
        <div>
          <p className="status-label">Session status</p>
          <p className="status-copy">{statusBanner}</p>
        </div>
        <div className="status-actions">
          {needsPermissionsHelp ? (
            <button className="secondary-button" type="button" onClick={handleOpenPermissions}>
              Open Permissions
            </button>
          ) : null}
          <button
            className={`action-button ${activeSession ? "action-button-stop" : ""}`}
            type="button"
            disabled={isBusy || (!activeSession && !sources.length)}
            onClick={activeSession ? handleStopSession : handleStartSession}
          >
            {activeSession ? "Stop capture" : "Start capture"}
          </button>
        </div>
      </section>

      <nav className="tab-strip" aria-label="Main sections">
        {[
          { id: "capture", label: "Capture" },
          { id: "transcript", label: "Transcript" },
          { id: "settings", label: "Settings" }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button ${activeTab === tab.id ? "tab-button-active" : ""}`}
            onClick={() => setActiveTab(tab.id as AppTab)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="dashboard">
        {activeTab === "capture" ? (
          <section className="capture-layout">
            <section className="card control-card">
              <div className="card-head">
                <div>
                  <p className="eyebrow">Source</p>
                  <h2>Capture target</h2>
                </div>
                <button className="secondary-button" type="button" onClick={() => void refreshSources()} disabled={isRefreshingSources || Boolean(activeSession)}>
                  {isRefreshingSources ? "Refreshing..." : "Refresh list"}
                </button>
              </div>

              <label className="field">
                <span>Select app or window</span>
                <select value={selectedSourceId} onChange={(event) => setSelectedSourceId(event.target.value)} disabled={Boolean(activeSession) || !sources.length}>
                  {sources.length ? (
                    sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {sourceLabel(source)}
                      </option>
                    ))
                  ) : (
                    <option value="">No sources detected</option>
                  )}
                </select>
              </label>

              <div className="source-summary">
                {selectedSource ? (
                  <>
                    <p className="source-summary-title">{selectedSource.name}</p>
                    <p className="source-summary-meta">
                      {selectedSource.kind === "application" ? "Application capture" : `Window in ${selectedSource.appName ?? "unknown app"}`}
                    </p>
                    <p className="source-summary-note">
                      {BROWSER_APPS.has(selectedSource.appName ?? selectedSource.name)
                        ? "Browser capture is app-first here. Tabs are not stable OS-level sources, so Lissen targets the browser application instead of individual tabs."
                        : selectedSource.kind === "window"
                          ? "Window capture may fall back to the owning app's audio when the platform cannot isolate that exact window."
                          : "Application capture is generally more stable than exact window targeting."}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="source-summary-title">No source selected</p>
                    <p className="source-summary-note">Refresh after opening the window you want. The list intentionally hides noisy system surfaces.</p>
                  </>
                )}
              </div>
            </section>

            <section className="card capture-options-card">
              <div className="card-head">
                <div>
                  <p className="eyebrow">Mode</p>
                  <h2>Transcription path</h2>
                </div>
                <span className="card-kicker">{useCloudRefinement ? "Cloud after capture" : "Local only"}</span>
              </div>

              <div className="mode-grid">
                <button
                  type="button"
                  className={`mode-card ${!useCloudRefinement ? "mode-card-active" : ""}`}
                  onClick={() => setUseCloudRefinement(false)}
                >
                  <strong>Local only</strong>
                  <span>{runtimeStatus.localTranscriptionReason}</span>
                </button>
                <button
                  type="button"
                  className={`mode-card ${useCloudRefinement ? "mode-card-active" : ""}`}
                  onClick={() => setUseCloudRefinement(true)}
                >
                  <strong>Local + cloud polish</strong>
                  <span>
                    {runtimeStatus.cloudTranscriptionConfigured
                      ? "Generate a local draft when available, then replace it with a cloud transcript after stop."
                      : "Add an OpenAI API key in Settings to enable cloud refinement."}
                  </span>
                </button>
              </div>

              {!runtimeStatus.localTranscriptionAvailable && !useCloudRefinement ? (
                <p className="mode-warning">Local-only mode is currently unavailable. Either install local Whisper or switch on cloud refinement.</p>
              ) : null}

              <div className="toggle-row">
                <label className="toggle">
                  <input type="checkbox" checked={saveAudio} onChange={(event) => setSaveAudio(event.target.checked)} />
                  <span>Retain session audio</span>
                </label>
              </div>
            </section>
          </section>
        ) : null}

        {activeTab === "transcript" ? (
          <section className="transcript-layout">
            <section className="card history-card">
              <div className="card-head">
                <div>
                  <p className="eyebrow">Sessions</p>
                  <h2>Recent captures</h2>
                </div>
                <span className="card-kicker">{historySummaries.length} stored</span>
              </div>

              <div className="history-list">
                {historySummaries.length ? (
                  historySummaries.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      className={`history-item ${selectedSessionId === session.id ? "history-item-active" : ""}`}
                      onClick={() => setSelectedSessionId(session.id)}
                    >
                      <div>
                        <strong>{session.sourceName}</strong>
                        <span>
                          {session.status} • {session.engine}
                        </span>
                      </div>
                      <span className="history-export">{session.exportPath ? `Exported • ${sessionModeLabel(session)}` : sessionModeLabel(session)}</span>
                    </button>
                  ))
                ) : (
                  <div className="empty-state">
                    <p>No sessions yet.</p>
                    <span>Your completed captures will appear here.</span>
                  </div>
                )}
              </div>
            </section>

            <section className="card transcript-card">
              <div className="card-head">
                <div>
                  <p className="eyebrow">Transcript</p>
                  <h2>{selectedSession.sourceName}</h2>
                </div>
                <span className="card-kicker">{selectedSession.engine}</span>
              </div>

              <div className="transcript-meta">
                <span>{formatClock(selectedSession.startedAt)}</span>
                <span>{selectedSession.status}</span>
                <span>{selectedSession.audioPath ? "Audio retained" : "Transcript only"}</span>
                <span>{sessionModeLabel(selectedSession)}</span>
              </div>

              <div className="transcript-stream">
                {selectedSession.segments.length ? (
                  selectedSession.segments.map((segment) => (
                    <article className="segment" key={segment.id}>
                      <div className="segment-meta">
                        <span>{formatRange(segment)}</span>
                        <span>{segment.source}</span>
                      </div>
                      <p>{segment.text}</p>
                    </article>
                  ))
                ) : (
                  <div className="empty-state">
                    <p>No transcript text yet.</p>
                    <span>
                      {selectedSession.id
                        ? selectedSession.errorMessage ??
                          "This session did not produce text. If local mode is selected, confirm your local Whisper setup before recording again."
                        : "Start a session to record and transcribe."}
                    </span>
                  </div>
                )}
              </div>

              <div className="export-row">
                <button type="button" className="secondary-button" disabled={!selectedSession.id} onClick={() => handleExport(selectedSession.id, "markdown")}>
                  Export Markdown
                </button>
                <button type="button" className="secondary-button" disabled={!selectedSession.id} onClick={() => handleExport(selectedSession.id, "txt")}>
                  Export Text
                </button>
              </div>

              {exportMessage ? <p className="export-message">{exportMessage}</p> : null}
            </section>
          </section>
        ) : null}

        {activeTab === "settings" ? (
          <section className="settings-layout">
            <section className="card settings-card">
              <div className="card-head">
                <div>
                  <p className="eyebrow">Preferences</p>
                  <h2>Runtime settings</h2>
                </div>
                <span className="card-kicker">Secure preload write path</span>
              </div>

              <form className="settings-form" onSubmit={handleSaveSettings}>
                <label className="field">
                  <span>OpenAI API key</span>
                  <div className="input-with-action">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={settings.openAiApiKey}
                      onChange={(event) => setSettings((current) => ({ ...current, openAiApiKey: event.target.value }))}
                      placeholder="sk-..."
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button type="button" className="inline-action-button" onClick={() => setShowApiKey((current) => !current)}>
                      {showApiKey ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>

                <div className="field">
                  <span>Local transcription</span>
                  <div className="readout-card">
                    <strong>{settings.localModel === "base" ? "Whisper base model" : settings.localModel}</strong>
                    <p>{runtimeStatus.localTranscriptionReason}</p>
                  </div>
                </div>

                <label className="field">
                  <span>Transcript folder</span>
                  <div className="input-with-action">
                    <input
                      value={settings.transcriptDirectory}
                      onChange={(event) => setSettings((current) => ({ ...current, transcriptDirectory: event.target.value }))}
                    />
                    <button type="button" className="inline-action-button" onClick={() => void handleChooseTranscriptDirectory()}>
                      Choose…
                    </button>
                  </div>
                </label>

                <div className="toggle-stack">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.useCloudRefinementByDefault}
                      onChange={(event) =>
                        setSettings((current) => ({ ...current, useCloudRefinementByDefault: event.target.checked }))
                      }
                    />
                    <span>Enable cloud refinement by default</span>
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.saveAudioByDefault}
                      onChange={(event) => setSettings((current) => ({ ...current, saveAudioByDefault: event.target.checked }))}
                    />
                    <span>Retain raw audio by default</span>
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.launchAtLogin}
                      onChange={(event) => setSettings((current) => ({ ...current, launchAtLogin: event.target.checked }))}
                    />
                    <span>Launch at login</span>
                  </label>
                </div>

                <button className="secondary-button settings-submit" type="submit" disabled={isBusy}>
                  Save preferences
                </button>
              </form>
            </section>
          </section>
        ) : null}
      </div>
    </div>
  );
}
