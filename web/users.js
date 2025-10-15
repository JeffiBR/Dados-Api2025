// users.js - Gerenciamento de usuários - Versão Corrigida
document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DA UI ---
    const tableBody = document.getElementById('usersTableBody');
    const saveButton = document.getElementById('saveUserBtn');
    const cancelButton = document.getElementById('cancelButton');
    const formTitle = document.getElementById('formTitle');
    const userIdInput = document.getElementById('userId');
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const roleSelect = document.getElementById('role');
    const permissionsContainer = document.getElementById('permissions-container');

    // Permissões disponíveis no sistema
    const availablePermissions = [
        { key: 'search', name: 'Busca', description: 'Permite pesquisar produtos e comparar preços entre diferentes mercados.', category: 'analise', icon: 'fa-search' },
        { key: 'compare', name: 'Comparador', description: 'Acesso à ferramenta de comparação de preços e histórico de variações.', category: 'analise', icon: 'fa-chart-bar' },
        { key: 'dashboard', name: 'Dashboard', description: 'Visualização de métricas e relatórios analíticos do sistema.', category: 'analise', icon: 'fa-chart-line' },
        { key: 'baskets', name: 'Cesta Básica', description: 'Acesso à funcionalidade de montar e gerenciar a cesta básica de produtos.', category: 'analise', icon: 'fa-shopping-basket' },
        { key: 'coleta', name: 'Coleta', description: 'Executar e gerenciar processos de coleta de dados dos mercados.', category: 'administracao', icon: 'fa-database' },
        { key: 'collections', name: 'Histórico', description: 'Acesso ao histórico de coletas e dados armazenados no sistema.', category: 'administracao', icon: 'fa-history' },
        { key: 'product_log', name: 'Log de Produtos', description: 'Visualizar logs e alterações realizadas nos produtos do sistema.', category: 'administracao', icon: 'fa-file-alt' },
        { key: 'user_logs', name: 'Logs de Usuários', description: 'Permite visualizar atividades e registros de ações realizadas pelos usuários do sistema.', category: 'administracao', icon: 'fa-user-clock' },
        { key: 'prune', name: 'Limpeza', description: 'Executar limpeza e manutenção dos dados do sistema.', category: 'administracao', icon: 'fa-broom' },
        { key: 'markets', name: 'Mercados', description: 'Gerenciar mercados cadastrados e suas configurações.', category: 'configuracao', icon: 'fa-store' },
        { key: 'users', name: 'Gerenciar Usuários', description: 'Criar, editar e gerenciar usuários e suas permissões no sistema.', category: 'configuracao', icon: 'fa-users-cog' }
    ];

    // --- INICIALIZAÇÃO ---
    initializePermissionsGrid();
    loadUsers();

    // --- LÓGICA DE NEGÓCIO ---

    function initializePermissionsGrid() {
        permissionsContainer.innerHTML = '';
        
        availablePermissions.forEach(permission => {
            const permissionCard = document.createElement('div');
            permissionCard.className = 'permission-card';
            permissionCard.dataset.permission = permission.key;
            
            permissionCard.innerHTML = `
                <div class="permission-header">
                    <div class="permission-icon">
                        <i class="fas ${permission.icon}"></i>
                    </div>
                    <div class="permission-info">
                        <div class="permission-name">${permission.name}</div>
                        <div class="permission-description">${permission.description}</div>
                    </div>
                </div>
                <span class="category-indicator ${permission.category}">${getCategoryName(permission.category)}</span>
                <div class="permission-checkbox">
                    <i class="fas fa-check"></i>
                </div>
            `;
            
            permissionCard.addEventListener('click', () => {
                if (roleSelect.value === 'user') {
                    permissionCard.classList.toggle('selected');
                    updateCheckboxVisibility();
                }
            });
            
            permissionsContainer.appendChild(permissionCard);
        });
        updateCheckboxVisibility();
    }

    function updateCheckboxVisibility() {
        const permissionCards = permissionsContainer.querySelectorAll('.permission-card');
        permissionCards.forEach(card => {
            const checkbox = card.querySelector('.permission-checkbox');
            if (card.classList.contains('selected')) {
                checkbox.style.opacity = '1';
                checkbox.style.transform = 'scale(1)';
            } else {
                checkbox.style.opacity = '0';
                checkbox.style.transform = 'scale(0)';
            }
        });
    }

    function getCategoryName(category) {
        const categories = {
            'analise': 'Análise',
            'administracao': 'Administração',
            'configuracao': 'Configuração'
        };
        return categories[category] || category;
    }

    // Função para obter as permissões selecionadas
    const getSelectedPermissions = () => {
        return Array.from(permissionsContainer.querySelectorAll('.permission-card'))
            .filter(card => card.classList.contains('selected'))
            .map(card => card.dataset.permission);
    };

    // Função para definir as permissões selecionadas
    const setSelectedPermissions = (permissions) => {
        permissionsContainer.querySelectorAll('.permission-card').forEach(card => {
            const hasPermission = permissions.includes(card.dataset.permission);
            card.classList.toggle('selected', hasPermission);
        });
        updateCheckboxVisibility();
    };

    // Atualizar visibilidade das permissões baseado no nível de acesso
    roleSelect.addEventListener('change', () => {
        updatePermissionsVisibility();
    });

    function updatePermissionsVisibility() {
        const isUser = roleSelect.value === 'user';
        permissionsContainer.style.opacity = isUser ? '1' : '0.6';
        permissionsContainer.style.pointerEvents = isUser ? 'all' : 'none';
        
        if (!isUser) {
            setSelectedPermissions([]);
        }
    }

    const loadUsers = async () => {
        try {
            console.log('Carregando usuários...');
            const response = await authenticatedFetch('/api/users');
            
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            
            const users = await response.json();
            console.log('Usuários carregados:', users);
            renderUsersTable(users);
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            showAlert('Não foi possível carregar a lista de usuários.', 'error');
            // Mostrar dados de exemplo para debug
            renderUsersTable([]);
        }
    };

    function renderUsersTable(users) {
        if (!tableBody) {
            console.error('Elemento usersTableBody não encontrado');
            return;
        }

        tableBody.innerHTML = '';
        
        if (!users || users.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        <div class="empty-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <h3>Nenhum usuário cadastrado</h3>
                        <p>Comece adicionando um novo usuário ao sistema.</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        users.forEach(user => {
            const row = document.createElement('tr');
            row.dataset.user = JSON.stringify(user);

            const permissionsText = formatPermissionsForDisplay(user.allowed_pages, user.role);

            row.innerHTML = `
                <td>
                    <div class="user-info-cell">
                        <div class="user-avatar-small">
                            ${user.avatar_url ? 
                                `<img src="${user.avatar_url}" alt="${user.full_name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : 
                                ''
                            }
                            <div class="avatar-placeholder" style="${user.avatar_url ? 'display:none' : ''}">
                                ${getInitials(user.full_name)}
                            </div>
                        </div>
                        <div class="user-details">
                            <div class="user-name">${user.full_name || 'N/A'}</div>
                            <div class="user-email">${user.email || 'N/A'}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="password-display">
                        <span class="pwd-hidden">••••••••</span>
                        <button class="btn-icon view-pwd" title="Visualizar senha" onclick="togglePassword(this)">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
                <td>
                    <span class="role-badge ${user.role}">${getRoleDisplayName(user.role)}</span>
                </td>
                <td>
                    <div class="permissions-preview">
                        ${permissionsText}
                    </div>
                </td>
                <td class="actions">
                    <button class="btn-icon edit-btn" title="Editar usuário">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon delete-btn" title="Excluir usuário">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });

        // Adicionar event listeners para os botões de edição e exclusão
        addTableEventListeners();
    }

    function addTableEventListeners() {
        tableBody.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const row = this.closest('tr');
                const user = JSON.parse(row.dataset.user);
                populateFormForEdit(user);
            });
        });

        tableBody.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const row = this.closest('tr');
                const user = JSON.parse(row.dataset.user);
                deleteUser(user.id, user.full_name);
            });
        });
    }

    // Função global para alternar visibilidade da senha
    window.togglePassword = function(button) {
        const passwordDisplay = button.closest('.password-display');
        const hiddenSpan = passwordDisplay.querySelector('.pwd-hidden');
        const icon = button.querySelector('i');
        
        if (hiddenSpan.textContent === '••••••••') {
            hiddenSpan.textContent = 'senha123'; // Senha padrão ou você pode buscar do usuário
            icon.className = 'fas fa-eye-slash';
            button.title = 'Ocultar senha';
        } else {
            hiddenSpan.textContent = '••••••••';
            icon.className = 'fas fa-eye';
            button.title = 'Visualizar senha';
        }
    };

    function getInitials(name) {
        if (!name) return 'U';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    }

    function getRoleDisplayName(role) {
        const roles = {
            'admin': 'Admin Geral',
            'group_admin': 'Admin de Grupo',
            'user': 'Usuário'
        };
        return roles[role] || role;
    }

    function formatPermissionsForDisplay(permissions, role) {
        if (role === 'admin' || role === 'group_admin') {
            return '<span class="all-permissions">Todas as permissões</span>';
        }
        
        if (!permissions || permissions.length === 0) {
            return '<span class="no-permissions">Nenhuma permissão</span>';
        }
        
        if (permissions.length <= 3) {
            return permissions.map(perm => {
                const permissionInfo = availablePermissions.find(p => p.key === perm);
                return permissionInfo ? 
                    `<span class="permission-tag">${permissionInfo.name}</span>` : 
                    `<span class="permission-tag">${perm}</span>`;
            }).join('');
        }
        
        const firstThree = permissions.slice(0, 3).map(perm => {
            const permissionInfo = availablePermissions.find(p => p.key === perm);
            return permissionInfo ? 
                `<span class="permission-tag">${permissionInfo.name}</span>` : 
                `<span class="permission-tag">${perm}</span>`;
        }).join('');
        
        return `${firstThree}<span class="more-permissions">+${permissions.length - 3}</span>`;
    }

    const resetForm = () => {
        formTitle.textContent = 'Adicionar Novo Usuário';
        userIdInput.value = '';
        fullNameInput.value = '';
        emailInput.value = '';
        passwordInput.value = '';
        emailInput.disabled = false;
        passwordInput.disabled = false;
        passwordInput.placeholder = 'Obrigatório para novos usuários';
        roleSelect.value = 'user';
        setSelectedPermissions([]);
        updatePermissionsVisibility();
        saveButton.innerHTML = '<i class="fas fa-user-plus"></i> Criar Usuário';
        saveButton.className = 'btn btn-primary btn-create';
        cancelButton.style.display = 'none';
    };

    const populateFormForEdit = (user) => {
        formTitle.textContent = `Editando: ${user.full_name}`;
        userIdInput.value = user.id;
        fullNameInput.value = user.full_name || '';
        emailInput.value = user.email || '';
        emailInput.disabled = true;
        passwordInput.value = '';
        passwordInput.placeholder = 'Deixe em branco para manter a senha atual';
        passwordInput.disabled = false;
        roleSelect.value = user.role || 'user';
        
        setSelectedPermissions(user.allowed_pages || []);
        updatePermissionsVisibility();
        
        saveButton.innerHTML = '<i class="fas fa-save"></i> Atualizar Usuário';
        saveButton.className = 'btn btn-primary btn-update';
        cancelButton.style.display = 'inline-flex';
        
        // Scroll suave para o topo
        document.querySelector('.form-container').scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    };

    const saveUser = async () => {
        const id = userIdInput.value;
        const full_name = fullNameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const role = roleSelect.value;
        
        const allowed_pages = (role === 'admin' || role === 'group_admin') ? [] : getSelectedPermissions();

        // Validações
        if (!full_name) {
            showAlert('Nome completo é obrigatório.', 'error');
            fullNameInput.focus();
            return;
        }

        const isUpdating = !!id;
        
        if (!isUpdating) {
            if (!email) {
                showAlert('Email é obrigatório para novos usuários.', 'error');
                emailInput.focus();
                return;
            }
            if (!password) {
                showAlert('Senha é obrigatória para novos usuários.', 'error');
                passwordInput.focus();
                return;
            }
        }

        if (!isUpdating && password.length < 6) {
            showAlert('A senha deve ter pelo menos 6 caracteres.', 'error');
            passwordInput.focus();
            return;
        }

        const url = isUpdating ? `/api/users/${id}` : '/api/users';
        const method = isUpdating ? 'PUT' : 'POST';
        
        let requestBody;
        if (isUpdating) {
            requestBody = { full_name, role, allowed_pages };
            // Incluir senha apenas se for fornecida
            if (password) {
                requestBody.password = password;
            }
        } else {
            requestBody = { email, password, full_name, role, allowed_pages };
        }

        const originalButtonText = saveButton.innerHTML;
        saveButton.disabled = true;
        saveButton.innerHTML = isUpdating ? 
            '<i class="fas fa-spinner fa-spin"></i> Atualizando...' : 
            '<i class="fas fa-spinner fa-spin"></i> Criando...';

        try {
            const response = await authenticatedFetch(url, { 
                method, 
                body: JSON.stringify(requestBody),
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Erro ${response.status}: ${response.statusText}`);
            }
            
            showAlert(`✅ Usuário ${isUpdating ? 'atualizado' : 'criado'} com sucesso!`, 'success');
            resetForm();
            await loadUsers();
        } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            showAlert(`❌ Erro: ${error.message}`, 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.innerHTML = originalButtonText;
        }
    };

    const deleteUser = async (id, userName) => {
        if (!confirm(`Tem certeza que deseja excluir o usuário "${userName}"?\n\nEsta ação não pode ser desfeita.`)) {
            return;
        }

        try {
            const response = await authenticatedFetch(`/api/users/${id}`, { 
                method: 'DELETE' 
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Falha ao excluir o usuário.');
            }
            
            showAlert('✅ Usuário excluído com sucesso!', 'success');
            await loadUsers();
        } catch (error) {
            console.error('Erro ao excluir usuário:', error);
            showAlert(`❌ ${error.message}`, 'error');
        }
    };

    // Sistema de alertas
    function showAlert(message, type = 'info') {
        // Remove alertas existentes
        const existingAlerts = document.querySelectorAll('.custom-alert');
        existingAlerts.forEach(alert => alert.remove());
        
        const alert = document.createElement('div');
        alert.className = `custom-alert alert-${type}`;
        alert.innerHTML = `
            <div class="alert-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle'}"></i>
                <span>${message}</span>
                <button class="alert-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(alert);
        
        // Auto-remover após 5 segundos
        setTimeout(() => {
            if (alert.parentElement) {
                alert.style.animation = 'slideOutRight 0.3s ease forwards';
                setTimeout(() => alert.remove(), 300);
            }
        }, 5000);
    }

    // --- EVENT LISTENERS ---
    saveButton.addEventListener('click', saveUser);
    cancelButton.addEventListener('click', resetForm);

    // Inicializar
    resetForm();
});
