document.addEventListener('DOMContentLoaded', () => {
    // Referenciando o novo formulário
    const loginForm = document.getElementById('loginForm');
    const loginButton = document.getElementById('loginButton');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('errorMessage');

    // Escutando o evento 'submit' no formulário
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Impede o envio padrão do formulário
            
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

                // O destino PADRÃO agora é a página de BUSCA.
                window.location.href = redirectUrl || '/search.html';

            } catch (error) {
                errorMessage.textContent = 'Email ou senha inválidos.';
                console.error('Erro de login:', error.message);
            } finally {
                loginButton.disabled = false;
                loginButton.textContent = 'Entrar';
            }
        });
    }
});
