# 🐾 PetiVet

PetiVet connects veterinary clinics and professionals. This workspace provides:
- **Backend** (Express + TypeScript) in `backend/`
- **Universal Frontend** (Expo/React Native) in `frontend/` which runs on web, iOS, and Android

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

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd PetiVet
   ```

2. **Install dependencies**
   ```bash
   npm install           # root dependencies (if any shared)
   cd backend && npm install
   cd ../frontend && npm install
   ```

   > Frontend install upgrades TypeScript to 5.x so Expo + React Navigation compile correctly.

3. **Configure Supabase**
   
   Create a `.env` file in the `backend/` directory:
   ```env
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_KEY=your_supabase_anon_key
   PORT=3000
   ```

4. **Set up Supabase Database**

   Run the following SQL in your Supabase SQL Editor:

   ```sql
   -- Create clinics table
   CREATE TABLE clinics (
     id uuid PRIMARY KEY,
     name text NOT NULL,
     cnpj text NOT NULL UNIQUE,
     address text NOT NULL,
     email text NOT NULL UNIQUE,
     created_at timestamp with time zone DEFAULT now(),
     updated_at timestamp with time zone DEFAULT now()
   );

   -- Create vets table
   CREATE TABLE vets (
     id uuid PRIMARY KEY,
     name text NOT NULL,
     crmv text NOT NULL UNIQUE,
     specialties text[] NOT NULL DEFAULT '{}',
     certificates text[] DEFAULT '{}',
     experience text NOT NULL,
     email text NOT NULL UNIQUE,
     clinic_id uuid REFERENCES clinics(id),
     created_at timestamp with time zone DEFAULT now(),
     updated_at timestamp with time zone DEFAULT now()
   );

   -- Create demands table
   CREATE TABLE demands (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     title text NOT NULL,
     description text NOT NULL,
     clinic_id uuid REFERENCES clinics(id) NOT NULL,
     required_specialties text[] NOT NULL DEFAULT '{}',
     start_date text,
     end_date text,
     workload text,
     compensation text,
     status text DEFAULT 'open',
     created_at timestamp with time zone DEFAULT now(),
     updated_at timestamp with time zone DEFAULT now()
   );

   -- Create applications table
   CREATE TABLE applications (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     demand_id uuid REFERENCES demands(id) NOT NULL,
     vet_id uuid REFERENCES vets(id) NOT NULL,
     message text,
     status text DEFAULT 'pending',
     created_at timestamp with time zone DEFAULT now(),
     updated_at timestamp with time zone DEFAULT now()
   );
   ```

5. **Configure Supabase Authentication**
   
   In your Supabase Dashboard:
   - Go to **Authentication** → **Providers**
   - Enable **Email** provider
   - **Disable** "Confirm email" for development (optional)

---

## 🏃 Running the Application

### Backend (API)

```bash
cd backend
npm run dev           # runs nodemon with ts-node
```

The API will be available at **http://localhost:3000**

### Frontend (Expo app)

```bash
cd frontend
npm run start         # open Expo CLI, choose platform (press w/i/a)
# or
npm run start:web     # launch web build only
npm run start:ios     # open iOS simulator (macOS + Xcode)
npm run start:android # open Android emulator or connected device
```

### Quick Start Commands

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend  
cd frontend && npm run start
```

---

## 📁 Project Structure

```
PetiVet/
├── backend/           # Express API (TypeScript)
│   ├── src/
│   │   ├── config/         # Supabase configuration
│   │   ├── controllers/    # Business logic
│   │   ├── routes/         # API routes
│   │   └── index.ts        # Server entry point
│   └── package.json
│
├── frontend/          # Expo project (React Native + web)
│   ├── App.tsx
│   ├── navigation/
│   ├── screens/
│   └── src/           # shared utilities/services, web styles
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

### Building native binaries

Expo Managed apps use EAS:
```bash
npx expo login
npx expo install expo-cli
npx eas build --platform ios
npx eas build --platform android
```
Requires linking an Expo account; follow CLI prompts to configure credentials and build profiles.

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

- `npm run dev` (backend) – hot reload API
- `npm run start` (frontend) – Expo dev server
- `npm run start:web` (frontend) – web build
- `npm test` (frontend) – Jest/React Testing Library

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

PetiVet Development Team

---

**Happy coding!** 🐾
