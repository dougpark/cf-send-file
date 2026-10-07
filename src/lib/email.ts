type EmailBinding = {
    send(message: {
        to: string;
        from: string;
        subject: string;
        html: string;
        text: string;
        replyTo?: string;
    }): Promise<unknown>;
};

export type MailContext = {
    binding: EmailBinding;
    // Verified Cloudflare Email Sending address (env.MAIL_FROM).
    from: string;
    // Admin-editable reply-to/notification address (settings.admin_email).
    adminEmail: string;
    siteName: string;
    origin: string;
};

// Email clients ignore <style> and CSS variables, so the theme is inlined. Keep in sync with the app's accent.
export const emailTheme = {
    page: '#ffffff',
    card: '#f7f6f1',
    border: '#d7ded8',
    text: '#1e2f23',
    muted: '#52685a',
    button: '#e07a5f',
    buttonText: '#ffffff',
};

// User-supplied text (names, messages, site name) lands in HTML, so escape it.
export function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function button(href: string, label: string): string {
    const t = emailTheme;
    return `<p style="text-align:center;margin:24px 0"><a href="${href}" style="display:inline-block;background:${t.button};color:${t.buttonText};padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>`;
}

function layout(title: string, bodyHtml: string): string {
    const t = emailTheme;
    return `<div style="background:${t.page};padding:32px 16px;font-family:Arial,sans-serif"><div style="max-width:520px;margin:0 auto;background:${t.card};border:1px solid ${t.border};border-radius:16px;padding:32px;color:${t.text}"><h1 style="font-size:22px;text-align:center;margin:0 0 16px">${title}</h1>${bodyHtml}</div></div>`;
}

function fromHeader(ctx: MailContext): string {
    return `"${ctx.siteName.replace(/"/g, '')}" <${ctx.from}>`;
}

export async function sendMagicLinkEmail(ctx: MailContext, toEmail: string, token: string, code: string) {
    const loginUrl = `${ctx.origin}/auth/verify?token=${encodeURIComponent(token)}`;
    const t = emailTheme;
    const html = layout(escapeHtml(ctx.siteName), [
        '<p>Use the button below to sign in.</p>',
        button(loginUrl, 'Sign in'),
        `<p style="color:${t.muted};font-size:14px">Or enter this code on the sign-in screen:</p>`,
        `<p style="font-size:32px;font-weight:700;letter-spacing:4px;margin:8px 0;text-align:center">${code}</p>`,
        `<p style="color:${t.muted};font-size:13px;margin-top:24px">This link and code expire in 15 minutes and can only be used once. If you did not request it, you can ignore this email.</p>`,
    ].join(''));
    const text = `${ctx.siteName}\n\nSign in using this link:\n${loginUrl}\n\nOr enter this code on the sign-in screen:\n${code}\n\nThis link and code expire in 15 minutes and can only be used once.`;

    await ctx.binding.send({ to: toEmail, from: fromHeader(ctx), replyTo: ctx.adminEmail, subject: `Your ${ctx.siteName} sign-in link`, html, text });
}

export async function sendAccessRequestAdminNotificationEmail(ctx: MailContext, requesterEmail: string, fullName: string, message: string | null) {
    const reviewUrl = `${ctx.origin}/admin/access-requests`;
    const t = emailTheme;
    const row = (label: string, value: string) =>
        `<tr><td style="padding:6px 12px 6px 0;color:${t.muted};font-size:13px;vertical-align:top">${label}</td><td style="padding:6px 0">${escapeHtml(value)}</td></tr>`;
    const html = layout('New access request', [
        `<p>A new ${escapeHtml(ctx.siteName)} access request needs admin review.</p>`,
        `<table style="width:100%;border-collapse:collapse;margin:16px 0">${row('Email', requesterEmail)}${row('Name', fullName)}${message ? row('Message', message) : ''}</table>`,
        button(reviewUrl, 'Review request'),
    ].join(''));
    const text = `A new access request needs admin review.\n\nEmail: ${requesterEmail}\nName: ${fullName}${message ? `\nMessage: ${message}` : ''}\n\nReview it here: ${reviewUrl}`;

    await ctx.binding.send({ to: ctx.adminEmail, from: fromHeader(ctx), subject: `New ${ctx.siteName} access request needs review`, html, text });
}

export async function sendAccessRequestOutcomeEmail(ctx: MailContext, toEmail: string, outcome: 'approved' | 'rejected', token: string | null) {
    const approved = outcome === 'approved';
    const loginUrl = token ? `${ctx.origin}/auth/verify?token=${encodeURIComponent(token)}` : `${ctx.origin}/login`;
    const t = emailTheme;
    const safeSiteName = escapeHtml(ctx.siteName);
    const subject = approved ? `Your ${ctx.siteName} access was approved` : `Update on your ${ctx.siteName} request`;
    const html = approved
        ? layout('Access approved', [
            `<p>Your ${safeSiteName} access was approved.</p>`,
            button(loginUrl, 'Sign in'),
            `<p style="color:${t.muted};font-size:13px;margin-top:24px">This sign-in link is valid for 48 hours and can only be used once.</p>`,
        ].join(''))
        : layout('Request update', [
            `<p>We were unable to approve your ${safeSiteName} access request at this time.</p>`,
            `<p style="color:${t.muted};font-size:13px;margin-top:24px">Reply to this email if you believe this was a mistake.</p>`,
        ].join(''));
    const text = approved
        ? `Your ${ctx.siteName} access was approved. This sign-in link is valid for 48 hours: ${loginUrl}`
        : `Your ${ctx.siteName} access request was not approved. Reply to this email if you believe this was a mistake.`;

    await ctx.binding.send({ to: toEmail, from: fromHeader(ctx), replyTo: ctx.adminEmail, subject, html, text });
}

// Logs provider failures without the recipient address (PII) — only its domain.
export function logEmailFailure(label: string, error: unknown, recipient?: string) {
    const emailError = error as { code?: string; message?: string };
    console.error(label, {
        code: emailError?.code ?? 'UNKNOWN',
        message: emailError?.message ?? 'Unknown email provider error',
        ...(recipient ? { recipientDomain: recipient.split('@')[1] ?? 'unknown' } : {}),
    });
}
