// src/index.js
// Cloudflare Worker for SEO/Bot pre-rendering of /poetry routes
// Environment variables expected (bound as URL strings):
// - FRITH_HILTON_JSON
// - DR_CARL_HILL_JSON
// - WEST_TO_WEST_JSON

/**
 * Creates a consistent, URL-safe slug from a poem title, handling apostrophes.
 * E.g., "Karma’s Sequel" -> "karmas-sequel"
 * @param {string} title
 * @returns {string}
 */
const createSlug = (title) => {
  return title
    .toLowerCase()
    // 1. Normalize Unicode (e.g., diacritics)
    .normalize("NFD")
    // 2. Remove smart quotes, straight quotes, and other similar characters
    .replace(/[\u2018\u2019'‘`]/g, '')
    // 3. Replace any remaining non-alphanumeric characters or spaces with a single hyphen
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
};

/**
 * Cleans a title for exact matching purposes (removes punctuation, normalizes spaces).
 * @param {string} title
 * @returns {string}
 */
const cleanTitleForMatch = (title) => {
    return title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u2018\u2019'‘`]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}


export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ua = request.headers.get("user-agent") || "";
    // Robust bot check (inherited from previous step)
    const isBot = /Googlebot|Google-InspectionTool|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot|LinkedInBot/i.test(ua);

    const match = url.pathname.match(/^\/poetry\/(.+)$/);
    if (!match || !isBot) return fetch(request);

    const COLLECTIONS = {
      "frith-hilton": env.FRITH_HILTON_JSON,
      "dr-carl-hill": env.DR_CARL_HILL_JSON,
      "west-to-west": env.WEST_TO_WEST_JSON
    };

    const pathParts = match[1].split("/");
    const bookSlug = pathParts[0].toLowerCase();
    const poemSlugRaw = pathParts[1] ? pathParts[1].toLowerCase() : null;

    let book = null;
    let collectionKey = "";

    // 1. Find the book collection
    for (const [key, jsonUrl] of Object.entries(COLLECTIONS)) {
      if (!jsonUrl) continue;
      try {
        const res = await fetch(jsonUrl);
        if (!res.ok) continue;
        const data = await res.json();

        const found = data.find(b => {
          const titleSlug = createSlug(b.bookTitle);
          // Check if book slug is included in book title slug or vice-versa
          return titleSlug.includes(bookSlug) || bookSlug.includes(titleSlug);
        });

        if (found) {
          book = found;
          collectionKey = key;
          break;
        }
      } catch (e) {
        console.error(`Error loading ${key}:`, e);
      }
    }

    if (!book) return fetch(request);

    // Generate canonical book slug/URL
    const bookCleanSlug = createSlug(book.bookTitle);
    const bookUrl = `https://www.frithhilton.com.ng/poetry/${bookCleanSlug}`;

    if (!poemSlugRaw) {
      // Serve Book Index Page
      return new Response(generateBookPage(book, bookUrl), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // 2. Find the poem using the incoming slug

    // Convert incoming slug (e.g., 'karmas-sequel') into a clean search string ('karmas sequel')
    const searchString = poemSlugRaw
      .replace(/-/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Find the poem by matching the cleaned title against the search string
    const poem = book.poems.find(p => {
        const canonicalTitleCleaned = cleanTitleForMatch(p.title);
        return canonicalTitleCleaned === searchString;
    });

    if (!poem) return fetch(request);

    // Generate canonical poem slug
    const poemCleanSlug = createSlug(poem.title);

    // FIXED: Corrected template literal syntax
    const poemUrl = `${bookUrl}/${poemCleanSlug}`;
    
    const poemText = book.content[0][poem.number] || "<p>Full poem available in the book.</p>";

    return new Response(generatePoemPage(book, poem, poemText, bookUrl, poemUrl), {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

function generateBookPage(book, canonical) {
  const samplePoems = book.poems.slice(0, 3).map(p => p.title).join(", ") + (book.poems.length > 3 ? "…" : "");

  // FIXED: Corrected template literal syntax
  const description = `${book.bookTitle} by Frith Hilton, featuring poems like ${samplePoems}, with dedication to ${book.dedicatee}.`;
  const coverUrl = book.image;

  const hasPart = book.poems.map(poem => {
    const slug = createSlug(poem.title);
    // FIXED: Corrected template literal syntax
    return {
      "@type": "Chapter",
      "position": poem.number,
      "name": poem.title,
      "url": `${canonical}/${slug}`,
      "image": coverUrl.replace("/cover.jpg", `/${poem.number}.jpg`),
      "text": (book.content[0][poem.number] || "").replace(/<[^>]*>/g, "").trim()
    };
  });

  const poemsHtml = book.poems.map(p => {
    const slug = createSlug(p.title);
    // FIXED: Corrected template literal syntax
    return `<li><a href="${canonical}/${slug}">${p.number}. ${p.title}</a></li>`;
  }).join("");

  // FIXED: Corrected template literal syntax in HTML metadata and body
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/><meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="author" content="Frith Hilton"/>
  <meta name="description" content="${description}"/>
  <meta name="keywords" content="${book.bookTitle}, Howard Frith Hilton, Frith Hilton, Frith Nightswan Publishers, Forest Crib Books, Poetry dedicated to ${book.dedicatee}"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta property="og:url" content="${canonical}"/><meta property="og:type" content="book"/>
  <meta property="og:title" content="${book.bookTitle} by Frith Hilton"/>
  <meta property="og:description" content="${description}"/>
  <meta property="og:image" content="${coverUrl}"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${book.bookTitle} by Frith Hilton"/>
  <meta name="twitter:description" content="${description}"/>
  <meta name="twitter:image" content="${coverUrl}"/>
  <link rel="canonical" href="${canonical}"/>
  <title>${book.bookTitle} by Frith Hilton</title>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Book",
    "name": "${book.bookTitle}",
    "author": {"@type":"Person","name":"Howard Frith Hilton"},
    "publisher": {"@type":"Organization","name":"Forest Crib Books Imprint under Frith Nightswan Publishers"},
    "datePublished": "${book.releaseDate}",
    "inLanguage": "en",
    "genre": "Poetry",
    "keywords": "${book.bookTitle}, Howard Frith Hilton, Frith Hilton, Poetry dedicated to ${book.dedicatee}",
    "image": "${coverUrl}",
    "url": "${canonical}",
    "hasPart": ${JSON.stringify(hasPart)}
  }
  </script>
</head>
<body>
  <h1>${book.bookTitle}</h1>
  <p><strong>Dedicated to:</strong> ${book.dedicatee}</p>
  <p><strong>Released:</strong> ${book.releaseDate} — ${book.poemCount} poems</p>
  <h2>Table of Contents</h2>
  <ol>${poemsHtml}</ol>
  <footer>© Frith Hilton — Forest Crib Books under Frith Nightswan Publishers</footer>
</body>
</html>`;
}

function generatePoemPage(book, poem, poemText, bookUrl, poemUrl) {
  const cleanText = poemText.replace(/<[^>]*>/g, "").trim();

  // FIXED: Corrected template literal syntax throughout
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="author" content="Frith Hilton"/>
  <meta name="description" content="${poem.title} by Frith Hilton — From ${book.bookTitle}, dedicated to ${book.dedicatee}."/>
  <meta property="og:title" content="${poem.title} — ${book.bookTitle} by Frith Hilton"/>
  <meta property="og:description" content="Full poem from ${book.bookTitle}, dedicated to ${book.dedicatee}."/>
  <meta property="og:type" content="article"/>
  <meta property="og:url" content="${poemUrl}"/>
  <meta property="og:image" content="${book.image.replace("/cover.jpg", `/${poem.number}.jpg`)}"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <link rel="canonical" href="${poemUrl}"/>
  <title>${poem.title} by Frith Hilton — ${book.bookTitle}</title>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": "${poem.title}",
    "author": {"@type":"Person","name":"Howard Frith Hilton"},
    "datePublished": "${book.releaseDate}",
    "url": "${poemUrl}",
    "text": "${cleanText}",
    "image": "${book.image.replace("/cover.jpg", `/${poem.number}.jpg`)}",
    "isPartOf": {
      "@type": "Book",
      "name": "${book.bookTitle}",
      "url": "${bookUrl}"
    },
    "position": ${poem.number}
  }
  </script>
</head>
<body>
  <nav><a href="${bookUrl}">${book.bookTitle}</a> » ${poem.title}</nav>
  <h1>${poem.title}</h1>
  <p><em>From <strong>${book.bookTitle}</strong> — Dedicated to ${book.dedicatee}</em></p>
  <div class="poem">${poemText}</div>
  <footer>© Frith Hilton — Forest Crib Books under Frith Nightswan Publishers</footer>
</body>
</html>`;
}