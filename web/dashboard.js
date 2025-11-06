// dashboard.js - Sistema completo usando APENAS endpoints existentes
// VERSÃO DEFINITIVA - SEM ERROS 405

// Variáveis globais
let currentAnalysisData = null;
let userProfile = null;
let allCharts = [];

// Configuração da IA
const OPENROUTER_CONFIG = {
    api_key: "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",
    model: "deepseek/deepseek-r1-distill-llama-70b:free",
    base_url: "https://openrouter.ai/api/v1"
};

// Inicialização
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🔧 Inicializando dashboard completo...');

    try {
        const isAuthenticated = await window.checkAuth();
        if (!isAuthenticated) {
            window.redirectToLogin();
            return;
        }

        const hasAccess = await window.hasPageAccess('dashboard');
        if (!hasAccess) {
            alert('Você não tem permissão para acessar o dashboard.');
            window.location.href = '/search.html';
            return;
        }

        await loadUserProfile();
        setDefaultDates();
        await loadMarkets();

        console.log('✅ Dashboard completo inicializado com sucesso');

    } catch (error) {
        console.error('❌ Erro na inicialização do dashboard:', error);
        showError('Erro ao inicializar o dashboard. Tente recarregar a página.');
    }
});

// Funções principais
function setDefaultDates() {
    const today = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(today.getDate() - 7);

    document.getElementById('startDate').value = oneWeekAgo.toISOString().split('T')[0];
    document.getElementById('endDate').value = today.toISOString().split('T')[0];
}

async function loadUserProfile() {
    try {
        userProfile = await window.getCurrentUserProfile();
        if (userProfile) {
            const userNameElement = document.querySelector('.user-name');
            const userRoleElement = document.querySelector('.user-role');
            const userAvatar = document.getElementById('userAvatar');

            if (userNameElement) {
                userNameElement.textContent = userProfile.full_name || 'Usuário';
            }

            if (userRoleElement) {
                userRoleElement.textContent = userProfile.role === 'admin' ? 'Administrador' : 
                                            (userProfile.managed_groups && userProfile.managed_groups.length > 0 ? 'Admin de Grupo' : 'Usuário');
            }

            if (userAvatar && userProfile.full_name) {
                userAvatar.textContent = userProfile.full_name.charAt(0).toUpperCase();
            }
        }
    } catch (error) {
        console.error('Erro ao carregar perfil do usuário:', error);
    }
}

