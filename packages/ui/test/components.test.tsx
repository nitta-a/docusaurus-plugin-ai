import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AiChat, AiChatButton, ChatInput, ChatMessage } from '../src/index.js';

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
});
