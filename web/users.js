// web/users.js
document.addEventListener('DOMContentLoaded', () => {
    // ... (lógica para carregar, editar e deletar usuários) ...
    
    // Função para salvar (criar ou atualizar)
    const saveUser = async () => {
        const id = document.getElementById('userId').value;
        const fullName = document.getElementById('fullName').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const role = document.getElementById('role').value;
        
        // Pega os valores dos checkboxes
        const allowedPagesCheckboxes = document.querySelectorAll('#permissions-container input:checked');
        const allowed_pages = Array.from(allowedPagesCheckboxes).map(cb => cb.value);

        const session = await getSession();
        if (!session) { alert("Sessão inválida. Faça login novamente."); return; }

        let endpoint = '/api/users';
        let method = 'POST';
        let body = { email, password, full_name: fullName, role, allowed_pages };

        if (id) {
            endpoint = `/api/users/${id}`;
            method = 'PUT';
            body = { full_name: fullName, role, allowed_pages }; // Não envia a senha na atualização
        }
        
        // ... (resto da lógica fetch para enviar os dados para a API) ...
    };
    
    // ...
});
