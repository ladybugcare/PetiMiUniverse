# Category and Specialties Implementation Guide

## Overview

This guide explains how to implement the new category and specialties features for demands.

## What's New

1. **Category Selection**: Clinics can now choose the type of professional they need:
   - Veterinário (Vet)
   - Freelancer (Groomer, Adestrador, Cuidador, etc.)
   - Outra Clínica (Another Clinic)
   - Outros Profissionais (Other Professionals)

2. **Specialties Dropdown**: Instead of typing specialties as free text, users can now select from predefined options that are filtered by category.

## Database Migration

### Step 1: Run the SQL Migration on Supabase

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Open the file `backend/database_migrations/petimi_vet/add_category_and_specialties.sql`
4. Copy and paste the entire SQL content into the Supabase SQL Editor
5. Click **Run** to execute the migration

This will:
- Add a `category` column to the `demands` table
- Create a new `specialties` table with predefined options
- Populate the table with common specialties for each category
- Create indexes for better performance

### Step 2: Verify Migration

Run this query in Supabase SQL Editor to verify:

```sql
-- Check if category column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'demands' AND column_name = 'category';

-- Check specialties table
SELECT category, COUNT(*) as count 
FROM specialties 
GROUP BY category 
ORDER BY category;
```

Expected results:
- `demands` table should have a `category` column
- `specialties` table should have entries for 'vet', 'freelancer', 'clinic', and 'other'

## Backend Changes

All backend changes have been implemented:

✅ **New Files Created:**
- `backend/src/controllers/specialtiesController.ts` - Handles specialty fetching
- `backend/src/routes/specialties.ts` - Routes for specialties API

✅ **Modified Files:**
- `backend/src/index.ts` - Registered specialties route
- `backend/src/controllers/demandsController.ts` - Updated to accept category field

✅ **New API Endpoints:**
- `GET /specialties` - Get all specialties
- `GET /specialties?category=vet` - Get specialties filtered by category
- `POST /demands/create` - Now accepts `category` and `required_specialties` array

## Frontend Changes

All frontend changes have been implemented:

✅ **New Files Created:**
- `frontend/src/services/specialtiesApi.ts` - Service to fetch specialties
- `frontend/src/components/MultiSelect.tsx` - Multi-select component with tags

✅ **Modified Files:**
- `frontend/src/services/demandsApi.ts` - Updated types to include category
- `frontend/src/pages/CreateDemandPage.tsx` - Added category dropdown and specialties multi-select

## Testing the Implementation

### 1. Start the Backend Server

```bash
cd backend
npm start
```

Backend should be running on `http://localhost:3000`

### 2. Start the Frontend

```bash
cd frontend
npm start
```

Frontend should be running on `http://localhost:3001`

### 3. Test the Feature

1. **Login as a Clinic**
2. **Navigate to "Criar Nova Demanda"**
3. **Test Category Selection**:
   - Select "Veterinário" - Should show vet specialties
   - Select "Freelancer" - Should show freelancer specialties
   - Select "Outra Clínica" - Should show clinic specialties
   - Select "Outros Profissionais" - Should show other specialties

4. **Test Multi-Select**:
   - Click on the specialties dropdown
   - Select multiple specialties using checkboxes
   - Selected items should appear as tags
   - Click X on a tag to remove it
   - Change category - selected specialties should clear

5. **Create a Demand**:
   - Fill all required fields
   - Submit the form
   - Check if demand was created successfully

### 4. Verify in Database

Check Supabase to see if the demand was created with the correct category and specialties:

```sql
SELECT id, title, category, required_specialties 
FROM demands 
ORDER BY created_at DESC 
LIMIT 5;
```

## API Testing with Postman/Insomnia

### Get All Specialties
```
GET http://localhost:3000/specialties
```

### Get Specialties by Category
```
GET http://localhost:3000/specialties?category=vet
GET http://localhost:3000/specialties?category=freelancer
```

### Create Demand with Category
```
POST http://localhost:3000/demands/create
Content-Type: application/json

{
  "title": "Veterinário para Cirurgia",
  "description": "Precisamos de um veterinário especializado",
  "clinic_id": "your-clinic-id",
  "category": "vet",
  "required_specialties": ["Cirurgia", "Anestesiologia"],
  "start_date": "2025-11-01",
  "workload": "40h semanais",
  "compensation": "R$ 5000"
}
```

## Adding New Specialties

To add new specialties to the system:

1. Go to Supabase SQL Editor
2. Run:

```sql
INSERT INTO specialties (name, category, description) VALUES
  ('Nova Especialidade', 'vet', 'Descrição da especialidade')
ON CONFLICT (name) DO NOTHING;
```

## Troubleshooting

### Issue: "Column category does not exist"
**Solution**: Run the database migration SQL script in Supabase.

### Issue: "Specialties dropdown is empty"
**Solution**: 
1. Check if specialties table has data: `SELECT * FROM specialties;`
2. Check browser console for API errors
3. Verify backend is running and `/specialties` endpoint is accessible

### Issue: "Cannot create demand - validation error"
**Solution**: Ensure all required fields are filled, including category and at least one specialty.

### Issue: "Selected specialties disappear when changing category"
**Solution**: This is expected behavior - specialties are category-specific and reset when category changes.

## Features Summary

### Category Options
- **Veterinário**: For veterinary professionals
- **Freelancer**: For groomers, trainers, pet sitters, etc.
- **Outra Clínica**: For clinic-to-clinic services
- **Outros Profissionais**: For other pet care professionals

### Specialty Counts by Category
- Veterinário: 15 specialties
- Freelancer: 8 specialties  
- Outra Clínica: 4 specialties
- Outros Profissionais: 3 specialties

### Benefits
✅ Better UX - No typos, consistent naming
✅ Filtering - Relevant specialties per category
✅ Analytics - Track most demanded specialties
✅ Scalability - Easy to add new specialties
✅ Validation - Ensures valid categories and specialties

## Next Steps

1. ✅ Run database migration
2. ✅ Test the feature thoroughly
3. 🔄 Consider adding specialty icons for better UX
4. 🔄 Add ability for admins to manage specialties via UI
5. 🔄 Implement filtering demands by category on DemandsPage
6. 🔄 Show category badges on demand cards
7. 🔄 Add analytics dashboard for popular specialties

## Support

If you encounter any issues, check:
1. Database migration was successful
2. Backend server is running
3. Frontend is connected to correct API URL
4. Browser console for error messages
5. Network tab to see API responses

