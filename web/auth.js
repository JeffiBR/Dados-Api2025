// auth.js - VERSÃO COMPLETA E ATUALIZADA

const SUPABASE_URL = 'https://zhaetrzpkkgzfrwxfqdw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYWV0cnpwa2tnemZyd3hmcWR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjM3MzksImV4cCI6MjA3Mjk5OTczOX0.UHoWWZahvp_lMDH8pK539YIAFTAUnQk9mBX5tdixwN0';

// Torna o supabase globalmente disponível
window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUserProfile = null;
let authStateChangeSubscribers = [];

/**
 * Função centralizada para requisições autenticadas.
 */
async function authenticatedFetch(url, options = {}) {
    const session = await getSession();

    if (!session) {
        const error = new Error("Sessão não encontrada.");
        error.code = 'NO_SESSION';
        throw error;
    }

    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
    };

    const finalOptions = {
        ...options, 
        headers: { ...defaultHeaders, ...options.headers }
    };

    try {
        const response = await fetch(url, finalOptions);
        
        // Tratar erros de autenticação
        if (response.status === 401) {
            await handleAuthError();
            throw new Error("Sessão expirada. Por favor, faça login novamente.");
        }
        
        // Tratar acesso expirado (403)
        if (response.status === 403) {
            const errorText = await response.text();
            let errorDetail = 'Acesso negado.';
            try {
                const errorJson = JSON.parse(errorText);
                errorDetail = errorJson.detail || errorDetail;
            } catch (e) {
                // Não é JSON, usar o texto original
                errorDetail = errorText;
            }

            // Verificar se é erro de acesso expirado
            if (errorDetail.includes('acesso expirou') || errorDetail.includes('acesso à plataforma expirou')) {
                showAccessExpiredMessage();
                throw new Error('ACCESS_EXPIRED');
            } else {
                // Outro tipo de erro 403
                throw new Error(errorDetail);
            }
        }
        
        return response;
    } catch (error) {
        if (error.message === 'ACCESS_EXPIRED') {
            throw error;
        }
        if (error.message.includes('Sessão expirada')) {
            throw error;
        }
        throw new Error(`Erro de rede: ${error.message}`);
    }
}

/**
 * Busca o usuário autenticado no Supabase.
 */
async function getAuthUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        return user;
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        return null;
    }
}

/**
 * Busca o perfil do usuário com cache em memória.
 */
async function fetchUserProfile(forceRefresh = false) {
    // Retorna do cache se existir e não for forçado refresh
    if (currentUserProfile && !forceRefresh) {
        return currentUserProfile;
    }
    
    const session = await getSession();
    if (!session) return null;

    try {
        const response = await authenticatedFetch('/api/users/me');
        if (!response.ok) {
            if (response.status === 401 || response.status === 404) {
                await signOut();
                return null;
            }
            throw new Error(`Falha ao buscar perfil: ${response.status}`);
        }
        
        currentUserProfile = await response.json();
        notifyAuthStateChange();
        return currentUserProfile;
    } catch (error) {
        console.error("Erro em fetchUserProfile:", error);
        
        // Se for erro de sessão, redireciona para login
        if (error.code === 'NO_SESSION' || error.message.includes('Sessão expirada')) {
            redirectToLogin();
        }
        return null;
    }
}

/**
 * Obtém a sessão atual do Supabase.
 */
async function getSession() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        return session;
    } catch (error) {
        console.error('Erro ao obter sessão:', error);
        return null;
    }
}

/**
 * Realiza o logout do usuário.
 */
async function signOut() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        
        clearUserProfileCache();
        localStorage.removeItem('currentUser');
        notifyAuthStateChange();
        
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Erro ao fazer logout:', error);
        alert('Erro ao fazer logout. Tente novamente.');
    }
}

/**
 * Protege rotas que exigem login e permissões específicas.
 */
