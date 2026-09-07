-- Migration 003: Incidents and Emergency Alerts Schema
-- Run this in Supabase SQL Editor to enable live incident and alert tracking

CREATE TABLE IF NOT EXISTS public.incidents (
    incident_id VARCHAR(50) PRIMARY KEY,
    incident_type VARCHAR(50) NOT NULL, -- 'Medical', 'Security', 'Urgent', 'Vicinity'
    incident_description TEXT,
    location_name VARCHAR(255) NOT NULL,
    latitude DOUBLE PRECISION DEFAULT 14.5583,
    longitude DOUBLE PRECISION DEFAULT 121.0543,
    incident_status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'ongoing', 'resolved', 'cancelled'
    assigned_unit VARCHAR(100) DEFAULT 'Unassigned',
    reported_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.alerts (
    alert_id VARCHAR(50) PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL, -- 'medical', 'security', 'urgent', 'vicinity'
    alert_title VARCHAR(255) NOT NULL,
    alert_message TEXT NOT NULL,
    location VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'ongoing', 'resolved'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for rapid dashboard querying
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents (incident_status);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON public.alerts (status);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON public.incidents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON public.alerts (created_at DESC);

-- Optional sample initial records
INSERT INTO public.incidents (incident_id, incident_type, incident_description, location_name, latitude, longitude, incident_status, assigned_unit)
VALUES 
    ('MED_0001', 'Medical', 'Student reported dizziness and dehydration at sports complex.', 'Sports Complex - Court 1', 14.5585, 121.0548, 'ongoing', 'Beta Team 1'),
    ('SEC_0001', 'Security', 'Unidentified baggage unattended near Library entrance.', 'Library Main Entrance', 14.5591, 121.0539, 'active', 'Security Unit 2'),
    ('CAMP_0001', 'Medical', 'Minor scrape treated with first aid kit.', 'Academic Building 1', 14.5579, 121.0545, 'resolved', 'Clinic Staff')
ON CONFLICT (incident_id) DO NOTHING;

INSERT INTO public.alerts (alert_id, alert_type, alert_title, alert_message, location, status)
VALUES
    ('ALT_0001', 'medical', 'Immediate Medical Assistance', 'Beta Team 1 dispatched to Sports Complex.', 'Sports Complex', 'ongoing'),
    ('ALT_0002', 'security', 'Perimeter Safety Check', 'Security officers inspecting campus boundary.', 'Main Gate Perimeter', 'active')
ON CONFLICT (alert_id) DO NOTHING;
