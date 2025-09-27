// user-menu.js (Refatorado para usar a lógica de perfil centralizada de auth.js)

document.addEventListener('DOMContentLoaded', function() {
    // Usamos o initializeUserMenuUI para evitar conflito de nomes
    initializeUserMenuUI();
});

async function initializeUserMenuUI() {
    try {
        // CHAMA A FUNÇÃO CENTRALIZADA DE auth.js. Ela verifica a sessão, busca o perfil e faz cache.
        const profile = await fetchUserProfile(); 
        
        if (!profile) {
            // Se o profile não existir, o usuário não está logado ou a sessão é inválida.
            // O auth.js já lida com o redirecionamento.
            return;
        }

        // Obtém o objeto 'user' do Supabase para metadados (se necessário)
        const user = await getAuthUser();

        // Atualiza as informações do usuário no menu
        await updateUserMenu(profile, user);
        
        // Configura os event listeners
        setupUserMenuListeners();
        
    } catch (error) {
        console.error('Erro ao inicializar menu do usuário:', error);
    }
}

async function updateUserMenu(profile, user) {
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.querySelector('.user-name');
    const userRole = document.querySelector('.user-role');

    if (!userAvatar || !userName || !userRole) {
        console.warn('Elementos do menu do usuário não encontrados');
        return;
    }

    // Foto do usuário (usando Gravatar ou avatar padrão)
    const avatarUrl = user?.user_metadata?.avatar_url || 
                     `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.email || profile.full_name || 'Usuário')}&background=4f46e5&color=fff`;
    
    userAvatar.src = avatarUrl;
    userAvatar.alt = profile.full_name || user?.email || 'Usuário';

    // Nome do usuário
    userName.textContent = profile.full_name || user?.email || 'Usuário';

    // Nível de permissão (agora depende do objeto 'profile' já obtido)
    const isAdmin = profile.role === 'admin';
    userRole.textContent = isAdmin ? 'Administrador' : 'Usuário';
    
    // Adiciona classe extra para admin
    if (isAdmin) {
        userRole.classList.add('admin-role');
    }
}

// A função checkUserPermissions foi removida por ser redundante e usar uma lógica fraca (endswith('@admin.com')).
// A verificação de permissão agora é feita diretamente no objeto 'profile' que é mais confiável.


function setupUserMenuListeners() {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    const logoutBtn = document.getElementById('logoutBtn');

    if (!userMenuBtn || !userDropdown) return;

    // Abrir/fechar dropdown (Lógica de UI mantida)
    userMenuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        userDropdown.classList.toggle('active');
    });

    // Fechar dropdown ao clicar fora (Lógica de UI mantida)
    document.addEventListener('click', function() {
        userDropdown.classList.remove('active');
    });

    // Prevenir que o dropdown feche ao clicar dentro dele (Lógica de UI mantida)
    userDropdown.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            // Chama a função global 'signOut()' de auth.js, que cuida de limpar e redirecionar
            await signOut(); 
        });
    }
}
