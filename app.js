// ===================== STATE =====================
let allAssets = [];
let currentType = 'vehicles';
let session = JSON.parse(localStorage.getItem('vehicleAppSession') || 'null');

// Per asset-type: which columns show in the summary table, and which
// field drives the status-style filter dropdown. Keys must match the
// Sheet headers exactly.
const ASSET_CONFIGS = {
  vehicles: {
    filterField: 'Status',
    searchPlaceholder: 'Search registration, make, model, officer…',
    columns: [
      { key: 'Asset/Tag No.', mono: true },
      { key: 'Registration No. (Number Plate)', label: 'Registration No.', mono: true },
      { key: '__makeModel', label: 'Make / Model' },
      { key: 'Assigned Department/Directorate', label: 'Department' },
      { key: 'Assigned Officer/Custodian', label: 'Assigned Officer' },
      { key: 'Status', pill: true },
      { key: 'Condition' },
      { key: 'Net Book Value (KES)', numeric: true },
    ],
  },
  land: {
    filterField: 'Status',
    searchPlaceholder: 'Search parcel ref, LR number, location…',
    columns: [
      { key: 'Asset/Parcel Ref. No.', label: 'Asset Ref.', mono: true },
      { key: 'LR Number', mono: true },
      { key: 'Sub-County' },
      { key: 'Land Use Classification', label: 'Land Use' },
      { key: 'Custodian Department/Directorate', label: 'Department' },
      { key: 'Status', pill: true },
      { key: 'Fair Value (KES)', numeric: true },
    ],
  },
  buildings: {
    filterField: 'Status',
    searchPlaceholder: 'Search building name, ref, department…',
    columns: [
      { key: 'Asset/Building Ref. No.', label: 'Asset Ref.', mono: true },
      { key: 'Building Name' },
      { key: 'Custodian Department/Directorate', label: 'Department' },
      { key: 'Building Type/Use' },
      { key: 'Occupancy Status' },
      { key: 'Status', pill: true },
      { key: 'Net Book Value (KES)', numeric: true },
    ],
  },
};

const STATUS_PILL_CLASS = {
  'Active': 'pill--active',
  'In Use': 'pill--active',
  'Occupied': 'pill--active',
  'Under Repair': 'pill--repair',
  'Under Renovation': 'pill--repair',
  'Idle': 'pill--repair',
  'Decommissioned': 'pill--decommissioned',
  'Disposed': 'pill--disposed',
  'Stolen': 'pill--stolen',
  'Under Dispute': 'pill--disposed',
  'Encroached': 'pill--disposed',
  'Condemned': 'pill--disposed',
};

// ===================== ELEMENTS =====================
const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const userLabel = document.getElementById('userLabel');
const logoutBtn = document.getElementById('logoutBtn');
const assetTabs = document.getElementById('assetTabs');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const recordCount = document.getElementById('recordCount');
const tableHead = document.getElementById('vehicleTableHead');
const tableBody = document.getElementById('vehicleTableBody');
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const detailPanel = document.getElementById('detailPanel');
const detailOverlay = document.getElementById('detailOverlay');
const detailTitle = document.getElementById('detailTitle');
const detailList = document.getElementById('detailList');
const closeDetail = document.getElementById('closeDetail');

// ===================== INIT =====================
if (session && session.token) {
  showApp();
} else {
  showLogin();
}

// ===================== LOGIN =====================
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in…';

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    const res = await apiPost({ action: 'login', username, password });
    if (res.success) {
      session = { token: res.token, role: res.role, username: res.username };
      localStorage.setItem('vehicleAppSession', JSON.stringify(session));
      showApp();
    } else {
      loginError.textContent = res.error || 'Could not sign in.';
      loginError.hidden = false;
    }
  } catch (err) {
    loginError.textContent = 'Could not reach the server. Check your connection and try again.';
    loginError.hidden = false;
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign in';
  }
});

logoutBtn.addEventListener('click', async () => {
  if (session) apiPost({ action: 'logout', token: session.token }).catch(() => {});
  localStorage.removeItem('vehicleAppSession');
  session = null;
  showLogin();
});

function showLogin() {
  loginView.hidden = false;
  appView.hidden = true;
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  userLabel.textContent = `${session.username} · ${session.role}`;
  loadAssets(currentType);
}

// ===================== TAB SWITCHING =====================
assetTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.asset-tab');
  if (!btn || btn.dataset.type === currentType) return;

  assetTabs.querySelectorAll('.asset-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentType = btn.dataset.type;
  searchInput.value = '';
  searchInput.placeholder = ASSET_CONFIGS[currentType].searchPlaceholder;
  loadAssets(currentType);
});

