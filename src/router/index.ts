import { createRouter, createWebHistory } from 'vue-router';

declare module 'vue-router' {
    interface RouteMeta {
        // Signed in (any account, even before membership is approved).
        requiresAuth?: boolean;
        // Approved member or any staff role.
        requiresMember?: boolean;
        requiresAdmin?: boolean;
        requiresAnyAdminRole?: boolean;
        guestOnly?: boolean;
    }
}

const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', redirect: '/home' },
        { path: '/home', name: 'home', meta: { requiresMember: true }, component: () => import('../views/HomeView.vue') },
        { path: '/login', name: 'login', meta: { guestOnly: true }, component: () => import('../views/LoginView.vue') },
        { path: '/auth/verify', name: 'verify', component: () => import('../views/VerifyView.vue') },
        { path: '/access-request', name: 'access-request', meta: { requiresAuth: true }, component: () => import('../views/AccessRequestView.vue') },
        { path: '/help', name: 'help', meta: { requiresAuth: true }, component: () => import('../views/HelpView.vue') },
        { path: '/admin', name: 'admin', meta: { requiresAnyAdminRole: true }, component: () => import('../views/AdminView.vue') },
        { path: '/admin/access-requests', name: 'admin-access-requests', meta: { requiresAdmin: true }, component: () => import('../views/AdminAccessRequestsView.vue') },
        { path: '/:pathMatch(.*)*', redirect: '/home' },
    ],
});

type MeResponse = {
    matched?: boolean;
    user?: { isOwner?: boolean; isAdmin?: boolean; isEditor?: boolean };
};

router.beforeEach(async (to) => {
    const gated = to.meta.requiresAdmin || to.meta.requiresAnyAdminRole || to.meta.requiresMember
        || to.meta.requiresAuth || to.meta.guestOnly;
    if (!gated) return true;

    try {
        const response = await fetch('/api/auth/me');
        if (to.meta.guestOnly) {
            if (to.query.switch === '1' || !response.ok) return true;
            const data = await response.json() as MeResponse;
            return data.matched ? '/home' : '/access-request';
        }
        if (!response.ok) return '/login';
        if (to.meta.requiresAuth) return true;

        const data = await response.json() as MeResponse;
        if (to.meta.requiresMember) return data.matched ? true : '/access-request';
        const isAdmin = Boolean(data.user?.isOwner || data.user?.isAdmin);
        if (to.meta.requiresAdmin) return isAdmin ? true : '/home';
        return isAdmin || data.user?.isEditor ? true : '/home';
    } catch {
        return '/login';
    }
});

export default router;
