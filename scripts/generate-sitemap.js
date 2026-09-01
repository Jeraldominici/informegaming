/**
 * generate-sitemap.js - Genera sitemap.xml durante el build
 * Ejecutar: node scripts/generate-sitemap.js
 */

import { generateSitemap } from '../src/js/seo.js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

function generateSitemapFile() {
    // URLs dinámicas basadas en juegos actuales (se podrían leer de public/data/juegos.json)
    const dynamicPages = [
        // Las páginas principales ya están en seo.js
    ];
    
    const sitemap = generateSitemap(dynamicPages);
    
    const outputDir = resolve(process.cwd(), 'dist');
    const outputPath = resolve(outputDir, 'sitemap.xml');
    
    // Asegurar que existe el directorio
    mkdirSync(outputDir, { recursive: true });
    
    writeFileSync(outputPath, sitemap, 'utf-8');
    console.log(`✅ sitemap.xml generado en ${outputPath}`);
}

generateSitemapFile();