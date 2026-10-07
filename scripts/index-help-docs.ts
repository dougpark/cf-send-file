import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chunkHelpDocument, HELP_EMBEDDING_MODEL, type HelpDocumentChunk } from '../src/lib/help-rag';

const API_BASE = 'https://api.cloudflare.com/client/v4';
const INDEXES = {
    dev: 'my-app-help-dev',
    staging: 'my-app-help-staging',
    production: 'my-app-help-prod',
} as const;

type Environment = keyof typeof INDEXES;
type CloudflareEnvelope<T> = { success: boolean; result: T; errors?: Array<{ message?: string }> };
type VectorRecord = { id: string; values: number[]; metadata: Record<string, string> };

function selectedEnvironment(): Environment {
    const optionIndex = Bun.argv.findIndex((argument) => argument === '--env');
    const inlineOption = Bun.argv.find((argument) => argument.startsWith('--env='));
    const value = optionIndex >= 0 ? Bun.argv[optionIndex + 1] : inlineOption?.slice('--env='.length);
    if (!value || !(value in INDEXES)) {
        throw new Error('Choose an index environment with --env dev, --env staging, or --env production.');
    }
    return value as Environment;
}

function requiredEnvironmentValue(name: string): string {
    const value = Bun.env[name]?.trim();
    if (!value) throw new Error(`${name} must be set to run the help document indexer.`);
    return value;
}

async function cloudflareRequest<T>(
    token: string,
    path: string,
    init: RequestInit,
): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            ...init.headers,
        },
    });
    const payload = await response.json() as CloudflareEnvelope<T>;
    if (!response.ok || !payload.success) {
        const detail = payload.errors?.map((error) => error.message).filter(Boolean).join('; ');
        throw new Error(`Cloudflare API request failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    return payload.result;
}

async function embedChunks(token: string, accountId: string, chunks: HelpDocumentChunk[]): Promise<VectorRecord[]> {
    const vectors: VectorRecord[] = [];
    for (let offset = 0; offset < chunks.length; offset += 50) {
        const batch = chunks.slice(offset, offset + 50);
        const result = await cloudflareRequest<{ data: number[][] }>(
            token,
            `/accounts/${accountId}/ai/run/${HELP_EMBEDDING_MODEL}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: batch.map((chunk) => chunk.text) }),
            },
        );
        if (!Array.isArray(result.data) || result.data.length !== batch.length) {
            throw new Error('Workers AI returned an unexpected number of document embeddings.');
        }
        batch.forEach((chunk, index) => {
            const values = result.data[index];
            if (!Array.isArray(values) || values.length !== 384 || !values.every(Number.isFinite)) {
                throw new Error(`Workers AI returned an invalid embedding for "${chunk.title}".`);
            }
            vectors.push({
                id: chunk.id,
                values,
                metadata: {
                    title: chunk.title,
                    slug: chunk.slug,
                    section: chunk.section,
                    audience: chunk.audience,
                    text: chunk.text,
                },
            });
        });
    }
    return vectors;
}

async function main(): Promise<void> {
    const environment = selectedEnvironment();
    const token = requiredEnvironmentValue('CLOUDFLARE_API_TOKEN');
    const config = JSON.parse(await readFile(resolve('wrangler.json'), 'utf8')) as {
        account_id?: string;
    };
    const accountId = config.account_id;
    if (!accountId) throw new Error('wrangler.json must declare account_id.');

    const docsPath = resolve('src/content/docs');
    const filenames = (await readdir(docsPath)).filter((filename) => filename.endsWith('.md') && filename !== 'index.md').sort();
    const chunks: HelpDocumentChunk[] = [];
    for (const filename of filenames) {
        const markdown = await readFile(join(docsPath, filename), 'utf8');
        chunks.push(...await chunkHelpDocument(filename, markdown));
    }
    if (!chunks.length) throw new Error(`No indexable Markdown help guides were found in ${docsPath}.`);

    const indexName = INDEXES[environment];
    const manifestPath = resolve(`scripts/help-index-manifest.${environment}.json`);
    const previousIds = JSON.parse(await readFile(manifestPath, 'utf8')) as string[];
    if (!Array.isArray(previousIds) || previousIds.some((id) => typeof id !== 'string')) {
        throw new Error(`Invalid vector ID manifest: ${manifestPath}`);
    }

    console.log(`Generating embeddings for ${chunks.length} chunks (${environment}: ${indexName})...`);
    const vectors = await embedChunks(token, accountId, chunks);
    for (let offset = 0; offset < vectors.length; offset += 100) {
        const body = vectors.slice(offset, offset + 100).map((vector) => JSON.stringify(vector)).join('\n');
        await cloudflareRequest<{ mutationId: string }>(
            token,
            `/accounts/${accountId}/vectorize/v2/indexes/${indexName}/upsert`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-ndjson' },
                body,
            },
        );
        console.log(`Upserted ${Math.min(offset + 100, vectors.length)} of ${vectors.length} chunks.`);
    }

    const currentIds = new Set(vectors.map((vector) => vector.id));
    const staleIds = previousIds.filter((id) => !currentIds.has(id));
    for (let offset = 0; offset < staleIds.length; offset += 1000) {
        await cloudflareRequest<unknown>(
            token,
            `/accounts/${accountId}/vectorize/v2/indexes/${indexName}/delete_by_ids`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: staleIds.slice(offset, offset + 1000) }),
            },
        );
    }

    await Bun.write(manifestPath, `${JSON.stringify([...currentIds].sort(), null, 2)}\n`);
    console.log(`Indexed ${currentIds.size} chunks in ${indexName}; removed ${staleIds.length} stale chunks.`);
}

await main();
