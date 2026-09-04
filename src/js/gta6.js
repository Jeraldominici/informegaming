// gta6.js - Sección GTA 6: noticias, videos, timeline, spoilers
import { CONFIG } from './config.js';
import { htmlATexto, parsearFecha, esUrlSegura, truncarTexto } from './utils.js';

let todasLasNoticiasGTA6 = [];
let todosLosVideosGTA6 = [];
let timelineGTA6 = [];
let spoilersActivados = false;

// Detectar base path automáticamente
function getBasePath() {
    const path = window.location.pathname;
    const match = path.match(/^(\/[^\/]+)/);
    return match ? match[1] : '';
}

const BASE_PATH = getBasePath();

async function cargarGTA6() {
    try {
        // Cargar noticias, videos y timeline en paralelo
        const [noticias, videos, timeline] = await Promise.all([
            fetchGTA6Noticias(),
            fetchGTA6Videos(),
            fetchGTA6Timeline()
        ]);
        
        todasLasNoticiasGTA6 = noticias;
        todosLosVideosGTA6 = videos;
        timelineGTA6 = timeline;
        
        // Renderizar
        renderNoticiasGTA6('all');
        renderVideosGTA6('all');
        renderTimelineGTA6();
        
        // Configurar filtros
        setupFiltrosGTA6();
        
        // Configurar spoiler toggle
        setupSpoilerToggle();
        
        // Iniciar countdown si hay fecha de lanzamiento
        iniciarCountdown();
        
    } catch (error) {
        console.error('Error cargando GTA 6:', error);
        document.getElementById('gta6NoticiasGrid').innerHTML = 
            '<p style="color: #ff6b6b;">Error al cargar GTA 6.</p>';
        document.getElementById('gta6VideosGrid').innerHTML = 
            '<p style="color: #8899b0; text-align: center; width: 100%;">No hay videos disponibles.</p>';
        document.getElementById('gta6Timeline').innerHTML = 
            '<p style="color: #8899b0; text-align: center; width: 100%;">No hay timeline disponible.</p>';
    }
}

// Fetch noticias GTA 6
async function fetchGTA6Noticias() {
    try {
        const resp = await fetch(`${BASE_PATH}/data/gta6-noticias.json`, { cache: 'no-store' });
        if (resp.ok) {
            const data = await resp.json();
            return data.noticias || [];
        }
    } catch (e) {
        console.warn('[GTA6] Error cargando noticias:', e);
    }
    return [];
}

// Fetch videos GTA 6 desde Worker
async function fetchGTA6Videos() {
    try {
        const resp = await fetch('https://informegaming-ingest.informegaming-ingest.workers.dev/gta6/videos', { 
            method: 'POST',
            cache: 'no-store',
            headers: { 'Accept': 'application/json' }
        });
        if (resp.ok) {
            const data = await resp.json();
            return data.videos || [];
        }
    } catch (e) {
        console.warn('[GTA6] Error cargando videos:', e);
    }
    return [];
}

// Fetch timeline desde Markdown local
async function fetchGTA6Timeline() {
    try {
        if (!BASE_PATH) return [];
        const resp = await fetch(`${BASE_PATH}/content/gta6/timeline.json`, { cache: 'no-store' });
        if (resp.ok) {
            const data = await resp.json();
            return data.timeline || [];
        }
    } catch (e) {
        console.warn('[GTA6] Error cargando timeline:', e);
    }
    return [];
}

// Render noticias GTA 6
function renderNoticiasGTA6(filtro) {
    const grid = document.getElementById('gta6NoticiasGrid');
    if (!grid) return;
    
    let noticias = todasLasNoticiasGTA6;
    if (filtro !== 'all') {
        noticias = todasLasNoticiasGTA6.filter(n => {
            const tags = n.tags || [];
            return tags.some(t => t.toLowerCase().includes(filtro.toLowerCase()));
        });
    }
    
    if (noticias.length === 0) {
        grid.innerHTML = '<p style="color: #8899b0; text-align: center; width: 100%;">No hay noticias para este filtro.</p>';
        return;
    }
    
    grid.innerHTML = '';
    const fragmento = document.createDocumentFragment();
    noticias.forEach((noticia, index) => {
        fragmento.appendChild(crearCardNoticiaGTA6(noticia, index));
    });
    document.getElementById('gta6NoticiasGrid').appendChild(fragmento);
}

