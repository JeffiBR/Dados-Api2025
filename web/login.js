document.addEventListener('DOMContentLoaded', () => {
    // Elementos DOM
    const themeToggle = document.getElementById('themeToggle');
    const cookieConsent = document.getElementById('cookieConsent');
    const acceptCookies = document.getElementById('acceptCookies');
    const rejectCookies = document.getElementById('rejectCookies');
    const loginForm = document.getElementById('loginForm');
    const loginButton = document.getElementById('loginButton');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const togglePassword = document.getElementById('togglePassword');
    const rememberMe = document.getElementById('rememberMe');
    const errorMessage = document.getElementById('errorMessage');
    const forgotPassword = document.getElementById('forgotPassword');
    const passwordResetModal = document.getElementById('passwordResetModal');
    const closeModal = document.querySelector('.close');
    const sendResetLink = document.getElementById('sendResetLink');
    const resetMessage = document.getElementById('resetMessage');
    const resetEmail = document.getElementById('resetEmail');

    // ===== TEMA CLARO/ESCURO =====
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
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

    // ===== GERENCIAMENTO DE COOKIES =====
    // Verificar se o usuário já fez uma escolha sobre cookies
    const cookiesDecision = localStorage.getItem('cookiesDecision');
    
    if (cookiesDecision === null) {
        // Se não há decisão, mostrar o banner após um pequeno delay
        setTimeout(() => {
            cookieConsent.classList.add('show');
        }, 1500);
    } else {
        // Se já há uma decisão, não mostrar o banner
        cookieConsent.style.display = 'none';
    }
    
    // Aceitar cookies
    acceptCookies.addEventListener('click', () => {
        localStorage.setItem('cookiesDecision', 'accepted');
        cookieConsent.classList.remove('show');
        // Esperar a animação terminar antes de esconder completamente
        setTimeout(() => {
            cookieConsent.style.display = 'none';
        }, 500);
    });
    
    // Rejeitar cookies
    rejectCookies.addEventListener('click', () => {
        localStorage.setItem('cookiesDecision', 'rejected');
        cookieConsent.classList.remove('show');
        setTimeout(() => {
            cookieConsent.style.display = 'none';
        }, 500);
    });

    // ===== VISUALIZAÇÃO DE SENHA =====
    togglePassword.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        if (type === 'password') {
            togglePassword.innerHTML = '<div class="eye-state"></div><i class="fas fa-eye"></i>';
            togglePassword.classList.remove('active');
        } else {
            togglePassword.innerHTML = '<div class="eye-state"></div><i class="fas fa-eye-slash"></i>';
            togglePassword.classList.add('active');
        }
        
        // Focar no campo de senha após a alteração
        passwordInput.focus();
    });

    // ===== MODAL DE RECUPERAÇÃO DE SENHA =====
    // Abrir modal
    forgotPassword.addEventListener('click', (e) => {
        e.preventDefault();
        passwordResetModal.style.display = 'block';
        resetMessage.textContent = '';
        resetEmail.value = '';
    });
    
    // Fechar modal
    closeModal.addEventListener('click', () => {
        passwordResetModal.style.display = 'none';
        resetMessage.textContent = '';
    });
    
    // Fechar modal ao clicar fora
    window.addEventListener('click', (e) => {
        if (e.target === passwordResetModal) {
            passwordResetModal.style.display = 'none';
            resetMessage.textContent = '';
        }
    });
    
    // Enviar link de recuperação
    sendResetLink.addEventListener('click', async () => {
        const email = resetEmail.value;
        
        if (!email) {
            resetMessage.textContent = 'Por favor, insira seu email.';
            resetMessage.className = 'reset-message error';
            return;
        }
        
        if (!isValidEmail(email)) {
            resetMessage.textContent = 'Por favor, insira um email válido.';
            resetMessage.className = 'reset-message error';
            return;
        }
        
        try {
            resetMessage.textContent = 'Enviando...';
            resetMessage.className = 'reset-message';
            
            // Simulação de envio de email
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            resetMessage.textContent = 'Link de recuperação enviado! Verifique seu email.';
            resetMessage.className = 'reset-message success';
            
            // Fechar modal após 3 segundos
            setTimeout(() => {
                passwordResetModal.style.display = 'none';
                resetMessage.textContent = '';
            }, 3000);
        } catch (error) {
            resetMessage.textContent = 'Erro ao enviar link de recuperação. Tente novamente.';
            resetMessage.className = 'reset-message error';
            console.error('Erro de recuperação de senha:', error.message);
        }
    });

    // ===== VALIDAÇÃO DE EMAIL =====
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // ===== LOGIN =====
    // Verificar se há credenciais salvas
    const savedEmail = localStorage.getItem('savedEmail');
    if (savedEmail) {
        emailInput.value = savedEmail;
        rememberMe.checked = true;
    }

    // Login ao pressionar Enter
    loginForm.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            loginButton.click();
        }
    });

    // Processar login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.textContent = '';
        loginButton.disabled = true;
        loginButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';

        const email = emailInput.value;
        const password = passwordInput.value;

        // Validação básica
        if (!email || !password) {
            errorMessage.textContent = 'Por favor, preencha todos os campos.';
            loginButton.disabled = false;
            loginButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
            return;
        }

        if (!isValidEmail(email)) {
            errorMessage.textContent = 'Por favor, insira um email válido.';
            loginButton.disabled = false;
            loginButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
            return;
        }

        try {
            // Salvar email se "Manter conectado" estiver marcado
            if (rememberMe.checked) {
                localStorage.setItem('savedEmail', email);
            } else {
                localStorage.removeItem('savedEmail');
            }

            // Simulação de login
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Lógica de redirecionamento
            const urlParams = new URLSearchParams(window.location.search);
            const redirectUrl = urlParams.get('redirect');

            // Se houver um parâmetro 'redirect', vai para ele.
            // Senão, o destino PADRÃO agora é a página de BUSCA.
            window.location.href = redirectUrl || '/search.html';

        } catch (error) {
            errorMessage.textContent = 'Email ou senha inválidos.';
            console.error('Erro de login:', error.message);
        } finally {
            loginButton.disabled = false;
            loginButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
        }
    });
});
