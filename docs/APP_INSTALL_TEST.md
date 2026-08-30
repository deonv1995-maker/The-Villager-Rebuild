# Android Chrome install acceptance

Test only the deployed GitHub Pages build in full Google Chrome on Android.

1. Remove any previous Villager shortcut/WebAPK from the phone before the clean test. If Chrome still remembers the old site state, clear site data for the Villager Pages origin and reopen the deployed game.
2. Open the game normally in Chrome and allow the page/service worker to finish loading.
3. The game itself must not show a custom Install App button. Chrome owns installation.
4. Chrome must recognize the site as an installable PWA. The browser menu should expose **Install app** rather than only **Create shortcut**. Chrome may also surface its own install promotion automatically; timing is browser-controlled.
5. Starting installation must open Google's native install UI/WebAPK flow.
6. After installation, launch The Villager from the Android launcher. It must open the same deployed game in fullscreen/landscape presentation and use the Ranger launcher artwork.
7. Reopening the installed app after a normal Pages deployment must load the current game build without requiring an APK reinstall.

Do not resume unrelated gameplay work until this native install path is accepted on-device.
