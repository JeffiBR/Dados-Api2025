// users-modal-integration.js - Integração dos modais com scripts existentes

document.addEventListener('DOMContentLoaded', function() {
    // Inicializar modais
    initializeModals();
    
    // Garantir compatibilidade com scripts existentes
    ensureCompatibility();
});

function initializeModals() {
    // Elementos dos modais
    const modals = {
        'users-modal': document.getElementById('users-modal'),
        'groups-modal': document.getElementById('groups-modal'),
        'associations-modal': document.getElementById('associations-modal'),
        'admin-groups-modal': document.getElementById('admin-groups-modal')
    };

    // Botões para abrir modais
    const openButtons = {
        'users-card': 'users-modal',
        'groups-card': 'groups-modal',
        'associations-card': 'associations-modal',
        'admin-groups-card': 'admin-groups-modal',
        'addUserBtn': 'users-modal'
    };

    // Inicializar event listeners para abrir modais
    Object.keys(openButtons).forEach(buttonId => {
        const button = document.getElementById(buttonId);
        const modalId = openButtons[buttonId];
        
        if (button && modals[modalId]) {
            button.addEventListener('click', () => openModal(modals[modalId]));
        }
    });

    // Inicializar event listeners para fechar modais
    document.querySelectorAll('.modal-close, .close-modal').forEach(button => {
        button.addEventListener('click', function() {
            const modal = this.closest('.modal');
            closeModal(modal);
        });
    });

    // Fechar modal ao clicar fora
    Object.values(modals).forEach(modal => {
        if (modal) {
            modal.addEventListener('click', function(event) {
                if (event.target === this) {
                    closeModal(this);
                }
            });
        }
    });

    // Fechar modal com ESC
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            Object.values(modals).forEach(modal => {
                if (modal && modal.style.display === 'block') {
                    closeModal(modal);
                }
            });
        }
    });
}

function openModal(modal) {
    if (!modal) return;
    
    // Adicionar classe para prevenir scroll no body
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    // Mostrar modal
    modal.style.display = 'block';
    
    // Focar no modal para acessibilidade
    modal.setAttribute('aria-hidden', 'false');
    
    // Disparar evento customizado
    modal.dispatchEvent(new CustomEvent('modalOpened', { detail: { modal } }));
}

function closeModal(modal) {
    if (!modal) return;
    
    // Adicionar animação de saída
    modal.classList.add('closing');
    modal.querySelector('.modal-content').classList.add('closing');
    
    setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
        modal.querySelector('.modal-content').classList.remove('closing');
        
        // Restaurar scroll do body
        document.body.style.overflow = 'auto';
        document.documentElement.style.overflow = 'auto';
        
        // Atualizar acessibilidade
        modal.setAttribute('aria-hidden', 'true');
        
        // Disparar evento customizado
        modal.dispatchEvent(new CustomEvent('modalClosed', { detail: { modal } }));
    }, 300);
}

function ensureCompatibility() {
    // Garantir que os scripts existentes funcionem com a nova estrutura de modais
    
    // users.js - Ajustar para funcionar com modais
    if (typeof window.populateFormForEdit === 'function') {
        const originalPopulateFormForEdit = window.populateFormForEdit;
        window.populateFormForEdit = function(user) {
            originalPopulateFormForEdit(user);
            openModal(document.getElementById('users-modal'));
        };
    }
    
    // groups.js - Ajustar para funcionar com modais
    if (typeof window.populateGroupFormForEdit === 'function') {
        const originalPopulateGroupFormForEdit = window.populateGroupFormForEdit;
        window.populateGroupFormForEdit = function(group) {
            originalPopulateGroupFormForEdit(group);
            openModal(document.getElementById('groups-modal'));
        };
    }
    
    // group-users.js - Ajustes específicos se necessário
    if (typeof window.openEditUserModal === 'function') {
        // Já está adaptado para modal
    }
}

// Funções auxiliares para os scripts existentes
window.ModalManager = {
    open: openModal,
    close: closeModal,
    
    openUsersModal: function() {
        openModal(document.getElementById('users-modal'));
    },
    
    openGroupsModal: function() {
        openModal(document.getElementById('groups-modal'));
    },
    
    openAssociationsModal: function() {
        openModal(document.getElementById('associations-modal'));
    },
    
    openAdminModal: function() {
        openModal(document.getElementById('admin-groups-modal'));
    }
};
