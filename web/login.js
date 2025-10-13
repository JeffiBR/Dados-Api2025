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
            // Substitua esta parte pela sua lógica real de autenticação
            // const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            // if (error) throw error;
            
            // Simulação de login bem-sucedido
            if (email && password) {
                // Salvar preferência "Manter conectado" se necessário
                if (rememberMe.checked) {
                    localStorage.setItem('rememberMe', 'true');
                    localStorage.setItem('userEmail', email);
                } else {
                    localStorage.removeItem('rememberMe');
                    localStorage.removeItem('userEmail');
                }

                // Sempre redirecionar para search.html após login bem-sucedido
                window.location.href = 'search.html';
            } else {
                throw new Error('Email e senha são obrigatórios');
            }

        } catch (error) {
            errorMessage.textContent = 'Email ou senha inválidos.';
            console.error('Erro de login:', error.message);
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
        } else {
            console.log('Cookies analíticos desativados');
        }
        
        if (preferences.functional) {
            // Ativar funcionalidades adicionais
            console.log('Cookies funcionais ativados');
        } else {
            console.log('Cookies funcionais desativados');
        }
    }

    // Link "Esqueceu a senha"
    document.querySelector('.forgot-password').addEventListener('click', (e) => {
        e.preventDefault();
        alert('Funcionalidade de recuperação de senha: Em uma implementação real, aqui seria enviado um email para redefinir sua senha.');
        
        // Em uma implementação real, você poderia:
        // 1. Mostrar um modal para inserir o email
        // 2. Enviar uma solicitação para sua API de recuperação de senha
        // 3. Redirecionar para uma página de redefinição de senha
    });

    // Permitir login com Enter
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loginButton.click();
        }
    });
});
