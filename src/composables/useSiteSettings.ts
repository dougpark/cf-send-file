import { ref } from 'vue';

const DEFAULT_SITE_NAME = 'My App';

const siteName = ref(DEFAULT_SITE_NAME);
let loadPromise: Promise<void> | null = null;

// Module-level cache: every component sharing this composable fetches the setting only once.
function loadSiteSettings(): Promise<void> {
    if (!loadPromise) {
        loadPromise = fetch('/api/settings')
            .then((response) => (response.ok ? response.json() : null))
            .then((data: { siteName?: string } | null) => {
                if (data?.siteName) siteName.value = data.siteName;
            })
            .catch(() => {
                // Keep the default site name if the settings request fails.
            });
    }
    return loadPromise;
}

export function useSiteSettings() {
    return { siteName, loadSiteSettings };
}
