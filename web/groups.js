// groups.js - Gerenciamento de grupos e associações - Versão Corrigida
document.addEventListener('DOMContentLoaded', () => {
    // Elementos da UI
    const groupsTableBody = document.getElementById('groupsTableBody');
    const userGroupsTableBody = document.getElementById('userGroupsTableBody');
    const userSelect = document.getElementById('userSelect');
    const groupSelect = document.getElementById('groupSelect');
    
    // Formulário de grupos
    const groupFormTitle = document.getElementById('groupFormTitle');
    const groupIdInput = document.getElementById('groupId');
    const groupNameInput = document.getElementById('groupName');
    const accessDaysInput = document.getElementById('accessDays');
    const maxUsersInput = document.getElementById('maxUsers');
    const groupAdminSelect = document.getElementById('groupAdmin');
    const groupDescriptionInput = document.getElementById('groupDescription');
    const saveGroupBtn = document.getElementById('saveGroupBtn');
    const cancelGroupButton = document.getElementById('cancelGroupButton');
    const addUserToGroupBtn = document.getElementById('addUserToGroupBtn');
    const expirationDateInput = document.getElementById('expirationDate');

    // Elementos da visão admin
    const allGroupsTableBody = document.getElementById('allGroupsTableBody');
    const allGroupUsersTableBody = document.getElementById('allGroupUsersTableBody');
    const filterGroupSelect = document.getElementById('filterGroupSelect');

    // Carregar dados iniciais
    loadGroups();
    loadUserGroups();
    loadUsersForSelect();
    loadGroupsForSelect();
    loadAdminsForSelect();
    loadAllGroupsForAdmin();
    loadAllGroupUsersForAdmin();

    // Funções para grupos
    async function loadGroups() {
        try {
            console.log("🔍 Iniciando carregamento de grupos...");
            
            const response = await authenticatedFetch('/api/groups');
            
            if (!response.ok) {
                let errorMessage = `Erro ${response.status} ao carregar grupos`;
                
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.detail || errorMessage;
                    console.error("Detalhes do erro:", errorData);
                } catch (e) {
                    console.error("Não foi possível parsear resposta de erro:", e);
                }
                
                throw new Error(errorMessage);
            }
            
            const groups = await response.json();
            console.log(`✅ ${groups.length} grupos carregados com sucesso`);
            renderGroupsTable(groups);
            
        } catch (error) {
            console.error('❌ Erro ao carregar grupos:', error);
            showErrorInUI(`Falha ao carregar grupos: ${error.message}`);
        }
    }

    function renderGroupsTable(groups) {
        if (!groupsTableBody) return;
        
        groupsTableBody.innerHTML = '';
        
        if (groups.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="7" class="empty-table">Nenhum grupo encontrado</td>`;
            groupsTableBody.appendChild(row);
            return;
        }
        
        groups.forEach(group => {
            const row = document.createElement('tr');
            row.dataset.group = JSON.stringify(group);
            
            const adminName = group.profiles ? (group.profiles.full_name || group.profiles.email) : 'N/A';
            
            row.innerHTML = `
                <td>${group.nome}</td>
                <td>${adminName}</td>
                <td>${group.dias_acesso} dias</td>
                <td>${group.max_usuarios} usuários</td>
                <td>${group.descricao || '-'}</td>
                <td>${new Date(group.created_at).toLocaleDateString('pt-BR')}</td>
                <td class="actions">
                    <button class="btn-icon edit-group-btn" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn-icon delete-group-btn" title="Excluir"><i class="fas fa-trash-alt"></i></button>
                </td>
            `;
            groupsTableBody.appendChild(row);
        });
    }

    async function loadAdminsForSelect() {
        try {
            const response = await authenticatedFetch('/api/users');
            if (!response.ok) throw new Error('Erro ao carregar usuários');
            
            const users = await response.json();
            if (!groupAdminSelect) return;
            
            groupAdminSelect.innerHTML = '<option value="">Selecione um administrador</option>';
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.full_name} (${user.email})`;
                groupAdminSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar administradores para select:', error);
        }
    }

    async function saveGroup(event) {
        // Prevenir comportamento padrão do formulário
        if (event) event.preventDefault();
        
        const id = groupIdInput.value;
        const nome = groupNameInput.value.trim();
        const dias_acesso = parseInt(accessDaysInput.value);
        const max_usuarios = parseInt(maxUsersInput.value);
        const admin_id = groupAdminSelect.value;
        const descricao = groupDescriptionInput.value.trim();

        console.log('Dados do grupo:', { id, nome, dias_acesso, max_usuarios, admin_id, descricao });

        // Validações
        if (!nome) {
            alert('Nome do grupo é obrigatório.');
            return;
        }

        if (!dias_acesso || dias_acesso < 1) {
            alert('Dias de acesso deve ser um número positivo.');
            return;
        }

        if (!max_usuarios || max_usuarios < 1) {
            alert('Máximo de usuários deve ser um número positivo.');
            return;
        }

        if (!admin_id) {
            alert('Administrador do grupo é obrigatório.');
            return;
        }

        const url = id ? `/api/groups/${id}` : '/api/groups';
        const method = id ? 'PUT' : 'POST';
        
        const body = JSON.stringify({ 
            nome, 
            dias_acesso, 
            max_usuarios,
            admin_id,
            descricao: descricao || null 
        });

        console.log('Enviando requisição:', { url, method, body });

        const originalButtonText = saveGroupBtn.innerHTML;
        saveGroupBtn.disabled = true;
        saveGroupBtn.innerHTML = id ? 'Atualizando...' : 'Criando...';

        try {
            const response = await authenticatedFetch(url, { 
                method, 
                body,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('Resposta recebida:', response);

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Erro na resposta:', errorData);
                throw new Error(errorData?.detail || 'Erro ao salvar grupo');
            }
            
            const result = await response.json();
            console.log('Grupo salvo com sucesso:', result);
            
            alert(`✅ Grupo ${id ? 'atualizado' : 'criado'} com sucesso!`);
            resetGroupForm();
            loadGroups();
            loadGroupsForSelect();
            loadAdminsForSelect();
            loadAllGroupsForAdmin();
        } catch (error) {
            console.error('Erro ao salvar grupo:', error);
            alert(`❌ Erro: ${error.message}`);
        } finally {
            saveGroupBtn.disabled = false;
            saveGroupBtn.innerHTML = originalButtonText;
        }
    }

    function resetGroupForm() {
        groupFormTitle.textContent = 'Criar Novo Grupo';
        groupIdInput.value = '';
        groupNameInput.value = '';
        accessDaysInput.value = '30';
        maxUsersInput.value = '10';
        groupAdminSelect.value = '';
        groupDescriptionInput.value = '';
        cancelGroupButton.style.display = 'none';
    }

    function populateGroupFormForEdit(group) {
        groupFormTitle.textContent = `Editando Grupo: ${group.nome}`;
        groupIdInput.value = group.id;
        groupNameInput.value = group.nome;
        accessDaysInput.value = group.dias_acesso;
        maxUsersInput.value = group.max_usuarios;
        groupAdminSelect.value = group.admin_id || '';
        groupDescriptionInput.value = group.descricao || '';
        cancelGroupButton.style.display = 'inline-flex';
        window.scrollTo({ top: document.getElementById('groupFormTitle').offsetTop - 100, behavior: 'smooth' });
    }

    async function deleteGroup(id, groupName) {
        if (!confirm(`Tem certeza que deseja excluir o grupo "${groupName}"? Todas as associações com usuários serão removidas.`)) return;

        try {
            const response = await authenticatedFetch(`/api/groups/${id}`, { method: 'DELETE' });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData?.detail || 'Falha ao excluir o grupo.');
            }
            alert('✅ Grupo excluído com sucesso!');
            loadGroups();
            loadGroupsForSelect();
            loadUserGroups();
            loadAllGroupsForAdmin();
        } catch (error) {
            console.error('Erro ao excluir grupo:', error);
            alert(`❌ ${error.message}`);
        }
    }

    // Funções para associações usuário-grupo
    async function loadUserGroups() {
        try {
            const response = await authenticatedFetch('/api/user-groups');
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.detail || `Erro ${response.status} ao carregar associações`);
            }
            
            const userGroups = await response.json();
            renderUserGroupsTable(userGroups);
        } catch (error) {
            console.error('Erro ao carregar associações:', error);
            showErrorInUI(`Não foi possível carregar as associações usuário-grupo: ${error.message}`);
        }
    }

    function renderUserGroupsTable(userGroups) {
        if (!userGroupsTableBody) return;
        
        userGroupsTableBody.innerHTML = '';
        const today = new Date().toISOString().split('T')[0];
        
        if (userGroups.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" class="empty-table">Nenhuma associação encontrada</td>`;
            userGroupsTableBody.appendChild(row);
            return;
        }
        
        userGroups.forEach(userGroup => {
            const isExpired = userGroup.data_expiracao < today;
            const status = isExpired ? 'Expirado' : 'Ativo';
            const statusClass = isExpired ? 'status-expired' : 'status-active';
            
            const row = document.createElement('tr');
            row.dataset.userGroup = JSON.stringify(userGroup);
            
            row.innerHTML = `
                <td>${userGroup.user_name || 'N/A'}</td>
                <td>${userGroup.user_email || 'N/A'}</td>
                <td>${userGroup.grupo_nome}</td>
                <td>${new Date(userGroup.data_expiracao).toLocaleDateString('pt-BR')}</td>
                <td><span class="status-badge ${statusClass}">${status}</span></td>
                <td class="actions">
                    <button class="btn-icon remove-user-group-btn" title="Remover do grupo"><i class="fas fa-user-times"></i></button>
                </td>
            `;
            userGroupsTableBody.appendChild(row);
        });
    }

    async function loadUsersForSelect() {
        try {
            const response = await authenticatedFetch('/api/users');
            if (!response.ok) throw new Error('Erro ao carregar usuários');
            
            const users = await response.json();
            if (!userSelect) return;
            
            userSelect.innerHTML = '<option value="">Selecione um usuário</option>';
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.full_name} (${user.email})`;
                userSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar usuários para select:', error);
        }
    }

    async function loadGroupsForSelect() {
        try {
            const response = await authenticatedFetch('/api/groups');
            if (!response.ok) throw new Error('Erro ao carregar grupos');
            
            const groups = await response.json();
            if (!groupSelect) return;
            
            groupSelect.innerHTML = '<option value="">Selecione um grupo</option>';
            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = `${group.nome} (${group.dias_acesso} dias)`;
                groupSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar grupos para select:', error);
        }
    }

    async function addUserToGroup(event) {
        if (event) event.preventDefault();
        
        const userId = userSelect.value;
        const groupId = parseInt(groupSelect.value);
        const expirationDate = expirationDateInput.value;

        if (!userId || !groupId) {
            alert('Usuário e grupo são obrigatórios.');
            return;
        }

        const body = JSON.stringify({ 
            user_id: userId, 
            group_id: groupId,
            data_expiracao: expirationDate || null
        });

        const originalButtonText = addUserToGroupBtn.innerHTML;
        addUserToGroupBtn.disabled = true;
        addUserToGroupBtn.innerHTML = 'Adicionando...';

        try {
            const response = await authenticatedFetch('/api/user-groups', { 
                method: 'POST', 
                body,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData?.detail || 'Erro ao adicionar usuário ao grupo');
            }
            
            alert('✅ Usuário adicionado ao grupo com sucesso!');
            userSelect.value = '';
            groupSelect.value = '';
            expirationDateInput.value = '';
            loadUserGroups();
            loadAllGroupUsersForAdmin();
        } catch (error) {
            console.error('Erro ao adicionar usuário ao grupo:', error);
            alert(`❌ Erro: ${error.message}`);
        } finally {
            addUserToGroupBtn.disabled = false;
            addUserToGroupBtn.innerHTML = originalButtonText;
        }
    }

    async function removeUserFromGroup(userGroupId, userName, groupName) {
        if (!confirm(`Tem certeza que deseja remover "${userName}" do grupo "${groupName}"?`)) return;

        try {
            const response = await authenticatedFetch(`/api/user-groups/${userGroupId}`, { method: 'DELETE' });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData?.detail || 'Falha ao remover usuário do grupo.');
            }
            alert('✅ Usuário removido do grupo com sucesso!');
            loadUserGroups();
            loadAllGroupUsersForAdmin();
        } catch (error) {
            console.error('Erro ao remover usuário do grupo:', error);
            alert(`❌ ${error.message}`);
        }
    }

    // Funções para a visão admin
    async function loadAllGroupsForAdmin() {
        try {
            const response = await authenticatedFetch('/api/groups');
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.detail || `Erro ${response.status} ao carregar grupos`);
            }
            
            const groups = await response.json();
            renderAllGroupsTable(groups);
            populateFilterGroupSelect(groups);
        } catch (error) {
            console.error('Erro ao carregar grupos para admin:', error);
        }
    }

    function renderAllGroupsTable(groups) {
        if (!allGroupsTableBody) return;
        
        allGroupsTableBody.innerHTML = '';
        groups.forEach(group => {
            const row = document.createElement('tr');
            row.dataset.group = JSON.stringify(group);
            
            const adminName = group.profiles ? (group.profiles.full_name || group.profiles.email) : 'N/A';
            
            row.innerHTML = `
                <td>${group.nome}</td>
                <td>${adminName}</td>
                <td>${group.dias_acesso} dias</td>
                <td>${group.max_usuarios} usuários</td>
                <td>${new Date(group.created_at).toLocaleDateString('pt-BR')}</td>
                <td class="actions">
                    <button class="btn-icon edit-group-btn" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn-icon delete-group-btn" title="Excluir"><i class="fas fa-trash-alt"></i></button>
                </td>
            `;
            allGroupsTableBody.appendChild(row);
        });
    }

    function populateFilterGroupSelect(groups) {
        if (!filterGroupSelect) return;
        
        filterGroupSelect.innerHTML = '<option value="">Todos os grupos</option>';
        groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.nome;
            filterGroupSelect.appendChild(option);
        });
    }

    async function loadAllGroupUsersForAdmin(groupId = '') {
        try {
            let url = '/api/user-groups';
            if (groupId) {
                url += `?group_id=${groupId}`;
            }
            
            const response = await authenticatedFetch(url);
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.detail || `Erro ${response.status} ao carregar associações`);
            }
            
            const userGroups = await response.json();
            renderAllGroupUsersTable(userGroups);
        } catch (error) {
            console.error('Erro ao carregar associações para admin:', error);
        }
    }

    function renderAllGroupUsersTable(userGroups) {
        if (!allGroupUsersTableBody) return;
        
        allGroupUsersTableBody.innerHTML = '';
        const today = new Date().toISOString().split('T')[0];
        
        if (userGroups.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" class="empty-table">Nenhuma associação encontrada</td>`;
            allGroupUsersTableBody.appendChild(row);
            return;
        }
        
        userGroups.forEach(userGroup => {
            const isExpired = userGroup.data_expiracao < today;
            const status = isExpired ? 'Expirado' : 'Ativo';
            const statusClass = isExpired ? 'status-expired' : 'status-active';
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${userGroup.grupo_nome}</td>
                <td>${userGroup.user_name || 'N/A'}</td>
                <td>${userGroup.user_email || 'N/A'}</td>
                <td>${new Date(userGroup.data_expiracao).toLocaleDateString('pt-BR')}</td>
                <td><span class="status-badge ${statusClass}">${status}</span></td>
                <td>${userGroup.allowed_pages ? userGroup.allowed_pages.length : 0} permissões</td>
            `;
            allGroupUsersTableBody.appendChild(row);
        });
    }

    function showErrorInUI(message) {
        const errorHTML = `
            <div class="alert alert-error">
                <i class="fas fa-exclamation-triangle"></i>
                <span>${message}</span>
            </div>
        `;
        
        showAlert(errorHTML);
    }

    function showAlert(html) {
        const existingAlerts = document.querySelectorAll('.alert');
        existingAlerts.forEach(alert => alert.remove());
        
        const tabsContainer = document.querySelector('.tabs-container');
        if (tabsContainer) {
            tabsContainer.insertAdjacentHTML('afterbegin', html);
        }
    }

    // Gerenciamento de abas
    function initializeTabs() {
        // Abas principais
        document.querySelectorAll('.tab-button[data-tab]').forEach(button => {
            button.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;
                
                // Esconder todas as abas
                document.querySelectorAll('.tab-content').forEach(tab => {
                    tab.classList.remove('active');
                });
                
                // Mostrar a aba selecionada
                document.getElementById(tabId).classList.add('active');
                
                // Atualizar botões da aba
                document.querySelectorAll('.tab-button[data-tab]').forEach(btn => {
                    btn.classList.remove('active');
                });
                e.target.classList.add('active');
            });
        });

        // Sub-abas da visão admin
        document.querySelectorAll('.tab-button[data-subtab]').forEach(button => {
            button.addEventListener('click', (e) => {
                const subtabId = e.target.dataset.subtab;
                
                // Esconder todas as sub-abas
                document.querySelectorAll('.subtab-content').forEach(subtab => {
                    subtab.classList.remove('active');
                });
                
                // Mostrar a sub-aba selecionada
                document.getElementById(subtabId).classList.add('active');
                
                // Atualizar botões da sub-aba
                document.querySelectorAll('.tab-button[data-subtab]').forEach(btn => {
                    btn.classList.remove('active');
                });
                e.target.classList.add('active');
            });
        });
    }

    // Event Listeners
    if (groupsTableBody) {
        groupsTableBody.addEventListener('click', (e) => {
            const editButton = e.target.closest('.edit-group-btn');
            const deleteButton = e.target.closest('.delete-group-btn');
            
            if (editButton) {
                const group = JSON.parse(editButton.closest('tr').dataset.group);
                populateGroupFormForEdit(group);
            }

            if (deleteButton) {
                const group = JSON.parse(deleteButton.closest('tr').dataset.group);
                deleteGroup(group.id, group.nome);
            }
        });
    }

    if (allGroupsTableBody) {
        allGroupsTableBody.addEventListener('click', (e) => {
            const editButton = e.target.closest('.edit-group-btn');
            const deleteButton = e.target.closest('.delete-group-btn');
            
            if (editButton) {
                const group = JSON.parse(editButton.closest('tr').dataset.group);
                populateGroupFormForEdit(group);
                // Mudar para a aba de grupos
                document.querySelector('.tab-button[data-tab="groups-tab"]').click();
            }

            if (deleteButton) {
                const group = JSON.parse(deleteButton.closest('tr').dataset.group);
                deleteGroup(group.id, group.nome);
            }
        });
    }

    if (userGroupsTableBody) {
        userGroupsTableBody.addEventListener('click', (e) => {
            const removeButton = e.target.closest('.remove-user-group-btn');
            
            if (removeButton) {
                const userGroup = JSON.parse(removeButton.closest('tr').dataset.userGroup);
                removeUserFromGroup(userGroup.id, userGroup.user_name, userGroup.grupo_nome);
            }
        });
    }

    // CORREÇÃO PRINCIPAL: Adicionar event listeners corretamente
    if (saveGroupBtn) {
        saveGroupBtn.addEventListener('click', saveGroup);
        console.log('✅ Event listener do saveGroupBtn adicionado');
    } else {
        console.error('❌ saveGroupBtn não encontrado');
    }

    if (cancelGroupButton) {
        cancelGroupButton.addEventListener('click', resetGroupForm);
    }

    if (addUserToGroupBtn) {
        addUserToGroupBtn.addEventListener('click', addUserToGroup);
    }

    if (filterGroupSelect) {
        filterGroupSelect.addEventListener('change', (e) => {
            const groupId = e.target.value;
            loadAllGroupUsersForAdmin(groupId);
        });
    }

    // Inicializar abas
    initializeTabs();

    // Configurar data mínima para o campo de expiração
    if (expirationDateInput) {
        const today = new Date().toISOString().split('T')[0];
        expirationDateInput.min = today;
    }

    // Debug: verificar se os elementos foram encontrados
    console.log('Elementos carregados:', {
        saveGroupBtn: !!saveGroupBtn,
        groupsTableBody: !!groupsTableBody,
        userGroupsTableBody: !!userGroupsTableBody
    });
});
