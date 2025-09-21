document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/users';
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

    const loadUsers = async () => {
        try {
            const response = await authenticatedFetch(API_URL);
            if (!response.ok) throw new Error('Erro ao carregar usuários');
            const users = await response.json();

            tableBody.innerHTML = '';
            users.forEach(user => {
                const row = document.createElement('tr');
                // Salva os dados no próprio elemento para fácil acesso
                row.dataset.user = JSON.stringify(user);

                row.innerHTML = `
                    <td>${user.full_name || 'N/A'}</td>
                    <td>${user.role === 'admin' ? 'Admin Geral' : 'Usuário'}</td>
                    <td>${(user.allowed_pages || []).length} permissões</td>
                    <td class="actions">
                        <button class="btn-icon edit-btn" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn-icon delete-btn" title="Excluir"><i class="fas fa-trash-alt"></i></button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Erro:', error);
            alert('Não foi possível carregar a lista de usuários.');
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
        saveButton.textContent = 'Criar Usuário';
        cancelButton.style.display = 'none';
    };

    const populateFormForEdit = (user) => {
        formTitle.textContent = `Editando Usuário: ${user.full_name}`;
        userIdInput.value = user.id;
        fullNameInput.value = user.full_name;
        emailInput.value = '******'; // Não mostramos/editamos email
        emailInput.disabled = true;
        passwordInput.value = '';
        passwordInput.placeholder = 'Deixe em branco para não alterar';
        passwordInput.disabled = true; // Desabilita senha na edição por padrão
        roleSelect.value = user.role;
        
        permissionCheckboxes.forEach(checkbox => {
            checkbox.checked = (user.allowed_pages || []).includes(checkbox.value);
        });
        
        saveButton.textContent = 'Atualizar Usuário';
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

        if (!full_name || (!id && !email)) {
            alert('Nome completo e email são obrigatórios.');
            return;
        }

        if (!id && !password) {
            alert('Senha é obrigatória para novos usuários.');
            return;
        }

        const isUpdating = !!id;
        const url = isUpdating ? `${API_URL}/${id}` : API_URL;
        const method = isUpdating ? 'PUT' : 'POST';
        
        let body;
        if (isUpdating) {
            body = JSON.stringify({ full_name, role, allowed_pages });
        } else {
            body = JSON.stringify({ email, password, full_name, role, allowed_pages });
        }

        try {
            saveButton.disabled = true;
            saveButton.innerHTML = isUpdating ? 'Atualizando...' : 'Criando...';
            const response = await authenticatedFetch(url, { method, body });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao salvar usuário');
            }
            alert(`Usuário ${isUpdating ? 'atualizado' : 'criado'} com sucesso!`);
            resetForm();
            loadUsers();
        } catch (error) {
            console.error('Erro:', error);
            alert(`Erro: ${error.message}`);
        } finally {
            saveButton.disabled = false;
        }
    };

    const deleteUser = async (id) => {
        if (!confirm('Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.')) return;

        try {
            const response = await authenticatedFetch(`${API_URL}/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Falha ao excluir usuário.');
            alert('Usuário excluído com sucesso!');
            loadUsers();
        } catch (error) {
            console.error('Erro:', error);
            alert(error.message);
        }
    };

    // Event Delegation para os botões da tabela
    tableBody.addEventListener('click', (e) => {
        const editButton = e.target.closest('.edit-btn');
        const deleteButton = e.target.closest('.delete-btn');
        
        if (editButton) {
            const user = JSON.parse(editButton.closest('tr').dataset.user);
            populateFormForEdit(user);
        }

        if (deleteButton) {
            const user = JSON.parse(deleteButton.closest('tr').dataset.user);
            deleteUser(user.id);
        }
    });
    
    saveButton.addEventListener('click', saveUser);
    cancelButton.addEventListener('click', resetForm);
    
    loadUsers();
});
