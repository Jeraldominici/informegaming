// juegos.js - Consume juegos.json generado por pipeline propio
import { CONFIG } from './config.js';
import { htmlATexto, parsearFecha, esUrlSegura, formatearDiff } from './utils.js';

let todosLosJuegos = [];

// Configuración de las tres secciones
const SECCIONES_JUEGOS = {
    'gratis-hoy': {
        gridId: 'gratisHoyGrid',
        filtroContainerId: 'gratisHoyFiltros',
        filtroActivo: 'all',
        tipo: 'today'
    },
    'gratis-semana': {
        gridId: 'gratisSemanaGrid',
        filtroContainerId: 'gratisSemanaFiltros',
        filtroActivo: 'all',
        tipo: 'week'
    },
    'gratis-siempre': {
        gridId: 'gratisSiempreGrid',
        filtroContainerId: 'gratisSiempreFiltros',
        filtroActivo: 'all',
        tipo: 'always'
    }
};

// Mapeo de plataforma a emoji
const PLATFORM_EMOJI = {
    'Epic': '🟣',
    'Steam': '🔥',
    'Xbox': '🟢',
    'PS': '🔵',
    'Nintendo': '🔴',
    'GOG': '🟡',
    'Itchio': '🟠',
    'Multi': '🎮',
};

// Detectar base path automáticamente (para GitHub Pages: /informegaming/)
function getBasePath() {
    // En desarrollo (Vite): ''
    // En GitHub Pages: '/informegaming'
    const path = window.location.pathname;
    const match = path.match(/^(\/[^\/]+)/);
    return match ? match[1] : '';
}

const BASE_PATH = getBasePath();

async function cargarJuegosGratis() {
    // Mostrar loading en todas las grids
    Object.values(SECCIONES_JUEGOS).forEach(seccion => {
        const grid = document.getElementById(seccion.gridId);
        if (grid) {
            grid.innerHTML = '<p style="color: #8899b0; text-align: center; width: 100%;">Cargando juegos gratis...</p>';
        }
    });
    
    try {
        let juegosData = null;
        
        // 1. Fetch desde la ruta correcta (GitHub Pages: /informegaming/data/juegos.json)
        const dataUrl = `${BASE_PATH}/data/juegos.json`;
        try {
            const resp = await fetch(dataUrl, { cache: 'no-store' });
            if (resp.ok) {
                juegosData = await resp.json();
                console.log('[juegos] Cargado desde:', dataUrl);
            }
        } catch (fetchError) {
            console.warn('Fetch desde repo falló:', fetchError);
        }
        
        // 2. Fallback: Worker API (datos frescos del KV)
        if (!juegosData) {
            try {
                const resp = await fetch('https://informegaming-ingest.informegaming-ingest.workers.dev/games', { 
                    cache: 'no-store',
                    headers: { 'Accept': 'application/json' }
                });
                if (resp.ok) {
                    juegosData = await resp.json();
                    console.log('[juegos] Cargado desde Worker API');
                }
            } catch (workerError) {
                console.warn('Worker API falló:', workerError);
            }
        }
        
        // 3. Fallback: localStorage cache (24h)
        if (!juegosData) {
            const cached = localStorage.getItem('informegaming_juegos');
            const cacheTime = localStorage.getItem('informegaming_juegos_time');
            if (cached && cacheTime && (Date.now() - Number(cacheTime)) < 24 * 60 * 60 * 1000) {
                juegosData = JSON.parse(cached);
                console.log('[juegos] Usando caché localStorage');
            }
        }
        
        if (!juegosData || !juegosData.games || !Array.isArray(juegosData.games)) {
            throw new Error('Formato de datos inválido');
        }
        
        // Guardar en caché
        localStorage.setItem('informegaming_juegos', JSON.stringify(juegosData));
        localStorage.setItem('informegaming_juegos_time', String(Date.now()));
        
        // Clasificar availabilityType para cada juego
        const juegosConTipo = juegosData.games.map(juego => ({
            ...juego,
            availabilityType: juego.availabilityType || classifyAvailability(juego)
        }));
        
        // Separar juegos por tipo de disponibilidad
        const juegosPorTipo = {
            'today': [],
            'week': [],
            'always': []
        };
        
        juegosConTipo.forEach(juego => {
            const tipo = juego.availabilityType || 'week';
            if (juegosPorTipo[tipo]) {
                juegosPorTipo[tipo].push(juego);
            } else {
                juegosPorTipo['week'].push(juego);
            }
        });
        
        // Asignar a cada sección
        Object.entries(SECCIONES_JUEGOS).forEach(([seccionId, config]) => {
            const juegosFiltrados = juegosPorTipo[config.tipo] || [];
            window[`todosLosJuegos_${seccionId}`] = juegosFiltrados;
        });
        
        // Expose on window for SEO JSON-LD
        window.todosLosJuegos = juegosConTipo;
        
        // Renderizar cada sección
        Object.entries(SECCIONES_JUEGOS).forEach(([seccionId, config]) => {
            const juegos = window[`todosLosJuegos_${seccionId}`] || [];
            window[`filtroActual_${seccionId}`] = config.filtroActivo;
            mostrarJuegos(seccionId, config.filtroActivo);
            setupFiltrosJuegos(config.gridId, config.filtroContainerId, seccionId);
        });
        
        mostrarHistorial();
        
    } catch (error) {
        console.error('Error cargando juegos:', error);
        Object.values(SECCIONES_JUEGOS).forEach(seccion => {
            const grid = document.getElementById(seccion.gridId);
            if (grid) {
                grid.innerHTML = 
                    '<p style="color: #ff6b6b;">Error al cargar juegos gratis. ' +
                    'Verifica tu conexión o inténtalo más tarde.</p>';
            }
        });
    }
}

