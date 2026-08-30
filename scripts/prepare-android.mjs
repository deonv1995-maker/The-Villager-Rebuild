import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const config = JSON.parse(await readFile('capacitor.config.json', 'utf8'));
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const appId = config.appId;
const version = packageJson.version;

if (!appId || !version) throw new Error('Missing Capacitor appId or package version');

const versionParts = version.split('.').map(part => Number.parseInt(part, 10) || 0);
const [major = 0, minor = 0, patch = 0] = versionParts;
const versionCode = Math.max(1, major * 10000 + minor * 100 + patch);

const javaDir = path.join('android', 'app', 'src', 'main', 'java', ...appId.split('.'));
await mkdir(javaDir, { recursive: true });

const mainActivity = `package ${appId};

import android.content.pm.ActivityInfo;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enforceLandscape();
        enterImmersiveMode();
    }

    @Override
    public void onResume() {
        super.onResume();
        enforceLandscape();
        enterImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enforceLandscape();
            enterImmersiveMode();
        }
    }

    private void enforceLandscape() {
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
    }

    private void enterImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(
            getWindow(),
            getWindow().getDecorView()
        );
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
    }
}
`;
await writeFile(path.join(javaDir, 'MainActivity.java'), mainActivity);

const manifestPath = path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml');
let manifest = await readFile(manifestPath, 'utf8');
if (/android:screenOrientation="[^"]+"/.test(manifest)) {
  manifest = manifest.replace(/android:screenOrientation="[^"]+"/, 'android:screenOrientation="sensorLandscape"');
} else {
  manifest = manifest.replace(
    'android:name=".MainActivity"',
    'android:name=".MainActivity"\n            android:screenOrientation="sensorLandscape"'
  );
}
manifest = manifest
  .replace(/android:icon="@[^"]+"/, 'android:icon="@mipmap/ic_launcher"')
  .replace(/android:roundIcon="@[^"]+"/, 'android:roundIcon="@mipmap/ic_launcher_round"');
await writeFile(manifestPath, manifest);

const sourceIcon = 'public/icons/villager-512.png';
const drawableDir = path.join('android', 'app', 'src', 'main', 'res', 'drawable');
await mkdir(drawableDir, { recursive: true });
await copyFile(sourceIcon, path.join(drawableDir, 'villager_icon_foreground.png'));

const valuesDir = path.join('android', 'app', 'src', 'main', 'res', 'values');
await mkdir(valuesDir, { recursive: true });
await writeFile(
  path.join(valuesDir, 'villager_icon_colors.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="villager_icon_background">#10251C</color>\n</resources>\n'
);

const adaptiveDir = path.join('android', 'app', 'src', 'main', 'res', 'mipmap-anydpi-v26');
await mkdir(adaptiveDir, { recursive: true });
const adaptiveIcon = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/villager_icon_background" />
    <foreground android:drawable="@drawable/villager_icon_foreground" />
</adaptive-icon>
`;
await writeFile(path.join(adaptiveDir, 'ic_launcher.xml'), adaptiveIcon);
await writeFile(path.join(adaptiveDir, 'ic_launcher_round.xml'), adaptiveIcon);

for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const mipmapDir = path.join('android', 'app', 'src', 'main', 'res', `mipmap-${density}`);
  await mkdir(mipmapDir, { recursive: true });
  await copyFile(sourceIcon, path.join(mipmapDir, 'ic_launcher.png'));
  await copyFile(sourceIcon, path.join(mipmapDir, 'ic_launcher_round.png'));
}

const gradlePath = path.join('android', 'app', 'build.gradle');
let gradle = await readFile(gradlePath, 'utf8');
gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
await writeFile(gradlePath, gradle);

if (!manifest.includes('android:screenOrientation="sensorLandscape"')) {
  throw new Error('Android manifest landscape orientation was not applied');
}
if (!manifest.includes('android:icon="@mipmap/ic_launcher"')) {
  throw new Error('Android launcher icon mapping was not applied');
}

console.log(`Android shell prepared: ${appId} · ${version} (${versionCode}) · sensor landscape immersive · Villager adaptive icon`);
