# Counter iPhone Bluetooth app

Native SwiftUI/WKWebView shell for https://dumbcount.netlify.app/ with a scoped CoreBluetooth bridge. The website remains the same Next.js app; the native bridge supplies raw BLE notifications only to the configured HTTPS origin. Other navigation is blocked. No API secrets are bundled. No undocumented scale commands are sent.

## Build / install

1. Deploy the web changes containing `ScaleControl` to Netlify first.
2. Generate the Xcode project: `cd native-ios && xcodegen generate` (XcodeGen required).
3. Open `Counter.xcodeproj` in Xcode.
4. Under Signing & Capabilities, select your Apple development team. Use your own unique bundle identifier if required.
5. Connect your iPhone, enable Developer Mode if prompted, select it as the run destination, and run.
6. Allow Bluetooth, turn on the scale, set it to grams, and close VeSync/other connected apps.
7. Select a gram-based food → Weigh with scale → Connect Etekcity scale → tare the empty plate → Start automatic weight. Lift/replace the food to produce a fresh notification. Keep weight & stop tracking before moving to the next ingredient.

An Apple developer identity/signing is required to install on physical iPhone. Unsigned simulator compilation is not proof of physical iPhone operation. A personal development team has Apple's development-install restrictions; TestFlight distribution needs the applicable developer membership. Safari's Home Screen PWA cannot access this native bridge.

## Verified vs pending

- Physical ENS-C551S-SUS discovery, connection, FFF0/FFF1 notification subscription, checksum and stable 25.0 g packets were verified from a nearby Mac on October 22, 2026.
- Decoder checks packet identity, length, checksum, gram mode, media, stable status, positive quantity, capacity, freshness, and post-selection time.
- Ounces/mL modes are rejected rather than treated as grams. Tare is physical; remote tare is not implemented.
- Browser transport works in Web Bluetooth-capable browsers; native bridge is for iPhone. Signed build, installation, and launch on the paired physical iPhone succeeded on October 22, 2026. User confirmed end-to-end automatic ingredient entry on the physical iPhone.
- The bridge disconnects in the background and when the food scale panel unmounts. It never logs a meal by itself.


## ESF551 bathroom scale

Body-weight support has an application-owned CoreBluetooth manager, separate from the food bridge. Open **Body weight** on Today or **Settings → Body weight & bathroom scale**, tap Find bathroom scale, wake the ESF551, and explicitly select it. The remembered peripheral is retrieved and left with a pending reconnect when it sleeps. Disconnect pauses automatic capture; Forget removes pairing preferences but keeps saved weigh-ins. This is a direct BLE connection; VeSync is not required.

The manager discovers actual services and the FFF1 notify characteristic instead of assuming the food-scale service. A 22-byte ESF551 header verifies the model; a 16-byte food-scale frame cannot create body weight. Weight is always decoded in kg irrespective of display units, and only stable final frames save. No unit, impedance, or body-composition command is sent. The parser is adapted from Ron Ben Yosef's MIT-licensed `etekcity_esf551_ble`; attribution is bundled under `Counter/Licenses`.

Native storage is an atomic JSON ledger in Application Support, protected until first device unlock. It saves before any web callback and retains every saved reading for replay. Immutable IDs make web-cache replay idempotent. Repeated final weights within the same recent cycle are suppressed across reconnection/relaunch. Settling packets open a new cycle, preserving subsequent equal-weight weigh-ins; a stable-only equal-weight reading after 120 seconds is treated as a new weigh-in. This fallback cannot distinguish an unusually delayed repeated final from a new weigh-in when all settling frames were missed. Storage failures show an error and retain unsaved packets in memory for retry; do not quit while a storage error is present.

`bluetooth-central` background mode, state restoration, and remembered-device pending connections are enabled. The native ledger does not depend on the web view being active or online. iOS controls wake/relaunch opportunities: capture is not guaranteed after force-quit, before first device unlock, with Bluetooth denied/off, or while another app owns the scale connection. Initial unfiltered discovery is foreground-only; remembered-peripheral reconnection is delegated to CoreBluetooth. Stable weigh-ins also queue a background URLSession upload through Counter’s authenticated server relay to the private Dialed site. Acknowledgments advance only after successful delivery; the original native ledger remains intact. iOS still controls Bluetooth wake/relaunch and background transfer opportunities.

