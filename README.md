# 🐾 PetiVet

**PetiVet** is a platform that connects veterinary clinics with veterinary professionals, streamlining the process of posting job demands and managing applications.

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
- **React** (Create React App) for web
- **TypeScript** for type safety
- **React Router** for navigation
- **Tailwind CSS** styling system
- Responsive design (mobile & desktop)

## 📁 Project Structure

```
PetiVet/
├── backend/                 # Express API server
│   ├── src/
│   │   ├── config/         # Supabase configuration
│   │   ├── controllers/    # Business logic
│   │   │   ├── authController.ts
│   │   │   ├── clinicsController.ts
│   │   │   ├── vetsController.ts
│   │   │   ├── demandsController.ts
│   │   │   └── applicationsController.ts
│   │   ├── routes/         # API routes
│   │   └── index.ts        # Server entry point
│   └── package.json
│
├── frontend/               # React web application
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   │   └── Navigation.tsx
│   │   ├── pages/         # Page components
│   │   │   ├── HomePage.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   ├── ClinicSignUpPage.tsx
│   │   │   ├── VetSignUpPage.tsx
│   │   │   ├── DemandsPage.tsx
│   │   │   ├── CreateDemandPage.tsx
│   │   │   └── MyApplicationsPage.tsx
│   │   ├── services/      # API integration
│   │   │   ├── api.ts
│   │   │   ├── clinicsApi.ts
│   │   │   ├── vetsApi.ts
│   │   │   ├── demandsApi.ts
│   │   │   └── applicationsApi.ts
│   │   └── App.tsx
│   └── package.json
│
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and **npm** 9+
- **Supabase** account and project
- macOS, Linux, or Windows with WSL

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd PetiVet
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Configure Supabase**
   
   Create a `.env` file in the `backend/` directory:
   ```env
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_KEY=your_supabase_anon_key
   PORT=3000
   ```

5. **Set up Supabase Database**

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

6. **Configure Supabase Authentication**
   
   In your Supabase Dashboard:
   - Go to **Authentication** → **Providers**
   - Enable **Email** provider
   - **Disable** "Confirm email" for development (optional)
   - Set **Site URL** to `http://localhost:3001`

## 🏃 Running the Application

### Start the Backend Server

```bash
cd backend
npm start
```

The API will be available at **http://localhost:3000**

### Start the Frontend (Web Only)

```bash
cd frontend
PORT=3001 npm run web
```

The web app will be available at **http://localhost:3001**

> **Note:** We use `PORT=3001` to avoid conflicts with the backend on port 3000.

### Quick Start Commands

```bash
# Terminal 1 - Backend
cd backend && npm start

# Terminal 2 - Frontend  
cd frontend && PORT=3001 npm run web
```

## 📱 Usage

### As a Clinic

1. **Sign Up** at `/clinic-signup`
   - Provide clinic name, CNPJ, address, email, and password
   
2. **Login** at `/login`
   - Use your registered email and password
   
3. **Create a Demand** 
   - Click "Nova Demanda" in the navigation
   - Fill in job details (title, description, specialties, dates, workload, compensation)
   
4. **View Demands**
   - See all posted demands at `/demands`

### As a Veterinarian

1. **Sign Up** at `/vet-signup`
   - Provide name, CRMV, specialties, experience, email, and password
   
2. **Login** at `/login`
   - Use your registered email and password
   
3. **Browse Demands** at `/demands`
   - View all open opportunities from clinics
   
4. **Apply to Demands**
   - Click "Candidatar-se" on any demand
   - Optionally write a message to the clinic
   
5. **Track Applications** at `/my-applications`
   - See all your applications and their status

## 🔑 API Endpoints

### Authentication
- `POST /auth/signup` - Create new user (used internally by clinics/vets routes)
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

## 🔧 Configuration

### Frontend Configuration

The frontend uses environment variables that can be set in your shell or added to a `.env` file:

```env
FAST_REFRESH=false  # Disables React Fast Refresh (fixes compilation errors)
PORT=3001           # Development server port
```

### Backend Configuration

Backend environment variables (`.env` file):

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
PORT=3000
```

## 🐛 Troubleshooting

### Frontend Issues

**Problem:** React-refresh compilation errors (14 errors)
```
Module not found: Error: You attempted to import .../react-refresh/runtime.js
```

**Solution:** Run with `FAST_REFRESH=false`:
```bash
cd frontend
FAST_REFRESH=false PORT=3001 npm run web
```

**Problem:** Port 3000 already in use

**Solution:** Use a different port:
```bash
PORT=3001 npm run web
```

### Backend Issues

**Problem:** "Invalid login credentials"

**Solution:** 
1. Make sure you've signed up first with the same email
2. Check if email confirmation is required in Supabase (disable for development)
3. Verify your Supabase credentials are correct

**Problem:** "invalid input syntax for type bigint"

**Solution:** Your database tables need to use `uuid` type for `id` columns, not `bigint`. Run the SQL schema provided in the Installation section.

### Authentication Issues

**Problem:** Email confirmation link expired

**Solution:** In Supabase Dashboard:
- Go to **Authentication** → **Providers** → **Email**
- Disable "Confirm email" for development

## 📚 Development

### Code Style

- TypeScript strict mode enabled
- ESLint configuration via Create React App
- Functional React components with hooks

### Adding New Features

1. **Backend**: Add controller → Add route → Register in `index.ts`
2. **Frontend**: Add service → Add page → Add route in `App.tsx`

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
