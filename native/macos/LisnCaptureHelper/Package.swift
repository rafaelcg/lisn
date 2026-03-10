// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "LisnCaptureHelper",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "LisnCaptureHelper", targets: ["LisnCaptureHelper"])
    ],
    targets: [
        .executableTarget(
            name: "LisnCaptureHelper",
            linkerSettings: [
                .linkedFramework("ScreenCaptureKit"),
                .linkedFramework("AVFoundation")
            ]
        )
    ]
)
