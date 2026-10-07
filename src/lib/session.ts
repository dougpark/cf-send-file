// Removes everything this origin has stored in the browser (the server also expires the session cookie
// and sends Clear-Site-Data, but Safari ignores that header, so it is repeated here).
async function clearBrowserData(): Promise<void> {
    try { localStorage.clear(); } catch { /* storage may be blocked */ }
    try { sessionStorage.clear(); } catch { /* storage may be blocked */ }

    for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=')[0]?.trim();
        if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
    }

    try {
        if ('caches' in window) await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    } catch { /* Cache Storage unavailable */ }

    try {
        if ('serviceWorker' in navigator) {
            await Promise.all((await navigator.serviceWorker.getRegistrations()).map((registration) => registration.unregister()));
        }
    } catch { /* no service workers */ }

    try {
        const databases = (await indexedDB.databases?.()) ?? [];
        await Promise.all(databases.map((database) => new Promise<void>((resolve) => {
            if (!database.name) return resolve();
            const request = indexedDB.deleteDatabase(database.name);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
        })));
    } catch { /* IndexedDB unavailable */ }
}

// Ends the server session, wipes local browser data, then hard-navigates so no signed-in state survives in memory.
export async function signOutAndClearBrowserData(): Promise<void> {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch { /* offline: still wipe local data */ }
    await clearBrowserData();
    window.location.replace('/login?switch=1');
}
