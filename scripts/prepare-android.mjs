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

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enterImmersiveMode();
    }

    @Override
    protected void onResume() {
        super.onResume();
        enterImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
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
if (!manifest.includes('android:screenOrientation="landscape"')) {
  manifest = manifest.replace(
    'android:name=".MainActivity"',
    'android:name=".MainActivity"\n            android:screenOrientation="landscape"'
  );
}
manifest = manifest
  .replace('android:icon="@mipmap/ic_launcher"', 'android:icon="@drawable/villager_icon"')
  .replace('android:roundIcon="@mipmap/ic_launcher_round"', 'android:roundIcon="@drawable/villager_icon"');
await writeFile(manifestPath, manifest);

const drawableDir = path.join('android', 'app', 'src', 'main', 'res', 'drawable');
await mkdir(drawableDir, { recursive: true });
await copyFile('public/icons/villager-512.png', path.join(drawableDir, 'villager_icon.png'));

const gradlePath = path.join('android', 'app', 'build.gradle');
let gradle = await readFile(gradlePath, 'utf8');
gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
await writeFile(gradlePath, gradle);

console.log(`Android shell prepared: ${appId} · ${version} (${versionCode}) · landscape immersive`);
