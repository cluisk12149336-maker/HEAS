ALTER TABLE public.alert_chat_messages
    ADD COLUMN IF NOT EXISTS recipient_student_id BIGINT,
    ADD COLUMN IF NOT EXISTS alert_type VARCHAR(50);