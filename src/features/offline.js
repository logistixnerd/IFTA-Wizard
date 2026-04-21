// src/features/offline.js
// Online/offline status indicator and notification.

import { showToast } from '../ui/toast.js';

export function setupOfflineDetection() {
    const updateOnlineStatus = () => {
        const statusEl = document.getElementById('systemHealth');
        if (!statusEl) return;

        if (!navigator.onLine) {
            statusEl.classList.add('offline');
            statusEl.querySelector('.health-text').textContent   = 'Offline';
            statusEl.querySelector('.health-dot').style.background = '#f44336';
            statusEl.title = 'You are offline. Changes will sync when back online.';
            showToast('You are offline. Some features may be limited.', 'warning');
        } else {
            statusEl.classList.remove('offline');
            statusEl.querySelector('.health-text').textContent   = 'OK';
            statusEl.querySelector('.health-dot').style.background = '';
            statusEl.title = 'System status';
        }
    };

    window.addEventListener('online',  () => { updateOnlineStatus(); showToast('Back online!', 'success'); });
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
}
