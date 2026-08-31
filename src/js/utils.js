// utils.js

export function htmlATexto(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent || '').trim();
}

export function truncarTexto(texto, max) {
    if (!texto) return '';
    if (texto.length <= max) return texto;
    return texto.slice(0, max).trimEnd() + '…';
}

export function esUrlSegura(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

export function parsearFecha(valor) {
    if (!valor) return null;
    const fecha = new Date(valor);
    return isNaN(fecha.getTime()) ? null : fecha;
}

export function formatearDiff(diffMs) {
    const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `⏳ ${dias}d ${horas}h ${mins}m`;
}
