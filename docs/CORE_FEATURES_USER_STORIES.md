# PetiVet Core Feature Guide

This guide distills the product’s most important capabilities into user stories,
business rules, and operational cues that the team can rely on when planning or
QA-ing the platform.

## Personas

- **Clinic Admin (CADMIN)** – owns the clinic account, manages units, staff,
  and demand planning.
- **Clinic Staff (CMANAGER / CASSISTANT / CVET_INTERNAL)** – operates inside a
  clinic unit with delegated permissions.
- **Veterinarian (VET)** – independent professional looking for temporary or
  permanent shifts.
- **Platform Support/Admin (ADMIN)** – resolves support tickets, moderates
  marketplace activity, and maintains system health.
- **Marketplace Participant (SELLER/BUYER)** – any authenticated user posting
  or negotiating marketplace listings.

---

## 1. Access & Identity Management

### User Stories

- **CADMIN** – As a clinic owner, I register my clinic with legal identifiers so
  I can post demands under a verified profile.
- **CADMIN** – As the account owner, I invite staff to specific units so each
  team member has the access they need.
- **Clinic Staff** – As an invitee, I accept my tokenised invite so I can manage
  schedules without creating a duplicate account.
- **VET** – As a veterinarian, I sign up with my CRMV and specialties so
  clinics can trust my credentials.
- **ADMIN** – As platform support, I need audit trails for invitations and
  access changes so I can trace who touched what.

### Business Rules

- Clinic `cnpj` and `email` must be unique (`clinics` table).
- Vet `crmv` and `email` must be unique (`vets` table).
- Invitation tokens expire after 7 days; pending invitations block duplicates.
- Unit `nickname` is required, max 100 chars, and must be unique per clinic.
- `unit.create` and `user.invite` permissions are enforced for CADMIN roles
  through `checkPermission`.
- Authentication is backed by Supabase Auth; profile rows reuse the auth user
  `id` to guarantee a 1:1 mapping.
- In development, signup triggers a confirmation email resend to keep flows
  aligned with production.

### Operational Notes

- Audit logs capture user, clinic, unit, action, payload snapshot, and request
  metadata for each sensitive change.
- Invitation acceptance creates a `clinic_users` link and automatically marks
  the invitation as accepted.
- All role metadata is attached to the Supabase JWT, so downstream services can
  trust middleware checks.

---

## 2. Demand & Shift Planning

### User Stories

- **CADMIN** – As a clinic admin, I create standard or multi-position demands
  so I can staff upcoming shifts.
- **CADMIN/Clinic Staff** – As a scheduler, I assign demands to a specific unit
  to keep workloads tied to the correct location.
- **CADMIN** – As a planner, I want to specify required specialties, dates, and
  hours so candidates self-select appropriately.
- **VET** – As a professional, I browse open demands that match my specialty so
  I can plan my availability.
- **ADMIN** – As platform support, I need visibility into all demands, with
  filters by status or clinic, to investigate incidents.

### Business Rules

- Default demand status is `open`; valid states are `open`, `in_progress`,
  `closed`, `cancelled`.
- Composite demands require at least one position, unique specialty list per
  position, and `end_time` must be after `start_time`.
- Position repetitions: each position defines `total_slots`, `individual_payment`,
  optional description, and holds specialties via `position_specialties`.
- Demand updates cannot change `clinic_id`; restricted fields are stripped
  before persistence.
- Status changes trigger notifications for all applicants (legacy and composite
  flows).
- Deleting a demand is a soft delete (`status` flag) to preserve history.
- Every new demand broadcasts a `new_demand_created` notification to all active
  vets.

### Operational Notes

- `positions_with_availability` view powers vet-side availability screens with
  computed `available_slots`.
- Recent activity endpoints support dashboard cards (limit, unit filtering).
- Clinic stats aggregate demand counts per unit and status for CADMIN home
  screens.

---

## 3. Application & Hiring Flow

### User Stories

- **VET** – As a vet, I apply to a demand or a specific position so the clinic
  sees my interest and message.
- **CADMIN/Clinic Staff** – As a reviewer, I browse applicants per demand and
  unit to shortlist candidates quickly.
- **CADMIN** – As the hiring owner, I accept or reject applications so the
  demand progresses through its lifecycle.
- **VET** – As an applicant, I receive status updates so I know when to follow
  up or free my schedule.

### Business Rules

- Standard demand applications are stored in `applications` with status
  `applied` by default.
- Position applications live in `position_applications` and honour slot counts;
  vets cannot apply when no slots remain.
- A vet cannot message a marketplace participant or apply to a position without
  a valid Supabase-authenticated session (`req.user` checks).
- Accepting an application should move the demand toward `in_progress` (when
  implemented in reviewer flows).
- Notifications:
  - Clinics receive `application_received` when a vet applies.
  - Vets receive `application_accepted` / `application_rejected` (from the
    notifications controller when wired from reviewer actions).
