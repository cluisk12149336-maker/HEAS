ALTER TABLE public.employee_accounts
ADD COLUMN IF NOT EXISTS employee_last_logout TIMESTAMP WITHOUT TIME ZONE NULL;