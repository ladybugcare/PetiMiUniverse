# Multi-Step Demand Creation Implementation Guide

## Overview

This implementation adds a beautiful 2-step demand creation flow and role-based demand filtering.

## ✅ What's Been Implemented

### 1. Database Changes
- Added `demand_date`, `start_time`, and `duration_hours` columns to demands table
- Migration file: `backend/database_migrations/petimi_vet/add_datetime_fields.sql`

### 2. Backend Updates
✅ Updated `DemandBody` interface with date/time fields
✅ Added role-based filtering to `getDemands` endpoint
✅ Demands now ordered by `demand_date` ascending

### 3. Frontend Components

#### New Components Created:
1. **CategorySelectionStep** - Beautiful card-based category selection
   - 4 category cards with custom colors and icons
   - Hover animations
   - Smooth transitions

2. **DemandFormStep** - Dynamic form with colored header
   - Header color changes based on category
   - Auto-loads specialties for selected category
   - Date, time, and duration fields (required)
   - Back button to return to category selection

3. **CreateDemandPage** - Refactored to multi-step flow
   - Step 1: Choose category
   - Step 2: Fill form
   - Similar UX to signup flow

### 4. Frontend Updates
✅ Updated Demand types with date/time fields
✅ demandsApi now supports role-based filtering
✅ DemandsPage filters demands by user role automatically

## 🚀 Getting Started

### Step 1: Run Database Migration

Open Supabase Dashboard → SQL Editor and run:

```sql
-- Copy content from backend/database_migrations/petimi_vet/add_datetime_fields.sql
ALTER TABLE demands 
ADD COLUMN IF NOT EXISTS demand_date date NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS start_time time NOT NULL DEFAULT '09:00:00',
ADD COLUMN IF NOT EXISTS duration_hours numeric(4,2) NOT NULL DEFAULT 8.0;

UPDATE demands 
SET demand_date = CURRENT_DATE,
    start_time = '09:00:00',
    duration_hours = 8.0
WHERE demand_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_demands_demand_date ON demands(demand_date);
```

### Step 2: Restart Backend Server

```bash
cd backend
npm start
```

### Step 3: Test the New Flow

1. Login as a clinic
2. Go to "Criar Nova Demanda"
3. You'll see the category selection screen with 4 cards
4. Click on a category (e.g., "Buscar Veterinário")
5. Fill the form with:
   - Title
   - Description
   - Specialties (auto-filtered by category)
   - **Date** (required)
   - **Time** (required)
   - **Duration in hours** (required)
   - Compensation (optional)
6. Click "Criar Demanda"

## 🎨 Category Colors & Gradients

### Veterinário (Purple)
- Color: `#7c3aed`
- Gradient: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`

### Freelancer (Orange/Pink)
- Color: `#f59e0b`
- Gradient: `linear-gradient(135deg, #f093fb 0%, #f5576c 100%)`

### Clínica (Blue)
- Color: `#0ea5e9`
- Gradient: `linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)`

### Outros (Green)
- Color: `#22c55e`
- Gradient: `linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)`

## 🔒 Role-Based Filtering

### How It Works:
- **Vets** only see demands with `category = 'vet'`
- **Freelancers** only see demands with `category = 'freelancer'`
- **Clinics** only see demands with `category = 'clinic'`
- **Others** see all demands (or filter by 'other')

### Implementation:
Backend filters demands in `getDemands` endpoint:
```typescript
if (user_role === 'vet') {
  query = query.eq('category', 'vet')
}
```

Frontend passes user role to API:
```typescript
const demandsResult = await demandsApi.getOpen(userRole);
```

## 📋 Required Fields

All demands now require:
- ✅ Title
- ✅ Description
- ✅ Category (selected in step 1)
- ✅ At least one specialty
- ✅ **Date** (when the work is needed)
- ✅ **Start time** (what time to start)
- ✅ **Duration** (how many hours)

Optional:
- Compensation/payment

## 🧪 Testing Scenarios

### Test 1: Category Selection
1. Open /create-demand
2. Verify you see 4 category cards
3. Hover over each card - should show color border and lift effect
4. Click a category - should transition to form

### Test 2: Dynamic Header
1. Select "Veterinário" - header should be purple
2. Go back and select "Freelancer" - header should be orange/pink
3. Go back and select "Clínica" - header should be blue
4. Go back and select "Outros" - header should be green

### Test 3: Specialty Filtering
1. Select "Veterinário" category
2. Open specialties dropdown
3. Should only show vet specialties (Cirurgia, Clínica Geral, etc.)
4. Go back and select "Freelancer"
5. Should only show freelancer specialties (Grooming, Adestramento, etc.)

### Test 4: Required Fields
1. Try to submit form without filling date - should show validation error
2. Try without time - should show validation error
3. Try without duration - should show validation error
4. Fill all required fields - should create successfully

### Test 5: Role-Based Filtering
1. As clinic, create a vet demand
2. Login as vet
3. Go to /demands
4. Should only see vet demands (not freelancer or clinic demands)
5. Login as freelancer
6. Should only see freelancer demands

## 🔄 Migration from Old System

If you have existing demands:
- They will automatically get default values:
  - `demand_date`: Current date
  - `start_time`: 09:00:00
  - `duration_hours`: 8.0

## 🐛 Troubleshooting

### "Column demand_date does not exist"
**Solution:** Run the database migration in Supabase.

### Specialties dropdown is empty
**Solution:** Make sure you ran the specialties migration earlier.

### Can't see any demands
**Solution:** Check your user role and verify demands exist for that category.

### Form doesn't show date/time fields
**Solution:** Clear browser cache and refresh.

## 📊 Benefits of New System

✅ **Better UX** - Clear 2-step process similar to signup
✅ **Visual clarity** - Color-coded categories
✅ **Specific scheduling** - Exact date, time, and duration
✅ **Privacy** - Role-based visibility
✅ **No confusion** - Category-specific messaging
✅ **Professional** - Beautiful gradients and animations

## 🎯 Next Steps (Optional Enhancements)

1. Add bulk demand creation (create multiple demands at once)
2. Add calendar view for demands
3. Show demand duration on demand cards
4. Add category badges/icons to demand cards
5. Filter demands by date range
6. Add "urgent" flag for same-day demands

## 📁 Files Created/Modified

### New Files:
- `backend/database_migrations/petimi_vet/add_datetime_fields.sql`
- `frontend/src/components/CategorySelectionStep.tsx`
- `frontend/src/components/DemandFormStep.tsx`
- `MULTI_STEP_DEMAND_GUIDE.md`

### Modified Files:
- `backend/src/controllers/demandsController.ts`
- `frontend/src/services/demandsApi.ts`
- `frontend/src/pages/CreateDemandPage.tsx`
- `frontend/src/pages/DemandsPage.tsx`

## ✅ Completion Checklist

- [x] Database migration created
- [x] Backend updated with date/time fields
- [x] Backend role-based filtering implemented
- [x] CategorySelectionStep component created
- [x] DemandFormStep component created
- [x] CreateDemandPage refactored to multi-step
- [x] DemandsPage updated with role filtering
- [x] All linter errors fixed
- [ ] Database migration run in Supabase (DO THIS NOW!)
- [ ] Tested category selection
- [ ] Tested form submission
- [ ] Tested role-based filtering

Ready to test! 🚀

