/**
 * router.js - Hash-based routing for informegaming
 * Handles navigation between sections via hash links
 */

// Section mapping: hash -> section ID
const SECTION_MAP = {
  'noticias': 'noticias',
  'hoy': 'gratis-hoy',
  'semana': 'gratis-semana',
  'siempre': 'gratis-siempre',
  'gta6': 'gta6'
};

// Reverse mapping for nav link highlighting
const HASH_TO_NAV = {
  'noticias': 'noticias',
  'hoy': 'gratis',
  'semana': 'gratis',
  'siempre': 'gratis',
  'gta6': 'gta6'
};

// All section IDs that can be toggled
const ALL_SECTIONS = ['noticias', 'gratis-hoy', 'gratis-semana', 'gratis-siempre', 'gta6'];

// All nav link IDs
const NAV_LINKS = {
  'noticias': 'nav-noticias',
  'gratis': 'gratis',
  'gta6': 'gta6'
};

/**
 * Get current hash from URL (without #)
 */
function getCurrentHash() {
  return window.location.hash.slice(1) || 'noticias';
}

/**
 * Show a specific section and hide others
 */
function showSection(sectionId) {
  // Hide all sections
  ALL_SECTIONS.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    }
  });

  // Show target section
  const target = document.getElementById(sectionId);
  if (target) {
    target.style.display = '';
    target.removeAttribute('aria-hidden');
    
    // Scroll to section
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Update active nav link
 */
function updateActiveNav(hash) {
  const navKey = HASH_TO_NAV[hash] || 'noticias';
  
  // Update all nav links
  document.querySelectorAll('nav a[href^="#"]').forEach(link => {
    const href = link.getAttribute('href');
    const linkHash = href.slice(1);
    const isActive = linkHash === hash || (hash === '' && linkHash === 'noticias');
    
    link.classList.toggle('active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
    link.setAttribute('aria-selected', isActive);
  });
}

/**
 * Handle hash change
 */
function handleHashChange() {
  const hash = getCurrentHash();
  const sectionId = SECTION_MAP[hash] || 'noticias';
  
  showSection(sectionId);
  updateActiveNav(hash);
  
  // Update SEO meta tags if seo.js is loaded
  if (window.seo && window.seo.updateMetaTags) {
    const sectionMap = {
      'noticias': 'noticias',
      'hoy': 'gratis',
      'semana': 'gratis',
      'siempre': 'gratis',
      'gta6': 'gta6'
    };
    window.seo.updateMetaTags(sectionMap[hash] || 'home');
  }
}

/**
 * Initialize router
 */
export function initRouter() {
  // Initial load
  handleHashChange();
  
  // Listen for hash changes
  window.addEventListener('hashchange', handleHashChange);
  
  // Also handle initial load if no hash
  if (!window.location.hash) {
    window.location.hash = 'noticias';
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRouter);
} else {
  initRouter();
}

// Export for testing
export { handleHashChange, showSection, getCurrentHash, SECTION_MAP, HASH_TO_NAV, ALL_SECTIONS };