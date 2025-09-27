// web/login.js

document.addEventListener('DOMContentLoaded', () => {
    console.log('[DEBUG] Página carregada. O script login.js está executando.');

    const loginButton = document.getElementById('loginButton');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('errorMessage');

    if (!loginButton) {
        console.error('[DEBUG] ERRO CRÍTICO: Botão de login #loginButton não encontrado!');
        return;
    }
    console.log('[DEBUG] Botão de login encontrado com sucesso.');

    // Função para limpar a mensagem de erro
    function clearError() {
        if (errorMessage.textContent) {
            errorMessage.textContent = '';
        }
    }

    emailInput.addEventListener('input', clearError);
    passwordInput.addEventListener('input', clearError);

    loginButton.addEventListener('click', async (e) => {
        console.log('[DEBUG] Botão "Entrar" foi clicado!');
        e.preventDefault(); // Previne o envio padrão do formulário

        errorMessage.textContent = '';
        loginButton.disabled = true;
        loginButton.textContent = 'Entrando...';

        const email = emailInput.value;
        const password = passwordInput.value;
        console.log(`[DEBUG] Email: ${email}, Senha: [oculta]`);

        try {
            console.log('[DEBUG] Entrando no bloco try... prestes a chamar o Supabase.');
            
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            
            console.log('[DEBUG] Chamada ao Supabase concluída.');

            if (error) {
                console.error('[DEBUG] Supabase retornou um erro:', error);
                throw error;
            }

            console.log('[DEBUG] Login bem-sucedido! Redirecionando...');
            const urlParams = new URLSearchParams(window.location.search);
            const redirectUrl = urlParams.get('redirect');
            window.location.replace(redirectUrl || '/search.html');

        } catch (error) {
            console.error('[DEBUG] Erro capturado no bloco catch:', error.message);
            errorMessage.textContent = 'E-mail ou senha inválidos. Tente novamente.';
        } finally {
            console.log('[DEBUG] Executando bloco finally.');
            loginButton.disabled = false;
            loginButton.textContent = 'Entrar';
        }
    });
});