async function routeGuard(requiredPermission = null) {
    const user = await getAuthUser();
    if (!user) {
        redirectToLogin();
        return false;
    }
    
    // Verifica se o acesso está expirado
    const isExpired = await checkAccessExpiration();
    if (isExpired) {
        return false;
    }
    
    if (requiredPermission) {
        const profile = await fetchUserProfile();
        if (!profile) {
            redirectToLogin();
            return false;
        }
        
        const hasAccess = profile.role === 'admin' || 
                         (profile.allowed_pages && profile.allowed_pages.includes(requiredPermission));
        
        if (!hasAccess) {
            alert('Você não tem permissão para acessar esta página.');
            window.location.href = '/search.html';
            return false;
        }
    }
    
    return true;
}

/**
 * Verifica autenticação - compatibilidade com outros scripts
 */
async function checkAuth() {
    try {
        const session = await getSession();
        return !!session;
    } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        return false;
    }
}

/**
 * Limpa o cache do perfil do usuário
 */
function clearUserProfileCache() {
    currentUserProfile = null;
}

/**
 * Verifica se o usuário está autenticado e redireciona se necessário
 */
async function requireAuth(redirectUrl = '/login.html') {
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) {
        window.location.href = redirectUrl;
        return false;
    }
    return true;
}

/**
 * Obtém o token de autenticação atual
 */
async function getAuthToken() {
    const session = await getSession();
    return session?.access_token || null;
}

/**
 * Verifica se o usuário tem uma permissão específica
 */
async function hasPermission(permission) {
    const profile = await fetchUserProfile();
    if (!profile) return false;
    
    if (profile.role === 'admin') return true;
    
    return profile.allowed_pages && profile.allowed_pages.includes(permission);
}

/**
 * Inicializa a autenticação e verifica o estado do usuário
 */
async function initAuth() {
    // Verifica sessão atual ao inicializar
    await checkAndUpdateAuthState();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Evento de autenticação:', event);
        
        switch (event) {
            case 'SIGNED_IN':
                console.log('Usuário fez login');
                clearUserProfileCache();
                await fetchUserProfile(true);
                break;
                
            case 'SIGNED_OUT':
                console.log('Usuário fez logout');
                clearUserProfileCache();
                currentUserProfile = null;
                notifyAuthStateChange();
                break;
                
            case 'TOKEN_REFRESHED':
                console.log('Token atualizado');
                break;
                
            case 'USER_UPDATED':
                console.log('Usuário atualizado');
                clearUserProfileCache();
                await fetchUserProfile(true);
                break;
        }
    });

    return subscription;
}

/**
 * Função auxiliar para fazer login com email e senha
 */
async function signIn(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password
        });

        if (error) {
            throw error;
        }

        clearUserProfileCache();
        await fetchUserProfile(true);
        return data;
    } catch (error) {
        console.error('Erro no login:', error);
        throw error;
    }
}

/**
 * Função auxiliar para cadastrar novo usuário
 */
async function signUp(email, password, userMetadata = {}) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password: password,
            options: {
                data: userMetadata
            }
        });

        if (error) {
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Erro no cadastro:', error);
        throw error;
    }
}

/**
 * Verifica e atualiza o estado de autenticação globalmente
 */
async function checkAndUpdateAuthState() {
    const isAuthenticated = await checkAuth();
    let user = null;
    
    if (isAuthenticated) {
        user = await fetchUserProfile();
    } else {
        clearUserProfileCache();
    }
    
    notifyAuthStateChange(isAuthenticated, user);
    return isAuthenticated;
}

/**
 * Redireciona para página de login
 */
