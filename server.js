const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing with custom limit for base64 signature images
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));
// Serve uploaded signatures static folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const dbPath = path.join(__dirname, 'data', 'db.json');
const uploadsDir = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// In-memory active session tokens store (Token -> User details)
const activeSessions = new Map();

// Crypto helpers for authentication
function hashPassword(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Database helper functions
function readDB() {
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading DB:', error);
    return { users: [], shipments: [], couriers: [] };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing DB:', error);
    return false;
  }
}

// Seed admin user on start if users is empty
function seedAdminUser() {
  const db = readDB();
  if (!db.users || db.users.length === 0) {
    const salt = generateSalt();
    const passwordHash = hashPassword('password123', salt);
    
    db.users = [{
      id: 'USR-01',
      username: 'admin',
      salt: salt,
      passwordHash: passwordHash,
      createdAt: new Date().toISOString()
    }];
    
    writeDB(db);
    console.log('Seeded demo admin user (username: "admin", password: "password123")');
  }
}
seedAdminUser();

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token is missing or invalid' });
  }

  const sessionUser = activeSessions.get(token);
  if (!sessionUser) {
    return res.status(401).json({ error: 'Session expired or invalid token' });
  }

  req.user = sessionUser;
  next();
}

// REST API Endpoints - AUTHENTICATION

// 1. Register User
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const db = readDB();
  
  // Check if username exists
  const existingUser = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ error: 'Username is already taken' });
  }

  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);
  
  const nextId = db.users.length > 0 
    ? 'USR-' + (Math.max(...db.users.map(u => parseInt(u.id.split('-')[1]))) + 1)
    : 'USR-01';

  const newUser = {
    id: nextId,
    username,
    salt,
    passwordHash,
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  writeDB(db);

  // Automatically log in the user upon registration
  const token = generateToken();
  activeSessions.set(token, { id: newUser.id, username: newUser.username });

  res.status(201).json({
    message: 'User registered successfully',
    token,
    username: newUser.username
  });
});

// 2. Login User
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const db = readDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!user) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }

  // Verify password hash
  const computedHash = hashPassword(password, user.salt);
  if (computedHash !== user.passwordHash) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }

  const token = generateToken();
  activeSessions.set(token, { id: user.id, username: user.username });

  res.json({
    message: 'Login successful',
    token,
    username: user.username
  });
});

// 3. Logout User
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    activeSessions.delete(token);
  }
  
  res.json({ message: 'Logged out successfully' });
});

// REST API Endpoints - SECURED SHIPMENTS & COURIERS (Protected by authenticateToken)

// 4. Get all shipments
app.get('/api/shipments', authenticateToken, (req, res) => {
  const db = readDB();
  res.json(db.shipments);
});

// 5. Get shipment by ID
app.get('/api/shipments/:id', authenticateToken, (req, res) => {
  const db = readDB();
  const shipment = db.shipments.find(s => s.id === req.params.id);
  if (!shipment) {
    return res.status(404).json({ error: 'Shipment not found' });
  }
  res.json(shipment);
});

// 6. Create a new shipment
app.post('/api/shipments', authenticateToken, (req, res) => {
  const { originName, originCoords, destinationName, destinationCoords, consumerName } = req.body;

  if (!originName || !originCoords || !destinationName || !destinationCoords || !consumerName) {
    return res.status(400).json({ error: 'Missing required shipment details' });
  }

  const db = readDB();
  
  // Generate ID: SH-1001, SH-1002, etc.
  const nextId = db.shipments.length > 0 
    ? 'SH-' + (Math.max(...db.shipments.map(s => parseInt(s.id.split('-')[1]))) + 1)
    : 'SH-1001';

  const newShipment = {
    id: nextId,
    originName,
    originCoords: [parseFloat(originCoords[0]), parseFloat(originCoords[1])],
    destinationName,
    destinationCoords: [parseFloat(destinationCoords[0]), parseFloat(destinationCoords[1])],
    consumerName,
    courierId: null,
    status: 'Pending',
    signatureUrl: null,
    createdAt: new Date().toISOString()
  };

  db.shipments.push(newShipment);
  writeDB(db);

  res.status(201).json(newShipment);
});

