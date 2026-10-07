import { ref } from 'vue';

export type ThemeName = 'original' | 'modern-lite' | 'modern-dark';

export interface ThemeOption {
    name: ThemeName;
    label: string;
    colors: [string, string, string];
}

const STORAGE_KEY = 'app-theme';
const THEME_COLORS: Record<ThemeName, string> = {
    original: '#f0f4f9',
    'modern-lite': '#f4f1ea', //'#faf9f6',
    'modern-dark': '#2b2d42',
};

export const themeOptions: ThemeOption[] = [
    { name: 'original', label: 'Original', colors: ['#f0f4f9', '#1a73e8', '#7c4dff'] },
    { name: 'modern-lite', label: 'Modern Lite', colors: ['#f4f1ea ', '#e07a5f', '#81b29a'] },
    { name: 'modern-dark', label: 'Modern Dark', colors: ['#2b2d42', '#ab5b49', '#8d99ae'] },
];

function isThemeName(value: string | undefined): value is ThemeName {
    return themeOptions.some((option) => option.name === value);
}

function readInitialTheme(): ThemeName {
    if (typeof document === 'undefined') return 'modern-lite';
    const currentTheme = document.documentElement.dataset.theme;
    return isThemeName(currentTheme) ? currentTheme : 'modern-lite';
}

const theme = ref<ThemeName>(readInitialTheme());

function applyTheme(nextTheme: ThemeName) {
    theme.value = nextTheme;
    document.documentElement.dataset.theme = nextTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[nextTheme]);
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute(
        'content',
        nextTheme === 'modern-dark' ? 'black' : 'default',
    );

    try {
        localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
        // The active theme still applies when browser storage is unavailable.
    }
}

export function useTheme() {
    return { theme, themeOptions, applyTheme };
}