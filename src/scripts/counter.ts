type Stats = Record<string, number>;
const endpoint = '/api/stats.php';

function render(data: Stats) {
  for (const name of ['online', 'visitors', 'pageviews', 'downloads', 'today']) {
    const value = data[name];
    const element = document.getElementById(`stat-${name}`);
    if (element && Number.isFinite(value) && value >= 0) {
      element.textContent = value.toLocaleString('de-DE');
    }
  }
}

let session: string | null = null;
try {
  session = sessionStorage.getItem('q3rally-counter-session');
  if (!session || !/^[a-f0-9]{32}$/.test(session)) {
    session = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem('q3rally-counter-session', session);
  }
} catch {
  // Without tab storage, display totals without generating repeat visits.
  session = null;
}

async function update(event: 'view' | 'heartbeat') {
  try {
    const response = await fetch(endpoint, session ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, event }),
      cache: 'no-store',
    } : { cache: 'no-store' });
    if (response.ok) render(await response.json());
  } catch { /* Leave unavailable values as dashes; do not invent zero counts. */ }
}

void update('view');
setInterval(() => {
  if (document.visibilityState === 'visible') void update('heartbeat');
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void update('heartbeat');
});
document.addEventListener('click', event => {
  const target = event.target;
  const link = target instanceof Element ? target.closest<HTMLAnchorElement>('a[data-counter-download]') : null;
  if (!link || !session || !link.getAttribute('href') || link.getAttribute('href') === '#') return;
  // keepalive lets the request complete while the download/navigation starts.
  void fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session, event: 'download' }), keepalive: true,
  }).catch(() => {});
});
