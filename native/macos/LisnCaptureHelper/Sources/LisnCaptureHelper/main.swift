import AVFoundation
import AppKit
import CoreMedia
import Foundation
import ScreenCaptureKit

struct CaptureSource: Codable {
    let id: String
    let name: String
    let kind: String
    let appName: String?
    let processId: Int?
    let isFallback: Bool?
}

struct IncomingRequest: Decodable {
    let requestId: String
    let command: String
    let payload: [String: String]?
}

struct OutgoingResponse: Codable {
    let requestId: String
    let ok: Bool
    let payload: EncodablePayload?
    let error: String?
}

struct EventEnvelope: Codable {
    let sessionId: String
    let type: String
    let message: String?
    let status: String?
}

enum EncodablePayload: Codable {
    case sources([CaptureSource])
    case audioPath(String)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode([CaptureSource].self) {
            self = .sources(value)
            return
        }

        let payload = try container.decode([String: String].self)
        self = .audioPath(payload["audioPath"] ?? "")
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .sources(let sources):
            try container.encode(sources)
        case .audioPath(let path):
            try container.encode(["audioPath": path])
        }
    }
}

func writeJSON<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    if let data = try? encoder.encode(value), let string = String(data: data, encoding: .utf8) {
        FileHandle.standardOutput.write(Data((string + "\n").utf8))
    }
}

func writeResponse(_ response: OutgoingResponse) {
    writeJSON(response)
}

func writeEvent(sessionId: String, type: String, message: String?, status: String? = nil) {
    writeJSON(EventEnvelope(sessionId: sessionId, type: type, message: message, status: status))
}

func enumerateSources() async throws -> [CaptureSource] {
    let shareable = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    let windows = shareable.windows
        .filter { $0.owningApplication?.bundleIdentifier != Bundle.main.bundleIdentifier }
        .prefix(20)
        .map { window in
            CaptureSource(
                id: "window-\(window.windowID)",
                name: window.title?.isEmpty == false ? window.title! : "Window \(window.windowID)",
                kind: "window",
                appName: window.owningApplication?.applicationName,
                processId: Int(window.owningApplication?.processID ?? 0),
                isFallback: true
            )
        }
    let apps = shareable.applications
        .filter { $0.bundleIdentifier != Bundle.main.bundleIdentifier }
        .prefix(20)
        .map { app in
            CaptureSource(
                id: "app-\(app.processID)",
                name: app.applicationName,
                kind: "application",
                appName: app.applicationName,
                processId: Int(app.processID),
                isFallback: false
            )
        }
    return Array(windows + apps)
}

@available(macOS 15.0, *)
final class RecordingDelegate: NSObject, SCRecordingOutputDelegate {}

@available(macOS 15.0, *)
final class CaptureSession {
    let sessionId: String
    let stream: SCStream
    let recordingOutput: SCRecordingOutput
    let recordingDelegate: RecordingDelegate
    let movieURL: URL
    let audioURL: URL

    init(
        sessionId: String,
        stream: SCStream,
        recordingOutput: SCRecordingOutput,
        recordingDelegate: RecordingDelegate,
        movieURL: URL,
        audioURL: URL
    ) {
        self.sessionId = sessionId
        self.stream = stream
        self.recordingOutput = recordingOutput
        self.recordingDelegate = recordingDelegate
        self.movieURL = movieURL
        self.audioURL = audioURL
    }
}

@available(macOS 15.0, *)
@MainActor
final class CaptureCoordinatorMac15 {
    private var sessions: [String: CaptureSession] = [:]

    func startSession(sessionId: String, sourceId: String) async throws -> String {
        let shareable = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        let filter = try makeFilter(sourceId: sourceId, shareable: shareable)
        let movieURL = FileManager.default.temporaryDirectory.appendingPathComponent("\(sessionId).mov")
        let audioURL = FileManager.default.temporaryDirectory.appendingPathComponent("\(sessionId).m4a")

        try? FileManager.default.removeItem(at: movieURL)
        try? FileManager.default.removeItem(at: audioURL)

        let configuration = SCStreamConfiguration()
        configuration.width = 2
        configuration.height = 2
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        configuration.queueDepth = 4
        configuration.capturesAudio = true
        configuration.excludesCurrentProcessAudio = true
        configuration.showsCursor = false

        let stream = SCStream(filter: filter, configuration: configuration, delegate: nil)
        let recordingConfiguration = SCRecordingOutputConfiguration()
        recordingConfiguration.outputURL = movieURL
        recordingConfiguration.outputFileType = .mov
        let recordingDelegate = RecordingDelegate()

        let recordingOutput = SCRecordingOutput(configuration: recordingConfiguration, delegate: recordingDelegate)
        try stream.addRecordingOutput(recordingOutput)
        try await stream.startCapture()

        sessions[sessionId] = CaptureSession(
            sessionId: sessionId,
            stream: stream,
            recordingOutput: recordingOutput,
            recordingDelegate: recordingDelegate,
            movieURL: movieURL,
            audioURL: audioURL
        )

        writeEvent(sessionId: sessionId, type: "status", message: "Capture started", status: "capturing")
        return audioURL.path
    }