function redirectToLogin() {
    const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login.html?redirect=${currentPath}`;
}

/**
 * Manipula erros de autenticação
 */
async function handleAuthError() {
    clearUserProfileCache();
    await supabase.auth.signOut();
    redirectToLogin();
}

/**
 * Notifica subscribers sobre mudanças no estado de autenticação
 */
function notifyAuthStateChange(isAuthenticated = null, user = null) {
    const event = new CustomEvent('authStateChange', {
        detail: { 
            isAuthenticated: isAuthenticated !== null ? isAuthenticated : !!currentUserProfile,
            user: user || currentUserProfile 
        }
    });
    window.dispatchEvent(event);
}

/**
 * Registra callback para mudanças no estado de autenticação
 */
function onAuthStateChange(callback) {
    authStateChangeSubscribers.push(callback);
    
    // Retorna função para remover o listener
    return () => {
        const index = authStateChangeSubscribers.indexOf(callback);
        if (index > -1) {
            authStateChangeSubscribers.splice(index, 1);
        }
    };
}

/**
 * Atualiza o perfil do usuário forçando refresh do servidor
 */
async function refreshUserProfile() {
    return await fetchUserProfile(true);
}

/**
 * Verifica se o acesso do usuário está expirado
 */
async function checkAccessExpiration() {
    try {
        const profile = await fetchUserProfile();
        if (!profile) return true;

        // Para admins, não verifica expiração
        if (profile.role === 'admin') return false;

        const response = await authenticatedFetch('/api/my-groups');
        const userGroups = await response.json();
        
        const today = new Date().toISOString().split('T')[0];
        const hasActiveAccess = userGroups.some(group => group.data_expiracao >= today);
        
        if (!hasActiveAccess) {
            showAccessExpiredMessage();
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Erro ao verificar expiração de acesso:', error);
        return false;
    }
}

/**
 * Mostra mensagem de acesso expirado
 */
function showAccessExpiredMessage() {
    // Remove mensagens existentes
    const existingMessage = document.getElementById('accessExpiredMessage');
    if (existingMessage) {
        existingMessage.remove();
    }

    const messageHTML = `
        <div id="accessExpiredMessage" class="access-expired-overlay">
            <div class="access-expired-modal">
                <div class="access-expired-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h2>Acesso Expirado</h2>
                <p>Seu acesso à plataforma expirou. Para continuar utilizando os serviços, entre em contato com nosso suporte.</p>
                <div class="access-expired-contact">
                    <p><strong>Contato do Suporte:</strong></p>
                    <p>📧 Email: suporte@precosarapiraca.com</p>
                    <p>📞 Telefone: (82) 99999-9999</p>
                    <p>🕒 Horário: Segunda a Sexta, 8h às 18h</p>
                </div>
                <div class="access-expired-actions">
                    <button onclick="window.signOut()" class="btn btn-secondary">
                        <i class="fas fa-sign-out-alt"></i> Fazer Logout
                    </button>
                    <button onclick="location.reload()" class="btn btn-primary">
                        <i class="fas fa-sync-alt"></i> Tentar Novamente
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', messageHTML);
}

/**
 * Configura tratamento global de erros de autenticação
 */
function setupGlobalErrorHandling() {
    // Intercepta fetch requests
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const response = await originalFetch(...args);
            
            if (response.status === 403) {
                const errorData = await response.json().catch(() => ({}));
                if (errorData.detail && errorData.detail.includes('acesso expirou')) {
                    showAccessExpiredMessage();
                    throw new Error('ACCESS_EXPIRED');
                }
            }
            
            return response;
        } catch (error) {
            if (error.message === 'ACCESS_EXPIRED') {
                throw error;
            }
            throw error;
        }
    };

    // Intercepta erros do authenticatedFetch
    window.addEventListener('unhandledrejection', (event) => {
        if (event.reason && event.reason.message === 'ACCESS_EXPIRED') {
            event.preventDefault();
            // Já foi tratado pelo showAccessExpiredMessage
        }
    });
}

// Inicializa a autenticação quando o script é carregado
document.addEventListener('DOMContentLoaded', function() {
    initAuth().catch(console.error);
    setupGlobalErrorHandling();
});

// Torna as funções disponíveis globalmente
window.authenticatedFetch = authenticatedFetch;
window.getAuthUser = getAuthUser;
window.fetchUserProfile = fetchUserProfile;
window.refreshUserProfile = refreshUserProfile;
window.getSession = getSession;
window.signOut = signOut;
window.routeGuard = routeGuard;
window.checkAuth = checkAuth;
window.clearUserProfileCache = clearUserProfileCache;
window.requireAuth = requireAuth;
window.getAuthToken = getAuthToken;
window.hasPermission = hasPermission;
window.initAuth = initAuth;
window.signIn = signIn;
window.signUp = signUp;
window.checkAndUpdateAuthState = checkAndUpdateAuthState;
window.onAuthStateChange = onAuthStateChange;
window.checkAccessExpiration = checkAccessExpiration;
window.showAccessExpiredMessage = showAccessExpiredMessage;

console.log('✅ auth.js carregado com sucesso - Versão Completa');
