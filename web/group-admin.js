// group-admin.js - Gerenciamento de Subadministradores (VERSÃO FINAL OTIMIZADA)
class GroupAdminManager {
    constructor() {
        // Prevenir múltiplas instâncias
        if (window.groupAdminManagerInstance) {
            return window.groupAdminManagerInstance;
        }
        window.groupAdminManagerInstance = this;

        this.groupAdmins = [];
        this.allUsers = [];
        this.allGroups = [];
        this.currentUser = null;
        this.isLoading = false;
        this.initialized = false;
        
        console.log('GroupAdminManager instanciado');
        this.init();
    }

    async init() {
        if (this.initialized) {
            console.log('GroupAdminManager já inicializado');
            return;
        }

        console.log('Inicializando GroupAdminManager...');
        
        try {
            await this.checkAuth();
            console.log('Auth verificado, carregando dados...');
            await this.loadData();
            console.log('Dados carregados, configurando UI...');
            this.setupEventListeners();
            this.renderGroupAdmins();
            
            this.initialized = true;
            console.log('Inicialização completa');
        } catch (error) {
            console.error('Erro na inicialização:', error);
        }
    }

    async checkAuth() {
        // Se já temos o usuário atual, não precisamos verificar novamente
        if (this.currentUser) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                console.log('Nenhum token encontrado, redirecionando para login');
                window.location.href = 'login.html';
                return;
            }

            // Usar a função do auth.js se disponível
            let response;
            if (typeof authenticatedFetch === 'function') {
                response = await authenticatedFetch('/api/users/me');
            } else {
                response = await fetch('/api/users/me', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            }

            if (response.status === 401) {
                console.log('Token inválido, tentando recuperar...');
                if (typeof recoverToken === 'function') {
                    const newToken = await recoverToken();
                    if (newToken) {
                        return await this.checkAuth();
                    }
                }
                throw new Error('Sessão expirada');
            }

            if (!response.ok) {
                if (response.status === 403) {
                    this.showError('Acesso negado. Você não tem permissão para acessar esta página.');
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 3000);
                    return;
                }
                throw new Error('Não autenticado');
            }

            const userData = await response.json();
            this.currentUser = userData;
            
