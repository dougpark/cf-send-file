import DOMPurify from 'dompurify';

// Registered once at module load (not per component instance).
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener noreferrer');
});

// Strips <script>, on* handlers and javascript:/data: URLs while keeping the formatting markdown authors rely on.
export function sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
}
