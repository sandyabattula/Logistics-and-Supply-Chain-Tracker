const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Reference the Express app in server.js
const app = require('../server');

const dbPath = path.join(__dirname, '..', 'data', 'db.json');

describe('Logistics Tracker API with Authentication', () => {
  let dbBackup;
  let authToken = '';
  let testShipmentId = '';

  // Backup database before tests
  beforeAll(async () => {
    dbBackup = fs.readFileSync(dbPath, 'utf8');
    
    // Register a test user to obtain a token for subsequently protected requests
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'testuser',
        password: 'password123'
      });
      
    authToken = regRes.body.token;
  });

  // Restore database after all tests complete
  afterAll(async () => {
    fs.writeFileSync(dbPath, dbBackup, 'utf8');
    // Close Express server connection
    await new Promise((resolve) => app.close(resolve));
  });

  test('GET /api/shipments without token should return 401 Unauthorized', async () => {
    const res = await request(app).get('/api/shipments');
    expect(res.statusCode).toEqual(401);
    expect(res.body).toHaveProperty('error');
  });

  test('GET /api/couriers without token should return 401 Unauthorized', async () => {
    const res = await request(app).get('/api/couriers');
    expect(res.statusCode).toEqual(401);
  });

  test('POST /api/auth/login with invalid credentials should return 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testuser',
        password: 'wrongpassword'
      });
      
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /api/auth/login with correct credentials should return token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testuser',
        password: 'password123'
      });
      
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.username).toEqual('testuser');
  });

  test('GET /api/shipments with token should return shipments array', async () => {
    const res = await request(app)
      .get('/api/shipments')
      .set('Authorization', `Bearer ${authToken}`);
      
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/couriers with token should return couriers array', async () => {
    const res = await request(app)
      .get('/api/couriers')
      .set('Authorization', `Bearer ${authToken}`);
      
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/shipments with token should create shipment', async () => {
    const newShipment = {
      originName: 'Manhattan Depot (W-1)',
      originCoords: [40.7580, -73.9855],
      destinationName: 'Test Place',
      destinationCoords: [40.7306, -73.9352],
      consumerName: 'Authenticated Tester'
    };

    const res = await request(app)
      .post('/api/shipments')
      .set('Authorization', `Bearer ${authToken}`)
      .send(newShipment);

    expect(res.statusCode).toEqual(201);
    expect(res.body.consumerName).toEqual('Authenticated Tester');
    
    testShipmentId = res.body.id;
  });

  test('PUT /api/shipments/:id with token should update status and courier', async () => {
    const res = await request(app)
      .put(`/api/shipments/${testShipmentId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        status: 'In Transit',
        courierId: 'CR-01'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('In Transit');
    expect(res.body.courierId).toEqual('CR-01');
  });

  test('POST /api/shipments/:id/signature with token should upload signature and deliver', async () => {
    const res = await request(app)
      .post(`/api/shipments/${testShipmentId}/signature`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('Delivered');
    expect(res.body.signatureUrl).toContain('/uploads/signature_');
  });

  test('GET /api/shipments/:id with token should return details of specific shipment', async () => {
    const res = await request(app)
      .get(`/api/shipments/${testShipmentId}`)
      .set('Authorization', `Bearer ${authToken}`);
      
    expect(res.statusCode).toEqual(200);
    expect(res.body.id).toEqual(testShipmentId);
    expect(res.body.status).toEqual('Delivered');
  });

  test('GET /api/shipments/INVALID should return 404', async () => {
    const res = await request(app)
      .get('/api/shipments/SH-INVALID')
      .set('Authorization', `Bearer ${authToken}`);
      
    expect(res.statusCode).toEqual(404);
  });
});
