// Sistema de Rodapé Modular para Preços AL - Estilo designer.css
class SystemFooter {
    constructor() {
        this.footerHTML = `
            <footer class="system-footer" id="systemFooter">
                <div class="footer-content">
                    <div class="footer-section">
                        <h3><i class="fas fa-bolt"></i> Preços AL</h3>
                        <p><i class="fas fa-chart-line"></i> Sistema de análise de preços para Alagoas</p>
                    </div>
                    
                    <div class="footer-section">
                        <h4><i class="fas fa-balance-scale"></i> Legal</h4>
                        <ul>
                            <li><a href="/privacy-policy.html"><i class="fas fa-shield-alt"></i> Política de Privacidade</a></li>
                            <li><a href="/terms-of-use.html"><i class="fas fa-file-contract"></i> Política de Uso</a></li>
                            <li><a href="/cookies.html"><i class="fas fa-cookie-bite"></i> Cookies</a></li>
                        </ul>
                    </div>
                    
                    <div class="footer-section">
                        <h4><i class="fas fa-life-ring"></i> Suporte</h4>
                        <ul>
                            <li><a href="/updates.html"><i class="fas fa-sync-alt"></i> Atualizações</a></li>
                            <li><a href="/faq.html"><i class="fas fa-question-circle"></i> Perguntas Frequentes</a></li>
                            <li><a href="/maintenance.html"><i class="fas fa-tools"></i> Manutenções</a></li>
                        </ul>
                    </div>
                </div>
                
                <div class="footer-bottom">
                    <div class="footer-bottom-content">
                        <p><i class="far fa-copyright"></i> 2025 Preços AL. Todos os direitos reservados.</p>
                        <div class="footer-version">
                            <span><i class="fas fa-code-branch"></i> Versão 2.2.0</span>
                        </div>
                    </div>
                </div>
            </footer>
        `;

        this.footerCSS = `
            /* ====== ESTILOS DO RODAPÉ - DESIGNER.CSS COMPATIBLE ====== */
            .system-footer {
                background: var(--panel-dark);
                border-top: 1px solid var(--border-dark);
                margin-top: auto;
                transition: var(--transition);
            }

            body.light-mode .system-footer {
                background: var(--panel-light);
                border-top: 1px solid var(--border-light);
            }

            .footer-content {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 2rem;
                padding: 3rem 2rem;
                max-width: 1200px;
                margin: 0 auto;
            }

            .footer-section h3 {
                font-size: 1.5rem;
                font-weight: 700;
                margin-bottom: 1rem;
                display: flex;
                align-items: center;
                gap: 13px;
                color: var(--primary);
                background: linear-gradient(90deg, var(--primary), var(--accent));
                background-size: 300% 100%;
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                animation: shimmer 3s infinite linear;
            }

            .footer-section h4 {
                color: var(--text-dark);
                font-size: 1.1rem;
                font-weight: 600;
                margin-bottom: 1.2rem;
                display: flex;
                align-items: center;
                gap: 12px;
            }

            body.light-mode .footer-section h4 {
                color: var(--text-light);
            }

            .footer-section h4 i {
                font-size: 1.2rem;
                min-width: 28px;
                text-align: center;
                color: var(--primary);
                filter: drop-shadow(0 0 6px rgba(79,70,229,0.08));
                transition: var(--transition);
            }

            .footer-section p {
                color: var(--muted-dark);
                line-height: 1.6;
                margin-bottom: 1.5rem;
                display: flex;
                align-items: center;
                gap: 12px;
            }

            body.light-mode .footer-section p {
                color: var(--muted-light);
            }

            .footer-section p i {
                font-size: 1.2rem;
                min-width: 28px;
                text-align: center;
                color: var(--primary);
                filter: drop-shadow(0 0 6px rgba(79,70,229,0.08));
                transition: var(--transition);
            }

            .footer-section ul {
                list-style: none;
                padding: 0;
            }

            .footer-section ul li {
                margin-bottom: 0.8rem;
            }

            .footer-section ul li a {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 16px;
                border-radius: 12px;
                color: var(--muted-dark);
                font-weight: 500;
                transition: var(--transition);
                position: relative;
                overflow: hidden;
                text-decoration: none;
            }

            body.light-mode .footer-section ul li a {
                color: var(--muted-light);
            }

            .footer-section ul li a:hover {
                color: var(--primary);
                background: rgba(79, 70, 229, 0.12);
                transform: translateX(5px);
            }

            .footer-section ul li i {
                font-size: 1.2rem;
                min-width: 28px;
                text-align: center;
                filter: drop-shadow(0 0 6px rgba(79,70,229,0.08));
                transition: var(--transition);
                color: var(--primary);
            }

            .footer-section ul li a:hover i {
                transform: scale(1.12) rotate(6deg);
                filter: drop-shadow(0 0 10px rgba(79,70,229,0.15));
            }

            .footer-bottom {
                border-top: 1px solid var(--border-dark);
                padding: 1.5rem 2rem;
            }

            body.light-mode .footer-bottom {
                border-top: 1px solid var(--border-light);
            }

            .footer-bottom-content {
                max-width: 1200px;
                margin: 0 auto;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 1rem;
            }

            .footer-bottom p {
                color: var(--muted-dark);
                margin: 0;
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 500;
            }

            body.light-mode .footer-bottom p {
                color: var(--muted-light);
            }

            .footer-bottom p i {
                color: var(--primary);
                font-size: 1rem;
            }

            .footer-version span {
                background: rgba(79, 70, 229, 0.1);
                color: var(--primary);
                padding: 0.5rem 1rem;
                border-radius: 100px;
                font-size: 0.8rem;
                font-weight: 700;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                transition: var(--transition);
                border: 1px solid transparent;
            }

            .footer-version span:hover {
                background: rgba(79, 70, 229, 0.15);
                border-color: rgba(79, 70, 229, 0.3);
                transform: translateY(-2px);
            }

            .footer-version span i {
                font-size: 0.8rem;
            }

            /* ====== RESPONSIVIDADE ====== */
            @media (max-width: 1024px) {
                .footer-content {
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1.5rem;
                    padding: 2rem 1.5rem;
                }
            }

            @media (max-width: 768px) {
                .footer-content {
                    grid-template-columns: 1fr;
                    gap: 2rem;
                    padding: 2rem 1.5rem;
                }
                
                .footer-bottom-content {
                    flex-direction: column;
                    text-align: center;
                    gap: 1rem;
                }
                
                .footer-bottom p {
                    justify-content: center;
                }
            }

            @media (max-width: 480px) {
                .footer-content {
                    padding: 1.5rem 1rem;
                }
                
                .footer-bottom {
                    padding: 1rem;
                }
                
                .footer-section h3,
                .footer-section h4,
                .footer-section p {
                    justify-content: center;
                    text-align: center;
                }
            }
        `;

        this.init();
    }

