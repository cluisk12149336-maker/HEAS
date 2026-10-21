-- Migration: 016_create_training_bookings.sql
-- Table schema for training_bookings with payment tracking, triggers, and constraints

create table if not exists public.training_bookings (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  course_id uuid not null,
  booking_code text not null,
  organization text not null,
  contact_name text not null,
  email text not null,
  phone text not null,
  address text not null,
  requested_date date not null,
  requested_time text not null,
  participants integer not null,
  venue text not null,
  notes text not null default ''::text,
  payment_method text not null,
  payment_status text not null,
  payment_reference text null,
  payment_deadline date null,
  payment_confirmed_at timestamp with time zone null,
  total_php integer not null,
  paymongo_checkout_session_id text null,
  paymongo_payment_id text null,
  created_at timestamp with time zone not null default now(),
  paymongo_receipt_url text null,
  payment_receipt_upload_path text null,
  assigned_trainer_id character varying(50) null,
  training_status text null default 'Scheduled'::text,
  constraint training_bookings_pkey primary key (id),
  constraint training_bookings_paymongo_checkout_session_id_key unique (paymongo_checkout_session_id),
  constraint training_bookings_booking_code_key unique (booking_code),
  constraint training_bookings_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint training_bookings_course_id_fkey foreign KEY (course_id) references training_courses (id),
  constraint training_bookings_payment_status_check check (
    (
      payment_status = any (
        array[
          'pending'::text,
          'paid'::text,
          'overdue'::text,
          'cancelled'::text
        ]
      )
    )
  ),
  constraint training_bookings_payment_method_check check (
    (
      payment_method = any (array['online'::text, 'cash'::text])
    )
  ),
  constraint training_bookings_participants_check check ((participants > 0)),
  constraint training_bookings_total_php_check check ((total_php >= 0)),
  constraint training_bookings_cash_deadline_check check (
    (
      (payment_method <> 'cash'::text)
      or (
        (payment_deadline is not null)
        and (payment_deadline <= (requested_date - 2))
      )
    )
  )
) TABLESPACE pg_default;

-- Cash booking notification email trigger
create or replace trigger training_cash_booking_email
after INSERT on training_bookings for EACH row when (new.payment_method = 'cash'::text)
execute FUNCTION queue_training_cash_booking_email ();

-- Payment confirmation notification email trigger
create or replace trigger training_payment_confirmation_email
after
update OF payment_status on training_bookings for EACH row
execute FUNCTION queue_training_payment_confirmation_email ();
