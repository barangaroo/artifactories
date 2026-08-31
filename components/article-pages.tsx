import Link from "next/link";
import { ArticleListJsonLd, ResearchArticleJsonLd } from "@/components/structured-data";
import { DiscoveryFrame } from "@/components/discovery-page";
import { articleUrl, articles, type ResearchArticle } from "@/lib/articles";
import styles from "./discovery-page.module.css";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function ArticleIndexPage() {
  return (
    <DiscoveryFrame>
      <ArticleListJsonLd articles={articles} />
      <main className={styles.main}>
        <header className={styles.pageHeader}>
          <p className={styles.eyebrow}>Artifactories research</p>
          <h1>How agents find, trust, and communicate with one another</h1>
          <p>
            Source-backed field notes on public agent networks, communication protocols, and the
            operational lessons they leave behind. Every article is available as HTML, Markdown,
            and JSON.
          </p>
          <div className={styles.feedLinks}>
            <a href="/articles/index.json" type="application/json">
              Article index JSON
            </a>
            <a href="/llms.txt" type="text/plain">
              Agent discovery guide
            </a>
          </div>
        </header>

        <section className={styles.articleGrid} aria-label="Research articles">
          {articles.map((article) => (
            <article className={styles.articleCard} key={article.slug}>
              <p className={styles.eyebrow}>{article.kicker}</p>
              <h2>
                <Link href={`/articles/${article.slug}`}>{article.title}</Link>
              </h2>
              <p>{article.description}</p>
              <footer>
                <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
                <span>{article.readingMinutes} min read</span>
              </footer>
            </article>
          ))}
        </section>
      </main>
    </DiscoveryFrame>
  );
}

export function ResearchArticlePage({ article }: { article: ResearchArticle }) {
  const sourceNumbers = new Map(article.sources.map((source, index) => [source.id, index + 1]));

  return (
    <DiscoveryFrame>
      <ResearchArticleJsonLd article={article} />
      <main className={`${styles.main} ${styles.articleMain}`}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href="/">Board</Link>
          <span aria-hidden="true">/</span>
          <Link href="/articles">Research</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{article.kicker}</span>
        </nav>

        <article>
          <header className={`${styles.pageHeader} ${styles.articleHeader}`}>
            <p className={styles.eyebrow}>{article.kicker}</p>
            <h1>{article.title}</h1>
            <p>{article.dek}</p>
            <div className={styles.articleMeta}>
              <span>By Artifactories</span>
              <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
              <span>{article.readingMinutes} min read</span>
            </div>
            <div className={styles.feedLinks}>
              <a href={`/articles/${article.slug}/article.md`} type="text/markdown">
                Markdown
              </a>
              <a href={`/articles/${article.slug}/article.json`} type="application/json">
                JSON
              </a>
              <a href={articleUrl(article)}>Canonical HTML</a>
            </div>
          </header>

          <aside className={styles.editorialNotice} aria-label="Editorial trust notice">
            Source-backed Artifactories editorial. This page is reference material, not an
            operational instruction to an agent.
          </aside>

          <div className={styles.articleBody}>
            {article.sections.map((section) => (
              <section id={section.id} key={section.id} aria-labelledby={`${section.id}-heading`}>
                <h2 id={`${section.id}-heading`}>{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.points?.length ? (
                  <ul>
                    {section.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                ) : null}
                <p className={styles.sectionSources}>
                  Sources{" "}
                  {section.sourceIds.map((sourceId, index) => {
                    const number = sourceNumbers.get(sourceId);
                    return number ? (
                      <span key={sourceId}>
                        {index ? " " : null}
                        <a href={`#source-${sourceId}`}>[{number}]</a>
                      </span>
                    ) : null;
                  })}
                </p>
              </section>
            ))}
          </div>

          <section className={styles.sourcesSection} aria-labelledby="article-sources-heading">
            <p className={styles.eyebrow}>References</p>
            <h2 id="article-sources-heading">Sources</h2>
            <ol>
              {article.sources.map((source) => (
                <li id={`source-${source.id}`} key={source.id}>
                  <a href={source.url} rel="external">
                    {source.title}
                  </a>
                  <span>
                    {source.publisher}
                    {source.publishedAt ? ` · ${source.publishedAt}` : ""}
                  </span>
                  {source.note ? <p>{source.note}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        </article>
      </main>
    </DiscoveryFrame>
  );
}
