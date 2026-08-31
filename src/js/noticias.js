// noticias.js - Consume noticias.json o fallback a Worker
import { CONFIG } from './config.js';
import { htmlATexto, truncarTexto, esUrlSegura, parsearFecha } from './utils.js';

let todasLasNoticias = [];
let filtroActual = 'all';

// Detectar base path automáticamente
function getBasePath() {
    const path = window.location.pathname;
    const match = path.match(/^(\/[^\/]+)/);
    return match ? match[1] : '';
}

const BASE_PATH = getBasePath();

async function cargarNoticias() {
    const grid = document.getElementById('noticiasGrid');
    
    grid.innerHTML = '<p style="color: #8899b0; text-align: center; width: 100%;">Cargando noticias...</p>';
    
    try {
        let noticiasData = null;
        
        // 1. Fetch desde repo (GitHub Pages)
        const dataUrl = `${BASE_PATH}/data/noticias.json`;
        try {
            const resp = await fetch(dataUrl, { cache: 'no-store' });
            if (resp.ok) {
                noticiasData = await resp.json();
                console.log('[noticias] Cargado desde:', dataUrl);
            }
        } catch (fetchError) {
            console.warn('Fetch repo falló:', fetchError);
        }
        
        // 2. Fallback: WordPress JSON Feed (con proxy CORS si es necesario)
        if (!noticiasData) {
            try {
                // Usar textise dot iitty como proxy CORS gratuito
                const feedUrl = 'https://rss2json.com/api.json?rss_url=https://informegaming.gt.tc/feed/';
                const resp = await fetch(feedUrl, { cache: 'no-store' });
                if (resp.ok) {
                    const feed = await resp.json();
                    if (feed.items && Array.isArray(feed.items)) {
                        noticiasData = { 
                            noticias: feed.items.map(item => ({
                                id: item.guid || item.link,
                                title: { rendered: item.title },
                                excerpt: { rendered: item.content || item.description || '' },
                                date: item.pubDate,
                                _embedded: { 'wp:featuredmedia': item.thumbnail ? [{ source_url: item.thumbnail }] : [] },
                                link: item.link,
                            }))
                        };
                        console.log('[noticias] Cargado desde RSS2JSON proxy');
                    }
                }
            } catch (rssError) {
                console.warn('RSS proxy falló:', rssError);
            }
        }
        
        // 3. Fallback: localStorage cache
        if (!noticiasData) {
            const cached = localStorage.getItem('informegaming_noticias');
            const cacheTime = localStorage.getItem('informegaming_noticias_time');
            if (cached && cacheTime && (Date.now() - Number(cacheTime)) < 24 * 60 * 60 * 1000) {
                noticiasData = JSON.parse(cached);
                console.log('[noticias] Usando caché localStorage');
            }
        }
        
        if (!noticiasData || !noticiasData.noticias || !Array.isArray(noticiasData.noticias)) {
            throw new Error('No se pudieron cargar noticias de ninguna fuente');
        }
        
        // Guardar caché
        localStorage.setItem('informegaming_noticias', JSON.stringify(noticiasData));
        localStorage.setItem('informegaming_noticias_time', String(Date.now()));
        
        todasLasNoticias = noticiasData.noticias;
        mostrarNoticias(filtroActual);
        
    } catch (error) {
        console.error('Error cargando noticias:', error);
        grid.innerHTML = 
            '<p style="color: #ff6b6b;">No se pudieron cargar las noticias. ' +
            'Inténtalo más tarde.</p>';
    }
}

function filtrarNoticias(filtro) {
    if (filtro === 'all') return todasLasNoticias;
    const termino = filtro.toLowerCase();
    return todasLasNoticias.filter(noticia => {
        const texto = (
            htmlATexto(noticia.title?.rendered || noticia.title) + ' ' +
            htmlATexto(noticia.excerpt?.rendered || noticia.excerpt || noticia.summary || '')
        ).toLowerCase();
        return texto.includes(termino);
    });
}

function crearImagenNoticia(noticia) {
    const div = document.createElement('div');
    div.className = 'card-img';
    
    let imgUrl = null;
    const media = noticia._embedded && noticia._embedded['wp:featuredmedia'];
    if (Array.isArray(media) && media[0] && media[0].source_url) {
        imgUrl = media[0].source_url;
    } else if (noticia.image) {
        imgUrl = noticia.image;
    } else if (noticia.thumbnail) {
        imgUrl = noticia.thumbnail;
    }
    
    if (imgUrl && esUrlSegura(imgUrl)) {
        div.style.backgroundImage = `url("${imgUrl}")`;
        div.style.backgroundSize = 'cover';
        div.style.backgroundPosition = 'center';
        div.setAttribute('role', 'img');
        div.setAttribute('aria-label', htmlATexto(noticia.title?.rendered || noticia.title) || 'Imagen de la noticia');
    } else {
        div.setAttribute('aria-hidden', 'true');
        div.textContent = '🎮';
    }
    return div;
}

function crearCardNoticia(noticia, index) {
    const card = document.createElement('div');
    card.className = 'card fade-in';
    card.style.animationDelay = (index * 0.05) + 's';
    
    card.appendChild(crearImagenNoticia(noticia));
    
    const body = document.createElement('div');
    body.className = 'card-body';
    
    const h3 = document.createElement('h3');
    h3.textContent = htmlATexto(noticia.title?.rendered || noticia.title);
    body.appendChild(h3);
    
    const p = document.createElement('p');
    p.textContent = truncarTexto(htmlATexto(noticia.excerpt?.rendered || noticia.excerpt || noticia.summary || ''), 140);
    body.appendChild(p);
    
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    
    const spanFecha = document.createElement('span');
    const fecha = parsearFecha(noticia.date || noticia.date_published || noticia.pubDate);
    spanFecha.textContent = '📅 ' + (fecha ? fecha.toLocaleDateString('es-ES') : 'Sin fecha');
    meta.appendChild(spanFecha);
    
    body.appendChild(meta);
    card.appendChild(body);
    return card;
}

function mostrarNoticias(filtro) {
    const grid = document.getElementById('noticiasGrid');
    grid.innerHTML = '';
    
    const noticiasFiltradas = filtrarNoticias(filtro);
    
    if (noticiasFiltradas.length === 0) {
        grid.innerHTML = '<p style="color: #8899b0; text-align: center; width: 100%;">No hay noticias para este filtro.</p>';
        return;
    }
    
    const fragmento = document.createDocumentFragment();
    noticiasFiltradas.forEach((noticia, index) => {
        fragmento.appendChild(crearCardNoticia(noticia, index));
    });
    grid.appendChild(fragmento);
}

// Configurar filtros
function setupFiltrosNoticias() {
    const container = document.getElementById('noticiasFiltros');
    const btns = container.querySelectorAll('.filter-btn');
    
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtroActual = btn.dataset.filter;
            mostrarNoticias(filtroActual);
        });
    });
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    setupFiltrosNoticias();
    cargarNoticias();
});