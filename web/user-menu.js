// user-menu.js - Gerenciamento do menu do usuário (VERSÃO COMPLETA CORRIGIDA COM DATAS DE EXPIRAÇÃO)
class UserMenu {
    constructor() {
        this.isInitialized = false;
        this.retryCount = 0;
        this.maxRetries = 3;

        this.init();
    }

    async init() {
        if (this.isInitialized) return;

        try {
            console.log('🚀 Inicializando UserMenu...');

            // Aguarda um pouco para garantir que o DOM esteja totalmente carregado
            await this.waitForDOM();

            // Inicializa os elementos
            await this.initializeElements();

            // Carrega as informações do usuário
            await this.loadUserInfo();

            // Configura os event listeners
            this.setupEventListeners();

            // Configura eventos customizados
            this.setupCustomEvents();

            this.isInitialized = true;
            console.log('✅ UserMenu inicializado com sucesso');

        } catch (error) {
            console.error('❌ Erro na inicialização do UserMenu:', error);
            this.retryInitialization();
        }
    }

    async waitForDOM() {
        // Aguarda até que os elementos críticos estejam no DOM
        const maxWaitTime = 5000; // 5 segundos máximo
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
            if (document.getElementById('userMenuBtn') && 
                document.querySelector('.user-name') && 
                document.querySelector('.user-role')) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        throw new Error('Elementos do DOM não carregados dentro do tempo limite');
    }

    async initializeElements() {
        this.userMenuBtn = document.getElementById('userMenuBtn');
        this.userDropdown = document.getElementById('userDropdown');
        this.userAvatar = document.getElementById('userAvatar');
        this.userName = document.querySelector('.user-name');
        this.userRole = document.querySelector('.user-role');
        this.logoutBtn = document.getElementById('logoutBtn');

        if (!this.userMenuBtn || !this.userName || !this.userRole) {
            throw new Error('Elementos essenciais do menu do usuário não encontrados');
        }

        console.log('🔍 Elementos do menu do usuário encontrados:', {
            menuBtn: !!this.userMenuBtn,
            dropdown: !!this.userDropdown,
            avatar: !!this.userAvatar,
            name: !!this.userName,
            role: !!this.userRole,
            logoutBtn: !!this.logoutBtn
        });
    }

    async loadUserInfo() {
        try {
            console.log('🔍 Carregando informações do usuário...');

            // Verifica se está autenticado primeiro
            if (typeof window.checkAuth === 'function') {
                const isAuthenticated = await window.checkAuth();
                if (!isAuthenticated) {
                    console.warn('⚠️ Usuário não autenticado');
                    this.showDefaultUserInfo();
                    return;
                }
            }

            // Tenta obter o perfil do usuário
            let profile;
            if (typeof window.fetchUserProfile === 'function') {
                profile = await window.fetchUserProfile();
            } else if (typeof window.getCurrentUserProfile === 'function') {
                profile = await window.getCurrentUserProfile();
            } else {
                console.warn('⚠️ Nenhuma função de perfil disponível');
                this.showDefaultUserInfo();
                return;
            }

            if (profile) {
                this.updateUserInfo(profile);
                // Carrega informações de grupo após o perfil
                await this.loadGroupInfo();
            } else {
                console.warn('⚠️ Perfil vazio retornado');
                this.showDefaultUserInfo();
            }

        } catch (error) {
            console.error('❌ Erro ao carregar informações do usuário:', error);
            this.showDefaultUserInfo();
        }
    }

