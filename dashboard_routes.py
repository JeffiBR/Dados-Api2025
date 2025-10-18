# dashboard_routes.py - Sistema completo de relatórios e estatísticas para o dashboard

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta
from pydantic import BaseModel, Field
import logging
import asyncio
import pandas as pd

# Importar dependências compartilhadas
from dependencies import get_current_user, UserProfile, require_page_access, supabase, supabase_admin

# Criar router específico para dashboard
dashboard_router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

# --------------------------------------------------------------------------
# --- MODELOS DE DADOS PARA DASHBOARD ---
# --------------------------------------------------------------------------

class DashboardSummary(BaseModel):
    total_mercados: int
    total_produtos: int
    total_coletas: int
    ultima_coleta: Optional[str]
    produtos_hoje: int
    variacao_produtos: float

class TopProduct(BaseModel):
    nome_produto: str
    frequencia: int
    preco_medio: float
    mercado_mais_barato: str
    preco_mais_barato: float

class TopMarket(BaseModel):
    nome_supermercado: str
    total_produtos: int
    preco_medio: float
    participacao: float

class PriceTrend(BaseModel):
    data: str
    preco_medio: float
    total_produtos: int

class CategoryStats(BaseModel):
    categoria: str
    total_produtos: int
    preco_medio: float
    variacao_mensal: float

class BargainProduct(BaseModel):
    nome_produto: str
    codigo_barras: Optional[str]
    preco_produto: float
    nome_supermercado: str
    tipo_unidade: str
    economia_percentual: float

class MarketComparison(BaseModel):
    mercado: str
    total_produtos: int
    preco_medio_geral: float
    preco_medio_categoria: float
    rating_value: float

class TimeRangeRequest(BaseModel):
    start_date: date
    end_date: date
    cnpjs: Optional[List[str]] = None
    category: Optional[str] = None

# --------------------------------------------------------------------------
# --- FUNÇÕES AUXILIARES PARA ANÁLISE DE DADOS ---
# --------------------------------------------------------------------------

async def get_date_range_data(start_date: date, end_date: date, cnpjs: Optional[List[str]] = None) -> List[Dict]:
    """Obtém dados do período especificado"""
    try:
        query = supabase.table('produtos').select('*').gte('data_coleta', str(start_date)).lte('data_coleta', str(end_date))
        
        if cnpjs:
            query = query.in_('cnpj_supermercado', cnpjs)
            
        response = await asyncio.to_thread(query.execute)
        return response.data or []
    except Exception as e:
        logging.error(f"Erro ao buscar dados do período: {e}")
        return []

async def calculate_price_trends(data: List[Dict]) -> List[PriceTrend]:
    """Calcula tendências de preços ao longo do tempo"""
    if not data:
        return []
    
    df = pd.DataFrame(data)
    df['data_coleta'] = pd.to_datetime(df['data_coleta']).dt.date
    df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
    
    trends = df.groupby('data_coleta').agg({
        'preco_produto': 'mean',
        'id_registro': 'count'
    }).reset_index()
    
    trends.columns = ['data', 'preco_medio', 'total_produtos']
    trends['preco_medio'] = trends['preco_medio'].round(2)
    
    return [PriceTrend(**row) for row in trends.to_dict('records')]

async def categorize_products(products: List[Dict]) -> Dict[str, List[Dict]]:
    """Categoriza produtos com base em palavras-chave"""
    categories = {
        'Alimentos Básicos': ['arroz', 'feijao', 'acucar', 'oleo', 'farinha', 'macarrao', 'sal'],
        'Carnes': ['carne', 'frango', 'peixe', 'bovina', 'suina', 'linguica', 'bacon'],
        'Laticínios': ['leite', 'queijo', 'manteiga', 'iogurte', 'requeijao', 'coalhada'],
        'Hortifruti': ['fruta', 'verdura', 'legume', 'alface', 'tomate', 'cebola', 'batata'],
        'Bebidas': ['refrigerante', 'suco', 'agua', 'cerveja', 'vinho', 'cafe'],
        'Limpeza': ['sabao', 'detergente', 'desinfetante', 'alcool', 'agua sanitaria'],
        'Higiene': ['shampoo', 'sabonete', 'pasta dental', 'papel higienico', 'desodorante'],
        'Padaria': ['pao', 'bolo', 'bisnaguinha', 'rosquinha', 'torrada']
    }
    
    categorized = {category: [] for category in categories.keys()}
    categorized['Outros'] = []
    
    for product in products:
        product_name = product.get('nome_produto', '').lower()
        categorized_flag = False
        
        for category, keywords in categories.items():
            if any(keyword in product_name for keyword in keywords):
                categorized[category].append(product)
                categorized_flag = True
                break
        
        if not categorized_flag:
            categorized['Outros'].append(product)
    
    return categorized

