# PetiVet Monorepo

PetiVet connects veterinary clinics and professionals. This workspace now provides:
- **Backend** (Express + TypeScript) in `backend/`
- **Universal Frontend** (Expo/React Native) in `frontend/` which runs on web, iOS, and Android

## Prerequisites

- Node.js 18+
- npm 9+
- iOS builds: macOS + Xcode (for Simulator)
- Android builds: Android Studio + SDK / Emulator or physical device (USB debugging enabled)

### Install dependencies once

```bash
npm install           # root dependencies (if any shared)
cd backend && npm install
cd ../frontend && npm install
```

> Frontend install upgrades TypeScript to 5.x so Expo + React Navigation compile correctly.

---

## Backend (API)

```bash
cd backend
npm run dev           # runs nodemon with ts-node
```

Default port: `http://localhost:3000`. Update `.env` if you need a different port or database credentials.

---

## Frontend (Expo app)

```bash
cd frontend
npm run start         # open Expo CLI, choose platform (press w/i/a)
# or
npm run start:web     # launch web build only
npm run start:ios     # open iOS simulator (macOS + Xcode)
npm run start:android # open Android emulator or connected device
```

### API Base URL for mobile

`frontend/src/services/api.ts` currently points to `http://localhost:3000`.  
When testing on a device/emulator, replace `localhost` with your machine’s LAN IP (e.g. `http://192.168.0.10:3000`) so the app can reach the backend.

### Building native binaries

Expo Managed apps use EAS:
```bash
npx expo login
npx expo install expo-cli            # if not already
npx eas build --platform ios
npx eas build --platform android
```
Requires linking an Expo account; follow CLI prompts to configure credentials and build profiles.

---

## Project structure

```
PetiVet/
├── backend/           # Express API (TypeScript)
├── frontend/          # Expo project (React Native + web)
│   ├── App.tsx
│   ├── navigation/
│   ├── screens/
│   └── src/           # shared utilities/services, web styles
├── babel.config.js
├── tailwind.config.js
└── README.md
```

---

## Useful scripts

- `npm run dev` (backend) – hot reload API
- `npm run start` (frontend) – Expo dev server
- `npm run start:web` (frontend) – CRA-style web dev server
- `npm test` (frontend) – Jest/React Testing Library (web)

---

## Troubleshooting

- **TypeScript errors about React Navigation**  
  Run `npm install` inside `frontend/` to ensure TypeScript ≥5.x is installed.

- **Mobile app cannot reach backend**  
  Confirm both devices are on same network and update `API_BASE_URL` to your computer’s IP.

- **Expo CLI failing to open simulator**  
  Make sure `xcode-select --install` (macOS) or Android Studio SDK tools are installed. Launch simulators manually if autodetect fails.

---

Happy coding! 🐾
