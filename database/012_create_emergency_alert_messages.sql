CREATE TABLE IF NOT EXISTS public.emergency_alert_messages (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    emergency_alert_id UUID NOT NULL,
    sender_auth_id UUID NULL,
    sender_type VARCHAR(20) NOT NULL,
    sender_name VARCHAR(150) NOT NULL DEFAULT 'Response team',
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT emergency_alert_messages_pkey PRIMARY KEY (id),
    CONSTRAINT emergency_alert_messages_emergency_alert_id_fkey
        FOREIGN KEY (emergency_alert_id) REFERENCES public.emergency_alerts (id) ON DELETE CASCADE,
    CONSTRAINT emergency_alert_messages_sender_auth_id_fkey
        FOREIGN KEY (sender_auth_id) REFERENCES auth.users (id) ON DELETE SET NULL,
    CONSTRAINT emergency_alert_messages_content_check
        CHECK (CHAR_LENGTH(content) >= 1 AND CHAR_LENGTH(content) <= 4000),
    CONSTRAINT emergency_alert_messages_sender_type_check
        CHECK (sender_type IN ('student', 'responder', 'system'))
);

CREATE INDEX IF NOT EXISTS emergency_alert_messages_alert_created_idx
    ON public.emergency_alert_messages (emergency_alert_id, created_at);

ALTER TABLE public.emergency_alert_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON TABLE public.emergency_alert_messages TO service_role;