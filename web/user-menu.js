// user-menu.js
document.addEventListener('DOMContentLoaded', function() {
    initializeUserMenu();
});

async function initializeUserMenu() {
    try {
        // Verifica se o usuário está autenticado
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            console.warn('Usuário não autenticado');
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

    // Foto do usuário (usando Gravatar ou avatar padrão)
    const avatarUrl = user.user_metadata?.avatar_url || 
                     `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email)}&background=4f46e5&color=fff`;
    
    userAvatar.src = avatarUrl;
    userAvatar.alt = user.user_metadata?.full_name || user.email;

    // Nome do usuário
    userName.textContent = user.user_metadata?.full_name || user.email;

    // Nível de permissão (admin/user)
    const isAdmin = await checkUserPermissions(user.id);
    userRole.textContent = isAdmin ? 'Administrador' : 'Usuário';
    
    // Adiciona classe extra para admin
    if (isAdmin) {
        userRole.classList.add('admin-role');
    }
}

async function checkUserPermissions(userId) {
    try {
        // Aqui você pode implementar a lógica para verificar se o usuário é admin
        // Por enquanto, vou usar uma verificação simples baseada no email
        const { data: { user } } = await supabase.auth.getUser();
        return user.email.endsWith('@admin.com'); // Adapte conforme sua regra
    } catch (error) {
        console.error('Erro ao verificar permissões:', error);
        return false;
    }
}

function setupUserMenuListeners() {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    const logoutBtn = document.getElementById('logoutBtn');

    if (!userMenuBtn || !userDropdown) return;

    // Abrir/fechar dropdown
    userMenuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        userDropdown.classList.toggle('active');
    });

    // Fechar dropdown ao clicar fora
    document.addEventListener('click', function() {
        userDropdown.classList.remove('active');
    });

    // Prevenir que o dropdown feche ao clicar dentro dele
    userDropdown.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            await supabase.auth.signOut();
            window.location.href = '/login.html';
        });
    }
}
