// group-admin.js - Gerenciamento de Subadministradores (CORRIGIDO)

class GroupAdminManager {
    constructor() {
        this.groupAdmins = [];
        this.allUsers = [];
        this.allGroups = [];
        this.init();
    }

    async init() {
        console.log('Inicializando GroupAdminManager...');
        await this.checkAuth();
        console.log('Auth verificado, carregando dados...');
        await this.loadData();
        console.log('Dados carregados, configurando UI...');
        this.setupEventListeners();
        this.renderGroupAdmins();
        console.log('Inicialização completa');
    }

    async checkAuth() {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        try {
            const response = await fetch('/api/users/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Não autenticado');
            }

            const userData = await response.json();
            
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
            window.location.href = 'login.html';
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
            'subadmin': 'Subadministrador'
        };
        return roles[role] || role;
    }

    async loadData() {
        try {
            await Promise.all([
                this.loadUsers(),
                this.loadGroups(),
                this.loadGroupAdmins()
            ]);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            this.showError('Erro ao carregar dados. Tente recarregar a página.');
        }
    }

    async loadUsers() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/users', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                this.allUsers = await response.json();
                this.populateUserSelect();
            } else {
                throw new Error('Falha ao carregar usuários');
            }
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            this.showError('Erro ao carregar lista de usuários');
        }
    }

    async loadGroups() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/groups', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                this.allGroups = await response.json();
                this.populateGroupsSelect();
            } else {
                throw new Error('Falha ao carregar grupos');
            }
        } catch (error) {
            console.error('Erro ao carregar grupos:', error);
            this.showError('Erro ao carregar lista de grupos');
        }
    }

    async loadGroupAdmins() {
        try {
            const token = localStorage.getItem('token');
            // CORREÇÃO: Usar a rota correta do backend
            const response = await fetch('/api/group-admin', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                this.groupAdmins = await response.json();
                this.renderGroupAdmins();
            } else {
                throw new Error('Falha ao carregar subadministradores');
            }
        } catch (error) {
            console.error('Erro ao carregar subadministradores:', error);
            this.showError('Erro ao carregar lista de subadministradores');
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
        // Botão de adicionar subadmin
        const addBtn = document.getElementById('addGroupAdminBtn');
        if (addBtn) {
            addBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.addGroupAdmin();
            });
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
    }

    async addGroupAdmin() {
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

        try {
            const token = localStorage.getItem('token');
            // CORREÇÃO: Usar a rota correta
            const response = await fetch('/api/group-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    user_id: userId,
                    group_ids: groupIds
                })
            });

            if (response.ok) {
                this.showSuccess('Subadministrador designado com sucesso!');
                // Limpar seleções
                userSelect.value = '';
                groupsSelect.selectedIndex = -1;
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
        const userId = document.getElementById('editUserId').value;
        const groupIds = Array.from(document.getElementById('editGroupsSelect').selectedOptions)
            .map(option => parseInt(option.value));

        if (groupIds.length === 0) {
            this.showError('Por favor, selecione pelo menos um grupo');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            // CORREÇÃO: Usar a rota correta
            const response = await fetch(`/api/group-admin/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
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
            const token = localStorage.getItem('token');
            // CORREÇÃO: Usar a rota correta
            const response = await fetch(`/api/group-admin/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
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
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;

        // Adicionar estilos básicos se não existirem
        if (!document.querySelector('.notification')) {
            const style = document.createElement('style');
            style.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 12px 20px;
                    border-radius: 8px;
                    color: white;
                    z-index: 10000;
                    animation: slideInRight 0.3s ease;
                }
                .notification.success { background: #10b981; }
                .notification.error { background: #ef4444; }
                .notification.info { background: #3b82f6; }
                .notification-content {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOutRight {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
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
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    }
}

// Inicializar quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    new GroupAdminManager();
});
