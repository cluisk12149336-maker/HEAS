ALTER TABLE IF EXISTS public.emergency_alerts
    ADD COLUMN IF NOT EXISTS responder_completion_report TEXT;

NOTIFY pgrst, 'reload schema';
