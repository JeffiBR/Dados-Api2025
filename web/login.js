// Tema claro/escuro
document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('themeToggle');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Verificar preferência salva ou do sistema
    const savedTheme = localStorage.getItem('theme');
    const systemTheme = prefersDarkScheme.matches ? 'dark' : 'light';
    const currentTheme = savedTheme || systemTheme;
    
    // Aplicar tema
    if (currentTheme === 'light') {
        document.body.classList.add('light-mode');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }
    
    // Alternar tema
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        themeToggle.innerHTML = isLight ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    });

    // Script de login
    const loginButton = document.getElementById('loginButton');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('errorMessage');
    const rememberMe = document.getElementById('rememberMe');
    const togglePassword = document.getElementById('togglePassword');

    // Mostrar/ocultar senha
    togglePassword.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        // Alternar ícone
        togglePassword.innerHTML = type === 'password' ? 
            '<i class="fas fa-eye"></i>' : 
            '<i class="fas fa-eye-slash"></i>';
    });

    loginButton.addEventListener('click', async (e) => {
        e.preventDefault();
        errorMessage.textContent = '';
        loginButton.disabled = true;
        loginButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';

        const email = emailInput.value;
        const password = passwordInput.value;

        try {
            // Login com Supabase
            const { data, error } = await supabase.auth.signInWithPassword({ 
                email: email, 
                password: password 
            });

            if (error) throw error;

            // Salvar preferência "Manter conectado" se necessário
            if (rememberMe.checked) {
                localStorage.setItem('rememberMe', 'true');
                localStorage.setItem('userEmail', email);
            } else {
                localStorage.removeItem('rememberMe');
                localStorage.removeItem('userEmail');
            }

            // Login bem-sucedido
            errorMessage.textContent = 'Login realizado com sucesso!';
            errorMessage.style.color = 'var(--success)';
            
            console.log('Usuário logado:', data.user);
            
            // Aqui você pode adicionar redirecionamento se necessário
            // window.location.href = '/dashboard.html';

        } catch (error) {
            console.error('Erro de login:', error);
            
            // Tratamento de erros específicos do Supabase
            if (error.message.includes('Invalid login credentials')) {
                errorMessage.textContent = 'Email ou senha incorretos.';
            } else if (error.message.includes('Email not confirmed')) {
                errorMessage.textContent = 'Email não confirmado. Verifique sua caixa de entrada.';
            } else if (error.message.includes('Too many requests')) {
                errorMessage.textContent = 'Muitas tentativas. Tente novamente mais tarde.';
            } else {
                errorMessage.textContent = 'Erro ao fazer login. Tente novamente.';
            }
            
            errorMessage.style.color = 'var(--error)';
        } finally {
            loginButton.disabled = false;
            loginButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
        }
    });

    // Preencher email se "Manter conectado" estava ativo
    if (localStorage.getItem('rememberMe') === 'true') {
        const savedEmail = localStorage.getItem('userEmail');
        if (savedEmail) {
            emailInput.value = savedEmail;
            rememberMe.checked = true;
        }
    }

    // Modal de Recuperação de Senha
    const passwordResetModal = document.getElementById('passwordResetModal');
    const forgotPasswordLink = document.querySelector('.forgot-password');
    const modalClose = document.querySelector('.modal-close');
    const cancelReset = document.getElementById('cancelReset');
    const sendReset = document.getElementById('sendReset');
    const resetEmail = document.getElementById('resetEmail');
    const resetMessage = document.getElementById('resetMessage');

    // Abrir modal de recuperação de senha
    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        passwordResetModal.classList.add('show');
        resetEmail.value = emailInput.value; // Preencher com email atual se existir
        resetMessage.textContent = '';
    });

    // Fechar modal
    function closeModal() {
        passwordResetModal.classList.remove('show');
        resetMessage.textContent = '';
        resetEmail.value = '';
    }

    modalClose.addEventListener('click', closeModal);
    cancelReset.addEventListener('click', closeModal);

    // Fechar modal ao clicar fora dele
    passwordResetModal.addEventListener('click', (e) => {
        if (e.target === passwordResetModal) {
            closeModal();
        }
    });

    // Fechar modal com ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && passwordResetModal.classList.contains('show')) {
            closeModal();
        }
    });

    // Enviar email de recuperação de senha
    sendReset.addEventListener('click', async () => {
        const email = resetEmail.value.trim();
        
        if (!email) {
            resetMessage.textContent = 'Por favor, insira um email válido.';
            resetMessage.className = 'reset-message error';
            return;
        }

        // Validação básica de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            resetMessage.textContent = 'Por favor, insira um email válido.';
            resetMessage.className = 'reset-message error';
            return;
        }

        sendReset.disabled = true;
        sendReset.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        resetMessage.textContent = '';
        
        try {
            // Configuração do Supabase para recuperação de senha
            const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password.html`,
            });

            if (error) {
                // Tratamento específico de erros do Supabase
                if (error.message.includes('Email not confirmed')) {
                    throw new Error('Email não confirmado. Verifique sua caixa de entrada.');
                } else if (error.message.includes('User not found')) {
                    throw new Error('Nenhuma conta encontrada com este email.');
                } else {
                    throw error;
                }
            }

            resetMessage.textContent = 'Email de recuperação enviado! Verifique sua caixa de entrada e pasta de spam. O link expira em 1 hora.';
            resetMessage.className = 'reset-message success';
            
            // Fechar modal após 5 segundos
            setTimeout(() => {
                closeModal();
            }, 5000);
            
        } catch (error) {
            console.error('Erro de recuperação de senha:', error);
            resetMessage.textContent = error.message || 'Erro ao enviar email de recuperação. Tente novamente.';
            resetMessage.className = 'reset-message error';
        } finally {
            sendReset.disabled = false;
            sendReset.innerHTML = 'Enviar Link';
        }
    });

    // Permitir enviar com Enter no campo de email de recuperação
    resetEmail.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendReset.click();
        }
    });

    // Cookie Banner
    const cookieBanner = document.getElementById('cookieBanner');
    const cookieAccept = document.getElementById('cookieAccept');
    const cookieRejectAll = document.getElementById('cookieRejectAll');
    const cookieClose = document.getElementById('cookieClose');
    const showFullPolicy = document.getElementById('showFullPolicy');
    const cookieFullPolicy = document.getElementById('cookieFullPolicy');
    const analyticsCookies = document.getElementById('analyticsCookies');
    const functionalCookies = document.getElementById('functionalCookies');

    // Verificar se o usuário já aceitou os cookies
    if (!localStorage.getItem('cookiesAccepted')) {
        // Mostrar o banner após um pequeno delay
        setTimeout(() => {
            cookieBanner.classList.add('show');
        }, 1000);
    }

    // Mostrar política completa
    showFullPolicy.addEventListener('click', (e) => {
        e.preventDefault();
        cookieFullPolicy.classList.toggle('show');
        showFullPolicy.textContent = cookieFullPolicy.classList.contains('show') ? 
            'Ocultar política completa' : 'Ver política completa';
    });

    // Aceitar todos os cookies
    cookieAccept.addEventListener('click', () => {
        const preferences = {
            essential: true, // Sempre aceitos
            analytics: true,
            functional: true
        };
        
        localStorage.setItem('cookiesAccepted', 'true');
        localStorage.setItem('cookiePreferences', JSON.stringify(preferences));
        cookieBanner.classList.remove('show');
        
        // Aplicar preferências
        applyCookiePreferences(preferences);
    });

    // Recusar todos os cookies não essenciais
    cookieRejectAll.addEventListener('click', () => {
        const preferences = {
            essential: true, // Sempre aceitos
            analytics: false,
            functional: false
        };
        
        localStorage.setItem('cookiesAccepted', 'true');
        localStorage.setItem('cookiePreferences', JSON.stringify(preferences));
        cookieBanner.classList.remove('show');
        
        // Aplicar preferências
        applyCookiePreferences(preferences);
    });

    // Fechar banner (sem aceitar)
    cookieClose.addEventListener('click', () => {
        cookieBanner.classList.remove('show');
        // Não salva preferências, o banner aparecerá novamente na próxima visita
    });

    // Função para aplicar preferências de cookies
    function applyCookiePreferences(preferences) {
        console.log('Aplicando preferências de cookies:', preferences);
        
        // Em uma implementação real, você:
        // 1. Configuraria o Google Analytics com base na preferência
        // 2. Ajustaria funcionalidades do site com base nas escolhas
        // 3. Carregaria/removeria scripts de terceiros
        
        if (preferences.analytics) {
            // Carregar scripts analíticos
            console.log('Cookies analíticos ativados');
            // Exemplo: gtag('consent', 'update', { 'analytics_storage': 'granted' });
        } else {
            console.log('Cookies analíticos desativados');
            // Exemplo: gtag('consent', 'update', { 'analytics_storage': 'denied' });
        }
        
        if (preferences.functional) {
            // Ativar funcionalidades adicionais
            console.log('Cookies funcionais ativados');
        } else {
            console.log('Cookies funcionais desativados');
        }
    }

    // Permitir login com Enter
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loginButton.click();
        }
    });

    // Verificar se há sessão ativa
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            console.log('Sessão ativa encontrada:', session.user.email);
            // Se quiser redirecionar automaticamente usuários logados:
            // window.location.href = '/dashboard.html';
        }
    });

    // Escutar mudanças de autenticação
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            console.log('Usuário fez login:', session.user.email);
        } else if (event === 'SIGNED_OUT') {
            console.log('Usuário fez logout');
        }
    });
});