// 7. Update shipment status and/or courier assignment
app.put('/api/shipments/:id', authenticateToken, (req, res) => {
  const db = readDB();
  const shipmentIndex = db.shipments.findIndex(s => s.id === req.params.id);

  if (shipmentIndex === -1) {
    return res.status(404).json({ error: 'Shipment not found' });
  }

  const { status, courierId } = req.body;
  const shipment = db.shipments[shipmentIndex];

  if (status) {
    shipment.status = status;
  }

  if (courierId !== undefined) {
    const prevCourierId = shipment.courierId;
    shipment.courierId = courierId;

    // Update statuses of couriers involved
    if (courierId) {
      const newCourier = db.couriers.find(c => c.id === courierId);
      if (newCourier) {
        newCourier.status = 'On Delivery';
      }
      // If assignment was updated, set shipment status to "In Transit" or "Out for Delivery" if it was "Pending"
      if (shipment.status === 'Pending') {
        shipment.status = 'In Transit';
      }
    }

    if (prevCourierId && prevCourierId !== courierId) {
      // Check if old courier has other active shipments
      const hasOtherShipments = db.shipments.some(s => s.id !== shipment.id && s.courierId === prevCourierId && ['In Transit', 'Out for Delivery'].includes(s.status));
      if (!hasOtherShipments) {
        const oldCourier = db.couriers.find(c => c.id === prevCourierId);
        if (oldCourier) {
          oldCourier.status = 'Available';
        }
      }
    }
  }

  db.shipments[shipmentIndex] = shipment;
  writeDB(db);

  res.json(shipment);
});

// 8. Upload signature and complete delivery
app.post('/api/shipments/:id/signature', authenticateToken, (req, res) => {
  const { signatureData } = req.body; // base64 data url e.g. "data:image/png;base64,..."

  if (!signatureData) {
    return res.status(400).json({ error: 'Signature data is required' });
  }

  const db = readDB();
  const shipmentIndex = db.shipments.findIndex(s => s.id === req.params.id);

  if (shipmentIndex === -1) {
    return res.status(404).json({ error: 'Shipment not found' });
  }

  const shipment = db.shipments[shipmentIndex];
  
  // Extract base64 image data and save it as a file
  try {
    const matches = signatureData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid base64 signature format' });
    }

    const imageBuffer = Buffer.from(matches[2], 'base64');
    const filename = `signature_${shipment.id}_${Date.now()}.png`;
    const filepath = path.join(uploadsDir, filename);

    fs.writeFileSync(filepath, imageBuffer);

    // Update shipment details in db
    shipment.signatureUrl = `/uploads/${filename}`;
    shipment.status = 'Delivered';

    // Update courier status to Available if they have no other active shipments
    if (shipment.courierId) {
      const hasOtherShipments = db.shipments.some(
        s => s.id !== shipment.id && 
             s.courierId === shipment.courierId && 
             ['In Transit', 'Out for Delivery'].includes(s.status)
      );
      if (!hasOtherShipments) {
        const courier = db.couriers.find(c => c.id === shipment.courierId);
        if (courier) {
          courier.status = 'Available';
        }
      }
    }

    db.shipments[shipmentIndex] = shipment;
    writeDB(db);

    res.json(shipment);
  } catch (error) {
    console.error('Failed to save signature:', error);
    res.status(500).json({ error: 'Failed to process signature upload' });
  }
});

// 9. Get all couriers
app.get('/api/couriers', authenticateToken, (req, res) => {
  const db = readDB();
  res.json(db.couriers);
});

// 10. Add a new courier
app.post('/api/couriers', authenticateToken, (req, res) => {
  const { name, phone, vehicleType } = req.body;

  if (!name || !phone || !vehicleType) {
    return res.status(400).json({ error: 'Missing required courier details' });
  }

  const db = readDB();

  // Generate ID: CR-01, CR-02, etc.
  const nextId = db.couriers.length > 0
    ? 'CR-' + String(Math.max(...db.couriers.map(c => parseInt(c.id.split('-')[1]))) + 1).padStart(2, '0')
    : 'CR-01';

  const newCourier = {
    id: nextId,
    name,
    phone,
    vehicleType,
    status: 'Available'
  };

  db.couriers.push(newCourier);
  writeDB(db);

  res.status(201).json(newCourier);
});

// Start express server
const server = app.listen(PORT, () => {
  console.log(`Logistics Tracker Server running on port ${PORT}`);
});

module.exports = server; // Export for testing
