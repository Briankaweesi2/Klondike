# Klondike

AI-assisted Klondike solitaire wrapped for Android with AdMob hooks.

## Web preview
Open `index.html` directly in a browser.

## Android wrapper
Open this folder in Android Studio or build with Gradle once Gradle is installed.

- Package: `com.vimbah.klondike`
- AdMob App ID: `ca-app-pub-3003465306319489~7604915048`
- Rewarded: `ca-app-pub-3003465306319489/9245299778`
- Interstitial: `ca-app-pub-3003465306319489/3282526655`
- Banner: `ca-app-pub-3003465306319489/8749326974`

During development, swap to Google's test ad unit IDs before repeated testing on devices.

## Native bridge
The WebView exposes `window.AndroidAds`:

- `showRewardedHintAd()`
- `showInterstitialAd()`

The native wrapper calls back into the web game with:

- `window.onRewardedHintEarned(3)`
- `window.onRewardedHintFailed(message)`
- `window.onInterstitialClosed()`
- `window.onInterstitialFailed(message)`