async function loadMarkets() {
    try {
        const response = await window.authenticatedFetch('/api/supermarkets/public');
        if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);

        const markets = await response.json();
        const marketSelect = document.getElementById('marketSelect');

        if (marketSelect) {
            marketSelect.innerHTML = '<option value="all">Todos os mercados</option>';
            markets.forEach(market => {
                const option = document.createElement('option');
                option.value = market.cnpj;
                option.textContent = market.nome;
                marketSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Erro ao carregar mercados:', error);
        showError('Erro ao carregar lista de mercados.');
    }
}

// FUNÇÃO PRINCIPAL CORRIGIDA - usando apenas endpoints existentes
async function loadAllDataAndGenerateDashboard() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const marketSelect = document.getElementById('marketSelect');
    const selectedMarkets = Array.from(marketSelect.selectedOptions).map(opt => opt.value);

    if (!startDate || !endDate) {
        showError('Por favor, selecione as datas de início e fim.');
        return;
    }

    showLoading(true, '📊 Buscando dados do sistema...');
    hideMessages();

    try {
        const cnpjs = selectedMarkets.includes('all') ? null : selectedMarkets;

        console.log('🔍 Buscando dados com parâmetros:', {
            start_date: startDate,
            end_date: endDate,
            cnpjs: cnpjs
        });

        // USANDO APENAS ENDPOINTS QUE EXISTEM NO SEU BACKEND
        // Endpoint 1: Dados de análise principal (POST)
        const analysisResponse = await window.authenticatedFetch('/api/dashboard/collection-products-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_date: startDate,
                end_date: endDate,
                cnpjs: cnpjs
            })
        });

        if (!analysisResponse.ok) {
            const errorText = await analysisResponse.text();
            throw new Error(`Erro ${analysisResponse.status}: ${errorText}`);
        }

        const analysisText = await analysisResponse.text();
        currentAnalysisData = JSON.parse(analysisText);

        // Endpoint 2: Dados de produtos por mercado (GET)
        const productsByMarketResponse = await window.authenticatedFetch(
            `/api/dashboard/products-by-market?start_date=${startDate}&end_date=${endDate}${cnpjs ? `&cnpjs=${cnpjs.join(',')}` : ''}`
        );

        let productsByMarketData = [];
        if (productsByMarketResponse.ok) {
            productsByMarketData = await productsByMarketResponse.json();
        }

        // Endpoint 3: Dados de top produtos (GET)
        const topProductsResponse = await window.authenticatedFetch(
            `/api/dashboard/top-products?start_date=${startDate}&end_date=${endDate}&limit=50${cnpjs ? `&cnpjs=${cnpjs.join(',')}` : ''}`
        );

        let topProductsData = [];
        if (topProductsResponse.ok) {
            topProductsData = await topProductsResponse.json();
        }

        // Combinar todos os dados
        const combinedData = {
            ...currentAnalysisData,
            products_by_market: productsByMarketData,
            detailed_top_products: topProductsData
        };

        if (!hasSufficientData(combinedData)) {
            showWarning('Dados insuficientes para análise. Tente ampliar o período ou selecionar mais mercados.');
            return;
        }

        console.log('✅ Dados carregados com sucesso:', combinedData);

        await generateCompleteDashboard(combinedData);
        showSuccess(`Dashboard gerado com ${combinedData.estatisticas_gerais?.total_produtos_periodo || 0} produtos analisados!`);

    } catch (error) {
        console.error('❌ Erro ao carregar dados:', error);

        if (error.message.includes('401') || error.message.includes('403')) {
            showError('Sessão expirada. Redirecionando para login...');
            setTimeout(() => window.redirectToLogin(), 2000);
        } else if (error.message.includes('500')) {
            showError('Erro interno do servidor. Tente novamente em alguns instantes.');
        } else {
            showError('Erro ao carregar dados: ' + error.message);
        }
    } finally {
        showLoading(false);
    }
}

