-- Migration: Create OAuth Identities Table
-- Description: Create oauth_identities table for Google OAuth integration
-- Date: 2026-09-01
-- Status: Adds OAuth support while maintaining backward compatibility

-- Task 2.1: Create oauth_identities table
CREATE TABLE IF NOT EXISTS oauth_identities (
    oauth_id BIGINT GENERATED ALWAYS AS IDENTITY,
    provider VARCHAR(50) NOT NULL,
    provider_sub VARCHAR(500) NOT NULL,
    employee_id VARCHAR(50) NOT NULL,
    linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    linked_by VARCHAR(20) NOT NULL DEFAULT 'oauth',
    
    CONSTRAINT pk_oauth_identities PRIMARY KEY (oauth_id),
    CONSTRAINT uq_oauth_identities_provider_sub UNIQUE (provider, provider_sub),
    CONSTRAINT fk_oauth_identities_employee_id FOREIGN KEY (employee_id) REFERENCES employee_accounts(employee_id) ON DELETE CASCADE,
    CONSTRAINT chk_oauth_identities_provider CHECK (provider IN ('google', 'microsoft', 'okta'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_oauth_identities_employee_id ON oauth_identities(employee_id);
CREATE INDEX IF NOT EXISTS idx_oauth_identities_provider_sub ON oauth_identities(provider, provider_sub);

-- Task 2.2: Modify employee_accounts to allow NULL employee_pass
-- Note: This must be executed separately as it alters an existing table
ALTER TABLE employee_accounts ALTER COLUMN employee_pass DROP NOT NULL;

-- Task 2.3: Create index for pending account queries
CREATE INDEX IF NOT EXISTS idx_employee_accounts_oauth_status ON employee_accounts(employee_status) 
WHERE employee_status = 'Pending';

-- Task 2.4: Add comments for documentation
COMMENT ON TABLE oauth_identities IS 'Stores OAuth identity mappings for multi-provider authentication. Provider + provider_sub are unique to prevent multiple accounts using same OAuth identity.';
COMMENT ON COLUMN oauth_identities.provider IS 'OAuth provider name (google, microsoft, okta). Currently only google is implemented.';
COMMENT ON COLUMN oauth_identities.provider_sub IS 'Immutable subject identifier from OAuth provider (e.g., Google sub claim).';
COMMENT ON COLUMN oauth_identities.employee_id IS 'Foreign key to employee_accounts. Cascade delete removes all OAuth links if account is deleted.';
COMMENT ON COLUMN oauth_identities.linked_at IS 'Timestamp when OAuth identity was linked to employee account.';
COMMENT ON COLUMN oauth_identities.linked_by IS 'Who initiated the linking: oauth (automatic during OAuth flow) or manual (admin action).';

COMMENT ON TABLE employee_accounts IS 'Employee accounts for system access. employee_pass is nullable for OAuth-only accounts.';
COMMENT ON COLUMN employee_accounts.employee_pass IS 'Bcrypt-hashed password for email/password auth. NULL for OAuth-only accounts to prevent empty-password bypass.';
