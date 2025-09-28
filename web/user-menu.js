// user-menu.js
document.addEventListener('DOMContentLoaded', function() {
    class UserMenu {
        constructor() {
            this.userMenuBtn = document.getElementById('userMenuBtn');
            this.userDropdown = document.getElementById('userDropdown');
            this.userAvatar = document.getElementById('userAvatar');
            this.userName = document.querySelector('.user-name');
            this.userRole = document.querySelector('.user-role');
            this.logoutBtn = document.getElementById('logoutBtn');
            
            this.init();
        }

        async init() {
            await this.loadUserInfo();
            this.setupEventListeners();
        }

        async loadUserInfo() {
            try {
                this.showLoadingState();
                
                // Buscar dados do usuário da API
                const userData = await this.fetchUserData();
                
                if (userData) {
                    this.updateUI(userData);
                    this.checkPermissions(userData);
                } else {
                    this.handleNoUserData();
                }
                
            } catch (error) {
                console.error('Erro ao carregar informações do usuário:', error);
                this.showErrorState();
            }
        }

        async fetchUserData() {
            try {
                const response = await authenticatedFetch('/api/user/me', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const userData = await response.json();
                return userData;
                
            } catch (error) {
                console.error('Erro na requisição da API:', error);
                
                // Tentar fallback para dados básicos da sessão
                return await this.getFallbackUserData();
            }
        }

        async getFallbackUserData() {
            try {
                // Verificar se há token JWT e extrair informações
                const token = localStorage.getItem('supabase.auth.token');
                if (token) {
                    const parsedToken = JSON.parse(token);
                    if (parsedToken?.access_token) {
                        const payload = JSON.parse(atob(parsedToken.access_token.split('.')[1]));
                        return {
                            id: payload.sub,
                            email: payload.email,
                            name: payload.user_metadata?.name || payload.email?.split('@')[0] || 'Usuário',
                            role: payload.user_metadata?.role || 'user',
                            avatar: payload.user_metadata?.avatar_url || null,
                            permissions: payload.user_metadata?.permissions || ['search', 'compare']
                        };
                    }
                }
                
                // Último fallback - dados mínimos para mostrar menu
                return {
                    name: 'Usuário',
                    role: 'user',
                    email: '',
                    avatar: null,
                    permissions: ['search', 'compare'] // Permissões básicas
                };
                
            } catch (error) {
                console.error('Erro no fallback:', error);
                return null;
            }
        }

        updateUI(userData) {
            // Nome do usuário
            if (this.userName) {
                this.userName.textContent = userData.name || userData.email || 'Usuário';
            }

            // Nível/função do usuário
            if (this.userRole) {
                const roleText = this.getRoleDisplayText(userData.role);
                this.userRole.textContent = roleText;
                
                // Adicionar classe para estilização diferenciada
                this.userRole.className = 'user-role';
                if (userData.role === 'admin') {
                    this.userRole.classList.add('admin-role');
                } else if (userData.role === 'moderator') {
                    this.userRole.classList.add('moderator-role');
                }
            }

            // Avatar do usuário
            if (this.userAvatar) {
                if (userData.avatar) {
                    this.userAvatar.src = userData.avatar;
                    this.userAvatar.onerror = () => this.setDefaultAvatar(userData);
                } else {
                    this.setDefaultAvatar(userData);
                }
                
                this.userAvatar.alt = `Avatar de ${userData.name || 'Usuário'}`;
            }

            // Remover estado de loading
            this.hideLoadingState();
        }

        setDefaultAvatar(userData) {
            const name = userData.name || userData.email || 'U';
            const backgroundColor = userData.role === 'admin' ? 'ef4444' : '4f46e5';
            this.userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${backgroundColor}&color=fff&size=128&bold=true`;
        }

        getRoleDisplayText(role) {
            const roleMap = {
                'admin': 'Administrador',
                'moderator': 'Moderador',
                'user': 'Usuário',
                'viewer': 'Visualizador'
            };
            
            return roleMap[role] || 'Usuário';
        }

        checkPermissions(userData) {
            console.log('Verificando permissões para:', userData);
            
            // Primeiro, garantir que todos os itens do menu estejam visíveis
            const allMenuItems = document.querySelectorAll('.sidebar-nav li');
            allMenuItems.forEach(item => {
                item.style.display = 'flex';
            });
            
            // Agora esconder apenas os itens que o usuário NÃO tem permissão
            const permissionItems = document.querySelectorAll('[data-permission]');
            
            permissionItems.forEach(item => {
                const requiredPermission = item.getAttribute('data-permission');
                
                // Admin tem acesso a tudo - NÃO esconder nada
                if (userData.role === 'admin') {
                    console.log('Admin - mostrando tudo');
                    item.style.display = 'flex';
                    return;
                }
                
                // Verificar se o usuário tem a permissão específica
                const userPermissions = userData.permissions || [];
                const hasPermission = userPermissions.includes(requiredPermission) || 
                                    userData.role === requiredPermission;
                
                console.log(`Permissão ${requiredPermission}: ${hasPermission ? 'SIM' : 'NÃO'}`);
                
                if (!hasPermission) {
                    item.style.display = 'none';
                } else {
                    item.style.display = 'flex';
                }
            });
            
            // Garantir que os headers das seções não sejam escondidos
            const navHeaders = document.querySelectorAll('.nav-header');
            navHeaders.forEach(header => {
                header.style.display = 'block';
            });
        }

        setupEventListeners() {
            // Toggle do dropdown
            if (this.userMenuBtn && this.userDropdown) {
                this.userMenuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleDropdown();
                });

                // Fechar dropdown ao clicar fora
                document.addEventListener('click', (e) => {
                    if (!this.userMenuBtn.contains(e.target) && !this.userDropdown.contains(e.target)) {
                        this.closeDropdown();
                    }
                });

                // Fechar dropdown com ESC
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        this.closeDropdown();
                    }
                });
            }

            // Logout
            if (this.logoutBtn) {
                this.logoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleLogout();
                });
            }
        }

        toggleDropdown() {
            this.userDropdown.classList.toggle('active');
            
            // Animar ícone de chevron
            const chevron = this.userMenuBtn.querySelector('.fa-chevron-down');
            if (chevron) {
                chevron.style.transform = this.userDropdown.classList.contains('active') 
                    ? 'rotate(180deg)' 
                    : 'rotate(0deg)';
            }
        }

        closeDropdown() {
            this.userDropdown.classList.remove('active');
            
            // Resetar ícone de chevron
            const chevron = this.userMenuBtn.querySelector('.fa-chevron-down');
            if (chevron) {
                chevron.style.transform = 'rotate(0deg)';
            }
        }

        async handleLogout() {
            if (confirm('Tem certeza que deseja sair?')) {
                try {
                    await this.performLogout();
                    this.showNotification('Logout realizado com sucesso', 'success');
                    
                    // Redirecionar para login
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 1500);
                    
                } catch (error) {
                    console.error('Erro ao fazer logout:', error);
                    this.showNotification('Erro ao fazer logout', 'error');
                }
            }
        }

        async performLogout() {
            try {
                // Chamar API de logout
                const response = await authenticatedFetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });

                // Limpar dados locais independente da resposta da API
                this.clearLocalData();
                
            } catch (error) {
                console.error('Erro na API de logout:', error);
                // Limpar dados locais mesmo com erro na API
                this.clearLocalData();
            }
        }

        clearLocalData() {
            // Limpar todos os dados de autenticação
            localStorage.removeItem('supabase.auth.token');
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            sessionStorage.clear();
        }

        showLoadingState() {
            if (this.userName) this.userName.textContent = 'Carregando...';
            if (this.userRole) this.userRole.textContent = '...';
        }

        hideLoadingState() {
            // Estado normal é restaurado pelo updateUI
        }

        showErrorState() {
            if (this.userName) this.userName.textContent = 'Erro ao carregar';
            if (this.userRole) this.userRole.textContent = '---';
            this.setDefaultAvatar({ name: 'Erro', role: 'user' });
            
            // Garantir que o menu lateral apareça mesmo com erro
            this.ensureMenuVisibility();
        }

        handleNoUserData() {
            if (this.userName) this.userName.textContent = 'Usuário Não Logado';
            if (this.userRole) this.userRole.textContent = '---';
            this.showNotification('Usuário não autenticado', 'warning');
            
            // Garantir que o menu lateral apareça
            this.ensureMenuVisibility();
            
            // Redirecionar para login após delay
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
        }

        ensureMenuVisibility() {
            // Garantir que todos os itens do menu lateral estejam visíveis
            const allMenuItems = document.querySelectorAll('.sidebar-nav li');
            allMenuItems.forEach(item => {
                item.style.display = 'flex';
            });
            
            const navHeaders = document.querySelectorAll('.nav-header');
            navHeaders.forEach(header => {
                header.style.display = 'block';
            });
        }

        showNotification(message, type = 'info') {
            // Usar o sistema de notificação existente ou criar um simples
            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            notification.innerHTML = `
                <i class="fas fa-${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
            `;
            
            document.body.appendChild(notification);
            
            setTimeout(() => notification.classList.add('show'), 10);
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }, 4000);
        }

        getNotificationIcon(type) {
            const icons = {
                'success': 'check-circle',
                'error': 'exclamation-circle',
                'warning': 'exclamation-triangle',
                'info': 'info-circle'
            };
            return icons[type] || 'info-circle';
        }
    }

    // Inicializar o menu de usuário
    new UserMenu();
});