// Funções de análise específica - adaptadas para usar dados disponíveis
function analyzeCheapestPricesByCategory(data) {
    // Usar top_produtos do analysisData
    const topProducts = data.top_produtos || [];
    const detailedProducts = data.detailed_top_products || [];

    // Combinar produtos para análise mais completa
    const allProducts = [...topProducts, ...detailedProducts];

    const meatProducts = allProducts.filter(product => 
        product.nome_produto && (
            product.nome_produto.toLowerCase().includes('carne') ||
            product.nome_produto.toLowerCase().includes('bovina') ||
            product.nome_produto.toLowerCase().includes('suína') ||
            product.nome_produto.toLowerCase().includes('frango') ||
            product.nome_produto.toLowerCase().includes('bife') ||
            product.nome_produto.toLowerCase().includes('picanha') ||
            product.nome_produto.toLowerCase().includes('alcatra') ||
            product.nome_produto.toLowerCase().includes('contra') ||
            product.nome_produto.toLowerCase().includes('coxão') ||
            product.nome_produto.toLowerCase().includes('acém') ||
            product.nome_produto.toLowerCase().includes('patinho') ||
            product.nome_produto.toLowerCase().includes('linguiça') ||
            product.nome_produto.toLowerCase().includes('salsicha') ||
            product.nome_produto.toLowerCase().includes('bacon') ||
            product.nome_produto.toLowerCase().includes('lombo') ||
            product.nome_produto.toLowerCase().includes('pernil')
        )
    );

    const produceProducts = allProducts.filter(product =>
        product.nome_produto && (
            product.nome_produto.toLowerCase().includes('alface') ||
            product.nome_produto.toLowerCase().includes('tomate') ||
            product.nome_produto.toLowerCase().includes('cebola') ||
            product.nome_produto.toLowerCase().includes('batata') ||
            product.nome_produto.toLowerCase().includes('cenoura') ||
            product.nome_produto.toLowerCase().includes('beterraba') ||
            product.nome_produto.toLowerCase().includes('repolho') ||
            product.nome_produto.toLowerCase().includes('couve') ||
            product.nome_produto.toLowerCase().includes('rúcula') ||
            product.nome_produto.toLowerCase().includes('espinafre') ||
            product.nome_produto.toLowerCase().includes('brócolis') ||
            product.nome_produto.toLowerCase().includes('couve-flor') ||
            product.nome_produto.toLowerCase().includes('pimentão') ||
            product.nome_produto.toLowerCase().includes('abobrinha') ||
            product.nome_produto.toLowerCase().includes('berinjela') ||
            product.nome_produto.toLowerCase().includes('chuchu') ||
            product.nome_produto.toLowerCase().includes('quiabo') ||
            product.nome_produto.toLowerCase().includes('abóbora') ||
            product.nome_produto.toLowerCase().includes('mandioca') ||
            product.nome_produto.toLowerCase().includes('inhame') ||
            product.nome_produto.toLowerCase().includes('banana') ||
            product.nome_produto.toLowerCase().includes('maçã') ||
            product.nome_produto.toLowerCase().includes('laranja') ||
            product.nome_produto.toLowerCase().includes('limão') ||
            product.nome_produto.toLowerCase().includes('tangerina') ||
            product.nome_produto.toLowerCase().includes('uva') ||
            product.nome_produto.toLowerCase().includes('mamão') ||
            product.nome_produto.toLowerCase().includes('manga') ||
            product.nome_produto.toLowerCase().includes('abacate') ||
            product.nome_produto.toLowerCase().includes('abacaxi') ||
            product.nome_produto.toLowerCase().includes('melancia') ||
            product.nome_produto.toLowerCase().includes('melão') ||
            product.nome_produto.toLowerCase().includes('morango')
        )
    );

    // Ordenar por preço médio (menor primeiro) e pegar os 10 mais baratos
    const cheapestMeats = meatProducts
        .sort((a, b) => (a.preco_medio || 0) - (b.preco_medio || 0))
        .slice(0, 10);

    const cheapestProduce = produceProducts
        .sort((a, b) => (a.preco_medio || 0) - (b.preco_medio || 0))
        .slice(0, 10);

    return {
        carnes: cheapestMeats,
        hortifruti: cheapestProduce
    };
}

function analyzeTopProductsByMarket(data) {
    const productsByMarket = data.products_by_market || [];
    const topProducts = data.detailed_top_products || [];

    const marketProducts = {};

    // Processar produtos por mercado
    productsByMarket.forEach(market => {
        const mercado = market.nome_supermercado;
        if (!marketProducts[mercado]) {
            marketProducts[mercado] = [];
        }

        // Adicionar produtos deste mercado
        marketProducts[mercado].push({
            nome: mercado,
            count: market.total_produtos,
            avgPrice: market.preco_medio || 0
        });
    });

    // Processar top produtos para adicionar mais detalhes
    topProducts.forEach(product => {
        const mercado = product.mercado_mais_barato || product.mercado_mais_comum;
        if (mercado && mercado !== 'N/A') {
            if (!marketProducts[mercado]) {
                marketProducts[mercado] = [];
            }

            marketProducts[mercado].push({
                nome: product.nome_produto,
                count: product.frequencia || 0,
                avgPrice: product.preco_medio || 0,
                minPrice: product.preco_mais_barato || product.preco_medio || 0,
                maxPrice: product.preco_medio || 0
            });
        }
    });

    // Ordenar e limitar a 10 produtos por mercado
    const topProductsByMarket = {};
    Object.keys(marketProducts).forEach(mercado => {
        topProductsByMarket[mercado] = marketProducts[mercado]
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    });

    return topProductsByMarket;
}

