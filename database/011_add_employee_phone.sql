-- Migration 011: Add employee_phone column to employee_accounts
-- Description: Adds employee_phone to employee_accounts for responder contact number tracking
-- Date: 2026-09-28

ALTER TABLE IF EXISTS public.employee_accounts 
    ADD COLUMN IF NOT EXISTS employee_phone VARCHAR(50) NULL;

COMMENT ON COLUMN public.employee_accounts.employee_phone IS 'Primary contact or telephone number for responders and staff.';

-- Seed default contact number for Sophia Bantay (Responder)
UPDATE public.employee_accounts 
SET employee_phone = '0917-888-5053'
WHERE employee_email = 'sbantay.k12150533@umak.edu.ph' OR employee_role = 'Responder';
