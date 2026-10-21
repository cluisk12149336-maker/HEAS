-- Allow Trainer when changing employee roles in public.employee_accounts.
ALTER TABLE public.employee_accounts
    DROP CONSTRAINT IF EXISTS chk_employee_accounts_role,
    ADD CONSTRAINT chk_employee_accounts_role
    CHECK (employee_role IN ('HEAD', 'System Admin', 'Responder', 'Trainer'));