    async loadGroupInfo() {
        try {
            console.log('🔍 Carregando informações de grupo...');

            // Se for admin, não precisa carregar informações de grupo
            const profile = await window.fetchUserProfile();
            if (profile && profile.role === 'admin') {
                this.displayGroupInfo({
                    isAdmin: true,
                    groupName: 'Administrador Geral',
                    accessStatus: 'Acesso irrestrito'
                });
                return;
            }

            // Busca informações de acesso do usuário
            let accessInfo = {};
            if (typeof window.getUserAccessStatus === 'function') {
                accessInfo = await window.getUserAccessStatus();
            } else {
                // Fallback: chamada direta à API
                try {
                    const response = await fetch('/api/user/access-status', {
                        headers: {
                            'Authorization': `Bearer ${await this.getAuthToken()}`
                        }
                    });
                    if (response.ok) {
                        accessInfo = await response.json();
                    }
                } catch (error) {
                    console.error('❌ Erro ao buscar status de acesso:', error);
                }
            }

            // LOG PARA DEBUG - VERIFICAR DADOS RECEBIDOS
            console.log('📊 Informações de acesso recebidas:', accessInfo);
            if (accessInfo.active_groups && accessInfo.active_groups.length > 0) {
                console.log('📅 Datas de expiração dos grupos ativos:');
                accessInfo.active_groups.forEach((group, index) => {
                    console.log(`  Grupo ${index + 1}:`, {
                        nome: group.group_name || group.nome,
                        data_expiracao_user: group.data_expiracao_user,
                        data_expiracao: group.data_expiracao,
                        dias_acesso: group.dias_acesso
                    });
                });
            }
            if (accessInfo.expired_groups && accessInfo.expired_groups.length > 0) {
                console.log('📅 Datas de expiração dos grupos expirados:');
                accessInfo.expired_groups.forEach((group, index) => {
                    console.log(`  Grupo ${index + 1}:`, {
                        nome: group.group_name || group.nome,
                        data_expiracao_user: group.data_expiracao_user,
                        data_expiracao: group.data_expiracao,
                        reason: group.reason
                    });
                });
            }

            this.displayGroupInfo(accessInfo);

        } catch (error) {
            console.error('❌ Erro ao carregar informações de grupo:', error);
            this.displayGroupInfo({
                groupName: 'Informação não disponível',
                accessStatus: 'Erro ao carregar'
            });
        }
    }

    async getAuthToken() {
        if (typeof window.getAuthToken === 'function') {
            return await window.getAuthToken();
        }
        return null;
    }

    displayGroupInfo(accessInfo) {
        // Encontra ou cria o elemento de informações do grupo
        let groupInfoElement = this.userDropdown.querySelector('.user-group-info');

        if (!groupInfoElement) {
            groupInfoElement = document.createElement('div');
            groupInfoElement.className = 'user-group-info';
            // Insere antes do primeiro item do dropdown
            const firstItem = this.userDropdown.querySelector('.dropdown-item');
            if (firstItem) {
                this.userDropdown.insertBefore(groupInfoElement, firstItem);
            } else {
                this.userDropdown.appendChild(groupInfoElement);
            }
        }

        let groupHTML = '';

        if (accessInfo.isAdmin) {
            groupHTML = `
                <div class="group-info-admin">
                    <i class="fas fa-crown"></i>
                    <div class="group-details">
                        <div class="group-name">Administrador Geral</div>
                        <div class="access-status admin">Acesso irrestrito</div>
                    </div>
                </div>
            `;
        } else if (accessInfo.active_groups && accessInfo.active_groups.length > 0) {
            const group = accessInfo.active_groups[0]; // Mostra o primeiro grupo ativo

            // CORREÇÃO: Use data_expiracao_user em vez de data_expiracao
            const expirationDate = group.data_expiracao_user || group.data_expiracao;
            const daysLeft = this.calculateDaysLeft(expirationDate);

            groupHTML = `
                <div class="group-info-active">
                    <i class="fas fa-users"></i>
                    <div class="group-details">
                        <div class="group-name">${group.group_name || group.nome || 'Grupo'}</div>
                        <div class="access-status ${daysLeft <= 7 ? 'warning' : 'normal'}">
                            ${this.formatAccessStatus(daysLeft, expirationDate)}
                        </div>
                    </div>
                </div>
            `;
        } else if (accessInfo.expired_groups && accessInfo.expired_groups.length > 0) {
            const group = accessInfo.expired_groups[0];
            const expirationDate = group.data_expiracao_user || group.data_expiracao;

            groupHTML = `
                <div class="group-info-expired">
                    <i class="fas fa-clock"></i>
                    <div class="group-details">
                        <div class="group-name">${group.group_name || group.nome || 'Grupo'}</div>
                        <div class="access-status expired">
                            ${this.formatExpiredStatus(expirationDate)}
                        </div>
                    </div>
                </div>
            `;
        } else {
            groupHTML = `
                <div class="group-info-none">
                    <i class="fas fa-info-circle"></i>
                    <div class="group-details">
                        <div class="group-name">Sem grupo ativo</div>
                        <div class="access-status none">Sem acesso</div>
                    </div>
                </div>
            `;
        }

        groupInfoElement.innerHTML = groupHTML;
    }

