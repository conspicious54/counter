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
- Browser transport works in Web Bluetooth-capable browsers; native bridge is for iPhone. Signed build, installation, and launch on the paired physical iPhone succeeded on October 22, 2026. User confirmation of end-to-end automatic ingredient entry is still pending.
- The bridge disconnects in the background and when the food scale panel unmounts. It never logs a meal by itself.
