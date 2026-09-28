# Heron's Emergency Alert System (HEAS)

Emergency incident reporting, telemetry mapping, and real-time administrator command dashboard for the University of Makati community.

---

##Team Members

When you clone this repository, you must create a local `.env` file because sensitive credentials are deliberately excluded from Git.

### 1. Install Dependencies
```bash
npm install
```

### 2. Create the `.env` File
In the root directory of the project (at the same level as `package.json`), create a file named `.env` and paste the shared team environment variables (ask the team lead for the keys):

```env
SUPABASE_URL=https://clxpbcnoziynboqhglih.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ask_team_lead_for_key

# Gmail SMTP for local verification emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=heas.headsos@gmail.com
SMTP_PASS=ask_team_lead_for_app_password
SMTP_FROM=heas.headsos@gmail.com

# Google OAuth (Optional)
GOOGLE_OAUTH_CLIENT_ID=ask_team_lead_for_id
GOOGLE_OAUTH_CLIENT_SECRET=ask_team_lead_for_secret
```

### 3. Apply the Responder Completion Migration
In the Supabase SQL Editor, run `database/013_add_responder_completion_report.sql` against the project database. The responder-to-HEAD review flow requires the completion report columns on `public.emergency_alerts`.

### 4. Start the Local Server
```bash
npm start
```
Then open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## 📁 Project Structure
- `public/` - Web frontend assets (HTML, CSS, JavaScript, components)
  - `index.html` - Landing, sign-in, and verification views
  - `dashboard.html` - Admin command console & real-time telemetry
  - `navigation.js` - Global modular navigation component
- `server.js` - Node.js HTTP server, authentication APIs, and Supabase integration
- `database/` - SQL schema migrations for Supabase tables