    init() {
        // Verificar se o rodapé já existe
        if (document.getElementById('systemFooter')) {
            console.warn('Rodapé já existe na página.');
            return;
        }

        // Verificar se o CSS do Font Awesome está carregado
        this.ensureFontAwesome();

        // Adicionar CSS ao head
        this.injectCSS();

        // Adicionar HTML ao final do body
        this.injectHTML();

        // Configurar eventos
        this.setupEvents();

        console.log('Rodapé do sistema carregado com sucesso!');
    }

    ensureFontAwesome() {
        // Verificar se Font Awesome já está carregado
        if (!document.querySelector('link[href*="font-awesome"]') && !document.querySelector('link[href*="fontawesome"]')) {
            const faLink = document.createElement('link');
            faLink.rel = 'stylesheet';
            faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
            document.head.appendChild(faLink);
        }
    }

    injectCSS() {
        // Verificar se o CSS já foi injetado
        if (document.getElementById('system-footer-css')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'system-footer-css';
        style.textContent = this.footerCSS;
        document.head.appendChild(style);
    }

    injectHTML() {
        document.body.insertAdjacentHTML('beforeend', this.footerHTML);
    }

    setupEvents() {
        // Observar mudanças de tema
        this.observeThemeChanges();
        
        // Adicionar classe para indicar que o rodapé foi carregado
        document.documentElement.classList.add('footer-loaded');
    }

    observeThemeChanges() {
        // Observar mudanças no atributo de tema do body
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    this.handleThemeChange();
                }
            });
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
    }

    handleThemeChange() {
        // O CSS já lida com as variáveis de tema
        console.log('Tema alterado, rodapé adaptado automaticamente.');
    }

    // Método para atualizar a versão do sistema
    updateVersion(version) {
        const versionElement = document.querySelector('.footer-version span');
        if (versionElement) {
            versionElement.innerHTML = `<i class="fas fa-code-branch"></i> Versão ${version}`;
        }
    }

    // Método para atualizar o ano do copyright
    updateCopyrightYear(year) {
        const copyrightElement = document.querySelector('.footer-bottom p');
        if (copyrightElement) {
            copyrightElement.innerHTML = `<i class="far fa-copyright"></i> ${year} Preços AL. Todos os direitos reservados.`;
        }
    }

    // Método para destruir o rodapé (remover da página)
    destroy() {
        const footer = document.getElementById('systemFooter');
        const css = document.getElementById('system-footer-css');
        
        if (footer) footer.remove();
        if (css) css.remove();
        
        document.documentElement.classList.remove('footer-loaded');
        
        console.log('Rodapé do sistema removido.');
    }
}

// Inicializar o rodapé quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.systemFooter = new SystemFooter();
        
        // Configurar versão e copyright atualizados
        window.systemFooter.updateVersion('2.2.0');
        window.systemFooter.updateCopyrightYear('2025');
    });
} else {
    window.systemFooter = new SystemFooter();
    
    // Configurar versão e copyright atualizados
    window.systemFooter.updateVersion('2.2.0');
    window.systemFooter.updateCopyrightYear('2025');
}

// Exportar para uso em módulos (se suportado)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SystemFooter;
}
