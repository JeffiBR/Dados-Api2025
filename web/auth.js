// auth.js - VERSÃO CORRIGIDA COM TRATAMENTO DE TOKEN APRIMORADO

const SUPABASE_URL = 'https://zhaetrzpkkgzfrwxfqdw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYWV0cnpwa2tnemZyd3hmcWR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjM3MzksImV4cCI6MjA3Mjk5OTczOX0.UHoWWZahvp_lMDH8pK539YIAFTAUnQk9mBX5tdixwN0';

// Cache e estado
const authCache = {
    profile: null,
    lastProfileFetch: 0,
    profileCacheDuration: 5 * 60 * 1000, // 5 minutos
    session: null,
    lastSessionCheck: 0,
    sessionCacheDuration: 30 * 1000, // 30 segundos
    permissionCache: new Map(),
    permissionCacheDuration: 2 * 60 * 1000, // 2 minutos
    accessStatus: null,
    lastAccessCheck: 0,
    accessCheckDuration: 60 * 1000 // 1 minuto
};

let authStateChangeSubscribers = [];
let isInitialized = false;

// Torna o supabase globalmente disponível
window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
    }
});

/**
 * Validação de token JWT robusta
 */
function isValidToken(token) {
    if (!token || typeof token !== 'string') {
        console.warn('Token não fornecido ou inválido');
        return false;
    }

    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            console.warn('Token JWT com formato inválido');
            return false;
        }

        // Verifica se é um JWT válido (formato básico)
        const payload = JSON.parse(atob(parts[1]));
        const now = Math.floor(Date.now() / 1000);

        // Verifica expiração
        if (payload.exp && payload.exp < now) {
            console.warn('Token expirado - exp:', new Date(payload.exp * 1000), 'now:', new Date(now * 1000));
            return false;
        }

        // Verifica se tem os campos mínimos
        if (!payload.sub || !payload.role) {
            console.warn('Token JWT sem campos obrigatórios');
            return false;
        }

        console.log('✅ Token válido - expira em:', new Date(payload.exp * 1000).toLocaleString('pt-BR'));
        return true;
    } catch (error) {
        console.error('Erro na validação do token:', error);
        return false;
    }
}

/**
 * Função centralizada para requisições autenticadas COM TRATAMENTO DE TOKEN APRIMORADO
 */
async function authenticatedFetch(url, options = {}) {
    try {
        console.log('🔐 authenticatedFetch iniciada para:', url);

        const session = await getSession();
        if (!session) {
            console.error('❌ Nenhuma sessão encontrada em authenticatedFetch');
            const error = new Error("Sessão não encontrada.");
            error.code = 'NO_SESSION';
            throw error;
        }

        // VALIDAÇÃO ROBUSTA DO TOKEN
        const token = session.access_token;
        console.log('🔐 Token a ser usado:', token ? `${token.substring(0, 20)}...` : 'NULL');

        if (!isValidToken(token)) {
            console.error('❌ Token JWT inválido em authenticatedFetch');
            await handleAuthError();
            throw new Error("Token de autenticação inválido.");
        }

        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        const finalOptions = {
            ...options,
            headers: { ...defaultHeaders, ...options.headers }
        };

        console.log('🔐 Fazendo requisição para:', url);
        const response = await fetch(url, finalOptions);

        // Tratamento otimizado de erros
        if (response.status === 401) {
            console.warn('❌ Status 401 - Não autorizado');
            await handleAuthError();
            throw new Error("Sessão expirada. Por favor, faça login novamente.");
        }

        if (response.status === 403) {
            const errorText = await response.text();
            let errorDetail = 'Acesso negado.';

            try {
                const errorJson = JSON.parse(errorText);
                errorDetail = errorJson.detail || errorDetail;
            } catch (e) {
                errorDetail = errorText;
            }

            console.warn('❌ Status 403 - Acesso negado:', errorDetail);

            if (errorDetail.includes('acesso expirou') || errorDetail.includes('acesso à plataforma expirou')) {
                showAccessExpiredMessage();
                throw new Error('ACCESS_EXPIRED');
            }

            // Se for erro de token inválido, fazer logout
            if (errorDetail.includes('Token inválido') || errorDetail.includes('Session from session_id')) {
                console.error('❌ Token/Sessão inválido no servidor - fazendo logout');
                await handleAuthError();
                throw new Error("Sessão inválida. Por favor, faça login novamente.");
            }

            throw new Error(errorDetail);
        }

        if (!response.ok) {
            console.error(`❌ Erro HTTP ${response.status} em authenticatedFetch`);
        }

        console.log('✅ authenticatedFetch concluída com sucesso para:', url);
        return response;
    } catch (error) {
        console.error('❌ Erro em authenticatedFetch:', error);
        throw error;
    }
}

