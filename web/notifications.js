/**
 * Sistema de Notificações Toast
 * Fornece feedback visual para ações do usuário
 */

// Container para todas as notificações
let toastContainer = null;

/**
 * Inicializa o sistema de notificações
 */
function initNotifications() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
}

/**
 * Mostra uma notificação toast
 * @param {string} type - Tipo de notificação: 'success', 'error', 'warning', 'info'
 * @param {string} title - Título da notificação
 * @param {string} message - Mensagem da notificação
 * @param {number} duration - Duração em milissegundos (padrão: 5000)
 */
function showToast(type, title, message, duration = 5000) {
    // Inicializa se necessário
    initNotifications();
    
    // Cria o elemento toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Ícone baseado no tipo
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'warning') icon = '⚠️';
    
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close">&times;</button>
    `;
    
    // Adiciona ao container
    toastContainer.appendChild(toast);
    
    // Mostra com animação
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Configura o fechamento
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        hideToast(toast);
    });
    
    // Fecha automaticamente após o tempo especificado
    if (duration > 0) {
        setTimeout(() => {
            hideToast(toast);
        }, duration);
    }
}

/**
 * Esconde e remove uma notificação
 * @param {HTMLElement} toast - Elemento toast a ser removido
 */
function hideToast(toast) {
    toast.classList.remove('show');
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

/**
 * Mostra notificação de sucesso
 * @param {string} title - Título da notificação
 * @param {string} message - Mensagem da notificação
 * @param {number} duration - Duração em milissegundos
 */
function showSuccess(title, message, duration) {
    showToast('success', title || 'Sucesso!', message || 'Operação realizada com sucesso.', duration);
}

/**
 * Mostra notificação de erro
 * @param {string} title - Título da notificação
 * @param {string} message - Mensagem da notificação
 * @param {number} duration - Duração em milissegundos
 */
function showError(title, message, duration) {
    showToast('error', title || 'Erro!', message || 'Ocorreu um erro ao realizar a operação.', duration);
}

/**
 * Mostra notificação de aviso
 * @param {string} title - Título da notificação
 * @param {string} message - Mensagem da notificação
 * @param {number} duration - Duração em milissegundos
 */
function showWarning(title, message, duration) {
    showToast('warning', title || 'Aviso!', message || 'Verifique as informações e tente novamente.', duration);
}

/**
 * Mostra notificação informativa
 * @param {string} title - Título da notificação
 * @param {string} message - Mensagem da notificação
 * @param {number} duration - Duração em milissegundos
 */
function showInfo(title, message, duration) {
    showToast('info', title || 'Informação', message || '', duration);
}

// Inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initNotifications);

// Exporta as funções para uso global
window.showToast = showToast;
window.showSuccess = showSuccess;
window.showError = showError;
window.showWarning = showWarning;
window.showInfo = showInfo;