// classifyAvailability imported from utils.js

function filtrarJuegos(seccionId, filtro) {
    const juegos = window[`todosLosJuegos_${seccionId}`] || [];
    if (filtro === 'all') return window[`todosLosJuegos_${seccionId}`] || [];
    const termino = filtro.toLowerCase();
    return (window[`todosLosJuegos_${seccionId}`] || []).filter(juego => {
        const plataforma = (juego.platform || '').trim().toLowerCase();
        return plataforma === termino;
    });
}

function crearEstadoJuego(endsAt) {
    const span = document.createElement('span');
    
    if (!endsAt) {
        span.className = 'badge';
        span.textContent = 'Sin fecha';
        return span;
    }
    
    const fechaFin = new Date(endsAt);
    if (isNaN(fechaFin.getTime())) {
        span.className = 'badge';
        span.textContent = 'Fecha inválida';
        return span;
    }
    
    const diff = fechaFin.getTime() - Date.now();
    if (diff <= 0) {
        span.className = 'badge expired';
        span.textContent = 'Expirado';
        return span;
    }
    
    span.className = 'countdown';
    span.dataset.fin = String(fechaFin.getTime());
    span.textContent = formatearDiff(diff);
    return span;
}

function crearEnlaceReclamo(activo, enlaceRaw) {
    const enlace = document.createElement('a');
    enlace.className = 'btn-small';
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    enlace.textContent = 'Reclamar';
    
    if (activo && esUrlSegura(enlaceRaw)) {
        enlace.href = enlaceRaw;
    } else {
        enlace.href = '#';
        enlace.setAttribute('aria-disabled', 'true');
        enlace.style.opacity = '0.5';
        enlace.style.pointerEvents = 'none';
    }
    return enlace;
}

function crearCardJuego(juego, index) {
    const plataforma = juego.platform || 'Varias';
    const fechaFin = juego.endsAt ? new Date(juego.endsAt) : null;
    const fechaInicio = juego.startsAt ? new Date(juego.startsAt) : null;
    const activo = juego.isActive === true || (fechaFin && fechaFin > new Date());
    
    const emoji = PLATFORM_EMOJI[plataforma] || '🎮';
    
    const card = document.createElement('div');
    card.className = 'card fade-in';
    card.style.animationDelay = (index * 0.05) + 's';
    
    // Imagen del juego
    const divImg = document.createElement('div');
    divImg.className = 'card-img';
    if (juego.imageUrl && esUrlSegura(juego.imageUrl)) {
        divImg.style.backgroundImage = `url("${juego.imageUrl}")`;
        divImg.style.backgroundSize = 'cover';
        divImg.style.backgroundPosition = 'center';
        divImg.textContent = '';
        divImg.setAttribute('role', 'img');
        divImg.setAttribute('aria-label', `${htmlATexto(juego.title)} - Imagen del juego gratis en ${plataforma}`);
    } else {
        divImg.setAttribute('aria-hidden', 'true');
        divImg.textContent = emoji;
    }
    card.appendChild(divImg);
    
    const body = document.createElement('div');
    body.className = 'card-body';
    
    // Título
    const h3 = document.createElement('h3');
    h3.textContent = htmlATexto(juego.title);
    body.appendChild(h3);
    
    // Plataforma
    const pPlataforma = document.createElement('p');
    pPlataforma.textContent = 'Plataforma: ' + plataforma;
    body.appendChild(pPlataforma);
    
    // Fechas
    const pFechas = document.createElement('p');
    pFechas.style.fontSize = '0.85rem';
    const inicioStr = fechaInicio ? fechaInicio.toLocaleDateString('es-ES') : 'Sin fecha';
    const finStr = fechaFin ? fechaFin.toLocaleDateString('es-ES') : 'Sin fecha';
    pFechas.textContent = '📅 Del ' + inicioStr + ' al ' + finStr;
    body.appendChild(pFechas);
    
    // Tipo de juego (badge opcional)
    if (juego.type && juego.type !== 'base_game') {
        const badge = document.createElement('span');
        badge.className = 'badge';
        const typeLabels = {
            'dlc': 'DLC / Contenido',
            'loot': 'Botín / Recompensa',
            'free_weekend': 'Fin de semana gratis',
            'code': 'Código',
        };
        badge.textContent = typeLabels[juego.type] || juego.type;
        body.appendChild(badge);
    }
    
    // Footer con countdown y botón
    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.appendChild(crearEstadoJuego(juego.endsAt));
    footer.appendChild(crearEnlaceReclamo(activo, juego.storeUrl || ''));
    body.appendChild(footer);
    
    card.appendChild(body);
    return card;
}