// ===================== DATA LOADING =====================
async function loadAssets(assetType) {
  loadingState.hidden = false;
  loadingState.textContent = 'Loading register…';
  emptyState.hidden = true;
  tableBody.innerHTML = '';
  renderTableHead(assetType);

  try {
    const url = `${CONFIG.API_URL}?action=getAssets&assetType=${assetType}&token=${encodeURIComponent(session.token)}`;
    const res = await fetch(url).then(r => r.json());

    if (!res.success) {
      if (String(res.error || '').toLowerCase().includes('log in')) {
        localStorage.removeItem('vehicleAppSession');
        session = null;
        showLogin();
        return;
      }
      throw new Error(res.error);
    }

    allAssets = res.data;
    populateStatusFilter(allAssets, assetType);
    renderTable(allAssets, assetType);
  } catch (err) {
    loadingState.textContent = 'Could not load this register. Please refresh and try again.';
  } finally {
    if (allAssets.length) loadingState.hidden = true;
  }
}

function populateStatusFilter(assets, assetType) {
  const field = ASSET_CONFIGS[assetType].filterField;
  const values = [...new Set(assets.map(a => a[field]).filter(Boolean))].sort();
  statusFilter.innerHTML = '<option value="">All statuses</option>' +
    values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

// ===================== RENDER =====================
function renderTableHead(assetType) {
  const cols = ASSET_CONFIGS[assetType].columns;
  tableHead.innerHTML = '<tr>' + cols.map(c => `<th>${escapeHtml(c.label || c.key)}</th>`).join('') + '</tr>';
}

function renderTable(assets, assetType) {
  const cols = ASSET_CONFIGS[assetType].columns;
  tableBody.innerHTML = '';
  recordCount.textContent = `${assets.length} record${assets.length === 1 ? '' : 's'}`;

  if (!assets.length) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  const rows = assets.map(a => {
    const cells = cols.map(c => cellHtml(a, c)).join('');
    return `<tr data-row="${a._row}">${cells}</tr>`;
  }).join('');

  tableBody.innerHTML = rows;

  tableBody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => openDetail(Number(tr.dataset.row)));
  });
}

function cellHtml(record, col) {
  if (col.key === '__makeModel') {
    return `<td>${escapeHtml(record['Make'] || '')} ${escapeHtml(record['Model'] || '')}</td>`;
  }
  if (col.pill) {
    const value = record[col.key] || '';
    const pillClass = STATUS_PILL_CLASS[value] || 'pill--default';
    return `<td><span class="pill ${pillClass}">${escapeHtml(value || '—')}</span></td>`;
  }
  if (col.mono) {
    return `<td class="mono">${escapeHtml(record[col.key] || '—')}</td>`;
  }
  if (col.numeric) {
    const val = record[col.key];
    const display = (val === '' || val === undefined || val === null) ? '—' : Number(val).toLocaleString();
    return `<td class="mono">${display}</td>`;
  }
  return `<td>${escapeHtml(record[col.key] || '—')}</td>`;
}

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();
  const field = ASSET_CONFIGS[currentType].filterField;
  const status = statusFilter.value;

  const filtered = allAssets.filter(a => {
    const matchesStatus = !status || a[field] === status;
    if (!matchesStatus) return false;
    if (!q) return true;
    return Object.values(a).some(val => String(val).toLowerCase().includes(q));
  });

  renderTable(filtered, currentType);
}

searchInput.addEventListener('input', applyFilters);
statusFilter.addEventListener('change', applyFilters);

// ===================== DETAIL PANEL =====================
function openDetail(rowId) {
  const record = allAssets.find(a => a._row === rowId);
  if (!record) return;

  const titleField = Object.keys(record).find(k => k !== '_row');
  detailTitle.textContent = record[titleField] || 'Record detail';
  detailList.innerHTML = Object.entries(record)
    .filter(([k]) => k !== '_row')
    .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v === '' || v === undefined || v === null ? '—' : String(v))}</dd>`)
    .join('');

  detailPanel.hidden = false;
  detailOverlay.hidden = false;
}

function closeDetailPanel() {
  detailPanel.hidden = true;
  detailOverlay.hidden = true;
}
closeDetail.addEventListener('click', closeDetailPanel);
detailOverlay.addEventListener('click', closeDetailPanel);

// ===================== HELPERS =====================
async function apiPost(payload) {
  // text/plain avoids a CORS preflight, which Apps Script web apps can't answer.
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
