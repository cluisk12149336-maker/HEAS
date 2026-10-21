-- ====================================================================
-- HERON'S EMERGENCY ALERT SYSTEM (HEAS)
-- Migration 007: Training Courses Table Schema & Real-Time Sync
-- ====================================================================

-- 1. Helper Function: Set training course batch price default
CREATE OR REPLACE FUNCTION public.set_training_course_batch_price()
RETURNS TRIGGER AS $$
BEGIN
  -- If batch_price is null or not provided, calculate or fallback to student_price (or 0)
  IF NEW.batch_price IS NULL THEN
    NEW.batch_price := COALESCE(NEW.student_price, 0);
  END IF;

  -- Ensure student_price is never null
  IF NEW.student_price IS NULL THEN
    NEW.student_price := 0;
  END IF;

  -- Ensure updated_at is always refreshed
  NEW.updated_at := NOW();

  -- If available_months array is populated and available_month is null, set primary month
  IF NEW.available_month IS NULL AND NEW.available_months IS NOT NULL AND array_length(NEW.available_months, 1) > 0 THEN
    BEGIN
      NEW.available_month := (NEW.available_months[1] || '-01')::date;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create public.training_courses table
CREATE TABLE IF NOT EXISTS public.training_courses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Medical',
  location text NOT NULL DEFAULT 'UMak Campus',
  image_asset text NOT NULL DEFAULT 'images/Medical.jpg',
  description text NOT NULL DEFAULT '',
  duration text NOT NULL DEFAULT '1 Month',
  student_price integer NOT NULL DEFAULT 0,
  batch_price integer NOT NULL DEFAULT 0,
  learnings text[] NOT NULL DEFAULT '{}'::text[],
  audience text NOT NULL DEFAULT 'Students & Community Members',
  requirements text NOT NULL DEFAULT 'Valid UMak ID',
  certification text NOT NULL DEFAULT 'Certificate of Completion',
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  -- Real-time Training Schedule (Time, Date, Day, Months, Trainer)
  training_time text NOT NULL DEFAULT '07:00 A.M - 11:00 A.M',
  available_times text[] NOT NULL DEFAULT ARRAY['07:00 A.M - 11:00 A.M'::text],
  available_time_slots text[] NOT NULL DEFAULT ARRAY['AM'::text],
  available_days text[] NOT NULL DEFAULT ARRAY['Monday'::text],
  session_schedule text NOT NULL DEFAULT '1 per week on Monday in 1 Month (4 session - Every Monday)',
  available_month date NULL,
  available_months text[] NOT NULL DEFAULT ARRAY[]::text[],
  batch_schedule text NULL DEFAULT 'Monthly (1 Month Each: 1st Week to Last Week)',
  assigned_trainer text NULL DEFAULT '',

  -- Constraints
  CONSTRAINT training_courses_pkey PRIMARY KEY (id),
  CONSTRAINT training_courses_slug_key UNIQUE (slug),
  CONSTRAINT training_courses_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT training_courses_batch_price_check CHECK (batch_price >= 0),
  CONSTRAINT training_courses_student_price_check CHECK (student_price >= 0),
  CONSTRAINT training_courses_category_check CHECK (
    category = ANY (
      ARRAY[
        'Medical'::text,
        'Security'::text,
        'University'::text,
        'Urgent Incidents'::text
      ]
    )
  )
) TABLESPACE pg_default;

-- 3. If table already existed with missing columns, add them safely
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='training_courses' AND column_name='training_time') THEN
    ALTER TABLE public.training_courses ADD COLUMN training_time text NOT NULL DEFAULT '07:00 A.M - 11:00 A.M';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='training_courses' AND column_name='available_times') THEN
    ALTER TABLE public.training_courses ADD COLUMN available_times text[] NOT NULL DEFAULT ARRAY['07:00 A.M - 11:00 A.M'::text];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='training_courses' AND column_name='available_time_slots') THEN
    ALTER TABLE public.training_courses ADD COLUMN available_time_slots text[] NOT NULL DEFAULT ARRAY['AM'::text];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='training_courses' AND column_name='available_days') THEN
    ALTER TABLE public.training_courses ADD COLUMN available_days text[] NOT NULL DEFAULT ARRAY['Monday'::text];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='training_courses' AND column_name='session_schedule') THEN
    ALTER TABLE public.training_courses ADD COLUMN session_schedule text NOT NULL DEFAULT '1 per week on Monday in 1 Month (4 session - Every Monday)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='training_courses' AND column_name='available_months') THEN
    ALTER TABLE public.training_courses ADD COLUMN available_months text[] NOT NULL DEFAULT ARRAY[]::text[];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='training_courses' AND column_name='batch_schedule') THEN
    ALTER TABLE public.training_courses ADD COLUMN batch_schedule text NULL DEFAULT 'Monthly (1 Month Each: 1st Week to Last Week)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='training_courses' AND column_name='assigned_trainer') THEN
    ALTER TABLE public.training_courses ADD COLUMN assigned_trainer text NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='training_courses' AND column_name='updated_at') THEN
    ALTER TABLE public.training_courses ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now();
  END IF;

  -- Ensure batch_price has default 0
  ALTER TABLE public.training_courses ALTER COLUMN batch_price SET DEFAULT 0;
  ALTER TABLE public.training_courses ALTER COLUMN student_price SET DEFAULT 0;
  ALTER TABLE public.training_courses ALTER COLUMN audience SET DEFAULT 'Students & Community Members';
  ALTER TABLE public.training_courses ALTER COLUMN description SET DEFAULT '';
  ALTER TABLE public.training_courses ALTER COLUMN requirements SET DEFAULT 'Valid UMak ID';
  ALTER TABLE public.training_courses ALTER COLUMN certification SET DEFAULT 'Certificate of Completion';
  ALTER TABLE public.training_courses ALTER COLUMN location SET DEFAULT 'UMak Campus';

  -- Remove overly restrictive check constraint if it exists on available_month
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_courses_available_month_check') THEN
    ALTER TABLE public.training_courses DROP CONSTRAINT training_courses_available_month_check;
  END IF;
END $$;

-- 4. Re-create trigger for batch_price & updated_at
DROP TRIGGER IF EXISTS training_course_batch_price_default ON public.training_courses;
CREATE TRIGGER training_course_batch_price_default
BEFORE INSERT OR UPDATE OF student_price, batch_price, available_months
ON public.training_courses
FOR EACH ROW
EXECUTE FUNCTION public.set_training_course_batch_price();

-- 5. Enable Real-Time Replication on public.training_courses
ALTER TABLE public.training_courses REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'training_courses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.training_courses;
  END IF;
END $$;

-- 6. Row Level Security (RLS) Policies
ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Anyone can view published training courses
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'training_courses' AND policyname = 'Allow public read training courses') THEN
    CREATE POLICY "Allow public read training courses" 
    ON public.training_courses 
    FOR SELECT 
    USING (true);
  END IF;

  -- Authenticated service role and admin users can insert/update/delete
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'training_courses' AND policyname = 'Allow admin manage training courses') THEN
    CREATE POLICY "Allow admin manage training courses" 
    ON public.training_courses 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);
  END IF;
END $$;