            // Verificar se é admin
            if (userData.role !== 'admin') {
                this.showError('Acesso negado. Apenas administradores podem gerenciar subadministradores.');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 3000);
                return;
            }

            this.updateUserInfo(userData);
        } catch (error) {
            console.error('Erro de autenticação:', error);
            if (typeof handleAuthError === 'function') {
                await handleAuthError();
            } else {
                localStorage.removeItem('token');
                window.location.href = 'login.html';
            }
            throw error;
        }
    }

    updateUserInfo(userData) {
        const userNameElement = document.getElementById('userName');
        const userRoleElement = document.getElementById('userRole');
        const userAvatarElement = document.getElementById('userAvatar');
        
        if (userNameElement) userNameElement.textContent = userData.full_name || 'Usuário';
        if (userRoleElement) userRoleElement.textContent = this.formatRole(userData.role);
        
        if (userData.avatar_url && userAvatarElement) {
            userAvatarElement.src = userData.avatar_url;
        } else if (userAvatarElement) {
            const userName = userData.full_name || 'U';
            userAvatarElement.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=4f46e5&color=fff`;
        }
    }

    formatRole(role) {
        const roles = {
            'admin': 'Administrador',
            'user': 'Usuário',
            'group_admin': 'Subadministrador'
        };
        return roles[role] || role;
    }

    async loadData() {
        if (this.isLoading) {
            console.log('Carregamento já em andamento...');
            return;
        }

        this.isLoading = true;
        this.showLoadingState();

        try {
            await Promise.all([
                this.loadUsers(),
                this.loadGroups(),
                this.loadGroupAdmins()
            ]);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            this.showError('Erro ao carregar dados. Tente recarregar a página.');
        } finally {
            this.isLoading = false;
            this.hideLoadingState();
        }
    }

    async makeAuthenticatedRequest(url, options = {}) {
        try {
            // Verificar token antes de cada requisição
            if (typeof validateToken === 'function') {
                const isValid = await validateToken();
                if (!isValid) {
                    throw new Error('Token inválido');
                }
            }

            const token = localStorage.getItem('token');
            const defaultHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };

            const finalOptions = {
                ...options,
                headers: { ...defaultHeaders, ...options.headers }
            };

            const response = await fetch(url, finalOptions);

            // Se receber 401, tentar recuperar o token e repetir a requisição
            if (response.status === 401) {
                console.log('Erro 401, tentando recuperar token...');
                
                if (typeof recoverToken === 'function') {
                    const newToken = await recoverToken();
                    if (newToken) {
                        // Atualizar headers com novo token
                        finalOptions.headers.Authorization = `Bearer ${newToken}`;
                        return await fetch(url, finalOptions);
                    }
                }
                
                throw new Error('Sessão expirada');
            }

            return response;
        } catch (error) {
            console.error('Erro na requisição autenticada:', error);
            throw error;
        }
    }

    async loadUsers() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/users');

            if (response.ok) {
                this.allUsers = await response.json();
                this.populateUserSelect();
            } else {
                throw new Error('Falha ao carregar usuários');
            }
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            this.showError('Erro ao carregar lista de usuários: ' + error.message);
        }
    }

    async loadGroups() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/groups');

            if (response.ok) {
                this.allGroups = await response.json();
                this.populateGroupsSelect();
            } else {
                throw new Error('Falha ao carregar grupos');
            }
        } catch (error) {
            console.error('Erro ao carregar grupos:', error);
            this.showError('Erro ao carregar lista de grupos: ' + error.message);
        }
    }

    async loadGroupAdmins() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/group-admin');

            console.log('Resposta do /api/group-admin:', response);

            if (response.ok) {
                this.groupAdmins = await response.json();
                this.renderGroupAdmins();
            } else if (response.status === 403) {
                this.showError('Você não tem permissão para gerenciar subadministradores.');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 3000);
            } else {
                throw new Error('Falha ao carregar subadministradores');
            }
        } catch (error) {
            console.error('Erro ao carregar subadministradores:', error);
            this.showError('Erro ao carregar lista de subadministradores: ' + error.message);
        }
    }

    populateUserSelect() {
        const userSelect = document.getElementById('userSelect');
        if (!userSelect) return;
        
        userSelect.innerHTML = '<option value="">Selecione um usuário</option>';
        
        if (this.allUsers.length === 0) {
            userSelect.innerHTML = '<option value="">Nenhum usuário disponível</option>';
            return;
        }
        
        // Filtrar apenas usuários que não são admin e não são já subadmins
        const availableUsers = this.allUsers.filter(user => 
            user.role !== 'admin' && 
            !this.groupAdmins.some(admin => admin.user_id === user.id)
        );

        if (availableUsers.length === 0) {
            userSelect.innerHTML = '<option value="">Nenhum usuário disponível</option>';
            return;
        }

        availableUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.full_name} (${user.email})`;
            userSelect.appendChild(option);
        });
    }

    populateGroupsSelect(selectElement = null) {
        const targetSelect = selectElement || document.getElementById('groupsSelect');
        if (!targetSelect) return;
        
        targetSelect.innerHTML = '';
        
        if (this.allGroups.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Nenhum grupo disponível';
            targetSelect.appendChild(option);
            return;
        }
        
        this.allGroups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = `${group.nome} (${group.dias_acesso} dias)`;
            targetSelect.appendChild(option);
        });
    }

    setupEventListeners() {
        console.log('Configurando event listeners...');
        
        // Botão de adicionar subadmin
        const addBtn = document.getElementById('addGroupAdminBtn');
        if (addBtn) {
            addBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.addGroupAdmin();
            });
        } else {
            console.error('Botão addGroupAdminBtn não encontrado');
        }

        // Formulário de editar subadmin
        const editForm = document.getElementById('editGroupAdminForm');
        if (editForm) {
            editForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.updateGroupAdmin();
            });
        }

        // Fechar modal
        document.querySelectorAll('.close-modal').forEach(button => {
            button.addEventListener('click', () => {
                this.closeEditModal();
            });
        });

        // Fechar modal ao clicar fora
        const modal = document.getElementById('editGroupAdminModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.id === 'editGroupAdminModal') {
                    this.closeEditModal();
                }
            });
        }

        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }

        // ESC para fechar modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeEditModal();
            }
        });

        console.log('Event listeners configurados');
    }

    async addGroupAdmin() {
        try {
            const userSelect = document.getElementById('userSelect');
            const groupsSelect = document.getElementById('groupsSelect');
            
            if (!userSelect || !groupsSelect) {
                this.showError('Elementos do formulário não encontrados');
                return;
            }
            
            const userId = userSelect.value;
            const groupIds = Array.from(groupsSelect.selectedOptions).map(option => parseInt(option.value));

            if (!userId) {
                this.showError('Por favor, selecione um usuário');
                return;
            }

            if (groupIds.length === 0) {
                this.showError('Por favor, selecione pelo menos um grupo');
                return;
            }

            const response = await this.makeAuthenticatedRequest('/api/group-admin', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: userId,
                    group_ids: groupIds
                })
            });

            if (response.ok) {
                this.showSuccess('Subadministrador designado com sucesso!');
                // Limpar seleções
                userSelect.value = '';
                Array.from(groupsSelect.options).forEach(option => option.selected = false);
                await this.loadData();
            } else {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Erro ao designar subadministrador');
            }
        } catch (error) {
            console.error('Erro ao adicionar subadministrador:', error);
            this.showError('Erro ao designar subadministrador: ' + error.message);
        }
    }

    openEditModal(userId) {
        const admin = this.groupAdmins.find(admin => admin.user_id === userId);
        if (!admin) {
            this.showError('Subadministrador não encontrado');
            return;
        }

        document.getElementById('editUserId').value = admin.user_id;
        
        // Popular select de grupos no modal
        this.populateGroupsSelect(document.getElementById('editGroupsSelect'));
        
        // Selecionar os grupos atuais
        const editGroupsSelect = document.getElementById('editGroupsSelect');
        if (admin.group_ids && Array.isArray(admin.group_ids)) {
            admin.group_ids.forEach(groupId => {
                const option = Array.from(editGroupsSelect.options).find(opt => parseInt(opt.value) === groupId);
                if (option) option.selected = true;
            });
        }

        document.getElementById('editGroupAdminModal').style.display = 'block';
    }

    closeEditModal() {
        const modal = document.getElementById('editGroupAdminModal');
        if (modal) modal.style.display = 'none';
        
        const form = document.getElementById('editGroupAdminForm');
        if (form) form.reset();
    }

    async updateGroupAdmin() {
        try {
            const userId = document.getElementById('editUserId').value;
            const groupIds = Array.from(document.getElementById('editGroupsSelect').selectedOptions)
                .map(option => parseInt(option.value));

            if (groupIds.length === 0) {
                this.showError('Por favor, selecione pelo menos um grupo');
                return;
            }

            const response = await this.makeAuthenticatedRequest(`/api/group-admin/${userId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    group_ids: groupIds
                })
            });

            if (response.ok) {
                this.showSuccess('Subadministrador atualizado com sucesso!');
                this.closeEditModal();
                await this.loadData();
            } else {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Erro ao atualizar subadministrador');
            }
        } catch (error) {
            console.error('Erro ao atualizar subadministrador:', error);
            this.showError('Erro ao atualizar subadministrador: ' + error.message);
        }
    }

    async deleteGroupAdmin(userId) {
        if (!confirm('Tem certeza que deseja remover este subadministrador? Esta ação não pode ser desfeita.')) {
            return;
        }

        try {
            const response = await this.makeAuthenticatedRequest(`/api/group-admin/${userId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showSuccess('Subadministrador removido com sucesso!');
                await this.loadData();
            } else {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Erro ao remover subadministrador');
            }
        } catch (error) {
            console.error('Erro ao remover subadministrador:', error);
            this.showError('Erro ao remover subadministrador: ' + error.message);
        }
    }

    renderGroupAdmins() {
        const tbody = document.querySelector('#groupAdminsTable tbody');
        
        if (!tbody) {
            console.error('Elemento tbody não encontrado');
            return;
        }
        
        if (this.groupAdmins.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        <i class="fas fa-user-shield"></i>
                        <h4>Nenhum subadministrador designado</h4>
                        <p>Comece designando um usuário como subadministrador</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.groupAdmins.map(admin => {
            const groupNames = admin.group_names && Array.isArray(admin.group_names) 
                ? admin.group_names 
                : [];
                
            return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="user-avatar-small">
                            ${admin.user_name ? admin.user_name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div>
                            <strong>${admin.user_name || 'N/A'}</strong>
                        </div>
                    </div>
                </td>
                <td>${admin.user_email || 'N/A'}</td>
                <td>
                    <div class="groups-badges">
                        ${groupNames.map(name => `
                            <span class="group-badge">
                                <i class="fas fa-layer-group"></i>
                                ${name}
                            </span>
                        `).join('')}
                        ${groupNames.length === 0 ? 
                            '<span class="group-badge" style="background: rgba(107, 114, 128, 0.1); color: var(--muted-dark);">Nenhum grupo</span>' : ''}
                    </div>
                </td>
                <td>${admin.created_at ? new Date(admin.created_at).toLocaleDateString('pt-BR') : 'N/A'}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn outline edit-admin" data-user-id="${admin.user_id}">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="btn danger delete-admin" data-user-id="${admin.user_id}">
                            <i class="fas fa-trash"></i> Remover
                        </button>
                    </div>
                </td>
            </tr>
        `}).join('');

        // Adicionar event listeners aos botões
        tbody.querySelectorAll('.edit-admin').forEach(button => {
            button.addEventListener('click', (e) => {
                const userId = e.target.closest('button').dataset.userId;
                this.openEditModal(userId);
            });
        });

        tbody.querySelectorAll('.delete-admin').forEach(button => {
            button.addEventListener('click', (e) => {
                const userId = e.target.closest('button').dataset.userId;
                this.deleteGroupAdmin(userId);
            });
        });
    }

    showLoadingState() {
        // Implementar indicador de carregamento se necessário
        const tbody = document.querySelector('#groupAdminsTable tbody');
        if (tbody && !tbody.querySelector('.loading-state')) {
            tbody.innerHTML = `
                <tr class="loading-state">
                    <td colspan="5" style="text-align: center; padding: 2rem;">
                        <div class="loading-spinner"></div>
                        <p>Carregando subadministradores...</p>
                    </td>
                </tr>
            `;
        }
    }

    hideLoadingState() {
        // Remover indicador de carregamento se necessário
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        // Criar elemento de notificação
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            border-radius: 8px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideInRight 0.3s ease;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;

        // Adicionar estilos básicos se não existirem
        if (!document.querySelector('#notificationStyles')) {
            const style = document.createElement('style');
            style.id = 'notificationStyles';
            style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOutRight {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
                .loading-spinner {
                    border: 3px solid #f3f3f3;
                    border-top: 3px solid #3498db;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 1rem;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .empty-state {
                    text-align: center;
                    padding: 3rem 1rem;
                    color: var(--muted-dark);
                }
                .empty-state i {
                    font-size: 3rem;
                    margin-bottom: 1rem;
                    opacity: 0.5;
                }
                .empty-state h4 {
                    margin: 0 0 0.5rem 0;
                    font-weight: 600;
                }
                .empty-state p {
                    margin: 0;
                    opacity: 0.8;
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        // Remover após 5 segundos
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }

    logout() {
        if (typeof signOut === 'function') {
            signOut();
        } else {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        }
    }

    // Método para forçar recarregamento dos dados
    async refresh() {
        await this.loadData();
    }

    // Método para limpar dados (útil para logout)
    clearData() {
        this.groupAdmins = [];
        this.allUsers = [];
        this.allGroups = [];
        this.currentUser = null;
        this.initialized = false;
    }
}

// Inicializar quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM carregado, inicializando GroupAdminManager...');
    new GroupAdminManager();
});

// Exportar para uso global (útil para debugging)
window.GroupAdminManager = GroupAdminManager;
