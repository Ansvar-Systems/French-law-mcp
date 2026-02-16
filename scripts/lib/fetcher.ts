/**
 * DILA / Legifrance fetcher for French legislation.
 *
 * Strategy:
 *   1. Try PISTE API sandbox (no auth) for structured article data
 *   2. Fall back to Legifrance HTML scraping for individual articles
 *   3. Fall back to manual seed JSONs (always available)
 *
 * Rate limiting: 500ms between requests.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FetchedArticle {
  id: string;
  num: string;           // e.g. "L323-1", "R2321-1"
  title: string;         // e.g. "Article L323-1"
  content: string;       // HTML-stripped article text
  dateDebut?: string;    // ISO date
  dateFin?: string;      // ISO date
  etat: string;          // "VIGUEUR" | "ABROGE" etc.
  codeId?: string;       // LEGI code identifier
  codeName?: string;     // Human-readable code name
  url?: string;          // Legifrance URL
}

export interface FetchedCode {
  id: string;
  name: string;
  articles: FetchedArticle[];
}

export interface FetcherOptions {
  delayMs?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// HTML tag stripper (basic)
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// PISTE API sandbox client
// ---------------------------------------------------------------------------

const PISTE_SANDBOX_BASE = 'https://sandbox-api.piste.gouv.fr/dila/legifrance/lf-engine-app';

interface PisteSearchResult {
  results?: Array<{
    titles?: Array<{ id: string; title: string }>;
    sections?: Array<{
      id: string;
      title: string;
      articles?: Array<{
        id: string;
        num: string;
        texte: string;
        texteHtml: string;
        etat: string;
        dateDebut: number;
        dateFin: number;
      }>;
    }>;
  }>;
}

/**
 * Try fetching articles from the PISTE sandbox API.
 * Returns null if the sandbox is unavailable or requires auth.
 */
export async function fetchFromPisteSandbox(
  textId: string,
  _options: FetcherOptions = {}
): Promise<FetchedArticle[] | null> {
  const delayMs = _options.delayMs ?? 500;

  try {
    const url = `${PISTE_SANDBOX_BASE}/consult/code`;
    const body = JSON.stringify({
      textId,
      date: new Date().toISOString().split('T')[0],
    });

    await sleep(delayMs);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.log(`  PISTE sandbox returned ${response.status} for ${textId}`);
      return null;
    }

    const data = await response.json() as PisteSearchResult;
    const articles: FetchedArticle[] = [];

    for (const result of data.results ?? []) {
      for (const section of result.sections ?? []) {
        for (const art of section.articles ?? []) {
          if (art.etat !== 'VIGUEUR') continue;

          articles.push({
            id: art.id,
            num: art.num,
            title: `Article ${art.num}`,
            content: stripHtml(art.texteHtml || art.texte),
            dateDebut: art.dateDebut ? new Date(art.dateDebut).toISOString().split('T')[0] : undefined,
            dateFin: art.dateFin && art.dateFin < 32503680000000
              ? new Date(art.dateFin).toISOString().split('T')[0]
              : undefined,
            etat: art.etat,
          });
        }
      }
    }

    return articles.length > 0 ? articles : null;
  } catch (err) {
    console.log(`  PISTE sandbox unavailable: ${(err as Error).message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Legifrance HTML scraper (fallback)
// ---------------------------------------------------------------------------

/**
 * Fetch a single article page from Legifrance and extract its text.
 * This is a lightweight fallback when PISTE is unavailable.
 */
export async function fetchArticleFromLegifrance(
  articleId: string,
  delayMs = 500
): Promise<FetchedArticle | null> {
  try {
    const url = `https://www.legifrance.gouv.fr/codes/article_lc/${articleId}`;
    await sleep(delayMs);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Ansvar-French-Law-MCP/1.0 (legal research; https://ansvar.eu)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Extract article number from <h2> or title
    const numMatch = html.match(/Article\s+(L\.?\s*[\d-]+|R\.?\s*[\d-]+|D\.?\s*[\d-]+|[\d-]+)/i);
    const num = numMatch?.[1]?.replace(/\s+/g, '') ?? articleId;

    // Extract article content from the article body div
    const contentMatch = html.match(/<div[^>]*class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const content = contentMatch ? stripHtml(contentMatch[1]) : '';

    if (!content) return null;

    return {
      id: articleId,
      num,
      title: `Article ${num}`,
      content,
      etat: 'VIGUEUR',
      url,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

export { stripHtml, sleep };