/**
 * Busca o usuário autenticado com cache - VERSÃO CORRIGIDA
 */
async function getAuthUser() {
    try {
        console.log('🔐 Buscando usuário autenticado...');
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error) {
            console.error('❌ Erro ao buscar usuário:', error);

            // Se for erro de token inválido, limpar sessão
            if (error.message.includes('JWT') || error.message.includes('token') || error.message.includes('session')) {
                console.warn('❌ Token/Sessão inválido - limpando cache');
                await handleAuthError();
            }
            throw error;
        }

        console.log('✅ Usuário autenticado:', user?.email);
        return user;
    } catch (error) {
        console.error('❌ Erro ao buscar usuário:', error);
        return null;
    }
}

/**
 * Busca o perfil do usuário com cache inteligente - VERSÃO CORRIGIDA
 */
async function fetchUserProfile(forceRefresh = false) {
    const now = Date.now();
    const cacheKey = 'userProfile';

    // Verifica cache válido
    if (!forceRefresh && 
        authCache.profile && 
        (now - authCache.lastProfileFetch) < authCache.profileCacheDuration) {
        console.log('📁 Retornando perfil do cache');
        return authCache.profile;
    }

    try {
        console.log('🔐 Buscando perfil do usuário...');
        const session = await getSession();
        if (!session) {
            console.log('❌ Nenhuma sessão encontrada em fetchUserProfile');
            return null;
        }

        const response = await authenticatedFetch('/api/users/me');
        if (!response.ok) {
            console.error(`❌ Erro HTTP ${response.status} ao buscar perfil`);

            if (response.status === 401 || response.status === 404) {
                await signOut();
                return null;
            }
            throw new Error(`Falha ao buscar perfil: ${response.status}`);
        }

        authCache.profile = await response.json();
        authCache.lastProfileFetch = now;

        // DEBUG: Log do perfil carregado
        console.log('✅ Perfil do usuário carregado:', {
            id: authCache.profile?.id,
            role: authCache.profile?.role,
            isAdmin: authCache.profile?.role === 'admin',
            managed_groups: authCache.profile?.managed_groups,
            allowed_pages: authCache.profile?.allowed_pages
        });

        // Limpa cache de permissões quando o perfil é atualizado
        authCache.permissionCache.clear();

        notifyAuthStateChange();
        return authCache.profile;
    } catch (error) {
        console.error("❌ Erro em fetchUserProfile:", error);

        if (error.code === 'NO_SESSION' || 
            error.message.includes('Sessão expirada') || 
            error.message.includes('Token de autenticação inválido') ||
            error.message.includes('Session from session_id')) {
            console.warn('❌ Sessão/token inválido - redirecionando para login');
            redirectToLogin();
        }
        return null;
    }
}

/**
 * Obtém a sessão atual com cache - VERSÃO CORRIGIDA
 */
async function getSession() {
    const now = Date.now();

    // Retorna sessão em cache se ainda é válida
    if (authCache.session && 
        (now - authCache.lastSessionCheck) < authCache.sessionCacheDuration) {
        console.log('📁 Retornando sessão do cache');
        return authCache.session;
    }

    try {
        console.log('🔐 Buscando sessão atual...');
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.error('❌ Erro ao obter sessão:', error);

            // Se for erro relacionado a token/sessão, fazer logout
            if (error.message.includes('JWT') || error.message.includes('token') || error.message.includes('session')) {
                console.warn('❌ Sessão/token inválido - fazendo logout');
                await supabase.auth.signOut();
                clearAllCaches();
            }
            return null;
        }

        // Validação da sessão
        if (session && session.access_token) {
            if (!isValidToken(session.access_token)) {
                console.error('❌ Token JWT inválido na sessão');
                await supabase.auth.signOut();
                clearAllCaches();
                return null;
            }

            console.log('✅ Sessão válida encontrada para:', session.user?.email);
        } else {
            console.log('ℹ️ Nenhuma sessão ativa encontrada');
            return null;
        }

        authCache.session = session;
        authCache.lastSessionCheck = now;
        return session;
    } catch (error) {
        console.error('❌ Erro ao obter sessão:', error);
        return null;
    }
}

