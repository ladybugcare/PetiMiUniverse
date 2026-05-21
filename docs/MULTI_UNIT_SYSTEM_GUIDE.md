# Multi-Unit Clinic Management System - Implementation Guide

## 📋 Overview

The Multi-Unit Clinic Management System allows clinics to:
- Create and manage multiple units (branches/locations)
- Invite and manage team members with different roles
- Control access with role-based permissions
- Track all administrative actions with audit logs
- Maintain separate data per unit while sharing the same clinic account

---

## 🚀 Getting Started

### 1. Database Setup

Run the migrations in the following order:

```bash
# 1. Create the core tables
psql -U your_user -d your_database -f backend/database_migrations/create_units_and_permissions_system.sql

# 2. Migrate existing clinics (if applicable)
psql -U your_user -d your_database -f backend/database_migrations/migrate_existing_clinics_to_units.sql
```

### 2. Backend Setup

The backend is already configured with:
- ✅ Permission system (`backend/src/utils/permissions.ts`)
- ✅ Audit logging (`backend/src/utils/auditLog.ts`)
- ✅ Email service for invitations (`backend/src/utils/emailService.ts`)
- ✅ Authentication middleware (`backend/src/middleware/authMiddleware.ts`)
- ✅ Units controller (`backend/src/controllers/unitsController.ts`)
- ✅ Clinic users controller (`backend/src/controllers/clinicUsersController.ts`)
- ✅ API routes registered in `backend/src/index.ts`

**Important**: Configure email service in `backend/src/utils/emailService.ts` for production use.

### 3. Frontend Setup

The frontend is already configured with:
- ✅ Unit context for global state (`frontend/src/contexts/UnitContext.tsx`)
- ✅ Permissions hook (`frontend/src/hooks/usePermissions.tsx`)
- ✅ Unit selector component integrated in dashboard header
- ✅ Management pages for units and users
- ✅ Invitation acceptance flow
- ✅ Routes configured in `frontend/src/App.tsx`

---

## 🎯 User Roles & Permissions

### Role Hierarchy

| Role | Code | Description |
|------|------|-------------|
| **Administrador da Clínica** | `CADMIN` | Full access to all units and settings |
| **Gestor de Unidade** | `CMANAGER` | Manages a specific unit, can invite users |
| **Assistente/Secretário** | `CASSISTANT` | Limited access, can view and create |
| **Veterinário Interno** | `CVET_INTERNAL` | Can view and apply to internal demands |

### Permission Matrix

```
Permission              CADMIN  CMANAGER  CASSISTANT  CVET_INTERNAL
─────────────────────────────────────────────────────────────────────
unit.create               ✅       ❌         ❌            ❌
unit.edit                 ✅       ✅         ❌            ❌
unit.delete               ✅       ❌         ❌            ❌
unit.view.all             ✅       ✅         ✅            ✅

user.invite               ✅       ✅         ❌            ❌
user.edit                 ✅       ✅         ❌            ❌
user.delete               ✅       ❌         ❌            ❌
user.view.all             ✅       ✅         ✅            ❌

demand.create             ✅       ✅         ✅            ❌
demand.edit               ✅       ✅         ❌            ❌
demand.delete             ✅       ✅         ❌            ❌
demand.view.all           ✅       ✅         ✅            ✅

application.approve       ✅       ✅         ❌            ❌
application.reject        ✅       ✅         ❌            ❌
application.view.all      ✅       ✅         ✅            ❌

marketplace.create        ✅       ✅         ❌            ❌
marketplace.edit          ✅       ✅         ❌            ❌
marketplace.delete        ✅       ❌         ❌            ❌

audit.view                ✅       ❌         ❌            ❌
```

---

## 📖 Usage Workflows

### 1. Creating a New Unit

**Who**: CADMIN only

**Steps**:
1. Navigate to `/units`
2. Click "Nova Unidade"
3. Fill in unit details:
   - Name (required)
   - CNPJ (optional)
   - Address (required)
   - City/State (required)
   - Phone (optional)
   - Technical Manager (optional)
4. Click "Salvar"

**Backend**:
```typescript
POST /units/create
{
  "clinic_id": "uuid",
  "name": "Filial Alphaville",
  "cnpj": "12.345.678/0001-90",
  "address": "Rua Example, 123",
  "city": "Barueri",
  "state": "SP",
  "phone": "(11) 98765-4321",
  "technical_manager": "Dr. João Silva"
}
```

### 2. Inviting a User

**Who**: CADMIN, CMANAGER

**Steps**:
1. Navigate to `/users`
2. Click "Convidar Usuário"
3. Enter user details:
   - Email
   - Unit
   - Role
4. Click "Enviar Convite"
5. User receives email with invitation link

**Backend**:
```typescript
POST /clinic-users/invite
{
  "email": "usuario@example.com",
  "clinic_id": "uuid",
  "unit_id": "uuid",
  "role": "CMANAGER"
}
```

### 3. Accepting an Invitation

**User Experience**:
1. User receives email with link: `https://app.petivet.com/accept-invitation?token=ABC123`
2. User clicks link
3. If not logged in, redirected to login page
4. If logged in, invitation is accepted automatically
5. User gains access to the clinic/unit

**Backend**:
```typescript
POST /clinic-users/accept-invitation
{
  "token": "ABC123"
}
```

### 4. Switching Between Units

**Who**: Any user with access to multiple units

