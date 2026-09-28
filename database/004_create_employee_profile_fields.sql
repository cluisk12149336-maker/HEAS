-- Migration 004: Create Employee Profile Fields
-- Description: Adds username, avatar_url, and department to employee_accounts for profile management
-- Date: 2026-09-23
-- Status: Enhances employee_accounts with custom profile customization

-- Task: Add profile fields to employee_accounts if they don't already exist
ALTER TABLE IF EXISTS public.employee_accounts 
    ADD COLUMN IF NOT EXISTS username VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL,
    ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT 'System Administrator';

-- Create unique index on username
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_accounts_username 
    ON public.employee_accounts (username) 
    WHERE username IS NOT NULL;

-- Create index on department
CREATE INDEX IF NOT EXISTS idx_employee_accounts_department 
    ON public.employee_accounts (department);

-- Comment documentation
COMMENT ON COLUMN public.employee_accounts.username IS 'Custom username for administrator/staff profiles.';
COMMENT ON COLUMN public.employee_accounts.avatar_url IS 'Public URL or local path to the user profile avatar picture.';
COMMENT ON COLUMN public.employee_accounts.department IS 'Department or organizational division for the employee account.';

-- Seed default username for ADM-ADM00001 if existing
UPDATE public.employee_accounts 
SET username = 'admin_joleh',
    avatar_url = '/images/default-avatar.png',
    department = 'System Administrator'
WHERE employee_id = 'ADM-ADM00001' AND (username IS NULL OR username = '');