// Render videos GTA 6
function renderVideosGTA6(filtro) {
    const grid = document.getElementById('gta6VideosGrid');
    if (!grid) return;
    
    let videos = todosLosVideosGTA6;
    if (filtro !== 'all') {
        videos = todosLosVideosGTA6.filter(v => v.type === filtro);
    }
    
    if (videos.length === 0) {
        grid.innerHTML = '<p style="color: #8899b0; text-align: center; width: 100%;">No hay videos para este filtro.</p>';
        return;
    }
    
    grid.innerHTML = '';
    const fragmento = document.createDocumentFragment();
    videos.forEach((video, index) => {
        fragmento.appendChild(crearCardVideoGTA6(video, index));
    });
    document.getElementById('gta6VideosGrid').appendChild(fragmento);
}

// Render timeline
function renderTimelineGTA6() {
    const container = document.getElementById('gta6Timeline');
    if (!container) return;
    
    if (!timelineGTA6 || timelineGTA6.length === 0) {
        container.innerHTML = '<p style="color: #8899b0; text-align: center; width: 100%;">No hay timeline disponible.</p>';
        return;
    }
    
    container.innerHTML = '';
    const fragmento = document.createDocumentFragment();
    
    timelineGTA6.forEach((evento, index) => {
        fragmento.appendChild(crearTimelineEvento(evento, index));
    });
    container.appendChild(fragmento);
}

// Crear card de noticia GTA 6
function crearCardNoticiaGTA6(noticia, index) {
    const card = document.createElement('div');
    card.className = 'card fade-in';
    card.style.animationDelay = (index * 0.05) + 's';
    
    // Imagen
    const divImg = document.createElement('div');
    divImg.className = 'card-img';
    if (noticia.image && esUrlSegura(noticia.image)) {
        divImg.style.backgroundImage = `url("${noticia.image}")`;
        divImg.style.backgroundSize = 'cover';
        divImg.style.backgroundPosition = 'center';
        divImg.setAttribute('role', 'img');
        divImg.setAttribute('aria-label', htmlATexto(noticia.title));
    } else {
        divImg.setAttribute('aria-hidden', 'true');
        divImg.textContent = '📰';
    }
    card.appendChild(divImg);
    
    const body = document.createElement('div');
    body.className = 'card-body';
    
    const h3 = document.createElement('h3');
    h3.textContent = htmlATexto(noticia.title);
    body.appendChild(h3);
    
    const p = document.createElement('p');
    p.textContent = truncarTexto(htmlATexto(noticia.excerpt), 140);
    body.appendChild(p);
    
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    
    const spanFecha = document.createElement('span');
    const fecha = parsearFecha(noticia.date);
    spanFecha.textContent = '📅 ' + (fecha ? fecha.toLocaleDateString('es-ES') : 'Sin fecha');
    meta.appendChild(spanFecha);
    
    if (noticia.categories && noticia.categories.length) {
        const spanCat = document.createElement('span');
        spanCat.className = 'badge';
        spanCat.textContent = noticia.categories[0];
        meta.appendChild(spanCat);
    }
    
    body.appendChild(meta);
    
    // Botón leer más
    if (noticia.url && esUrlSegura(noticia.url)) {
        const btn = document.createElement('a');
        btn.className = 'btn-small';
        btn.href = noticia.url;
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.textContent = 'Leer más';
        body.appendChild(btn);
    }
    
    const cardInner = document.createElement('div');
    cardInner.appendChild(divImg);
    cardInner.appendChild(body);
    
    const cardWrapper = document.createElement('div');
    cardWrapper.className = 'card fade-in';
    cardWrapper.style.animationDelay = (index * 0.05) + 's';
    cardWrapper.appendChild(cardInner);
    
    return cardWrapper;
}

