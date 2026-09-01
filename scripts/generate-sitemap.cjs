/**
 * generate-sitemap.cjs - Genera sitemap.xml durante el build (CommonJS)
 * Ejecutar: node scripts/generate-sitemap.cjs
 */

const fs = require('fs');
const path = require('path');

function escapeXml(str) {
    return str.replace(/&/g, '&')
              .replace(/</g, '<')
              .replace(/>/g, '>')
              .replace(/"/g, '"')
              .replace(/'/g, '&apos;');
}

function generateSitemap() {
    const baseUrl = 'https://jeraldominici.github.io/informegaming/';
    const today = new Date().toISOString().split('T')[0];
    
    const pages = [
        { url: baseUrl, changefreq: 'daily', priority: 1.0 },
        { url: `${baseUrl}#noticias`, changefreq: 'daily', priority: 0.9 },
        { url: `${baseUrl}#gratis`, changefreq: 'daily', priority: 0.9 },
        { url: `${baseUrl}#historial`, changefreq: 'weekly', priority: 0.5 },
    ];
    
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url>
    <loc>${escapeXml(p.url)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq || 'weekly'}</changefreq>
    <priority>${p.priority || 0.5}</priority>
  </url>`).join('\n')}
</urlset>`;
    
    return xml;
}

function generateSitemapFile() {
    const sitemap = generateSitemap();
    
    const outputDir = path.resolve(__dirname, '..', 'dist');
    const outputPath = path.join(outputDir, 'sitemap.xml');
    
    // Asegurar que existe el directorio
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, sitemap, 'utf-8');
    console.log(`✅ sitemap.xml generado en ${outputPath}`);
}

generateSitemapFile();