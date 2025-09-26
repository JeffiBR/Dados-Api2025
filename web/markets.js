document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/supermarkets';
    const tableBody = document.querySelector('#marketsTable tbody');
    const saveButton = document.getElementById('saveButton');
    const cancelButton = document.getElementById('cancelButton');
    const formTitle = document.getElementById('formTitle');
    const marketIdInput = document.getElementById('marketId');
    const marketNameInput = document.getElementById('marketName');
    const marketCnpjInput = document.getElementById('marketCnpj');

    // Função para obter a sessão do usuário
    const getSession = async () => {
        try {
            const { data: { session }, error } = await window.supabase.auth.getSession();
            if (error) throw error;
            return session;
        } catch (error) {
            console.error('Erro ao obter sessão:', error);
            return null;
        }
    };

    const loadMarkets = async () => {
        try {
            console.log('Carregando mercados...');
            const response = await fetch(API_URL + "/public");
            
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            
            const markets = await response.json();
            console.log('Mercados carregados:', markets);
            
            tableBody.innerHTML = '';
            
            if (markets.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Nenhum mercado cadastrado</td></tr>';
                return;
            }
            
            markets.forEach(market => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${market.nome || 'N/A'}</td>
                    <td>${market.cnpj || 'N/A'}</td>
                    <td class="actions">
                        <button class="btn btn-secondary edit-market" data-id="${market.id}" data-nome="${market.nome}" data-cnpj="${market.cnpj}">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="btn danger delete-market" data-id="${market.id}">
                            <i class="fas fa-trash"></i> Excluir
                        </button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Erro ao carregar mercados:', error);
            tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: red;">Erro ao carregar dados</td></tr>';
        }
    };

    const resetForm = () => {
        formTitle.textContent = 'Adicionar Novo Mercado';
        marketIdInput.value = '';
        marketNameInput.value = '';
        marketCnpjInput.value = '';
        saveButton.innerHTML = '<i class="fas fa-save"></i> Salvar';
        cancelButton.style.display = 'none';
        saveButton.disabled = false;
    };

    const saveMarket = async () => {
        const id = marketIdInput.value;
        const nome = marketNameInput.value.trim();
        const cnpj = marketCnpjInput.value.trim().replace(/\D/g, '');
        
        if (!nome) {
            alert('Nome do mercado é obrigatório.');
            marketNameInput.focus();
            return;
        }
        
        if (!cnpj || cnpj.length !== 14) {
            alert('CNPJ deve conter 14 dígitos.');
            marketCnpjInput.focus();
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
            saveButton.disabled = true;
            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

            const response = await fetch(url, {
                method: method,
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ nome, cnpj })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || errorData.message || `Erro ${response.status}`);
            }
            
            alert(id ? 'Mercado atualizado com sucesso!' : 'Mercado cadastrado com sucesso!');
            resetForm();
            await loadMarkets();

        } catch (error) {
            console.error('Erro ao salvar mercado:', error);
            alert(`Erro: ${error.message}`);
        } finally {
            saveButton.disabled = false;
            if (marketIdInput.value) {
                saveButton.innerHTML = '<i class="fas fa-save"></i> Atualizar';
            } else {
                saveButton.innerHTML = '<i class="fas fa-save"></i> Salvar';
            }
        }
    };

    // Evento para editar/excluir mercado
    tableBody.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-market');
        const deleteBtn = e.target.closest('.delete-market');
        
        if (editBtn) {
            const id = editBtn.dataset.id;
            const nome = editBtn.dataset.nome;
            const cnpj = editBtn.dataset.cnpj;

            formTitle.textContent = 'Editar Mercado';
            marketIdInput.value = id;
            marketNameInput.value = nome;
            marketCnpjInput.value = cnpj;
            saveButton.innerHTML = '<i class="fas fa-save"></i> Atualizar';
            cancelButton.style.display = 'inline-block';
            
            marketNameInput.focus();
        }
        
        if (deleteBtn) {
            if (!confirm('Tem certeza que deseja excluir este mercado?\nEsta ação não pode ser desfeita.')) return;
            
            const id = deleteBtn.dataset.id;

            const session = await getSession();
            if (!session) {
                alert("Sua sessão expirou. Por favor, faça login novamente.");
                return;
            }

            try {
                deleteBtn.disabled = true;
                deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Excluindo...';

                const response = await fetch(`${API_URL}/${id}`, { 
                    method: 'DELETE',
                    headers: { 
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    alert('Mercado excluído com sucesso!');
                    await loadMarkets();
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || errorData.message || 'Falha ao excluir mercado');
                }
            } catch (error) {
                console.error('Erro ao excluir mercado:', error);
                alert(`Erro: ${error.message}`);
            } finally {
                deleteBtn.disabled = false;
                deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Excluir';
            }
        }
    });

    // Evento para formatar CNPJ durante a digitação
    marketCnpjInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 14) value = value.substring(0, 14);
        
        if (value.length > 11) {
            value = value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
        } else if (value.length > 8) {
            value = value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})/, '$1.$2.$3/$4');
        } else if (value.length > 5) {
            value = value.replace(/^(\d{2})(\d{3})(\d{3})/, '$1.$2.$3');
        } else if (value.length > 2) {
            value = value.replace(/^(\d{2})(\d{3})/, '$1.$2');
        }
        
        e.target.value = value;
    });

    // Eventos dos botões principais
    saveButton.addEventListener('click', saveMarket);
    cancelButton.addEventListener('click', resetForm);

    // Permitir salvar com Enter
    marketNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveMarket();
        }
    });

    marketCnpjInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveMarket();
        }
    });

    // Adicionar ícones aos botões (garantir que estão presentes)
    saveButton.innerHTML = '<i class="fas fa-save"></i> Salvar';
    cancelButton.innerHTML = '<i class="fas fa-times"></i> Cancelar Edição';

    // Carregar dados iniciais
    loadMarkets();

    // Adicionar funcionalidade do tema (se necessário)
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const body = document.body;
            if (body.classList.contains('theme-dark')) {
                body.classList.remove('theme-dark');
                body.classList.add('light-mode');
                themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            } else {
                body.classList.remove('light-mode');
                body.classList.add('theme-dark');
                themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
            }
        });
    }

    // Adicionar funcionalidade do menu mobile (se necessário)
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebar = document.querySelector('.sidebar');

    if (mobileMenuBtn && sidebarOverlay && sidebar) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.add('open');
            sidebarOverlay.classList.add('show');
        });

        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('show');
        });
    }

    // Adicionar funcionalidade do menu do usuário (se necessário)
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    const logoutBtn = document.getElementById('logoutBtn');

    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('active');
        });

        // Fechar dropdown ao clicar fora
        document.addEventListener('click', () => {
            userDropdown.classList.remove('active');
        });

        // Impedir que o clique no dropdown feche ele
        userDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const { error } = await window.supabase.auth.signOut();
                if (error) throw error;
                window.location.href = '/login.html';
            } catch (error) {
                console.error('Erro ao fazer logout:', error);
                alert('Erro ao fazer logout. Tente novamente.');
            }
        });
    }

    // Carregar informações do usuário
    const loadUserInfo = async () => {
        try {
            const { data: { user }, error } = await window.supabase.auth.getUser();
            if (error) throw error;
            
            if (user) {
                const userAvatar = document.getElementById('userAvatar');
                const userName = document.querySelector('.user-name');
                const userRole = document.querySelector('.user-role');
                
                if (userAvatar) {
                    userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email || 'U')}&background=4f46e5&color=ffffff`;
                }
                
                if (userName) {
                    userName.textContent = user.email || 'Usuário';
                }
                
                if (userRole) {
                    // Aqui você pode adicionar lógica para determinar o papel do usuário
                    userRole.textContent = 'Administrador';
                }
            }
        } catch (error) {
            console.error('Erro ao carregar informações do usuário:', error);
        }
    };

    loadUserInfo();
});