    calculateDaysLeft(expirationDate) {
        if (!expirationDate) return 0;

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const expDate = new Date(expirationDate);
            expDate.setHours(0, 0, 0, 0);

            const diffTime = expDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            return diffDays;
        } catch (error) {
            console.error('Erro ao calcular dias restantes:', error);
            return 0;
        }
    }

    formatAccessStatus(daysLeft, expirationDate) {
        if (daysLeft < 0) {
            return this.formatExpiredStatus(expirationDate);
        } else if (daysLeft === 0) {
            return 'Expira hoje';
        } else if (daysLeft === 1) {
            return '1 dia restante';
        } else if (daysLeft <= 7) {
            return `${daysLeft} dias restantes`;
        } else {
            try {
                const expDate = new Date(expirationDate);
                const formattedDate = expDate.toLocaleDateString('pt-BR');
                return `Expira em ${formattedDate}`;
            } catch (error) {
                console.error('Erro ao formatar data:', error);
                return `${daysLeft} dias restantes`;
            }
        }
    }

    // NOVA FUNÇÃO: Formatar status expirado
    formatExpiredStatus(expirationDate) {
        if (!expirationDate) return 'Acesso expirado';

        try {
            const expDate = new Date(expirationDate);
            const formattedDate = expDate.toLocaleDateString('pt-BR');
            return `Expirado em ${formattedDate}`;
        } catch (error) {
            console.error('Erro ao formatar data de expiração:', error);
            return 'Acesso expirado';
        }
    }

    showDefaultUserInfo() {
        console.log('🔄 Mostrando informações padrão do usuário');

        const defaultInfo = {
            name: 'Usuário',
            role: 'user',
            email: 'usuario@exemplo.com'
        };

        this.updateUserInfo(defaultInfo);
    }

    updateUserInfo(profile) {
        try {
            console.log('📝 Atualizando informações do usuário no menu:', {
                name: profile.name || profile.full_name,
                role: profile.role,
                email: profile.email
            });

            // Atualizar nome
            if (this.userName) {
                const displayName = profile.name || profile.full_name || profile.email || 'Usuário';
                this.userName.textContent = displayName;
                this.userName.title = displayName;

                // Aplica a cor baseada no role
                this.applyRoleColor(profile.role);
            }

            // Atualizar função
            if (this.userRole) {
                this.userRole.textContent = this.getRoleDisplayName(profile.role);
                this.userRole.title = this.getRoleDisplayName(profile.role);
            }

            // Atualizar avatar
            if (this.userAvatar) {
                this.updateUserAvatar(profile);
            }

            // Disparar evento de atualização
            this.dispatchProfileUpdated();

        } catch (error) {
            console.error('❌ Erro ao atualizar informações do usuário:', error);
        }
    }

    applyRoleColor(role) {
        // Remove classes de role anteriores
        this.userMenuBtn.classList.remove('role-user', 'role-group_admin', 'role-admin');

        // Adiciona a classe correspondente ao role
        this.userMenuBtn.classList.add(`role-${role}`);

        // Adiciona estilos específicos se necessário
        this.injectRoleStyles();
    }

    injectRoleStyles() {
        // Injeta estilos apenas uma vez
        if (document.querySelector('#user-role-styles')) return;

        const styles = `
            .user-menu-btn.role-user {
                border: 2px solid #16a34a !important;
                box-shadow: 0 0 10px rgba(22, 163, 74, 0.3) !important;
            }

            .user-menu-btn.role-group_admin {
                border: 2px solid #f59e0b !important;
                box-shadow: 0 0 10px rgba(245, 158, 11, 0.3) !important;
            }

            .user-menu-btn.role-admin {
                border: 2px solid #ef4444 !important;
                box-shadow: 0 0 10px rgba(239, 68, 68, 0.3) !important;
            }

            .user-group-info {
                padding: 0.75rem 1rem;
                border-bottom: 1px solid var(--border-dark);
                background: rgba(0, 0, 0, 0.1);
                margin-bottom: 0.5rem;
            }

            body.light-mode .user-group-info {
                border-bottom: 1px solid var(--border-light);
                background: rgba(0, 0, 0, 0.05);
            }

            .group-info-admin,
            .group-info-active,
            .group-info-expired,
            .group-info-none {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                font-size: 0.8rem;
            }

            .group-info-admin i {
                color: #ef4444;
            }

            .group-info-active i {
                color: #16a34a;
            }

            .group-info-expired i {
                color: #f59e0b;
            }

            .group-info-none i {
                color: #6b7280;
            }

            .group-details {
                display: flex;
                flex-direction: column;
                flex: 1;
                min-width: 0;
            }

            .group-name {
                font-weight: 600;
                margin-bottom: 0.1rem;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .access-status {
                font-size: 0.7rem;
                font-weight: 500;
                padding: 0.1rem 0.3rem;
                border-radius: 4px;
                display: inline-block;
                width: fit-content;
                max-width: 100%;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .access-status.admin {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444;
            }

            .access-status.normal {
                background: rgba(22, 163, 74, 0.2);
                color: #16a34a;
            }

            .access-status.warning {
                background: rgba(245, 158, 11, 0.2);
                color: #f59e0b;
            }

            .access-status.expired {
                background: rgba(107, 114, 128, 0.2);
                color: #6b7280;
            }

            .access-status.none {
                background: rgba(107, 114, 128, 0.2);
                color: #6b7280;
            }

            /* Melhorar a visualização em mobile */
            @media (max-width: 768px) {
                .user-group-info {
                    padding: 0.5rem;
                }

                .group-info-admin,
                .group-info-active,
                .group-info-expired,
                .group-info-none {
                    font-size: 0.75rem;
                }

                .access-status {
                    font-size: 0.65rem;
                }
            }
        `;

        const styleSheet = document.createElement('style');
        styleSheet.id = 'user-role-styles';
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    updateUserAvatar(profile) {
        const userName = profile.name || profile.full_name || 'Usuário';
        const initials = this.getUserInitials(userName);

        // Tenta usar avatar personalizado se disponível
        if (profile.avatar_url) {
            const timestamp = new Date().getTime();
            this.userAvatar.src = `${profile.avatar_url}?t=${timestamp}`;
            this.userAvatar.alt = `Avatar de ${userName}`;
            this.userAvatar.onerror = () => {
                // Fallback para avatar padrão se a imagem personalizada falhar
                this.userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=4f46e5&color=fff&bold=true&size=128`;
            };
        } else {
            // Avatar padrão baseado nas iniciais
            this.userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=4f46e5&color=fff&bold=true&size=128`;
            this.userAvatar.alt = `Avatar de ${userName}`;
        }

        // Garantir que o avatar seja visível
        this.userAvatar.style.display = 'block';
        this.userAvatar.style.opacity = '1';
    }

    getUserInitials(name) {
        if (!name || name === 'Usuário') return 'U';

        return name
            .split(' ')
            .map(part => part.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

    getRoleDisplayName(role) {
        const roleNames = {
            'admin': 'Administrador',
            'group_admin': 'Admin de Grupo', 
            'subadmin': 'Subadministrador',
            'user': 'Usuário',
            'default': 'Usuário'
        };

        return roleNames[role] || roleNames.default;
    }

    setupEventListeners() {
        console.log('🔧 Configurando event listeners do menu do usuário...');

        // Toggle do dropdown - CORREÇÃO: usar classe 'active' conforme designer.css
        if (this.userMenuBtn) {
            this.userMenuBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleDropdown();
            });
        }

        // Logout
        if (this.logoutBtn) {
            this.logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        }

        // Fechar dropdown ao clicar fora - CORREÇÃO: usar classe 'active'
        document.addEventListener('click', (e) => {
            if (this.userDropdown && this.userDropdown.classList.contains('active')) {
                if (!this.userMenuBtn.contains(e.target) && !this.userDropdown.contains(e.target)) {
                    this.userDropdown.classList.remove('active');
                }
            }
        });

        // Fechar dropdown com ESC - CORREÇÃO: usar classe 'active'
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.userDropdown && this.userDropdown.classList.contains('active')) {
                this.userDropdown.classList.remove('active');
            }
        });

        console.log('✅ Event listeners configurados');
    }

    toggleDropdown() {
        if (!this.userDropdown) return;

        const isActive = this.userDropdown.classList.contains('active');

        if (isActive) {
            this.userDropdown.classList.remove('active');
        } else {
            this.userDropdown.classList.add('active');
            // Focar no primeiro item do dropdown quando abrir
            const firstItem = this.userDropdown.querySelector('a, button');
            if (firstItem) firstItem.focus();
        }
    }

    setupCustomEvents() {
        console.log('🔧 Configurando eventos customizados...');

        // Atualizar quando o perfil mudar
        document.addEventListener('authStateChanged', () => {
            console.log('🔄 Evento authStateChanged recebido');
            setTimeout(() => {
                this.loadUserInfo();
                this.loadGroupInfo();
            }, 100);
        });

        // Atualizar quando o perfil for atualizado
        document.addEventListener('profileUpdated', () => {
            console.log('🔄 Evento profileUpdated recebido');
            setTimeout(() => {
                this.loadUserInfo();
                this.loadGroupInfo();
            }, 100);
        });

        // Tentar recarregar quando a conexão for restaurada
        window.addEventListener('online', () => {
            console.log('🌐 Conexão restaurada - recarregando informações do usuário');
            setTimeout(() => {
                this.loadUserInfo();
                this.loadGroupInfo();
            }, 500);
        });

        // Subscribe para mudanças de autenticação se disponível
        if (typeof window.subscribeToAuthStateChange === 'function') {
            window.subscribeToAuthStateChange(() => {
                console.log('🔄 Mudança de autenticação detectada via subscribe');
                setTimeout(() => {
                    this.loadUserInfo();
                    this.loadGroupInfo();
                }, 100);
            });
        }
    }

    dispatchProfileUpdated() {
        // Dispara evento para outros componentes saberem que o perfil foi atualizado
        const event = new CustomEvent('userMenuProfileUpdated', {
            detail: { timestamp: new Date().toISOString() }
        });
        document.dispatchEvent(event);
    }

    async handleLogout() {
        try {
            console.log('🚪 Iniciando logout pelo menu do usuário...');

            // Fechar dropdown - CORREÇÃO: usar classe 'active'
            if (this.userDropdown) {
                this.userDropdown.classList.remove('active');
            }

            // Tentar usar a função de logout global
            if (typeof window.signOut === 'function') {
                await window.signOut();
            } else {
                console.warn('⚠️ Função signOut não disponível - usando fallback');
                // Fallback: limpar storage e redirecionar
                localStorage.clear();
                sessionStorage.clear();
                window.location.href = '/login.html';
            }
        } catch (error) {
            console.error('❌ Erro ao fazer logout:', error);
            // Fallback em caso de erro
            window.location.href = '/login.html';
        }
    }

    retryInitialization() {
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            console.log(`🔄 Tentativa ${this.retryCount}/${this.maxRetries} de inicialização...`);
            setTimeout(() => this.init(), 1000 * this.retryCount);
        } else {
            console.error(`❌ Falha após ${this.maxRetries} tentativas de inicialização`);
        }
    }

    // Método público para forçar atualização
    async refresh() {
        console.log('🔄 Forçando atualização do menu do usuário...');
        await this.loadUserInfo();
        await this.loadGroupInfo();
    }
}

// Inicialização automática quando o DOM estiver pronto
function initializeUserMenu() {
    // Só inicializar se os elementos do menu existirem
    if (!document.getElementById('userMenuBtn')) {
        console.log('⏸️ Menu do usuário não encontrado no DOM - aguardando...');
        setTimeout(initializeUserMenu, 1000);
        return;
    }

    console.log('🎯 Inicializando menu do usuário...');
    window.userMenu = new UserMenu();
}

// Estratégias de inicialização
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOMContentLoaded - inicializando menu do usuário');
    setTimeout(initializeUserMenu, 100);
});

// Fallback para páginas carregadas dinamicamente
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log('⚡ DOM já carregado - inicializando menu do usuário');
    setTimeout(initializeUserMenu, 100);
}

// Inicialização manual se necessário
window.initializeUserMenu = initializeUserMenu;

// Export para módulos (se necessário)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserMenu;
}

console.log('✅ user-menu.js carregado - VERSÃO COMPLETA COM DATAS DE EXPIRAÇÃO');