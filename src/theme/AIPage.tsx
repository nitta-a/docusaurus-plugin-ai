import { AIChat } from '../chat.js';
import type { DocumentChunk } from '../core/types.js';
import { createLocalAIProvider } from '../local-provider.js';

interface AIPageProps {
  index: {
    chunks: DocumentChunk[];
  };
}

/** Route component used by the plugin's no-credentials demo page. */
export default function AIPage({ index }: AIPageProps) {
  const chunks = index?.chunks ?? [];
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '3rem 1rem' }}>
      <AIChat
        provider={createLocalAIProvider({ documents: chunks })}
        title="Documentation AI"
        description={`ローカルに生成した ${chunks.length} 件の docs チャンクを検索します。外部 API や認証情報は不要です。`}
        placeholder="例: plugin の設定方法を教えて"
      />
    </main>
  );
}
