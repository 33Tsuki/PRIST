# CPI Surveyor App - Govt. of Tripura

A Flutter application for CPI (Consumer Price Index) price data collection by field surveyors for the Department of Statistics, Government of Tripura.

## 📱 App Screenshots & Features

### Screens:
1. **Login Screen** — Surveyor ID + OTP authentication with Indian tricolor themed background
2. **Dashboard** — Summary cards, today's markets with progress bars, announcements
3. **Markets** — List of assigned markets with completion status and actions
4. **Price Collection** — Tabbed view (Pending/Collected), category filters, price entry bottom sheet
5. **Reports** — Monthly collection summary, market-wise progress, price changes, submission history
6. **Profile** — Surveyor info card, stats, logout

## 🏗️ Project Structure

```
surveyor_app/
├── lib/
│   ├── main.dart                    # App entry point
│   ├── theme/
│   │   └── app_theme.dart           # Colors, themes, typography
│   ├── models/
│   │   └── models.dart              # Data models + sample data
│   ├── screens/
│   │   ├── login_screen.dart        # OTP login with tricolor bg
│   │   ├── home_screen.dart         # Bottom nav + dashboard tab
│   │   ├── market_list_screen.dart  # Markets list
│   │   ├── price_collection_screen.dart  # Price entry screen
│   │   ├── reports_screen.dart      # Reports & analytics
│   │   └── profile_screen.dart      # Surveyor profile
│   └── widgets/                     # Shared widgets (reserved)
├── android/
│   ├── app/
│   │   ├── build.gradle
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── kotlin/.../MainActivity.kt
│   │       └── res/
│   ├── build.gradle
│   ├── settings.gradle
│   └── gradle.properties
├── assets/
│   └── images/                      # App assets
└── pubspec.yaml                     # Dependencies
```

## 🚀 How to Build APK

### Prerequisites
- Flutter SDK >= 3.0.0 (https://flutter.dev/docs/get-started/install)
- Android Studio / Android SDK (API 21+)
- Java 17 or 21

### Steps

1. **Clone / Extract** the project folder

2. **Setup local.properties**
   ```bash
   cp android/local.properties.template android/local.properties
   # Edit android/local.properties with your Flutter and Android SDK paths
   ```

3. **Get Flutter dependencies**
   ```bash
   flutter pub get
   ```

4. **Install Git hooks**
   ```bash
   pip install pre-commit
   pre-commit install
   ```
   The `pre-commit` hooks auto-format staged Dart files and run `flutter analyze` before each commit.

5. **Run on device/emulator**
   ```bash
   flutter run
   ```

6. **Build debug APK**
   ```bash
   flutter build apk --debug
   # Output: build/app/outputs/flutter-apk/app-debug.apk
   ```

7. **Build release APK**
   ```bash
   flutter build apk --release
   # Output: build/app/outputs/flutter-apk/app-release.apk
   ```
   If `android/key.properties` is not configured locally, the project falls back to debug signing for release builds.
   Configure local API settings through the gitignored `.env` file.
   Copy the template first:
   ```bash
   cp .env.example .env
   ```

8. **Build split APKs (smaller size)**
   ```bash
   flutter build apk --split-per-abi
   ```

## 🤖 GitHub Release Automation

Every push to `main` triggers `.github/workflows/release-apk.yml`, which:

- Builds production-signed split APKs for `armeabi-v7a` and `arm64-v8a`
- Overrides the Android build number with the GitHub Actions run number
- Creates a normal GitHub Release tagged as `v<semantic-version>-build.<run-number>-main-<short-sha>`
- Uploads these assets:
  - `surveyor_app-v<semantic-version>-build.<run-number>-main-<short-sha>-armeabi-v7a.apk`
  - `surveyor_app-v<semantic-version>-build.<run-number>-main-<short-sha>-arm64-v8a.apk`

### Versioning Policy

- Keep the semantic version in `pubspec.yaml` manual, for example `0.1.0+1`
- Use `0.x.y` while the app is still in testing
- Let CI assign the distributed APK build number from `github.run_number`
- Expect build numbers to keep increasing across semantic version bumps, for example `0.1.0` build `3` then `0.1.1` build `4`
- Treat CI releases as the canonical tester builds; local release APKs may need uninstall/reinstall unless you pass a higher local `--build-number`

### Required GitHub Secrets

Add these repository secrets before enabling the workflow:

- `DOTENV_FILE`
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

`DOTENV_FILE` must contain the raw contents of the `.env` file used for release builds, for example:

```dotenv
API_BASE_URL=https://api.example.com
```

### Generating `ANDROID_KEYSTORE_BASE64`

Encode your release keystore as base64 before saving it as a GitHub secret:

```bash
base64 -w 0 your-release-key.jks
```

On macOS, use:

```bash
base64 your-release-key.jks | tr -d '\n'
```

## 📦 Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| google_fonts | ^6.1.0 | Inter font family |
| fl_chart | ^0.66.2 | Charts (reserved for reports) |
| intl | ^0.19.0 | Date/number formatting |
| shared_preferences | ^2.2.2 | Local persistence |
| pinput | ^3.0.0 | OTP input field |

## 🎨 Design System

- **Primary Color**: `#2B66CC` (Government Blue)
- **Background**: `#E9F2F8` (Light Blue-Gray)
- **Success**: `#0F5132` (Dark Green)
- **Font**: Inter (via Google Fonts)
- **Border Radius**: 6–16px depending on component

## 📝 Notes

- The app uses sample/mock data. Connect to real API endpoints in `models/models.dart`
- GPS and camera permissions are included in AndroidManifest for future field use
- OTP login skips real verification — integrate SMS gateway for production

---
**Developed for**: Dept. of Statistics & Economics, Govt. of Tripura  
**Version**: 0.1.0
