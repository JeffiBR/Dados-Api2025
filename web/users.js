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

    // Função para inicializar o grid de permissões
    function initializePermissionsGrid() {
        permissionsContainer.innerHTML = '';
        
        availablePermissions.forEach(permission => {
            const permissionCard = document.createElement('div');
            permissionCard.className = 'permission-card';
            permissionCard.dataset.permission = permission.key;
            
            permissionCard.innerHTML = `
                <div class="permission-header">
                    <div class="permission-icon"><i class="fas ${permission.icon}"></i></div>
                    <div class="permission-name">${permission.name}</div>
                </div>
                <div class="permission-description">${permission.description}</div>
                <span class="category-indicator ${permission.category}">${getCategoryName(permission.category)}</span>
                <div class="permission-checkbox"></div>
            `;
            
            permissionCard.addEventListener('click', () => {
                if (roleSelect.value === 'user') {
                    permissionCard.classList.toggle('selected');
                }
            });
            
            permissionsContainer.appendChild(permissionCard);
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
            card.classList.toggle('selected', permissions.includes(card.dataset.permission));
        });
    };

    // Atualizar visibilidade das permissões baseado no nível de acesso
    roleSelect.addEventListener('change', () => {
        updatePermissionsVisibility();
    });

    function updatePermissionsVisibility() {
        const permissionCards = permissionsContainer.querySelectorAll('.permission-card');
        
        if (roleSelect.value === 'admin' || roleSelect.value === 'group_admin') {
            permissionsContainer.style.opacity = '0.6';
            permissionsContainer.style.pointerEvents = 'none';
            // Limpar seleções para admin geral e admin de grupo
            setSelectedPermissions([]);
        } else {
            permissionsContainer.style.opacity = '1';
            permissionsContainer.style.pointerEvents = 'all';
        }
    }

    const loadUsers = async () => {
        try {
            const response = await authenticatedFetch('/api/users');
            
            if (!response.ok) {
                throw new Error('Erro ao carregar usuários');
            }
            
            const users = await response.json();
            renderUsersTable(users);
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            alert('Não foi possível carregar a lista de usuários.');
        }
    };

    function renderUsersTable(users) {
        tableBody.innerHTML = '';
        
        users.forEach(user => {
            const row = document.createElement('tr');
            row.dataset.user = JSON.stringify(user);

            // Formatar permissões para exibição
            const permissionsText = formatPermissionsForDisplay(user.allowed_pages);

            row.innerHTML = `
                <td>${user.full_name || 'N/A'}</td>
                <td>${user.email || 'N/A'}</td>
                <td class="password-cell">
                    ${user.plain_password ? `
                        <span class="pwd-hidden">••••••••</span>
                        <span class="pwd-real" style="display:none;">${user.plain_password}</span>
                        <button class="btn-icon reveal-pwd" title="Revelar senha">
                            <i class="fas fa-eye"></i>
                        </button>
                    ` : '<span class="pwd-hidden">Oculto</span>'}
                </td>
                <td>${getRoleDisplayName(user.role)}</td>
                <td>${permissionsText}</td>
                <td class="actions">
                    <button class="btn-icon edit-btn" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn-icon delete-btn" title="Excluir"><i class="fas fa-trash-alt"></i></button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    function getRoleDisplayName(role) {
        const roles = {
            'admin': 'Admin Geral',
            'group_admin': 'Admin de Grupo',
            'user': 'Usuário'
        };
        return roles[role] || role;
    }

    function formatPermissionsForDisplay(permissions) {
        if (!permissions || permissions.length === 0) {
            return 'Nenhuma';
        }
        
        if (permissions.length <= 2) {
            return permissions.map(perm => {
                const permissionInfo = availablePermissions.find(p => p.key === perm);
                return permissionInfo ? permissionInfo.name : perm;
            }).join(', ');
        }
        
        const firstTwo = permissions.slice(0, 2).map(perm => {
            const permissionInfo = availablePermissions.find(p => p.key === perm);
            return permissionInfo ? permissionInfo.name : perm;
        }).join(', ');
        
        return `${firstTwo} +${permissions.length - 2} mais`;
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
        saveButton.innerHTML = '<i class="fas fa-save"></i> Salvar';
        cancelButton.style.display = 'none';
    };

    const populateFormForEdit = (user) => {
        formTitle.textContent = `Editando Usuário: ${user.full_name}`;
        userIdInput.value = user.id;
        fullNameInput.value = user.full_name;
        emailInput.value = user.email;
        emailInput.disabled = true;
        passwordInput.value = '';
        passwordInput.placeholder = 'Deixe em branco para não alterar';
        passwordInput.disabled = true;
        roleSelect.value = user.role;
        
        setSelectedPermissions(user.allowed_pages || []);
        updatePermissionsVisibility();
        
        saveButton.innerHTML = '<i class="fas fa-save"></i> Atualizar';
        cancelButton.style.display = 'inline-flex';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const saveUser = async () => {
        const id = userIdInput.value;
        const full_name = fullNameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const role = roleSelect.value;
        
        // Para admin geral e admin de grupo, não enviar permissões específicas
        const allowed_pages = (role === 'admin' || role === 'group_admin') ? [] : getSelectedPermissions();

        if (!full_name) {
            alert('Nome completo é obrigatório.');
            return;
        }

        const isUpdating = !!id;
        
        if (!isUpdating && (!email || !password)) {
            alert('Email e Senha são obrigatórios para novos usuários.');
            return;
        }

        if (!isUpdating && password.length < 6) {
            alert('A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        const url = isUpdating ? `/api/users/${id}` : '/api/users';
        const method = isUpdating ? 'PUT' : 'POST';
        
        let body;
        if (isUpdating) {
            body = JSON.stringify({ full_name, role, allowed_pages });
        } else {
            body = JSON.stringify({ email, password, full_name, role, allowed_pages });
        }

        const originalButtonText = saveButton.innerHTML;
        saveButton.disabled = true;
        saveButton.innerHTML = isUpdating ? 'Atualizando...' : 'Criando...';

        try {
            const response = await authenticatedFetch(url, { 
                method, 
                body,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao salvar usuário');
            }
            
            alert(`✅ Usuário ${isUpdating ? 'atualizado' : 'criado'} com sucesso!`);
            resetForm();
            loadUsers();
        } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            alert(`❌ Erro: ${error.message}`);
        } finally {
            saveButton.disabled = false;
            saveButton.innerHTML = originalButtonText;
        }
    };

    const deleteUser = async (id, userName) => {
        if (!confirm(`Tem certeza que deseja excluir o usuário "${userName}"? Esta ação não pode ser desfeita.`)) return;

        try {
            const response = await authenticatedFetch(`/api/users/${id}`, { method: 'DELETE' });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Falha ao excluir o usuário.');
            }
            alert('✅ Usuário excluído com sucesso!');
            loadUsers();
        } catch (error) {
            console.error('Erro ao excluir usuário:', error);
            alert(`❌ ${error.message}`);
        }
    };

    // --- EVENT LISTENERS ---
    
    tableBody.addEventListener('click', (e) => {
        const editButton = e.target.closest('.edit-btn');
        const deleteButton = e.target.closest('.delete-btn');
        const revealBtn = e.target.closest('.reveal-pwd');
        
        if (editButton) {
            const user = JSON.parse(editButton.closest('tr').dataset.user);
            populateFormForEdit(user);
        }

        if (deleteButton) {
            const user = JSON.parse(deleteButton.closest('tr').dataset.user);
            deleteUser(user.id, user.full_name);
        }

        if (revealBtn) {
            const cell = revealBtn.closest('.password-cell');
            const hiddenSpan = cell.querySelector('.pwd-hidden');
            const realSpan = cell.querySelector('.pwd-real');

            if (!realSpan) return;

            const isShown = realSpan.style.display === 'inline' || realSpan.style.display === 'block';
            if (isShown) {
                realSpan.style.display = 'none';
                hiddenSpan.style.display = 'inline';
                revealBtn.innerHTML = '<i class="fas fa-eye"></i>';
                revealBtn.title = 'Revelar senha';
            } else {
                realSpan.style.display = 'inline';
                hiddenSpan.style.display = 'none';
                revealBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
                revealBtn.title = 'Ocultar senha';
            }
        }
    });
    
    saveButton.addEventListener('click', saveUser);
    cancelButton.addEventListener('click', resetForm);
});
