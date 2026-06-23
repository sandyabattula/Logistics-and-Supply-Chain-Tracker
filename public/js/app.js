// ==========================================================================
// APP STATE & CONSTANTS
// ==========================================================================
let shipments = [];
let couriers = [];
let selectedShipmentId = null;

// Map elements
let map = null;
let mapMarkers = [];
let activeRouteLine = null;
let tempDestMarker = null;

// Signature Pad variables
let canvas = null;
let ctx = null;
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// API URL (same host since backend serves public folder)
const API_BASE = '/api';

// Get active auth token from local storage
function getToken() {
  return localStorage.getItem('token');
}

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
}

// ==========================================================================
// INIT APP
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupAuthListeners();
  checkAuth();
});

// ==========================================================================
// AUTHENTICATION MANAGEMENT
// ==========================================================================
function checkAuth() {
  const token = getToken();
  const username = localStorage.getItem('username');
  const authPortal = document.getElementById('auth-portal');
  const appWrapper = document.getElementById('app-wrapper');

  if (token) {
    // Show application, hide auth portal
    authPortal.classList.add('hidden');
    appWrapper.classList.remove('hidden');
    
    // Display logged-in username
    document.getElementById('username-display').textContent = username || 'User';
    
    // Initialize application map and load data if not done
    if (!map) {
      initMap();
      initSignaturePad();
      setupEventListeners();
    }
    loadDashboardData();
  } else {
    // Show auth portal, hide application
    authPortal.classList.remove('hidden');
    appWrapper.classList.add('hidden');
  }
}

function setupAuthListeners() {
  // Toggle between Login and Register tabs
  document.getElementById('link-goto-register').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('auth-login-container').classList.remove('active');
    document.getElementById('auth-register-container').classList.add('active');
    clearAuthErrors();
  });

  document.getElementById('link-goto-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('auth-register-container').classList.remove('active');
    document.getElementById('auth-login-container').classList.add('active');
    clearAuthErrors();
  });

  // Handle Login Form
  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username').value;
    const passwordInput = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');

    errorDiv.classList.remove('visible');

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });

      const data = await res.json();

      if (res.ok) {
        // Save token and username
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        
        // Reset form and verify view
        document.getElementById('form-login').reset();
        checkAuth();
      } else {
        errorDiv.textContent = data.error || 'Login failed';
        errorDiv.classList.add('visible');
      }
    } catch (err) {
      console.error(err);
      errorDiv.textContent = 'Server communication error';
      errorDiv.classList.add('visible');
    }
  });

  // Handle Register Form
  document.getElementById('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const usernameInput = document.getElementById('register-username').value;
    const passwordInput = document.getElementById('register-password').value;
    const confirmInput = document.getElementById('register-confirm').value;
    const errorDiv = document.getElementById('register-error');

    errorDiv.classList.remove('visible');

    if (passwordInput !== confirmInput) {
      errorDiv.textContent = 'Passwords do not match';
      errorDiv.classList.add('visible');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });

      const data = await res.json();

      if (res.ok) {
        // Save token and username
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        
        // Reset form and verify view
        document.getElementById('form-register').reset();
        checkAuth();
      } else {
        errorDiv.textContent = data.error || 'Registration failed';
        errorDiv.classList.add('visible');
      }
    } catch (err) {
      console.error(err);
      errorDiv.textContent = 'Server communication error';
      errorDiv.classList.add('visible');
    }
  });

  // Handle Logout Button
  document.getElementById('btn-logout').addEventListener('click', async () => {
    try {
      // Notify backend to end session
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
    } catch (err) {
      console.error('Logout request failed:', err);
    } finally {
      // Clear token details and redirect
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      
      // Reset variables
      selectedShipmentId = null;
      clearMapOverlays();
      if (map) {
        map.remove();
        map = null;
      }
      
      checkAuth();
    }
  });
}

function clearAuthErrors() {
  document.getElementById('login-error').classList.remove('visible');
  document.getElementById('register-error').classList.remove('visible');
}

// Global API Fetch Interceptor wrapper to check for 401 Session expirations
async function secureFetch(url, options = {}) {
  options.headers = {
    ...options.headers,
    ...getAuthHeaders()
  };

  try {
    const response = await fetch(url, options);
    
    if (response.status === 401) {
      // Auto-logout user if session is invalid
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      checkAuth();
      throw new Error('Session expired');
    }
    
    return response;
  } catch (err) {
    throw err;
  }
}

