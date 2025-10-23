// menu.js - Sistema de menu dinâmico baseado em permissões (COMPATÍVEL COM auth.js)

document.addEventListener('DOMContentLoaded', async function() {
    // Aguarda a inicialização do auth se necessário
    if (!window.isInitialized) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    await initializeDynamicMenu();
});

async function initializeDynamicMenu() {
    try {
        console.log('📋 Inicializando menu dinâmico...');

        // Verifica autenticação usando a função do auth.js
        const isAuthenticated = await checkAuth();
        if (!isAuthenticated) {
            console.log('❌ Usuário não autenticado - ocultando menu');
            const sidebar = document.getElementById('sidebarMenu');
            if (sidebar) sidebar.style.display = 'none';
            return;
        }

        // Obtém o perfil do usuário usando a função do auth.js
        const userProfile = await fetchUserProfile();
        if (!userProfile) {
            console.error('❌ Perfil do usuário não encontrado');
            return;
        }

        console.log('✅ Usuário autenticado, aplicando filtros de menu:', {
            role: userProfile.role,
            managed_groups: userProfile.managed_groups,
            allowed_pages: userProfile.allowed_pages
        });

        // Oculta o menu inicialmente durante o processamento
        const sidebar = document.getElementById('sidebarMenu');
        if (sidebar) {
            sidebar.style.display = 'none';
        }

        // Filtra e mostra apenas os itens permitidos
        await filterMenuItems(userProfile);

        // Mostra o menu após aplicar os filtros
        if (sidebar) {
            sidebar.style.display = 'block';
        }

        console.log('✅ Menu dinâmico inicializado com sucesso');

    } catch (error) {
        console.error('❌ Erro ao inicializar menu:', error);

        // Em caso de erro de autenticação, oculta o menu
        const sidebar = document.getElementById('sidebarMenu');
        if (sidebar) sidebar.style.display = 'none';
    }
}

async function filterMenuItems(userProfile) {
    const menuItems = document.querySelectorAll('[data-required-permission]');

    console.log(`🔍 Filtrando ${menuItems.length} itens de menu...`);

    for (const item of menuItems) {
        const requiredPermission = item.getAttribute('data-required-permission');

        // Usa a função hasPageAccess do auth.js para verificar permissão
        const hasAccess = await hasPageAccess(requiredPermission);

        if (!hasAccess) {
            item.style.display = 'none';
            console.log(`➖ Ocultando item: ${requiredPermission}`);
        } else {
            item.style.display = 'block';
            console.log(`➕ Mostrando item: ${requiredPermission}`);

            // Adiciona log de acesso quando o usuário clica no item do menu
            const link = item.querySelector('a');
            if (link) {
                link.addEventListener('click', async function(e) {
                    try {
                        await authenticatedFetch('/api/log-page-access', {
                            method: 'POST',
                            body: JSON.stringify({ 
                                page_key: requiredPermission,
                                timestamp: new Date().toISOString()
                            })
                        });
                        console.log(`📝 Log de acesso registrado para: ${requiredPermission}`);
                    } catch (error) {
                        console.error('❌ Erro ao registrar acesso:', error);
                    }
                });
            }
        }
    }

    // Esconde seções vazias
    hideEmptySections();

    // Adiciona tratamento especial para admin/subadmin
    await handleAdminMenuItems(userProfile);
}

function hideEmptySections() {
    const sections = document.querySelectorAll('.nav-section');

    sections.forEach(section => {
        const visibleItems = section.querySelectorAll('li[data-required-permission]');
        let hasVisibleItems = false;

        visibleItems.forEach(item => {
            if (item.style.display !== 'none') {
                hasVisibleItems = true;
            }
        });

        // Se não há itens visíveis, esconde a seção inteira
        if (!hasVisibleItems) {
            section.style.display = 'none';
            console.log(`➖ Ocultando seção vazia: ${section.querySelector('h3')?.textContent || 'Sem título'}`);
        } else {
            section.style.display = 'block';
        }
    });
}

async function handleAdminMenuItems(userProfile) {
    // Tratamento especial para itens de administração
    const adminItems = document.querySelectorAll('[data-required-permission="admin"], [data-required-permission="group_admin"]');

    for (const item of adminItems) {
        const requiredPermission = item.getAttribute('data-required-permission');
        let shouldShow = false;

        if (requiredPermission === 'admin') {
            shouldShow = userProfile.role === 'admin';
        } else if (requiredPermission === 'group_admin') {
            shouldShow = userProfile.role === 'admin' || 
                        (userProfile.managed_groups && userProfile.managed_groups.length > 0);
        }

        if (shouldShow) {
            item.style.display = 'block';
            console.log(`👑 Mostrando item administrativo: ${requiredPermission}`);
        } else {
            item.style.display = 'none';
        }
    }
}

// Sistema de atualização do menu quando o estado de autenticação muda
function setupMenuAuthListener() {
    console.log('🔧 Configurando listener de autenticação para menu...');

    // Inscreve para mudanças no estado de autenticação
    subscribeToAuthStateChange(async () => {
        console.log('🔄 Atualizando menu devido a mudança de estado de autenticação');
        await initializeDynamicMenu();
    });
}

// Função para forçar atualização do menu
async function refreshMenu() {
    console.log('🔄 Forçando atualização do menu...');
    await initializeDynamicMenu();
}

// Inicialização quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM carregado - configurando menu...');

    // Configura o listener de autenticação
    setTimeout(() => {
        setupMenuAuthListener();
    }, 1000);
});

// Torna as funções globais para acesso externo
window.initializeDynamicMenu = initializeDynamicMenu;
window.refreshMenu = refreshMenu;
window.filterMenuItems = filterMenuItems;
window.setupMenuAuthListener = setupMenuAuthListener;

console.log('✅ menu.js carregado - Compatível com auth.js');