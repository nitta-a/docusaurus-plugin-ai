import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AiChat, AiChatButton, AiChatPanel, ChatInput, ChatMessage } from '../src/index.js';

describe('UI components', () => {
  it('renders an accessible launcher and message labels', () => {
    const markup = renderToStaticMarkup(
      <>
        <AiChatButton isOpen={false} onClick={() => undefined} />
        <ChatMessage message={{ id: '1', role: 'assistant', content: 'Hello' }} />
      </>,
    );

    expect(markup).toContain('aria-label="Open AI chat"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('>AI<');
    expect(markup).toContain('Hello');
  });

  it('composes the launcher and open panel with endpoint context', () => {
    const markup = renderToStaticMarkup(
      <AiChat endpoint="/api/ai/chat" context={{ pathname: '/docs/intro' }} defaultOpen />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-label="Close AI chat"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('docusaurus-ai-chat-input');
  });

  it('renders a semantic form with a disabled empty submission', () => {
    const markup = renderToStaticMarkup(<ChatInput value="" onChange={() => undefined} onSubmit={() => undefined} />);

    expect(markup).toContain('<form');
    expect(markup).toContain('<textarea');
    expect(markup).toContain('type="submit"');
    expect(markup).toContain('disabled=""');
  });

  it('renders RAG citations and structured error details', () => {
    const markup = renderToStaticMarkup(
      <AiChatPanel
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '回答本文',
            sources: [{ id: 'setup', title: '設定ガイド', url: '/docs/setup', snippet: '引用スニペット' }],
          },
        ]}
        input=""
        onInputChange={() => undefined}
        onSubmit={() => undefined}
        onClose={() => undefined}
        isLoading={false}
        error={{
          error: 'AIサービスでエラーが発生しました。',
          code: 'AI_PROVIDER_ERROR',
          detail: 'provider error',
          status: 500,
          traceId: 'trace-1',
        }}
      />,
    );

    expect(markup).toContain('回答本文');
    expect(markup).toContain('設定ガイド');
    expect(markup).toContain('引用スニペット');
    expect(markup).toContain('AI_PROVIDER_ERROR');
    expect(markup).toContain('provider error');
    expect(markup).toContain('trace-1');
    expect(markup).toContain('>Copy<');
  });
});