On October 22, 2026, the user's physical ESF551 advertised **Etekcity Smart Fitness Scale**, without advertised service UUIDs. Read-only discovery verified FFF0 service and FFF1 notify characteristic, settling and stable 22-byte packets, and decoded final weight matching the scale's displayed pounds. No private device identifiers or captured personal weights are included in the repository. Mac verification does not prove iPhone background capture; physical iPhone pairing, final-weight saving, offline replay and suspend/reconnect checks remain hardware acceptance steps.

Native parser/storage tests (macOS):

```sh
swiftc native-ios/Counter/BodyWeightLedger.swift native-ios/Tests/BodyWeightTests.swift -o /tmp/counter-body-tests
/tmp/counter-body-tests
```

A signed personal build may provision its existing web session through the `COUNTER_PERSONAL_SESSION` Xcode build setting. This is a signed, expiring app session, never an OpenAI key or the server access-code secret. Leave the setting empty for normal builds and unlock once in the web UI instead. Never commit its value or build logs containing it.

### Siri food logging

Say **“Siri, log food in Counter.”** Siri asks **“What did you eat?”**; answer with a food description or saved meal name. Counter opens and runs the normal matching pipeline, ready to confirm or weigh. The action also appears as **Log food** in Apple Shortcuts. To use only **“Siri, log food”**, make a personal shortcut named **Log food** using Counter’s Log food action, with Food set to Ask Each Time.

The native handoff is queued until the authenticated web app is ready. Descriptions are passed through JSON, not inserted into executable JavaScript. Existing meal drafts are retained. No food is committed before the normal review step. Siri’s one-sentence phrase recognition depends on iOS; the supported flow is the command followed by its spoken question.

### Native food capture

Speak uses AVAudioRecorder with AAC/m4a recording, app-level permission, automatic pause detection, manual stop and a 60-second limit. Session configuration and audio I/O run on a serial worker queue. Transcription still uses the authenticated server route; no OpenAI key is embedded. Untranscribed recordings stay in Application Support/Counter/Recordings until successful transcription or explicit Discard. Reopening Speak recovers a saved recording instead of silently replacing it. Switching modes ends recording and retains it for recovery.

Scan uses a full-screen AVCaptureSession with continuous autofocus, native EAN/UPC/Code 128/Code 39/ITF decoding, native flash and Close controls. Start/stop/configuration run on a dedicated worker queue. Close, app backgrounding and switching away turn the flash off and release the camera. Captured barcode strings enter the existing lookup pipeline. Camera permission denial returns to manual barcode entry.

The capture bridge accepts only the trusted top-level HTTPS Counter app. Every session has a request ID; late results from a closed component are ignored. Browser/PWA installs retain their web capture fallback. Native logs in subsystem com.connorbyers.counter, category capture contain microphone-start and camera-first-preview timings, without recordings, food descriptions or barcode values. Hardware latency must be measured on the phone; a passing build does not establish a specific startup time.

Capture diagnostics retain the last 40 request stage durations in Application Support/Counter/capture-timings.json. Only stage (transcribe/search/parse/etc.), duration and timestamp are recorded; food descriptions, audio, response bodies and credentials are excluded. Use a fresh device attempt to distinguish transcription and lookup latency instead of treating server timings from a Mac as phone measurements.

### Live voice transcription

The native app prefers SFSpeechRecognizer with AVAudioEngine and requiresOnDeviceRecognition enabled after checking device support. Partial transcripts appear during recording. Stop ends audio immediately, then a final recognition result is sent directly into the food lookup; the normal path makes no /api/transcribe request. Recording is manual-stop (60-second safety limit), so normal pauses do not prematurely submit a longer description.

Apple's one-time Speech Recognition permission is requested on first use. Unsupported/denied/failed local recognition retains the AAC recording and falls back to the existing server transcription/retry path. A two-second finalization timeout is only a failure fallback, not a mandatory delay. Buffers are copied from the audio callback to the capture queue before encoding or recognition. Audio stays local until fallback is needed.
