import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './style.css';

createApp(App).use(router).mount('#app');

// Back/forward can restore a frozen page (bfcache) with the previous user's data still on screen; re-check the session.
window.addEventListener('pageshow', (event) => {
    if (!event.persisted || window.location.pathname.startsWith('/login') || window.location.pathname.startsWith('/auth/')) return;
    fetch('/api/auth/me')
        .then((response) => { if (response.status === 401) window.location.replace('/login?switch=1'); })
        .catch(() => { /* offline: leave the page as is */ });
});
