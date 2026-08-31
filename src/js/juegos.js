// juegos.js
import { CONFIG } from './config.js';
import { htmlATexto, parsearFecha, esUrlSegura, formatearDiff } from './utils.js';

let todosLosJuegos = [];
let filtroActualJuegos = 'all';

async function cargarJuegosGratis() {
    const grid = document.getElementById('gratisGrid');
    try {
        const url = `${CONFIG.apiBase}/juego_gratis`;
        const respuesta = await fetch(url);

        if (!respuesta.ok) throw new Error('Error al obtener juegos');

        todosLosJuegos = await respuesta.json();
        mostrarJuegos(filtroActualJuegos);
        mostrarHistorial();

    } catch (error) {
        console.error('Error:', error);
        grid.innerHTML =
            '<p style="color: #ff6b6b;">Error al cargar juegos gratis. Verifica tu conexión o la URL de la API.</p>';
    }
}

function filtrarJuegos(filtro) {
    if (filtro === 'all') return todosLosJuegos;
    const termino = filtro.toLowerCase();
    return todosLosJuegos.filter(juego => {
        const plataforma = (juego.acf?.plataforma || '').trim().toLowerCase();
        return plataforma === termino;
    });
}

function crearEstadoJuego(fechaFin) {
    const span = document.createElement('span');

    if (!fechaFin) {
        span.className = 'badge';
        span.textContent = 'Sin fecha';
        return span;
    }

    const diff = fechaFin - Date.now();
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
    const acf = juego.acf || {};
    const plataforma = acf.plataforma || 'Varias';
    const fechaFin = parsearFecha(acf.fecha_fin);
    const fechaInicio = parsearFecha(acf.fecha_inicio);
    const activo = fechaFin !== null && fechaFin > new Date();

    let emoji = '🎮';
    if (plataforma === 'Epic') emoji = '🟣';
    else if (plataforma === 'Steam') emoji = '🔥';
    else if (plataforma === 'Xbox') emoji = '🟢';
    else if (plataforma === 'PS') emoji = '🔵';
    else if (plataforma === 'Nintendo') emoji = '🔴';

    const card = document.createElement('div');
    card.className = 'card fade-in';
    card.style.animationDelay = (index * 0.05) + 's';

    const divImg = document.createElement('div');
    divImg.className = 'card-img';
    divImg.setAttribute('aria-hidden', 'true');
    divImg.textContent = emoji;
    card.appendChild(divImg);

    const body = document.createElement('div');
    body.className = 'card-body';

    const h3 = document.createElement('h3');
    h3.textContent = htmlATexto(juego.title?.rendered);
    body.appendChild(h3);

    const pPlataforma = document.createElement('p');
    pPlataforma.textContent = 'Plataforma: ' + plataforma;
    body.appendChild(pPlataforma);

    const pFechas = document.createElement('p');
    pFechas.style.fontSize = '0.85rem';
    pFechas.textContent = `📅 Del ${fechaInicio ? fechaInicio.toLocaleDateString('es-ES') : 'Sin fecha'} al ${fechaFin ? fechaFin.toLocaleDateString('es-ES') : 'Sin fecha'}`;
    body.appendChild(pFechas);

    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.appendChild(crearEstadoJuego(fechaFin));
    footer.appendChild(crearEnlaceReclamo(activo, acf.enlace_reclamo || ''));
    body.appendChild(footer);

    card.appendChild(body);
    return card;
}

function mostrarJuegos(filtro) {
    const grid = document.getElementById('gratisGrid');
    grid.innerHTML = '';

    const juegosFiltrados = filtrarJuegos(filtro);

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
    tbody.innerHTML = '';

    const ahora = new Date();
    const expirados = todosLosJuegos.filter(juego => {
        const fin = parsearFecha(juego.acf?.fecha_fin);
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
        const fin = parsearFecha(juego.acf?.fecha_fin);

        const tr = document.createElement('tr');

        const tdNombre = document.createElement('td');
        tdNombre.textContent = htmlATexto(juego.title?.rendered);
        tr.appendChild(tdNombre);

        const tdPlataforma = document.createElement('td');
        tdPlataforma.textContent = juego.acf?.plataforma || 'Varias';
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

// Configurar filtros de juegos
function setupFiltrosJuegos() {
    const container = document.getElementById('gratisFiltros');
    const btns = container.querySelectorAll('.filter-btn');

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtroActualJuegos = btn.dataset.filter;
            mostrarJuegos(filtroActualJuegos);
        });
    });
}

// Actualizar solo los textos del countdown sin re-renderizar todo
function actualizarCountdowns() {
    const ahora = Date.now();
    let expiroAlguno = false;

    document.querySelectorAll('#gratisGrid .countdown[data-fin]').forEach(el => {
        const diff = Number(el.dataset.fin) - ahora;
        if (diff <= 0) {
            expiroAlguno = true;
            return;
        }
        el.textContent = formatearDiff(diff);
    });

    if (expiroAlguno) {
        mostrarJuegos(filtroActualJuegos);
        mostrarHistorial();
    }
}

// Inicializar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    setupFiltrosJuegos();
    cargarJuegosGratis();

    setInterval(() => {
        if (!document.hidden) actualizarCountdowns();
    }, CONFIG.countdownIntervalMs);
});
