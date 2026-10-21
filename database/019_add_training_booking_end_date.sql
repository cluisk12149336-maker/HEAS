-- Store the inclusive end date of each training batch. A batch may continue
-- into a later calendar month than its configured start month.
ALTER TABLE public.training_bookings
  ADD COLUMN IF NOT EXISTS end_date date NULL;

