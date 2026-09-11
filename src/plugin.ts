import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LoadContext, Plugin } from '@docusaurus/types';
import { parseMarkdownToChunks } from './build/parser.js';
import type { DocumentChunk } from './core/types.js';

export interface DocusaurusPluginAIOptions {
  /** Docs directory relative to the Docusaurus site directory. */
  docsDir?: string;
  /** Base path used to link back to the generated documentation pages. */
  docsRouteBasePath?: string;
  /** Route added by the plugin for the built-in chat page. */
  routePath?: string;
}

interface FrontMatter {
  title?: string;
  description?: string;
  slug?: string;
}

interface PluginContent {
  chunks: DocumentChunk[];
}

const parseScalar = (value: string): string => value.trim().replace(/^['"]|['"]$/gu, '');

const readFrontMatter = (source: string): { data: FrontMatter; body: string } => {
  if (!source.startsWith('---')) return { data: {}, body: source };
  const end = source.indexOf('\n---', 3);
  if (end < 0) return { data: {}, body: source };

  const data: FrontMatter = {};
  for (const line of source.slice(3, end).split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = parseScalar(line.slice(separator + 1));
    if (key === 'title' || key === 'description' || key === 'slug') data[key] = value;
  }
  return { data, body: source.slice(end + 4) };
};

const walkMarkdownFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = resolve(directory, entry.name);
      if (entry.isDirectory()) return walkMarkdownFiles(entryPath);
      return /\.mdx?$/u.test(extname(entry.name)) ? [entryPath] : [];
    }),
  );
  return files.flat();
};

const documentUrl = (relativePath: string, routeBasePath: string, slug?: string): string => {
  if (slug) return slug.startsWith('/') ? slug : `/${slug}`;
  const withoutExtension = relativePath
    .replace(/\.mdx?$/u, '')
    .split(sep)
    .join('/');
  const pagePath = withoutExtension === 'index' ? '' : withoutExtension.replace(/\/index$/u, '');
  return `${routeBasePath.replace(/\/$/u, '')}/${pagePath}`.replace(/\/$/u, '') || '/';
};

export const loadDocuments = async (docsDirectory: string, docsRouteBasePath = '/docs'): Promise<DocumentChunk[]> => {
  const files = await walkMarkdownFiles(docsDirectory);
  const documents = await Promise.all(
    files.map(async (filePath) => {
      const source = await readFile(filePath, 'utf8');
      const { data, body } = readFrontMatter(source);
      const relativePath = relative(docsDirectory, filePath);
      const id = relativePath
        .replace(/\.mdx?$/u, '')
        .split(sep)
        .join('/');
      const title = data.title ?? (basename(id).replace(/[-_]/gu, ' ') || 'Documentation');
      return parseMarkdownToChunks({
        title,
        url: documentUrl(relativePath, docsRouteBasePath, data.slug),
        rawMarkdown: body,
      }).map((chunk) => ({
        ...chunk,
        ...(data.description && !chunk.headingPath?.length
          ? { content: `${data.description}\n\n${chunk.content}` }
          : {}),
        id: `${id}:${chunk.id}`,
      }));
    }),
  );
  return documents.flat().sort((left, right) => left.id.localeCompare(right.id));
};

const normalizePath = (value: string): string => `/${value.replace(/^\/+|\/+$/gu, '')}`;
const themePagePath =
  typeof __dirname === 'string'
    ? resolve(__dirname, 'theme/AIPage.cjs')
    : resolve(dirname(fileURLToPath(import.meta.url)), 'theme/AIPage.js');

/** Docusaurus plugin that indexes local Markdown/MDX docs and adds an AI page. */
const docusaurusPluginAI = (context: LoadContext, options: DocusaurusPluginAIOptions = {}): Plugin<PluginContent> => {
  const docsDirectory = resolve(context.siteDir, options.docsDir ?? 'docs');
  const docsRouteBasePath = normalizePath(options.docsRouteBasePath ?? '/docs');
  const routePath = normalizePath(options.routePath ?? '/ai');

  return {
    name: 'docusaurus-plugin-ai',
    async loadContent() {
      return {
        chunks: await loadDocuments(docsDirectory, docsRouteBasePath),
      };
    },
    async contentLoaded({ content, actions }) {
      const indexPath = await actions.createData('ai-index.json', JSON.stringify(content));
      actions.addRoute({
        path: routePath,
        component: themePagePath,
        exact: true,
        modules: { index: indexPath },
      });
    },
    getPathsToWatch() {
      return [docsDirectory];
    },
  };
};

export default docusaurusPluginAI;
