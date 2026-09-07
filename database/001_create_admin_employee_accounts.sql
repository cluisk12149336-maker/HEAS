CREATE TABLE employee_accounts (
    admin_id BIGINT GENERATED ALWAYS AS IDENTITY,
    employee_id VARCHAR(50) NOT NULL,
    employee_email VARCHAR(254) NOT NULL,
    employee_pass VARCHAR(255) NOT NULL,
    employee_name VARCHAR(150) NOT NULL,
    employee_role VARCHAR(20) NOT NULL,
    employee_status VARCHAR(10) NOT NULL DEFAULT 'Pending',
    employee_created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    employee_last_login TIMESTAMP NULL DEFAULT NULL,

    CONSTRAINT pk_employee_accounts PRIMARY KEY (admin_id),
    CONSTRAINT uq_employee_accounts_employee_id UNIQUE (employee_id),
    CONSTRAINT uq_employee_accounts_employee_email UNIQUE (employee_email),
    CONSTRAINT chk_employee_accounts_role
        CHECK (employee_role IN ('HEAD', 'System Admin', 'Responder')),
    CONSTRAINT chk_employee_accounts_status
        CHECK (employee_status IN ('Active', 'Inactive', 'Suspended', 'Pending'))
);

CREATE INDEX idx_employee_accounts_role_status
    ON employee_accounts (employee_role, employee_status);

-- Store a password hash in employee_pass, never a plaintext password.
