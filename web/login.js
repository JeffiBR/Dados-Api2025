document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('loginButton');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('errorMessage');

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

            // Se houver um parâmetro 'redirect', vai para ele.
            // Senão, o destino PADRÃO agora é a página de BUSCA.
            window.location.href = redirectUrl || '/search.html';

        } catch (error) {
            errorMessage.textContent = 'Email ou senha inválidos.';
            console.error('Erro de login:', error.message);
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = 'Entrar';
        }
    });
});
