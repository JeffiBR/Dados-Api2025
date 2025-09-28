// price-sorter.js - Ordenação e coloração de preços (versão compatível)
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
    
    if (!sortFilter) return;
    
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
        if (sortFilter.value === 'cheap' && currentResults.length > 0) {
            applyPriceSorting();
        }
    }
    
    function observeResultsGrid() {
        // Observar mudanças no grid de resultados
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Aguardar um pouco para garantir que os resultados foram renderizados
                    setTimeout(() => {
                        processResults();
                    }, 200);
                }
            });
        });
        
        observer.observe(resultsGrid, { childList: true, subtree: true });
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
        
        // Reconstruir array de resultados a partir do DOM
        currentResults = Array.from(productCards).map(card => {
            const priceElement = card.querySelector('.product-price');
            const priceText = priceElement?.textContent.replace('R$ ', '').replace(',', '.').trim();
            const price = parseFloat(priceText) || 0;
            
            return {
                preco_produto: price,
                element: card
            };
        });
        
        // Calcular faixa de preços
        calculatePriceRange();
        
        // Aplicar cores
        applyPriceColors();
        
        // Se a ordenação por preço estiver ativa, reordenar
        if (sortFilter.value === 'cheap') {
            applyPriceSorting();
        }
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
            
            // Remover estilos anteriores
            priceElement.style.color = '';
            priceElement.style.fontWeight = '';
            priceElement.style.background = '';
            priceElement.style.padding = '';
            priceElement.style.borderRadius = '';
            priceElement.classList.remove('price-cheapest', 'price-most-expensive');
            
            const priceText = priceElement.textContent.replace('R$ ', '').replace(',', '.').trim();
            const price = parseFloat(priceText);
            
            if (isNaN(price) || price <= 0 || minPrice === maxPrice) return;
            
            // Aplicar cores baseadas na posição do preço
            if (price === minPrice) {
                // Preço mais barato - Verde
                priceElement.classList.add('price-cheapest');
            } else if (price === maxPrice) {
                // Preço mais caro - Vermelho
                priceElement.classList.add('price-most-expensive');
            } else {
                // Preço intermediário - cor gradiente
                applyGradientColor(priceElement, price);
            }
        });
    }
    
    function applyGradientColor(element, price) {
        const position = (price - minPrice) / (maxPrice - minPrice);
        const isLightMode = document.body.classList.contains('light-mode');
        
        // Interpolar entre verde e vermelho
        let red, green;
        
        if (position < 0.5) {
            // Verde para amarelo
            green = 255;
            red = Math.floor(255 * (position * 2));
        } else {
            // Amarelo para vermelho
            red = 255;
            green = Math.floor(255 * ((1 - position) * 2));
        }
        
        // Ajustar cores para os temas
        if (isLightMode) {
            // Cores mais vibrantes no modo claro
            element.style.color = `rgb(${red}, ${green}, 0)`;
        } else {
            // Cores mais suaves no modo escuro
            const adjustedRed = Math.floor(red * 0.8);
            const adjustedGreen = Math.floor(green * 0.8);
            element.style.color = `rgb(${adjustedRed}, ${adjustedGreen}, 100)`;
        }
        
        element.style.fontWeight = '600';
    }
    
    function applyPriceSorting() {
        const productCards = Array.from(resultsGrid.querySelectorAll('.product-card'));
        if (productCards.length === 0) return;
        
        // Ordenar cards por preço
        productCards.sort((a, b) => {
            const priceA = extractPriceFromCard(a);
            const priceB = extractPriceFromCard(b);
            
            return priceA - priceB;
        });
        
        // Reordenar no DOM
        const resultsCount = resultsGrid.querySelector('div[style*="grid-column"]');
        const fragment = document.createDocumentFragment();
        
        // Manter o contador de resultados no topo
        if (resultsCount) {
            fragment.appendChild(resultsCount);
        }
        
        // Adicionar cards ordenados
        productCards.forEach(card => {
            fragment.appendChild(card);
        });
        
        // Limpar e re-adicionar
        resultsGrid.innerHTML = '';
        resultsGrid.appendChild(fragment);
        
        // Reaplicar cores após reordenar
        setTimeout(applyPriceColors, 50);
    }
    
    function extractPriceFromCard(card) {
        const priceElement = card.querySelector('.product-price');
        if (!priceElement) return 0;
        
        const priceText = priceElement.textContent.replace('R$ ', '').replace(',', '.').trim();
        return parseFloat(priceText) || 0;
    }
    
    function addCustomStyles() {
        // Verificar se o estilo já foi adicionado
        if (document.getElementById('price-sorter-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'price-sorter-styles';
        style.textContent = `
            .product-price.price-cheapest {
                color: #10b981 !important;
                font-weight: 600 !important;
            }
            
            .product-price.price-most-expensive {
                color: #ef4444 !important;
                font-weight: 600 !important;
            }
            
            .theme-dark .product-price.price-cheapest {
                color: #34d399 !important;
            }
            
            .theme-dark .product-price.price-most-expensive {
                color: #f87171 !important;
            }
            
            .product-card {
                transition: transform 0.2s ease;
            }
            
            .product-card:hover {
                transform: translateY(-2px);
            }
        `;
        document.head.appendChild(style);
    }
}
