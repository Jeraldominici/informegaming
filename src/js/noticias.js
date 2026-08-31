// noticias.js
import { CONFIG } from './config.js';
import { htmlATexto, truncarTexto, esUrlSegura, parsearFecha } from './utils.js';

let todasLasNoticias = [];
let filtroActual = 'all';

async function cargarNoticias() {
    const grid = document.getElementById('noticiasGrid');
    try {
        const url = `${CONFIG.apiBase}/noticia?_embed`;
        const respuesta = await fetch(url);

        if (!respuesta.ok) throw new Error('Error al obtener noticias');

        todasLasNoticias = await respuesta.json();
        mostrarNoticias(filtroActual);

    } catch (error) {
        console.error('Error:', error);
        grid.innerHTML =
            '<p style="color: #ff6b6b;">Error al cargar noticias. Verifica tu conexión o la URL de la API.</p>';
    }
}

function filtrarNoticias(filtro) {
    if (filtro === 'all') return todasLasNoticias;
    const termino = filtro.toLowerCase();
    return todasLasNoticias.filter(noticia => {
        const texto = (
            htmlATexto(noticia.title?.rendered) + ' ' +
            htmlATexto(noticia.excerpt?.rendered)
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
    }

    if (imgUrl && esUrlSegura(imgUrl)) {
        div.style.backgroundImage = `url("${imgUrl}")`;
        div.style.backgroundSize = 'cover';
        div.style.backgroundPosition = 'center';
        div.setAttribute('role', 'img');
        div.setAttribute('aria-label', htmlATexto(noticia.title?.rendered) || 'Imagen de la noticia');
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
    h3.textContent = htmlATexto(noticia.title?.rendered);
    body.appendChild(h3);

    const p = document.createElement('p');
    p.textContent = truncarTexto(htmlATexto(noticia.excerpt?.rendered), 140);
    body.appendChild(p);

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    const spanFecha = document.createElement('span');
    const fecha = parsearFecha(noticia.date);
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

// Inicializar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    setupFiltrosNoticias();
    cargarNoticias();
});
