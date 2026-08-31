// noticias.js - Consume noticias.json o fallback a WordPress RSS
import { CONFIG } from './config.js';
import { htmlATexto, truncarTexto, esUrlSegura, parsearFecha } from './utils.js';

let todasLasNoticias = [];
let filtroActual = 'all';

async function cargarNoticias() {
    const grid = document.getElementById('noticiasGrid');
    
    grid.innerHTML = '<p style="color: #8899b0; text-align: center; width: 100%;">Cargando noticias...</p>';
    
    try {
        // 1. Intentar import estático (build-time)
        let noticiasData = null;
        try {
            // @ts-ignore
            const modulo = await import('../../public/data/noticias.json');
            noticiasData = modulo.default || modulo;
        } catch {
            // 2. Fallback: fetch runtime /data/noticias.json
            try {
                const resp = await fetch('/data/noticias.json', { cache: 'no-store' });
                if (resp.ok) noticiasData = await resp.json();
            } catch {}
        }
        
        // 3. Fallback: WordPress JSON Feed (sin _embed para evitar challenge)
        if (!noticiasData) {
            try {
                // Probar endpoint simple sin _embed
                const resp = await fetch(`${CONFIG.apiBase}/posts?per_page=20`, { 
                    cache: 'no-store',
                    headers: { 'Accept': 'application/json' }
                });
                if (resp.ok) {
                    const wpPosts = await resp.json();
                    if (Array.isArray(wpPosts) && wpPosts.length > 0) {
                        noticiasData = { noticias: wpPosts };
                    }
                }
            } catch {}
        }
        
        // 4. Fallback: WordPress RSS/JSON Feed público
        if (!noticiasData) {
            try {
                const resp = await fetch('https://informegaming.gt.tc/feed/json', { 
                    cache: 'no-store',
                    headers: { 'Accept': 'application/json' }
                });
                if (resp.ok) {
                    const feed = await resp.json();
                    if (feed.items && Array.isArray(feed.items)) {
                        noticiasData = { noticias: feed.items.map((item) => ({
                            id: item.id,
                            title: { rendered: item.title },
                            excerpt: { rendered: item.content_html || item.summary || '' },
                            date: item.date_published,
                            _embedded: { 'wp:featuredmedia': item.image ? [{ source_url: item.image }] : [] },
                            link: item.url,
                        }))};
                    }
                }
            } catch {}
        }
        
        // 5. Fallback: localStorage cache
        if (!noticiasData) {
            const cached = localStorage.getItem('informegaming_noticias');
            const cacheTime = localStorage.getItem('informegaming_noticias_time');
            if (cached && cacheTime && (Date.now() - Number(cacheTime)) < 24 * 60 * 60 * 1000) {
                noticiasData = JSON.parse(cached);
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
    const fecha = parsearFecha(noticia.date || noticia.date_published);
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