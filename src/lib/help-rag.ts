export const HELP_EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5';
export const HELP_CHAT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const HELP_MAX_QUERY_LENGTH = 1000;
export const HELP_MAX_HISTORY_MESSAGES = 6;
export const HELP_TOP_K = 5;
export const HELP_MAX_CHUNK_LENGTH = 1200;

export interface HelpDocumentChunk {
    id: string;
    title: string;
    slug: string;
    section: string;
    audience: 'member' | 'staff';
    text: string;
}

export interface HelpSource {
    title: string;
    slug: string;
    section: string;
}

export interface HelpVectorMetadata {
    title?: string;
    slug?: string;
    section?: string;
    audience?: string;
    text?: string;
}

export function slugify(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'section';
}

export function markdownToPlainText(markdown: string): string {
    return markdown
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/<[^>]*>/g, ' ')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/[*_~]/g, '')
        .replace(/\r/g, '')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

export async function stableChunkId(slug: string, section: string, text: string): Promise<string> {
    const input = new TextEncoder().encode(`${slug}\n${section}\n${text}`);
    const digest = await crypto.subtle.digest('SHA-256', input);
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${slug}-${hash.slice(0, 32)}`;
}

function splitLongBlock(block: string, maxLength: number): string[] {
    const sentences = block.match(/[^.!?]+[.!?]+[\])'"`]*|[^.!?]+$/g) ?? [block];
    const pieces: string[] = [];
    let current = '';

    for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;
        if (trimmed.length > maxLength) {
            if (current) pieces.push(current);
            current = '';
            for (let offset = 0; offset < trimmed.length; offset += maxLength) {
                pieces.push(trimmed.slice(offset, offset + maxLength).trim());
            }
            continue;
        }
        if (current && `${current} ${trimmed}`.length > maxLength) {
            pieces.push(current);
            current = trimmed;
        } else {
            current = current ? `${current} ${trimmed}` : trimmed;
        }
    }

    if (current) pieces.push(current);
    return pieces;
}

export async function chunkHelpDocument(
    filename: string,
    markdown: string,
    maxLength = HELP_MAX_CHUNK_LENGTH,
): Promise<HelpDocumentChunk[]> {
    const slug = filename.replace(/\.md$/i, '');
    const audience = slug === 'admin-area' ? 'staff' : 'member';
    const lines = markdown.split(/\r?\n/);
    const title = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, '').trim() || slug;
    const sections: Array<{ heading: string; body: string[] }> = [];
    let heading = title;
    let body: string[] = [];

    const flush = () => {
        const text = markdownToPlainText(body.join('\n'));
        if (text) sections.push({ heading, body: [text] });
        body = [];
    };

    for (const line of lines) {
        const match = line.match(/^#{2,6}\s+(.+?)\s*#*\s*$/);
        if (match) {
            flush();
            heading = match[1]!.trim();
        } else if (!/^#\s+/.test(line)) {
            body.push(line);
        }
    }
    flush();

    const chunks: HelpDocumentChunk[] = [];
    for (const section of sections) {
        const content = section.body.join('\n');
        const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
        let current = '';
        const sectionSlug = slugify(section.heading);
        const contextualPrefix = `${title} — ${section.heading}\n`.slice(0, Math.max(0, maxLength - 1));
        const bodyLimit = Math.max(1, maxLength - contextualPrefix.length);
        const texts: string[] = [];

        for (const block of blocks) {
            for (const piece of splitLongBlock(block, bodyLimit)) {
                if (current && `${current}\n\n${piece}`.length > bodyLimit) {
                    texts.push(current);
                    current = piece;
                } else {
                    current = current ? `${current}\n\n${piece}` : piece;
                }
            }
        }
        if (current) texts.push(current);

        for (const text of texts) {
            const contextualText = `${contextualPrefix}${text}`;
            chunks.push({
                id: await stableChunkId(slug, sectionSlug, contextualText),
                title,
                slug,
                section: section.heading,
                audience,
                text: contextualText,
            });
        }
    }
    return chunks;
}

export function isHelpAudience(value: unknown): value is HelpDocumentChunk['audience'] {
    return value === 'member' || value === 'staff';
}

export function helpSourceHref(source: HelpSource): string {
    return `/help?doc=${encodeURIComponent(source.slug)}`;
}
