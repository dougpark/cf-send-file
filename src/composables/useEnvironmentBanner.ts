export type EnvironmentBannerTheme = 'dev' | 'staging';

export interface EnvironmentBannerInfo {
    label: string;
    theme: EnvironmentBannerTheme;
}

// Fail-closed: only known dev/staging hostnames show a banner; anything else (including production) shows none.
export function useEnvironmentBanner(): EnvironmentBannerInfo | null {
    const hostname = window.location.hostname;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return { label: 'DEVELOPMENT ENVIRONMENT', theme: 'dev' };
    }
    if (hostname.includes('staging')) {
        return { label: 'STAGING ENVIRONMENT', theme: 'staging' };
    }
    return null;
}