function mostrarJuegos(seccionId, filtro) {
    const config = SECCIONES_JUEGOS[seccionId];
    if (!config) return;
    
    const grid = document.getElementById(config.gridId);
    if (!grid) return;
    
    grid.innerHTML = '';
    
    const juegosFiltrados = filtrarJuegos(seccionId, filtro);
    
    if (juegosFiltrados.length === 0) {
        grid.innerHTML = '<p style="color: #8899b0; text-align: center; width: 100%;">No hay juegos gratis para este filtro.</p>';
        return;
    }
    
    const fragmento = document.createDocumentFragment();
    juegosFiltrados.forEach((juego, index) => {
        fragmento.appendChild(crearCardJuego(juego, index));
    });
    grid.appendChild(fragmento);
}

function mostrarHistorial() {
    const tbody = document.getElementById('historialBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const ahora = new Date();
    const todosLosJuegos = Object.values(SECCIONES_JUEGOS).flatMap(config => 
        window[`todosLosJuegos_${config.gridId.replace('Grid', '')}`] || []
    ).flat();
    
    const expirados = todosLosJuegos.filter(juego => {
        const fin = juego.endsAt ? new Date(juego.endsAt) : null;
        return fin !== null && fin <= ahora;
    });
    
    if (expirados.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.textContent = 'No hay juegos expirados todavía.';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }
    
    expirados.forEach(juego => {
        const fin = juego.endsAt ? new Date(juego.endsAt) : null;
        
        const tr = document.createElement('tr');
        
        const tdNombre = document.createElement('td');
        tdNombre.textContent = htmlATexto(juego.title);
        tr.appendChild(tdNombre);
        
        const tdPlataforma = document.createElement('td');
        tdPlataforma.textContent = juego.platform || 'Varias';
        tr.appendChild(tdPlataforma);
        
        const tdFecha = document.createElement('td');
        tdFecha.textContent = fin ? fin.toLocaleDateString('es-ES') : '—';
        tr.appendChild(tdFecha);
        
        const tdEstado = document.createElement('td');
        const estado = document.createElement('span');
        estado.className = 'status expired';
        estado.textContent = 'Expirado';
        tdEstado.appendChild(estado);
        tr.appendChild(tdEstado);
        
        tbody.appendChild(tr);
    });
}

// Configurar filtros de juegos para una sección
function setupFiltrosJuegos(gridId, filtroContainerId, seccionId) {
    const container = document.getElementById(filtroContainerId);
    if (!container) return;
    
    const btns = container.querySelectorAll('.filter-btn');
    
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const container = document.getElementById(`filtroContainerId`);
            if (container) {
                container.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });
            }
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            const filtro = btn.dataset.filter;
            window[`filtroActual_${seccionId}`] = filtro;
            mostrarJuegos(seccionId, filtro);
        });
    });
}

// Actualizar solo los textos del countdown sin re-renderizar todo
function actualizarCountdowns() {
    const ahora = Date.now();
    let expiroAlguno = false;
    
    document.querySelectorAll('.countdown[data-fin]').forEach(el => {
        const diff = Number(el.dataset.fin) - ahora;
        if (diff <= 0) {
            expiroAlguno = true;
            return;
        }
        el.textContent = formatearDiff(diff);
    });
    
    if (expiroAlguno) {
        // Re-renderizar todas las secciones
        Object.keys(SECCIONES_JUEGOS).forEach(seccionId => {
            const filtro = window[`filtroActual_${seccionId}`] || 'all';
            mostrarJuegos(seccionId, filtro);
        });
        mostrarHistorial();
    }
}

// Inicializar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    // Setup filtros para cada sección
    Object.entries(SECCIONES_JUEGOS).forEach(([seccionId, config]) => {
        setupFiltrosJuegos(config.gridId, config.filtroContainerId, seccionId);
    });
    
    cargarJuegosGratis();
    
    setInterval(() => {
        if (!document.hidden) actualizarCountdowns();
    }, CONFIG.countdownIntervalMs);
});

export { SECCIONES_JUEGOS, cargarJuegosGratis, mostrarJuegos, filtrarJuegos };