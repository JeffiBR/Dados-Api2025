// profile.js - ADAPTADO PARA auth.js EXISTENTE

class ProfileManager {
    constructor() {
        this.currentUser = null;
        this.avatarFile = null;
        this.init();
    }

    async init() {
        try {
            // Aguardar inicialização da autenticação
            if (typeof initAuth === 'function' && !window.isInitialized) {
                await initAuth();
            }

            // Verificar autenticação
            if (!await checkAuth()) {
                console.error('Usuário não autenticado');
                return;
            }

            await this.loadUserProfile();
            this.setupEventListeners();
            await this.loadAccessInfo();

        } catch (error) {
            console.error('Erro na inicialização do ProfileManager:', error);
        }
    }

    async loadUserProfile() {
        try {
            this.showLoading();
            console.log('🔍 Carregando perfil do usuário...');

            // Usar a função fetchUserProfile do auth.js que já tem cache
            const userData = await fetchUserProfile(true); // forceRefresh para garantir dados atualizados

            if (!userData) {
                throw new Error('Não foi possível carregar o perfil do usuário');
            }

            this.currentUser = userData;
            this.populateProfileForm(userData);
            this.updateUserAvatar(userData.avatar_url);

            console.log('✅ Perfil carregado com sucesso:', {
                id: userData.id,
                nome: userData.full_name,
                role: userData.role
            });

        } catch (error) {
            console.error('❌ Erro ao carregar perfil:', error);
            this.showMessage('Erro ao carregar informações do perfil', 'error');

            // Tentar fallback com dados básicos do auth
            try {
                const authUser = await getAuthUser();
                if (authUser) {
                    this.currentUser = {
                        full_name: authUser.user_metadata?.full_name || authUser.email,
                        email: authUser.email,
                        job_title: authUser.user_metadata?.job_title || '',
                        role: authUser.user_metadata?.role || 'user',
                        avatar_url: authUser.user_metadata?.avatar_url
                    };
                    this.populateProfileForm(this.currentUser);
                    this.updateUserAvatar(this.currentUser.avatar_url);
                    this.showMessage('Carregado informações básicas do perfil', 'info');
                }
            } catch (fallbackError) {
                console.error('Erro no fallback:', fallbackError);
            }
        } finally {
            this.hideLoading();
        }
    }

    populateProfileForm(userData) {
        document.getElementById('fullName').value = userData.full_name || '';
        document.getElementById('email').value = userData.email || '';
        document.getElementById('jobTitle').value = userData.job_title || '';
        document.getElementById('userRole').value = this.getRoleDisplayName(userData.role);

        // Atualizar avatar se existir
        if (userData.avatar_url) {
            this.updateUserAvatar(userData.avatar_url);
        }

        // Atualizar header imediatamente
        this.updateHeaderInfo();
    }

    getRoleDisplayName(role) {
        const roles = {
            'admin': 'Administrador',
            'group_admin': 'Administrador de Grupo',
            'user': 'Usuário',
            'subadmin': 'Subadministrador'
        };
        return roles[role] || role;
    }

