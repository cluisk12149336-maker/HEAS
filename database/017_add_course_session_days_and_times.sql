-- Migration: 017_add_course_session_days_and_times.sql
-- Add available session days (multi-selection) and available time slots (AM, PM, or both) to training courses & bookings

ALTER TABLE public.training_courses 
  ADD COLUMN IF NOT EXISTS available_days text[] NOT NULL DEFAULT ARRAY['Monday'::text],
  ADD COLUMN IF NOT EXISTS available_times text[] NOT NULL DEFAULT ARRAY['07:00 A.M - 11:00 A.M'::text],
  ADD COLUMN IF NOT EXISTS session_schedule text NOT NULL DEFAULT '1 per week on Monday in 1 Month (4 session - Every Monday)';

ALTER TABLE public.training_bookings
  ADD COLUMN IF NOT EXISTS requested_day text NULL,
  ADD COLUMN IF NOT EXISTS session_schedule text NULL;
