-- Migration 007: Update student status check constraint to include Disapproved
-- Date: 2026-09-27
-- Description: Updates chk_accounts_student_status check constraint on accounts_student to allow 'Disapproved'

ALTER TABLE IF EXISTS public.accounts_student 
    DROP CONSTRAINT IF EXISTS chk_accounts_student_status;

ALTER TABLE IF EXISTS public.accounts_student 
    ADD CONSTRAINT chk_accounts_student_status 
    CHECK (student_status IN ('Active', 'Inactive', 'Suspended', 'Pending', 'Disapproved'));