    updateUserAvatar(avatarUrl) {
        const avatarImg = document.getElementById('profileAvatar');
        const headerAvatar = document.getElementById('userAvatar');

        if (avatarUrl) {
            avatarImg.src = avatarUrl;
            headerAvatar.src = avatarUrl;
        } else {
            // Usar avatar padrão baseado no nome
            const name = this.currentUser?.full_name || this.currentUser?.email || 'U';
            const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4f46e5&color=fff&bold=true`;
            avatarImg.src = defaultAvatar;
            headerAvatar.src = defaultAvatar;
        }
    }

    setupEventListeners() {
        // Formulário de perfil
        document.getElementById('profileForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateProfile();
        });

        // Formulário de senha
        document.getElementById('passwordForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.changePassword();
        });

        // Avatar
        document.getElementById('changeAvatarBtn').addEventListener('click', () => {
            document.getElementById('avatarInput').click();
        });

        document.getElementById('avatarInput').addEventListener('change', (e) => {
            this.handleAvatarSelect(e.target.files[0]);
        });

        document.getElementById('removeAvatarBtn').addEventListener('click', () => {
            this.removeAvatar();
        });

        // Modal de avatar
        document.getElementById('closeAvatarModal').addEventListener('click', () => {
            this.closeAvatarModal();
        });

        document.getElementById('confirmAvatarBtn').addEventListener('click', () => {
            this.confirmAvatar();
        });

        document.getElementById('cancelAvatarBtn').addEventListener('click', () => {
            this.closeAvatarModal();
        });

        // Toggle de senha - CORREÇÃO APLICADA
        document.querySelectorAll('.password-toggle').forEach(button => {
            const targetId = button.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (input) {
                // Definir estado inicial correto
                button.setAttribute('aria-label', 
                    input.type === 'password' ? 'Mostrar senha' : 'Ocultar senha'
                );
            }

            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.togglePasswordVisibility(button);
            });
        });

        // Força da senha
        document.getElementById('newPassword').addEventListener('input', (e) => {
            this.checkPasswordStrength(e.target.value);
        });

        // Subscribe para mudanças de autenticação
        if (typeof subscribeToAuthStateChange === 'function') {
            subscribeToAuthStateChange(() => {
                console.log('🔄 Auth state changed - reloading profile');
                this.loadUserProfile();
                this.loadAccessInfo();
            });
        }
    }

    async updateProfile() {
        try {
            this.showLoading();

            const formData = new FormData(document.getElementById('profileForm'));
            const profileData = {
                full_name: formData.get('fullName'),
                job_title: formData.get('jobTitle'),
                email: formData.get('email')
            };

            // Remover campos vazios
            Object.keys(profileData).forEach(key => {
                if (!profileData[key]) delete profileData[key];
            });

            console.log('📝 Atualizando perfil:', profileData);

            // Usar authenticatedFetch do auth.js
            const response = await authenticatedFetch('/api/users/me', {
                method: 'PUT',
                body: JSON.stringify(profileData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Erro ao atualizar perfil');
            }

            const updatedData = await response.json();
            this.currentUser = { ...this.currentUser, ...updatedData };
            this.updateUserAvatar(updatedData.avatar_url);

            // Limpar cache do perfil para forçar recarregamento
            if (typeof clearUserProfileCache === 'function') {
                clearUserProfileCache();
            }

            this.showMessage('Perfil atualizado com sucesso!', 'success');

            // Atualizar header
            this.updateHeaderInfo();

            // Recarregar perfil para garantir sincronização
            setTimeout(() => this.loadUserProfile(), 500);

        } catch (error) {
            console.error('❌ Erro ao atualizar perfil:', error);

            if (error.message.includes('Não autorizado') || error.message.includes('Sessão expirada')) {
                this.showMessage('Sessão expirada. Faça login novamente.', 'error');
                if (typeof handleAuthError === 'function') {
                    handleAuthError();
                }
            } else {
                this.showMessage(error.message, 'error');
            }
        } finally {
            this.hideLoading();
        }
    }

    async changePassword() {
        try {
            this.showLoading();

            const formData = new FormData(document.getElementById('passwordForm'));
            const passwordData = {
                current_password: formData.get('currentPassword'),
                new_password: formData.get('newPassword')
            };

            // Verificar se as senhas coincidem
            if (formData.get('newPassword') !== formData.get('confirmPassword')) {
                throw new Error('As senhas não coincidem');
            }

            console.log('🔐 Alterando senha...');

            // Usar authenticatedFetch do auth.js
            const response = await authenticatedFetch('/api/users/me/password', {
                method: 'PUT',
                body: JSON.stringify(passwordData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Erro ao alterar senha');
            }

            this.showMessage('Senha alterada com sucesso!', 'success');
            document.getElementById('passwordForm').reset();
            this.checkPasswordStrength('');

        } catch (error) {
            console.error('❌ Erro ao alterar senha:', error);

            if (error.message.includes('Não autorizado') || error.message.includes('Sessão expirada')) {
                this.showMessage('Sessão expirada. Faça login novamente.', 'error');
                if (typeof handleAuthError === 'function') {
                    handleAuthError();
                }
            } else {
                this.showMessage(error.message, 'error');
            }
        } finally {
            this.hideLoading();
        }
    }

    handleAvatarSelect(file) {
        if (!file) return;

        // Validar tipo de arquivo
        if (!file.type.startsWith('image/')) {
            this.showMessage('Por favor, selecione uma imagem válida', 'error');
            return;
        }

        // Validar tamanho do arquivo (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            this.showMessage('A imagem deve ter no máximo 5MB', 'error');
            return;
        }

        this.avatarFile = file;
        this.showAvatarPreview(file);
    }

    showAvatarPreview(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('avatarPreview').src = e.target.result;
            document.getElementById('avatarModal').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }

    closeAvatarModal() {
        document.getElementById('avatarModal').style.display = 'none';
        document.getElementById('avatarInput').value = '';
        this.avatarFile = null;
    }

    async confirmAvatar() {
        if (!this.avatarFile) return;

        try {
            this.showLoading();

            // Fazer upload da imagem usando FormData
            const formData = new FormData();
            formData.append('avatar', this.avatarFile);

            console.log('🖼️ Fazendo upload do avatar...');

            // Usar authenticatedFetch para upload
            const response = await authenticatedFetch('/api/upload-avatar', {
                method: 'POST',
                headers: {
                    // Não definir Content-Type - o browser vai definir com boundary
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error('Erro ao fazer upload do avatar');
            }

            const { avatarUrl } = await response.json();

            // Atualizar perfil com nova URL do avatar
            const updateResponse = await authenticatedFetch('/api/users/me', {
                method: 'PUT',
                body: JSON.stringify({ avatar_url: avatarUrl })
            });

            if (!updateResponse.ok) {
                throw new Error('Erro ao atualizar avatar no perfil');
            }

            this.updateUserAvatar(avatarUrl);
            this.closeAvatarModal();

            // Limpar cache do perfil
            if (typeof clearUserProfileCache === 'function') {
                clearUserProfileCache();
            }

            this.showMessage('Avatar atualizado com sucesso!', 'success');

        } catch (error) {
            console.error('❌ Erro ao atualizar avatar:', error);

            if (error.message.includes('Não autorizado') || error.message.includes('Sessão expirada')) {
                this.showMessage('Sessão expirada. Faça login novamente.', 'error');
                if (typeof handleAuthError === 'function') {
                    handleAuthError();
                }
            } else {
                this.showMessage('Erro ao atualizar avatar', 'error');
            }
        } finally {
            this.hideLoading();
        }
    }

    async removeAvatar() {
        try {
            this.showLoading();

            console.log('🗑️ Removendo avatar...');

            const response = await authenticatedFetch('/api/users/me', {
                method: 'PUT',
                body: JSON.stringify({ avatar_url: null })
            });

            if (!response.ok) {
                throw new Error('Erro ao remover avatar');
            }

            this.updateUserAvatar(null);

            // Limpar cache do perfil
            if (typeof clearUserProfileCache === 'function') {
                clearUserProfileCache();
            }

            this.showMessage('Avatar removido com sucesso!', 'success');

        } catch (error) {
            console.error('❌ Erro ao remover avatar:', error);

            if (error.message.includes('Não autorizado') || error.message.includes('Sessão expirada')) {
                this.showMessage('Sessão expirada. Faça login novamente.', 'error');
                if (typeof handleAuthError === 'function') {
                    handleAuthError();
                }
            } else {
                this.showMessage('Erro ao remover avatar', 'error');
            }
        } finally {
            this.hideLoading();
        }
    }

    async loadAccessInfo() {
        try {
            console.log('🔍 Carregando informações de acesso...');

            // Usar a função getUserAccessStatus do auth.js
            const accessData = await getUserAccessStatus();
            this.updateAccessInfo(accessData);

        } catch (error) {
            console.error('❌ Erro ao carregar informações de acesso:', error);

            // Fallback para dados básicos
            const profile = await fetchUserProfile();
            this.updateAccessInfo({
                is_admin: profile?.role === 'admin',
                has_access: true,
                active_groups: [],
                expired_groups: []
            });
        }
    }

    updateAccessInfo(accessData) {
        const accessTypeEl = document.getElementById('accessType');
        const daysRemainingEl = document.getElementById('daysRemaining');
        const expirationDateEl = document.getElementById('expirationDate');
        const adminInfoEl = document.getElementById('adminInfo');
        const groupsSectionEl = document.getElementById('groupsSection');
        const statusBadge = document.querySelector('.status-badge');
        const statusIcon = document.querySelector('.status-icon');

        if (!accessData) return;

        // Atualizar status do acesso
        if (accessData.is_admin) {
            accessTypeEl.textContent = 'Administrador';
            adminInfoEl.style.display = 'block';
            groupsSectionEl.style.display = 'none';

            daysRemainingEl.textContent = 'Ilimitado';
            expirationDateEl.textContent = 'Não expira';

            // Atualizar badge e ícone
            statusBadge.className = 'status-badge active';
            statusBadge.textContent = 'Ativo';
            statusIcon.className = 'fas fa-crown status-icon';

        } else {
            accessTypeEl.textContent = 'Usuário';
            adminInfoEl.style.display = 'none';

            if (accessData.has_access) {
                this.displayGroupsInfo(accessData.active_groups);
                groupsSectionEl.style.display = 'block';

                // Calcular dias restantes
                const nearestExpiration = this.getNearestExpiration(accessData.active_groups);
                if (nearestExpiration) {
                    const daysRemaining = this.calculateDaysRemaining(nearestExpiration);
                    daysRemainingEl.textContent = daysRemaining;
                    expirationDateEl.textContent = new Date(nearestExpiration).toLocaleDateString('pt-BR');

                    // Atualizar badge baseado nos dias restantes
                    if (daysRemaining <= 7) {
                        statusBadge.className = 'status-badge warn';
                        statusBadge.textContent = 'Expirando em breve';
                        statusIcon.className = 'fas fa-exclamation-triangle status-icon';
                    } else {
                        statusBadge.className = 'status-badge active';
                        statusBadge.textContent = 'Ativo';
                        statusIcon.className = 'fas fa-user-check status-icon';
                    }
                }
            } else {
                daysRemainingEl.textContent = 'Expirado';
                expirationDateEl.textContent = 'Acesso expirado';
                groupsSectionEl.style.display = 'none';

                statusBadge.className = 'status-badge expired';
                statusBadge.textContent = 'Expirado';
                statusIcon.className = 'fas fa-user-times status-icon';
            }
        }
    }

    displayGroupsInfo(groups) {
        const groupsListEl = document.getElementById('groupsList');

        if (!groups || groups.length === 0) {
            groupsListEl.innerHTML = '<p class="no-groups">Nenhum grupo ativo</p>';
            return;
        }

        groupsListEl.innerHTML = groups.map(group => `
            <div class="group-card">
                <div class="group-header">
                    <h4 class="group-name">${group.group_name}</h4>
                    <span class="group-days">${group.dias_acesso} dias</span>
                </div>
                <div class="group-expiration">
                    Expira em: ${new Date(group.data_expiracao_user).toLocaleDateString('pt-BR')}
                </div>
            </div>
        `).join('');
    }

    getNearestExpiration(groups) {
        if (!groups || groups.length === 0) return null;

        const now = new Date();
        const futureExpirations = groups
            .map(g => new Date(g.data_expiracao_user))
            .filter(date => date > now)
            .sort((a, b) => a - b);

        return futureExpirations.length > 0 ? futureExpirations[0] : null;
    }

    calculateDaysRemaining(expirationDate) {
        const now = new Date();
        const expDate = new Date(expirationDate);
        const diffTime = expDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
    }

    // CORREÇÃO COMPLETA - Função togglePasswordVisibility
    togglePasswordVisibility(button) {
        const targetId = button.getAttribute('data-target');
        const input = document.getElementById(targetId);
        const icon = button.querySelector('i');

        if (!input) {
            console.error('Input não encontrado:', targetId);
            return;
        }

        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
            button.setAttribute('aria-label', 'Ocultar senha');
            button.style.color = 'var(--primary)';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye';
            button.setAttribute('aria-label', 'Mostrar senha');
            button.style.color = '';
        }

        // Manter o foco no input após o toggle
        setTimeout(() => input.focus(), 10);
    }

    checkPasswordStrength(password) {
        const strengthBar = document.querySelector('.strength-bar');
        const strengthText = document.querySelector('.strength-text');

        let strength = 0;
        let feedback = '';

        if (password.length >= 8) strength++;
        if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
        if (password.match(/\d/)) strength++;
        if (password.match(/[^a-zA-Z\d]/)) strength++;

        switch (strength) {
            case 0:
                feedback = 'Muito fraca';
                strengthBar.className = 'strength-bar';
                break;
            case 1:
                feedback = 'Fraca';
                strengthBar.className = 'strength-bar weak';
                break;
            case 2:
                feedback = 'Moderada';
                strengthBar.className = 'strength-bar medium';
                break;
            case 3:
                feedback = 'Forte';
                strengthBar.className = 'strength-bar strong';
                break;
            case 4:
                feedback = 'Muito forte';
                strengthBar.className = 'strength-bar very-strong';
                break;
        }

        strengthText.textContent = feedback;
    }

    updateHeaderInfo() {
        if (this.currentUser) {
            const userNameEl = document.querySelector('.user-name');
            const userRoleEl = document.querySelector('.user-role');

            if (userNameEl) {
                userNameEl.textContent = this.currentUser.full_name || this.currentUser.email || 'Usuário';
            }

            if (userRoleEl) {
                userRoleEl.textContent = this.getRoleDisplayName(this.currentUser.role);
            }
        }
    }

    showMessage(message, type) {
        // Remover mensagens existentes
        const existingMessages = document.querySelectorAll('.success-message, .error-message, .info-message');
        existingMessages.forEach(msg => msg.remove());

        const messageEl = document.createElement('div');
        messageEl.className = `${type}-message profile-message`;
        messageEl.textContent = message;

        // Adicionar ícone baseado no tipo
        let icon = '';
        switch (type) {
            case 'success':
                icon = 'fas fa-check-circle';
                break;
            case 'error':
                icon = 'fas fa-exclamation-circle';
                break;
            case 'info':
                icon = 'fas fa-info-circle';
                break;
        }

        messageEl.innerHTML = `<i class="${icon}"></i> ${message}`;

        // Inserir no início do conteúdo principal
        const profilePanel = document.querySelector('.profile-panel');
        if (profilePanel) {
            profilePanel.insertBefore(messageEl, profilePanel.firstChild);

            // Remover automaticamente após 5 segundos
            setTimeout(() => {
                if (messageEl.parentNode) {
                    messageEl.remove();
                }
            }, 5000);
        }
    }

    showLoading() {
        document.body.classList.add('loading');
    }

    hideLoading() {
        document.body.classList.remove('loading');
    }
}

// Inicializar quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    // Aguardar um pouco para garantir que o auth.js foi carregado
    setTimeout(() => {
        new ProfileManager();
    }, 100);
});

// Fechar modal ao clicar fora
document.addEventListener('click', (e) => {
    const modal = document.getElementById('avatarModal');
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// Adicionar CSS para as mensagens do perfil e correções
const profileStyles = `
.profile-message {
    padding: 1rem 1.5rem;
    border-radius: 12px;
    margin-bottom: 1.5rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    animation: slideInDown 0.3s ease;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
    border: 1px solid transparent;
    position: relative;
    overflow: hidden;
}

.profile-message::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    width: 4px;
    background: currentColor;
    opacity: 0.3;
}

.profile-message.success-message {
    background: rgba(22, 163, 74, 0.1);
    color: var(--success);
    border-color: rgba(22, 163, 74, 0.2);
}

.profile-message.error-message {
    background: rgba(239, 68, 68, 0.1);
    color: var(--error);
    border-color: rgba(239, 68, 68, 0.2);
}

.profile-message.info-message {
    background: rgba(59, 130, 246, 0.1);
    color: #3b82f6;
    border-color: rgba(59, 130, 246, 0.2);
}

.strength-bar.very-strong::before {
    width: 100%;
    background: linear-gradient(90deg, var(--success), #10b981);
    box-shadow: 0 0 10px rgba(22, 163, 74, 0.3);
}

.status-badge.warn {
    background: var(--warn);
    color: white;
    border-color: rgba(245, 158, 11, 0.3);
}

.status-badge.expired {
    background: var(--error);
    color: white;
    border-color: rgba(239, 68, 68, 0.3);
}

@keyframes slideInDown {
    from {
        opacity: 0;
        transform: translateY(-20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* CORREÇÃO DEFINITIVA PARA OS BOTÕES DE SENHA */
.password-toggle {
    position: absolute !important;
    right: 16px !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    background: none !important;
    border: none !important;
    color: var(--muted-dark) !important;
    cursor: pointer !important;
    padding: 0.75rem !important;
    border-radius: 8px !important;
    transition: var(--transition-smooth) !important;
    z-index: 10 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 44px !important;
    height: 44px !important;
    margin: 0 !important;
}

body.light-mode .password-toggle {
    color: var(--muted-light) !important;
}

.password-toggle:hover {
    color: var(--primary) !important;
    background: rgba(79, 70, 229, 0.1) !important;
    transform: translateY(-50%) scale(1.1) !important;
}

.form-group input[type="password"],
.form-group input[type="text"] {
    padding-right: 4rem !important;
}

.form-group input {
    height: 56px !important;
    box-sizing: border-box !important;
}

/* Garantir que o container tenha posição relativa */
.form-group {
    position: relative !important;
}

/* Responsividade */
@media (max-width: 768px) {
    .password-toggle {
        right: 12px !important;
        width: 40px !important;
        height: 40px !important;
        padding: 0.6rem !important;
    }

    .form-group input[type="password"],
    .form-group input[type="text"] {
        padding-right: 3.5rem !important;
    }
}

@media (max-width: 480px) {
    .password-toggle {
        right: 10px !important;
        width: 36px !important;
        height: 36px !important;
        padding: 0.5rem !important;
    }

    .form-group input[type="password"],
    .form-group input[type="text"] {
        padding-right: 3.2rem !important;
    }

    .form-group input {
        height: 52px !important;
        padding: 1rem 1.25rem !important;
    }
}
`;

// Adicionar estilos ao documento
const styleSheet = document.createElement('style');
styleSheet.textContent = profileStyles;
document.head.appendChild(styleSheet);

console.log('✅ profile.js carregado - Adaptado para auth.js existente');