    func stopSession(sessionId: String) async throws -> String {
        guard let session = sessions.removeValue(forKey: sessionId) else {
            throw NSError(domain: "LisnCaptureHelper", code: 404, userInfo: [NSLocalizedDescriptionKey: "Unknown session"])
        }

        try await session.stream.stopCapture()
        try await exportAudioTrack(from: session.movieURL, to: session.audioURL)
        try? FileManager.default.removeItem(at: session.movieURL)
        writeEvent(sessionId: sessionId, type: "status", message: "Capture stopped", status: "finalizing")
        return session.audioURL.path
    }

    private func makeFilter(sourceId: String, shareable: SCShareableContent) throws -> SCContentFilter {
        if sourceId.hasPrefix("window-"),
           let windowId = UInt32(sourceId.replacingOccurrences(of: "window-", with: "")),
           let window = shareable.windows.first(where: { $0.windowID == windowId }) {
            return SCContentFilter(desktopIndependentWindow: window)
        }

        if sourceId.hasPrefix("app-"),
           let processId = Int32(sourceId.replacingOccurrences(of: "app-", with: "")),
           let application = shareable.applications.first(where: { $0.processID == processId }),
           let display = shareable.displays.first {
            return SCContentFilter(display: display, including: [application], exceptingWindows: [])
        }

        throw NSError(domain: "LisnCaptureHelper", code: 400, userInfo: [NSLocalizedDescriptionKey: "Requested source is no longer available"])
    }

    private func exportAudioTrack(from movieURL: URL, to audioURL: URL) async throws {
        let asset = AVURLAsset(url: movieURL)
        guard let exporter = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
            throw NSError(domain: "LisnCaptureHelper", code: 500, userInfo: [NSLocalizedDescriptionKey: "Could not create audio exporter"])
        }

        exporter.outputURL = audioURL
        exporter.outputFileType = .m4a

        try await withCheckedThrowingContinuation { continuation in
            exporter.exportAsynchronously {
                switch exporter.status {
                case .completed:
                    continuation.resume()
                case .failed, .cancelled:
                    continuation.resume(throwing: exporter.error ?? NSError(domain: "LisnCaptureHelper", code: 500, userInfo: [NSLocalizedDescriptionKey: "Audio export failed"]))
                default:
                    continuation.resume(throwing: NSError(domain: "LisnCaptureHelper", code: 500, userInfo: [NSLocalizedDescriptionKey: "Audio export ended in unexpected state"]))
                }
            }
        }
    }
}

@main
struct LisnCaptureHelper {
    static func main() async {
        _ = NSApplication.shared
        if #available(macOS 15.0, *) {
            let coordinator = await CaptureCoordinatorMac15()
            await runLoop(coordinator: coordinator)
        } else {
            await runLegacyLoop()
        }
    }

    @available(macOS 15.0, *)
    static func runLoop(coordinator: CaptureCoordinatorMac15) async {
        while let line = readLine() {
            guard let data = line.data(using: .utf8),
                  let request = try? JSONDecoder().decode(IncomingRequest.self, from: data) else {
                continue
            }

            do {
                switch request.command {
                case "list-sources":
                    let sources = try await enumerateSources()
                    writeResponse(OutgoingResponse(requestId: request.requestId, ok: true, payload: .sources(sources), error: nil))
                case "start-session":
                    let sessionId = request.payload?["sessionId"] ?? UUID().uuidString
                    let sourceId = request.payload?["sourceId"] ?? ""
                    let audioPath = try await coordinator.startSession(sessionId: sessionId, sourceId: sourceId)
                    writeResponse(OutgoingResponse(requestId: request.requestId, ok: true, payload: .audioPath(audioPath), error: nil))
                case "stop-session":
                    let sessionId = request.payload?["sessionId"] ?? UUID().uuidString
                    let audioPath = try await coordinator.stopSession(sessionId: sessionId)
                    writeResponse(OutgoingResponse(requestId: request.requestId, ok: true, payload: .audioPath(audioPath), error: nil))
                default:
                    writeResponse(OutgoingResponse(requestId: request.requestId, ok: false, payload: nil, error: "Unsupported command"))
                }
            } catch {
                let sessionId = request.payload?["sessionId"]
                if let sessionId {
                    writeEvent(sessionId: sessionId, type: "error", message: error.localizedDescription)
                }
                writeResponse(OutgoingResponse(requestId: request.requestId, ok: false, payload: nil, error: error.localizedDescription))
            }
        }
    }

    static func runLegacyLoop() async {
        while let line = readLine() {
            guard let data = line.data(using: .utf8),
                  let request = try? JSONDecoder().decode(IncomingRequest.self, from: data) else {
                continue
            }

            do {
                switch request.command {
                case "list-sources":
                    let sources = try await enumerateSources()
                    writeResponse(OutgoingResponse(requestId: request.requestId, ok: true, payload: .sources(sources), error: nil))
                case "start-session", "stop-session":
                    throw NSError(
                        domain: "LisnCaptureHelper",
                        code: 501,
                        userInfo: [NSLocalizedDescriptionKey: "Audio capture requires macOS 15 or newer in the current implementation."]
                    )
                default:
                    writeResponse(OutgoingResponse(requestId: request.requestId, ok: false, payload: nil, error: "Unsupported command"))
                }
            } catch {
                let sessionId = request.payload?["sessionId"]
                if let sessionId {
                    writeEvent(sessionId: sessionId, type: "error", message: error.localizedDescription)
                }
                writeResponse(OutgoingResponse(requestId: request.requestId, ok: false, payload: nil, error: error.localizedDescription))
            }
        }
    }
}
