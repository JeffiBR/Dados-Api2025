// users.js
document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/users';
    const tableBody = document.querySelector('#usersTable tbody');
    const saveButton = document.getElementById('saveUserBtn');
    const cancelButton = document.getElementById('cancelButton');
    const formTitle = document.getElementById('formTitle');
    const userIdInput = document.getElementById('userId');
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const roleSelect = document.getElementById('role');
    const permissionsContainer = document.getElementById('permissions-container');

    // Carregar usuários
    const loadUsers = async () => {
        try {
            const session = await getSession();
            if (!session) {
                alert("Sua sessão expirou. Por favor, faça login novamente.");
                window.location.href = '/login.html';
                return;
            }

            const response = await fetch(API_URL, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Erro ao carregar usuários');
            }
            
            const users = await response.json();
            tableBody.innerHTML = '';
            
            users.forEach(user => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${user.full_name}</td>
                    <td>${user.email}</td>
                    <td>${user.role === 'admin' ? 'Admin Geral' : 'Usuário'}</td>
                    <td>${user.allowed_pages ? user.allowed_pages.join(', ') : 'Nenhuma'}</td>
                    <td class="actions">
                        <button class="edit-btn" data-id="${user.id}" data-name="${user.full_name}" 
                                data-email="${user.email}" data-role="${user.role}" 
                                data-permissions="${user.allowed_pages ? JSON.stringify(user.allowed_pages) : '[]'}">Editar</button>
                        <button class="delete-btn" data-id="${user.id}">Excluir</button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            alert('Não foi possível carregar a lista de usuários.');
        }
    };

    // Resetar formulário
    const resetForm = () => {
        formTitle.textContent = 'Criar Novo Usuário';
        userIdInput.value = '';
        fullNameInput.value = '';
        emailInput.value = '';
        passwordInput.value = '';
        roleSelect.value = 'user';
        
        // Desmarcar todas as permissões
        permissionsContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });
        
        saveButton.textContent = 'Salvar';
        cancelButton.style.display = 'none';
        passwordInput.placeholder = 'Obrigatório para novos usuários';
    };

    // Salvar usuário
    const saveUser = async () => {
        const id = userIdInput.value;
        const fullName = fullNameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const role = roleSelect.value;
        
        // Obter permissões selecionadas
        const allowedPagesCheckboxes = permissionsContainer.querySelectorAll('input:checked');
        const allowed_pages = Array.from(allowedPagesCheckboxes).map(cb => cb.value);

        if (!fullName || !email) {
            alert('Nome e email são obrigatórios.');
            return;
        }

        if (!id && !password) {
            alert('Senha é obrigatória para novos usuários.');
            return;
        }

        const session = await getSession();
        if (!session) {
            alert("Sua sessão expirou. Por favor, faça login novamente.");
            window.location.href = '/login.html';
            return;
        }

        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_URL}/${id}` : API_URL;

        try {
            const userData = id 
                ? { full_name: fullName, email, role, allowed_pages }
                : { full_name: fullName, email, password, role, allowed_pages };

            const response = await fetch(url, {
                method: method,
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify(userData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao salvar usuário');
            }
            
            resetForm();
            loadUsers();
            alert('Usuário salvo com sucesso!');

        } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            alert(`Erro: ${error.message}`);
        }
    };

    // Preencher formulário para edição
    tableBody.addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-btn')) {
            const id = e.target.dataset.id;
            const name = e.target.dataset.name;
            const email = e.target.dataset.email;
            const role = e.target.dataset.role;
            const permissions = JSON.parse(e.target.dataset.permissions || '[]');
            
            formTitle.textContent = 'Editar Usuário';
            userIdInput.value = id;
            fullNameInput.value = name;
            emailInput.value = email;
            roleSelect.value = role;
            passwordInput.placeholder = 'Deixe em branco para manter a senha atual';
            
            // Marcar as permissões do usuário
            permissionsContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = permissions.includes(checkbox.value);
            });
            
            saveButton.textContent = 'Atualizar';
            cancelButton.style.display = 'inline-block';
        }
        
        if (e.target.classList.contains('delete-btn')) {
            if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
            
            const id = e.target.dataset.id;
            deleteUser(id);
        }
    });

    // Excluir usuário
    const deleteUser = async (id) => {
        const session = await getSession();
        if (!session) {
            alert("Sua sessão expirou. Por favor, faça login novamente.");
            return;
        }

        try {
            const response = await fetch(`${API_URL}/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            if (response.ok) {
                loadUsers();
                alert('Usuário excluído com sucesso!');
            } else {
                alert('Falha ao excluir usuário. Verifique suas permissões.');
            }
        } catch (error) {
            console.error('Erro ao excluir usuário:', error);
            alert('Erro ao excluir usuário.');
        }
    };

    // Event listeners
    saveButton.addEventListener('click', saveUser);
    cancelButton.addEventListener('click', resetForm);
    
    // Inicializar a página
    loadUsers();
});
