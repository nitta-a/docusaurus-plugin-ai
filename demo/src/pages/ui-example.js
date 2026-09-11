import { AiChat } from '@docusaurus-plugin-ai/ui';
import '@docusaurus-plugin-ai/ui/styles.css';
import Layout from '@theme/Layout';

export default function UiExample() {
  return (
    <Layout title="AI UI example">
      <main className="container" style={{ padding: '3rem 1rem' }}>
        <h1>AI UI package example</h1>
        <p>
          This page imports <code>@docusaurus-plugin-ai/ui</code>. Configure an application-owned{' '}
          <code>/api/ai/chat</code> endpoint to enable responses.
        </p>
        <AiChat endpoint="/api/ai/chat" context={{ pathname: '/ui-example' }} defaultOpen />
      </main>
    </Layout>
  );
}
