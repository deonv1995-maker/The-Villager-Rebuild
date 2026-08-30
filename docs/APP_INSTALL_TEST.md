# Android Chrome install acceptance

Test only the deployed GitHub Pages build in full Google Chrome on Android.

1. Remove any previous Villager shortcut/WebAPK and clear Villager site data before the clean acceptance test.
2. Open the deployed game normally in full Chrome and let the page/service worker finish loading.
3. The game must not show a custom Install App button. Chrome owns installation.
4. Chrome must expose its native **Install app** flow rather than only **Create shortcut**.
5. Starting installation must open Google's native PWA/WebAPK installer.
6. For this baseline test, the installed launcher icon is expected to be the archived original green Villager SVG artwork. Do not evaluate the Ranger replacement yet.
7. Launch the installed app and verify that it opens the same deployed game in fullscreen presentation and remains playable.
8. Only after native installation is proven again may the Ranger launcher artwork be introduced as an isolated icon-only change.

Do not resume unrelated gameplay work until this native install path is accepted on-device.
