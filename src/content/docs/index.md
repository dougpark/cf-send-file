# Help Center

This help center explains how members and staff use the site. Each guide stands on its own, so it can answer a specific question in the help assistant or be read directly.

## Member guides

- [Getting started and signing in](getting-started-and-sign-in.md)
- [Managing your account](your-account.md)
- [Using the help assistant](using-site-help-chat.md)

## Staff guide

- [Admin area and staff responsibilities](admin-area.md)

## Writing new guides

Add a Markdown file to `src/content/docs/`, starting with a single `# Title` heading and `##` sections. Each `##` section becomes a searchable chunk for the help assistant. Run `bun run index:help` after editing guides to refresh the assistant's index. Guides named `admin-area.md` are only used to answer staff questions.