/**
 * Sistema de permissões otimizado com cache
 */
class PermissionManager {
    constructor() {
        this.cache = new Map();
        this.cacheDuration = 2 * 60 * 1000; // 2 minutos
    }

    async checkPermission(permission, profile = null) {
        const cacheKey = `perm_${permission}`;
        const now = Date.now();
        const cached = this.cache.get(cacheKey);

        // Retorna do cache se válido
        if (cached && (now - cached.timestamp) < this.cacheDuration) {
            return cached.result;
        }

        const userProfile = profile || await fetchUserProfile();
        if (!userProfile) return false;

        let hasPermission = false;

        // ✅ Admin tem todas as permissões
        if (userProfile.role === 'admin') {
            hasPermission = true;
        } 
        // Verificação para subadministradores
        else if ((permission === 'group_admin_users' || permission === 'group_admin') && 
                 userProfile.managed_groups && userProfile.managed_groups.length > 0) {
            hasPermission = true;
        }
        // Verificação de páginas permitidas
        else if (userProfile.allowed_pages && userProfile.allowed_pages.includes(permission)) {
            hasPermission = true;
        }

        // Armazena no cache
        this.cache.set(cacheKey, {
            result: hasPermission,
            timestamp: now
        });

        return hasPermission;
    }

    clearCache() {
        this.cache.clear();
    }

    async checkMultiplePermissions(permissions) {
        const results = {};
        const profile = await fetchUserProfile();

        await Promise.all(
            permissions.map(async perm => {
                results[perm] = await this.checkPermission(perm, profile);
            })
        );

        return results;
    }
}

const permissionManager = new PermissionManager();

/**
 * Verificação completa de acesso considerando grupos
 */
async function checkUserAccess() {
    const now = Date.now();

    // Verifica cache válido
    if (authCache.accessStatus && 
        (now - authCache.lastAccessCheck) < authCache.accessCheckDuration) {
        return authCache.accessStatus.has_access;
    }

    try {
        const response = await authenticatedFetch('/api/user/access-status');
        const accessStatus = await response.json();

        // Atualiza cache
        authCache.accessStatus = accessStatus;
        authCache.lastAccessCheck = now;

        return accessStatus.has_access;
    } catch (error) {
        console.error('❌ Erro ao verificar acesso:', error);

        // Se for erro 403 (acesso expirado), mostrar mensagem específica
        if (error.message.includes('acesso expirou') || 
            (error.response && error.response.status === 403)) {
            showAccessExpiredMessage();
            return false;
        }

        return false;
    }
}

/**
 * Obter status detalhado do acesso
 */
async function getUserAccessStatus() {
    try {
        const response = await authenticatedFetch('/api/user/access-status');
        return await response.json();
    } catch (error) {
        console.error('❌ Erro ao obter status de acesso:', error);
        return {
            has_access: false,
            reason: 'Erro na verificação',
            active_groups: [],
            expired_groups: []
        };
    }
}

/**
 * Verificação de acesso otimizada - ✅ ADMIN NÃO PRECISA DE VERIFICAÇÃO
 */
async function checkAccessExpiration() {
    try {
        const profile = await fetchUserProfile();
        if (!profile) return true;

        // ✅ Admins e subadministradores não têm expiração
        if (profile.role === 'admin' || 
            (profile.managed_groups && profile.managed_groups.length > 0)) {
            console.log('🔓 DEBUG - Admin/Subadmin: acesso sem verificação de expiração');
            return false; // Não expirado
        }

        // Usar o novo endpoint de verificação apenas para usuários normais
        const hasAccess = await checkUserAccess();

        if (!hasAccess) {
            showAccessExpiredMessage();
            return true;
        }

        return false;
    } catch (error) {
        console.error('❌ Erro ao verificar expiração de acesso:', error);
        return false;
    }
}

/**
 * Protege rotas com sistema de permissões otimizado
 */
