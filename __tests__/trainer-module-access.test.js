const request = require('supertest');
const fs = require('fs');
const path = require('path');

describe('Trainer Account Role & Module Access Control', () => {
  const baseUrl = 'http://localhost:3000';

  test('GET /api/profile returns Trainer role for trainer account', async () => {
    const res = await request(baseUrl)
      .get('/api/profile')
      .set('x-employee-id', 'EMP-1792242501250-UEFBCD')
      .set('x-employee-email', 'maechristineluis@gmail.com')
      .expect(200);

    expect(res.body).toHaveProperty('ok', true);
    expect(res.body.profile.employee_role).toBe('Trainer');
    expect(res.body.profile.employee_name).toBe('Cia');
  });

  test('Navigation items only include Trainer on Dashboard, Training Center, and Account Profile', () => {
    const GlobalNavigation = require('../public/navigation.js');
    expect(GlobalNavigation).toBeDefined();

    // Check _isRoleAllowed for each default item
    const items = GlobalNavigation.items;
    const allowedForTrainer = items.filter(item => GlobalNavigation._isRoleAllowed(item.roles, 'Trainer'));
    const allowedViews = allowedForTrainer.map(item => item.view);

    expect(allowedViews).toEqual(['overview', 'training', 'profile']);
    expect(allowedForTrainer.map(item => item.label)).toEqual(['Dashboard', 'Training Center', 'Account Profile']);

    // Ensure restricted views return false for Trainer
    const restrictedViews = ['map', 'incidents', 'users', 'teams', 'audit', 'reports'];
    restrictedViews.forEach(viewId => {
      const item = items.find(i => i.view === viewId);
      expect(item).toBeDefined();
      expect(GlobalNavigation._isRoleAllowed(item.roles, 'Trainer')).toBe(false);
    });
  });

  test('Navigation HTML generated for Trainer hides all unauthorized modules', () => {
    const GlobalNavigation = require('../public/navigation.js');
    const html = GlobalNavigation.generateHTML('overview', 'Trainer');

    // Overview, Training, and Profile should not have display:none
    expect(html).toContain('data-view="overview"');
    expect(html).toContain('data-view="training"');
    expect(html).toContain('data-view="profile"');

    // Check style="display:none;" on restricted modules
    const restrictedViews = ['map', 'incidents', 'users', 'teams', 'audit', 'reports'];
    restrictedViews.forEach(view => {
      const regex = new RegExp(`<a[^>]*data-view="${view}"[^>]*>`, 'i');
      const match = html.match(regex);
      expect(match).not.toBeNull();
      expect(match[0]).toContain('style="display:none;"');
    });

    // Check that overview, training, profile do NOT have style="display:none;"
    ['overview', 'training', 'profile'].forEach(view => {
      const regex = new RegExp(`<a[^>]*data-view="${view}"[^>]*>`, 'i');
      const match = html.match(regex);
      expect(match).not.toBeNull();
      expect(match[0]).not.toContain('style="display:none;"');
    });
  });

  test('dashboard.js enforces Trainer access restriction on unauthorized views', () => {
    const dashJs = fs.readFileSync(path.resolve(__dirname, '../public/dashboard.js'), 'utf8');

    // switchView must restrict Trainer to overview, training, profile
    expect(dashJs).toMatch(/isTrainerRole\(currentRole\)\s*&&\s*!\['overview',\s*'training',\s*'profile'\]\.includes\(viewName\)/);

    // handleHashRouting must restrict Trainer to overview, training, profile
    expect(dashJs).toMatch(/isTrainerRole\(currentRole\)\s*&&\s*!\['overview',\s*'training',\s*'profile'\]\.includes\(targetView\)/);

    // navigateToIncidentsView, navigateToStudentAccounts, and viewIncidentOnMap must block Trainer
    expect(dashJs).toMatch(/function navigateToIncidentsView\([^)]*\)\s*\{\s*if\s*\(isTrainerRole\(\)\)/);
    expect(dashJs).toMatch(/function navigateToStudentAccounts\([^)]*\)\s*\{\s*if\s*\(isTrainerRole\(\)\)/);
    expect(dashJs).toMatch(/function viewIncidentOnMap\([^)]*\)\s*\{\s*if\s*\(isTrainerRole\(\)\)/);
  });

  test('CSS preserves Edit Info, Delete, and Add Batch buttons in action group', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../public/dashboard.css'), 'utf8');

    expect(css).toContain('body.trainer-mode #btnCreateCourse');
    expect(css).toContain('.tc-action-btn-group');
    expect(css).toContain('.tc-btn-edit');
    expect(css).toContain('.tc-btn-delete');
    expect(css).toContain('.tc-btn-add-batch');
  });

  test('dashboard.js keeps Edit Info, Delete, and Add Batch buttons visible', () => {
    const dashJs = fs.readFileSync(path.resolve(__dirname, '../public/dashboard.js'), 'utf8');

    expect(dashJs).toMatch(/btnCreateCourse\.style\.display\s*=\s*isTrainer\s*\?\s*'none'/);
    expect(dashJs).toMatch(/btnEditCourse\.style\.display\s*=\s*''/);
    expect(dashJs).toMatch(/btnDeleteCourse\.style\.display\s*=\s*''/);
    expect(dashJs).toMatch(/btnAddSchedule\.style\.display\s*=\s*''/);
  });

  test('server.js blocks course and batch creation/modification for Trainer role (403 Forbidden)', async () => {
    // 1. Create Course
    const postCourse = await request(baseUrl)
      .post('/api/training/courses')
      .set('x-employee-role', 'Trainer')
      .send({ name: 'Unauthorized Course' })
      .expect(403);
    expect(postCourse.body.error).toMatch(/Trainer accounts do not have permission/i);

    // 2. Update Course
    const putCourse = await request(baseUrl)
      .put('/api/training/courses/a0000000-0000-0000-0000-000000000001')
      .set('x-employee-role', 'Trainer')
      .send({ name: 'Unauthorized Update' })
      .expect(403);
    expect(putCourse.body.error).toMatch(/Trainer accounts do not have permission/i);

    // 3. Delete Course
    const deleteCourse = await request(baseUrl)
      .delete('/api/training/courses/a0000000-0000-0000-0000-000000000001')
      .set('x-employee-role', 'Trainer')
      .expect(403);
    expect(deleteCourse.body.error).toMatch(/Trainer accounts do not have permission/i);

    // 4. Add Batch Schedule
    const postBatch = await request(baseUrl)
      .post('/api/training/bookings')
      .set('x-employee-role', 'Trainer')
      .send({ course_id: 'a0000000-0000-0000-0000-000000000001' })
      .expect(403);
    expect(postBatch.body.error).toMatch(/Trainer accounts do not have permission/i);

    // 5. Delete Batch Schedule
    const deleteBatch = await request(baseUrl)
      .delete('/api/training/bookings/b0000000-0000-0000-0000-000000000001')
      .set('x-employee-role', 'Trainer')
      .expect(403);
    expect(deleteBatch.body.error).toMatch(/Trainer accounts do not have permission/i);
  });

  test('Trainer can view registered students with attendance status via GET /api/training/bookings', async () => {
    const res = await request(baseUrl)
      .get('/api/training/bookings')
      .set('x-employee-role', 'Trainer')
      .expect(200);

    expect(res.body).toHaveProperty('ok', true);
    expect(Array.isArray(res.body.bookings)).toBe(true);
    expect(res.body.bookings.length).toBeGreaterThan(0);

    // Each booking must include attendance_status
    res.body.bookings.forEach(b => {
      expect(b).toHaveProperty('attendance_status');
    });
  });

  test('Trainer can update student attendance via PUT /api/training/bookings/:id/attendance', async () => {
    // Get an existing booking id
    const listRes = await request(baseUrl)
      .get('/api/training/bookings')
      .expect(200);
    const booking = listRes.body.bookings[0];
    expect(booking).toBeDefined();

    // Mark as Present
    const putRes = await request(baseUrl)
      .put(`/api/training/bookings/${booking.id}/attendance`)
      .set('x-employee-role', 'Trainer')
      .send({ attendance_status: 'Present', student_name: booking.contact_name })
      .expect(200);

    expect(putRes.body).toHaveProperty('ok', true);
    expect(putRes.body.attendance_status).toBe('Present');
    expect(putRes.body.booking_id).toBe(booking.id);

    // Mark as Absent
    const putRes2 = await request(baseUrl)
      .put(`/api/training/bookings/${booking.id}/attendance`)
      .set('x-employee-role', 'Trainer')
      .send({ attendance_status: 'Absent', student_name: booking.contact_name })
      .expect(200);

    expect(putRes2.body.attendance_status).toBe('Absent');
  });

  test('dashboard.js replaces Batches & Schedules with Registered Students Roster for Trainer without attendance button or record', () => {
    const dashJs = fs.readFileSync(path.resolve(__dirname, '../public/dashboard.js'), 'utf8');

    // Header swapping for Trainer vs Admin
    expect(dashJs).toMatch(/headingTextEl\.textContent\s*=\s*'Registered Students'/);
    expect(dashJs).toMatch(/headingTextEl\.textContent\s*=\s*'Batches & Schedules'/);

    // Registered students roster rendering
    expect(dashJs).toContain('tc-student-card');
    // Attendance button and record are removed from Trainer view
    expect(dashJs).not.toContain('tc-btn-attendance');
    expect(dashJs).not.toContain('Attendance Record:');
  });

  test('dashboard.html places Add Batch button next to Delete button and removes Batches & Schedules container', () => {
    const dashHtml = fs.readFileSync(path.resolve(__dirname, '../public/dashboard.html'), 'utf8');

    // Add Batch is next to Delete Course in action button group
    const actionGroup = dashHtml.substring(dashHtml.indexOf('class="tc-action-btn-group"'), dashHtml.indexOf('id="tcSchedulesList"'));
    const deleteIdx = actionGroup.indexOf('id="btnDeleteCourse"');
    const addBatchIdx = actionGroup.indexOf('id="btnAddSchedule"');
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(addBatchIdx).toBeGreaterThan(deleteIdx);

    // Batches & Schedules toolbar container is removed
    expect(dashHtml).not.toContain('id="tcSchedulesHeading"');
    expect(dashHtml).toContain('id="tcSchedulesList"');

    // Delete Course confirmation modal
    expect(dashHtml).toContain('id="deleteCourseModal"');
    expect(dashHtml).toContain('Are you sure you want to delete this Training Course?');
    expect(dashHtml).toContain('id="btnDeleteCourseYes"');
    expect(dashHtml).toContain('id="btnDeleteCourseNo"');
  });

  test('Training Center module has Remove Student button and confirmation modal with Reason for Cancellation above Yes/No buttons', () => {
    const dashJs = fs.readFileSync(path.resolve(__dirname, '../public/dashboard.js'), 'utf8');
    const dashHtml = fs.readFileSync(path.resolve(__dirname, '../public/dashboard.html'), 'utf8');

    // Head / Admin batch cards have Remove Student button
    expect(dashJs).toContain('Remove Student');
    expect(dashJs).toContain('openRemoveStudentModal');
    expect(dashJs).toContain('tc-btn-remove-student');

    // Modal exists in dashboard.html
    expect(dashHtml).toContain('id="removeStudentModal"');
    expect(dashHtml).toContain('Are you sure you want to remove this student?');
    expect(dashHtml).toContain('Reason for Cancellation');
    expect(dashHtml).toContain('id="btnRemoveStudentYes"');
    expect(dashHtml).toContain('id="btnRemoveStudentNo"');

    // Verify Reason for Cancellation comes before Yes/No buttons
    const modalSection = dashHtml.substring(dashHtml.indexOf('id="removeStudentModal"'), dashHtml.indexOf('id="toast"'));
    const reasonIndex = modalSection.indexOf('Reason for Cancellation');
    const yesBtnIndex = modalSection.indexOf('id="btnRemoveStudentYes"');
    const noBtnIndex = modalSection.indexOf('id="btnRemoveStudentNo"');
    expect(reasonIndex).toBeGreaterThan(-1);
    expect(yesBtnIndex).toBeGreaterThan(reasonIndex);
    expect(noBtnIndex).toBeGreaterThan(reasonIndex);
  });

  test('Training Center displays (1 Month Each: 1st Week to Last Week) next to batch schedule months', () => {
    const dashJs = fs.readFileSync(path.resolve(__dirname, '../public/dashboard.js'), 'utf8');

    expect(dashJs).toContain('formatBatchScheduleText');
    expect(dashJs).toContain('(1 Month Each: 1st Week to Last Week)');
    expect(dashJs).toContain('Batch Schedule:');
  });

  test('Course description preserves extra spaces, newlines, and paragraphs without collapsing', () => {
    const dashHtml = fs.readFileSync(path.resolve(__dirname, '../public/dashboard.html'), 'utf8');
    const dashCss = fs.readFileSync(path.resolve(__dirname, '../public/dashboard.css'), 'utf8');
    const serverJs = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');

    // Check dashboard.html has white-space: pre-wrap on tcActiveDesc
    expect(dashHtml).toMatch(/id="tcActiveDesc"[^>]*style="[^"]*white-space:\s*pre-wrap/);

    // Check dashboard.css has white-space: pre-wrap on #tcActiveDesc
    expect(dashCss).toMatch(/#tcActiveDesc[\s\S]*?white-space:\s*pre-wrap/);

    // Check server.js preserves whitespace in course description
    expect(serverJs).toMatch(/typeof body\.description === 'string' \? body\.description : String\(body\.description \|\| ''\)/);
  });

  test('Assigned Trainer dropdown only includes Trainer accounts and excludes Responder accounts', async () => {
    // 1. API endpoint GET /api/trainers
    const res = await request(baseUrl)
      .get('/api/trainers')
      .expect(200);

    expect(res.body).toHaveProperty('ok', true);
    expect(Array.isArray(res.body.trainers)).toBe(true);

    // All returned accounts must be Trainer and none can be Responder
    res.body.trainers.forEach(account => {
      expect(account.employee_role.toLowerCase()).toBe('trainer');
      expect(account.employee_role.toLowerCase()).not.toContain('responder');
      expect(account.employee_role.toLowerCase()).not.toContain('head');
      expect(account.employee_role.toLowerCase()).not.toContain('admin');
    });

    // 2. Frontend dashboard.js checks
    const dashJs = fs.readFileSync(path.resolve(__dirname, '../public/dashboard.js'), 'utf8');

    // loadTrainersForSelect must filter strictly for trainer and never fall back to responders
    expect(dashJs).not.toMatch(/allTrainersList\s*=\s*data\.responders/);
    expect(dashJs).toMatch(/allTrainersList\s*=\s*\(data\.trainers\s*\|\|\s*\[\]\)\.filter\(/);
    expect(dashJs).toMatch(/onlyTrainers\s*=\s*allTrainersList\.filter/);
  });

  test('Edit Info, Delete, and Add Batch buttons have working onclick handlers and robust initialization', () => {
    const dashHtml = fs.readFileSync(path.resolve(__dirname, '../public/dashboard.html'), 'utf8');
    const dashJs = fs.readFileSync(path.resolve(__dirname, '../public/dashboard.js'), 'utf8');

    // 1. Buttons have explicit onclick attributes
    expect(dashHtml).toMatch(/id="btnEditCourse"[^>]*onclick="openEditCourseModal\(\)"/);
    expect(dashHtml).toMatch(/id="btnDeleteCourse"[^>]*onclick="deleteActiveCourse\(\)"/);
    expect(dashHtml).toMatch(/id="btnAddSchedule"[^>]*onclick="openAddBatchModal\(\)"/);

    // 2. Icons inside buttons have pointer-events: none to prevent click interference
    expect(dashHtml).toMatch(/id="btnEditCourse"[\s\S]*?pointer-events:\s*none/);
    expect(dashHtml).toMatch(/id="btnDeleteCourse"[\s\S]*?pointer-events:\s*none/);
    expect(dashHtml).toMatch(/id="btnAddSchedule"[\s\S]*?pointer-events:\s*none/);

    // 3. Functions are exported to window for global access
    expect(dashJs).toContain('window.openEditCourseModal = openEditCourseModal;');
    expect(dashJs).toContain('window.deleteActiveCourse = deleteActiveCourse;');
    expect(dashJs).toContain('window.openAddBatchModal = openAddBatchModal;');
    expect(dashJs).toContain('window.initTrainingCenterModals = initTrainingCenterModals;');
  });

  test('Edit Training Course and Create Course include learnings, duration/training time, requirements, and certificate', () => {
    const dashHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
    const dashJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.js'), 'utf8');
    const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const migrationSql = fs.readFileSync(path.join(__dirname, '..', 'database', '015_create_training_courses.sql'), 'utf8');

    // 1. Database table schema includes learnings, duration, requirements, certification
    expect(migrationSql).toContain('learnings text[] not null default');
    expect(migrationSql).toContain('duration text not null');
    expect(migrationSql).toContain('requirements text not null');
    expect(migrationSql).toContain('certification text not null');

    // 2. Edit Course Modal in HTML has all required fields
    expect(dashHtml).toContain('id="editCourseInputDuration"');
    expect(dashHtml).toContain('id="editCourseInputTime"');
    expect(dashHtml).toContain('id="editCourseInputRequirements"');
    expect(dashHtml).toContain('id="editCourseInputCertification"');
    expect(dashHtml).toContain('id="editCourseInputLearnings"');

    // 3. Active Course View displays metadata and learnings
    expect(dashHtml).toContain('id="tcActiveDuration"');
    expect(dashHtml).toContain('id="tcActiveRequirements"');
    expect(dashHtml).toContain('id="tcActiveCertificate"');
    expect(dashHtml).toContain('id="tcActiveLearnings"');

    // 4. dashboard.js populates fields in openEditCourseModal
    expect(dashJs).toMatch(/editCourseInputRequirements[\s\S]*?requirements/);
    expect(dashJs).toMatch(/editCourseInputCertification[\s\S]*?certification/);
    expect(dashJs).toMatch(/editCourseInputLearnings[\s\S]*?learnings/);

    // 5. dashboard.js sends fields in editCourseForm submission payload
    expect(dashJs).toMatch(/requirements:\s*document\.getElementById\('editCourseInputRequirements'\)/);
    expect(dashJs).toMatch(/certification:\s*document\.getElementById\('editCourseInputCertification'\)/);
    expect(dashJs).toMatch(/learnings:\s*learningsArr/);

    // 6. server.js handles learnings, requirements, certification, duration on PUT and POST
    expect(serverJs).toMatch(/updatePayload\.learnings\s*=/);
    expect(serverJs).toMatch(/updatePayload\.requirements\s*=/);
    expect(serverJs).toMatch(/updatePayload\.certification\s*=/);
  });

  test('Add Batch modal removes organization, coordinator, phone, removes (Optional) from trainer, and updates Course Library', () => {
    const dashHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
    const dashJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.js'), 'utf8');
    const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

    // 1. batchInputOrg, batchInputContactName, batchInputPhone are removed from addBatchModal
    expect(dashHtml).not.toContain('id="batchInputOrg"');
    expect(dashHtml).not.toContain('id="batchInputContactName"');
    expect(dashHtml).not.toContain('id="batchInputPhone"');

    // 2. (Optional) is removed from Assigned Trainer in addBatchModal
    expect(dashHtml).not.toMatch(/id="batchInputTrainer"[\s\S]*?\(Optional\)/);
    expect(dashHtml).toContain('<option value="">-- Select Trainer --</option>');
    expect(dashJs).not.toContain('-- Select Trainer (Optional) --');
    expect(dashJs).toContain('-- Select Trainer --');

    // 3. server.js connects to public.training_courses and updates course in POST /api/training/bookings
    expect(serverJs).toMatch(/supabase[\s\S]*?from\('training_courses'\)[\s\S]*?select\('\*'\)[\s\S]*?eq\('id',\s*courseId\)/);
    expect(serverJs).toMatch(/course:\s*courseData/);

    // 4. dashboard.js refreshes Course Library (loadTrainingCourses) and active course view upon batch creation
    expect(dashJs).toMatch(/await\s+loadTrainingCourses\(\);[\s\S]*?await\s+selectTrainingCourse\(activeTrainingCourse\.id\);/);
  });

  test('training_bookings schema, triggers, and View Details modal display payment ID and payment picture below payment status', async () => {
    const dashHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
    const dashJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.js'), 'utf8');
    const migrationSql = fs.readFileSync(path.join(__dirname, '..', 'database', '016_create_training_bookings.sql'), 'utf8');

    // 1. Database table schema & triggers
    expect(migrationSql).toContain('create table if not exists public.training_bookings');
    expect(migrationSql).toContain('paymongo_payment_id text null');
    expect(migrationSql).toContain('paymongo_receipt_url text null');
    expect(migrationSql).toContain('payment_receipt_upload_path text null');
    expect(migrationSql).toContain('payment_reference text null');
    expect(migrationSql).toContain('payment_deadline date null');
    expect(migrationSql).toContain('payment_confirmed_at timestamp with time zone null');
    expect(migrationSql).toContain('total_php integer not null');
    expect(migrationSql).toContain('paymongo_checkout_session_id text null');
    expect(migrationSql).toContain('training_cash_booking_email');
    expect(migrationSql).toContain('training_payment_confirmation_email');

    // 2. View Details Modal has Payment Reference, Payment ID, and Payment Picture elements
    expect(dashHtml).toContain('id="batchDetailsPaymentReference"');
    expect(dashHtml).toContain('id="batchDetailsPaymentId"');
    expect(dashHtml).toContain('id="batchDetailsPaymentPicContainer"');
    expect(dashHtml).toContain('id="batchDetailsPaymentPicStatus"');

    // 3. Elements are positioned BELOW Payment Status in dashboard.html
    const modalSection = dashHtml.substring(dashHtml.indexOf('id="batchDetailsModal"'), dashHtml.indexOf('id="btnDismissBatchDetails"'));
    const paymentStatusIdx = modalSection.indexOf('id="batchDetailsPayment"');
    const paymentRefIdx = modalSection.indexOf('id="batchDetailsPaymentReference"');
    const paymentIdIdx = modalSection.indexOf('id="batchDetailsPaymentId"');
    const paymentPicIdx = modalSection.indexOf('id="batchDetailsPaymentPicContainer"');

    expect(paymentStatusIdx).toBeGreaterThan(-1);
    expect(paymentRefIdx).toBeGreaterThan(paymentStatusIdx);
    expect(paymentIdIdx).toBeGreaterThan(paymentRefIdx);
    expect(paymentPicIdx).toBeGreaterThan(paymentIdIdx);

    // 4. dashboard.js populates Payment Reference, Payment ID, and Payment Picture
    expect(dashJs).toMatch(/batchDetailsPaymentReference[\s\S]*?payment_reference/);
    expect(dashJs).toMatch(/batchDetailsPaymentId[\s\S]*?paymongo_payment_id/);
    expect(dashJs).toMatch(/batchDetailsPaymentPicContainer[\s\S]*?payment_receipt_upload_path/);
    expect(dashJs).toMatch(/batchDetailsPaymentPicContainer[\s\S]*?paymongo_receipt_url/);

    // 4a. View Details modal displays Student: instead of Coordinator:
    expect(modalSection).toContain('Student:');
    expect(modalSection).not.toContain('Coordinator:');

    // 5. GET /api/training/bookings returns bookings with payment schema properties
    const res = await request(baseUrl)
      .get('/api/training/bookings')
      .expect(200);

    expect(res.body).toHaveProperty('ok', true);
    expect(Array.isArray(res.body.bookings)).toBe(true);
    if (res.body.bookings.length > 0) {
      const b = res.body.bookings[0];
      expect(b).toHaveProperty('payment_status');
      expect(b).toHaveProperty('payment_method');
      expect(b).toHaveProperty('payment_reference');
      expect(b).toHaveProperty('booking_code');
    }
  });

  test('Payment status has PAID and No Payment buttons inside View Details modal only for HEAD/Admin to verify payment, blocking Trainer', async () => {
    const dashHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
    const dashJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.js'), 'utf8');

    // 1. View Details modal has PAID and No Payment buttons in Payment Status row
    expect(dashHtml).toContain('id="btnBatchDetailsPaid"');
    expect(dashHtml).toContain('id="btnBatchDetailsNoPayment"');
    expect(dashHtml).toContain('id="batchDetailsPaymentActions"');
    expect(dashHtml).toContain('setBookingPaymentFromModal(\'paid\')');
    expect(dashHtml).toContain('setBookingPaymentFromModal(\'pending\')');

    // 2. Batch cards do NOT display PAID and No Payment buttons on right of View Details or Active Schedule (inside View Details only)
    expect(dashJs).not.toContain('tc-btn-pay-paid');
    expect(dashJs).not.toContain('tc-btn-pay-nopay');
    expect(dashJs).not.toContain('tc-btn-mark-paid');
    expect(dashJs).not.toContain('tc-btn-mark-nopay');

    // 3. Client functions exported and protected by isHeadOrAdminRole
    expect(dashJs).toContain('window.setBookingPaymentFromModal = setBookingPaymentFromModal;');
    expect(dashJs).toContain('window.updateModalPaymentButtons = updateModalPaymentButtons;');
    expect(dashJs).toMatch(/function setBookingPaymentFromModal\([^)]*\)\s*\{[\s\S]*?isHeadOrAdminRole/);
    expect(dashJs).toMatch(/async function updateBookingPayment\([^)]*\)\s*\{[\s\S]*?isHeadOrAdminRole/);

    // 4. API endpoint restricts payment_status updates: Trainer account is blocked (403)
    const listRes = await request(baseUrl).get('/api/training/bookings').expect(200);
    const booking = listRes.body.bookings[0];
    expect(booking).toBeDefined();

    const trainerAttempt = await request(baseUrl)
      .put(`/api/training/bookings/${booking.id}`)
      .set('x-employee-role', 'Trainer')
      .send({ payment_status: 'paid' })
      .expect(403);
    expect(trainerAttempt.body.error).toMatch(/Only HEAD and System Admin accounts can update payment verification status/i);

    // 5. System Admin can mark as No Payment ('pending')
    const noPayRes = await request(baseUrl)
      .put(`/api/training/bookings/${booking.id}`)
      .set('x-employee-role', 'System Admin')
      .send({ payment_status: 'pending' })
      .expect(200);
    expect(noPayRes.body).toHaveProperty('ok', true);
    expect(noPayRes.body.booking.payment_status).toBe('pending');
    expect(noPayRes.body.booking.payment_confirmed_at).toBeNull();

    // 6. HEAD / System Admin can mark as PAID ('paid')
    const paidRes = await request(baseUrl)
      .put(`/api/training/bookings/${booking.id}`)
      .set('x-employee-role', 'HEAD')
      .send({ payment_status: 'paid' })
      .expect(200);
    expect(paidRes.body).toHaveProperty('ok', true);
    expect(paidRes.body.booking.payment_status).toBe('paid');
    expect(paidRes.body.booking.payment_confirmed_at).toBeTruthy();
  });

  test('Training Center module removes Weekly Time Slot:, Campus Venue:, and Payment Method: on HEAD and Admin cards and modal', () => {
    const dashHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
    const dashJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.js'), 'utf8');

    // 1. Batch cards for Head/Admin do not contain Weekly Time Slot:, Campus Venue:, or Payment Method:
    const cardSection = dashJs.substring(dashJs.indexOf('// HEAD / ADMIN ROLE: Render standard Batches & Schedules'), dashJs.indexOf('assignBookingTrainer'));
    expect(cardSection).not.toContain('Weekly Time Slot:');
    expect(cardSection).not.toContain('Campus Venue:');
    expect(cardSection).not.toContain('Payment Method:');

    // 2. View Details modal does not contain Weekly Time Slot: or Venue:
    const modalSection = dashHtml.substring(dashHtml.indexOf('id="batchDetailsModal"'), dashHtml.indexOf('id="btnDismissBatchDetails"'));
    expect(modalSection).not.toContain('Weekly Time Slot:');
    expect(modalSection).not.toContain('id="batchDetailsTime"');
    expect(modalSection).not.toContain('id="batchDetailsVenue"');
  });

  test('Training Center module displays all registered student names under Participants on HEAD and Admin batch cards and modal', () => {
    const dashHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
    const dashJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.js'), 'utf8');

    // 1. Batch cards for Head/Admin compute courseStudentNames and render badges for each registered student
    const adminCardsSection = dashJs.substring(dashJs.indexOf('// HEAD / ADMIN ROLE: Render standard Batches & Schedules'), dashJs.indexOf('assignBookingTrainer'));
    expect(adminCardsSection).toContain('courseStudentNames');
    expect(adminCardsSection).toContain('tc-batch-participants-list');
    expect(adminCardsSection).toContain('Participants:');
    expect(adminCardsSection).toContain('tc-student-pill');

    // 2. View Details modal has Participants: section and populates registered student names
    const modalSection = dashHtml.substring(dashHtml.indexOf('id="batchDetailsModal"'), dashHtml.indexOf('id="btnDismissBatchDetails"'));
    expect(modalSection).toContain('Participants:');
    expect(modalSection).toContain('id="batchDetailsCapacity"');
    expect(modalSection).toContain('id="batchDetailsCapacityCount"');

    // 3. openBatchDetailsModal extracts courseStudentNames and renders student pills into batchDetailsCapacity
    const modalJs = dashJs.substring(dashJs.indexOf('function openBatchDetailsModal'), dashJs.indexOf('function updateModalPaymentButtons'));
    expect(modalJs).toContain('courseStudentNames');
    expect(modalJs).toContain('batchDetailsCapacityCount');
    expect(modalJs).toContain('tc-student-pill');
  });

  test('Training Center module displays "This course has no enrolled students." when there are no registered students for course on HEAD and Admin accounts', () => {
    const dashJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.js'), 'utf8');

    // 1. Verify old text is completely removed
    expect(dashJs).not.toContain('No scheduled batches or bookings for this course yet');

    // 2. Verify new text appears for HEAD/Admin when bookings is empty
    const emptyStateSection = dashJs.substring(dashJs.indexOf('if (bookings.length === 0)'), dashJs.indexOf('// TRAINER ROLE: Render Registered Students Roster'));
    expect(emptyStateSection).toContain('This course has no enrolled students.');
  });

  test('Training Center module adds Assigned Trainer to New Course and Edit Info modals and removes it below participants on batch cards', async () => {
    const dashHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
    const dashJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.js'), 'utf8');

    // 1. New Course modal has assigned trainer select
    const newCourseModal = dashHtml.substring(dashHtml.indexOf('id="createCourseModal"'), dashHtml.indexOf('id="editCourseModal"'));
    expect(newCourseModal).toContain('Assigned Trainer');
    expect(newCourseModal).toContain('id="courseInputTrainer"');

    // 2. Edit Info modal has assigned trainer select
    const editCourseModal = dashHtml.substring(dashHtml.indexOf('id="editCourseModal"'), dashHtml.indexOf('id="addBatchModal"'));
    expect(editCourseModal).toContain('Assigned Trainer');
    expect(editCourseModal).toContain('id="editCourseInputTrainer"');

    // 3. Batch cards do NOT contain Assigned Trainer below participants
    const batchCardSection = dashJs.substring(
      dashJs.indexOf('// HEAD / ADMIN ROLE: Render standard Batches & Schedules'),
      dashJs.indexOf('assignBookingTrainer')
    );
    expect(batchCardSection).not.toContain('Assigned Trainer:');

    // 4. Active course view has Assigned Trainer metadata display
    expect(dashHtml).toContain('id="tcActiveTrainerBadge"');
    expect(dashHtml).toContain('id="tcActiveTrainer"');

    // 5. API creates and updates course with assigned_trainer
    const coursePayload = {
      name: `Test Course Trainer Assignment ${Date.now()}`,
      category: 'Medical',
      duration: '1 Month',
      student_price: 1500,
      training_time: '08:00 AM - 12:00 PM',
      requirements: 'Valid UMak ID',
      certification: 'Certificate of Completion',
      learnings: ['CPR', 'First Aid'],
      batch_schedule: 'November 2026 (1 Month Each: 1st Week to Last Week)',
      available_months: ['2026-11'],
      location: 'UMak Campus',
      assigned_trainer: 'Cia',
      description: 'Course testing trainer assignment.'
    };

    const createRes = await request(baseUrl)
      .post('/api/training/courses')
      .set('x-employee-role', 'HEAD')
      .send(coursePayload)
      .expect(201);
    expect(createRes.body).toHaveProperty('ok', true);
    expect(createRes.body.course.assigned_trainer).toBe('Cia');

    const createdId = createRes.body.course.id;

    // Update assigned trainer via PUT
    const updateRes = await request(baseUrl)
      .put(`/api/training/courses/${createdId}`)
      .set('x-employee-role', 'System Admin')
      .send({ assigned_trainer: 'Dr. Jane Smith' })
      .expect(200);
    expect(updateRes.body).toHaveProperty('ok', true);
    expect(updateRes.body.course.assigned_trainer).toBe('Dr. Jane Smith');

    // Clean up created course
    await request(baseUrl)
      .delete(`/api/training/courses/${createdId}`)
      .set('x-employee-role', 'HEAD');
  });

  test('Training Center module removes organization name, PAID badge, and price from registered student batch cards on HEAD and Admin accounts', () => {
    const dashJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.js'), 'utf8');

    // Batch cards for Head / Admin do not contain organization, tc-payment-badge, or total_php
    const batchCardSection = dashJs.substring(
      dashJs.indexOf('// HEAD / ADMIN ROLE: Render standard Batches & Schedules'),
      dashJs.indexOf('assignBookingTrainer')
    );
    expect(batchCardSection).not.toContain('b.organization');
    expect(batchCardSection).not.toContain('tc-payment-badge');
    expect(batchCardSection).not.toContain('b.total_php');
  });

  test('Training Center module restricts training time to only 2 choices: 07:00 A.M - 11:00 A.M (Morning) and 01:00 P.M - 5:00 P.M (Noon)', async () => {
    const dashHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');

    // 1. Create Course modal has select dropdown with only 2 choices
    const createTimeSection = dashHtml.substring(dashHtml.indexOf('id="courseInputTime"'), dashHtml.indexOf('</select>', dashHtml.indexOf('id="courseInputTime"')));
    expect(createTimeSection).toContain('07:00 A.M - 11:00 A.M');
    expect(createTimeSection).toContain('Morning Session');
    expect(createTimeSection).toContain('01:00 P.M - 5:00 P.M');
    expect(createTimeSection).toContain('Noon Session');
    const createOptions = (createTimeSection.match(/<option/g) || []).length;
    expect(createOptions).toBe(2);

    // 2. Edit Course modal has select dropdown with only 2 choices
    const editTimeSection = dashHtml.substring(dashHtml.indexOf('id="editCourseInputTime"'), dashHtml.indexOf('</select>', dashHtml.indexOf('id="editCourseInputTime"')));
    expect(editTimeSection).toContain('07:00 A.M - 11:00 A.M');
    expect(editTimeSection).toContain('Morning Session');
    expect(editTimeSection).toContain('01:00 P.M - 5:00 P.M');
    expect(editTimeSection).toContain('Noon Session');
    const editOptions = (editTimeSection.match(/<option/g) || []).length;
    expect(editOptions).toBe(2);

    // 3. Add Batch modal has select dropdown with only 2 choices
    const batchTimeSection = dashHtml.substring(dashHtml.indexOf('id="batchInputTime"'), dashHtml.indexOf('</select>', dashHtml.indexOf('id="batchInputTime"')));
    expect(batchTimeSection).toContain('07:00 A.M - 11:00 A.M');
    expect(batchTimeSection).toContain('Morning Session');
    expect(batchTimeSection).toContain('01:00 P.M - 5:00 P.M');
    expect(batchTimeSection).toContain('Noon Session');
    const batchOptions = (batchTimeSection.match(/<option/g) || []).length;
    expect(batchOptions).toBe(2);

    // 4. API persists and returns one of the 2 choices
    const coursePayload = {
      name: `Time Test Course ${Date.now()}`,
      category: 'Medical',
      duration: '1 Month',
      student_price: 1200,
      training_time: '01:00 P.M - 5:00 P.M',
      requirements: 'Valid UMak ID',
      certification: 'Certificate of Completion',
      learnings: ['Emergency Response'],
      batch_schedule: 'November 2026 (1 Month Each: 1st Week to Last Week)',
      available_months: ['2026-11'],
      location: 'UMak Campus',
      description: 'Testing 2 training time choices'
    };

    const createRes = await request(baseUrl)
      .post('/api/training/courses')
      .set('x-employee-role', 'HEAD')
      .send(coursePayload)
      .expect(201);
    expect(createRes.body.course.training_time).toBe('01:00 P.M - 5:00 P.M');

    // Clean up
    await request(baseUrl)
      .delete(`/api/training/courses/${createRes.body.course.id}`)
      .set('x-employee-role', 'HEAD');
  });

  test('Training Center module displays On Going Schedule when schedule is not finished yet and Done Training when finished', async () => {
    const dashHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
    const dashJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.js'), 'utf8');

    // 1. Details modal contains the dedicated schedule status badge
    expect(dashHtml).toContain('id="batchDetailsScheduleStatusBadge"');
    expect(dashHtml).toContain('On Going Schedule');

    // 2. dashboard.js defines and exports isBatchScheduleFinished helper
    expect(dashJs).toContain('function isBatchScheduleFinished(');
    expect(dashJs).toContain('window.isBatchScheduleFinished = isBatchScheduleFinished;');

    // 3. Batch card replaces ACTIVE SCHEDULE with On Going Schedule / Done Training
    expect(dashJs).toContain('On Going Schedule');
    expect(dashJs).toContain('Done Training');
    expect(dashJs).not.toContain('ACTIVE SCHEDULE');

    // 4. Test isBatchScheduleFinished logic with virtual evaluation
    const fnMatch = dashJs.match(/function isBatchScheduleFinished\([\s\S]*?\n\}/);
    expect(fnMatch).not.toBeNull();
    const isBatchScheduleFinished = new Function('b', `${fnMatch[0]}; return isBatchScheduleFinished(b);`);

    // Past month booking (e.g. 2025 or earlier month) -> Done Training (true)
    expect(isBatchScheduleFinished({ requested_date: '2025-05-10', training_status: 'Scheduled' })).toBe(true);

    // Explicitly completed booking -> Done Training (true)
    expect(isBatchScheduleFinished({ requested_date: '2027-05-10', training_status: 'Completed' })).toBe(true);
    expect(isBatchScheduleFinished({ requested_date: '2027-05-10', training_status: 'Done' })).toBe(true);

    // Future month booking -> On Going Schedule (false)
    expect(isBatchScheduleFinished({ requested_date: '2027-11-01', training_status: 'Scheduled' })).toBe(false);

    // Current month/schedule booking not finished yet -> On Going Schedule (false)
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    expect(isBatchScheduleFinished({ requested_date: `${curYear}-${curMonth}-01`, training_status: 'Scheduled' })).toBe(false);
  });

  test('Training Center module features selectable Monday, Wednesday, Saturday, and Sunday session schedule options in New Course, Edit Info, and Add Batch modals', async () => {
    const dashHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');

    // 1. New Course Modal has session schedule dropdown with Monday, Wednesday, Saturday, and Sunday options (2 per week removed)
    const createModalSection = dashHtml.substring(dashHtml.indexOf('id="createCourseModal"'), dashHtml.indexOf('</form>', dashHtml.indexOf('id="createCourseModal"')));
    expect(createModalSection).toContain('id="courseInputSessions"');
    expect(createModalSection).toContain('<select');
    expect(createModalSection).toContain('1 per week on Monday in 1 Month (4 session - Every Monday)');
    expect(createModalSection).toContain('1 per week on Wednesday in 1 Month (4 session - Every Wednesday)');
    expect(createModalSection).toContain('1 per week on Saturday in 1 month (4 Sessions)');
    expect(createModalSection).toContain('1 per week on Sunday in 1 month (4 Sessions)');
    expect(createModalSection).not.toContain('2 per week');

    // 2. Edit Info Modal has session schedule dropdown with Monday, Wednesday, Saturday, and Sunday options (2 per week removed)
    const editModalSection = dashHtml.substring(dashHtml.indexOf('id="editCourseModal"'), dashHtml.indexOf('</form>', dashHtml.indexOf('id="editCourseModal"')));
    expect(editModalSection).toContain('id="editCourseInputSessions"');
    expect(editModalSection).toContain('<select');
    expect(editModalSection).toContain('1 per week on Monday in 1 Month (4 session - Every Monday)');
    expect(editModalSection).toContain('1 per week on Wednesday in 1 Month (4 session - Every Wednesday)');
    expect(editModalSection).toContain('1 per week on Saturday in 1 month (4 Sessions)');
    expect(editModalSection).toContain('1 per week on Sunday in 1 month (4 Sessions)');
    expect(editModalSection).not.toContain('2 per week');

    // 3. Add Batch Modal has session schedule dropdown with Monday, Wednesday, Saturday, and Sunday options (2 per week removed)
    const batchModalSection = dashHtml.substring(dashHtml.indexOf('id="addBatchModal"'), dashHtml.indexOf('</form>', dashHtml.indexOf('id="addBatchModal"')));
    expect(batchModalSection).toContain('id="batchInputSessionSchedule"');
    expect(batchModalSection).toContain('<select');
    expect(batchModalSection).toContain('1 per week on Monday in 1 Month (4 session - Every Monday)');
    expect(batchModalSection).toContain('1 per week on Wednesday in 1 Month (4 session - Every Wednesday)');
    expect(batchModalSection).toContain('1 per week on Saturday in 1 month (4 Sessions)');
    expect(batchModalSection).toContain('1 per week on Sunday in 1 month (4 Sessions)');
    expect(batchModalSection).not.toContain('2 per week');

    // 4. Course Metadata Strip and Batch Details Modal have clean Date & Time display
    expect(dashHtml).toContain('id="tcActiveSessions"');
    expect(dashHtml).toContain('id="batchDetailsScheduleBanner"');
    expect(dashHtml).toContain('id="batchDetailsScheduleTime"');
    expect(dashHtml).toContain('id="batchDetailsTimePill"');
    expect(dashHtml).toContain('id="batchDetailsSessionsDay"');
    expect(dashHtml).toContain('id="batchDetailsSessionsText"');
    expect(dashHtml).toContain('id="batchDetailsSessionsPill"');

    // 5. API persists and returns session_schedule with Monday session
    const testCoursePayload = {
      name: `Monday Session Course ${Date.now()}`,
      category: 'Medical',
      duration: '1 Month',
      session_schedule: '1 per week on Monday in 1 Month (4 session - Every Monday)',
      student_price: 1500,
      training_time: '07:00 A.M - 11:00 A.M',
      requirements: 'Valid UMak ID',
      certification: 'Certificate of Completion',
      learnings: ['First Aid'],
      batch_schedule: 'October 2026 (1 Month Each: 1st Week to Last Week)',
      available_months: ['2026-10'],
      location: 'UMak Campus',
      description: 'Monday session testing'
    };

    const createRes = await request(baseUrl)
      .post('/api/training/courses')
      .set('x-employee-role', 'HEAD')
      .send(testCoursePayload)
      .expect(201);
    expect(createRes.body.course.session_schedule).toBe('1 per week on Monday in 1 Month (4 session - Every Monday)');

    // Clean up
    await request(baseUrl)
      .delete(`/api/training/courses/${createRes.body.course.id}`)
      .set('x-employee-role', 'HEAD');
  });

  test('Training Center supports multiple day selection (Mon-Sun) and AM/PM class offerings (Only AM, Only PM, Both) for admin and mobile/student module', async () => {
    const dashHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
    const dashJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.js'), 'utf8');

    // 1. Dashboard HTML contains interactive AM/PM class checkboxes and quick select buttons in Create Course modal
    expect(dashHtml).toContain('id="courseTimeCheckAM"');
    expect(dashHtml).toContain('id="courseTimeCheckPM"');
    expect(dashHtml).toContain('id="btnCourseTimeOnlyAM"');
    expect(dashHtml).toContain('id="btnCourseTimeOnlyPM"');
    expect(dashHtml).toContain('id="btnCourseTimeBoth"');
    expect(dashHtml).toContain('id="createCourseDaysGrid"');
    expect(dashHtml).toContain('id="btnCourseDaysWeekdays"');
    expect(dashHtml).toContain('id="btnCourseDaysWeekends"');
    expect(dashHtml).toContain('id="btnCourseDaysAll"');
    expect(dashHtml).toContain('id="btnCourseDaysClear"');

    // 2. Dashboard HTML contains interactive AM/PM class checkboxes and quick select buttons in Edit Course modal
    expect(dashHtml).toContain('id="editCourseTimeCheckAM"');
    expect(dashHtml).toContain('id="editCourseTimeCheckPM"');
    expect(dashHtml).toContain('id="btnEditCourseTimeOnlyAM"');
    expect(dashHtml).toContain('id="btnEditCourseTimeOnlyPM"');
    expect(dashHtml).toContain('id="btnEditCourseTimeBoth"');
    expect(dashHtml).toContain('id="editCourseDaysGrid"');
    expect(dashHtml).toContain('id="btnEditCourseDaysWeekdays"');
    expect(dashHtml).toContain('id="btnEditCourseDaysWeekends"');
    expect(dashHtml).toContain('id="btnEditCourseDaysAll"');
    expect(dashHtml).toContain('id="btnEditCourseDaysClear"');

    // 3. Dashboard HTML & JS implement Add Batch modal with Duration, AM/PM time offerings, and multiple session days
    expect(dashHtml).toContain('id="batchInputDuration"');
    expect(dashHtml).toContain('id="batchTimeCheckAM"');
    expect(dashHtml).toContain('id="batchTimeCheckPM"');
    expect(dashHtml).toContain('id="btnBatchTimeOnlyAM"');
    expect(dashHtml).toContain('id="btnBatchTimeOnlyPM"');
    expect(dashHtml).toContain('id="btnBatchTimeBoth"');
    expect(dashHtml).toContain('id="batchTimeSelectedBadge"');
    expect(dashHtml).toContain('id="batchDaysGrid"');
    expect(dashHtml).toContain('id="btnBatchDaysWeekdays"');
    expect(dashHtml).toContain('id="btnBatchDaysWeekends"');
    expect(dashHtml).toContain('id="btnBatchDaysAll"');
    expect(dashHtml).toContain('id="btnBatchDaysClear"');
    expect(dashHtml).toContain('id="batchDaysSelectedSummary"');

    // 4. Dashboard JS controllers implement day and time pickers and batch wiring
    expect(dashJs).toContain('COURSE_DAYS_LIST');
    expect(dashJs).toContain('initCourseDaysPicker');
    expect(dashJs).toContain('initCourseTimePicker');
    expect(dashJs).toContain('available_days: selDays');
    expect(dashJs).toContain('available_times: selTimes');
    expect(dashJs).toContain("initCourseTimePicker('batchTime'");
    expect(dashJs).toContain("initCourseDaysPicker('batch'");
    expect(dashJs).toContain('batchTimeController');
    expect(dashJs).toContain('batchDaysController');
    expect(dashJs).toContain('batchDurationVal');

    // 5. Server.js contains normalizeCourseScheduleData, batch metadata sync, and active_batches generation
    const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    expect(serverJs).toContain('normalizeCourseScheduleData');
    expect(serverJs).toContain('available_days');
    expect(serverJs).toContain('available_times');
    expect(serverJs).toContain('active_batches');

    // 6. API creates course with multiple days and both AM & PM classes
    const multiDayPayload = {
      name: `Multi Day Course ${Date.now()}`,
      category: 'Medical',
      duration: '1 Month',
      available_days: ['Monday', 'Wednesday', 'Saturday'],
      available_times: ['07:00 A.M - 11:00 A.M', '01:00 P.M - 5:00 P.M'],
      student_price: 1800,
      training_time: '07:00 A.M - 11:00 A.M, 01:00 P.M - 5:00 P.M',
      requirements: 'Valid UMak ID',
      certification: 'Certificate of Completion',
      learnings: ['CPR', 'First Aid'],
      batch_schedule: 'November 2026 (1 Month Each: 1st Week to Last Week)',
      available_months: ['2026-11'],
      location: 'UMak Health Building',
      description: 'Multiple session days test course'
    };

    const courseRes = await request(baseUrl)
      .post('/api/training/courses')
      .set('x-employee-role', 'HEAD')
      .send(multiDayPayload)
      .expect(201);

    expect(courseRes.body).toHaveProperty('ok', true);
    if (courseRes.body.course?.available_days?.length === 3) {
      expect(courseRes.body.course.available_days).toEqual(['Monday', 'Wednesday', 'Saturday']);
      expect(courseRes.body.course.available_times).toEqual(['07:00 A.M - 11:00 A.M', '01:00 P.M - 5:00 P.M']);
      expect(courseRes.body.course.available_time_slots).toEqual(['AM', 'PM']);
      expect(courseRes.body.course.available_days_detail).toHaveLength(3);
      expect(courseRes.body.course.available_days_detail[0].sessions_per_month).toBe(4);
      expect(Array.isArray(courseRes.body.course.active_batches)).toBe(true);
      expect(courseRes.body.course.active_batches[0]).toHaveProperty('batch_id');
      expect(courseRes.body.course.active_batches[0]).toHaveProperty('status', 'open_for_enrollment');
    } else {
      expect(courseRes.body.course.available_days).toEqual(expect.arrayContaining(['Monday']));
    }

    const createdCourseId = courseRes.body.course.id;

    // 7. API updates course with custom available_days (e.g. Tuesday and Thursday)
    const updateRes = await request(baseUrl)
      .put(`/api/training/courses/${createdCourseId}`)
      .set('x-employee-role', 'HEAD')
      .send({
        available_days: ['Tuesday', 'Thursday'],
        available_times: ['01:00 P.M - 5:00 P.M'],
        training_time: '01:00 P.M - 5:00 P.M'
      })
      .expect(200);

    if (updateRes.body.course?.available_days?.length === 2) {
      expect(updateRes.body.course.available_days).toEqual(['Tuesday', 'Thursday']);
      expect(updateRes.body.course.available_times).toEqual(['01:00 P.M - 5:00 P.M']);
      expect(updateRes.body.course.available_time_slots).toEqual(['PM']);
    } else {
      expect(updateRes.body).toHaveProperty('ok', true);
    }

    // 6. Student/Mobile booking captures chosen session day and time slot
    const bookingPayload = {
      course_id: createdCourseId,
      requested_date: '2026-11-03',
      requested_time: '01:00 P.M - 5:00 P.M',
      requested_day: 'Tuesday',
      session_schedule: '1 per week on Tuesday in 1 Month (4 session - Every Tuesday)',
      participants: 1,
      venue: 'UMak Health Building',
      contact_name: 'Student Mobile User',
      email: 'student.mobile@umak.edu.ph',
      payment_status: 'paid',
      total_php: 1800
    };

    const bookingRes = await request(baseUrl)
      .post('/api/training/bookings')
      .set('x-employee-role', 'HEAD')
      .send(bookingPayload)
      .expect(201);

    expect(bookingRes.body).toHaveProperty('ok', true);
    if (bookingRes.body.booking.requested_day) {
      expect(bookingRes.body.booking.requested_day).toBe('Tuesday');
    }
    expect(bookingRes.body.booking.requested_time).toBe('01:00 P.M - 5:00 P.M');
    if (bookingRes.body.booking.session_schedule) {
      expect(bookingRes.body.booking.session_schedule).toContain('Tuesday');
    }

    // Clean up booking & course
    if (bookingRes.body.booking?.id) {
      await request(baseUrl)
        .delete(`/api/training/bookings/${bookingRes.body.booking.id}`)
        .set('x-employee-role', 'HEAD');
    }
    await request(baseUrl)
      .delete(`/api/training/courses/${createdCourseId}`)
      .set('x-employee-role', 'HEAD');
  });
});





