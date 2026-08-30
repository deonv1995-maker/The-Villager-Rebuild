import { readFile, stat } from 'node:fs/promises';

async function text(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size === 0) throw new Error(`Missing Android wrapper file: ${path}`);
  return readFile(path, 'utf8');
}

const [settings, rootBuild, appBuild, manifest, activity, workflow, installController] = await Promise.all([
  text('android/settings.gradle'),
  text('android/build.gradle'),
  text('android/app/build.gradle'),
  text('android/app/src/main/AndroidManifest.xml'),
  text('android/app/src/main/java/io/github/deonv1995maker/thevillager/test/MainActivity.java'),
  text('.github/workflows/android-apk.yml'),
  text('public/pwa-install.js')
]);

const required = (source, needle, label) => {
  if (!source.includes(needle)) throw new Error(`${label} is missing required contract: ${needle}`);
};

required(settings, "include ':app'", 'Android settings');
required(rootBuild, "com.android.application", 'Android root build');
required(appBuild, "applicationId 'io.github.deonv1995maker.thevillager.test'", 'Android app build');
required(appBuild, "https://deonv1995-maker.github.io/The-Villager-Rebuild/?shell=android", 'Android live-game URL');
required(appBuild, "../../package.json", 'Android version source');
required(appBuild, "../../public/icons/ranger-maskable-512.png", 'Android Ranger launcher source');
required(manifest, 'android.permission.INTERNET', 'Android manifest');
required(manifest, 'android:usesCleartextTraffic="false"', 'Android manifest');
required(activity, 'new WebView(this)', 'Android live shell');
required(activity, 'setJavaScriptEnabled(true)', 'Android live shell');
required(activity, 'setDomStorageEnabled(true)', 'Android live shell');
required(activity, 'WebSettings.LOAD_NO_CACHE', 'Android live shell');
required(activity, 'TRUSTED_HOST = "deonv1995-maker.github.io"', 'Android navigation boundary');
required(activity, 'TRUSTED_PATH = "/The-Villager-Rebuild/"', 'Android navigation boundary');
required(activity, 'BuildConfig.GAME_URL', 'Android live shell');
required(workflow, ':app:assembleDebug', 'Android APK workflow');
required(workflow, 'the-villager-test-apk', 'Android APK workflow');
required(installController, "get('shell') === 'android'", 'PWA/native-shell separation');

console.log('Android live test shell contract verified.');
