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
    const groupDescriptionInput = document.getElementById('groupDescription');
    const saveGroupBtn = document.getElementById('saveGroupBtn');
    const cancelGroupButton = document.getElementById('cancelGroupButton');
    const addUserToGroupBtn = document.getElementById('addUserToGroupBtn');
    const expirationDateInput = document.getElementById('expirationDate');

    // Carregar dados iniciais
    loadGroups();
    loadUserGroups();
    loadUsersForSelect();
    loadGroupsForSelect();

    // Funções para grupos
    async function loadGroups() {
        try {
            const response = await authenticatedFetch('/api/groups');
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.detail || `Erro ${response.status} ao carregar grupos`);
            }
            
            const groups = await response.json();
            renderGroupsTable(groups);
        } catch (error) {
            console.error('Erro ao carregar grupos:', error);
            alert(`Não foi possível carregar a lista de grupos: ${error.message}`);
        }
    }

    function renderGroupsTable(groups) {
        if (!groupsTableBody) return;
        
        groupsTableBody.innerHTML = '';
        groups.forEach(group => {
            const row = document.createElement('tr');
            row.dataset.group = JSON.stringify(group);
            
            row.innerHTML = `
                <td>${group.nome}</td>
                <td>${group.dias_acesso} dias</td>
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

    async function saveGroup() {
        const id = groupIdInput.value;
        const nome = groupNameInput.value.trim();
        const dias_acesso = parseInt(accessDaysInput.value);
        const descricao = groupDescriptionInput.value.trim();

        if (!nome) {
            alert('Nome do grupo é obrigatório.');
            return;
        }

        if (!dias_acesso || dias_acesso < 1) {
            alert('Dias de acesso deve ser um número positivo.');
            return;
        }

        const url = id ? `/api/groups/${id}` : '/api/groups';
        const method = id ? 'PUT' : 'POST';
        
        const body = JSON.stringify({ 
            nome, 
            dias_acesso, 
            descricao: descricao || null 
        });

        const originalButtonText = saveGroupBtn.innerHTML;
        saveGroupBtn.disabled = true;
        saveGroupBtn.innerHTML = id ? 'Atualizando...' : 'Criando...';

        try {
            const response = await authenticatedFetch(url, { method, body });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData?.detail || 'Erro ao salvar grupo');
            }
            
            alert(`Grupo ${id ? 'atualizado' : 'criado'} com sucesso!`);
            resetGroupForm();
            loadGroups();
            loadGroupsForSelect();
        } catch (error) {
            console.error('Erro ao salvar grupo:', error);
            alert(`Erro: ${error.message}`);
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
        groupDescriptionInput.value = '';
        cancelGroupButton.style.display = 'none';
    }

    function populateGroupFormForEdit(group) {
        groupFormTitle.textContent = `Editando Grupo: ${group.nome}`;
        groupIdInput.value = group.id;
        groupNameInput.value = group.nome;
        accessDaysInput.value = group.dias_acesso;
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
            alert('Grupo excluído com sucesso!');
            loadGroups();
            loadGroupsForSelect();
            loadUserGroups();
        } catch (error) {
            console.error('Erro ao excluir grupo:', error);
            alert(error.message);
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
            alert(`Não foi possível carregar as associações usuário-grupo: ${error.message}`);
        }
    }

    function renderUserGroupsTable(userGroups) {
        if (!userGroupsTableBody) return;
        
        userGroupsTableBody.innerHTML = '';
        const today = new Date().toISOString().split('T')[0];
        
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

    async function addUserToGroup() {
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
                body 
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData?.detail || 'Erro ao adicionar usuário ao grupo');
            }
            
            alert('Usuário adicionado ao grupo com sucesso!');
            userSelect.value = '';
            groupSelect.value = '';
            expirationDateInput.value = '';
            loadUserGroups();
        } catch (error) {
            console.error('Erro ao adicionar usuário ao grupo:', error);
            alert(`Erro: ${error.message}`);
        } finally {
            addUserToGroupBtn.disabled = false;
            addUserToGroupBtn.innerHTML = originalButtonText;
        }
    }

    async function removeUserFromGroup(userGroupId, userName, groupName) {
        if (!confirm(`Tem certeza que deseja remover ${userName} do grupo ${groupName}?`)) return;

        try {
            const response = await authenticatedFetch(`/api/user-groups/${userGroupId}`, { method: 'DELETE' });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData?.detail || 'Falha ao remover usuário do grupo.');
            }
            alert('Usuário removido do grupo com sucesso!');
            loadUserGroups();
        } catch (error) {
            console.error('Erro ao remover usuário do grupo:', error);
            alert(error.message);
        }
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

    if (userGroupsTableBody) {
        userGroupsTableBody.addEventListener('click', (e) => {
            const removeButton = e.target.closest('.remove-user-group-btn');
            
            if (removeButton) {
                const userGroup = JSON.parse(removeButton.closest('tr').dataset.userGroup);
                removeUserFromGroup(userGroup.id, userGroup.user_name, userGroup.grupo_nome);
            }
        });
    }

    if (saveGroupBtn) {
        saveGroupBtn.addEventListener('click', saveGroup);
    }

    if (cancelGroupButton) {
        cancelGroupButton.addEventListener('click', resetGroupForm);
    }

    if (addUserToGroupBtn) {
        addUserToGroupBtn.addEventListener('click', addUserToGroup);
    }
});
