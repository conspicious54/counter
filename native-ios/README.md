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

`bluetooth-central` background mode, state restoration, and remembered-device pending connections are enabled. The native ledger does not depend on the web view being active or online. iOS controls wake/relaunch opportunities: capture is not guaranteed after force-quit, before first device unlock, with Bluetooth denied/off, or while another app owns the scale connection. Initial unfiltered discovery is foreground-only; remembered-peripheral reconnection is delegated to CoreBluetooth. No Dialed export/bridge is implemented yet.

On October 22, 2026, the user's physical ESF551 advertised **Etekcity Smart Fitness Scale**, without advertised service UUIDs. Read-only discovery verified FFF0 service and FFF1 notify characteristic, settling and stable 22-byte packets, and decoded final weight matching the scale's displayed pounds. No private device identifiers or captured personal weights are included in the repository. Mac verification does not prove iPhone background capture; physical iPhone pairing, final-weight saving, offline replay and suspend/reconnect checks remain hardware acceptance steps.

Native parser/storage tests (macOS):

```sh
swiftc native-ios/Counter/BodyWeightLedger.swift native-ios/Tests/BodyWeightTests.swift -o /tmp/counter-body-tests
/tmp/counter-body-tests
```

A signed personal build may provision its existing web session through the `COUNTER_PERSONAL_SESSION` Xcode build setting. This is a signed, expiring app session, never an OpenAI key or the server access-code secret. Leave the setting empty for normal builds and unlock once in the web UI instead. Never commit its value or build logs containing it.