- Pending application count endpoints power clinic dashboards and badge counts.

### Operational Notes

- Vet application feeds dedupe by fetching all clinic demand IDs first to keep
  Supabase queries efficient.
- Demand status updates collect vet IDs from both legacy (`applications`) and
  composite (`position_applications`) paths before notifying.
- Vet stats endpoint summarises total, pending, accepted, and completed jobs for
  career tracking.

---

## 4. Communication & Support

### User Stories

- **Clinic/Vet** – As a user, I open a support ticket when I hit a blocker so I
  can get help without leaving the app.
- **ADMIN** – As support staff, I reply to tickets and mark them as in progress
  so users know someone is working on them.
- **Clinic/Vet** – As a requester, I add follow-up messages and rate the ticket
  so the support team sees context and feedback.
- **Marketplace Participant** – As a buyer or seller, I chat about a listing so
  I can negotiate before closing a deal.

### Business Rules

- Ticket creation requires `message` ≥ 10 characters and valid `user_role`
  (`clinic` or `vet`).
- Ticket statuses: `open`, `in_progress`, `resolved`, `closed`; resolving stamps
  `resolved_at`.
- Messages require 5–1000 chars; once a ticket is evaluated it locks further
  messages.
- Admin replies flip `user_read` to `false` and create a `support_reply`
  notification for the requester.
- Evaluations enforce rating 1–5 and comment ≤ 500 chars, automatically marking
  the ticket as `resolved`.
- Marketplace messages enforce sender ≠ receiver, persist per listing, and
  update unread counts per conversation.

### Operational Notes

- Ticket threads are stored in `ticket_messages` with `read_by_receiver` flags
  for badge counts.
- `getUserTickets` hydrates last message, unread counts, and evaluations for the
  requester dashboard.
- Marketplace conversations group by item and other user; read receipts are
  batch-updated via message ID arrays.
- Support analytics (`getTicketsCount`) provide aggregates for admin dashboards.

---

## 5. Marketplace & Resource Exchange

### User Stories

- **SELLER** – As a clinic or vet, I post equipment listings so I can monetise
  idle assets.
- **BUYER** – As a marketplace visitor, I filter listings by category, price,
  or condition so I find relevant offers quickly.
- **SELLER** – As the author, I update or archive my listing so the catalogue
  stays accurate.
- **ADMIN** – As a moderator, I review all listings to ensure they comply with
  policy.

### Business Rules

- Required fields for listings: `title`, `description`, `seller_id`, `category`,
  `listing_type`. Sales require `condition` and `price`.
- Categories: `equipment`, `medicine`, `vaccine`, `supplies`, `other`; listing
  types: `sale` or `wanted`.
- Default status is `active`; sellers can retrieve all their listings ordered by
  recency.
- Buyers can filter by category, type, state, city, condition, min/max price,
  negotiable flag, and textual search (title/description).
- Sorting supports price ascending/descending; default order is newest first.
- Image uploads rely on `uploadMarketplaceImages`; deletions run through
  `deleteMarketplaceImages` to keep Supabase storage tidy.

### Operational Notes

- Conversations are decoupled from listings so archived listings retain chat
  history.
- Listing updates rely on auth middleware to ensure only owners mutate their
  records.
- Admin tooling can request all listings without filters for compliance sweeps.

---

## 6. Notifications, Insights & Dashboards

### User Stories

- **Any User** – I see unread counts so I know when something needs my
  attention.
- **CADMIN** – I review clinic stats (demands, applications, staff) to measure
  hiring performance.
- **VET** – I check my applicant metrics to understand pipeline and completed
  jobs.
- **ADMIN** – I audit system-wide metrics (clinics, vets, demands, marketplace)
  to keep leadership informed.

### Business Rules

- Notification types include: `application_received`, `application_accepted`,
  `application_rejected`, `support_reply`, `unit_invitation`,
  `marketplace_message`, `demand_status_changed`, `new_demand_created`.
- All notifications default to `read = false`; endpoints support pagination,
  unread-only filtering, and bulk mark-as-read.
- Unread counts are computed server-side using Supabase `count` queries for
  accuracy without over-fetching.
- Clinic stats scope by clinic and optional unit; vet stats aggregate accepted,
  pending, completed jobs, and available opportunities.

### Operational Notes

- Most write operations fire-and-forget notifications; failures are logged but
  do not block the main transaction.
- Dashboard cards lean on Supabase `head` counts to keep responses lightweight.
- Future review system hooks can extend vet stats (placeholder `averageRating`
  already returned).

---

## How to Use This Guide

1. **Product planning** – Validate new requirements against the existing user
   stories and rules before expanding scope.
2. **QA & support** – Use the business rules as acceptance criteria when
   triaging bugs or inconsistencies reported by clinics and vets.
3. **Onboarding** – Share with new team members so they quickly understand the
   critical flows without reading every controller.

