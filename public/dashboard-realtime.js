// Realtime cart/wishlist/order count updater for dashboard
function updateDashboardCounts() {
  fetch('/api/customer/dashboard-stats')
    .then(res => res.json())
    .then(data => {
      if (data.cartCount !== undefined) {
        document.querySelectorAll('[data-dashboard-cart-count]').forEach(el => {
          el.textContent = data.cartCount;
        });
      }
      if (data.wishlistCount !== undefined) {
        document.querySelectorAll('[data-dashboard-wishlist-count]').forEach(el => {
          el.textContent = data.wishlistCount;
        });
      }
      if (data.orderCount !== undefined) {
        document.querySelectorAll('[data-dashboard-order-count]').forEach(el => {
          el.textContent = data.orderCount;
        });
      }
    });
}

// Poll every 2 seconds
setInterval(updateDashboardCounts, 2000);
window.addEventListener('DOMContentLoaded', updateDashboardCounts);

// Fetch and render recent activity for the logged-in user
async function fetchRecentActivity(all = false) {
  const container = document.getElementById('recentActivityList');
  if (!container) return;
  container.innerHTML = '<div class="text-sm text-gray-500">Loading recent activity...</div>';
  try {
    const defaultLimit = 3; // show 3 items by default on the dashboard
    const url = '/api/customer/recent-activity' + (all ? '?all=1' : `?limit=${defaultLimit}`);
    const res = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
    if (res.status === 401) {
      container.innerHTML = '<div class="text-sm text-red-500">Please sign in to view activity.</div>';
      return;
    }
    const data = await res.json();
    if (!data.activities || !data.activities.length) {
      container.innerHTML = '<div class="text-sm text-gray-600">No recent activity yet.</div>';
      return;
    }
    // Render list
    container.innerHTML = '';
    data.activities.forEach(act => {
      const el = document.createElement('div');
      el.className = 'flex items-center space-x-4 p-4 bg-white rounded-xl border';
      const icon = document.createElement('div');
      icon.className = 'w-10 h-10 rounded-xl flex items-center justify-center';
      // color by type
      switch (act.type) {
        case 'cart': icon.classList.add('bg-blue-50'); icon.innerHTML = '<span class="text-blue-600">🛒</span>'; break;
        case 'wishlist': icon.classList.add('bg-amber-50'); icon.innerHTML = '<span class="text-amber-600">❤️</span>'; break;
        case 'event': icon.classList.add('bg-purple-50'); icon.innerHTML = '<span class="text-purple-600">📅</span>'; break;
        case 'order': icon.classList.add('bg-green-50'); icon.innerHTML = '<span class="text-green-600">📦</span>'; break;
        default: icon.classList.add('bg-gray-50'); icon.innerHTML = '<span class="text-gray-600">•</span>';
      }
      const body = document.createElement('div');
      body.className = 'flex-1';
      const title = document.createElement('p');
      title.className = 'font-semibold text-gray-800';
      title.textContent = act.title;
      const ts = document.createElement('p');
      ts.className = 'text-gray-500 text-sm';
      const date = new Date(act.createdAt);
      ts.textContent = date.toLocaleString();
      body.appendChild(title);
      body.appendChild(ts);
      el.appendChild(icon);
      el.appendChild(body);
      container.appendChild(el);
    });
  } catch (err) {
    container.innerHTML = '<div class="text-sm text-red-500">Failed to load activity.</div>';
    console.error(err);
  }
}

// Bind refresh button and load on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('refreshActivityBtn');
  if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); fetchRecentActivity(false); });
  const viewAll = document.getElementById('viewAllActivityBtn');
  if (viewAll) viewAll.addEventListener('click', (e) => { e.preventDefault(); fetchRecentActivity(true); });
  fetchRecentActivity(false);
});
