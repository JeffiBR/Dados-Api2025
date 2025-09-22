document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DA UI (Mapeados para o novo design) ---
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
    const permissionCheckboxes = permissionsContainer.querySelectorAll('input[type="checkbox"]');

    const API_URL = '/api/users';

    // --- LÓGICA DE NEGÓCIO ---

    const loadUsers = async () => {
        try {
            const users = await authenticatedFetch(API_URL).then(res => res.json());

            tableBody.innerHTML = '';
            if (users.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="5" class="no-data">Nenhum usuário cadastrado.</td></tr>`;
                return;
            }

            users.forEach(user => {
                const row = document.createElement('tr');
                row.dataset.user = JSON.stringify(user); // Salva os dados no elemento

                // Cria os badges de permissão de forma dinâmica
                const permissionsHtml = (user.allowed_pages || [])
                    .map(p => `<span class="permissions-badge">${p}</span>`)
                    .join(' ');

                row.innerHTML = `
                    <td>${user.full_name || 'N/A'}</td>
                    <td>${user.email || '(email não disponível)'}</td>
                    <td>${user.role === 'admin' ? 'Admin Geral' : 'Usuário'}</td>
                    <td>${permissionsHtml || 'Nenhuma'}</td>
                    <td class="action-buttons">
                        <button class="btn btn-sm btn-edit" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn btn-sm btn-delete" title="Excluir"><i class="fas fa-trash-alt"></i></button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            tableBody.innerHTML = `<tr><td colspan="5" class="no-data error-text">Falha ao carregar usuários.</td></tr>`;
        }
    };

    const resetForm = () => {
        formTitle.textContent = 'Criar Novo Usuário';
        userIdInput.value = '';
        fullNameInput.value = '';
        emailInput.value = '';
        passwordInput.value = '';
        emailInput.disabled = false;
        passwordInput.disabled = false;
        passwordInput.placeholder = 'Obrigatório para novos usuários';
        roleSelect.value = 'user';
        permissionCheckboxes.forEach(checkbox => checkbox.checked = false);
        saveButton.innerHTML = '<i class="fas fa-save"></i> Salvar Usuário';
        cancelButton.style.display = 'none';
    };

    const populateFormForEdit = (user) => {
        formTitle.textContent = `Editando Usuário: ${user.full_name}`;
        userIdInput.value = user.id;
        fullNameInput.value = user.full_name;
        emailInput.value = user.email || '(não pode ser alterado)';
        emailInput.disabled = true;
        passwordInput.value = '';
        passwordInput.placeholder = 'Deixe em branco para não alterar';
        passwordInput.disabled = true; // Senha não é editada aqui
        roleSelect.value = user.role;
        
        permissionCheckboxes.forEach(checkbox => {
            checkbox.checked = (user.allowed_pages || []).includes(checkbox.value);
        });
        
        saveButton.innerHTML = '<i class="fas fa-save"></i> Atualizar Usuário';
        cancelButton.style.display = 'inline-flex';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const saveUser = async () => {
        const id = userIdInput.value;
        const full_name = fullNameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const role = roleSelect.value;
        const allowed_pages = Array.from(permissionCheckboxes).filter(cb => cb.checked).map(cb => cb.value);

        if (!full_name) {
            alert('Nome completo é obrigatório.');
            return;
        }

        const isUpdating = !!id;
        
        if (!isUpdating && (!email || !password || email.includes('*'))) {
            alert('Email e Senha são obrigatórios para novos usuários.');
            return;
        }

        const url = isUpdating ? `${API_URL}/${id}` : API_URL;
        const method = isUpdating ? 'PUT' : 'POST';
        
        let body;
        if (isUpdating) {
            body = JSON.stringify({ full_name, role, allowed_pages });
        } else {
            body = JSON.stringify({ email, password, full_name, role, allowed_pages });
        }

        const originalButtonHTML = saveButton.innerHTML;
        saveButton.disabled = true;
        saveButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${isUpdating ? 'Atualizando...' : 'Criando...'}`;

        try {
            const response = await authenticatedFetch(url, { method, body });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao salvar usuário');
            }
            
            showNotification(`Usuário ${isUpdating ? 'atualizado' : 'criado'} com sucesso!`, 'success');
            resetForm();
            loadUsers();
        } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            showNotification(`Erro: ${error.message}`, 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.innerHTML = originalButtonHTML;
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
            showNotification('Usuário excluído com sucesso!', 'success');
            loadUsers();
        } catch (error) {
            console.error('Erro ao excluir usuário:', error);
            showNotification(error.message, 'error');
        }
    };

    // --- EVENT LISTENERS ---
    
    tableBody.addEventListener('click', (e) => {
        const editButton = e.target.closest('.btn-edit');
        const deleteButton = e.target.closest('.btn-delete');
        
        if (editButton) {
            const user = JSON.parse(editButton.closest('tr').dataset.user);
            populateFormForEdit(user);
        }

        if (deleteButton) {
            const user = JSON.parse(deleteButton.closest('tr').dataset.user);
            // Busca o email do usuário na API para exibir no alerta, já que não vem na lista
            authenticatedFetch(`/api/users/${user.id}`).then(res => res.json()).then(fullUser => {
                 deleteUser(user.id, fullUser.full_name || 'este usuário');
            });
        }
    });
    
    saveButton.addEventListener('click', saveUser);
    cancelButton.addEventListener('click', resetForm);
    
    // Inicialização da página
    loadUsers();
});
