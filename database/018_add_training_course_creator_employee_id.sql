-- Store the application's employee account identifier separately from
-- created_by, which remains a UUID reference to Supabase Auth users.
ALTER TABLE public.training_courses
  ADD COLUMN IF NOT EXISTS assigned_trainer text NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_by_employee_id text NULL;

