// web/auth.js

const SUPABASE_URL = 'https://zhaetrzpkkgzfrwxfqdw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYWV0cnpwa2tnemZyd3hmcWR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjM3MzksImV4cCI6MjA3Mjk5OTczOX0.UHoWWZahvp_lMDH8pK539YIAFTAUnQk9mBX5tdixwN0';

const supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY );
let currentUserProfile = null;
let sessionPromise = null; // Variável para "segurar" a promessa da sessão

/**
 * Função para obter a sessão de forma segura, evitando múltiplas chamadas.
 */
function getSession() {
    if (!sessionPromise) {
        sessionPromise = supabase.auth.getSession();
    }
    return sessionPromise;
}

/**
 * Função centralizada para requisições autenticadas.
 * Agora ela é mais robusta e aguarda a sessão ser resolvida.
 */
async function authenticatedFetch(url, options = {}) {
    const { data: { session }, error: sessionError } = await getSession();

    if (sessionError || !session) {
        console.error("Sessão inválida ou expirada. Redirecionando para login.", sessionError);
        await signOut(); // Força o logout e redirecionamento
        throw new Error("Sessão não encontrada.");
    }

    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
    };

    const finalOptions = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        }
    };

    return fetch(url, finalOptions);
}

async function getAuthUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

/**
 * Busca o perfil do usuário. Se já foi buscado, retorna o cache.
 * Contém lógica para lidar com falhas de autorização.
 */
async function fetchUserProfile() {
    if (currentUserProfile) return currentUserProfile;

    // A sessão é verificada dentro da authenticatedFetch agora
    try {
        const response = await authenticatedFetch('/api/users/me'); // URL da sua API para buscar o perfil

        if (!response.ok) {
            // Se o token for inválido (401) ou o usuário não for encontrado (404), desloga.
            if (response.status === 401 || response.status === 404) {
                console.warn(`Falha ao buscar perfil (Status: ${response.status}). Deslogando.`);
                await signOut();
                return null;
            }
            // Para outros erros de servidor, apenas lança o erro.
            throw new Error(`Falha ao buscar perfil do usuário. Status: ${response.status}`);
        }

        currentUserProfile = await response.json();
        return currentUserProfile;
    } catch (error) {
        // O erro de "Sessão não encontrada" já redireciona, então não precisamos fazer nada.
        if (error.message !== "Sessão não encontrada.") {
            console.error("Erro crítico ao buscar perfil do usuário:", error);
        }
        return null;
    }
}

async function signOut() {
    await supabase.auth.signOut();
    currentUserProfile = null;
    sessionPromise = null; // Limpa a promessa da sessão
    // Redireciona para a página de login, limpando o histórico para evitar loops com o botão "voltar"
    window.location.replace('/login.html');
}

/**
 * Protege uma rota, verificando se o usuário está logado e tem as permissões necessárias.
 */
async function routeGuard(requiredPermission = null) {
    const profile = await fetchUserProfile(); // A função agora é a única fonte da verdade

    if (!profile) {
        // Se o perfil não for carregado, a fetchUserProfile já terá redirecionado para o login.
        // Esta parte serve como uma segurança extra.
        if (!window.location.pathname.includes('/login.html')) {
             window.location.href = `/login.html?redirect=${window.location.pathname}`;
        }
        return;
    }

    if (requiredPermission) {
        const isAdmin = profile.role === 'admin';
        const hasPermission = profile.allowed_pages && profile.allowed_pages.includes(requiredPermission);

        if (!isAdmin && !hasPermission) {
            alert('Você não tem permissão para acessar esta página.');
            // Redireciona para uma página segura padrão
            window.location.href = '/search.html';
        }
    }
}

/**
 * Atualiza a visibilidade de elementos da UI com base no perfil do usuário.
 */
async function updateUIVisibility() {
    const profile = await fetchUserProfile();
    const userProfileMenu = document.getElementById('userProfileMenu');
    const navLinks = document.querySelectorAll('.sidebar-nav [data-permission]');

    if (profile) {
        if (userProfileMenu) {
            userProfileMenu.style.display = 'flex';
            const userName = document.getElementById('userName');
            const userAvatar = document.getElementById('userAvatar');
            if (userName) userName.textContent = profile.full_name || 'Usuário';
            if (userAvatar && profile.avatar_url) userAvatar.src = profile.avatar_url;
        }
        navLinks.forEach(link => {
            const permission = link.getAttribute('data-permission');
            if (profile.role === 'admin' || (profile.allowed_pages && profile.allowed_pages.includes(permission))) {
                link.style.display = 'list-item';
            } else {
                link.style.display = 'none';
            }
        });
    } else {
        // Se não há perfil, esconde tudo
        if (userProfileMenu) userProfileMenu.style.display = 'none';
        navLinks.forEach(link => link.style.display = 'none');
    }
}

// Eventos de UI podem ser adicionados aqui, se necessário.
document.addEventListener('DOMContentLoaded', () => {
    // Exemplo: configurar botão de logout se ele existir em múltiplas páginas
    const logoutButton = document.querySelector('.logout-button'); // Use uma classe comum
    if (logoutButton) {
        logoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            signOut();
        });
    }
});