async function routeGuard(requiredPermission = null) {
    // Verificação rápida de autenticação
    const user = await getAuthUser();
    if (!user) {
        redirectToLogin();
        return false;
    }

    // ✅ Verificação de acesso expirado (admin não precisa)
    const profile = await fetchUserProfile();
    if (profile && profile.role !== 'admin') {
        const isExpired = await checkAccessExpiration();
        if (isExpired) {
            return false;
        }
    }

    // Verificação de permissão se necessário
    if (requiredPermission) {
        const hasAccess = await permissionManager.checkPermission(requiredPermission);
        if (!hasAccess) {
            alert('Você não tem permissão para acessar esta página.');
            window.location.href = '/search.html';
            return false;
        }
    }

    return true;
}

/**
 * Verificação de permissão otimizada
 */
async function hasPermission(permission) {
    return permissionManager.checkPermission(permission);
}

/**
 * Verifica se o usuário pode gerenciar um grupo específico (otimizado)
 */
async function canManageGroup(groupId) {
    const cacheKey = `group_${groupId}`;
    const now = Date.now();
    const cached = authCache.permissionCache.get(cacheKey);

    if (cached && (now - cached.timestamp) < authCache.permissionCacheDuration) {
        return cached.result;
    }

    const profile = await fetchUserProfile();
    if (!profile) return false;

    let canManage = false;

    if (profile.role === 'admin') {
        canManage = true;
    } else if (profile.managed_groups) {
        canManage = profile.managed_groups.includes(parseInt(groupId));
    }

    authCache.permissionCache.set(cacheKey, {
        result: canManage,
        timestamp: now
    });

    return canManage;
}

/**
 * Sistema de logout otimizado - VERSÃO CORRIGIDA
 */
async function signOut() {
    try {
        console.log('🚪 Iniciando logout...');

        // Limpa todos os caches primeiro
        clearAllCaches();

        // Tenta fazer logout no Supabase
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.warn('⚠️ Erro ao fazer logout no Supabase:', error);
            // Continua mesmo com erro
        }

        // Limpa storage local adicional
        localStorage.removeItem('supabase.auth.token');
        sessionStorage.clear();

        console.log('✅ Logout concluído - redirecionando para login');
        notifyAuthStateChange();
        window.location.href = '/login.html';
    } catch (error) {
        console.error('❌ Erro ao fazer logout:', error);
        // Força o redirect mesmo em caso de erro
        window.location.href = '/login.html';
    }
}

/**
 * Limpeza de caches - VERSÃO COMPLETA
 */
function clearAllCaches() {
    console.log('🧹 Limpando todos os caches...');

    authCache.profile = null;
    authCache.session = null;
    authCache.accessStatus = null;
    authCache.lastProfileFetch = 0;
    authCache.lastSessionCheck = 0;
    authCache.lastAccessCheck = 0;
    authCache.permissionCache.clear();
    permissionManager.clearCache();

    // Limpa storage do navegador
    localStorage.removeItem('currentUser');
    localStorage.removeItem('supabase.auth.token');

    console.log('✅ Caches limpos');
}

/**
 * Limpa cache do perfil do usuário
 */
function clearUserProfileCache() {
    authCache.profile = null;
    authCache.lastProfileFetch = 0;
    permissionManager.clearCache();
}

/**
 * Limpa caches específicos de permissão quando necessário
 */
function clearPermissionCache() {
    authCache.permissionCache.clear();
    permissionManager.clearCache();
    console.log('✅ Cache de permissões limpo');
}

/**
 * Inicialização otimizada da autenticação - VERSÃO CORRIGIDA
 */
async function initAuth() {
    if (isInitialized) {
        console.warn('⚠️ Auth já inicializado');
        return;
    }

    try {
        isInitialized = true;
        console.log('🔐 Inicializando autenticação...');

        // Verificação inicial rápida
        await checkAndUpdateAuthState();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('🔄 Evento de autenticação:', event, session?.user?.email);

            // Limpa caches em eventos relevantes
            if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED', 'USER_DELETED', 'TOKEN_REFRESHED'].includes(event)) {
                console.log(`🔄 Evento ${event} - limpando caches`);
                clearAllCaches();
            }

            switch (event) {
                case 'SIGNED_IN':
                    console.log('✅ Usuário fez login:', session.user.email);
                    await fetchUserProfile(true);
                    break;

                case 'SIGNED_OUT':
                    console.log('🚪 Usuário fez logout');
                    clearAllCaches();
                    notifyAuthStateChange();
                    break;

                case 'TOKEN_REFRESHED':
                    console.log('🔄 Token atualizado');
                    // Atualiza sessão em cache
                    authCache.session = session;
                    authCache.lastSessionCheck = Date.now();
                    break;

                case 'USER_UPDATED':
                    console.log('📝 Usuário atualizado');
                    await fetchUserProfile(true);
                    break;

                case 'USER_DELETED':
                    console.log('🗑️ Usuário deletado');
                    clearAllCaches();
                    redirectToLogin();
                    break;
            }
        });

        console.log('✅ Auth inicializado com sucesso');
        return subscription;
    } catch (error) {
        console.error('❌ Erro na inicialização da autenticação:', error);
        isInitialized = false;
        return null;
    }
}

