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
    const permissionCheckboxes = permissionsContainer.querySelectorAll('input[type="checkbox"]');

    // --- LÓGICA DE NEGÓCIO ---

    const loadUsers = async () => {
        try {
            const users = await authenticatedFetch('/api/users').then(res => res.json());

            tableBody.innerHTML = '';
            users.forEach(user => {
                const row = document.createElement('tr');
                // Salva os dados completos no elemento para fácil acesso ao editar
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
            console.error('Erro ao carregar usuários:', error);
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
        emailInput.value = '********'; // Email não pode ser alterado
        emailInput.disabled = true;
        passwordInput.value = '';
        passwordInput.placeholder = 'Deixe em branco para não alterar';
        passwordInput.disabled = true; // Senha não é editada aqui por segurança
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

        if (!full_name) {
            alert('Nome completo é obrigatório.');
            return;
        }

        const isUpdating = !!id;
        
        if (!isUpdating && (!email || !password)) {
            alert('Email e Senha são obrigatórios para novos usuários.');
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
            console.error('Erro ao salvar usuário:', error);
            alert(`Erro: ${error.message}`);
        } finally {
            saveButton.disabled = false;
        }
    };

    const deleteUser = async (id) => {
        // Lógica para deletar usuário (requer um endpoint de deleção na API)
        // Por segurança, vamos deixar desabilitado por enquanto até que o endpoint seja criado.
        alert("Funcionalidade de exclusão de usuário a ser implementada na API.");
    };

    // --- EVENT LISTENERS ---
    
    tableBody.addEventListener('click', (e) => {
        const editButton = e.target.closest('.edit-btn');
        const deleteButton = e.target.closest('.delete-btn');
        
        if (editButton) {
            const user = JSON.parse(editButton.closest('tr').dataset.user);
            populateFormForEdit(user);
        }

        if (deleteButton) {
            const user = JSON.parse(deleteButton.closest('tr').dataset.user);
            // deleteUser(user.id); // Descomente quando o endpoint de deleção estiver pronto
            alert("A exclusão de usuários precisa ser implementada na API primeiro.");
        }
    });
    
    saveButton.addEventListener('click', saveUser);
    cancelButton.addEventListener('click', resetForm);
    
    // Inicialização da página
    loadUsers();
});
