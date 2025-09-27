// mobile-menu.js - Gerenciamento do menu mobile para todas as páginas

document.addEventListener('DOMContentLoaded', () => {
    // Elementos do menu mobile
    const mobileMenuButton = document.querySelector('.mobile-menu-button, .mobile-menu-btn');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.querySelector('.sidebar-overlay');
    
    // Verificar se os elementos existem na página
    if (!mobileMenuButton || !sidebar) {
        console.log('Elementos do menu mobile não encontrados nesta página');
        return;
    }

    // Função para abrir/fechar o menu
    const toggleMobileMenu = () => {
        sidebar.classList.toggle('open');
        if (sidebarOverlay) {
            sidebarOverlay.classList.toggle('show');
        }
        
        // Prevenir scroll do body quando menu estiver aberto
        if (sidebar.classList.contains('open')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    };

    // Função para fechar o menu
    const closeMobileMenu = () => {
        sidebar.classList.remove('open');
        if (sidebarOverlay) {
            sidebarOverlay.classList.remove('show');
        }
        document.body.style.overflow = '';
    };

    // Event listeners
    mobileMenuButton.addEventListener('click', toggleMobileMenu);
    
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeMobileMenu);
    }

    // Fechar menu ao clicar em links do sidebar (em mobile)
    const sidebarLinks = sidebar.querySelectorAll('a');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                closeMobileMenu();
            }
        });
    });

    // Fechar menu ao redimensionar a janela para tamanho maior
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && sidebar.classList.contains('open')) {
            closeMobileMenu();
        }
    });

    // Fechar menu ao pressionar ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            closeMobileMenu();
        }
    });

    // Verificar tamanho da tela ao carregar
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
        if (sidebarOverlay) {
            sidebarOverlay.classList.remove('show');
        }
    }
});

// Função auxiliar para verificar se é mobile
function isMobile() {
    return window.innerWidth <= 768;
}