# --------------------------------------------------------------------------
# --- ENDPOINTS PRINCIPAIS DO DASHBOARD ---
# --------------------------------------------------------------------------

@dashboard_router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    start_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    cnpjs: Optional[List[str]] = Query(None),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna resumo geral do dashboard"""
    try:
        # Dados do período atual
        current_data = await get_date_range_data(start_date, end_date, cnpjs)
        
        # Período anterior para comparação
        days_diff = (end_date - start_date).days
        previous_start = start_date - timedelta(days=days_diff + 1)
        previous_end = start_date - timedelta(days=1)
        previous_data = await get_date_range_data(previous_start, previous_end, cnpjs)
        
        # Mercados ativos
        markets_response = await asyncio.to_thread(
            supabase.table('supermercados').select('id', count='exact').execute
        )
        
        # Coletas no período
        collections_response = await asyncio.to_thread(
            supabase.table('coletas').select('id, finalizada_em')
            .gte('iniciada_em', str(start_date))
            .lte('iniciada_em', str(end_date))
            .order('iniciada_em', desc=True)
            .execute
        )
        
        # Cálculos
        total_mercados = markets_response.count or 0
        total_coletas = len(collections_response.data) if collections_response.data else 0
        ultima_coleta = collections_response.data[0]['finalizada_em'] if collections_response.data else None
        
        produtos_hoje = len(current_data)
        produtos_periodo_anterior = len(previous_data)
        
        if produtos_periodo_anterior > 0:
            variacao_produtos = ((produtos_hoje - produtos_periodo_anterior) / produtos_periodo_anterior) * 100
        else:
            variacao_produtos = 100 if produtos_hoje > 0 else 0
        
        return DashboardSummary(
            total_mercados=total_mercados,
            total_produtos=produtos_hoje,
            total_coletas=total_coletas,
            ultima_coleta=ultima_coleta,
            produtos_hoje=produtos_hoje,
            variacao_produtos=round(variacao_produtos, 2)
        )
        
    except Exception as e:
        logging.error(f"Erro ao gerar resumo do dashboard: {e}")
        raise HTTPException(status_code=500, detail="Erro ao gerar resumo do dashboard")

@dashboard_router.get("/top-products", response_model=List[TopProduct])
async def get_top_products(
    start_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    cnpjs: Optional[List[str]] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna os produtos mais encontrados com análise de preços"""
    try:
        data = await get_date_range_data(start_date, end_date, cnpjs)
        
        if not data:
            return []
        
        df = pd.DataFrame(data)
        df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
        df = df.dropna(subset=['preco_produto'])
        
        # Agrupar por produto
        product_stats = df.groupby('nome_produto_normalizado').agg({
            'id_registro': 'count',
            'preco_produto': 'mean',
            'nome_supermercado': lambda x: x.value_counts().index[0] if not x.empty else 'N/A',
            'nome_produto': 'first'
        }).reset_index()
        
        product_stats.columns = ['nome_normalizado', 'frequencia', 'preco_medio', 'mercado_mais_comum', 'nome_produto']
        
        # Encontrar preço mais barato para cada produto
        cheapest_prices = df.loc[df.groupby('nome_produto_normalizado')['preco_produto'].idxmin()]
        cheapest_map = cheapest_prices.set_index('nome_produto_normalizado')[['nome_supermercado', 'preco_produto']].to_dict('index')
        
        top_products = []
        for _, row in product_stats.nlargest(limit, 'frequencia').iterrows():
            cheapest_info = cheapest_map.get(row['nome_normalizado'], {})
            
            top_product = TopProduct(
                nome_produto=row['nome_produto'],
                frequencia=row['frequencia'],
                preco_medio=round(row['preco_medio'], 2),
                mercado_mais_barato=cheapest_info.get('nome_supermercado', 'N/A'),
                preco_mais_barato=round(cheapest_info.get('preco_produto', 0), 2)
            )
            top_products.append(top_product)
        
        return top_products
        
    except Exception as e:
        logging.error(f"Erro ao buscar top produtos: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar produtos mais frequentes")

