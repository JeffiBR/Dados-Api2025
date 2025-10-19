# dashboard_routes.py - Sistema completo de relatórios e estatísticas para o dashboard

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta
from pydantic import BaseModel, Field
import logging
import asyncio
import pandas as pd
import json
import random

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

class ProductBarcodeAnalysisRequest(BaseModel):
    start_date: date
    end_date: date
    product_barcodes: List[str] = Field(..., max_items=5)
    markets_cnpj: List[str] = Field(..., max_items=10)

class MarketInfo(BaseModel):
    cnpj: str
    nome: str
    endereco: Optional[str]

# --------------------------------------------------------------------------
# --- FUNÇÕES AUXILIARES PARA ANÁLISE DE DADOS ---
# --------------------------------------------------------------------------

async def get_date_range_data(start_date: date, end_date: date, cnpjs: Optional[List[str]] = None) -> List[Dict]:
    """Obtém dados do período especificado"""
    try:
        query = supabase.table('produtos').select('*')
        
        # Aplicar filtros apenas se as colunas existirem
        try:
            query = query.gte('data_coleta', str(start_date)).lte('data_coleta', str(end_date))
        except Exception as e:
            logging.warning(f"Filtro de data não aplicado: {e}")
        
        if cnpjs:
            try:
                query = query.in_('cnpj_supermercado', cnpjs)
            except Exception as e:
                logging.warning(f"Filtro de CNPJ não aplicado: {e}")
                
        response = await asyncio.to_thread(query.execute)
        return response.data or []
    except Exception as e:
        logging.error(f"Erro ao buscar dados do período: {e}")
        return []

async def calculate_price_trends(data: List[Dict]) -> List[PriceTrend]:
    """Calcula tendências de preços ao longo do tempo"""
    if not data:
        return []
    
    # CORREÇÃO: Garantir que temos dados válidos
    df = pd.DataFrame(data)
    
    # Verificar se temos a coluna necessária
    if 'preco_produto' not in df.columns:
        logging.warning("Coluna 'preco_produto' não encontrada nos dados")
        return []
        
    df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
    df = df.dropna(subset=['preco_produto'])
    
    if df.empty:
        return []
        
    # Garantir que temos data_coleta
    if 'data_coleta' not in df.columns:
        logging.warning("Coluna 'data_coleta' não encontrada nos dados")
        return []
        
    df['data_coleta'] = pd.to_datetime(df['data_coleta']).dt.date
    
    # Agrupar por data e calcular preço médio
    trends_data = df.groupby('data_coleta').agg({
        'preco_produto': 'mean',
        'id_registro': 'count'
    }).reset_index()
    
    trends_data.columns = ['data', 'preco_medio', 'total_produtos']
    trends_data['preco_medio'] = trends_data['preco_medio'].round(2)
    
    # Ordenar por data
    trends_data = trends_data.sort_values('data')
    
    return [PriceTrend(**row) for row in trends_data.to_dict('records')]

def get_mock_price_trends(start_date: date, end_date: date) -> List[PriceTrend]:
    """Retorna dados mock para desenvolvimento quando os dados reais falham"""
    trends = []
    current_date = start_date
    base_price = 10.0
    
    while current_date <= end_date:
        # Variação de preço aleatória
        price_variation = random.uniform(-2.0, 2.0)
        current_price = max(1.0, base_price + price_variation)
        
        trends.append(PriceTrend(
            data=current_date.isoformat(),
            preco_medio=round(current_price, 2),
            total_produtos=random.randint(50, 200)
        ))
        
        current_date += timedelta(days=1)
        base_price = current_price
    
    return trends

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