// Crear card de video GTA 6
function crearCardVideoGTA6(video, index) {
    const card = document.createElement('div');
    card.className = 'card fade-in';
    card.style.animationDelay = (index * 0.05) + 's';
    
    // Badge de spoiler
    if (video.isSpoiler) {
        const badge = document.createElement('span');
        badge.className = 'badge spoiler-badge';
        badge.textContent = '⚠️ SPOILER';
        badge.style.background = '#ff444433';
        badge.style.color = '#ff6b6b';
        badge.style.marginBottom = '8px';
        badge.style.display = 'inline-block';
        card.appendChild(badge);
    }
    
    // Thumbnail con link al video
    const divImg = document.createElement('div');
    divImg.className = 'card-img';
    if (video.thumbnail && esUrlSegura(video.thumbnail)) {
        divImg.style.backgroundImage = `url("${video.thumbnail}")`;
        divImg.style.backgroundSize = 'cover';
        divImg.style.backgroundPosition = 'center';
    } else {
        divImg.textContent = '🎬';
    }
    
    // Link al video
    if (video.url && esUrlSegura(video.url)) {
        const link = document.createElement('a');
        link.href = video.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.appendChild(divImg);
        card.appendChild(link);
    } else {
        card.appendChild(divImg);
    }
    
    const body = document.createElement('div');
    body.className = 'card-body';
    
    const h3 = document.createElement('h3');
    h3.textContent = htmlATexto(video.title);
    body.appendChild(h3);
    
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    
    const spanFecha = document.createElement('span');
    const fecha = parsearFecha(video.publishedAt);
    spanFecha.textContent = '📅 ' + (fecha ? fecha.toLocaleDateString('es-ES') : 'Sin fecha');
    meta.appendChild(spanFecha);
    
    const spanCanal = document.createElement('span');
    spanCanal.className = 'badge';
    spanCanal.textContent = video.channelTitle || 'Canal desconocido';
    meta.appendChild(spanCanal);
    
    const spanTipo = document.createElement('span');
    spanTipo.className = 'badge';
    const tipoLabels = {
        'trailer': '🎬 Trailer',
        'gameplay': '🎮 Gameplay',
        'analysis': '📊 Análisis',
        'leak': '⚠️ Filtración',
        'news': '📰 Noticia'
    };
    spanTipo.textContent = tipoLabels[video.type] || video.type;
    meta.appendChild(spanTipo);
    
    body.appendChild(meta);
    
    const cardWrapper = document.createElement('div');
    cardWrapper.className = 'card fade-in';
    cardWrapper.style.animationDelay = (index * 0.05) + 's';
    cardWrapper.appendChild(divImg);
    cardWrapper.appendChild(body);
    
    return cardWrapper;
}

// Crear evento de timeline
function crearTimelineEvento(evento, index) {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.style.animationDelay = (index * 0.1) + 's';
    
    const badge = document.createElement('span');
    badge.className = 'timeline-badge';
    const tipoIconos = {
        'announcement': '📢',
        'trailer': '🎬',
        'leak': '⚠️',
        'rumor': '🤫',
        'release': '🚀'
    };
    badge.textContent = tipoIconos[evento.type] || '📌';
    
    const content = document.createElement('div');
    content.className = 'timeline-content';
    
    const fecha = parsearFecha(evento.date);
    const fechaStr = fecha ? fecha.toLocaleDateString('es-ES', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    }) : 'Fecha desconocida';
    
    content.innerHTML = `
        <time class="timeline-date">${fechaStr}</time>
        <h4>${htmlATexto(evento.title)}</h4>
        <p>${htmlATexto(evento.description)}</p>
        <div class="timeline-meta">
            <span class="badge" style="background: ${evento.isConfirmed ? '#22c55e33' : '#f59e0b33'}; color: ${evento.isConfirmed ? '#22c55e' : '#f59e0b'};">
                ${evento.isConfirmed ? '✅ Confirmado' : '⚠️ Rumor'}
            </span>
            ${evento.source ? `<span class="source">Fuente: ${htmlATexto(evento.source)}</span>` : ''}
        </div>
    `;
    
    if (evento.sourceUrl && esUrlSegura(evento.sourceUrl)) {
        const link = document.createElement('a');
        link.href = evento.sourceUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'btn-small timeline-source';
        link.textContent = 'Ver fuente';
        content.appendChild(link);
    }
    
    const wrapper = document.createElement('div');
    wrapper.className = 'timeline-item-wrapper';
    wrapper.style.animationDelay = (index * 0.1) + 's';
    wrapper.appendChild(badge);
    wrapper.appendChild(content);
    
    return wrapper;
}

