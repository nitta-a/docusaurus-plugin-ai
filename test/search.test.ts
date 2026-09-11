import { describe, expect, it } from 'vitest';
import { createDocumentRetriever, type DocumentChunk, searchDocuments } from '../src/index.js';

const documents: readonly DocumentChunk[] = [
  {
    id: 'auth',
    title: '認証ガイド',
    url: '/docs/auth',
    heading: '認証設定',
    content: '環境変数にAPIキーを設定して認証します。',
    type: 'prose',
  },
  {
    id: 'deploy',
    title: 'デプロイ',
    url: '/docs/deploy',
    heading: '公開設定',
    content: '本番環境へサイトを公開します。',
    type: 'prose',
  },
];

describe('Japanese document search', () => {
  it('finds a relevant chunk for an unspaced Japanese query', () => {
    expect(searchDocuments('環境変数APIキー', documents)[0]).toMatchObject({ document: { id: 'auth' } });
  });

  it('exposes the indexed chunks through the AIRetriever search contract', async () => {
    const retriever = createDocumentRetriever(documents);
    const results = await retriever.search?.('認証設定');
    expect(results?.[0]).toMatchObject({ id: 'auth', heading: '認証設定' });
  });
});
