// mobile-menu.js - Versão final otimizada
document.addEventListener('DOMContentLoaded', () => {
    const mobileMenuButton = document.getElementById('mobileMenuButton');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    
    if (!mobileMenuButton || !sidebar) return;

    const toggleMobileMenu = () => {
        const wasOpen = sidebar.classList.contains('open');
        
        sidebar.classList.toggle('open');
        if (sidebarOverlay) {
            sidebarOverlay.classList.toggle('show');
        }
        
        if (!wasOpen) {
            document.body.classList.add('menu-open');
            document.body.style.overflow = 'hidden';
        } else {
            document.body.classList.remove('menu-open');
            document.body.style.overflow = '';
        }
    };

    const closeMobileMenu = () => {
        sidebar.classList.remove('open');
        if (sidebarOverlay) {
            sidebarOverlay.classList.remove('show');
        }
        document.body.classList.remove('menu-open');
        document.body.style.overflow = '';
    };

    // Event listeners
    mobileMenuButton.addEventListener('click', toggleMobileMenu);
    
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeMobileMenu);
    }

    // Fechar menu ao clicar em links
    const sidebarLinks = sidebar.querySelectorAll('a');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', closeMobileMenu);
    });

    // Ajustes responsivos
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && sidebar.classList.contains('open')) {
            closeMobileMenu();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            closeMobileMenu();
        }
    });

    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
        if (sidebar.classList.contains('open') && 
            !sidebar.contains(e.target) && 
            !mobileMenuButton.contains(e.target)) {
            closeMobileMenu();
        }
    });
});
