// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "LissenCaptureHelper",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "LissenCaptureHelper", targets: ["LissenCaptureHelper"])
    ],
    targets: [
        .executableTarget(
            name: "LissenCaptureHelper",
            linkerSettings: [
                .linkedFramework("ScreenCaptureKit"),
                .linkedFramework("AVFoundation")
            ]
        )
    ]
)