// ==========================================================================
// MAP FUNCTIONS (LIGHT THEME MATCHING POSITRON TILES)
// ==========================================================================
function initMap() {
  // Center near New York City
  map = L.map('map', {
    zoomControl: true,
    attributionControl: true
  }).setView([40.730610, -73.935242], 12);

  // CartoDB Positron Light map tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  // Setup click listener on map to select coordinates for new shipments
  map.on('click', (e) => {
    const shipmentModal = document.getElementById('modal-shipment');
    if (shipmentModal.classList.contains('active')) {
      const lat = e.latlng.lat.toFixed(6);
      const lng = e.latlng.lng.toFixed(6);
      
      document.getElementById('input-dest-lat').value = lat;
      document.getElementById('input-dest-lng').value = lng;
      
      // Update or place temp destination marker
      if (tempDestMarker) {
        tempDestMarker.setLatLng(e.latlng);
      } else {
        const destIcon = L.divIcon({
          className: 'map-marker-icon',
          html: `<div class="marker-pin-dest"><i class="fa-solid fa-crosshairs"></i></div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 24]
        });
        tempDestMarker = L.marker(e.latlng, { icon: destIcon }).addTo(map);
      }
    }
  });
}

function clearMapOverlays() {
  mapMarkers.forEach(marker => {
    if (map) map.removeLayer(marker);
  });
  mapMarkers = [];
  
  if (activeRouteLine && map) {
    map.removeLayer(activeRouteLine);
    activeRouteLine = null;
  }
}

function drawShipmentRoute(shipment) {
  clearMapOverlays();
  
  const origin = shipment.originCoords;
  const destination = shipment.destinationCoords;
  
  const originIcon = L.divIcon({
    className: 'map-marker-icon',
    html: `<div class="marker-pin-origin"><i class="fa-solid fa-warehouse"></i></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24]
  });

  const destIcon = L.divIcon({
    className: 'map-marker-icon',
    html: `<div class="marker-pin-dest"><i class="fa-solid fa-house-user"></i></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24]
  });
  
  const originMarker = L.marker(origin, { icon: originIcon })
    .bindPopup(`<h4>Warehouse Origin</h4><p>${shipment.originName}</p>`)
    .addTo(map);
    
  const destMarker = L.marker(destination, { icon: destIcon })
    .bindPopup(`<h4>Destination</h4><p>${shipment.consumerName}<br>${shipment.destinationName}</p>`)
    .addTo(map);
    
  mapMarkers.push(originMarker, destMarker);
  
  activeRouteLine = L.polyline([origin, destination], {
    color: '#2563eb', // Royal Blue route line
    weight: 4,
    opacity: 0.8,
    dashArray: shipment.status === 'In Transit' ? '8, 8' : null
  }).addTo(map);

  if (shipment.courierId && shipment.status !== 'Pending') {
    const courier = couriers.find(c => c.id === shipment.courierId);
    let courierCoords = [...origin];
    
    if (shipment.status === 'Delivered') {
      courierCoords = [...destination];
    } else if (shipment.status === 'Out for Delivery') {
      courierCoords = [
        origin[0] + (destination[0] - origin[0]) * 0.75,
        origin[1] + (destination[1] - origin[1]) * 0.75
      ];
    } else if (shipment.status === 'In Transit') {
      courierCoords = [
        origin[0] + (destination[0] - origin[0]) * 0.35,
        origin[1] + (destination[1] - origin[1]) * 0.35
      ];
    }
    
    const courierIcon = L.divIcon({
      className: 'map-marker-icon',
      html: `<div class="marker-pin-courier"><i class="fa-solid ${getCourierVehicleIcon(courier?.vehicleType)}"></i></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
    
    const courierMarker = L.marker(courierCoords, { icon: courierIcon })
      .bindPopup(`<h4>Courier: ${courier?.name || 'Assigned'}</h4><p>Status: ${shipment.status}<br>${courier?.vehicleType || ''}</p>`)
      .addTo(map);
      
    mapMarkers.push(courierMarker);
  }

  const bounds = L.latLngBounds([origin, destination]);
  map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
}

function getCourierVehicleIcon(vehicleType) {
  switch (vehicleType) {
    case 'Electric Van': return 'fa-truck-pickup';
    case 'E-Bike': return 'fa-bicycle';
    case 'Motorcycle': return 'fa-motorcycle';
    default: return 'fa-person-walking';
  }
}

// ==========================================================================
// SIGNATURE PAD FUNCTIONS
// ==========================================================================
function initSignaturePad() {
  canvas = document.getElementById('signature-pad');
  ctx = canvas.getContext('2d');
  
  ctx.strokeStyle = '#0f172a'; // slate-900 black signature lines
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);
  
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
  }, { passive: false });
  
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
  }, { passive: false });
  
  canvas.addEventListener('touchend', (e) => {
    const mouseEvent = new MouseEvent('mouseup', {});
    canvas.dispatchEvent(mouseEvent);
  });
}

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

