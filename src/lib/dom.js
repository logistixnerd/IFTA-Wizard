// src/lib/dom.js
// Thin helpers that bridge window globals into module scope.
// Firebase is loaded via non-module <script> tags before this module executes,
// so window.firebase and window.db are always defined by the time any import runs.

export function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Re-export Firebase globals so module code doesn't reference window.* directly.
// These are getters so the reference is lazily resolved after the script tags run.
export function getFirebase() { return window.firebase; }
export function getDb() { return window.db; }
