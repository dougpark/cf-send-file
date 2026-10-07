// Renames the starter's placeholders to a new app's name.
// Usage: bun scripts/init-project.ts "Acme Portal" [acme-portal]
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FILES = [
    'package.json',
    'bun.lock',
    'wrangler.json',
    'index.html',
    'public/favicon/site.webmanifest',
    'scripts/index-help-docs.ts',
    'src/lib/config.ts',
    'src/composables/useSiteSettings.ts',
    'src/views/AdminSettingsView.vue',
    'docs/intent.md',
    'CLAUDE.md',
    '.github/copilot-instructions.md',
];

const displayName = process.argv[2]?.trim();
if (!displayName) {
    console.error('Usage: bun scripts/init-project.ts "Display Name" [kebab-slug]');
    process.exit(1);
}

const slug = (process.argv[3] ?? displayName).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
if (!/^[a-z][a-z0-9-]{1,40}$/.test(slug)) {
    console.error(`Invalid slug "${slug}". Use lowercase letters, digits, and dashes, starting with a letter.`);
    process.exit(1);
}
const snake = slug.replaceAll('-', '_');

const root = join(import.meta.dir, '..');
let changed = 0;
for (const file of FILES) {
    const path = join(root, file);
    const before = await readFile(path, 'utf8').catch(() => null);
    if (before === null) continue;
    const after = before
        .replaceAll('cf-vue-starter', slug)
        .replaceAll('my-app', slug)
        .replaceAll('my_app', snake)
        .replaceAll('My App', displayName);
    if (after !== before) {
        await writeFile(path, after);
        changed += 1;
        console.log(`updated ${file}`);
    }
}

console.log(`\n${changed} file(s) renamed to "${displayName}" (${slug}).`);
console.log('Next: replace the REPLACE_WITH_*_D1_ID placeholders and MAIL_FROM in wrangler.json, and fill in docs/intent.md.');
