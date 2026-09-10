import { AIChat } from '../chat.js';
import { createLocalAIProvider } from '../local-provider.js';
import type { AIDocument } from '../provider.js';

interface AIPageProps {
  index: {
    documents: AIDocument[];
  };
}

/** Route component used by the plugin's no-credentials demo page. */
export default function AIPage({ index }: AIPageProps) {
  const documents = index?.documents ?? [];
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '3rem 1rem' }}>
      <AIChat
        provider={createLocalAIProvider({ documents })}
        title="Documentation AI"
        description={`ローカルに生成した ${documents.length} 件の docs インデックスを検索します。外部 API や認証情報は不要です。`}
        placeholder="例: plugin の設定方法を教えて"
      />
    </main>
  );
}
