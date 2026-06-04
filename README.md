# 🐾 PetMi Vet

**Ecossistema & arquitetura multi-produto:** visão de plataforma, fronteiras Hub / Vet-Match / Marketplace / PetMi ID, permissões e épicos do Hub estão em [`docs/architecture/README.md`](docs/architecture/README.md).

PetMi Vet connects veterinary clinics and professionals. This workspace provides:
- **Backend** (Express + TypeScript) in `backend/`
- **Universal Frontend** (Expo/React Native) in `frontend/` which runs on web, iOS, and Android
- **PetMi Hub web** (Vite + React) in [`apps/hub-web`](apps/hub-web) — operação clínica (tutores, pets, tipos de serviço); corre em servidor de desenvolvimento separado (`npm run dev:hub-web` na raiz, porta **3002**)
- **Pacotes partilhados** em [`packages/web-core`](packages/web-core) e [`packages/hub-ui`](packages/hub-ui)

> 🚀 **Quer começar rapidamente?** Veja o [SETUP_LOCAL.md](SETUP_LOCAL.md) para um guia passo a passo conciso.
> 
> 📱 **Precisa buildar para iOS/Android?** Consulte o [BUILD_MOBILE.md](BUILD_MOBILE.md) para instruções completas de build.

## 📋 Features

### For Veterinary Clinics
- ✅ **Register** as a clinic with CNPJ and business details
- ✅ **Create job demands** for veterinary professionals
- ✅ **Post opportunities** with required specialties, workload, and compensation
- ✅ **Manage applications** from veterinarians

### For Veterinarians
- ✅ **Register** as a veterinary professional with CRMV
- ✅ **Browse open demands** from clinics
- ✅ **Apply to opportunities** with custom messages
- ✅ **Track application status** (Pending, Accepted, Rejected)

## 🏗️ Tech Stack

### Backend
- **Node.js** with **Express**
- **TypeScript** for type safety
- **Supabase** for database and authentication
- RESTful API architecture

### Frontend
- **Expo** / **React Native** for universal apps (web, iOS, Android)
- **TypeScript** for type safety
- **React Navigation** for navigation
- Responsive design (mobile & desktop)

## Prerequisites

- Node.js 18+
- npm 9+
- **Supabase** account and project
- iOS builds: macOS + Xcode (for Simulator)
- Android builds: Android Studio + SDK / Emulator or physical device (USB debugging enabled)

## 🚀 Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd PetiMiUniverse
```

### 2. Install Dependencies

```bash
# Install root dependencies (if any)
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

> **Note**: Frontend install upgrades TypeScript to 5.x so Expo + React Navigation compile correctly.

### 3. Configure Environment Variables

#### Backend Configuration

Create a `.env` file in the `backend/` directory:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Server Configuration
PORT=3000
NODE_ENV=development

# Frontend URL for CORS
FRONTEND_URL=http://localhost:3000
```

#### Frontend Configuration

Create a `.env.local` file in the `frontend/` directory:

```env
# Supabase Configuration
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key

# Backend API URL
REACT_APP_API_URL=http://localhost:3000

# Google Places API (for address autocomplete)
REACT_APP_GOOGLE_PLACES_API_KEY=your_google_places_api_key

