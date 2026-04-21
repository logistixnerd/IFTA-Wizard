// src/features/fleet.js
// Loads fleet trucks into the Unit # dropdown from Firestore.
// Reads window.IFTAAuth and window.db (set by auth-firebase.js / firebase-config.js).

import { appState } from '../core/state.js';
import { getDb } from '../lib/dom.js';

const FUEL_MAP = {
    diesel:   'diesel',
    gasoline: 'gasoline',
    cng:      'cng',
    lng:      'lng'
};

export function listenForTrucks() {
    const check = setInterval(() => {
        if (typeof window.IFTAAuth !== 'undefined' && window.IFTAAuth.user && getDb()) {
            clearInterval(check);
            loadFleetTrucks();
        }
    }, 500);
    setTimeout(() => clearInterval(check), 15000);
}

export async function loadFleetTrucks() {
    try {
        const db     = getDb();
        const userId = window.IFTAAuth.user.uid;
        const snap   = await db.collection('users').doc(userId).collection('trucks').orderBy('unit').get();

        const sel = document.getElementById('unitNumber');
        if (!sel) return;

        const current = appState.unitNumber || '';
        while (sel.options.length > 1) sel.remove(1);

        snap.forEach(doc => {
            const t   = doc.data();
            const opt = document.createElement('option');
            opt.value = t.unit || doc.id;
            const label = [t.unit, t.year, t.make, t.model].filter(Boolean).join(' – ');
            opt.textContent = label || doc.id;
            if (t.fuel && FUEL_MAP[t.fuel]) opt.dataset.fuel = FUEL_MAP[t.fuel];
            sel.appendChild(opt);
        });

        if (current) sel.value = current;
    } catch (e) {
        console.error('Error loading fleet trucks:', e);
    }
}
