// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SparkleCheck",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "sparkle-check", targets: ["SparkleCheck"]),
    ],
    dependencies: [
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.7.0"),
    ],
    targets: [
        .executableTarget(
            name: "SparkleCheck",
            dependencies: [
                .product(name: "Sparkle", package: "Sparkle"),
            ]
        ),
    ]
)