/**
 * Middleware de autenticação para rotas
 */
function createAuthMiddleware() {
    return {
        async requireAuth(redirectUrl = '/login.html') {
            const isAuthenticated = await checkAuth();
            if (!isAuthenticated) {
                window.location.href = redirectUrl;
                return false;
            }
            return true;
        },

        async requirePermission(permission, redirectUrl = '/search.html') {
            const hasPerm = await hasPermission(permission);
            if (!hasPerm) {
                alert('Você não tem permissão para acessar esta página.');
                window.location.href = redirectUrl;
                return false;
            }
            return true;
        },

        async requireGroupAccess(groupId) {
            const canManage = await canManageGroup(groupId);
            if (!canManage) {
                alert('Você não tem permissão para gerenciar este grupo.');
                window.location.href = '/search.html';
                return false;
            }
            return true;
        }
    };
}

/**
 * Verificação de autenticação otimizada - VERSÃO CORRIGIDA
 */
async function checkAuth() {
    try {
        const session = await getSession();
        const isValid = !!(session && isValidToken(session.access_token));

        console.log('🔐 checkAuth resultado:', isValid);
        return isValid;
    } catch (error) {
        console.error('❌ Erro ao verificar autenticação:', error);
        return false;
    }
}

/**
 * Funções auxiliares otimizadas
 */
async function signIn(email, password) {
    try {
        console.log('🔐 Tentando login para:', email);

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password
        });

        if (error) {
            console.error('❌ Erro no login:', error);
            throw error;
        }

        console.log('✅ Login bem-sucedido para:', data.user.email);
        clearAllCaches();
        await fetchUserProfile(true);
        return data;
    } catch (error) {
        console.error('❌ Erro no login:', error);
        throw error;
    }
}

/**
 * Função para lidar com erros de autenticação - VERSÃO CORRIGIDA
 */
async function handleAuthError() {
    console.error('🔄 Lidando com erro de autenticação...');

    try {
        // Limpa todos os caches primeiro
        clearAllCaches();

        // Tenta fazer logout no Supabase
        await supabase.auth.signOut().catch(e => {
            console.warn('⚠️ Erro ao fazer logout no handleAuthError:', e);
        });

        console.log('✅ Auth error tratado - redirecionando para login');
    } catch (error) {
        console.error('❌ Erro no handleAuthError:', error);
    } finally {
        // Sempre redireciona para login
        redirectToLogin();
    }
}

/**
 * Redireciona para a página de login
 */
function redirectToLogin() {
    console.log('🔄 Redirecionando para login...');
    // Usar replace para evitar que o usuário volte para a página com erro
    window.location.replace('/login.html');
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
                <p>Seu acesso à plataforma expirou. Para continuar utilizando os serviços, entre em contato com o administrador do seu grupo ou com nosso suporte.</p>
                <div class="access-expired-contact">
                    <p><strong>Contato do Suporte:</strong></p>
                    <p>📧 Email: djaxelf22@gmail.com</p>
                    <p>📞 Telefone: (82) 99915-8412</p>
                    <p>🕒 Horário: Segunda a Sexta, 8h às 18h</p>
                </div>
                <div class="access-expired-actions">
                    <button onclick="window.signOut()" class="btn btn-secondary">
                        <i class="fas fa-sign-out-alt"></i> Fazer Logout
                    </button>
                    <button onclick="location.reload()" class="btn btn-primary">
                        <i class="fas fa-sync-alt"></i> Verificar Novamente
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', messageHTML);
}

/**
 * Notifica os subscribers sobre mudanças no estado de autenticação
 */
function notifyAuthStateChange() {
    console.log('🔄 Notificando mudanças de estado de autenticação para', authStateChangeSubscribers.length, 'subscribers');
    authStateChangeSubscribers.forEach(callback => {
        try {
            callback();
        } catch (error) {
            console.error('❌ Erro ao notificar mudança de estado de autenticação:', error);
        }
    });
}

