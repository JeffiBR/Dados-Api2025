// price-sorter.js - Ordenação e coloração de preços (versão corrigida)
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se estamos na página de busca
    if (!document.getElementById('resultsGrid')) return;
    
    // Aguardar um pouco para garantir que o script.js principal foi carregado
    setTimeout(initializePriceSorter, 100);
});

function initializePriceSorter() {
    // Elementos do DOM
    const resultsGrid = document.getElementById('resultsGrid');
    const sortFilter = document.getElementById('sortFilter');
    
    if (!sortFilter || !resultsGrid) return;
    
    // Adicionar opção de ordenação por preço se não existir
    addSortOptionIfNeeded();
    
    // Variáveis para controle de cores
    let minPrice = 0;
    let maxPrice = 0;
    let currentResults = [];
    
    // Adicionar listener para o filtro de ordenação
    sortFilter.addEventListener('change', handleSortChange);
    
    // Observar mudanças no grid de resultados
    observeResultsGrid();
    
    // Observar mudanças no tema
    observeThemeChanges();
    
    // Adicionar CSS personalizado
    addCustomStyles();
    
    console.log('Price sorter inicializado com sucesso!');
    
    function addSortOptionIfNeeded() {
        if (!sortFilter.querySelector('option[value="cheap"]')) {
            const cheapOption = document.createElement('option');
            cheapOption.value = 'cheap';
            cheapOption.textContent = 'Preço: mais barato';
            sortFilter.appendChild(cheapOption);
        }
    }
    
    function handleSortChange() {
        if (sortFilter.value === 'cheap') {
            applyPriceSorting();
        }
    }
    
    function observeResultsGrid() {
        // Observar mudanças no grid de resultados
        const observer = new MutationObserver((mutations) => {
            let shouldProcess = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldProcess = true;
                }
            });
            
            if (shouldProcess) {
                // Aguardar um pouco para garantir que os resultados foram renderizados
                setTimeout(() => {
                    processResults();
                    // Se a ordenação por preço estiver ativa, reordenar após novos resultados
                    if (sortFilter.value === 'cheap') {
                        setTimeout(applyPriceSorting, 100);
                    }
                }, 300);
            }
        });
        
        observer.observe(resultsGrid, { childList: true, subtree: true });
        
        // Processar resultados iniciais
        setTimeout(processResults, 500);
    }
    
    function observeThemeChanges() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    setTimeout(applyPriceColors, 100);
                }
            });
        });
        
        observer.observe(document.body, { attributes: true });
    }
    
    function processResults() {
        // Extrair resultados dos elementos do DOM
        const productCards = resultsGrid.querySelectorAll('.product-card');
        if (productCards.length === 0) return;
        
        console.log(`Processando ${productCards.length} produtos...`);
        
        // Reconstruir array de resultados a partir do DOM
        currentResults = Array.from(productCards).map(card => {
            const price = extractPriceFromCard(card);
            
            return {
                preco_produto: price,
                element: card
            };
        });
        
        // Calcular faixa de preços
        calculatePriceRange();
        
        // Aplicar cores
        applyPriceColors();
        
        console.log(`Preços: min R$ ${minPrice.toFixed(2)}, max R$ ${maxPrice.toFixed(2)}`);
    }
    
    function calculatePriceRange() {
        const validPrices = currentResults
            .filter(item => item.preco_produto > 0)
            .map(item => item.preco_produto);
        
        if (validPrices.length === 0) {
            minPrice = 0;
            maxPrice = 0;
            return;
        }
        
        minPrice = Math.min(...validPrices);
        maxPrice = Math.max(...validPrices);
    }
    
    function applyPriceColors() {
        const productCards = resultsGrid.querySelectorAll('.product-card');
        
        productCards.forEach(card => {
            const priceElement = card.querySelector('.product-price');
            if (!priceElement) return;
            
            // Remover estilos anteriores e classes
            priceElement.style.color = '';
            priceElement.style.fontWeight = '';
            priceElement.style.background = '';
            priceElement.style.padding = '';
            priceElement.style.borderRadius = '';
            priceElement.classList.remove('price-cheapest', 'price-most-expensive', 'price-min', 'price-max');
            
            const price = extractPriceFromCard(card);
            
            if (isNaN(price) || price <= 0 || minPrice === maxPrice) {
                // Preço inválido ou todos iguais - aplicar cor padrão
                applyDefaultColor(priceElement);
                return;
            }
            
            // Aplicar cores baseadas na posição do preço
            if (price === minPrice) {
                // Preço mais barato - Verde
                priceElement.classList.add('price-cheapest', 'price-min');
                console.log(`Preço mais barato: R$ ${price.toFixed(2)}`);
            } else if (price === maxPrice) {
                // Preço mais caro - Vermelho
                priceElement.classList.add('price-most-expensive', 'price-max');
                console.log(`Preço mais caro: R$ ${price.toFixed(2)}`);
            } else {
                // Preço intermediário - cor padrão (branco no modo escuro, preto no modo claro)
                applyDefaultColor(priceElement);
            }
        });
    }
    
    function applyDefaultColor(element) {
        const isLightMode = document.body.classList.contains('light-mode');
        if (isLightMode) {
            element.style.color = '#111827'; // Quase preto no modo claro
        } else {
            element.style.color = '#ffffff'; // Branco no modo escuro
        }
    }
    
    function applyPriceSorting() {
        const productCards = Array.from(resultsGrid.querySelectorAll('.product-card'));
        if (productCards.length === 0) {
            console.log('Nenhum card encontrado para ordenar');
            return;
        }
        
        console.log(`Ordenando ${productCards.length} produtos por preço...`);
        
        // Ordenar cards por preço (crescente)
        productCards.sort((a, b) => {
            const priceA = extractPriceFromCard(a);
            const priceB = extractPriceFromCard(b);
            
            return priceA - priceB;
        });
        
        // Reordenar no DOM
        const resultsContainer = resultsGrid;
        const existingElements = Array.from(resultsContainer.children);
        
        // Encontrar elementos que não são product-cards (como contadores, mensagens, etc)
        const nonProductElements = existingElements.filter(el => !el.classList.contains('product-card'));
        const existingProductCards = existingElements.filter(el => el.classList.contains('product-card'));
        
        // Limpar apenas os product cards
        existingProductCards.forEach(card => card.remove());
        
        // Adicionar elementos não-product primeiro
        nonProductElements.forEach(el => {
            if (el.parentNode === resultsContainer) {
                el.remove();
                resultsContainer.appendChild(el);
            }
        });
        
        // Adicionar cards ordenados
        productCards.forEach(card => {
            resultsContainer.appendChild(card);
        });
        
        console.log('Produtos ordenados por preço crescente');
        
        // Reaplicar cores após reordenar
        setTimeout(() => {
            processResults(); // Recalcular min/max após ordenação
        }, 100);
    }
    
    function extractPriceFromCard(card) {
        const priceElement = card.querySelector('.product-price');
        if (!priceElement) {
            console.log('Elemento de preço não encontrado no card:', card);
            return 0;
        }
        
        const priceText = priceElement.textContent
            .replace('R$', '')
            .replace(/\./g, '') // Remove pontos (para formato 1.000,00)
            .replace(',', '.')
            .trim();
        
        const price = parseFloat(priceText);
        
        if (isNaN(price)) {
            console.log('Preço inválido:', priceElement.textContent, '->', priceText);
            return 0;
        }
        
        return price;
    }
    
    function addCustomStyles() {
        // Verificar se o estilo já foi adicionado
        if (document.getElementById('price-sorter-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'price-sorter-styles';
        style.textContent = `
            .product-price.price-cheapest,
            .product-price.price-min {
                color: #10b981 !important;
                font-weight: 700 !important;
            }
            
            .product-price.price-most-expensive,
            .product-price.price-max {
                color: #ef4444 !important;
                font-weight: 700 !important;
            }
            
            .theme-dark .product-price.price-cheapest,
            .theme-dark .product-price.price-min {
                color: #34d399 !important;
            }
            
            .theme-dark .product-price.price-most-expensive,
            .theme-dark .product-price.price-max {
                color: #f87171 !important;
            }
            
            .product-card {
                transition: transform 0.2s ease;
            }
            
            .product-card:hover {
                transform: translateY(-2px);
            }
            
            /* Indicador visual de ordenação */
            .sorting-indicator {
                display: inline-block;
                margin-left: 8px;
                font-size: 0.8em;
                color: #6b7280;
            }
            
            .sort-asc .sorting-indicator::after {
                content: "↑";
                color: #10b981;
            }
            
            .sort-desc .sorting-indicator::after {
                content: "↓";
                color: #ef4444;
            }
        `;
        document.head.appendChild(style);
    }
}
