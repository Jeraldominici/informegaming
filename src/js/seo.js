// seo.js - SEO dinámico, JSON-LD, sitemap helpers
import { CONFIG } from './config.js';

/**
 * Actualiza meta tags dinámicamente según la sección activa
 */
export function updateMetaTags(section, data = {}) {
    const baseUrl = 'https://jeral.github.io/informegaming/';
    const siteName = 'informegaming';
    
    const defaults = {
        title: 'informegaming - Noticias y juegos gratis',
        description: 'Tu dosis diaria de gaming: noticias, lanzamientos y los mejores juegos gratis de la semana en Epic, Steam, Xbox, PlayStation y Nintendo.',
        image: `${baseUrl}og-image.png`,
        url: baseUrl,
        type: 'website',
    };
    
    let meta = { ...defaults };
    
    switch (section) {
        case 'noticias':
            meta.title = 'Últimas Noticias Gaming | informegaming';
            meta.description = 'Las últimas noticias del mundo gaming: lanzamientos, actualizaciones, eventos y novedades de Epic, Steam, Xbox, PlayStation y Nintendo.';
            break;
        case 'gratis':
            meta.title = 'Juegos Gratis Esta Semana | informegaming';
            meta.description = 'Descubre los juegos gratis de la semana en Epic Games, Steam, Xbox, PlayStation y Nintendo. Con fechas, enlaces directos y countdown.';
            if (data.game) {
                meta.title = `${data.game.title} Gratis | informegaming`;
                meta.description = data.game.description || `Consigue ${data.game.title} gratis en ${data.game.platform}. Disponible hasta ${data.game.endsAt ? new Date(data.game.endsAt).toLocaleDateString('es-ES') : 'fecha desconocida'}.`;
                meta.image = data.game.imageUrl || defaults.image;
                meta.url = `${baseUrl}#gratis`;
                meta.type = 'article';
            }
            break;
        case 'juego':
            meta.title = `${data.title} | informegaming`;
            meta.description = data.description || defaults.description;
            meta.image = data.image || defaults.image;
            meta.url = data.url || defaults.url;
            meta.type = 'article';
            break;
    }
    
    // Actualizar meta tags básicos
    updateTag('title', meta.title);
    updateTag('meta[name="description"]', meta.description, 'content');
    updateTag('meta[property="og:title"]', meta.title, 'content');
    updateTag('meta[property="og:description"]', meta.description, 'content');
    updateTag('meta[property="og:image"]', meta.image, 'content');
    updateTag('meta[property="og:url"]', meta.url, 'content');
    updateTag('meta[property="og:type"]', meta.type, 'content');
    updateTag('meta[name="twitter:title"]', meta.title, 'content');
    updateTag('meta[name="twitter:description"]', meta.description, 'content');
    updateTag('meta[name="twitter:image"]', meta.image, 'content');
    updateTag('link[rel="canonical"]', meta.url, 'href');
}

/**
 * Helper para actualizar/crear meta tags
 */
