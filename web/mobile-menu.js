// mobile-menu.js - Versão corrigida e testada
document.addEventListener('DOMContentLoaded', function() {
    console.log('Script do menu mobile carregado');
    
    const mobileMenuButton = document.getElementById('mobileMenuButton');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    
    console.log('Elementos encontrados:', {
        mobileMenuButton: !!mobileMenuButton,
        sidebar: !!sidebar,
        sidebarOverlay: !!sidebarOverlay
    });

    if (!mobileMenuButton || !sidebar) {
        console.error('Elementos do menu não encontrados');
        return;
    }

    function toggleMenu() {
        console.log('Toggle menu clicado');
        sidebar.classList.toggle('open');
        
        if (sidebarOverlay) {
            sidebarOverlay.classList.toggle('show');
        }
        
        // Prevenir scroll do body quando menu estiver aberto
        if (sidebar.classList.contains('open')) {
            document.body.style.overflow = 'hidden';
            console.log('Menu aberto');
        } else {
            document.body.style.overflow = '';
            console.log('Menu fechado');
        }
    }

    function closeMenu() {
        console.log('Fechando menu');
        sidebar.classList.remove('open');
        
        if (sidebarOverlay) {
            sidebarOverlay.classList.remove('show');
        }
        
        document.body.style.overflow = '';
    }

    // Event listeners
    mobileMenuButton.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleMenu();
    });

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeMenu);
    }

    // Fechar menu ao clicar em links do sidebar
    const sidebarLinks = sidebar.querySelectorAll('a');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', function() {
            if (window.innerWidth <= 768) {
                closeMenu();
            }
        });
    });

    // Fechar menu ao redimensionar para desktop
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768 && sidebar.classList.contains('open')) {
            closeMenu();
        }
    });

    // Fechar menu com ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            closeMenu();
        }
    });

    console.log('Menu mobile inicializado com sucesso');
});

// Função para verificar se está em mobile
function isMobile() {
    return window.innerWidth <= 768;
}
