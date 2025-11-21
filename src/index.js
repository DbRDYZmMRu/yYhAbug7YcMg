// src/index.js
// Cloudflare Worker for SEO/Bot pre-rendering of /poetry routes
// Environment variables expected (bound as URL strings):
// - FRITH_HILTON_JSON
// - DR_CARL_HILL_JSON
// - WEST_TO_WEST_JSON

function cleanPath(path) {
  if (!path || path === '') return '/';
  // Ensures path always starts with / and cleans up double slashes
  return '/' + path.replace(/^\/+/, '').replace(/\/+/g, '/');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ua = request.headers.get("user-agent") || "";
    const isBot = /Googlebot|Google-InspectionTool|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot|LinkedInBot/i.test(ua);

    const match = url.pathname.match(/^\/poetry\/(.+)$/);
    
    // Only proceed if it's a bot AND the path matches /poetry/...
    if (!match || !isBot) return fetch(request);

    // Dynamic mapping of collection names to environment bindings
    const COLLECTIONS = {
      "frith-hilton": env.FRITH_HILTON_JSON,
      "dr-carl-hill": env.DR_CARL_HILL_JSON,
      "west-to-west": env.WEST_TO_WEST_JSON
    };
    
    const pathParts = match[1].split("/");
    const bookSlug = pathParts[0].toLowerCase();
    const poemSlug = pathParts[1] ? pathParts[1].toLowerCase() : null;

    let book = null;
    let collectionKey = "";

    // Iterate through collections to find the matching book
    for (const [key, jsonUrl] of Object.entries(COLLECTIONS)) {
      if (!jsonUrl) continue; // Skip if the binding is missing
      try {
        const res = await fetch(jsonUrl);
        if (!res.ok) continue;
        const data = await res.json();
        
        // Find book by checking if book slug is included in book title slug
        const found = data.find(b => {
          const bookTitleSlug = b.bookTitle.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
          return bookTitleSlug.includes(bookSlug) || bookSlug.includes(bookTitleSlug);
        });
        
        if (found) {
          book = found;
          collectionKey = key;
          break;
        }
      } catch (e) {
        console.error(`Error fetching/parsing JSON for ${key}:`, e);
      }
    }

    if (!book) return fetch(request);

    // Generate clean slug for the canonical URL
    const bookCleanSlug = book.bookTitle
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const bookUrl = `https://www.frithhilton.com.ng/poetry/${bookCleanSlug}`;

    if (!poemSlug) {
      // Serve Book Index Page
      return new Response(generateBookPage(book, bookUrl, collectionKey), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // Handle Poem Page
    const poemCleanTitle = poemSlug.replace(/-/g, " ");
    const poem = book.poems.find(p => 
      // Look for a case-insensitive match (allowing for minor differences)
      p.title.toLowerCase().replace(/’/g, "'").includes(poemCleanTitle)
    );
    
    if (!poem) return fetch(request);

    const poemCleanSlug = poem.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
      
    // CORRECTED: Use correct template literal syntax for poemUrl
    const poemUrl = `${bookUrl}/${poemCleanSlug}`; 
    
    const poemText = book.content[0][poem.number] || "<p>Full poem available in the book.</p>";

    return new Response(generatePoemPage(book, poem, poemText, bookUrl, poemUrl, collectionKey), {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────

function generateBookPage(book, canonical, collectionKey) {
  const samplePoems = book.poems.slice(0, 3).map(p => p.title).join(", ") + (book.poems.length > 3 ? "…" : "");

  // CORRECTED: Template literals
  const description = `${book.bookTitle} by Frith Hilton, featuring poems like ${samplePoems}, with dedication to ${book.dedicatee}.`;

  const coverUrl = book.image;

  // CORRECTED: Template literals inside hasPart JSON structure
  const hasPart = book.poems.map(poem => {
    const poemSlug = poem.title.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
    const poemUrl = `${canonical}/${poemSlug}`;
    const poemText = book.content[0][poem.number] || "";

    return {
      "@type": "Chapter",
      "position": poem.number,
      "name": poem.title,
      "url": poemUrl,
      "image": coverUrl.replace("/cover.jpg", `/${poem.number}.jpg`),
      "text": poemText.replace(/<[^>]*>/g, "").trim()
    };
  });

  // CORRECTED: Template literals
  const poemsHtml = book.poems.map(p => {
    const slug = p.title.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
    return `<li><a href="${canonical}/${slug}">${p.number}. ${p.title}</a></li>`;
  }).join("");

  // CORRECTED: Template literals throughout the HTML content
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="author" content="Frith Hilton"/>
  <meta name="description" content="${description}"/>
  <meta name="keywords" content="${book.bookTitle}, Howard Frith Hilton, Frith Hilton, Frith Nightswan Publishers, Forest Crib Books, Poetry dedicated to ${book.dedicatee}"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta property="og:url" content="${canonical}"/>
  <meta property="og:type" content="book"/>
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
    "author": {
      "@type": "Person",
      "name": "Howard Frith Hilton"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Forest Crib Books Imprint under Frith Nightswan Publishers"
    },
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

function generatePoemPage(book, poem, poemText, bookUrl, poemUrl, collectionKey) {
  const cleanText = poemText.replace(/<[^>]*>/g, "").trim();

  // CORRECTED: Template literals throughout
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