function startDrawing(e) {
  isDrawing = true;
  const coords = getCanvasCoords(e);
  [lastX, lastY] = [coords.x, coords.y];
}

function draw(e) {
  if (!isDrawing) return;
  const coords = getCanvasCoords(e);
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(coords.x, coords.y);
  ctx.stroke();
  [lastX, lastY] = [coords.x, coords.y];
}

function stopDrawing() {
  isDrawing = false;
}

function clearSignature() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function isSignatureEmpty() {
  const blank = document.createElement('canvas');
  blank.width = canvas.width;
  blank.height = canvas.height;
  return canvas.toDataURL() === blank.toDataURL();
}

// ==========================================================================
// DATA RETRIEVAL & RENDERING
// ==========================================================================
async function loadDashboardData() {
  if (!getToken()) return; // Abort if logged out
  
  try {
    const [shipmentsRes, couriersRes] = await Promise.all([
      secureFetch(`${API_BASE}/shipments`),
      secureFetch(`${API_BASE}/couriers`)
    ]);
    
    shipments = await shipmentsRes.json();
    couriers = await couriersRes.json();
    
    updateStats();
    renderShipments();
    renderCouriers();
    
    if (selectedShipmentId) {
      const activeShipment = shipments.find(s => s.id === selectedShipmentId);
      if (activeShipment) {
        renderShipmentDetails(activeShipment);
      }
    }
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

function updateStats() {
  document.querySelector('#stat-total .stat-value').textContent = shipments.length;
  
  const inTransitCount = shipments.filter(s => s.status === 'In Transit' || s.status === 'Out for Delivery').length;
  document.querySelector('#stat-transit .stat-value').textContent = inTransitCount;
  
  const deliveredCount = shipments.filter(s => s.status === 'Delivered').length;
  document.querySelector('#stat-delivered .stat-value').textContent = deliveredCount;
  
  const activeCouriersCount = couriers.filter(c => c.status === 'On Delivery').length;
  document.querySelector('#stat-couriers .stat-value').textContent = activeCouriersCount;
  
  document.getElementById('active-couriers-count').textContent = `${couriers.length} Couriers`;
}

function renderShipments() {
  const container = document.getElementById('shipments-list');
  const searchQuery = document.getElementById('search-shipments').value.toLowerCase();
  const statusFilter = document.getElementById('filter-status').value;
  
  const filtered = shipments.filter(s => {
    const matchesSearch = s.id.toLowerCase().includes(searchQuery) ||
                          s.consumerName.toLowerCase().includes(searchQuery) ||
                          s.originName.toLowerCase().includes(searchQuery) ||
                          s.destinationName.toLowerCase().includes(searchQuery);
                          
    const matchesStatus = statusFilter === 'All' || s.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });
  
  if (filtered.length === 0) {
    container.innerHTML = `<div class="no-selection-state"><p>No shipments matched your filters.</p></div>`;
    return;
  }
  
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  container.innerHTML = filtered.map(s => {
    const isActive = s.id === selectedShipmentId ? 'active' : '';
    const courier = couriers.find(c => c.id === s.courierId);
    
    return `
      <div class="shipment-card ${isActive}" data-id="${s.id}">
        <div class="shipment-header">
          <span class="shipment-id">${s.id}</span>
          <span class="badge ${getStatusBadgeClass(s.status)}">${s.status}</span>
        </div>
        <div class="shipment-body">
          <div class="route-stop">
            <i class="fa-solid fa-circle-dot origin-dot"></i>
            <span>${s.originName}</span>
          </div>
          <div class="route-stop">
            <i class="fa-solid fa-location-dot dest-dot"></i>
            <span>${s.consumerName} (${s.destinationName})</span>
          </div>
        </div>
        <div class="shipment-footer">
          <span>${formatDate(s.createdAt)}</span>
          ${courier ? `
            <div class="assigned-courier-name">
              <i class="fa-solid ${getCourierVehicleIcon(courier.vehicleType)}"></i>
              <span>${courier.name}</span>
            </div>
          ` : '<span style="color: var(--text-light)">Unassigned</span>'}
        </div>
      </div>
    `;
  }).join('');
  
  document.querySelectorAll('.shipment-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      selectShipment(id);
    });
  });
}

