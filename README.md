# Bizomiq BMS

Internal CRM for leads, clients, projects, tasks and follow-ups.

React + TypeScript + Vite, Tailwind CSS v4, shadcn/ui, Lucide, Supabase (Postgres + Auth), SheetJS.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_PUBLISHABLE_KEY`
   (Supabase dashboard → Project Settings → API Keys → publishable key).
   Never use a `service_role` / secret key in this app.
3. Database: the project started from an earlier schema (`init_bms_schema`, applied
   2026-10-08, not in this repo). The migrations in `supabase/migrations/` apply on top
   of it, in filename order.
4. Supabase dashboard → Authentication: disable public sign-ups, then create users.
5. Add each user to the team allowlist (SQL editor):

   ```sql
   insert into public.team_members (user_id, email, role)
   select id, email, 'admin' from auth.users where email = 'you@bizomiq.com';
   ```

   Link each login to its "Handled by" name (Srikar, Nikhil or Jethin) so new
   leads default to that person and "Handled by me" works:

   ```sql
   update public.team_members set name = 'Jethin' where email = 'jethin@example.com';
   ```

6. `npm run dev`

## Access model

Signed-in users see nothing unless they are in `public.team_members`. Every table has
RLS enabled; policies allow `authenticated` team members to read/write shared CRM data.
**Known gap:** the legacy tables (leads, clients, projects, tasks, followups, activities,
tags, lead_tags) still have "Allow anon all" policies from the original schema, so the
publishable key alone can read and write them. Drop those policies once nothing else
depends on them (see the header of `20261009130000_reconcile_crm.sql`). Tables added
by this repo (`team_members`, `import_templates`, `lead_categories`) give anon nothing.

## Layout

```
src/
  components/ui/   shadcn/ui components (generated; avoid hand edits)
  features/        one folder per area (auth, leads, settings, ...)
    leads/         leads list (All / Normal / Green), categories, Excel import
  lib/             supabase client, shared types, utilities
supabase/migrations/  SQL schema, indexes and RLS policies
```

## Scripts

- `npm run dev` – dev server
- `npm run build` – type-check and production build
- `npm run lint` – oxlint
