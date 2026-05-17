# DietPlanner

Android-only Solana diet app with MWA wallet connect, nutrition education, personalized meal planning, and SKR monetization hooks.

Developer: DietPlanner <contact@dietplanner.fit>
Repository: https://github.com/veronikusik/dietplanner
Android package: `fit.dietplanner`

## Run

```bash
npm install
npm run android
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

Public-facing legal pages are served from the `dietplanner.fit` custom domain. The HTML sources live in `docs/`:

- `docs/index.html` → https://dietplanner.fit/
- `docs/privacy.html` → https://dietplanner.fit/privacy.html
- `docs/terms.html` → https://dietplanner.fit/terms.html
- `docs/health-disclaimer.html` → https://dietplanner.fit/health-disclaimer.html
- `docs/copyright.html` → https://dietplanner.fit/copyright.html

These URLs are referenced by `app.json` (`extra.legal`), `src/App.js` (`LEGAL_URLS`), and `dapp-store/config.yaml` (`listing.*`). Solana dApp Store reviewers will open all four URLs and compare their content with the in-app disclosures. Before submitting:

1. Confirm `dietplanner.fit` DNS resolves and serves the `docs/` content (e.g. via GitHub Pages with a `CNAME` file, Cloudflare Pages, or any static host).
2. `curl -I https://dietplanner.fit/privacy.html` must return `200 OK`. Same for `terms.html` and `health-disclaimer.html`.
3. If `dietplanner.fit` is not yet live, point all three references back to `https://veronikusik.github.io/dietplanner/` (the docs/ folder is already shaped for GitHub Pages) and resubmit — but keep them consistent across the three files.

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
