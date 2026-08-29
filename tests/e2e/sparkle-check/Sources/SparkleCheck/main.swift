import AppKit
import Foundation
import Sparkle

struct Options {
    var feedURL: URL
    var publicKey: String
    var expectedVersion: String
    var timeout: TimeInterval
}

func parseOptions() -> Options {
    var feed: String?
    var publicKey: String?
    var expected: String?
    var timeout: TimeInterval = 90
    var index = 1
    let args = CommandLine.arguments
    while index < args.count {
        let flag = args[index]
        let value = index + 1 < args.count ? args[index + 1] : nil
        switch flag {
        case "--feed":
            feed = value
            index += 2
        case "--public-key":
            publicKey = value
            index += 2
        case "--expected-version":
            expected = value
            index += 2
        case "--timeout":
            timeout = TimeInterval(value ?? "") ?? 90
            index += 2
        default:
            fputs("unknown argument: \(flag)\n", stderr)
            exit(2)
        }
    }
    guard let feed, let feedURL = URL(string: feed), let publicKey, let expected else {
        fputs("usage: sparkle-check --feed URL --public-key KEY --expected-version VERSION [--timeout SECONDS]\n", stderr)
        exit(2)
    }
    return Options(feedURL: feedURL, publicKey: publicKey, expectedVersion: expected, timeout: timeout)
}

func writeDummyBundle(publicKey: String, feedURL: URL) throws -> URL {
    let root = FileManager.default.temporaryDirectory
        .appendingPathComponent("shukka-sparkle-check-\(UUID().uuidString)", isDirectory: true)
        .appendingPathComponent("Dummy.app", isDirectory: true)
    let contents = root.appendingPathComponent("Contents", isDirectory: true)
    let macos = contents.appendingPathComponent("MacOS", isDirectory: true)
    try FileManager.default.createDirectory(at: macos, withIntermediateDirectories: true)
    let executable = macos.appendingPathComponent("Dummy")
    try Data("#!/bin/sh\nexit 0\n".utf8).write(to: executable)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: executable.path)

    let plist: [String: Any] = [
        "CFBundleIdentifier": "app.shukka.sparkle-check",
        "CFBundleName": "SparkleCheck",
        "CFBundleDisplayName": "SparkleCheck",
        "CFBundleExecutable": "Dummy",
        "CFBundlePackageType": "APPL",
        "CFBundleVersion": "1",
        "CFBundleShortVersionString": "1.0.0",
        "SUFeedURL": feedURL.absoluteString,
        "SUPublicEDKey": publicKey,
        "SUEnableAutomaticChecks": false,
        "SUAllowsAutomaticUpdates": false,
        "NSAppTransportSecurity": [
            "NSAllowsArbitraryLoads": true,
            "NSAllowsLocalNetworking": true,
        ],
    ]
    let plistURL = contents.appendingPathComponent("Info.plist")
    let data = try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
    try data.write(to: plistURL)
    return root
}

final class SilentDriver: NSObject, SPUUserDriver {
    let expectedVersion: String
    var receivedBytes: UInt64 = 0
    var foundVersion: String?
    var downloaded = false

    init(expectedVersion: String) {
        self.expectedVersion = expectedVersion
    }

    func succeed(reason: String) {
        FileHandle.standardOutput.write(
            Data("sparkle-check ok: version=\(foundVersion ?? expectedVersion) bytes=\(receivedBytes) \(reason)\n".utf8)
        )
        exit(0)
    }

    func fail(_ message: String) {
        fputs("sparkle-check failed: \(message)\n", stderr)
        exit(1)
    }

    func log(_ message: String) {
        FileHandle.standardOutput.write(Data("sparkle-check: \(message)\n".utf8))
    }

    func show(_ request: SPUUpdatePermissionRequest, reply: @escaping (SUUpdatePermissionResponse) -> Void) {
        reply(SUUpdatePermissionResponse(automaticUpdateChecks: false, sendSystemProfile: false))
    }