function selectShipment(id) {
  selectedShipmentId = id;
  
  document.querySelectorAll('.shipment-card').forEach(card => {
    if (card.getAttribute('data-id') === id) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });
  
  const shipment = shipments.find(s => s.id === id);
  if (shipment) {
    document.querySelector('.tab-btn[data-tab="tab-shipment-detail"]').click();
    renderShipmentDetails(shipment);
    drawShipmentRoute(shipment);
    
    document.getElementById('map-selection-hint').style.display = 'none';
  }
}

function renderShipmentDetails(shipment) {
  const container = document.getElementById('shipment-detail-content');
  const unselectedState = document.getElementById('no-shipment-selected');
  
  unselectedState.classList.add('hidden');
  container.classList.remove('hidden');
  
  const courier = couriers.find(c => c.id === shipment.courierId);
  const availableCouriers = couriers.filter(c => c.status === 'Available');
  
  let courierSelectionHtml = '';
  if (shipment.status !== 'Delivered' && shipment.status !== 'Cancelled') {
    courierSelectionHtml = `
      <div class="courier-assign-box">
        <select id="select-assign-courier">
          <option value="">-- Assign Courier --</option>
          ${courier ? `<option value="${courier.id}" selected>${courier.name} (Assigned)</option>` : ''}
          ${availableCouriers.map(c => `<option value="${c.id}">${c.name} (${c.vehicleType})</option>`).join('')}
        </select>
        <button class="btn btn-secondary" id="btn-save-assignment" data-id="${shipment.id}">Assign</button>
      </div>
    `;
  }
  
  container.innerHTML = `
    <div class="detail-header">
      <div class="detail-id-status">
        <span class="detail-id">${shipment.id}</span>
        <span class="badge ${getStatusBadgeClass(shipment.status)}">${shipment.status}</span>
      </div>
      <div class="detail-timestamp">Created: ${formatDateLong(shipment.createdAt)}</div>
    </div>
    
    <!-- Route Information -->
    <div class="detail-section">
      <h4>Route & Address</h4>
      <div class="detail-card">
        <div class="detail-row origin-row">
          <i class="fa-solid fa-warehouse"></i>
          <div>
            <span class="detail-row-label">Origin Warehouse</span>
            <span class="detail-row-value">${shipment.originName}</span>
            <div style="font-size:11px; color:var(--text-muted)">Coords: ${shipment.originCoords[0].toFixed(4)}, ${shipment.originCoords[1].toFixed(4)}</div>
          </div>
        </div>
        
        <div class="detail-row dest-row">
          <i class="fa-solid fa-house-user"></i>
          <div>
            <span class="detail-row-label">Consumer Destination</span>
            <span class="detail-row-value">${shipment.consumerName}</span>
            <div style="color:var(--text-muted); font-size:12px; margin-top:2px;">${shipment.destinationName}</div>
            <div style="font-size:11px; color:var(--text-muted)">Coords: ${shipment.destinationCoords[0].toFixed(4)}, ${shipment.destinationCoords[1].toFixed(4)}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Courier Assignment -->
    <div class="detail-section">
      <h4>Courier Details</h4>
      <div class="detail-card">
        ${courier ? `
          <div class="detail-row courier-row">
            <i class="fa-solid ${getCourierVehicleIcon(courier.vehicleType)}"></i>
            <div>
              <span class="detail-row-label">Assigned Courier</span>
              <span class="detail-row-value">${courier.name}</span>
              <div style="font-size:12px; color:var(--text-muted)">
                <i class="fa-solid fa-phone" style="font-size:10px; color:var(--text-muted); margin-right:4px;"></i> ${courier.phone}<br>
                Vehicle: ${courier.vehicleType}
              </div>
            </div>
          </div>
        ` : `
          <div class="detail-row">
            <i class="fa-solid fa-user-slash" style="color:var(--text-light)"></i>
            <span class="detail-row-value" style="color:var(--text-muted); font-style:italic;">No Courier Assigned</span>
          </div>
        `}
        ${courierSelectionHtml}
      </div>
    </div>

    <!-- Actions & Status Updates -->
    <div class="detail-section">
      <h4>Delivery Status Operations</h4>
      <div class="detail-card" style="gap: 10px;">
        ${shipment.status !== 'Delivered' && shipment.status !== 'Cancelled' ? `
          <div class="form-group" style="margin-bottom:0;">
            <label for="select-shipment-status">Update Shipment Status</label>
            <select id="select-shipment-status" style="margin-top: 4px;">
              <option value="Pending" ${shipment.status === 'Pending' ? 'selected' : ''}>Pending</option>
              <option value="In Transit" ${shipment.status === 'In Transit' ? 'selected' : ''}>In Transit</option>
              <option value="Out for Delivery" ${shipment.status === 'Out for Delivery' ? 'selected' : ''}>Out for Delivery</option>
            </select>
          </div>
          <button class="btn btn-primary btn-block" id="btn-complete-delivery" ${!shipment.courierId ? 'disabled title="Please assign a courier first"' : ''}>
            <i class="fa-solid fa-pen-fancy"></i> Collect Signature & Deliver
          </button>
        ` : ''}

        ${shipment.status === 'Delivered' ? `
          <span class="detail-row-label">Recipient Digital Signature</span>
          <div class="signature-display-box">
            <img class="signature-display-img" src="${shipment.signatureUrl}" alt="Customer Delivery Signature">
          </div>
        ` : ''}

        ${shipment.status !== 'Delivered' && shipment.status !== 'Cancelled' ? `
          <button class="btn btn-secondary btn-block" id="btn-cancel-shipment" style="color:var(--color-danger); border-color:rgba(185,28,28,0.2)">
            <i class="fa-solid fa-ban"></i> Cancel Shipment
          </button>
        ` : ''}
      </div>
    </div>
  `;

  // Attach event handlers inside details dynamically
  const assignBtn = document.getElementById('btn-save-assignment');
  if (assignBtn) {
    assignBtn.addEventListener('click', async () => {
      const courierSelect = document.getElementById('select-assign-courier');
      const courierId = courierSelect.value || null;
      try {
        const res = await secureFetch(`${API_BASE}/shipments/${shipment.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courierId })
        });
        if (res.ok) {
          loadDashboardData();
        }
      } catch (err) {
        console.error('Failed to assign courier:', err);
      }
    });
  }

  const statusSelect = document.getElementById('select-shipment-status');
  if (statusSelect) {
    statusSelect.addEventListener('change', async (e) => {
      const status = e.target.value;
      try {
        const res = await secureFetch(`${API_BASE}/shipments/${shipment.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        if (res.ok) {
          loadDashboardData();
        }
      } catch (err) {
        console.error('Failed to update status:', err);
      }
    });
  }

  const completeBtn = document.getElementById('btn-complete-delivery');
  if (completeBtn) {
    completeBtn.addEventListener('click', () => {
      clearSignature();
      const modal = document.getElementById('modal-signature');
      modal.classList.add('active');
    });
  }

  const cancelBtn = document.getElementById('btn-cancel-shipment');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to cancel this shipment?')) {
        try {
          const res = await secureFetch(`${API_BASE}/shipments/${shipment.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Cancelled' })
          });
          if (res.ok) {
            loadDashboardData();
          }
        } catch (err) {
          console.error('Failed to cancel shipment:', err);
        }
      }
    });
  }
}

function renderCouriers() {
  const container = document.getElementById('couriers-list-container');
  container.innerHTML = couriers.map(c => {
    return `
      <div class="courier-card">
        <div class="courier-left">
          <div class="courier-avatar">
            <i class="fa-solid ${getCourierVehicleIcon(c.vehicleType)}"></i>
          </div>
          <div class="courier-info-text">
            <span class="courier-name">${c.name}</span>
            <span class="courier-subtext">${c.vehicleType} • ${c.phone}</span>
          </div>
        </div>
        <span class="c-badge ${getCourierBadgeClass(c.status)}">${c.status}</span>
      </div>
    `;
  }).join('');
}

// Helpers
function getStatusBadgeClass(status) {
  switch (status) {
    case 'Pending': return 'badge-pending';
    case 'In Transit': return 'badge-transit';
    case 'Out for Delivery': return 'badge-delivery';
    case 'Delivered': return 'badge-delivered';
    default: return 'badge-cancelled';
  }
}

function getCourierBadgeClass(status) {
  switch (status) {
    case 'Available': return 'c-badge-available';
    case 'On Delivery': return 'c-badge-delivery';
    default: return 'c-badge-offline';
  }
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateLong(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString(undefined, { 
    dateStyle: 'medium', 
    timeStyle: 'short' 
  });
}

// ==========================================================================
// EVENT LISTENERS & MODALS
// ==========================================================================
function setupEventListeners() {
  const shipmentModal = document.getElementById('modal-shipment');
  const courierModal = document.getElementById('modal-courier');
  const signatureModal = document.getElementById('modal-signature');

  document.getElementById('btn-add-shipment').addEventListener('click', () => {
    shipmentModal.classList.add('active');
  });

  document.getElementById('btn-add-courier').addEventListener('click', () => {
    courierModal.classList.add('active');
  });

  document.getElementById('close-shipment-modal').addEventListener('click', () => {
    shipmentModal.classList.remove('active');
    if (tempDestMarker && map) {
      map.removeLayer(tempDestMarker);
      tempDestMarker = null;
    }
  });

  document.getElementById('close-courier-modal').addEventListener('click', () => {
    courierModal.classList.remove('active');
  });

  document.getElementById('close-signature-modal').addEventListener('click', () => {
    signatureModal.classList.remove('active');
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  document.getElementById('search-shipments').addEventListener('input', renderShipments);
  document.getElementById('filter-status').addEventListener('change', renderShipments);

  document.getElementById('form-create-shipment').addEventListener('submit', async (e) => {
    e.preventDefault();
    const consumerName = document.getElementById('input-consumer').value;
    const originSelect = document.getElementById('input-origin');
    const selectedOrigin = originSelect.options[originSelect.selectedIndex];
    
    const originName = selectedOrigin.value;
    const originCoords = [
      parseFloat(selectedOrigin.getAttribute('data-lat')),
      parseFloat(selectedOrigin.getAttribute('data-lng'))
    ];
    
    const destinationName = `${consumerName} Residence`;
    const destinationCoords = [
      parseFloat(document.getElementById('input-dest-lat').value),
      parseFloat(document.getElementById('input-dest-lng').value)
    ];

    try {
      const res = await secureFetch(`${API_BASE}/shipments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originName,
          originCoords,
          destinationName,
          destinationCoords,
          consumerName
        })
      });
      
      if (res.ok) {
        const newShipment = await res.json();
        shipmentModal.classList.remove('active');
        document.getElementById('form-create-shipment').reset();
        
        if (tempDestMarker && map) {
          map.removeLayer(tempDestMarker);
          tempDestMarker = null;
        }
        
        await loadDashboardData();
        selectShipment(newShipment.id);
      }
    } catch (err) {
      console.error('Failed to create shipment:', err);
    }
  });

  document.getElementById('form-create-courier').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('input-courier-name').value;
    const phone = document.getElementById('input-courier-phone').value;
    const vehicleType = document.getElementById('input-courier-vehicle').value;

    try {
      const res = await secureFetch(`${API_BASE}/couriers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, vehicleType })
      });
      
      if (res.ok) {
        courierModal.classList.remove('active');
        document.getElementById('form-create-courier').reset();
        loadDashboardData();
      }
    } catch (err) {
      console.error('Failed to create courier:', err);
    }
  });

  document.getElementById('btn-clear-signature').addEventListener('click', clearSignature);

  document.getElementById('btn-submit-delivery').addEventListener('click', async () => {
    if (isSignatureEmpty()) {
      alert('Please provide a digital signature before submitting.');
      return;
    }

    const signatureData = canvas.toDataURL('image/png');
    
    try {
      const res = await secureFetch(`${API_BASE}/shipments/${selectedShipmentId}/signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureData })
      });
      
      if (res.ok) {
        signatureModal.classList.remove('active');
        loadDashboardData();
      }
    } catch (err) {
      console.error('Failed to upload signature:', err);
      alert('Network error while completing delivery.');
    }
  });
}
