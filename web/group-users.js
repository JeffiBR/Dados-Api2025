// group-users.js - Gerenciamento de usuários por admin de grupo
document.addEventListener('DOMContentLoaded', () => {
    // Elementos da UI
    const groupSelect = document.getElementById('groupSelect');
    const groupInfoSection = document.getElementById('groupInfoSection');
    const userManagementSection = document.getElementById('userManagementSection');
    const usersListSection = document.getElementById('usersListSection');
    const noGroupsSection = document.getElementById('noGroupsSection');
    
    const groupName = document.getElementById('groupName');
    const groupAccessDays = document.getElementById('groupAccessDays');
    const groupMaxUsers = document.getElementById('groupMaxUsers');
    const groupCurrentUsers = document.getElementById('groupCurrentUsers');
    const groupAdmin = document.getElementById('groupAdmin');
    const groupStatus = document.getElementById('groupStatus');
    
    const userFullName = document.getElementById('userFullName');
    const userEmail = document.getElementById('userEmail');
    const userPassword = document.getElementById('userPassword');
    const createUserBtn = document.getElementById('createUserBtn');
    
    const groupUsersTableBody = document.getElementById('groupUsersTableBody');

    // Elementos do modal de edição
    const editUserModal = document.getElementById('editUserModal');
    const closeEditModal = document.getElementById('closeEditModal');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const saveUserBtn = document.getElementById('saveUserBtn');
    const editUserName = document.getElementById('editUserName');
    const permissionsGrid = document.querySelector('.permissions-grid.compact');

    let currentGroupId = null;
    let currentGroupUsers = [];
    let currentEditingUser = null;
    let allPermissions = [];

    // Carregar grupos do admin
    loadAdminGroups();
    loadPermissions();

    async function loadAdminGroups() {
        try {
            const response = await authenticatedFetch('/api/my-admin-groups');
            if (!response.ok) {
                throw new Error('Erro ao carregar grupos');
            }
            
            const groups = await response.json();
            
            if (groups.length === 0) {
                noGroupsSection.style.display = 'block';
                return;
            }
            
            groupSelect.innerHTML = '<option value="">Selecione um grupo</option>';
            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = `${group.nome} (${group.max_usuarios} usuários max)`;
                option.dataset.group = JSON.stringify(group);
                groupSelect.appendChild(option);
            });
            
        } catch (error) {
            console.error('Erro ao carregar grupos do admin:', error);
            alert('Não foi possível carregar seus grupos.');
        }
    }

    async function loadPermissions() {
        // Definir lista fixa de permissões baseada no sistema
        allPermissions = [
            { key: 'search', name: 'Busca', description: 'Permite pesquisar produtos' },
            { key: 'compare', name: 'Comparador', description: 'Acesso à ferramenta de comparação' },
            { key: 'dashboard', name: 'Dashboard', description: 'Visualização de métricas e relatórios' },
            { key: 'baskets', name: 'Cesta Básica', description: 'Acesso à funcionalidade de cesta básica' },
            { key: 'coleta', name: 'Coleta', description: 'Executar processos de coleta de dados' },
            { key: 'collections', name: 'Histórico', description: 'Acesso ao histórico de coletas' },
            { key: 'product_log', name: 'Log de Produtos', description: 'Visualizar logs de produtos' },
            { key: 'user_logs', name: 'Logs de Usuários', description: 'Visualizar atividades dos usuários' },
            { key: 'prune', name: 'Limpeza', description: 'Executar limpeza de dados' },
            { key: 'markets', name: 'Mercados', description: 'Gerenciar mercados cadastrados' }
        ];
    }

    async function loadGroupUsers(groupId) {
        try {
            const response = await authenticatedFetch(`/api/group-users/${groupId}`);
            if (!response.ok) {
                throw new Error('Erro ao carregar usuários do grupo');
            }
            
            currentGroupUsers = await response.json();
            renderGroupUsersTable(currentGroupUsers);
            updateGroupInfo();
            
        } catch (error) {
            console.error('Erro ao carregar usuários do grupo:', error);
            alert('Não foi possível carregar os usuários do grupo.');
        }
    }

    function renderGroupUsersTable(users) {
        if (!groupUsersTableBody) return;
        
        groupUsersTableBody.innerHTML = '';
        
        if (users.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" class="empty-table">Nenhum usuário encontrado neste grupo</td>`;
            groupUsersTableBody.appendChild(row);
            return;
        }
        
        users.forEach(user => {
            const row = document.createElement('tr');
            row.dataset.user = JSON.stringify(user);
            
            const statusClass = user.status === 'Ativo' ? 'status-active' : 'status-expired';
            const isAdmin = user.user_id === JSON.parse(groupSelect.selectedOptions[0].dataset.group).admin_id;
            
            row.innerHTML = `
                <td>${user.user_name} ${isAdmin ? '<span class="badge badge-primary">Admin</span>' : ''}</td>
                <td>${user.user_email}</td>
                <td>${new Date(user.data_expiracao).toLocaleDateString('pt-BR')}</td>
                <td><span class="status-badge ${statusClass}">${user.status}</span></td>
                <td>${user.allowed_pages.length} permissões</td>
                <td class="actions">
                    ${!isAdmin ? `
                    <button class="btn-icon edit-user-btn" title="Editar usuário"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon remove-user-btn" title="Remover do grupo"><i class="fas fa-user-times"></i></button>
                    ` : '<span class="text-muted">Admin do grupo</span>'}
                </td>
            `;
            groupUsersTableBody.appendChild(row);
        });
    }

    function updateGroupInfo() {
        if (!currentGroupId) return;
        
        const selectedOption = groupSelect.querySelector(`option[value="${currentGroupId}"]`);
        if (!selectedOption) return;
        
        const group = JSON.parse(selectedOption.dataset.group);
        
        groupName.textContent = group.nome;
        groupAccessDays.textContent = `${group.dias_acesso} dias`;
        groupMaxUsers.textContent = group.max_usuarios;
        groupCurrentUsers.textContent = `${currentGroupUsers.length} / ${group.max_usuarios}`;
        groupAdmin.textContent = group.profiles?.full_name || group.profiles?.email || 'N/A';
        
        // Calcular status do grupo
        const usagePercentage = (currentGroupUsers.length / group.max_usuarios) * 100;
        let statusText = 'Disponível';
        let statusClass = 'status-active';
        
        if (usagePercentage >= 90) {
            statusText = 'Quase Cheio';
            statusClass = 'status-warning';
        } else if (usagePercentage >= 100) {
            statusText = 'Limite Atingido';
            statusClass = 'status-expired';
        }
        
        groupStatus.textContent = statusText;
        groupStatus.className = `info-value status-badge ${statusClass}`;
    }

    async function createGroupUser() {
        if (!currentGroupId) {
            alert('Selecione um grupo primeiro.');
            return;
        }
        
        const full_name = userFullName.value.trim();
        const email = userEmail.value.trim();
        const password = userPassword.value;

        if (!full_name || !email || !password) {
            alert('Todos os campos são obrigatórios.');
            return;
        }

        if (password.length < 6) {
            alert('A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        const body = JSON.stringify({ full_name, email, password });

        const originalButtonText = createUserBtn.innerHTML;
        createUserBtn.disabled = true;
        createUserBtn.innerHTML = 'Criando...';

        try {
            const response = await authenticatedFetch(`/api/group-users/${currentGroupId}`, { 
                method: 'POST', 
                body 
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData?.detail || 'Erro ao criar usuário');
            }
            
            alert('Usuário criado e adicionado ao grupo com sucesso!');
            
            // Limpar formulário
            userFullName.value = '';
            userEmail.value = '';
            userPassword.value = '';
            
            // Recarregar lista de usuários
            loadGroupUsers(currentGroupId);
            
        } catch (error) {
            console.error('Erro ao criar usuário:', error);
            alert(`Erro: ${error.message}`);
        } finally {
            createUserBtn.disabled = false;
            createUserBtn.innerHTML = originalButtonText;
        }
    }

    function openEditUserModal(user) {
        currentEditingUser = user;
        editUserName.value = user.user_name;
        
        // Carregar permissões no modal
        permissionsGrid.innerHTML = '';
        allPermissions.forEach(permission => {
            const isSelected = user.allowed_pages.includes(permission.key);
            const permissionCard = document.createElement('div');
            permissionCard.className = `permission-card compact ${isSelected ? 'selected' : ''}`;
            permissionCard.dataset.permission = permission.key;
            
            permissionCard.innerHTML = `
                <div class="permission-header">
                    <div class="permission-name">${permission.name}</div>
                </div>
                <div class="permission-description">${permission.description}</div>
                <div class="permission-checkbox"></div>
            `;
            
            permissionCard.addEventListener('click', () => {
                permissionCard.classList.toggle('selected');
            });
            
            permissionsGrid.appendChild(permissionCard);
        });
        
        editUserModal.style.display = 'block';
    }

    async function updateGroupUser() {
        if (!currentEditingUser || !currentGroupId) return;

        const full_name = editUserName.value.trim();
        const selectedPermissions = Array.from(permissionsGrid.querySelectorAll('.permission-card.selected'))
            .map(card => card.dataset.permission);

        if (!full_name) {
            alert('Nome completo é obrigatório.');
            return;
        }

        const body = JSON.stringify({ 
            full_name, 
            allowed_pages: selectedPermissions 
        });

        const originalButtonText = saveUserBtn.innerHTML;
        saveUserBtn.disabled = true;
        saveUserBtn.innerHTML = 'Salvando...';

        try {
            const response = await authenticatedFetch(`/api/group-users/${currentGroupId}/${currentEditingUser.user_id}`, { 
                method: 'PUT', 
                body 
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData?.detail || 'Erro ao atualizar usuário');
            }
            
            alert('Usuário atualizado com sucesso!');
            closeEditModal.click();
            loadGroupUsers(currentGroupId);
            
        } catch (error) {
            console.error('Erro ao atualizar usuário:', error);
            alert(`Erro: ${error.message}`);
        } finally {
            saveUserBtn.disabled = false;
            saveUserBtn.innerHTML = originalButtonText;
        }
    }

    async function removeUserFromGroup(userId, userName) {
        if (!confirm(`Tem certeza que deseja remover "${userName}" do grupo?`)) return;

        try {
            const response = await authenticatedFetch(`/api/group-users/${currentGroupId}/${userId}`, { 
                method: 'DELETE' 
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData?.detail || 'Erro ao remover usuário');
            }
            
            alert('Usuário removido do grupo com sucesso!');
            loadGroupUsers(currentGroupId);
            
        } catch (error) {
            console.error('Erro ao remover usuário:', error);
            alert(`Erro: ${error.message}`);
        }
    }

    // Event Listeners
    groupSelect.addEventListener('change', (e) => {
        const selectedOption = e.target.options[e.target.selectedIndex];
        
        if (!selectedOption.value) {
            currentGroupId = null;
            groupInfoSection.style.display = 'none';
            userManagementSection.style.display = 'none';
            usersListSection.style.display = 'none';
            return;
        }
        
        currentGroupId = parseInt(selectedOption.value);
        const group = JSON.parse(selectedOption.dataset.group);
        
        // Mostrar seções relevantes
        groupInfoSection.style.display = 'block';
        userManagementSection.style.display = 'block';
        usersListSection.style.display = 'block';
        noGroupsSection.style.display = 'none';
        
        // Carregar usuários do grupo
        loadGroupUsers(currentGroupId);
    });

    createUserBtn.addEventListener('click', createGroupUser);

    groupUsersTableBody.addEventListener('click', (e) => {
        const editButton = e.target.closest('.edit-user-btn');
        const removeButton = e.target.closest('.remove-user-btn');
        
        if (editButton) {
            const user = JSON.parse(editButton.closest('tr').dataset.user);
            openEditUserModal(user);
        }

        if (removeButton) {
            const user = JSON.parse(removeButton.closest('tr').dataset.user);
            removeUserFromGroup(user.user_id, user.user_name);
        }
    });

    // Modal event listeners
    closeEditModal.addEventListener('click', () => {
        editUserModal.style.display = 'none';
        currentEditingUser = null;
    });

    cancelEditBtn.addEventListener('click', () => {
        editUserModal.style.display = 'none';
        currentEditingUser = null;
    });

    saveUserBtn.addEventListener('click', updateGroupUser);

    // Fechar modal ao clicar fora
    window.addEventListener('click', (e) => {
        if (e.target === editUserModal) {
            editUserModal.style.display = 'none';
            currentEditingUser = null;
        }
    });
});
