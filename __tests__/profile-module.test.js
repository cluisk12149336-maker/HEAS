const request = require('supertest');
const fs = require('fs');
const path = require('path');

describe('Profile / Account Module', () => {
  const baseUrl = 'http://localhost:3000';

  test('GET /api/profile returns complete profile details matching design', async () => {
    const res = await request(baseUrl)
      .get('/api/profile')
      .expect(200);

    expect(res.body).toHaveProperty('ok', true);
    expect(res.body).toHaveProperty('profile');
    const profile = res.body.profile;
    expect(profile).toHaveProperty('employee_id');
    expect(profile).toHaveProperty('employee_name');
    expect(profile).toHaveProperty('username');
    expect(profile).toHaveProperty('employee_email');
    expect(profile).toHaveProperty('employee_role');
    expect(profile).toHaveProperty('employee_status');
    expect(profile).toHaveProperty('avatar_url');
    expect(profile).toHaveProperty('last_activity');
  });

  test('PUT /api/profile validates empty name or username', async () => {
    const res1 = await request(baseUrl)
      .put('/api/profile')
      .send({ name: '', username: 'admin_test', email: 'test@umak.edu.ph' })
      .expect(400);

    expect(res1.body.error).toMatch(/name cannot be empty/i);

    const res2 = await request(baseUrl)
      .put('/api/profile')
      .send({ name: 'Valid Name', username: '', email: 'test@umak.edu.ph' })
      .expect(400);

    expect(res2.body.error).toMatch(/username cannot be empty/i);
  });

  test('PUT /api/profile validates email format', async () => {
    const res = await request(baseUrl)
      .put('/api/profile')
      .send({ name: 'Valid Name', username: 'valid_user', email: 'not-an-email' })
      .expect(400);

    expect(res.body.error).toMatch(/valid email/i);
  });

  test('PUT /api/profile successfully updates information and persists', async () => {
    const res = await request(baseUrl)
      .put('/api/profile')
      .send({
        name: 'Jolehmeh Billones',
        username: 'admin_joleh',
        email: 'juliemay1917@gmail.com'
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.profile.employee_name).toBe('Jolehmeh Billones');
    expect(res.body.profile.username).toBe('admin_joleh');
    expect(res.body.profile.employee_email).toBe('juliemay1917@gmail.com');

    // Verify GET reflects the changes
    const verifyRes = await request(baseUrl).get('/api/profile').expect(200);
    expect(verifyRes.body.profile.employee_name).toBe('Jolehmeh Billones');
    expect(verifyRes.body.profile.username).toBe('admin_joleh');
  });

  test('POST /api/profile/avatar rejects unsupported mime types', async () => {
    const res = await request(baseUrl)
      .post('/api/profile/avatar')
      .send({
        imageBase64: Buffer.from('fake-svg-data').toString('base64'),
        mimeType: 'application/pdf',
        fileName: 'test.pdf'
      })
      .expect(400);

    expect(res.body.error).toMatch(/Allowed image formats/i);
  });

  test('POST /api/profile/avatar uploads picture and returns public url', async () => {
    const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const res = await request(baseUrl)
      .post('/api/profile/avatar')
      .send({
        imageBase64: samplePngBase64,
        mimeType: 'image/png',
        fileName: 'sample-avatar.png'
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.avatar_url).toBeTruthy();
    expect(res.body.message).toMatch(/Profile picture updated/i);
  });
});
