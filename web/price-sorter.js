// price-sorter.js - Ordenação e coloração de preços
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se estamos na página de busca
    if (!document.getElementById('resultsGrid')) return;
    
    // Elementos do DOM
    const resultsGrid = document.getElementById('resultsGrid');
    const sortFilter = document.getElementById('sortFilter');
    
    // Adicionar opção de ordenação por preço (mais barato) se não existir
    if (sortFilter && !sortFilter.querySelector('option[value="cheap"]')) {
        const cheapOption = document.createElement('option');
        cheapOption.value = 'cheap';
        cheapOption.textContent = 'Preço: mais barato';
        sortFilter.appendChild(cheapOption);
    }
    
    // Variáveis para controle de cores
    let minPrice = 0;
    let maxPrice = 0;
    
    // Função para calcular min e max dos preços
    const calculatePriceRange = (results) => {
        const validPrices = results
            .filter(item => item.preco_produto && typeof item.preco_produto === 'number' && item.preco_produto > 0)
            .map(item => item.preco_produto);
        
        if (validPrices.length === 0) {
            minPrice = 0;
            maxPrice = 0;
            return;
        }
        
        minPrice = Math.min(...validPrices);
        maxPrice = Math.max(...validPrices);
    };
    
    // Função para determinar a cor baseada no preço
    const getPriceColor = (price) => {
        if (!price || typeof price !== 'number' || price <= 0 || minPrice === maxPrice) {
            return null; // Sem cor especial
        }
        
        // Calcular a posição no espectro (0 = mais barato, 1 = mais caro)
        const position = (price - minPrice) / (maxPrice - minPrice);
        
        // Verificar se está no modo claro
        const isLightMode = document.body.classList.contains('light-mode');
        
        if (position === 0) {
            // Preço mais barato - Verde
            return isLightMode ? '#10b981' : '#34d399'; // Verde mais suave no dark
        } else if (position === 1) {
            // Preço mais caro - Vermelho
            return isLightMode ? '#ef4444' : '#f87171'; // Vermelho mais suave no dark
        } else if (position < 0.3) {
            // Preços baixos - tons de verde
            const intensity = Math.floor(150 + (position * 50));
            return isLightMode ? `rgb(16, 185, 129)` : `rgb(52, 211, 153)`;
        } else if (position > 0.7) {
            // Preços altos - tons de vermelho
            const intensity = Math.floor(150 + ((1 - position) * 50));
            return isLightMode ? `rgb(239, 68, 68)` : `rgb(248, 113, 113)`;
        } else {
            // Preços médios - cor padrão ou gradiente suave
            return null;
        }
    };
    
    // Função para aplicar cores aos preços
    const applyPriceColors = () => {
        const priceElements = resultsGrid.querySelectorAll('.product-price');
        
        priceElements.forEach(element => {
            // Remover estilos anteriores
            element.style.color = '';
            element.style.fontWeight = '';
            element.style.background = '';
            element.style.padding = '';
            element.style.borderRadius = '';
            
            // Tentar extrair o preço do texto do elemento
            const priceText = element.textContent.replace('R$ ', '').replace(',', '.').trim();
            const price = parseFloat(priceText);
            
            if (!isNaN(price) && price > 0) {
                const color = getPriceColor(price);
                
                if (color) {
                    element.style.color = color;
                    element.style.fontWeight = '600';
                    
                    // Adicionar fundo sutil para melhor contraste
                    if (document.body.classList.contains('light-mode')) {
                        element.style.background = `${color}15`; // Cor com 10% de opacidade
                        element.style.padding = '2px 6px';
                        element.style.borderRadius = '4px';
                    }
                }
            }
        });
    };
    
    // Função para ordenar resultados por preço (crescente)
    const sortByPrice = (results) => {
        return [...results].sort((a, b) => {
            const priceA = a.preco_produto || 0;
            const priceB = b.preco_produto || 0;
            
            // Tratar casos onde o preço não está disponível
            if (!priceA && !priceB) return 0;
            if (!priceA) return 1; // Sem preço vai para o final
            if (!priceB) return -1; // Sem preço vai para o final
            
            return priceA - priceB;
        });
    };
    
    // Observar mudanças no tema para atualizar cores
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                applyPriceColors();
            }
        });
    });
    
    observer.observe(document.body, { attributes: true });
    
    // Sobrescrever a função applyFilters original para incluir a coloração
    const originalApplyFilters = window.applyFilters;
    
    window.applyFilters = function() {
        if (originalApplyFilters) {
            originalApplyFilters();
        }
        
        // Aplicar cores após um pequeno delay para garantir que o DOM foi atualizado
        setTimeout(applyPriceColors, 50);
    };
    
    // Sobrescrever a função displayFilteredResults original
    const originalDisplayFilteredResults = window.displayFilteredResults;
    
    window.displayFilteredResults = function(results) {
        // Ordenar por preço se a opção estiver selecionada
        if (sortFilter && sortFilter.value === 'cheap') {
            results = sortByPrice(results);
        }
        
        // Calcular a faixa de preços para o gradiente
        calculatePriceRange(results);
        
        if (originalDisplayFilteredResults) {
            originalDisplayFilteredResults(results);
        } else {
            // Fallback caso a função original não exista
            displayResultsFallback(results);
        }
        
        // Aplicar cores após a renderização
        setTimeout(applyPriceColors, 100);
    };
    
    // Função fallback para exibir resultados
    const displayResultsFallback = (results) => {
        if (results.length === 0) {
            resultsGrid.innerHTML = `
                <div class="empty-state">
                    <h3>Nenhum resultado encontrado</h3>
                    <p>Tente ajustar os filtros aplicados</p>
                </div>`;
            return;
        }
        
        const frag = document.createDocumentFragment();
        
        // Adicionar contador de resultados
        const resultsCount = document.createElement('div');
        resultsCount.style.cssText = 'grid-column: 1 / -1; margin-bottom: 1rem;';
        resultsCount.innerHTML = `<p><strong>${results.length}</strong> resultado(s) encontrado(s)</p>`;
        frag.appendChild(resultsCount);
        
        // Adicionar cards de produtos
        results.forEach(item => {
            const div = document.createElement('div');
            div.innerHTML = buildProductCardEnhanced(item);
            frag.appendChild(div.firstElementChild);
        });
        
        resultsGrid.innerHTML = '';
        resultsGrid.appendChild(frag);
    };
    
    // Versão melhorada do card de produto com suporte a cores
    const buildProductCardEnhanced = (item) => {
        const price = typeof item.preco_produto === 'number' ? 
            `R$ ${item.preco_produto.toFixed(2).replace('.', ',')}` : 'N/A';
        
        const date = item.data_ultima_venda ? 
            new Date(item.data_ultima_venda).toLocaleDateString('pt-BR') : 'N/A';
        
        // Determinar se é o mais barato ou mais caro
        const isCheapest = item.preco_produto === minPrice && minPrice !== maxPrice;
        const isMostExpensive = item.preco_produto === maxPrice && minPrice !== maxPrice;
        
        let priceClass = '';
        if (isCheapest) priceClass = 'price-cheapest';
        if (isMostExpensive) priceClass = 'price-most-expensive';
        
        return `
        <div class="product-card">
            <div class="card-header">
                <div class="product-name">${item.nome_produto || 'Produto sem nome'}</div>
                <div class="product-price ${priceClass}">${price}</div>
            </div>
            <ul class="product-details">
                <li><span>🛒</span> ${item.nome_supermercado}</li>
                <li><span>⚖️</span> ${item.tipo_unidade || 'UN'} (${item.unidade_medida || 'N/A'})</li>
                <li><span>📅</span> Visto em: ${date}</li>
                <li><span>🔳</span> ${item.codigo_barras || 'Sem código'}</li>
            </ul>
        </div>`;
    };
    
    // Adicionar CSS personalizado para as cores dos preços
    const style = document.createElement('style');
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
        
        .price-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: 600;
            margin-left: 5px;
        }
        
        .price-badge.cheapest {
            background: #10b98120;
            color: #10b981;
        }
        
        .price-badge.most-expensive {
            background: #ef444420;
            color: #ef4444;
        }
        
        .theme-dark .price-badge.cheapest {
            background: #34d39920;
            color: #34d399;
        }
        
        .theme-dark .price-badge.most-expensive {
            background: #f8717120;
            color: #f87171;
        }
    `;
    document.head.appendChild(style);
    
    console.log('Price sorter carregado com sucesso!');
});
