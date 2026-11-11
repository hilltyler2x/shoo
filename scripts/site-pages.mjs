// Builds the parts of the website that search engines and AI assistants read:
// an answer page per question (scripts/site/answers.mjs), a readable home
// page underneath the app, sitemap.xml, robots.txt and llms.txt.
//
// Runs after `vite build` and writes into dist/. Pass `--out <dir>` to write
// somewhere else (handy for previewing).
//
// SITE_URL is the public address with a trailing slash. Change it here (or set
// the SITE_URL env var) if Shoo moves to its own domain.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ANSWERS, UPDATED, UPDATED_LABEL } from './site/answers.mjs';

const SITE_URL = process.env.SITE_URL ?? 'https://hilltyler2x.github.io/shoo/';
const base = new URL(SITE_URL).pathname; // e.g. /shoo/
const outIdx = process.argv.indexOf('--out');
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : 'dist';

const TAGLINE = 'Shoo works out exactly when you need to leave for work, class or any plan, using live traffic, and nags you, funnier and louder, until you walk out the door.';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const fill = (html) => html.replaceAll('{base}', base);
const pageUrl = (slug) => `${SITE_URL}answers/${slug}/`;
const bySlug = Object.fromEntries(ANSWERS.map((a) => [a.slug, a]));
if (Object.keys(bySlug).length !== ANSWERS.length) throw new Error('Two answers share a slug');
for (const a of ANSWERS) {
  for (const r of a.related) if (!bySlug[r]) throw new Error(`${a.slug}: related page "${r}" doesn't exist`);
  for (const m of a.answer.concat(a.body).matchAll(/\{base\}answers\/([^/"]+)\//g)) {
    if (!bySlug[m[1]]) throw new Error(`${a.slug}: links to missing page "${m[1]}"`);
  }
}

function write(rel, content) {
  const file = join(OUT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const APP = {
  '@type': 'SoftwareApplication',
  name: 'Shoo: Never Be Late.',
  alternateName: 'Shoo',
  applicationCategory: 'ProductivityApplication',
  operatingSystem: 'iOS, Android, Web',
  url: SITE_URL,
  description: TAGLINE,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  image: `${SITE_URL}icons/icon-512.png`,
};

const STYLE = `:root{--ink:#1e1b2e;--muted:#5d5870;--accent:#ff5a32;--bg:#fff8f0;--card:#ffffff;--line:#eadfd3}
@media (prefers-color-scheme:dark){:root{--ink:#f4efe9;--muted:#b8b0c4;--bg:#1a1724;--card:#25212f;--line:#3a3446}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main,header,footer{max-width:720px;margin:0 auto;padding:0 16px}
header{display:flex;align-items:center;gap:10px;padding-top:20px}
header a{color:var(--ink);text-decoration:none;font-weight:700}
header img{width:36px;height:36px;border-radius:9px}
h1{font-size:1.8em;line-height:1.2;margin:24px 0 8px}
h2{font-size:1.15em;margin-top:32px}
a{color:var(--accent)}
.muted,.updated{color:var(--muted);font-size:.9em}
.answer{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px 18px;margin:16px 0}
.cta{display:inline-block;background:var(--accent);color:#fff;font-weight:700;padding:12px 20px;border-radius:999px;text-decoration:none;margin:8px 0}
table{border-collapse:collapse;width:100%;font-size:.92em;display:block;overflow-x:auto}
th,td{border:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}
blockquote{margin:0;padding:12px 16px;border-left:4px solid var(--accent);background:var(--card);border-radius:8px}
dt{font-weight:700;margin-top:14px}dd{margin:4px 0 0}
footer{padding-top:32px;padding-bottom:48px;color:var(--muted);font-size:.9em}
ul.links{padding-left:20px}`;

const CTA = `<p><a class="cta" href="${base}">Open Shoo free</a><br><span class="muted">Works in your browser today. iPhone and Android apps are on the way. No account, no ads.</span></p>`;

function layout({ title, description, canonical, jsonld, content }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE_URL}icons/icon-512.png">
<meta name="twitter:card" content="summary">
<link rel="icon" href="${base}icons/favicon.svg" type="image/svg+xml">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': jsonld })}</script>
<style>${STYLE}</style>
</head>
<body>
<header><a href="${base}"><img src="${base}icons/icon-192.png" alt="" width="36" height="36"></a><a href="${base}">Shoo</a></header>
<main>
${content}
</main>
<footer>
<p>Shoo: Never Be Late. · <a href="${base}answers/">All questions</a> · <a href="${base}support.html">Support</a> · <a href="${base}privacy.html">Privacy</a></p>
</footer>
</body>
</html>
`;
}

function answerPage(a) {
  const url = pageUrl(a.slug);
  const faqHtml = a.faq.length
    ? `<h2>Quick answers</h2><dl>${a.faq.map(([q, ans]) => `<dt>${esc(q)}</dt><dd>${esc(ans)}</dd>`).join('')}</dl>`
    : '';
  const related = a.related
    .map((s) => bySlug[s])
    .filter(Boolean)
    .map((r) => `<li><a href="${base}answers/${r.slug}/">${esc(r.question)}</a></li>`)
    .join('');
  const jsonld = [
    {
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      url,
      dateModified: UPDATED,
      mainEntity: [
        { '@type': 'Question', name: a.question, acceptedAnswer: { '@type': 'Answer', text: strip(fill(a.answer)) } },
        ...a.faq.map(([q, ans]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: ans } })),
      ],
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Shoo', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Questions', item: `${SITE_URL}answers/` },
        { '@type': 'ListItem', position: 3, name: a.title, item: url },
      ],
    },
    APP,
  ];
  const content = `<h1>${esc(a.title)}</h1>
<p class="updated">Updated ${UPDATED_LABEL}</p>
<div class="answer"><p class="muted"><strong>Question:</strong> ${esc(a.question)}</p>${fill(a.answer)}</div>
${CTA}
${fill(a.body)}
${faqHtml}
<h2>Related questions</h2><ul class="links">${related}</ul>`;
  return layout({ title: `${a.title} | Shoo`, description: a.description, canonical: url, jsonld, content });
}

function indexPage() {
  const url = `${SITE_URL}answers/`;
  const items = ANSWERS.map((a) => `<li><a href="${base}answers/${a.slug}/">${esc(a.question)}</a><br><span class="muted">${esc(a.description)}</span></li>`).join('\n');
  const content = `<h1>Questions about never being late</h1>
<p>Straight answers about leaving on time, leave-time reminders, and how Shoo works.</p>
${CTA}
<ul class="links">${items}</ul>`;
  const jsonld = [
    { '@type': 'CollectionPage', '@id': url, url, name: 'Questions about never being late', dateModified: UPDATED },
    APP,
  ];
  return layout({ title: 'Questions about never being late | Shoo', description: 'Answers about leaving on time, leave reminders with traffic, ADHD time blindness and shift work, from the makers of Shoo.', canonical: url, jsonld, content });
}

/**
 * The app's index.html is an empty <div id="root"> until JavaScript runs, so
 * crawlers see nothing. Put readable text inside it; React replaces it the
 * moment the app starts, so people never see it.
 */
function homeContent() {
  const top = ['app-that-tells-you-when-to-leave-for-work', 'best-apps-to-stop-being-late', 'adhd-time-blindness-app-for-being-late', 'app-for-shift-workers-to-get-to-work-on-time', 'leave-reminder-with-traffic', 'reminder-that-keeps-going-until-you-leave'];
  return `<div style="max-width:720px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<h1>Shoo: Never Be Late.</h1>
<p>${esc(TAGLINE)}</p>
<ul>
<li>Works back from your start time: arrive-early buffer, travel time with live traffic, and the minutes you need to get out the door.</li>
<li>Reminders escalate: Gentle, Getting serious, then Panic mode, with jokes for work, school, the gym, the doctor, flights, dates and more.</li>
<li>Notices when you leave and goes quiet. Celebrates when you make it on time.</li>
<li>Reads your phone calendar, iPhone Reminders, Google/Outlook/iCloud calendar links, and shift apps like Homebase, When I Work, 7shifts and Deputy. Paste a schedule or pick a screenshot.</li>
<li>Free for getting to one place, like your job. No account, no ads, no tracking.</li>
</ul>
<h2>Common questions</h2>
<ul>${top.map((s) => `<li><a href="${base}answers/${s}/">${esc(bySlug[s].question)}</a></li>`).join('')}</ul>
<p><a href="${base}answers/">All questions</a> · <a href="${base}support.html">Support</a> · <a href="${base}privacy.html">Privacy</a></p>
</div>`;
}

function patchHome() {
  const file = join(OUT, 'index.html');
  if (!existsSync(file)) return false;
  let html = readFileSync(file, 'utf8');
  const ld = `<link rel="canonical" href="${SITE_URL}">\n<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...APP })}</script>`;
  if (!html.includes('application/ld+json')) html = html.replace('</head>', `${ld}\n</head>`);
  html = html.replace('<div id="root"></div>', `<div id="root">${homeContent()}</div>`);
  writeFileSync(file, html);
  return true;
}

function sitemap() {
  const urls = [
    [SITE_URL, '1.0'],
    [`${SITE_URL}answers/`, '0.8'],
    ...ANSWERS.map((a) => [pageUrl(a.slug), '0.7']),
    [`${SITE_URL}support.html`, '0.3'],
    [`${SITE_URL}privacy.html`, '0.2'],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, p]) => `  <url><loc>${u}</loc><lastmod>${UPDATED}</lastmod><priority>${p}</priority></url>`).join('\n')}
</urlset>
`;
}

// Only consulted by crawlers when it sits at the root of a domain. On
// github.io/shoo/ it does nothing (and the github.io root allows everything),
// but it's ready for when Shoo gets its own domain.
const ROBOTS = `# Everyone is welcome, AI assistants included.
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

Sitemap: ${SITE_URL}sitemap.xml
`;

function llms() {
  return `# Shoo: Never Be Late.

> ${TAGLINE}

Shoo is a leave-on-time app for iPhone, Android and the web. Free for getting to one place (like your job) with live traffic; optional Shoo Pro adds more places, calendar and shift-app imports, Panic mode and every joke pack. No account, no ads, no tracking.

Key facts:
- Leave time = start time − arrive-early buffer − travel time with live traffic − time to get out the door.
- Escalating, funny reminders (Gentle, Getting serious, Panic mode) with lines for 13 kinds of plans: work, school, gym, doctor, dentist, flight, date, dinner, party, interview, church, kid pickup and anything else.
- Notices when you leave (location "Always") and stops nagging; or tap "I've left".
- Reads plans from the phone calendar, iPhone Reminders, Google/Outlook/iCloud iCal links, Homebase, When I Work, 7shifts and Deputy feeds, pasted schedules or emails, and schedule screenshots (read on the phone).
- Best for: hourly and shift workers, people with ADHD or time blindness, students, anyone who is often late.

## Answers
${ANSWERS.map((a) => `- [${a.question}](${pageUrl(a.slug)}): ${a.description}`).join('\n')}

## More
- [Open Shoo](${SITE_URL})
- [Support](${SITE_URL}support.html)
- [Privacy policy](${SITE_URL}privacy.html)
`;
}

for (const a of ANSWERS) write(`answers/${a.slug}/index.html`, answerPage(a));
write('answers/index.html', indexPage());
write('sitemap.xml', sitemap());
write('robots.txt', ROBOTS);
write('llms.txt', llms());
const home = patchHome();
console.log(`Site pages: ${ANSWERS.length} answers, sitemap, robots.txt, llms.txt${home ? ', readable home page' : ''} → ${OUT}/`);