// Configurar filtros GTA 6
function setupFiltrosGTA6() {
    // Filtros noticias
    const noticiasContainer = document.getElementById('gta6NoticiasFiltros');
    if (noticiasContainer) {
        const btns = noticiasContainer.querySelectorAll('.filter-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                renderNoticiasGTA6(btn.dataset.filter);
            });
        });
    }
    
    // Filtros videos
    const videosContainer = document.getElementById('gta6VideosFiltros');
    if (videosContainer) {
        const btns = videosContainer.querySelectorAll('.filter-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                renderVideosGTA6(btn.dataset.filter);
            });
        });
    }
}

// Spoiler toggle
function setupSpoilerToggle() {
    const toggle = document.getElementById('spoiler-toggle');
    if (!toggle) return;
    
    // Cargar estado guardado
    const saved = localStorage.getItem('gta6-spoilers');
    if (saved === 'true') {
        toggle.checked = true;
        document.body.classList.add('spoilers-enabled');
    }
    
    toggle.addEventListener('change', () => {
        const enabled = toggle.checked;
        document.body.classList.toggle('spoilers-enabled', enabled);
        localStorage.setItem('gta6-spoilers', enabled);
        
        // Re-render con nuevo estado
        document.querySelectorAll('.spoiler-content').forEach(el => {
            el.style.display = enabled ? 'block' : 'none';
        });
    });
}

// Countdown para lanzamiento
function iniciarCountdown() {
    const countdownEl = document.getElementById('gta6-countdown');
    if (!countdownEl) return;
    
    // Fecha estimada: finales de 2025 (ajustar cuando sea oficial)
    const launchDate = new Date('2025-10-01T00:00:00Z');
    
    function actualizar() {
        const ahora = new Date();
        const diff = launchDate - ahora;
        
        if (diff <= 0) {
            countdownEl.innerHTML = '<span style="color: #22c55e; font-weight: bold;">¡YA DISPONIBLE!</span>';
            return;
        }
        
        const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
        const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        countdownEl.innerHTML = `
            <div class="countdown-grid">
                <div class="countdown-item">
                    <span class="countdown-value">${dias}</span>
                    <span class="countdown-label">Días</span>
                </div>
                <div class="countdown-item">
                    <span class="countdown-value">${horas}</span>
                    <span class="countdown-label">Horas</span>
                </div>
                <div class="countdown-item">
                    <span class="countdown-value">${mins}</span>
                    <span class="countdown-label">Min</span>
                </div>
            </div>
            <p class="countdown-note">Lanzamiento estimado: Octubre 2025</p>
        `;
    }
    
    actualizar();
    setInterval(actualizar, 60000);
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    // Esperar a que el router cargue la sección GTA 6
    const checkGTA6 = setInterval(() => {
        if (document.getElementById('gta6') && window.location.hash === '#gta6') {
            clearInterval(checkGTA6);
            cargarGTA6();
        }
    }, 500);
    
    // También escuchar hashchange
    window.addEventListener('hashchange', () => {
        if (window.location.hash === '#gta6') {
            cargarGTA6();
        }
    });
});

export { cargarGTA6, renderNoticiasGTA6, renderVideosGTA6, renderTimelineGTA6 };