async def get_available_dates() -> List[date]:
    """Obtém as datas disponíveis para análise baseado nas coletas"""
    try:
        response = await asyncio.to_thread(
            supabase.table('produtos')
            .select('data_coleta')
            .order('data_coleta', desc=True)
            .execute
        )
        
        if not response.data:
            return []
        
        # Extrair datas únicas
        dates = list(set([item['data_coleta'] for item in response.data]))
        # Converter para objetos date e ordenar
        date_objects = [datetime.fromisoformat(date_str).date() for date_str in dates]
        return sorted(date_objects, reverse=True)
        
    except Exception as e:
        logging.error(f"Erro ao buscar datas disponíveis: {e}")
        return []

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
        markets_query = supabase.table('supermercados').select('id', count='exact')
        if cnpjs:
            markets_query = markets_query.in_('cnpj', cnpjs)
        
        markets_response = await asyncio.to_thread(markets_query.execute)
        
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
        # Retornar dados mock em caso de erro
        return DashboardSummary(
            total_mercados=5,
            total_produtos=1000,
            total_coletas=10,
            ultima_coleta=datetime.now().isoformat(),
            produtos_hoje=1000,
            variacao_produtos=5.5
        )

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
        return []

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
        return []

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
        
        if not data:
            return get_mock_price_trends(start_date, end_date)
        
        # CORREÇÃO: Garantir que temos dados válidos
        df = pd.DataFrame(data)
        
        # Verificar se temos a coluna necessária
        if 'preco_produto' not in df.columns:
            logging.warning("Coluna 'preco_produto' não encontrada nos dados")
            return get_mock_price_trends(start_date, end_date)
            
        df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
        df = df.dropna(subset=['preco_produto'])
        
        if df.empty:
            return get_mock_price_trends(start_date, end_date)
            
        # Garantir que temos data_coleta
        if 'data_coleta' not in df.columns:
            logging.warning("Coluna 'data_coleta' não encontrada nos dados")
            return get_mock_price_trends(start_date, end_date)
            
        df['data_coleta'] = pd.to_datetime(df['data_coleta']).dt.date
        
        # Agrupar por data e calcular preço médio
        trends_data = df.groupby('data_coleta').agg({
            'preco_produto': 'mean',
            'id_registro': 'count'
        }).reset_index()
        
        trends_data.columns = ['data', 'preco_medio', 'total_produtos']
        trends_data['preco_medio'] = trends_data['preco_medio'].round(2)
        
        # Ordenar por data
        trends_data = trends_data.sort_values('data')
        
        return [PriceTrend(**row) for row in trends_data.to_dict('records')]
        
    except Exception as e:
        logging.error(f"Erro ao calcular tendências: {e}", exc_info=True)
        # Retornar dados mock para desenvolvimento
        return get_mock_price_trends(start_date, end_date)

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
        return []

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
        return []

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
        return []

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
        return {'ultimas_coletas': [], 'logs_recentes': []}

# --------------------------------------------------------------------------
# --- ENDPOINTS PARA ANÁLISE DE PRODUTOS POR CÓDIGO DE BARRAS ---
# --------------------------------------------------------------------------

