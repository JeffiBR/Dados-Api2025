// auth.js - VERSÃO CORRIGIDA E OTIMIZADA

const SUPABASE_URL = 'https://zhaetrzpkkgzfrwxfqdw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYWV0cnpwa2tnemZyd3hmcWR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjM3MzksImV4cCI6MjA3Mjk5OTczOX0.UHoWWZahvp_lMDH8pK539YIAFTAUnQk9mBX5tdixwN0';

const supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY );
let currentUserProfile = null; // Variável de cache em memória

// =========================================================================
// FUNÇÕES DE AUTENTICAÇÃO PRINCIPAIS
// =========================================================================

/**
 * [CORRIGIDO] Função para renovar o token de acesso.
 * Esta era a função que estava faltando e causava o erro.
 */
async function handleTokenRefresh() {
    console.log('🔄 Token expirado. Tentando renovar a sessão...');
    const { data, error } = await supabase.auth.refreshSession();

    if (error) {
        console.error('❌ Falha ao renovar a sessão. Redirecionando para login.', error);
        // Se a renovação falhar (ex: refresh token inválido), desloga o usuário.
        await signOut(); 
        return null;
    }

    console.log('✅ Sessão renovada com sucesso.');
    // Limpa o cache do perfil para garantir que os dados sejam recarregados com a nova sessão.
    clearUserProfileCache();
    return data.session;
}

/**
 * Obtém a sessão atual. Se a sessão não existir, tenta renová-la.
 */
async function getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
        console.error('Erro ao obter sessão:', error);
        return null;
    }
    // Se não há sessão ativa, mas pode haver um refresh token, tenta renovar.
    if (!data.session) {
        return await handleTokenRefresh();
    }
    return data.session;
}

/**
 * [REMOVIDO] A função `authenticatedFetch` foi removida deste arquivo.
 * Cada script (como cesta.js) deve ter sua própria implementação de `authenticatedFetch`,
 * pois isso torna o código mais modular e fácil de depurar. A lógica de `cesta.js`
 * já chama `handleTokenRefresh()` corretamente.
 */

/**
 * Busca o usuário autenticado no Supabase.
 */
async function getAuthUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

/**
 * Busca o perfil completo do usuário (com role e permissões).
 * Usa um cache em memória para evitar requisições repetidas.
 */
async function fetchUserProfile() {
    if (currentUserProfile) {
        console.log('👤 Usando perfil do cache em memória (auth.js)');
        return currentUserProfile;
    }

    const user = await getAuthUser();
    if (!user) return null;

    try {
        console.log('🌐 Buscando perfil do servidor...');
        const { data, error, status } = await supabase
            .from('profiles')
            .select('id, full_name, role, allowed_pages, avatar_url, email')
            .eq('id', user.id)
            .single();

        if (error) {
            // Se o perfil não for encontrado ou houver erro de autorização, desloga.
            if (status === 404 || status === 401) {
                console.warn('Perfil não encontrado ou não autorizado. Deslogando...');
                await signOut();
                return null;
            }
            throw error;
        }
        
        // Adiciona o email do objeto de autenticação ao perfil
        data.email = user.email;
        currentUserProfile = data; // Salva no cache
        return currentUserProfile;

    } catch (error) {
        console.error("Erro em fetchUserProfile:", error);
        return null;
    }
}

/**
 * Realiza o logout do usuário, limpa o cache e redireciona.
 */
async function signOut() {
    console.log('🚀 Realizando logout...');
    await supabase.auth.signOut();
    clearUserProfileCache();
    window.location.href = '/login.html';
}

/**
 * Limpa a variável de cache do perfil do usuário.
 */
function clearUserProfileCache() {
    console.log('🧹 Cache de perfil em memória (auth.js) limpo.');
    currentUserProfile = null;
}

// =========================================================================
// FUNÇÕES DE UTILIDADE E GUARDA DE ROTAS
// =========================================================================

/**
 * Protege rotas que exigem login e, opcionalmente, uma permissão específica.
 */
async function routeGuard(requiredPermission = null) {
    const profile = await fetchUserProfile();

    if (!profile) {
        // Se não há perfil, fetchUserProfile já deve ter redirecionado, mas garantimos aqui.
        window.location.href = `/login.html?redirect=${window.location.pathname}`;
        return;
    }

    if (requiredPermission) {
        const isAdmin = profile.role === 'admin';
        const hasPagePermission = profile.allowed_pages && profile.allowed_pages.includes(requiredPermission);

        if (!isAdmin && !hasPagePermission) {
            alert('Você não tem permissão para acessar esta página.');
            window.location.href = '/search.html'; // Redireciona para uma página segura
        }
    }
}

/**
 * Verifica se o usuário tem uma permissão específica.
 */
async function hasPermission(permission) {
    const profile = await fetchUserProfile();
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    return profile.allowed_pages && profile.allowed_pages.includes(permission);
}

// =========================================================================
// INICIALIZAÇÃO E EVENTOS
// =========================================================================

/**
 * Inicializa os listeners de autenticação do Supabase.
 */
function initAuth() {
    supabase.auth.onAuthStateChange((event, session) => {
        console.log(`Evento de autenticação: ${event}`);
        // Limpa o cache em eventos importantes para forçar a busca de dados atualizados.
        if (['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
            clearUserProfileCache();
        }
        // Dispara um evento global para que outras partes da UI possam reagir.
        window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { event, session } }));
    });
}

// Inicializa a autenticação assim que o script é carregado.
initAuth();
