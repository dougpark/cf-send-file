import { describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chunkHelpDocument, helpSourceHref, markdownToPlainText, slugify } from './help-rag';

describe('help document chunking', () => {
    test('preserves document and section context and assigns staff audience only to the admin guide', async () => {
        const memberChunks = await chunkHelpDocument('widgets.md', '# Widgets\n\nIntro.\n\n## Favorites\n\nStar a widget.');
        const [staffChunk] = await chunkHelpDocument('admin-area.md', '# Admin\n\n## Roles\n\nManage access.');
        const memberChunk = memberChunks.find((chunk) => chunk.section === 'Favorites');

        expect(memberChunk).toMatchObject({
            title: 'Widgets',
            slug: 'widgets',
            section: 'Favorites',
            audience: 'member',
        });
        expect(memberChunk?.text).toContain('Widgets — Favorites');
        expect(staffChunk?.audience).toBe('staff');
    });

    test('splits long content to the configured maximum and uses deterministic vector IDs', async () => {
        const markdown = `# Guide\n\n## Details\n\n${'Useful help text. '.repeat(160)}`;
        const chunks = await chunkHelpDocument('guide.md', markdown, 180);
        const repeat = await chunkHelpDocument('guide.md', markdown, 180);

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((chunk) => chunk.text.length <= 180)).toBe(true);
        expect(chunks.map((chunk) => chunk.id)).toEqual(repeat.map((chunk) => chunk.id));
    });

    test('converts Markdown links and formatting into readable plain text', () => {
        expect(markdownToPlainText('## Help\n\n- **Open** [the help page](/help).')).toBe('Help\nOpen the help page.');
    });

    test('creates safe guide links and heading slugs', () => {
        expect(slugify('Pay Dues & Security!')).toBe('pay-dues-security');
        expect(helpSourceHref({ title: 'Help', slug: 'dues-and-security-payments', section: 'Checkout' }))
            .toBe('/help?doc=dues-and-security-payments');
    });

    test('chunks every published help guide except the table-of-contents index', async () => {
        const docsDirectory = join(process.cwd(), 'src/content/docs');
        const filenames = (await readdir(docsDirectory)).filter((filename) => filename.endsWith('.md') && filename !== 'index.md');
        for (const filename of filenames) {
            const markdown = await readFile(join(docsDirectory, filename), 'utf8');
            const chunks = await chunkHelpDocument(filename, markdown);
            expect(chunks.length, filename).toBeGreaterThan(0);
            expect(chunks.every((chunk) => chunk.text.length <= 1200), filename).toBe(true);
        }
    });
});