**Steps**:
1. In dashboard header, click the "Unidade" dropdown
2. Select desired unit
3. All data refreshes to show selected unit's data

**Frontend**:
```typescript
const { selectedUnit, setSelectedUnit, units } = useUnit();

// Change unit
setSelectedUnit(newUnit);
```

### 5. Creating a Demand (with Unit)

**Who**: Users with `demand.create` permission

**Important**: Demands are now linked to a specific unit.

**Backend Update**:
```typescript
POST /demands/create
{
  "title": "Veterinário para atendimento",
  "description": "...",
  "clinic_id": "uuid",
  "unit_id": "uuid",  // 🆕 New field
  "category": "vet",
  "required_specialties": ["clinica_geral"],
  "demand_date": "2025-11-15",
  "start_time": "14:00",
  "duration_hours": 4
}
```

---

## 🔐 Security Considerations

### Authentication Flow

1. User logs in → JWT token issued
2. Token includes user_id
3. Every request includes token in `Authorization: Bearer <token>` header
4. Middleware verifies token and extracts user_id
5. Controllers check permissions before executing actions

### Permission Checks

```typescript
// In controller
const hasPermission = await checkPermission(user_id, clinic_id, 'unit.create');
if (!hasPermission) {
  return res.status(403).json({ error: 'Permissão negada' });
}
```

### Audit Logging

All critical actions are logged:
```typescript
await createAuditLog({
  user_id,
  clinic_id,
  unit_id,
  action: 'CREATE_UNIT',
  entity_type: 'unit',
  entity_id: unit.id,
  new_values: unit,
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
});
```

---

## 🧪 Testing Checklist

### Backend Tests

- [ ] Create unit (CADMIN)
- [ ] Update unit (CADMIN, CMANAGER)
- [ ] Delete unit (CADMIN only, not main unit)
- [ ] Invite user (CADMIN, CMANAGER)
- [ ] Accept invitation
- [ ] Cancel invitation
- [ ] Remove user (CADMIN only)
- [ ] Permission checks for all roles
- [ ] Audit log entries created

### Frontend Tests

- [ ] Unit selector appears when multiple units exist
- [ ] Switching units refreshes data
- [ ] Units management page CRUD operations
- [ ] Users management page invite/remove
- [ ] Accept invitation page flow
- [ ] Permissions hide/show UI elements correctly
- [ ] Dashboard integrations work with units

---

## 🐛 Troubleshooting

### Issue: User can't see units dropdown

**Solution**: 
1. Check if user has multiple units in database
2. Verify `UnitProvider` is wrapping the app in `App.tsx`
3. Check browser console for errors

### Issue: "Permissão negada" error

**Solution**:
1. Check user's role in `clinic_users` table
2. Verify permission in `PERMISSIONS` object matches required permission
3. Check if user is active (`status = 'active'`)

### Issue: Invitation email not sending

**Solution**:
1. Configure email service in `backend/src/utils/emailService.ts`
2. Check console logs for email details (dev mode)
3. Verify SMTP credentials and environment variables

### Issue: Unit_id is null on demands

**Solution**:
1. Run migration script: `migrate_existing_clinics_to_units.sql`
2. Verify demands controller includes `unit_id` in inserts
3. Check frontend passes `unit_id` when creating demands

---

## 📊 Database Schema Reference

### Key Tables

```
units
├── id (uuid, PK)
├── clinic_id (uuid, FK → clinics)
├── name (text)
├── cnpj (text)
├── address (text)
├── city (text)
├── state (text)
├── phone (text)
├── technical_manager (text)
├── is_main (boolean)
└── status (text: active, inactive)

clinic_users
├── id (uuid, PK)
├── user_id (uuid, FK → auth.users)
├── clinic_id (uuid, FK → clinics)
├── unit_id (uuid, FK → units)
├── role (text: CADMIN, CMANAGER, CASSISTANT, CVET_INTERNAL)
├── status (text: active, inactive, pending)
├── invited_by (uuid, FK → auth.users)
├── invited_at (timestamp)
└── accepted_at (timestamp)

user_invitations
├── id (uuid, PK)
├── email (text)
├── clinic_id (uuid, FK → clinics)
├── unit_id (uuid, FK → units)
├── role (text)
├── invited_by (uuid, FK → auth.users)
├── token (text, unique)
├── expires_at (timestamp)
└── status (text: pending, accepted, expired, cancelled)

audit_logs
├── id (uuid, PK)
├── user_id (uuid, FK → auth.users)
├── clinic_id (uuid, FK → clinics)
├── unit_id (uuid, FK → units)
├── action (text)
├── entity_type (text)
├── entity_id (uuid)
├── old_values (jsonb)
├── new_values (jsonb)
├── ip_address (inet)
├── user_agent (text)
└── created_at (timestamp)
```

---

## 🎉 Next Steps

1. **Configure Email Service**: Update `emailService.ts` with production credentials
2. **Run Migrations**: Execute SQL scripts on production database
3. **Test Thoroughly**: Use testing checklist above
4. **Monitor Audit Logs**: Check logs regularly for suspicious activity
5. **User Training**: Train clinic admins on new features
6. **Documentation**: Share this guide with your team

---

## 📞 Support

For questions or issues:
- Check the troubleshooting section
- Review audit logs for permission issues
- Contact development team with specific error messages

---

**Version**: 1.0.0  
**Last Updated**: October 29, 2025  
**Author**: PetMi Vet Development Team

