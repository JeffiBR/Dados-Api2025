// web/auth.js

const SUPABASE_URL = 'https://zhaetrzpkkgzfrwxfqdw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYWV0cnpwa2tnemZyd3hmcWR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjM3MzksImV4cCI6MjA3Mjk5OTczOX0.UHoWWZahvp_lMDH8pK539YIAFTAUnQk9mBX5tdixwN0';

const supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUserProfile = null;

/**
 * Função centralizada para requisições autenticadas.
 * Ela cuida de obter o token e adicioná-lo aos cabeçalhos.
 */
async function authenticatedFetch(url, options = {}) {
    const session = await getSession();

    if (!session) {
        showError("Sessão expirada", "Sua sessão expirou ou é inválida. Por favor, faça login novamente.", 5000);
        window.location.href = '/login.html';
        // Lança um erro para interromper a execução da função que a chamou
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

// --- O resto do arquivo auth.js (funções de suporte) ---

async function getAuthUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

async function fetchUserProfile() {
    if (currentUserProfile) return currentUserProfile;
    const session = await getSession();
    if (!session) return null;
    try {
        // Usa a própria authenticatedFetch para buscar o perfil
        const response = await authenticatedFetch('/api/users/me');
        if (!response.ok) {
            if (response.status === 401 || response.status === 404) { await signOut(); return null; }
            throw new Error('Falha ao buscar perfil.');
        }
        currentUserProfile = await response.json();
        return currentUserProfile;
    } catch (error) {
        console.error("Erro ao buscar perfil do usuário:", error);
        return null;
    }
}

async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

async function signOut() {
    await supabase.auth.signOut();
    currentUserProfile = null;
    showSuccess("Até logo!", "Você foi desconectado com sucesso.", 3000);
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 1000);
}

async function routeGuard(requiredPermission = null) {
    const user = await getAuthUser();
    if (!user) {
        window.location.href = `/login.html?redirect=${window.location.pathname}`;
        return;
    }
    if (requiredPermission) {
        const profile = await fetchUserProfile();
        if (!profile || (profile.role !== 'admin' && (!profile.allowed_pages || !profile.allowed_pages.includes(requiredPermission)))) {
            showError("Acesso negado", "Você não tem permissão para acessar esta página.", 5000);
            setTimeout(() => {
                window.location.href = '/search.html';
            }, 2000);
        }
    }
}

async function updateUIVisibility() {
    const profile = await fetchUserProfile();
    const userProfileMenu = document.getElementById('userProfileMenu');
    const navLinks = document.querySelectorAll('.sidebar-nav [data-permission]');
    
    if (profile) {
        if (userProfileMenu) {
            userProfileMenu.style.display = 'flex';
            const userName = document.getElementById('userName');
            const userRole = document.getElementById('userRole');
            const userAvatar = document.getElementById('userAvatar');
            
            if(userName) userName.textContent = profile.full_name || 'Usuário';
            if(userRole) {
                const roleText = profile.role === 'admin' ? 'Administrador' : 'Usuário';
                userRole.textContent = roleText;
            }
            if(userAvatar && profile.avatar_url) userAvatar.src = profile.avatar_url;
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
        if (userProfileMenu) userProfileMenu.style.display = 'none';
        navLinks.forEach(link => link.style.display = 'none');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // ... (código de eventos como logout, menu mobile e tema)
});