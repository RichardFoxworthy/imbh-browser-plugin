# Insurance Quote Comparison Browser Plugin

Compare home & contents and motor insurance quotes from Australian providers, without
filling out the same form fifteen times.

## How It Works

1. **Create a profile** — enter your details once in an encrypted local store
2. **Select providers** — choose which Australian insurers to compare
3. **Automated quoting** — the extension fills each insurer's quote form using your browser
4. **Compare results** — view all quotes side by side, sort, filter, and export

## Privacy & Security

- All data is **encrypted at rest** using AES-256-GCM with a user-derived key (PBKDF2)
- **Nothing leaves your device** — no data is sent to any external server
- Your browser makes all requests directly to insurer websites
- You can delete all data at any time from Settings

## Architecture

This is a Chrome Manifest V3 extension. The core design principle is that the
**user remains the principal actor** — the extension automates what the user would
do manually, using their own browser session, IP address, and cookies.

```
User's Device
├── Extension Popup      → Profile creation, provider selection, quote progress
├── Background Worker    → Tab management, quote orchestration
├── Content Scripts      → Form filling, DOM interaction, quote extraction
├── Side Panel           → Comparison dashboard
└── IndexedDB            → Encrypted profile storage, quote results
```

## Development

```bash
npm install
npm run dev      # Build with watch mode
npm run build    # Production build
npm run test     # Run tests
```

Load the extension in Chrome:
1. Navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist/` directory

## Supported Providers

### Home & Contents
Budget Direct, NRMA, AAMI, Allianz, Youi (more to come)

### Motor
Budget Direct, NRMA, AAMI (more to come)

**Note:** Adapter CSS selectors are placeholders that need to be verified and
updated against live insurer websites. Insurers regularly change their form
layouts.

## Tech Stack

- React 18 + TypeScript
- Vite (build)
- Tailwind CSS v4
- IndexedDB via `idb`
- Web Crypto API (AES-GCM + PBKDF2)
- Zustand (state management)
- Vitest (testing)
