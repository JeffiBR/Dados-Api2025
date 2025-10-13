<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redefinir Senha - Admin Preços AL</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="login.css">
</head>
<body>
    <div class="bg-elements">
        <div class="bg-circle circle-1"></div>
        <div class="bg-circle circle-2"></div>
    </div>

    <div class="login-container">
        <div class="login-header">
            <h1>Redefinir Senha</h1>
            <p>Crie uma nova senha para sua conta</p>
        </div>
        
        <div class="form-group password-group">
            <label for="newPassword"><i class="fas fa-lock"></i> Nova Senha</label>
            <div class="password-input-container">
                <input type="password" id="newPassword" placeholder="Digite sua nova senha" required>
                <button type="button" class="toggle-password">
                    <i class="fas fa-eye"></i>
                </button>
            </div>
        </div>
        
        <div class="form-group password-group">
            <label for="confirmPassword"><i class="fas fa-lock"></i> Confirmar Senha</label>
            <div class="password-input-container">
                <input type="password" id="confirmPassword" placeholder="Confirme sua nova senha" required>
                <button type="button" class="toggle-password">
                    <i class="fas fa-eye"></i>
                </button>
            </div>
        </div>
        
        <button id="resetPasswordButton" class="btn">
            <i class="fas fa-key"></i> Redefinir Senha
        </button>
        
        <p id="message" class="error-message"></p>
        
        <div style="text-align: center; margin-top: 1rem;">
            <a href="login.html" style="color: var(--primary); text-decoration: none;">
                <i class="fas fa-arrow-left"></i> Voltar para o login
            </a>
        </div>
    </div>

    <script src="auth.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const resetButton = document.getElementById('resetPasswordButton');
            const newPasswordInput = document.getElementById('newPassword');
            const confirmPasswordInput = document.getElementById('confirmPassword');
            const messageEl = document.getElementById('message');
            
            // Verificar se há um hash de recuperação na URL
            const hash = window.location.hash;
            const urlParams = new URLSearchParams(hash.substring(1));
            const type = urlParams.get('type');
            const accessToken = urlParams.get('access_token');
            
            if (type === 'recovery' && accessToken) {
                // Token de recuperação detectado - configurar sessão
                supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: urlParams.get('refresh_token') || ''
                }).then(({ data, error }) => {
                    if (error) {
                        messageEl.textContent = 'Link de redefinição inválido ou expirado.';
                        messageEl.style.color = 'var(--error)';
                        resetButton.disabled = true;
                    } else {
                        console.log('Sessão de recuperação configurada com sucesso');
                    }
                });
            } else {
                messageEl.textContent = 'Link de redefinição inválido ou expirado.';
                messageEl.style.color = 'var(--error)';
                resetButton.disabled = true;
            }

            // Mostrar/ocultar senha
            document.querySelectorAll('.toggle-password').forEach(button => {
                button.addEventListener('click', function() {
                    const input = this.parentElement.querySelector('input');
                    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
                    input.setAttribute('type', type);
                    this.innerHTML = type === 'password' ? 
                        '<i class="fas fa-eye"></i>' : 
                        '<i class="fas fa-eye-slash"></i>';
                });
            });

            resetButton.addEventListener('click', async function() {
                const newPassword = newPasswordInput.value;
                const confirmPassword = confirmPasswordInput.value;

                // Validações
                if (!newPassword || !confirmPassword) {
                    messageEl.textContent = 'Por favor, preencha todos os campos.';
                    messageEl.style.color = 'var(--error)';
                    return;
                }

                if (newPassword.length < 6) {
                    messageEl.textContent = 'A senha deve ter pelo menos 6 caracteres.';
                    messageEl.style.color = 'var(--error)';
                    return;
                }

                if (newPassword !== confirmPassword) {
                    messageEl.textContent = 'As senhas não coincidem.';
                    messageEl.style.color = 'var(--error)';
                    return;
                }

                resetButton.disabled = true;
                resetButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Redefinindo...';

                try {
                    const { data, error } = await supabase.auth.updateUser({
                        password: newPassword
                    });

                    if (error) throw error;

                    messageEl.textContent = 'Senha redefinida com sucesso! Redirecionando para o login...';
                    messageEl.style.color = 'var(--success)';

                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 3000);

                } catch (error) {
                    console.error('Erro ao redefinir senha:', error);
                    messageEl.textContent = 'Erro ao redefinir senha. O link pode ter expirado.';
                    messageEl.style.color = 'var(--error)';
                } finally {
                    resetButton.disabled = false;
                    resetButton.innerHTML = '<i class="fas fa-key"></i> Redefinir Senha';
                }
            });
        });
    </script>
</body>
</html>