# Alternative for Expo (if using Expo build)
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Where to find Supabase credentials:**
1. Go to https://app.supabase.com
2. Select your project
3. Navigate to **Settings → API**
4. Copy:
   - **Project URL** → `SUPABASE_URL` / `REACT_APP_SUPABASE_URL`
   - **anon/public key** → `SUPABASE_KEY` / `REACT_APP_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (backend only)

⚠️ **IMPORTANT**: Never commit `.env` files to Git!

### 4. Set up Supabase Database

The database migrations are located in `backend/database_migrations/` (`petimi_vet/` for PetMi Vet, `petimi_hub/` for PetMi Hub). 

**Option 1: Run migrations manually**
   
Execute the SQL files in your Supabase SQL Editor in order:
1. Start with the base schema files
2. Run any migration files as needed
3. Check `backend/database_migrations/*.md` for migration documentation

**Option 2: Quick setup (basic tables)**
   
You can run the basic schema in Supabase SQL Editor. See the migration files for the complete schema.

> **Tip**: Check the `backend/database_migrations/` directory for all available migrations and their documentation.

### 5. Configure Supabase Authentication

In your Supabase Dashboard:
- Go to **Authentication** → **Providers**
- Enable **Email** provider
- **Disable** "Confirm email" for development (optional)

---

## 🏃 Running the Application

### Development Mode

#### Start Backend (API Server)

```bash
cd backend
npm run dev           # Runs nodemon with ts-node (auto-reload on file changes)
```

The API will be available at **http://localhost:3000**

**Backend Scripts:**
- `npm run dev` - Start development server with auto-reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run production build (requires `npm run build` first)
- `npm run start:staging` - Run staging build

#### Start Frontend (Expo/React Native)

```bash
cd frontend
npm start             # Opens Expo CLI, choose platform (press w/i/a)
```

**Frontend Scripts:**
- `npm start` - Start Expo dev server (interactive menu)
- `npm run start:web` - Launch web build only
- `npm run start:ios` - Open iOS simulator (requires macOS + Xcode)
- `npm run start:android` - Open Android emulator or connected device
- `npm run web` - Alternative web start with React Scripts

### Quick Start (Multiple Terminals)

Open two terminal windows:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
```

Then choose your platform:
- Press `w` for web
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Press `r` to reload
- Press `m` to toggle menu

### Running on Mobile Devices

#### iOS Simulator (macOS only)
```bash
cd frontend
npm run start:ios
```

**Requirements:**
- macOS
- Xcode installed
- iOS Simulator available

#### Android Emulator/Device
```bash
cd frontend
npm run start:android
```

**Requirements:**
- Android Studio installed
- Android SDK configured
- Emulator running OR physical device connected with USB debugging enabled

**For physical devices:**
- Enable Developer Mode and USB Debugging
- Connect via USB
- Run `adb devices` to verify connection

**Important**: Update `REACT_APP_API_URL` in `frontend/.env.local` to your machine's local IP (e.g., `http://192.168.1.100:3000`) instead of `localhost` so mobile devices can reach the backend.

---

## 📦 Building for Production

### Backend Build

```bash
cd backend

# Build TypeScript to JavaScript
npm run build

# The compiled files will be in the `dist/` directory

# Run production build
npm start

# Or run staging build
npm run start:staging
```

**Build Output:** `backend/dist/`

### Frontend Build

#### Web Build (React Scripts)

```bash
cd frontend

# Build for production
npm run build:web

# The optimized build will be in the `build/` directory
# You can serve it with any static file server:
# - Serve locally: npx serve -s build
# - Deploy to Vercel, Netlify, etc.
```

**Build Output:** `frontend/build/`

#### Native Mobile Builds (Expo EAS)

For iOS and Android native builds, use Expo's EAS Build:

```bash
cd frontend

# Install EAS CLI globally (if not already installed)
npm install -g eas-cli

# Login to Expo
eas login

# Configure EAS (first time only)
eas build:configure

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android

# Build for both platforms
eas build --platform all
```

**Requirements for EAS Build:**
- Expo account (free)
- For iOS: Apple Developer account ($99/year)
- For Android: Google Play Developer account ($25 one-time)

**Local Builds (Alternative):**

```bash
# iOS (macOS only, requires Xcode)
expo build:ios

# Android
expo build:android
```

> **Note**: Local builds require additional setup. EAS Build is recommended for most cases.

### Environment-Specific Builds

#### Staging

**Backend:**
```bash
cd backend
NODE_ENV=staging npm run build
NODE_ENV=staging npm start
```

**Frontend:**
- Set environment variables in `.env.local` to point to staging URLs
- Build normally: `npm run build:web`

#### Production

**Backend:**
```bash
cd backend
NODE_ENV=production npm run build
NODE_ENV=production npm start
```

**Frontend:**
- Set environment variables in `.env.local` to point to production URLs
- Build: `npm run build:web`

---

## 📁 Project Structure

```
PetiMiUniverse/
├── backend/           # Express API (TypeScript)
│   ├── src/
│   │   ├── config/         # Supabase configuration
│   │   ├── controllers/    # Business logic
│   │   ├── routes/         # API routes
│   │   ├── middleware/     # Auth and other middleware
│   │   ├── utils/          # Utility functions
│   │   └── index.ts        # Server entry point
│   ├── database_migrations/  # SQL: petimi_vet/, petimi_hub/ + READMEs
│   ├── dist/               # Compiled JavaScript (generated)
│   └── package.json
│
├── frontend/          # Expo project (React Native + web)
│   ├── App.tsx
│   ├── navigation/
│   ├── screens/
│   ├── src/           # shared utilities/services, web styles
│   ├── components/    # Reusable components
│   ├── services/      # API services
│   ├── build/         # Web build output (generated)
│   └── package.json
│
├── babel.config.js
├── tailwind.config.js
└── README.md
```

---

## 🔑 API Endpoints

### Authentication
- `POST /auth/signup` - Create new user
- `POST /auth/login` - Login user

### Clinics
- `POST /clinics/register` - Register new clinic
- `GET /clinics` - Get all clinics

### Veterinarians
- `POST /vets/register` - Register new vet
- `GET /vets` - Get all vets
- `GET /vets/:id` - Get vet by ID
- `GET /vets/clinic/:clinicId` - Get vets by clinic

### Demands
- `POST /demands/create` - Create new demand
- `GET /demands/open` - Get all open demands
- `GET /demands/:id` - Get demand by ID
- `GET /demands/clinic/:clinicId` - Get demands by clinic
- `PATCH /demands/:id/status` - Update demand status

### Applications
- `POST /applications/apply` - Apply to a demand
- `GET /applications/demand/:demandId` - Get applications for a demand
- `GET /applications/vet/:vetId` - Get applications by vet
- `PATCH /applications/:id/status` - Update application status

---

## 📱 Mobile Configuration

### API Base URL for mobile

`frontend/src/services/api.ts` currently points to `http://localhost:3000`.  
When testing on a device/emulator, replace `localhost` with your machine's LAN IP (e.g. `http://192.168.0.10:3000`) so the app can reach the backend.


---

## 🐛 Troubleshooting

### Backend Issues

**Problem:** "Invalid login credentials"

**Solution:** 
1. Make sure you've signed up first with the same email
2. Check if email confirmation is required in Supabase (disable for development)
3. Verify your Supabase credentials are correct

**Problem:** "invalid input syntax for type bigint"

**Solution:** Your database tables need to use `uuid` type for `id` columns, not `bigint`. Run the SQL schema provided in the Installation section.

### Frontend Issues

- **TypeScript errors about React Navigation**  
  Run `npm install` inside `frontend/` to ensure TypeScript ≥5.x is installed.

- **Mobile app cannot reach backend**  
  Confirm both devices are on same network and update `API_BASE_URL` to your computer's IP.

- **Expo CLI failing to open simulator**  
  Make sure `xcode-select --install` (macOS) or Android Studio SDK tools are installed. Launch simulators manually if autodetect fails.

---

## 📚 Development

### Code Style

- TypeScript strict mode enabled
- ESLint configuration
- Functional React components with hooks

### Useful Scripts

**Backend:**
- `npm run dev` - Start development server with auto-reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run production build
- `npm run start:staging` - Run staging build

**Frontend:**
- `npm start` - Start Expo dev server (interactive menu)
- `npm run start:web` - Launch web build only
- `npm run start:ios` - Open iOS simulator
- `npm run start:android` - Open Android emulator
- `npm run build:web` - Build production web bundle
- `npm test` - Run tests (Jest/React Testing Library)

### Adding New Features

1. **Backend**: Add controller → Add route → Register in `index.ts`
2. **Frontend**: Add screen → Add to navigation → Update API services

---

## 🤝 Contributing

This is a project for connecting veterinary clinics with professionals. Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

## 📄 License

[Add your license here]

## 👥 Team

PetMi Vet Development Team

---

**Happy coding!** 🐾
