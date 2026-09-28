ALTER TABLE IF EXISTS public.emergency_alerts
ADD COLUMN IF NOT EXISTS resolution_summary TEXT;