// Runs before first paint to avoid a theme flash; external so the CSP can forbid inline scripts.
(() => {
    const themeColors = {
        original: '#f0f4f9',
        'modern-lite': '#f4f1ea',
        'modern-dark': '#2b2d42',
    };
    let theme = 'modern-lite';
    try {
        const savedTheme = localStorage.getItem('app-theme');
        if (savedTheme && savedTheme in themeColors) theme = savedTheme;
    } catch {
        // Use Modern Lite when browser storage is unavailable.
    }
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = themeColors[theme];
    if (theme === 'modern-dark') {
        document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').content = 'black';
    }
})();
