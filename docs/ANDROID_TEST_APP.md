# Android live test app

The Android test app is a thin native delivery shell for The Villager. It does **not** contain a second copy of gameplay logic.

## Source of truth

- Gameplay, terrain, controls, Ranger behavior, ecology, rendering, world generation, UI and runtime assets remain owned by the normal web project and GitHub Pages deployment.
- The Android shell loads `https://deonv1995-maker.github.io/The-Villager-Rebuild/?shell=android` in a full-screen hardware-accelerated WebView.
- Closing and reopening the installed test app starts from the live Pages build, so ordinary gameplay changes do not require a new APK.
- The `shell=android` marker only tells the web install UI that it is already running inside the native test shell. It must not alter gameplay.

## Native boundary

- Package ID: `io.github.deonv1995maker.thevillager.test`.
- Minimum Android version: Android 8 / API 26.
- Cleartext traffic is disabled; the shell loads HTTPS only.
- Top-level navigation stays inside the exact Villager GitHub Pages path. External links are handed to the device browser.
- JavaScript and DOM storage are enabled because the existing game requires them.
- The WebView uses network-fresh loading so a successful Pages deployment is visible after the test app is reopened.
- The launcher icon is generated at build time from `public/icons/ranger-maskable-512.png`; this does not modify the browser/PWA icon contract.

## APK lifecycle

`.github/workflows/android-apk.yml` builds a debug APK whenever the native shell or its contract changes. The workflow artifact is named `the-villager-test-apk` and contains `The-Villager-Test.apk`.

The CI debug signing key is intended only for device testing. A later production Android release must use a dedicated protected release-signing key. If the native shell itself changes and a future debug build is signed with a different CI debug key, Android may require uninstalling the previous test APK before installing the replacement. Normal web/gameplay updates do not require reinstalling the test APK.

## Architecture rule

Do not move gameplay code into `android/`. Android is a delivery/runtime shell only. A web gameplay change must continue to build, run and deploy independently of the Android project.
