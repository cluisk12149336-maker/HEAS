-- Keep cohort schedules separate from student enrollment and payment records.
create table if not exists public.training_batches (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  batch_code text not null unique,
  start_date date not null,
  end_date date not null,
  requested_time text not null,
  requested_day text not null,
  session_schedule text not null default '',
  capacity integer not null default 30 check (capacity > 0),
  venue text not null default '',
  assigned_trainer_id varchar(50),
  notes text not null default '',
  training_status text not null default 'Scheduled',
  created_by_employee_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.training_bookings
  add column if not exists training_batch_id uuid
  references public.training_batches(id) on delete set null;

create index if not exists training_batches_course_start_idx
  on public.training_batches(course_id, start_date);
create index if not exists training_bookings_training_batch_idx
  on public.training_bookings(training_batch_id);