function updateTag(selector, value, attribute = 'content') {
    if (!value) return;
    let el = document.querySelector(selector);
    if (!el) {
        if (selector.startsWith('meta')) {
            el = document.createElement('meta');
            const [, attr] = selector.match(/\[([^\]]+)\]/) || [];
            if (attr) {
                const [name, value] = attr.split('=');
                el.setAttribute(name.replace(/['"]/g, ''), value.replace(/['"]/g, ''));
            }
        } else if (selector.startsWith('link')) {
            el = document.createElement('link');
            el.setAttribute('rel', 'canonical');
        }
        document.head.appendChild(el);
    }
    if (el) el.setAttribute(attribute, value);
}

/**
 * Genera y inyecta JSON-LD structured data
 */
export function injectJsonLd(data) {
    const script = document.getElementById('json-ld');
    if (!script) return;
    
    let jsonLd = null;
    
    if (data.type === 'Game') {
        jsonLd = {
            '@context': 'https://schema.org',
            '@type': 'VideoGame',
            name: data.name,
            description: data.description,
            image: data.image,
            url: data.url,
            genre: data.genre,
            gamePlatform: data.platform,
            offers: data.offers ? {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'EUR',
                availability: 'https://schema.org/InStock',
                url: data.url,
            } : undefined,
            datePublished: data.releaseDate,
            publisher: {
                '@type': 'Organization',
                name: data.publisher,
            },
        };
    } else if (data.type === 'Article') {
        jsonLd = {
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            headline: data.headline,
            description: data.description,
            image: data.image,
            url: data.url,
            datePublished: data.datePublished,
            dateModified: data.dateModified,
            author: {
                '@type': 'Organization',
                name: 'informegaming',
            },
            publisher: {
                '@type': 'Organization',
                name: 'informegaming',
                logo: {
                    '@type': 'ImageObject',
                    url: 'https://jeral.github.io/informegaming/icon-192.png',
                },
            },
        };
    } else if (data.type === 'ItemList') {
        jsonLd = {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            itemListElement: data.items.map((item, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                item: {
                    '@type': 'VideoGame',
                    name: item.name,
                    url: item.url,
                    image: item.image,
                    description: item.description,
                    gamePlatform: item.platform,
                },
            })),
        };
    } else {
        // WebSite schema (default)
        jsonLd = {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'informegaming',
            url: 'https://jeral.github.io/informegaming/',
            potentialAction: {
                '@type': 'SearchAction',
                target: {
                    '@type': 'EntryPoint',
                    urlTemplate: 'https://jeral.github.io/informegaming/#gratis?search={search_term_string}',
                },
                'query-input': 'required name=search_term_string',
            },
        };
    }
    
    script.textContent = JSON.stringify(jsonLd, null, 2);
}

/**
 * Genera sitemap.xml (para usar en build script)
 */
export function generateSitemap(pages = []) {
    const baseUrl = 'https://jeral.github.io/informegaming/';
    const today = new Date().toISOString().split('T')[0];
    
    const defaultPages = [
        { url: baseUrl, changefreq: 'daily', priority: 1.0 },
        { url: `${baseUrl}#noticias`, changefreq: 'daily', priority: 0.9 },
        { url: `${baseUrl}#gratis`, changefreq: 'daily', priority: 0.9 },
        { url: `${baseUrl}#historial`, changefreq: 'weekly', priority: 0.5 },
    ];
    
    const allPages = [...defaultPages, ...pages];
    
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(p => `  <url>
    <loc>${escapeXml(p.url)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq || 'weekly'}</changefreq>
    <priority>${p.priority || 0.5}</priority>
  </url>`).join('\n')}
</urlset>`;
    
    return xml;
}

function escapeXml(str) {
    return str.replace(/&/g, '&')
              .replace(/</g, '<')
              .replace(/>/g, '>')
              .replace(/"/g, '"')
              .replace(/'/g, '&apos;');
}

/**
 * Inyecta meta tags de sección activa basado en hash URL
 */
export function setupSectionMeta() {
    const updateFromHash = () => {
        const hash = window.location.hash.slice(1);
        if (hash === 'noticias') updateMetaTags('noticias');
        else if (hash === 'gratis') updateMetaTags('gratis');
        else if (hash === 'historial') updateMetaTags('historial');
        else updateMetaTags('home');
    };
    
    window.addEventListener('hashchange', updateFromHash);
    updateFromHash();
}

/**
 * Genera datos JSON-LD para lista de juegos (ItemList)
 */
export function generateGamesJsonLd(games) {
    return {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: games.map((game, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            item: {
                '@type': 'VideoGame',
                name: game.title,
                description: game.description,
                image: game.imageUrl,
                url: game.storeUrl,
                gamePlatform: game.platform,
                offers: {
                    '@type': 'Offer',
                    price: '0',
                    priceCurrency: 'EUR',
                    availability: 'https://schema.org/InStock',
                    url: game.storeUrl,
                },
}
        })
    )
    };
}
/**
 * Genera JSON-LD para noticias
 */
export function generateNoticiasJsonLd(noticias) {
    return noticias.map(n => ({
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: n.title,
        description: n.excerpt,
        image: n.image,
        url: n.url || `https://jeral.github.io/informegaming/#noticias`,
        datePublished: n.date,
        dateModified: n.date,
        author: {
            '@type': 'Organization',
            name: 'informegaming',
        },
        publisher: {
            '@type': 'Organization',
            name: 'informegaming',
            logo: {
                '@type': 'ImageObject',
                url: 'https://jeral.github.io/informegaming/icon-192.png',
            },
        },
    }));
}

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', () => {
    setupSectionMeta();
    injectJsonLd({ type: 'WebSite' }); // Default WebSite schema
});

export default {
    updateMetaTags,
    injectJsonLd,
    generateSitemap,
    setupSectionMeta,
    generateGamesJsonLd,
    generateNoticiasJsonLd,
};