# LogiTrack | Supply Chain & Logistics Control Tower

LogiTrack is a high-performance, responsive logistics control dashboard for tracking shipments from origin warehouses to consumer destinations. Features include interactive route mapping, courier fleet logs, digital canvas signatures, and a secure user authentication layer.

Designed with a high-contrast **Light Design System** (white background, slate-black typography, and royal blue button components).

## 🚀 Key Features

*   **🔒 Secure Auth Portal**: Built-in register and sign-in gates before dashboard entry. Employs token-based authorizations and secure password hashing.
*   **🗺️ Interactive Route Maps**: Leverages Leaflet.js with CartoDB Positron Light tiles to display warehouses, customer locations, and animate active couriers along polylines.
*   **🖱️ Smart Coord Selector**: Open the "New Shipment" modal and click anywhere on the Leaflet map to capture and autopopulate coordinates instantly.
*   **✍️ Digital Signature Canvas**: Couriers or recipients can sign directly on an HTML5 canvas drawing pad. Signatures are converted to PNG images and stored securely on the server.
*   **📊 Live Fleet Telemetry**: Status monitoring for shipments (`Pending`, `In Transit`, `Out for Delivery`, `Delivered`, `Cancelled`) and courier availability.

---

## 🛠️ Technology Stack

*   **Frontend**: HTML5, Vanilla CSS3 (Custom light theme tokens, cards, grids, transitions), JavaScript ES6+ (fetch API, canvas, Leaflet maps).
*   **Backend**: Node.js & Express.js.
*   **Database**: Local JSON-file database (`data/db.json`) for zero-configuration setup.
*   **Security**: Cryptographic password hashing (SHA-256 with salts) using Node's native `crypto` module and token session verification middleware.
*   **Testing**: API endpoints validation using Jest and Supertest.

---

## 📥 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (v18+ recommended).

### Installation & Run

1.  Clone the repository or navigate to the directory:
    ```bash
    cd Demo
    ```
2.  Install all required dependencies:
    ```bash
    npm install
    ```
3.  Start the Express server:
    ```bash
    npm start
    ```
4.  Open the web application:
    Navigate to **[http://localhost:3000](http://localhost:3000)** in your browser.

### 🔑 Demo Login
A default administrator account is seeded on startup:
*   **Username**: `admin`
*   **Password**: `password123`

---

## 🧪 Running Automated Tests

A comprehensive suite of 11 API validation tests verifies authorization checks, login/registration endpoints, shipment updates, and signature uploading:

```bash
npm test
```

### Test Validation Output:
```
  Logistics Tracker API with Authentication
    √ GET /api/shipments without token should return 401 Unauthorized (86 ms)
    √ GET /api/couriers without token should return 401 Unauthorized (35 ms)
    √ POST /api/auth/login with invalid credentials should return 400 (56 ms)
    √ POST /api/auth/login with correct credentials should return token (35 ms)
    √ GET /api/shipments with token should return shipments array (44 ms)
    √ GET /api/couriers with token should return couriers array (30 ms)
    √ POST /api/shipments with token should create shipment (21 ms)
    √ PUT /api/shipments/:id with token should update status and courier (29 ms)
    √ POST /api/shipments/:id/signature with token should upload signature and deliver (28 ms)
    √ GET /api/shipments/:id with token should return details of specific shipment (32 ms)
    √ GET /api/shipments/INVALID should return 404 (34 ms)

Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
Snapshots:   0 total
Time:        4.059 s
```

---

## 📂 Project Structure

```
Demo/
├── data/
│   └── db.json               # Seeded JSON database (users, shipments, couriers)
├── public/
│   ├── css/
│   │   └── style.css         # UI CSS variables, forms, grids, components
│   ├── js/
│   │   └── app.js            # Auth checking, map loading, and API connections
│   └── index.html            # Main markup and modal views
├── tests/
│   └── api.test.js           # Jest endpoint testing suite
├── uploads/                  # Recipient signature image directory
├── server.js                 # Express server & API routes
├── package.json              # NPM dependencies & test scripts
└── README.md                 # Project Documentation
```
