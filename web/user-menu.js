// user-menu.js
document.addEventListener('DOMContentLoaded', function() {
    initializeUserMenu();
});

async function initializeUserMenu() {
    try {
        // Verifica se o Supabase está inicializado
        if (!window.supabase) {
            console.error('Supabase não está inicializado');
            return;
        }

        // Verifica se o usuário está autenticado
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error) {
            console.error('Erro ao obter usuário:', error);
            return;
        }
        
        if (!user) {
            console.warn('Usuário não autenticado');
            // Redirecionar para login se necessário
            // window.location.href = '/login.html';
            return;
        }

        // Atualiza as informações do usuário no menu
        await updateUserMenu(user);
        
        // Configura os event listeners
        setupUserMenuListeners();
        
    } catch (error) {
        console.error('Erro ao inicializar menu do usuário:', error);
    }
}

async function updateUserMenu(user) {
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.querySelector('.user-name');
    const userRole = document.querySelector('.user-role');

    if (!userAvatar || !userName || !userRole) {
        console.warn('Elementos do menu do usuário não encontrados');
        return;
    }

    try {
        // Foto do usuário
        const avatarUrl = user.user_metadata?.avatar_url || 
                        user.user_metadata?.picture ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email || 'U')}&background=4f46e5&color=fff`;
        
        userAvatar.src = avatarUrl;
        userAvatar.alt = user.user_metadata?.full_name || user.email || 'Usuário';

        // Nome do usuário - prioridade: full_name > name > email
        const displayName = user.user_metadata?.full_name || 
                          user.user_metadata?.name || 
                          user.email || 
                          'Usuário';
        userName.textContent = displayName;

        // Nível de permissão (admin/user)
        const isAdmin = await checkUserPermissions(user);
        userRole.textContent = isAdmin ? 'Administrador' : 'Usuário';
        
        // Adiciona classe extra para admin
        if (isAdmin) {
            userRole.classList.add('admin-role');
            userRole.style.color = 'var(--primary)';
            userRole.style.fontWeight = '600';
        }
        
    } catch (error) {
        console.error('Erro ao atualizar menu do usuário:', error);
        // Valores padrão em caso de erro
        userName.textContent = user?.email || 'Usuário';
        userRole.textContent = 'Usuário';
    }
}

async function checkUserPermissions(user) {
    try {
        // Verificação mais robusta das permissões do usuário
        if (!user) return false;

        // 1. Verifica se é admin pelo email (apenas para desenvolvimento)
        if (user.email && (
            user.email.includes('@admin.') || 
            user.email.includes('administrador') ||
            user.email === 'admin@admin.com'
        )) {
            return true;
        }

        // 2. Verifica nos metadados do usuário
        if (user.user_metadata?.role === 'admin' || user.user_metadata?.isAdmin) {
            return true;
        }

        // 3. Verifica se tem permissões específicas
        // Você pode adicionar lógica personalizada aqui baseada no seu sistema

        return false;
    } catch (error) {
        console.error('Erro ao verificar permissões:', error);
        return false;
    }
}

function setupUserMenuListeners() {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    const logoutBtn = document.getElementById('logoutBtn');

    if (!userMenuBtn || !userDropdown) {
        console.warn('Elementos do menu não encontrados');
        return;
    }

    // Abrir/fechar dropdown
    userMenuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const isActive = userDropdown.classList.contains('active');
        
        // Fecha todos os dropdowns abertos
        document.querySelectorAll('.user-dropdown.active').forEach(dropdown => {
            if (dropdown !== userDropdown) {
                dropdown.classList.remove('active');
            }
        });
        
        userDropdown.classList.toggle('active');
    });

    // Fechar dropdown ao clicar fora
    document.addEventListener('click', function(e) {
        if (!userDropdown.contains(e.target) && !userMenuBtn.contains(e.target)) {
            userDropdown.classList.remove('active');
        }
    });

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            try {
                await supabase.auth.signOut();
                window.location.href = '/login.html';
            } catch (error) {
                console.error('Erro ao fazer logout:', error);
            }
        });
    }

    // Tecla Escape para fechar dropdown
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            userDropdown.classList.remove('active');
        }
    });
}

// Adiciona estilos CSS para o admin role
const adminRoleStyles = `
    .admin-role {
        color: var(--primary) !important;
        font-weight: 600 !important;
    }
`;

// Injeta os estilos no documento
if (!document.querySelector('#admin-role-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'admin-role-styles';
    styleElement.textContent = adminRoleStyles;
    document.head.appendChild(styleElement);
}

// Exporta funções para uso global (opcional)
window.userMenu = {
    initialize: initializeUserMenu,
    update: updateUserMenu
};