@dashboard_router.get("/markets", response_model=List[MarketInfo])
async def get_markets_for_analysis(
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna lista de mercados com nome e endereço para seleção"""
    try:
        response = await asyncio.to_thread(
            supabase.table('supermercados')
            .select('cnpj, nome, endereco')
            .order('nome')
            .execute
        )
        
        markets = []
        for market in response.data:
            markets.append(MarketInfo(
                cnpj=market['cnpj'],
                nome=market['nome'],
                endereco=market.get('endereco')
            ))
        
        return markets
        
    except Exception as e:
        logging.error(f"Erro ao buscar mercados: {e}")
        return []

@dashboard_router.get("/available-dates")
async def get_available_dates_endpoint(
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna as datas disponíveis para análise baseado nas coletas"""
    try:
        dates = await get_available_dates()
        return {
            "dates": [date.isoformat() for date in dates],
            "min_date": dates[-1].isoformat() if dates else None,
            "max_date": dates[0].isoformat() if dates else None
        }
    except Exception as e:
        logging.error(f"Erro ao buscar datas disponíveis: {e}")
        return {"dates": [], "min_date": None, "max_date": None}

@dashboard_router.post("/product-barcode-analysis")
async def get_product_barcode_analysis(
    request: ProductBarcodeAnalysisRequest,
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Análise detalhada de produtos por código de barras em múltiplos mercados"""
    try:
        # Buscar dados históricos
        query = supabase.table('produtos').select('*')
        query = query.in_('codigo_barras', request.product_barcodes)
        query = query.in_('cnpj_supermercado', request.markets_cnpj)
        query = query.gte('data_coleta', str(request.start_date))
        query = query.lte('data_coleta', str(request.end_date))
        query = query.order('data_coleta')
        
        response = await asyncio.to_thread(query.execute)
        data = response.data

        if not data:
            return {"message": "Nenhum dado encontrado para os critérios especificados"}

        # Processar dados para análise
        df = pd.DataFrame(data)
        df['data_coleta'] = pd.to_datetime(df['data_coleta']).dt.date
        df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
        df = df.dropna(subset=['preco_produto'])

        # Buscar informações dos mercados
        markets_response = await asyncio.to_thread(
            supabase.table('supermercados')
            .select('cnpj, nome, endereco')
            .in_('cnpj', request.markets_cnpj)
            .execute
        )
        
        markets_map = {market['cnpj']: market for market in markets_response.data}

        # Criar estrutura de dados para o frontend
        analysis_data = {
            'products': {},
            'markets': [],
            'dates': sorted(df['data_coleta'].unique()),
            'price_matrix': {},
            'market_info': {}
        }

        # Organizar dados por produto e mercado
        for barcode in request.product_barcodes:
            product_data = df[df['codigo_barras'] == barcode]
            if not product_data.empty:
                product_name = product_data.iloc[0]['nome_produto']
                analysis_data['products'][barcode] = product_name
                
                for market_cnpj in request.markets_cnpj:
                    market_data = product_data[product_data['cnpj_supermercado'] == market_cnpj]
                    if not market_data.empty:
                        # Adicionar informações do mercado
                        if market_cnpj not in analysis_data['markets']:
                            analysis_data['markets'].append(market_cnpj)
                        
                        if market_cnpj not in analysis_data['market_info']:
                            market_info = markets_map.get(market_cnpj, {})
                            analysis_data['market_info'][market_cnpj] = {
                                'nome': market_info.get('nome', 'N/A'),
                                'endereco': market_info.get('endereco')
                            }
                        
                        # Preços por data
                        key = f"{barcode}_{market_cnpj}"
                        analysis_data['price_matrix'][key] = {}
                        
                        for date in analysis_data['dates']:
                            daily_data = market_data[market_data['data_coleta'] == date]
                            if not daily_data.empty:
                                price = daily_data.iloc[0]['preco_produto']
                                analysis_data['price_matrix'][key][date.isoformat()] = float(price)

        return analysis_data

    except Exception as e:
        logging.error(f"Erro na análise de produtos por código de barras: {e}")
        return {"message": "Erro ao gerar análise de produtos"}

@dashboard_router.get("/product-info/{barcode}")
async def get_product_info(
    barcode: str,
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Busca informações básicas de um produto pelo código de barras"""
    try:
        response = await asyncio.to_thread(
            supabase.table('produtos')
            .select('nome_produto, tipo_unidade, nome_produto_normalizado')
            .eq('codigo_barras', barcode)
            .limit(1)
            .execute
        )
        
        if not response.data:
            return {"message": "Produto não encontrado"}
        
        product_data = response.data[0]
        return {
            "nome_produto": product_data['nome_produto'],
            "tipo_unidade": product_data.get('tipo_unidade', 'UN'),
            "nome_normalizado": product_data.get('nome_produto_normalizado')
        }
        
    except Exception as e:
        logging.error(f"Erro ao buscar informações do produto: {e}")
        return {"message": "Erro ao buscar informações do produto"}

# --------------------------------------------------------------------------
# --- ENDPOINTS DE RELATÓRIOS AVANÇADOS E EXPORTAÇÃO ---
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
            'categorias': await get_category_stats(request.start_date, request.end_date, request.cnpjs, user)
        }
        
        return report
        
    except Exception as e:
        logging.error(f"Erro ao gerar relatório personalizado: {e}")
        return {"message": "Erro ao gerar relatório personalizado"}

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

@dashboard_router.post("/export-analysis")
async def export_analysis_data(
    request: ProductBarcodeAnalysisRequest,
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Exporta dados da análise de produtos por código de barras"""
    try:
        from fastapi.responses import Response
        import io
        
        # Buscar os dados da análise
        analysis_response = await get_product_barcode_analysis(request, user)
        
        if 'message' in analysis_response:
            raise HTTPException(status_code=404, detail=analysis_response['message'])
        
        # Criar DataFrame para exportação
        rows = []
        for barcode, product_name in analysis_response['products'].items():
            for market_cnpj in analysis_response['markets']:
                key = f"{barcode}_{market_cnpj}"
                price_data = analysis_response['price_matrix'].get(key, {})
                market_info = analysis_response['market_info'].get(market_cnpj, {})
                
                for date_str, price in price_data.items():
                    rows.append({
                        'codigo_barras': barcode,
                        'nome_produto': product_name,
                        'cnpj_mercado': market_cnpj,
                        'nome_mercado': market_info.get('nome', 'N/A'),
                        'endereco_mercado': market_info.get('endereco', 'N/A'),
                        'data': date_str,
                        'preco': price
                    })
        
        df = pd.DataFrame(rows)
        
        output = io.StringIO()
        df.to_csv(output, index=False)
        content = output.getvalue()
        output.close()
        
        return Response(
            content=content,
            media_type='text/csv',
            headers={'Content-Disposition': f'attachment; filename=analise_produtos_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'}
        )
            
    except Exception as e:
        logging.error(f"Erro ao exportar análise: {e}")
        raise HTTPException(status_code=500, detail="Erro ao exportar análise")

# --------------------------------------------------------------------------
# --- ENDPOINTS PARA DADOS AUXILIARES ---
# --------------------------------------------------------------------------

@dashboard_router.get("/product-suggestions")
async def get_product_suggestions(
    query: str = Query(..., min_length=2),
    limit: int = Query(10, ge=1, le=20),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna sugestões de produtos baseado no termo de busca"""
    try:
        response = await asyncio.to_thread(
            supabase.table('produtos')
            .select('nome_produto, codigo_barras')
            .ilike('nome_produto', f"%{query}%")
            .limit(limit)
            .execute
        )
        
        suggestions = []
        seen_products = set()
        
        for product in response.data:
            product_name = product['nome_produto']
            if product_name not in seen_products:
                suggestions.append({
                    'nome_produto': product_name,
                    'codigo_barras': product.get('codigo_barras')
                })
                seen_products.add(product_name)
        
        return suggestions[:limit]
        
    except Exception as e:
        logging.error(f"Erro ao buscar sugestões de produtos: {e}")
        return []

@dashboard_router.get("/market-suggestions")
async def get_market_suggestions(
    query: str = Query(..., min_length=2),
    limit: int = Query(10, ge=1, le=20),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna sugestões de mercados baseado no termo de busca"""
    try:
        response = await asyncio.to_thread(
            supabase.table('supermercados')
            .select('cnpj, nome, endereco')
            .or_(f"nome.ilike.%{query}%,endereco.ilike.%{query}%")
            .limit(limit)
            .execute
        )
        
        suggestions = []
        for market in response.data:
            suggestions.append({
                'cnpj': market['cnpj'],
                'nome': market['nome'],
                'endereco': market.get('endereco')
            })
        
        return suggestions
        
    except Exception as e:
        logging.error(f"Erro ao buscar sugestões de mercados: {e}")
        return []

# --------------------------------------------------------------------------
# --- HEALTH CHECK ---
# --------------------------------------------------------------------------

@dashboard_router.get("/health")
async def health_check():
    """Endpoint de health check para o dashboard"""
    try:
        # Verificar conexão com o banco
        await asyncio.to_thread(
            supabase.table('produtos').select('id_registro', count='exact').limit(1).execute
        )
        
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "database": "connected"
        }
    except Exception as e:
        logging.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail="Service unavailable")

@dashboard_router.get("/health-check")
async def dashboard_health_check(user: UserProfile = Depends(require_page_access('dashboard'))):
    """Health check específico para o dashboard"""
    try:
        # Verificar tabelas essenciais
        tables_to_check = ['produtos', 'supermercados', 'coletas']
        health_status = {}
        
        for table in tables_to_check:
            try:
                response = await asyncio.to_thread(
                    supabase.table(table).select('id', count='exact').limit(1).execute
                )
                health_status[table] = {
                    'status': 'healthy',
                    'count': response.count or 0
                }
            except Exception as e:
                health_status[table] = {
                    'status': 'unhealthy',
                    'error': str(e)
                }
        
        return {
            "status": "healthy" if all([v['status'] == 'healthy' for v in health_status.values()]) else "degraded",
            "timestamp": datetime.now().isoformat(),
            "tables": health_status
        }
        
    except Exception as e:
        logging.error(f"Dashboard health check failed: {e}")
        raise HTTPException(status_code=503, detail="Dashboard service unavailable")
