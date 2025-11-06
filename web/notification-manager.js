// notification-manager.js - VERSÃO COMPLETA E CORRIGIDA
class NotificationManager {
    constructor() {
        this.notificationBtn = document.getElementById('notificationBtn');
        this.notificationBadge = document.getElementById('notificationBadge');
        this.notificationDropdown = document.getElementById('notificationDropdown');
        this.notificationList = document.getElementById('notificationList');
        this.markAllReadBtn = document.getElementById('markAllRead');
        this.viewAllNotifications = document.getElementById('viewAllNotifications');

        this.isOpen = false;
        this.notifications = [];
        this.isLoading = false;
        this.retryCount = 0;
        this.maxRetries = 3;

        // Verificar se elementos existem antes de inicializar
        if (!this.notificationBtn || !this.notificationDropdown) {
            console.error('❌ Elementos de notificação não encontrados no DOM');
            return;
        }

        console.log('✅ NotificationManager - Elementos encontrados, inicializando...');
        this.init();
    }

    init() {
        console.log('🔔 Inicializando NotificationManager...');

        // Event listeners
        this.notificationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });

        if (this.markAllReadBtn) {
            this.markAllReadBtn.addEventListener('click', () => this.markAllAsRead());
        }

        if (this.viewAllNotifications) {
            this.viewAllNotifications.addEventListener('click', (e) => {
                e.preventDefault();
                this.showAllNotifications();
            });
        }

        // Fechar dropdown ao clicar fora
        document.addEventListener('click', (e) => {
            if (this.isOpen && 
                !this.notificationBtn.contains(e.target) && 
                !this.notificationDropdown.contains(e.target)) {
                this.closeDropdown();
            }
        });

        // Carregar notificações imediatamente
        this.loadNotifications();

        // Atualizar a cada 30 segundos
        setInterval(() => this.loadNotifications(), 30000);

        // Verificar se é admin para mostrar link de admin
        this.checkAdminStatus();

        console.log('✅ NotificationManager inicializado com sucesso');
    }

    async loadNotifications() {
        if (this.isLoading) {
            console.log('🔔 Load já em andamento, ignorando...');
            return;
        }

        try {
            this.isLoading = true;
            this.showLoadingState();

            console.log('🔔 Verificando autenticação...');
            const isAuthenticated = await checkAuth();
            if (!isAuthenticated) {
                console.warn('⚠️ Usuário não autenticado - não é possível carregar notificações');
                this.showError('Usuário não autenticado');
                return;
            }

            console.log('🔔 Carregando notificações...');
            const response = await authenticatedFetch('/api/notifications?limit=5&unread_only=false');

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Erro HTTP ${response.status}:`, errorText);

                if (response.status === 401) {
                    this.showError('Sessão expirada. Faça login novamente.');
                    return;
                }

                throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log(`✅ ${data.notifications?.length || 0} notificações carregadas`);

            this.notifications = data.notifications || [];
            await this.updateNotificationBadge();
            this.renderNotifications(this.notifications);
            this.retryCount = 0; // Reset retry count on success

        } catch (error) {
            console.error('❌ Erro ao carregar notificações:', error);

            // Tentar novamente se for erro de rede
            if (this.retryCount < this.maxRetries && 
                (error.message.includes('Failed to fetch') || error.message.includes('Network'))) {
                this.retryCount++;
                console.log(`🔄 Tentativa ${this.retryCount}/${this.maxRetries} em 3s...`);
                setTimeout(() => this.loadNotifications(), 3000);
                return;
            }

            this.showError(this.getErrorMessage(error));
        } finally {
            this.isLoading = false;
        }
    }

    async updateNotificationBadge() {
        try {
            const response = await authenticatedFetch('/api/notifications/unread-count');

            if (response.ok) {
                const data = await response.json();
                const unreadCount = data.unread_count || 0;
                console.log(`🔔 ${unreadCount} notificações não lidas`);

                this.updateBadgeVisual(unreadCount);
            } else {
                console.warn('⚠️ Não foi possível atualizar o badge');
            }
        } catch (error) {
            console.error('❌ Erro ao atualizar badge:', error);
        }
    }

    updateBadgeVisual(unreadCount) {
        if (unreadCount > 0) {
            this.notificationBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            this.notificationBadge.style.display = 'flex';
            this.notificationBtn.classList.add('has-new');

            // Adicionar animação para muitas notificações
            if (unreadCount > 5) {
                this.notificationBadge.classList.add('high-count');
            } else {
                this.notificationBadge.classList.remove('high-count');
            }
        } else {
            this.notificationBadge.style.display = 'none';
            this.notificationBtn.classList.remove('has-new');
        }
    }

    renderNotifications(notifications) {
        if (!this.notificationList) {
            console.error('❌ Elemento notificationList não encontrado');
            return;
        }

        if (!notifications || notifications.length === 0) {
            this.notificationList.innerHTML = `
                <div class="no-notifications">
                    <i class="fas fa-bell-slash"></i>
                    <p>Nenhuma notificação</p>
                    <small>As notificações aparecerão aqui</small>
                </div>
            `;
            return;
        }

        this.notificationList.innerHTML = notifications.map(notif => `
            <div class="notification-item ${notif.is_read ? 'read' : 'unread new'}" 
                 data-id="${notif.id}" 
                 data-testid="notification-${notif.id}">
                <div class="notification-content">
                    <div class="notification-title">${this.escapeHtml(notif.title)}</div>
                    <div class="notification-message">${this.escapeHtml(notif.message)}</div>
                    <div class="notification-meta">
                        <span class="notification-time">${this.formatTime(notif.created_at)}</span>
                        ${notif.creator_name ? `<span class="notification-sender">por ${this.escapeHtml(notif.creator_name)}</span>` : ''}
                    </div>
                    ${!notif.is_read ? `
                        <button class="mark-read-btn" data-id="${notif.id}" data-testid="mark-read-${notif.id}">
                            <i class="fas fa-check"></i> Marcar como lida
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');

        // Adicionar eventos aos botões de marcar como lida
        this.notificationList.querySelectorAll('.mark-read-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const notificationId = parseInt(e.target.dataset.id || e.target.closest('.mark-read-btn').dataset.id);
                console.log(`🔔 Clicou em marcar como lida: ${notificationId}`);
                this.markAsRead(notificationId);
            });
        });

        // Adicionar evento de clique nas notificações não lidas
        this.notificationList.querySelectorAll('.notification-item.unread').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('mark-read-btn') && 
                    !e.target.closest('.mark-read-btn')) {
                    const notificationId = parseInt(item.dataset.id);
                    console.log(`🔔 Clicou na notificação: ${notificationId}`);
                    this.markAsRead(notificationId);
                }
            });
        });

        console.log(`✅ Renderizadas ${notifications.length} notificações`);
    }

    async markAsRead(notificationId) {
        try {
            console.log(`🔔 Tentando marcar notificação ${notificationId} como lida...`);

            // Mostrar estado de loading no botão
            this.setButtonLoadingState(notificationId, true);

            // Tentar método PUT primeiro
            let response = await authenticatedFetch(`/api/notifications/${notificationId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ is_read: true })
            });

            // Se der erro 500, tentar o endpoint alternativo POST
            if (!response.ok && response.status === 500) {
                console.log(`🔄 Tentando endpoint alternativo para notificação ${notificationId}...`);
                response = await authenticatedFetch(`/api/notifications/${notificationId}/mark-read`, {
                    method: 'POST'
                });
            }

            if (response.ok) {
                console.log(`✅ Notificação ${notificationId} marcada como lida com sucesso`);

                // Atualizar a lista
                await this.loadNotifications();

                // Feedback visual
                this.showSuccessFeedback(notificationId);

            } else {
                const errorText = await response.text();
                console.error(`❌ Erro HTTP ${response.status} ao marcar como lida:`, errorText);

                let errorMessage = `Erro ${response.status} ao marcar como lida`;
                try {
                    const errorData = JSON.parse(errorText);
                    errorMessage = errorData.detail || errorMessage;
                } catch (e) {
                    // Não é JSON, usar texto original
                }

                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('❌ Erro detalhado ao marcar notificação como lida:', error);
            this.showError('Erro ao marcar como lida: ' + error.message);
        } finally {
            // Remover estado de loading
            this.setButtonLoadingState(notificationId, false);
        }
    }

    async markAllAsRead() {
        try {
            console.log('🔔 Marcando TODAS as notificações como lidas...');

            // Mostrar loading no botão
            this.markAllReadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Marcando...';
            this.markAllReadBtn.disabled = true;

            const response = await authenticatedFetch('/api/notifications/mark-all-read', {
                method: 'PUT'
            });

            if (response.ok) {
                const result = await response.json();
                console.log(`✅ ${result.updated_count} notificações marcadas como lidas`);

                // Atualizar a lista
                await this.loadNotifications();

                // Feedback visual
                this.showSuccessFeedback('all');

            } else {
                const errorText = await response.text();
                console.error(`❌ Erro HTTP ${response.status} ao marcar todas como lidas:`, errorText);
                throw new Error(`Erro ${response.status} ao marcar todas como lidas`);
            }
        } catch (error) {
            console.error('❌ Erro ao marcar todas como lidas:', error);
            this.showError('Erro ao marcar todas como lidas: ' + error.message);
        } finally {
            // Restaurar botão
            this.markAllReadBtn.innerHTML = 'Marcar todas como lidas';
            this.markAllReadBtn.disabled = false;
        }
    }

    setButtonLoadingState(notificationId, isLoading) {
        const button = document.querySelector(`.mark-read-btn[data-id="${notificationId}"]`);
        if (button) {
            if (isLoading) {
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                button.disabled = true;
            } else {
                button.innerHTML = '<i class="fas fa-check"></i> Marcar como lida';
                button.disabled = false;
            }
        }
    }

    showSuccessFeedback(notificationId) {
        if (notificationId === 'all') {
            // Feedback para "marcar todas"
            this.markAllReadBtn.innerHTML = '<i class="fas fa-check"></i> Todas marcadas!';
            this.markAllReadBtn.style.background = 'var(--success)';
            setTimeout(() => {
                this.markAllReadBtn.innerHTML = 'Marcar todas como lidas';
                this.markAllReadBtn.style.background = '';
            }, 2000);
        } else {
            // Feedback para notificação individual
            const notificationItem = document.querySelector(`.notification-item[data-id="${notificationId}"]`);
            if (notificationItem) {
                // Adicionar classe de animação
                notificationItem.classList.add('read');
                notificationItem.classList.remove('unread');

                // Animação no botão
                const markBtn = notificationItem.querySelector('.mark-read-btn');
                if (markBtn) {
                    markBtn.innerHTML = '<i class="fas fa-check"></i> Lida!';
                    markBtn.style.background = 'var(--success)';
                    setTimeout(() => {
                        if (markBtn.parentNode) {
                            markBtn.remove();
                        }
                    }, 1500);
                }
            }
        }
    }

    showLoadingState() {
        if (this.notificationList) {
            this.notificationList.innerHTML = `
                <div class="notification-loading">
                    <div class="loader"></div>
                    <p>Carregando notificações...</p>
                </div>
            `;
        }
    }

    showError(message) {
        console.error('❌ Mostrando erro:', message);

        if (this.notificationList) {
            this.notificationList.innerHTML = `
                <div class="notification-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${this.escapeHtml(message)}</p>
                    <button onclick="window.notificationManager.loadNotifications()" class="btn small">
                        <i class="fas fa-redo"></i> Tentar Novamente
                    </button>
                </div>
            `;
        }
    }

    getErrorMessage(error) {
        if (error.message.includes('Sessão expirada') || error.message.includes('Token de autenticação inválido')) {
            return 'Sessão expirada. Faça login novamente.';
        } else if (error.message.includes('ACCESS_EXPIRED')) {
            return 'Seu acesso expirou. Entre em contato com o administrador.';
        } else if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
            return 'Erro de conexão. Verifique sua internet.';
        } else if (error.message.includes('401')) {
            return 'Não autorizado. Faça login novamente.';
        } else if (error.message.includes('403')) {
            return 'Acesso negado.';
        } else {
            return 'Erro ao carregar notificações: ' + error.message;
        }
    }

    toggleDropdown() {
        if (this.isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    openDropdown() {
        this.notificationDropdown.classList.add('show');
        this.isOpen = true;

        console.log('🔔 Dropdown aberto');

        // Recarregar notificações quando abrir
        this.loadNotifications();

        // Adicionar overlay para mobile
        this.addMobileOverlay();
    }

    closeDropdown() {
        this.notificationDropdown.classList.remove('show');
        this.isOpen = false;

        console.log('🔔 Dropdown fechado');

        // Remover overlay
        this.removeMobileOverlay();
    }

    addMobileOverlay() {
        if (window.innerWidth <= 768) {
            const overlay = document.createElement('div');
            overlay.className = 'notification-overlay show';
            overlay.addEventListener('click', () => this.closeDropdown());
            document.body.appendChild(overlay);
        }
    }

    removeMobileOverlay() {
        const overlay = document.querySelector('.notification-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    showAllNotifications() {
        console.log('🔔 Mostrando todas as notificações...');

        // Verificar se é admin
        if (window.currentUserProfile && window.currentUserProfile.role === 'admin') {
            window.location.href = '/admin-notifications.html';
        } else {
            // Expandir para mostrar mais notificações
            this.loadMoreNotifications();
        }
    }

    async loadMoreNotifications() {
        try {
            console.log('🔔 Carregando mais notificações...');
            const response = await authenticatedFetch('/api/notifications?limit=50');

            if (response.ok) {
                const data = await response.json();
                this.renderNotifications(data.notifications || []);
            }
        } catch (error) {
            console.error('❌ Erro ao carregar mais notificações:', error);
            this.showError('Erro ao carregar mais notificações');
        }
    }

    async checkAdminStatus() {
        try {
            const userProfile = await getCurrentUserProfile();
            if (userProfile && userProfile.role === 'admin' && this.viewAllNotifications) {
                this.viewAllNotifications.textContent = 'Gerenciar Notificações';
                this.viewAllNotifications.href = '/admin-notifications.html';
                console.log('👤 Usuário é admin - mostrando link de gerenciamento');
            }
        } catch (error) {
            console.error('❌ Erro ao verificar status de admin:', error);
        }
    }

    // Utilitários
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatTime(dateString) {
        if (!dateString) return 'Data desconhecida';

        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'Agora mesmo';
            if (diffMins < 60) return `Há ${diffMins} min`;
            if (diffHours < 24) return `Há ${diffHours} h`;
            if (diffDays < 7) return `Há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;

            return date.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        } catch (error) {
            return 'Data inválida';
        }
    }

    // Método para debug
    debug() {
        console.log('🔔 DEBUG NotificationManager:');
        console.log('   - isOpen:', this.isOpen);
        console.log('   - isLoading:', this.isLoading);
        console.log('   - notifications count:', this.notifications.length);
        console.log('   - retryCount:', this.retryCount);
        console.log('   - Elements found:', {
            btn: !!this.notificationBtn,
            badge: !!this.notificationBadge,
            dropdown: !!this.notificationDropdown,
            list: !!this.notificationList
        });
    }
}

// Sistema de inicialização robusto
class NotificationSystem {
    constructor() {
        this.initialized = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.manager = null;
    }

    async initialize() {
        if (this.initialized) {
            console.warn('⚠️ NotificationSystem já inicializado');
            return;
        }

        try {
            console.log('🚀 Inicializando NotificationSystem...');

            // Aguardar autenticação
            await this.waitForAuth();

            // Verificar se usuário está autenticado
            const isAuthenticated = await checkAuth();
            if (!isAuthenticated) {
                console.log('🔔 Usuário não autenticado - notificações não inicializadas');
                return;
            }

            // Aguardar elementos do DOM
            await this.waitForElements();

            // Criar NotificationManager
            this.manager = new NotificationManager();
            this.initialized = true;

            console.log('✅ NotificationSystem inicializado com sucesso');

        } catch (error) {
            console.error('❌ Erro na inicialização do NotificationSystem:', error);

            // Tentar novamente
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`🔄 Tentativa ${this.retryCount}/${this.maxRetries} em 3s...`);
                setTimeout(() => this.initialize(), 3000);
            } else {
                console.error('💥 Falha crítica na inicialização do NotificationSystem');
            }
        }
    }

    async waitForAuth() {
        return new Promise((resolve, reject) => {
            let checks = 0;
            const maxChecks = 50; // 10 segundos máximo

            const checkAuth = () => {
                checks++;

                if (typeof checkAuth !== 'undefined' && typeof authenticatedFetch !== 'undefined') {
                    console.log('✅ Auth.js carregado');
                    resolve();
                    return;
                }

                if (checks >= maxChecks) {
                    reject(new Error('Timeout aguardando auth.js'));
                    return;
                }

                console.log(`⏳ Aguardando auth.js... (${checks}/${maxChecks})`);
                setTimeout(checkAuth, 200);
            };

            checkAuth();
        });
    }

    async waitForElements() {
        return new Promise((resolve, reject) => {
            let checks = 0;
            const maxChecks = 50; // 10 segundos máximo

            const checkElements = () => {
                checks++;

                const elementsExist = 
                    document.getElementById('notificationBtn') && 
                    document.getElementById('notificationDropdown');

                if (elementsExist) {
                    console.log('✅ Elementos do DOM encontrados');
                    resolve();
                    return;
                }

                if (checks >= maxChecks) {
                    reject(new Error('Timeout aguardando elementos do DOM'));
                    return;
                }

                console.log(`⏳ Aguardando elementos do DOM... (${checks}/${maxChecks})`);
                setTimeout(checkElements, 200);
            };

            checkElements();
        });
    }

    getManager() {
        return this.manager;
    }
}

// Inicialização global
const notificationSystem = new NotificationSystem();

document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM carregado - iniciando sistema de notificações...');

    // Iniciar após um delay para garantir que tudo está carregado
    setTimeout(() => {
        notificationSystem.initialize().catch(error => {
            console.error('💥 Falha na inicialização:', error);
        });
    }, 1000);
});

// Torna disponível globalmente para debug
window.notificationSystem = notificationSystem;
window.NotificationManager = NotificationManager;

// Função global para debug
window.debugNotifications = function() {
    if (notificationSystem.getManager()) {
        notificationSystem.getManager().debug();
    } else {
        console.log('❌ NotificationManager não inicializado');
        console.log('💡 Tente: notificationSystem.initialize()');
    }
};

console.log('✅ notification-manager.js carregado - Versão Completa e Corrigida');