    func showUserInitiatedUpdateCheck(cancellation: @escaping () -> Void) {}

    func showUpdateFound(with appcastItem: SUAppcastItem, state: SPUUserUpdateState, reply: @escaping (SPUUserUpdateChoice) -> Void) {
        foundVersion = appcastItem.displayVersionString.isEmpty ? appcastItem.versionString : appcastItem.displayVersionString
        if foundVersion != expectedVersion && appcastItem.versionString != expectedVersion {
            fail("offered \(foundVersion ?? "?") (build \(appcastItem.versionString)), expected \(expectedVersion)")
            return
        }
        reply(.install)
    }

    func showUpdateReleaseNotes(with downloadData: SPUDownloadData) {}

    func showUpdateReleaseNotesFailedToDownloadWithError(_ error: any Error) {}

    func showUpdateNotFoundWithError(_ error: any Error, acknowledgement: @escaping () -> Void) {
        acknowledgement()
        fail("no update: \(error.localizedDescription)")
    }

    func showUpdaterError(_ error: any Error, acknowledgement: @escaping () -> Void) {
        acknowledgement()
        let ns = error as NSError
        fail("\(ns.localizedDescription) [\(ns.domain) \(ns.code)]")
    }

    func showDownloadInitiated(cancellation: @escaping () -> Void) {
        log("download started")
    }

    func showDownloadDidReceiveExpectedContentLength(_ expectedContentLength: UInt64) {
        log("expected \(expectedContentLength) bytes")
    }

    func showDownloadDidReceiveData(ofLength length: UInt64) {
        receivedBytes += length
        downloaded = true
    }

    func showDownloadDidStartExtractingUpdate() {
        downloaded = true
        log("extracting after \(receivedBytes) bytes")
    }

    func showExtractionReceivedProgress(_ progress: Double) {}

    func showReady(toInstallAndRelaunch reply: @escaping (SPUUserUpdateChoice) -> Void) {
        if !downloaded && receivedBytes == 0 {
            fail("ready to install but no bytes were downloaded")
            return
        }
        reply(.dismiss)
        succeed(reason: "downloaded-no-install")
    }

    func showInstallingUpdate(withApplicationTerminated applicationTerminated: Bool, retryTerminatingApplication: @escaping () -> Void) {
        fail("Sparkle started installing; e2e must dismiss before install")
    }

    func showUpdateInstalledAndRelaunched(_ relaunched: Bool, acknowledgement: @escaping () -> Void) {
        acknowledgement()
        fail("Sparkle installed the update; e2e must not install")
    }

    func showUpdateInFocus() {}

    func dismissUpdateInstallation() {}
}

final class Runner: NSObject, SPUUpdaterDelegate {
    let options: Options
    let driver: SilentDriver
    var updater: SPUUpdater?

    init(options: Options) {
        self.options = options
        self.driver = SilentDriver(expectedVersion: options.expectedVersion)
    }

    func start() {
        do {
            let bundleURL = try writeDummyBundle(publicKey: options.publicKey, feedURL: options.feedURL)
            guard let bundle = Bundle(url: bundleURL) else {
                fputs("sparkle-check failed: could not load dummy bundle\n", stderr)
                exit(1)
            }
            let updater = SPUUpdater(hostBundle: bundle, applicationBundle: bundle, userDriver: driver, delegate: self)
            self.updater = updater
            try updater.start()
            updater.checkForUpdates()
        } catch {
            fputs("sparkle-check failed: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
        Timer.scheduledTimer(withTimeInterval: options.timeout, repeats: false) { _ in
            fputs("sparkle-check failed: timed out after \(self.options.timeout)s\n", stderr)
            exit(1)
        }
    }

    func feedURLString(for updater: SPUUpdater) -> String? {
        options.feedURL.absoluteString
    }
}

let options = parseOptions()
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let runner = Runner(options: options)
runner.start()
app.run()