@dashboard_router.get("/top-markets", response_model=List[TopMarket])
async def get_top_markets(
    start_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    cnpjs: Optional[List[str]] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna análise dos mercados mais ativos"""
    try:
        data = await get_date_range_data(start_date, end_date, cnpjs)
        
        if not data:
            return []
        
        df = pd.DataFrame(data)
        df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
        df = df.dropna(subset=['preco_produto'])
        
        # Estatísticas por mercado
        market_stats = df.groupby('nome_supermercado').agg({
            'id_registro': 'count',
            'preco_produto': 'mean'
        }).reset_index()
        
        total_products = market_stats['id_registro'].sum()
        
        top_markets = []
        for _, row in market_stats.nlargest(limit, 'id_registro').iterrows():
            participacao = (row['id_registro'] / total_products) * 100 if total_products > 0 else 0
            
            top_market = TopMarket(
                nome_supermercado=row['nome_supermercado'],
                total_produtos=row['id_registro'],
                preco_medio=round(row['preco_produto'], 2),
                participacao=round(participacao, 2)
            )
            top_markets.append(top_market)
        
        return top_markets
        
    except Exception as e:
        logging.error(f"Erro ao buscar top mercados: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar análise de mercados")

@dashboard_router.get("/price-trends", response_model=List[PriceTrend])
async def get_price_trends(
    start_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    cnpjs: Optional[List[str]] = Query(None),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna tendência de preços ao longo do tempo"""
    try:
        data = await get_date_range_data(start_date, end_date, cnpjs)
        trends = await calculate_price_trends(data)
        return trends
    except Exception as e:
        logging.error(f"Erro ao calcular tendências: {e}")
        raise HTTPException(status_code=500, detail="Erro ao calcular tendências de preços")

@dashboard_router.get("/category-stats", response_model=List[CategoryStats])
async def get_category_stats(
    start_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    cnpjs: Optional[List[str]] = Query(None),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna estatísticas por categoria de produtos"""
    try:
        data = await get_date_range_data(start_date, end_date, cnpjs)
        
        if not data:
            return []
        
        # Categorizar produtos
        categorized = await categorize_products(data)
        
        # Período anterior para comparação
        days_diff = (end_date - start_date).days
        previous_start = start_date - timedelta(days=days_diff + 1)
        previous_end = start_date - timedelta(days=1)
        previous_data = await get_date_range_data(previous_start, previous_end, cnpjs)
        previous_categorized = await categorize_products(previous_data)
        
        category_stats = []
        
        for category, products in categorized.items():
            if not products:
                continue
                
            df_current = pd.DataFrame(products)
            df_current['preco_produto'] = pd.to_numeric(df_current['preco_produto'], errors='coerce')
            df_current = df_current.dropna(subset=['preco_produto'])
            
            preco_medio_atual = df_current['preco_produto'].mean()
            
            # Calcular variação em relação ao período anterior
            previous_products = previous_categorized.get(category, [])
            if previous_products:
                df_previous = pd.DataFrame(previous_products)
                df_previous['preco_produto'] = pd.to_numeric(df_previous['preco_produto'], errors='coerce')
                df_previous = df_previous.dropna(subset=['preco_produto'])
                
                preco_medio_anterior = df_previous['preco_produto'].mean()
                if preco_medio_anterior > 0:
                    variacao = ((preco_medio_atual - preco_medio_anterior) / preco_medio_anterior) * 100
                else:
                    variacao = 0
            else:
                variacao = 0
            
            stats = CategoryStats(
                categoria=category,
                total_produtos=len(products),
                preco_medio=round(preco_medio_atual, 2),
                variacao_mensal=round(variacao, 2)
            )
            category_stats.append(stats)
        
        return sorted(category_stats, key=lambda x: x.total_produtos, reverse=True)
        
    except Exception as e:
        logging.error(f"Erro ao gerar estatísticas por categoria: {e}")
        raise HTTPException(status_code=500, detail="Erro ao gerar estatísticas por categoria")

@dashboard_router.get("/bargains", response_model=List[BargainProduct])
async def get_bargains(
    start_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    cnpjs: Optional[List[str]] = Query(None),
    category: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna as melhores ofertas (produtos com maior economia)"""
    try:
        data = await get_date_range_data(start_date, end_date, cnpjs)
        
        if not data:
            return []
        
        df = pd.DataFrame(data)
        df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
        df = df.dropna(subset=['preco_produto'])
        
        # Filtrar por categoria se especificada
        if category and category != 'Todos':
            categorized = await categorize_products(data)
            category_products = categorized.get(category, [])
            if category_products:
                df = pd.DataFrame(category_products)
                df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
                df = df.dropna(subset=['preco_produto'])
        
        # Agrupar por produto e encontrar preço médio
        product_avg = df.groupby('nome_produto_normalizado')['preco_produto'].mean().reset_index()
        product_avg.columns = ['nome_normalizado', 'preco_medio']
        
        # Encontrar o preço mais baixo para cada produto
        cheapest = df.loc[df.groupby('nome_produto_normalizado')['preco_produto'].idxmin()]
        
        # Calcular economia percentual
        bargains = []
        for _, cheap_row in cheapest.iterrows():
            avg_price_row = product_avg[product_avg['nome_normalizado'] == cheap_row['nome_produto_normalizado']]
            if not avg_price_row.empty:
                avg_price = avg_price_row.iloc[0]['preco_medio']
                if avg_price > 0:
                    economia = ((avg_price - cheap_row['preco_produto']) / avg_price) * 100
                    
                    if economia > 5:  # Mostrar apenas economias significativas
                        bargain = BargainProduct(
                            nome_produto=cheap_row['nome_produto'],
                            codigo_barras=cheap_row.get('codigo_barras'),
                            preco_produto=round(cheap_row['preco_produto'], 2),
                            nome_supermercado=cheap_row['nome_supermercado'],
                            tipo_unidade=cheap_row.get('tipo_unidade', 'UN'),
                            economia_percentual=round(economia, 2)
                        )
                        bargains.append(bargain)
        
        return sorted(bargains, key=lambda x: x.economia_percentual, reverse=True)[:limit]
        
    except Exception as e:
        logging.error(f"Erro ao buscar ofertas: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar melhores ofertas")

@dashboard_router.get("/market-comparison", response_model=List[MarketComparison])
async def get_market_comparison(
    start_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    cnpjs: Optional[List[str]] = Query(None),
    category: Optional[str] = Query(None),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna comparação detalhada entre mercados"""
    try:
        data = await get_date_range_data(start_date, end_date, cnpjs)
        
        if not data:
            return []
        
        df = pd.DataFrame(data)
        df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
        df = df.dropna(subset=['preco_produto'])
        
        # Filtrar por categoria se especificada
        if category and category != 'Todos':
            categorized = await categorize_products(data)
            category_products = categorized.get(category, [])
            if category_products:
                df = pd.DataFrame(category_products)
                df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
                df = df.dropna(subset=['preco_produto'])
        
        # Estatísticas gerais por mercado
        market_stats = df.groupby('nome_supermercado').agg({
            'id_registro': 'count',
            'preco_produto': ['mean', 'std']
        }).reset_index()
        
        market_stats.columns = ['nome_supermercado', 'total_produtos', 'preco_medio_geral', 'desvio_padrao']
        
        # Calcular rating baseado em preço médio e variedade
        max_products = market_stats['total_produtos'].max()
        min_price = market_stats['preco_medio_geral'].min()
        
        comparisons = []
        for _, row in market_stats.iterrows():
            # Score baseado em variedade (40%) e preço (60%)
            score_variedade = (row['total_produtos'] / max_products) * 40 if max_products > 0 else 0
            score_preco = (1 - (row['preco_medio_geral'] - min_price) / (min_price + 0.01)) * 60 if min_price > 0 else 0
            
            rating = min(score_variedade + score_preco, 100)
            
            comparison = MarketComparison(
                mercado=row['nome_supermercado'],
                total_produtos=row['total_produtos'],
                preco_medio_geral=round(row['preco_medio_geral'], 2),
                preco_medio_categoria=round(row['preco_medio_geral'], 2),  # Simplificado para esta versão
                rating_value=round(rating, 2)
            )
            comparisons.append(comparison)
        
        return sorted(comparisons, key=lambda x: x.rating_value, reverse=True)
        
    except Exception as e:
        logging.error(f"Erro ao comparar mercados: {e}")
        raise HTTPException(status_code=500, detail="Erro ao comparar mercados")

@dashboard_router.get("/recent-activity")
async def get_recent_activity(
    limit: int = Query(10, ge=1, le=50),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna atividade recente do sistema"""
    try:
        # Últimas coletas
        collections_response = await asyncio.to_thread(
            supabase.table('coletas').select('*')
            .order('iniciada_em', desc=True)
            .limit(limit)
            .execute
        )
        
        # Logs recentes
        logs_response = await asyncio.to_thread(
            supabase.table('log_de_usuarios').select('*')
            .order('created_at', desc=True)
            .limit(limit)
            .execute
        )
        
        recent_activity = {
            'ultimas_coletas': collections_response.data or [],
            'logs_recentes': logs_response.data or []
        }
        
        return recent_activity
        
    except Exception as e:
        logging.error(f"Erro ao buscar atividade recente: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar atividade recente")

# --------------------------------------------------------------------------
# --- ENDPOINTS DE RELATÓRIOS AVANÇADOS ---
# --------------------------------------------------------------------------

@dashboard_router.post("/custom-report")
async def generate_custom_report(
    request: TimeRangeRequest,
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Gera relatório personalizado com múltiplas métricas"""
    try:
        data = await get_date_range_data(request.start_date, request.end_date, request.cnpjs)
        
        if not data:
            return {"message": "Nenhum dado encontrado para o período especificado"}
        
        df = pd.DataFrame(data)
        df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
        df = df.dropna(subset=['preco_produto'])
        
        # Métricas principais
        total_produtos = len(df)
        total_mercados = df['nome_supermercado'].nunique()
        preco_medio_geral = df['preco_produto'].mean()
        
        # Análise por mercado
        market_analysis = df.groupby('nome_supermercado').agg({
            'id_registro': 'count',
            'preco_produto': ['mean', 'min', 'max']
        }).reset_index()
        
        market_analysis.columns = ['mercado', 'total_produtos', 'preco_medio', 'preco_minimo', 'preco_maximo']
        
        # Produtos mais caros e mais baratos
        produtos_mais_caros = df.nlargest(10, 'preco_produto')[['nome_produto', 'preco_produto', 'nome_supermercado']].to_dict('records')
        produtos_mais_baratos = df.nsmallest(10, 'preco_produto')[['nome_produto', 'preco_produto', 'nome_supermercado']].to_dict('records')
        
        # Distribuição de preços
        price_ranges = {
            'ate_10': len(df[df['preco_produto'] <= 10]),
            '10_a_50': len(df[(df['preco_produto'] > 10) & (df['preco_produto'] <= 50)]),
            '50_a_100': len(df[(df['preco_produto'] > 50) & (df['preco_produto'] <= 100)]),
            'acima_100': len(df[df['preco_produto'] > 100])
        }
        
        report = {
            'periodo': {
                'inicio': str(request.start_date),
                'fim': str(request.end_date)
            },
            'metricas_principais': {
                'total_produtos': total_produtos,
                'total_mercados': total_mercados,
                'preco_medio_geral': round(preco_medio_geral, 2),
                'produto_mais_caro': round(df['preco_produto'].max(), 2),
                'produto_mais_barato': round(df['preco_produto'].min(), 2)
            },
            'analise_mercados': market_analysis.to_dict('records'),
            'produtos_destaque': {
                'mais_caros': produtos_mais_caros,
                'mais_baratos': produtos_mais_baratos
            },
            'distribuicao_precos': price_ranges,
            'categorias': (await get_category_stats(request.start_date, request.end_date, request.cnpjs, user))
        }
        
        return report
        
    except Exception as e:
        logging.error(f"Erro ao gerar relatório personalizado: {e}")
        raise HTTPException(status_code=500, detail="Erro ao gerar relatório personalizado")

@dashboard_router.get("/export-data")
async def export_dashboard_data(
    start_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    cnpjs: Optional[List[str]] = Query(None),
    export_type: str = Query('csv', regex='^(csv|json)$'),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Exporta dados do dashboard em CSV ou JSON"""
    try:
        from fastapi.responses import Response
        import io
        import json
        
        data = await get_date_range_data(start_date, end_date, cnpjs)
        
        if not data:
            raise HTTPException(status_code=404, detail="Nenhum dado encontrado para exportação")
        
        if export_type == 'csv':
            df = pd.DataFrame(data)
            
            # Selecionar colunas relevantes
            columns_to_export = ['nome_produto', 'preco_produto', 'nome_supermercado', 'data_coleta', 'tipo_unidade', 'codigo_barras']
            df = df[columns_to_export]
            
            output = io.StringIO()
            df.to_csv(output, index=False)
            content = output.getvalue()
            output.close()
            
            return Response(
                content=content,
                media_type='text/csv',
                headers={'Content-Disposition': f'attachment; filename=dashboard_export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'}
            )
            
        else:  # JSON
            return {
                'periodo': {'start_date': str(start_date), 'end_date': str(end_date)},
                'total_registros': len(data),
                'dados': data
            }
            
    except Exception as e:
        logging.error(f"Erro ao exportar dados: {e}")
        raise HTTPException(status_code=500, detail="Erro ao exportar dados")
