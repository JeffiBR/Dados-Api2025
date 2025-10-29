// mobile-menu.js - Gerenciamento do menu lateral responsivo
document.addEventListener('DOMContentLoaded', () => {
    // Elementos do DOM
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');

    // Verificar se os elementos existem
    if (!mobileMenuBtn || !sidebar || !sidebarOverlay) {
        console.warn('Elementos do menu mobile não encontrados');
        return;
    }

    // Inicializar acessibilidade
    initMenuAccessibility();

    // Toggle do menu mobile
    mobileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();

        // Fechar dropdown do usuário se estiver aberto
        if (userDropdown && userDropdown.classList.contains('show')) {
            userDropdown.classList.remove('show');
        }
    });

    // Fechar menu ao clicar no overlay
    sidebarOverlay.addEventListener('click', closeMenu);

    // Delegation de eventos para links do sidebar
    sidebar.addEventListener('click', (e) => {
        if (e.target.tagName === 'A' && window.innerWidth <= 1024) {
            closeMenu();
        }
    });

    // Inicializar gesto de swipe
    initSwipeGesture();

    // Gerenciamento do dropdown do usuário
    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('show');
        });

        // Fechar dropdown ao clicar fora
        document.addEventListener('click', (e) => {
            if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.remove('show');
            }
        });
    }

    // Debounce para redimensionamento
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (window.innerWidth > 1024) {
                closeAllMenus();
            }
        }, 100);
    });

    // Tecla ESC para fechar menu
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllMenus();
        }
    });

    // Funções principais
    function initMenuAccessibility() {
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
        mobileMenuBtn.setAttribute('aria-controls', 'sidebar');
        mobileMenuBtn.setAttribute('aria-label', 'Abrir menu de navegação');
        sidebar.setAttribute('aria-hidden', 'true');
        sidebar.setAttribute('role', 'navigation');
        sidebar.setAttribute('aria-label', 'Menu principal');
    }

    function toggleMenu() {
        const isOpen = sidebar.classList.contains('open');
        isOpen ? closeMenu() : openMenu();
    }

    function openMenu() {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('show');
        mobileMenuBtn.classList.add('active');
        mobileMenuBtn.setAttribute('aria-expanded', 'true');
        sidebar.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        // Focar no primeiro link do menu
        setTimeout(() => {
            const firstLink = sidebar.querySelector('a');
            if (firstLink) firstLink.focus();
        }, 300);
    }

    function closeMenu() {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('show');
        mobileMenuBtn.classList.remove('active');
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
        sidebar.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        mobileMenuBtn.focus();
    }

    function closeAllMenus() {
        closeMenu();
        if (userDropdown) userDropdown.classList.remove('show');
    }

    // Swipe para fechar
    function initSwipeGesture() {
        let startX = 0;
        let currentX = 0;
        let isSwiping = false;

        sidebar.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isSwiping = true;
        }, { passive: true });

        sidebar.addEventListener('touchmove', (e) => {
            if (!isSwiping) return;
            currentX = e.touches[0].clientX;

            const diff = startX - currentX;
            if (diff > 0) {
                sidebar.style.transform = `translateX(${-diff}px)`;
                sidebarOverlay.style.opacity = (1 - (diff / 300)).toString();
            }
        }, { passive: true });

        sidebar.addEventListener('touchend', () => {
            if (!isSwiping) return;

            const diff = startX - currentX;
            if (diff > 70) {
                closeMenu();
            } else {
                sidebar.style.transform = '';
                sidebarOverlay.style.opacity = '';
            }
            isSwiping = false;
        });

        sidebar.addEventListener('touchcancel', () => {
            sidebar.style.transform = '';
            sidebarOverlay.style.opacity = '';
            isSwiping = false;
        });
    }

    // Prevenir scroll quando menu aberto
    function preventScroll(e) {
        if (sidebar.classList.contains('open')) {
            e.preventDefault();
        }
    }

    sidebar.addEventListener('touchmove', preventScroll, { passive: false });
});