// App identity defaults. Admin-editable values live in the settings table (see src/lib/settings.ts);
// these are only fallbacks until an admin saves Settings. scripts/init-project.ts rewrites them.
export const APP_SLUG = 'my_app';
export const DEFAULT_SITE_NAME = 'My App';
export const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
export const DEFAULT_OPEN_SIGNUP = false;

export const SETTING_KEYS = {
    siteName: 'site_name',
    adminEmail: 'admin_email',
    openSignup: 'open_signup',
} as const;
