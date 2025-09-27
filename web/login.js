// web/login.js

document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('loginButton');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('errorMessage');

    // Verifica se o usuário já está logado ao carregar a página de login
    (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            // Se já há uma sessão, tenta ir para a página principal
            window.location.replace('/search.html');
        }
    })();


    loginButton.addEventListener('click', async (e) => {
        e.preventDefault();
        errorMessage.textContent = '';
        loginButton.disabled = true;
        loginButton.textContent = 'Entrando...';

        const email = emailInput.value;
        const password = passwordInput.value;

        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;

            // Lógica de redirecionamento inteligente
            const urlParams = new URLSearchParams(window.location.search);
            const redirectUrl = urlParams.get('redirect');

            // Usar 'replace' previne que a página de login entre no histórico do navegador,
            // evitando loops de login ao clicar em "voltar".
            window.location.replace(redirectUrl || '/search.html');

        } catch (error) {
            errorMessage.textContent = 'Email ou senha inválidos.';
            console.error('Erro de login:', error.message);
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = 'Entrar';
        }
    });
});
