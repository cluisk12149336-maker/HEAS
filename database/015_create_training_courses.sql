-- Migration: 015_create_training_courses.sql
-- Table schema for training_courses

create table if not exists public.training_courses (
  id uuid not null default gen_random_uuid (),
  slug text not null,
  name text not null,
  category text not null,
  location text not null,
  image_asset text not null default 'images/Medical.jpg'::text,
  description text not null,
  duration text not null,
  student_price integer not null,
  learnings text[] not null default '{}'::text[],
  audience text not null,
  requirements text not null,
  certification text not null,
  is_published boolean not null default true,
  created_by uuid null,
  created_at timestamp with time zone not null default now(),
  constraint training_courses_pkey primary key (id),
  constraint training_courses_slug_key unique (slug),
  constraint training_courses_created_by_fkey foreign KEY (created_by) references auth.users (id) on delete set null,
  constraint training_courses_category_check check (
    (
      category = any (
        array[
          'Medical'::text,
          'Security'::text,
          'University'::text,
          'Urgent Incidents'::text
        ]
      )
    )
  ),
  constraint training_courses_student_price_check check ((student_price >= 0))
) TABLESPACE pg_default;
