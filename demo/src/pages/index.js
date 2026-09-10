import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';

export default function Home() {
  return (
    <main className="hero hero--primary demo-hero">
      <div className="container">
        <Heading as="h1" className="hero__title">
          Docusaurus Plugin AI
        </Heading>
        <p className="hero__subtitle">A working demo of build-time docs indexing and provider-based Q&A.</p>
        <div className="demo-actions">
          <Link className="button button--secondary button--lg" to="/ai">
            Ask the documentation
          </Link>
          <Link className="button button--outline button--lg" to="/docs/intro">
            Read the docs
          </Link>
        </div>
      </div>
    </main>
  );
}
