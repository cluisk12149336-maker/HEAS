CREATE TABLE IF NOT EXISTS public.response_teams (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_name VARCHAR(120) NOT NULL UNIQUE,
    leader_name VARCHAR(150) NOT NULL,
    member_count INTEGER NOT NULL DEFAULT 1 CHECK (member_count BETWEEN 1 AND 500),
    coverage_area VARCHAR(255) NOT NULL,
    active_assignment VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'Standby'
        CHECK (status IN ('On Patrol', 'Active Call', 'Standby')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.response_teams (team_name, leader_name, member_count, coverage_area, active_assignment, status)
VALUES
    ('Alpha Patrol Unit 1', 'Officer Carlo Tan', 4, 'Main Gate & Quadrangle', 'Patrolling J.P. Rizal Gate', 'On Patrol'),
    ('Beta Medical Response', 'Nurse Elena Garcia', 3, 'Sports Complex & Clinic', '#SOS-2024-00126', 'Active Call'),
    ('Gamma Campus Safety', 'Lead Officer Ramon Reyes', 5, 'Dormitory Buildings & Oval', 'Routine Standby', 'Standby')
ON CONFLICT (team_name) DO NOTHING;