/**
 * GLOBAL UNIFIED NAVIGATION JAVASCRIPT
 * Handles mobile drawer toggle, click-outside dismissal, scroll effects, and active state.
 */

function toggleGlobalMobileMenu() {
    const btn = document.getElementById('globalMobileMenuBtn');
    const drawer = document.getElementById('globalMobileDrawer');
    if (!btn || !drawer) return;

    const isOpen = drawer.classList.contains('open');
    if (isOpen) {
        closeGlobalMobileMenu();
    } else {
        btn.classList.add('active');
        drawer.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closeGlobalMobileMenu() {
    const btn = document.getElementById('globalMobileMenuBtn');
    const drawer = document.getElementById('globalMobileDrawer');
    if (btn) btn.classList.remove('active');
    if (drawer) drawer.classList.remove('open');
    document.body.style.overflow = '';
}

// Close drawer on click outside
document.addEventListener('click', function(e) {
    const btn = document.getElementById('globalMobileMenuBtn');
    const drawer = document.getElementById('globalMobileDrawer');
    if (drawer && drawer.classList.contains('open')) {
        if (!drawer.contains(e.target) && !btn.contains(e.target)) {
            closeGlobalMobileMenu();
        }
    }
});

// Close drawer on ESC key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeGlobalMobileMenu();
    }
});

// Add scroll listener for navbar blur & elevation
window.addEventListener('scroll', function() {
    const nav = document.querySelector('.global-nav-wrapper');
    if (!nav) return;
    if (window.scrollY > 20) {
        nav.classList.add('scrolled');
    } else {
        nav.classList.remove('scrolled');
    }
}, { passive: true });

// Highlight active nav item on load
document.addEventListener('DOMContentLoaded', function() {
    const currentPath = window.location.pathname.replace(/\/index\.html$/, '/');
    const navLinks = document.querySelectorAll('.global-nav-link');

    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        
        // Exact match or directory match
        if (href === currentPath || (href !== '/' && currentPath.startsWith(href))) {
            link.classList.add('active');
        }
    });

    // Handle hash links with smooth scroll offset for sticky navbar
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href').substring(1);
            if (!targetId) return;
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                e.preventDefault();
                closeGlobalMobileMenu();
                const navHeight = 74;
                const elementPosition = targetEl.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - navHeight;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
});