/**
 * Verifica e atualiza o estado de autenticação
 */
async function checkAndUpdateAuthState() {
    const session = await getSession();
    if (session) {
        await fetchUserProfile();
    }
}

/**
 * Sistema de subscribe para mudanças de estado de autenticação
 */
function subscribeToAuthStateChange(callback) {
    if (typeof callback === 'function') {
        authStateChangeSubscribers.push(callback);

        // Retorna função para unsubscribe
        return () => {
            const index = authStateChangeSubscribers.indexOf(callback);
            if (index > -1) {
                authStateChangeSubscribers.splice(index, 1);
            }
        };
    }
}

/**
 * Obtém o perfil do usuário atual (com cache)
 */
async function getCurrentUserProfile() {
    return await fetchUserProfile();
}

/**
 * Verifica se o usuário atual é administrador
 */
async function isAdmin() {
    const profile = await fetchUserProfile();
    return profile && profile.role === 'admin';
}

/**
 * Verifica se o usuário atual é subadministrador
 */
async function isGroupAdmin() {
    const profile = await fetchUserProfile();
    return profile && profile.managed_groups && profile.managed_groups.length > 0;
}

/**
 * Verifica se o usuário atual tem acesso a uma página específica
 */
async function hasPageAccess(pageKey) {
    const profile = await fetchUserProfile();
    if (!profile) return false;

    // ✅ Admin tem acesso a todas as páginas
    if (profile.role === 'admin') return true;

    if (profile.managed_groups && profile.managed_groups.length > 0) {
        // Subadmins têm acesso às páginas de grupo por padrão
        if (pageKey === 'group_admin_users' || pageKey === 'group_admin') return true;
    }

    return profile.allowed_pages && profile.allowed_pages.includes(pageKey);
}

/**
 * Configuração de error handling global
 */
function setupGlobalErrorHandling() {
    console.log('🔧 Configurando tratamento global de erros...');

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

    window.addEventListener('unhandledrejection', (event) => {
        console.error('❌ Erro não tratado:', event.reason);
        if (event.reason && event.reason.message === 'ACCESS_EXPIRED') {
            event.preventDefault();
        }
    });

    // Tratamento de erros de rede
    window.addEventListener('online', () => {
        console.log('🌐 Conexão restaurada');
    });

    window.addEventListener('offline', () => {
        console.warn('🌐 Sem conexão com a internet');
    });
}

// Inicialização otimizada
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM carregado - inicializando auth...');
    if (!isInitialized) {
        initAuth().catch(error => {
            console.error('❌ Falha na inicialização da autenticação:', error);
        });
        setupGlobalErrorHandling();
    }
});

// Exportações
const authMiddleware = createAuthMiddleware();

// Torna as funções disponíveis globalmente
window.authenticatedFetch = authenticatedFetch;
window.getAuthUser = getAuthUser;
window.fetchUserProfile = fetchUserProfile;
window.getSession = getSession;
window.signOut = signOut;
window.routeGuard = routeGuard;
window.checkAuth = checkAuth;
window.clearUserProfileCache = clearUserProfileCache;
window.requireAuth = authMiddleware.requireAuth;
window.getAuthToken = async () => (await getSession())?.access_token;
window.hasPermission = hasPermission;
window.initAuth = initAuth;
window.signIn = signIn;
window.checkAccessExpiration = checkAccessExpiration;
window.showAccessExpiredMessage = showAccessExpiredMessage;
window.canManageGroup = canManageGroup;
window.authMiddleware = authMiddleware;

// NOVAS FUNÇÕES EXPORTADAS
window.subscribeToAuthStateChange = subscribeToAuthStateChange;
window.getCurrentUserProfile = getCurrentUserProfile;
window.isAdmin = isAdmin;
window.isGroupAdmin = isGroupAdmin;
window.hasPageAccess = hasPageAccess;
window.handleAuthError = handleAuthError;
window.redirectToLogin = redirectToLogin;
window.clearAllCaches = clearAllCaches;
window.clearPermissionCache = clearPermissionCache;
window.checkUserAccess = checkUserAccess;
window.getUserAccessStatus = getUserAccessStatus;

console.log('✅ auth.js carregado - Versão Corrigida com Tratamento de Token Aprimorado');