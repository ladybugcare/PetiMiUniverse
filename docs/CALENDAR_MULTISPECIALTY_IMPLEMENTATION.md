# Calendar and Multi-Specialty Implementation Summary

## Overview
This implementation enhances the `/create-demand` form with:
1. **Custom Inline Calendar Widget** - Replaces the date input field
2. **Reorganized Date/Time Layout** - Calendar on left (60%), times stacked on right (40%)
3. **Multiple Specialties per Position** - Using MultiSelect component
4. **Updated Terminology** - "Posição" → "Profissional" throughout
5. **Database Junction Table** - Supports multiple specialties per position

## Files Modified

### Backend
1. **`backend/database_migrations/add_position_specialties_junction_table.sql`** (NEW)
   - Creates `position_specialties` junction table
   - Migrates existing data
   - Updates `positions_with_availability` view to include specialties array
   - Maintains backward compatibility with old `specialty` column

2. **`backend/src/controllers/demandPositionsController.ts`**
   - Updated `createCompositeDemand()` to accept `specialties: string[]`
   - Inserts into both `demand_positions` and `position_specialties` tables
   - Updated `getDemandWithPositions()` to fetch specialties from junction table
   - Validates that each position has at least one specialty

### Frontend Components
3. **`frontend/src/components/InlineCalendar.tsx`** (NEW)
   - Custom calendar widget with month navigation
   - Highlights selected date in purple (#7c3aed)
   - Disables past dates
   - Hover effects on available dates
   - Portuguese month names and weekdays

4. **`frontend/src/components/DemandFormStep.tsx`**
   - Imports and uses `InlineCalendar` component
   - New layout: calendar (60%) + stacked time inputs (40%)
   - Updated positions state to use `specialties: string[]`
   - Passes `category` prop to `DemandPositionsForm`
   - Updated validation and form submission

5. **`frontend/src/components/DemandPositionsForm.tsx`**
   - Changed `Position` interface: `specialty` → `specialties: string[]`
   - Replaced dropdown with `MultiSelect` component
   - Loads specialties filtered by category
   - All "Posição" text changed to "Profissional"
   - Validates that at least one specialty is selected

### Frontend Services/Types
6. **`frontend/src/services/demandPositionsApi.ts`**
   - Updated `DemandPosition` interface to include `specialties?: string[]`
   - Updated `CreatePositionData` to require `specialties: string[]`
   - Maintains `specialty` field for backward compatibility

## Database Migration Steps

### Step 1: Run the SQL Migration
Open Supabase Dashboard → SQL Editor and execute:

```sql
-- Copy and paste the entire contents of:
backend/database_migrations/add_position_specialties_junction_table.sql
```

This will:
- Create the `position_specialties` table
- Migrate existing single specialties to the junction table
- Update the `positions_with_availability` view
- Create necessary indexes

### Step 2: Verify Migration
Run these verification queries:

```sql
-- Check table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'position_specialties'
ORDER BY ordinal_position;

-- Check migrated data
SELECT dp.id, dp.specialty as old_specialty, 
       json_agg(ps.specialty_name) as new_specialties
FROM demand_positions dp
LEFT JOIN position_specialties ps ON ps.position_id = dp.id
GROUP BY dp.id, dp.specialty;

-- Check updated view
SELECT * FROM positions_with_availability LIMIT 5;
```

## Testing Checklist

### Frontend Testing
- [ ] Navigate to `/create-demand`
- [ ] Select a category (e.g., "Veterinário")
- [ ] Verify the inline calendar displays correctly
- [ ] Click on a date in the calendar - should highlight in purple
- [ ] Try clicking on a past date - should be disabled (grayed out)
- [ ] Navigate between months using arrow buttons
- [ ] Select start and end times using the inputs on the right
- [ ] Add a professional position
- [ ] Click on the "Especialidades" field
- [ ] Verify dropdown shows specialties filtered by category
- [ ] Select multiple specialties (should show as tags)
- [ ] Remove a specialty by clicking the × on the tag
- [ ] Add another professional using "➕ Adicionar Outro Profissional"
- [ ] Verify summary shows correct counts
- [ ] Submit the form
- [ ] Check success message

### Backend Testing
After creating a demand, verify in Supabase:

```sql
-- Check the created demand
SELECT * FROM demands 
ORDER BY created_at DESC 
LIMIT 1;

-- Check the positions
SELECT * FROM demand_positions 
WHERE master_demand_id = 'YOUR_DEMAND_ID';

-- Check the specialties (should have multiple rows if you selected multiple)
SELECT ps.*, dp.master_demand_id
FROM position_specialties ps
JOIN demand_positions dp ON ps.position_id = dp.id
WHERE dp.master_demand_id = 'YOUR_DEMAND_ID';
```

### Category-Specific Testing
Test with each category to ensure correct specialties load:

1. **Veterinário** - Should show: Clínico Geral, Cirurgião, Anestesista, etc.
2. **Freelancer** - Should show: Grooming, Adestramento, Passeador, etc.
3. **Clínica Parceira** - Should show: Clínica Geral, Hospital Veterinário, etc.
4. **Outros Profissionais** - Should show: Consultoria, Pesquisa, Educação

## Key Features

### Calendar Component
- **Visual Design**: Clean, modern calendar grid
- **Month Navigation**: Previous/Next month buttons
- **Date Selection**: Click to select, shows in purple
- **Date Restrictions**: Past dates are disabled and grayed out
- **Hover Effects**: Available dates change color on hover
- **Portuguese UI**: All text in Portuguese (months, weekdays)

### Multiple Specialties
- **MultiSelect Component**: Reuses existing component
- **Tag Display**: Selected specialties show as purple tags
- **Easy Removal**: Click × on tag to remove specialty
- **Category Filtered**: Only shows relevant specialties
- **Validation**: Must select at least one specialty

### Database Design
- **Junction Table**: Supports many-to-many relationship
- **Backward Compatible**: Keeps old `specialty` column
- **Efficient Queries**: Proper indexes on foreign keys
- **Data Integrity**: Cascade deletes on position removal

## Troubleshooting

### Issue: Calendar doesn't display
**Solution**: Check that `InlineCalendar` component is imported correctly in `DemandFormStep.tsx`

### Issue: Specialties dropdown is empty
**Solution**: 
1. Verify category is being passed correctly to `DemandPositionsForm`
2. Check browser console for API errors
3. Verify backend is running and `/specialties` endpoint works

### Issue: Can't submit form - validation error
**Possible Causes**:
- No date selected (calendar requires selection)
- End time before start time
- Position without specialties selected
- Slots or payment value invalid

### Issue: Database error when creating demand
**Solutions**:
1. Ensure migration was run successfully
2. Check that `position_specialties` table exists
3. Verify foreign key constraints are in place

### Issue: Old demands don't show specialties array
**Expected Behavior**: Old demands will show empty specialties array since they used the old single specialty field. This is normal and backward compatible.

## Next Steps

### Optional Enhancements
1. **Calendar Enhancements**:
   - Add "Today" button to jump to current month
   - Show calendar indicators for dates with existing demands
   - Add keyboard navigation (arrow keys)

2. **Specialty Management**:
   - Add specialty descriptions on hover
   - Show specialty icons/emojis
   - Allow adding custom specialties

3. **Mobile Responsiveness**:
   - Stack calendar and time inputs vertically on small screens
   - Make calendar touch-friendly
   - Optimize MultiSelect for mobile

## API Endpoint Changes

### POST `/demand-positions/composite`
**Before**:
```json
{
  "positions": [
    {
      "specialty": "Anestesista",
      "slots": 1,
      "payment": 500
    }
  ]
}
```

**After**:
```json
{
  "positions": [
    {
      "specialties": ["Anestesista", "Cirurgião"],
      "slots": 1,
      "payment": 500
    }
  ]
}
```

### GET `/demand-positions/demands/:demand_id/positions`
**Response now includes**:
```json
{
  "demand": {...},
  "positions": [
    {
      "id": "...",
      "specialty": "Anestesista",
      "specialties": ["Anestesista", "Cirurgião"],
      ...
    }
  ]
}
```

## Notes

- The system maintains backward compatibility with existing demands
- All category types (vet, freelancer, clinic, other) now support multiple specialties
- The first specialty in the array is stored in the legacy `specialty` column
- Specialties are automatically filtered by the selected demand category
- The calendar initializes to the selected date or current month if no date is selected

## Support

For issues or questions:
1. Check the browser console for JavaScript errors
2. Check the backend logs for API errors
3. Verify database migration was successful
4. Review this implementation guide

