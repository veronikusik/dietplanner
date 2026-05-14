# DietPlanner

Android-only Solana diet app with MWA wallet connect, nutrition education, personalized meal planning, and SKR monetization hooks.

Developer: DietPlanner <contact@dietplanner.fit>
Repository: https://github.com/veronikusik/dietplanner
Android package: `com.veronikusik.dietplanner`

## Run

```bash
npm install
npm run android
```

Run from this folder:

```bash
/Users/vishyn369/Downloads/StealthLynk/NEW/DEMO_APPS/FileSharing/DietPlanner
```

## Data sources

Bundled nutrition facts are curated from reputable public references: USDA FoodData Central, NIH Office of Dietary Supplements, and U.S. Dietary Guidelines-style nutrition guidance. The app is educational and not medical advice.

## Production build

Release signing is configured through environment variables or Gradle properties. Do not commit keystores, passwords, APKs, AABs, or `credentials.json`.

Required signing variables:

```bash
export DIETPLANNER_UPLOAD_STORE_FILE=dietplanner-release.keystore
export DIETPLANNER_UPLOAD_STORE_PASSWORD=...
export DIETPLANNER_UPLOAD_KEY_ALIAS=...
export DIETPLANNER_UPLOAD_KEY_PASSWORD=...
```

Build a signed APK:

```bash
npm install
npm run build:android:release
```

Output:

```bash
android/app/build/outputs/apk/release/app-release.apk
```

Build an AAB if requested:

```bash
npm run build:android:bundle
```

Output:

```bash
android/app/build/outputs/bundle/release/app-release.aab
```

## Solana dApp Store

Submission metadata lives in `dapp-store/`:

- `dapp-store/config.yaml`
- `dapp-store/listing.md`
- `legal/privacy-policy.md`
- `legal/terms-of-service.md`
- `legal/copyright.md`

Before submission, verify the current Solana dApp Store metadata schema and copy values from `dapp-store/config.yaml` into the official submission format if the schema has changed.

## Public legal pages

GitHub Pages-ready pages live in `docs/`:

- `docs/index.html`
- `docs/privacy.html`
- `docs/terms.html`
- `docs/health-disclaimer.html`
- `docs/copyright.html`

After pushing to `https://github.com/veronikusik/dietplanner`, enable GitHub Pages from the `main` branch `/docs` folder. The public listing URLs will be:

- `https://veronikusik.github.io/dietplanner/`
- `https://veronikusik.github.io/dietplanner/privacy.html`
- `https://veronikusik.github.io/dietplanner/terms.html`
- `https://veronikusik.github.io/dietplanner/health-disclaimer.html`
- `https://veronikusik.github.io/dietplanner/copyright.html`

## Create the standalone public GitHub repo

Create an empty public repo under DietPlanner account:

```bash
gh repo create veronikusik/dietplanner --public --source=. --remote=origin
git branch -M main
git add .
git commit -m "Initial DietPlanner production app"
git push -u origin main
```

Before pushing, confirm ignored files are not staged:

```bash
git status --ignored
```

Never commit signing credentials, keystores, `.env`, APK/AAB build outputs, or `credentials.json`.
