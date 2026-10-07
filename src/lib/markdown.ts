import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import markdownItContainer from 'markdown-it-container';
import markdownItAttrs from 'markdown-it-attrs';

const phonePattern = /(?:\+?1[\s.-]*)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.-]*\d{3}[\s.-]*\d{4}(?:\s*(?:x|ext\.?|extension)\s*\d{1,6})?/gi;

function phoneHref(value: string): string {
    const extensionMatch = value.match(/\b(?:x|ext\.?|extension)\s*(\d{1,6})$/i);
    const extension = extensionMatch?.[1];
    const mainNumber = extensionMatch ? value.slice(0, extensionMatch.index).trim() : value.trim();
    const hasPlus = mainNumber.startsWith('+');
    const digits = mainNumber.replace(/\D/g, '');
    return `tel:${hasPlus ? '+' : ''}${digits}${extension ? `;ext=${extension}` : ''}`;
}

function linkPhoneNumbers(md: MarkdownIt): void {
    md.core.ruler.after('inline', 'phone_linkify', (state) => {
        for (const blockToken of state.tokens) {
            if (blockToken.type !== 'inline' || !blockToken.children) continue;

            const children = blockToken.children;
            const nextChildren = [];
            let linkDepth = 0;

            for (const token of children) {
                if (token.type === 'link_open') linkDepth++;
                if (token.type === 'link_close') linkDepth = Math.max(0, linkDepth - 1);

                if (token.type !== 'text' || linkDepth > 0) {
                    nextChildren.push(token);
                    continue;
                }

                const text = token.content;
                let cursor = 0;
                let match: RegExpExecArray | null;
                phonePattern.lastIndex = 0;

                while ((match = phonePattern.exec(text)) !== null) {
                    const matchedPhone = match[0];
                    const index = match.index;
                    if (index > cursor) {
                        const before = new state.Token('text', '', 0);
                        before.content = text.slice(cursor, index);
                        nextChildren.push(before);
                    }

                    const open = new state.Token('link_open', 'a', 1);
                    open.attrs = [['href', phoneHref(matchedPhone)]];
                    const phoneText = new state.Token('text', '', 0);
                    phoneText.content = matchedPhone;
                    const close = new state.Token('link_close', 'a', -1);
                    nextChildren.push(open, phoneText, close);

                    cursor = index + matchedPhone.length;
                }

                if (cursor === 0) {
                    nextChildren.push(token);
                } else if (cursor < text.length) {
                    const after = new state.Token('text', '', 0);
                    after.content = text.slice(cursor);
                    nextChildren.push(after);
                }
            }

            blockToken.children = nextChildren;
        }
    });
}

export function createMarkdownRenderer(): MarkdownIt {
    const md = new MarkdownIt({ html: true, linkify: true })
        .use(taskLists, { enabled: false, label: true })
        .use(markdownItAttrs, {
            leftDelimiter: '{',
            rightDelimiter: '}',
            allowedAttributes: ['class', 'width', 'height', 'style', 'id', 'align'],
        });

    ['info', 'warning', 'danger'].forEach((type) => {
        md.use(markdownItContainer, type, {
            render(tokens: any[], idx: number) {
                const token = tokens[idx];
                if (token.nesting === 1) {
                    return `<div class="callout callout-${type}" role="alert">\n`;
                }
                return '</div>\n';
            },
        });
    });

    md.use(markdownItContainer, 'row', {
        render(tokens: any[], idx: number) {
            const token = tokens[idx];
            if (token.nesting === 1) {
                return `<div class="callout-row row">\n`;
            }
            return '</div>\n';
        },
    });

    // Wraps a single document/folder library link so it renders as a clickable
    // card instead of plain inline text — see .callout-document in style.css.
    md.use(markdownItContainer, 'document', {
        render(tokens: any[], idx: number) {
            const token = tokens[idx];
            if (token.nesting === 1) {
                return `<div class="callout callout-document" role="group">\n`;
            }
            return '</div>\n';
        },
    });

    linkPhoneNumbers(md);
    return md;
}