function analyzeMarketLeader(data) {
    const marketsRanking = data.mercados_ranking || [];
    const productsByMarket = data.products_by_market || [];

    // Combinar dados de diferentes fontes
    const marketCounts = {};

    // Usar mercados_ranking como base
    marketsRanking.forEach(market => {
        marketCounts[market.mercado] = market.total_produtos;
    });

    // Complementar com products_by_market
    productsByMarket.forEach(market => {
        const nome = market.nome_supermercado;
        if (marketCounts[nome]) {
            marketCounts[nome] = Math.max(marketCounts[nome], market.total_produtos);
        } else {
            marketCounts[nome] = market.total_produtos;
        }
    });

    const marketLeaderboard = Object.entries(marketCounts)
        .map(([mercado, count]) => ({ mercado, count }))
        .sort((a, b) => b.count - a.count);

    return marketLeaderboard;
}

// Geração do dashboard completo
async function generateCompleteDashboard(data) {
    clearAllCharts();

    document.getElementById('iaDashboard').style.display = 'block';
    document.getElementById('emptyState').style.display = 'none';

    // Gerar análises específicas
    const cheapestAnalysis = analyzeCheapestPricesByCategory(data);
    const topByMarketAnalysis = analyzeTopProductsByMarket(data);
    const marketLeaderAnalysis = analyzeMarketLeader(data);

    const statsHTML = generateCompleteStats(data);
    const chartsHTML = generateChartsHTML();
    const tablesHTML = generateCompleteTables(data, cheapestAnalysis, topByMarketAnalysis, marketLeaderAnalysis);
    const insightsHTML = await generateRealInsights(data, cheapestAnalysis, marketLeaderAnalysis);

    const dashboardContainer = document.getElementById('iaDashboard');
    dashboardContainer.innerHTML = `
        <div class="dashboard-with-real-data">
            <div class="real-data-header">
                <div class="data-badge">
                    <i class="fas fa-database"></i>
                    DASHBOARD COMPLETO
                </div>
                <div class="data-info">
                    <span><i class="fas fa-calendar"></i> ${document.getElementById('startDate').value} à ${document.getElementById('endDate').value}</span>
                    <span><i class="fas fa-store"></i> ${data.estatisticas_gerais?.total_mercados || 0} mercados</span>
                    <span><i class="fas fa-boxes"></i> ${data.estatisticas_gerais?.total_produtos_periodo || 0} produtos analisados</span>
                </div>
            </div>

            <!-- Estatísticas Reais -->
            <div class="dashboard-section">
                <h3><i class="fas fa-chart-line"></i> Métricas Principais</h3>
                <div class="dashboard-grid" id="realStats">
                    ${statsHTML}
                </div>
            </div>

            <!-- Análises Específicas -->
            <div class="dashboard-section">
                <h3><i class="fas fa-search-dollar"></i> Análises de Preços</h3>
                <div class="tables-container">
                    ${generateSpecificAnalysisTables(cheapestAnalysis, marketLeaderAnalysis)}
                </div>
            </div>

            <!-- Top por Mercado -->
            <div class="dashboard-section">
                <h3><i class="fas fa-trophy"></i> Produtos por Mercado</h3>
                <div class="tables-container">
                    ${generateMarketTopProductsTables(topByMarketAnalysis)}
                </div>
            </div>

            <!-- Gráficos -->
            <div class="dashboard-section">
                <h3><i class="fas fa-chart-bar"></i> Visualizações Gráficas</h3>
                <div class="charts-container" id="realCharts">
                    ${chartsHTML}
                </div>
            </div>

            <!-- Tabelas Gerais -->
            <div class="dashboard-section">
                <h3><i class="fas fa-table"></i> Dados Consolidados</h3>
                <div class="tables-container" id="realTables">
                    ${tablesHTML}
                </div>
            </div>

            <!-- Insights -->
            <div class="dashboard-section">
                <h3><i class="fas fa-lightbulb"></i> Insights e Recomendações</h3>
                <div class="insights-container" id="realInsights">
                    ${insightsHTML}
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        renderRealCharts(data);
    }, 100);
}

// ... (as funções generateCompleteStats, generateChartsHTML, generateSpecificAnalysisTables, 
// generateMarketTopProductsTables, generateCompleteTables, renderRealCharts, etc. 
// permanecem EXATAMENTE como na versão anterior que eu enviei)

// Função para verificar se há dados suficientes
function hasSufficientData(data) {
    if (!data) return false;
    const totalProducts = data.estatisticas_gerais?.total_produtos_periodo || 0;
    const totalMarkets = data.estatisticas_gerais?.total_mercados || 0;
    return totalProducts > 0 && totalMarkets > 0;
}

// ... (as funções utilitárias showLoading, showError, showSuccess, hideMessages, 
// clearAllCharts, resetFilters permanecem iguais)

// Função de análise de promoções (simplificada)
async function generatePromotionAnalysisWithRealData() {
    if (!currentAnalysisData) {
        showError('Por favor, carregue os dados primeiro usando "Carregar TODOS os Dados".');
        return;
    }

    showLoading(true, '🤖 Analisando oportunidades...');
    hideMessages();

    try {
        // Análise básica baseada nos dados disponíveis
        const cheapestAnalysis = analyzeCheapestPricesByCategory(currentAnalysisData);
        const marketLeaderAnalysis = analyzeMarketLeader(currentAnalysisData);

        const analysis = `
            <h3>🎯 Oportunidades de Promoção Identificadas</h3>
            <p>Baseado em ${currentAnalysisData.estatisticas_gerais?.total_produtos_periodo || 0} produtos analisados:</p>

            <h4>🍖 Melhores Oportunidades em Carnes:</h4>
            <ul>
                ${cheapestAnalysis.carnes.slice(0, 3).map(product => `
                    <li><strong>${product.nome_produto}</strong> - R$ ${product.preco_medio?.toFixed(2) || '0.00'} 
                    (${product.mercado_mais_barato || 'Mercado disponível'})</li>
                `).join('')}
            </ul>

            <h4>🥦 Melhores Oportunidades em Hortifruti:</h4>
            <ul>
                ${cheapestAnalysis.hortifruti.slice(0, 3).map(product => `
                    <li><strong>${product.nome_produto}</strong> - R$ ${product.preco_medio?.toFixed(2) || '0.00'} 
                    (${product.mercado_mais_barato || 'Mercado disponível'})</li>
                `).join('')}
            </ul>

            <h4>🏆 Mercado Líder:</h4>
            <p><strong>${marketLeaderAnalysis[0]?.mercado || 'N/A'}</strong> com ${marketLeaderAnalysis[0]?.count || 0} produtos coletados</p>

            <h4>💡 Estratégias Recomendadas:</h4>
            <ul>
                <li>Promoções relâmpago nos produtos mais baratos identificados</li>
                <li>Destaque para itens sazonais com melhor custo-benefício</li>
                <li>Monitoramento de preços nos mercados concorrentes</li>
            </ul>
        `;

        showPromotionAnalysisModal(analysis);
        showSuccess('Análise de promoções gerada com sucesso!');

    } catch (error) {
        console.error('❌ Erro na análise de promoções:', error);
        showError('Erro ao gerar análise de promoções: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Modal para análise de promoções (mantida igual)
function showPromotionAnalysisModal(analysis) {
    const modalHTML = `
        <div class="modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px;">
            <div class="modal-content" style="background: #2d3748; border-radius: 12px; padding: 24px; max-width: 800px; width: 100%; max-height: 80vh; overflow-y: auto; border: 1px solid #4a5568;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #4a5568; padding-bottom: 15px;">
                    <h3 style="margin: 0; color: #fff; font-size: 1.4rem;">
                        <i class="fas fa-bullhorn"></i> Análise de Promoções
                    </h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; color: #a0aec0; font-size: 1.5rem; cursor: pointer;">&times;</button>
                </div>
                <div class="modal-body" style="color: #e2e8f0; line-height: 1.6;">
                    ${analysis}
                </div>
                <div class="modal-footer" style="margin-top: 24px; display: flex; justify-content: flex-end; border-top: 1px solid #4a5568; padding-top: 15px;">
                    <button class="btn" onclick="this.closest('.modal-overlay').remove()" style="background: #3498db; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer;">Fechar</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Exportar funções globais
window.loadAllDataAndGenerateDashboard = loadAllDataAndGenerateDashboard;
window.generatePromotionAnalysisWithRealData = generatePromotionAnalysisWithRealData;
window.resetFilters = resetFilters;

console.log('✅ dashboard.js carregado - VERSÃO DEFINITIVA COM ENDPOINTS EXISTENTES');