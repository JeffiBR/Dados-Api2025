# dashboard_routes.py - Sistema completo de relatórios e estatísticas para o dashboard
# VERSÃO PROFISSIONAL COM ANÁLISES AVANÇADAS

from fastapi import APIRouter, Depends, HTTPException, Query, Body, BackgroundTasks
from typing import List, Optional, Dict, Any, Tuple
from datetime import date, datetime, timedelta
from pydantic import BaseModel, Field
import logging
import asyncio
import pandas as pd
import numpy as np
import json
import random
from collections import defaultdict, Counter
import statistics
from scipy import stats
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler
import warnings
warnings.filterwarnings('ignore')

# Importar dependências compartilhadas
from dependencies import get_current_user, UserProfile, require_page_access, supabase, supabase_admin

# Configuração de Logs
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] %(message)s')

# Criar router específico para dashboard
dashboard_router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

# --------------------------------------------------------------------------
# --- MODELOS DE DADOS PARA DASHBOARD ---
# --------------------------------------------------------------------------

# No início de dashboard_routes.py, junto com os outros modelos (CollectionDataAggregated, MarketRankingItem, etc.)

class MarketSummary(BaseModel):
    mercado: str
    total_coletas: int
    ultima_coleta: Optional[str] = None # datetime isoformat

class CollectionDetail(BaseModel):
    id: int
    data_inicio: str
    data_fim: str
    status: str
    total_registros: int
    dias_pesquisa: int # Novo campo que calcula a duração

class EvolutionDataPoint(BaseModel):
    data: str # YYYY-MM-DD
    preco_medio: float
    total_produtos: int
    mercado: Optional[str] = None
    
class CollectionDataAggregated(BaseModel):
    data: str  # YYYY-MM-DD ou formato de agregação
    produtos: int
    preco_medio: float

class MarketRankingItem(BaseModel):
    nome_supermercado: str
    endereco_supermercado: Optional[str] = None
    total_produtos: int
    ultima_coleta: Optional[str] = None

class DashboardSummary(BaseModel):
    total_mercados: int
    total_produtos: int
    total_coletas: int
    ultima_coleta: Optional[str]
    produtos_hoje: int
    variacao_produtos: float = Field(..., description="Variação percentual de produtos em relação ao período anterior.")
    preco_medio_geral: float
    mercados_ativos_hoje: int
    coleta_status: str

class TopProduct(BaseModel):
    nome_produto: str
    frequencia: int
    preco_medio: float
    mercado_mais_barato: str
    preco_mais_barato: float
    variacao_semanal: float = Field(..., description="Variação percentual de preço em relação à semana anterior.")
    categoria: str

class PriceTrend(BaseModel):
    data: str
    preco_medio: float
    total_produtos: int
    preco_minimo: float
    preco_maximo: float
    volatilidade: float

class CategoryStats(BaseModel):
    categoria: str
    total_produtos: int
    preco_medio: float
    variacao_mensal: float
    participacao: float
    volatilidade: float

class BargainProduct(BaseModel):
    nome_produto: str
    codigo_barras: Optional[str]
    preco_produto: float
    nome_supermercado: str
    tipo_unidade: str
    economia_percentual: float
    economia_absoluta: float
    confianca: float

class MarketComparison(BaseModel):
    mercado: str
    total_produtos: int
    preco_medio_geral: float
    preco_medio_categoria: float
    rating_value: float
    score_variedade: float
    score_preco: float
    score_atualizacao: float

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
    analysis_type: str = Field("price", pattern="^(price|comparison|trend)$")

class MarketInfo(BaseModel):
    cnpj: str
    nome: str
    endereco: Optional[str]
    total_produtos: int
    ultima_coleta: Optional[str]

class AdvancedMetrics(BaseModel):
    inflacao_mensal: float
    volatilidade_geral: float
    indice_confianca: float
    produtos_em_alta: int
    produtos_em_baixa: int
    mercado_mais_competitivo: str
    categoria_mais_volatil: str

class PriceAlert(BaseModel):
    produto: str
    codigo_barras: str
    variacao: float
    tipo: str
    mercado: str
    preco_atual: float
    preco_anterior: float
    gravidade: str

class AnomalyItem(BaseModel):
    nome_produto: str
    mercado: str
    preco_atual: float
    preco_medio_historico: float
    desvio_padrao: float
    z_score: float
    data_coleta: str

# NOVOS MODELOS PARA ANÁLISE DE COLETAS
class MarketCollectionStats(BaseModel):
    market_name: str
    market_address: Optional[str]
    cnpj: str
    total_products: int
    collection_dates: List[str]
    daily_counts: List[int]
    average_daily: float
    last_collection: Optional[str]

class CollectionAnalysisRequest(BaseModel):
    start_date: date
    end_date: date
    market_cnpjs: List[str] = Field(..., max_items=10)
    group_by: str = Field("day", pattern="^(day|week|month)$")

class CollectionAnalysisResponse(BaseModel):
    market_stats: List[MarketCollectionStats]
    total_products: int
    total_collections: int
    date_range: Dict[str, str]
    summary: Dict[str, Any]

# --------------------------------------------------------------------------
# --- CONFIGURAÇÃO E CONSTANTES ---
# --------------------------------------------------------------------------

# Categorias para análise
PRODUCT_CATEGORIES = {
    'Alimentos Básicos': ['arroz', 'feijao', 'acucar', 'oleo', 'farinha', 'macarrao', 'sal', 'fuba'],
    'Carnes': ['carne', 'frango', 'peixe', 'bovina', 'suina', 'linguica', 'bacon', 'file', 'contra'],
    'Laticínios': ['leite', 'queijo', 'manteiga', 'iogurte', 'requeijao', 'coalhada', 'creme', 'ninho'],
    'Hortifruti': ['fruta', 'verdura', 'legume', 'alface', 'tomate', 'cebola', 'batata', 'cenoura', 'banana'],
    'Bebidas': ['refrigerante', 'suco', 'agua', 'cerveja', 'vinho', 'cafe', 'cha', 'energetico'],
    'Limpeza': ['sabao', 'detergente', 'desinfetante', 'alcool', 'agua sanitaria', 'amaciante', 'multiuso'],
    'Higiene': ['shampoo', 'sabonete', 'pasta dental', 'papel higienico', 'desodorante', 'condicionador'],
    'Padaria': ['pao', 'bolo', 'bisnaguinha', 'rosquinha', 'torrada', 'croissant', 'baguete'],
    'Enlatados': ['conserva', 'sardinha', 'milho', 'ervilha', 'seleta', 'atum', 'molho'],
    'Grãos': ['lentilha', 'grao', 'ervilha', 'milho', 'soja', 'trigo', 'aveia'],
    'Outros': []
}

# Configurações de análise
VOLATILITY_THRESHOLD = 0.15  # 15% de volatilidade
BARGAIN_THRESHOLD = 0.10     # 10% de economia mínima
PRICE_ALERT_THRESHOLD = 0.08 # 8% de variação para alerta

# --------------------------------------------------------------------------
# --- FUNÇÕES AUXILIARES PARA ANÁLISE DE DADOS AVANÇADA ---
# --------------------------------------------------------------------------

def _calculate_date_range(period: str, ref_date: date) -> Tuple[date, date]:
    """Calcula o start_date e end_date exatos com base no período e data de referência."""
    end_date = ref_date

    if period == 'daily':
        start_date = ref_date - timedelta(days=6)
    elif period == 'weekly':
        start_date = ref_date - timedelta(weeks=7)
    elif period == 'monthly':
        start_date = ref_date - timedelta(days=365)
    else:
        start_date = ref_date - timedelta(days=6)

    return start_date, end_date

def _fill_missing_dates(df: pd.DataFrame, start_date: date, end_date: date, period: str) -> pd.DataFrame:
    """Preenche datas ausentes no DataFrame com zeros para garantir a exibição correta no gráfico."""
    if period == 'daily':
        date_range = pd.date_range(start=start_date, end=end_date, freq='D')
        freq_str = '%Y-%m-%d'
    elif period == 'weekly':
        date_range = pd.date_range(start=start_date, end=end_date, freq='W-SUN')
        freq_str = '%Y-%m-%d'
    elif period == 'monthly':
        date_range = pd.date_range(start=start_date, end=end_date, freq='ME')
        freq_str = '%Y-%m-%d'
    else:
        return df

    full_range_df = pd.DataFrame(date_range, columns=['data_completa'])
    full_range_df['data'] = full_range_df['data_completa'].dt.strftime(freq_str)

    if 'data' not in df.columns:
        logging.error("Coluna 'data' não encontrada no DF de entrada para preenchimento de gaps.")
        return df

    merged_df = full_range_df[['data']].merge(df, on='data', how='left').fillna(0)
    merged_df['produtos'] = merged_df['produtos'].astype(int)
    merged_df['preco_medio'] = merged_df['preco_medio'].round(2)

    return merged_df

async def _fetch_data_for_period(start_date: date, end_date: date, period: str) -> List[Dict[str, Any]]:
    """Busca dados agregados usando a função RPC 'get_products_aggregated'."""
    try:
        data = await asyncio.to_thread(
            supabase_admin.rpc, 'get_products_aggregated', {
                'start_dt': start_date.isoformat(),
                'end_dt': end_date.isoformat(), 
                'aggregation_period': period
            }
        ).execute()
        return data.data if data.data else []
    except Exception as e:
        logging.error(f"Erro ao buscar dados agregados no Supabase: {e}")
        return []

async def _fetch_markets_ranking(ref_date: date) -> List[Dict[str, Any]]:
    """Busca ranking de mercados usando a função RPC 'get_markets_ranking'."""
    try:
        data = await asyncio.to_thread(
            supabase_admin.rpc, 'get_markets_ranking', {
                'reference_dt': ref_date.isoformat()
            }
        ).execute()
        return data.data if data.data else []
    except Exception as e:
        logging.error(f"Erro ao buscar ranking de mercados no Supabase: {e}")
        return []

async def get_date_range_data(start_date: date, end_date: date, cnpjs: Optional[List[str]] = None) -> List[Dict]:
    """Obtém dados do período especificado com cache inteligente"""
    try:
        cache_key = f"data_{start_date}_{end_date}_{hash(str(cnpjs))}"
        query = supabase.table('produtos').select('*')
        query = query.gte('data_coleta', str(start_date)).lte('data_coleta', str(end_date))

        if cnpjs and cnpjs != ['all']:
            query = query.in_('cnpj_supermercado', cnpjs)

        response = await asyncio.to_thread(query.execute)
        return response.data or []
    except Exception as e:
        logging.error(f"Erro ao buscar dados do período: {e}")
        return []

async def get_complete_market_data() -> List[Dict]:
    """Obtém dados completos de mercados"""
    try:
        response = await asyncio.to_thread(
            supabase.table('supermercados')
            .select('*')
            .execute
        )
        return response.data or []
    except Exception as e:
        logging.error(f"Erro ao buscar dados de mercados: {e}")
        return []

async def get_collection_data(start_date: date, end_date: date) -> List[Dict]:
    """Obtém dados de coletas no período"""
    try:
        response = await asyncio.to_thread(
            supabase.table('coletas')
            .select('*')
            .gte('iniciada_em', str(start_date))
            .lte('iniciada_em', str(end_date))
            .execute
        )
        return response.data or []
    except Exception as e:
        logging.error(f"Erro ao buscar dados de coletas: {e}")
        return []

def calculate_advanced_metrics(df: pd.DataFrame) -> Dict[str, Any]:
    """Calcula métricas avançadas usando estatística e machine learning"""
    if df.empty:
        return {}

    metrics = {}
    prices = df['preco_produto'].dropna()

    if len(prices) > 1:
        metrics['volatilidade'] = prices.std() / prices.mean()
        metrics['assimetria'] = stats.skew(prices)
        metrics['curtose'] = stats.kurtosis(prices)
    else:
        metrics['volatilidade'] = 0
        metrics['assimetria'] = 0
        metrics['curtose'] = 0

    # Detecção de outliers usando IQR
    Q1 = prices.quantile(0.25)
    Q3 = prices.quantile(0.75)
    IQR = Q3 - Q1
    lower_bound = Q1 - 1.5 * IQR
    upper_bound = Q3 + 1.5 * IQR

    outliers = prices[(prices < lower_bound) | (prices > upper_bound)]
    metrics['outliers_count'] = len(outliers)
    metrics['outliers_percent'] = (len(outliers) / len(prices)) * 100

    # Clusterização de preços (simplificada)
    if len(prices) > 10:
        try:
            price_values = prices.values.reshape(-1, 1)
            scaler = StandardScaler()
            prices_scaled = scaler.fit_transform(price_values)
            clustering = DBSCAN(eps=0.5, min_samples=5).fit(prices_scaled)
            metrics['price_clusters'] = len(set(clustering.labels_)) - (1 if -1 in clustering.labels_ else 0)
        except:
            metrics['price_clusters'] = 1

    return metrics

def detect_price_anomalies(df: pd.DataFrame) -> List[Dict]:
    """Detecta anomalias de preço usando métodos estatísticos"""
    anomalies = []

    if df.empty or 'preco_produto' not in df.columns:
        return anomalies

    # Agrupar por produto e mercado
    grouped = df.groupby(['nome_produto_normalizado', 'nome_supermercado'])

    for (produto, mercado), group in grouped:
        if len(group) < 5:  # Mínimo de pontos para análise
            continue

        prices = group['preco_produto'].dropna()
        if len(prices) < 2:
            continue

        # Z-score para detecção de outliers
        z_scores = np.abs(stats.zscore(prices))
        outlier_indices = np.where(z_scores > 2.5)[0]

        for idx in outlier_indices:
            if idx < len(group):
                row = group.iloc[idx]
                anomalies.append({
                    'produto': produto,
                    'mercado': mercado,
                    'preco': row['preco_produto'],
                    'data': row['data_coleta'],
                    'z_score': z_scores[idx],
                    'tipo': 'OUTLIER'
                })

    return anomalies

def calculate_price_elasticity(df: pd.DataFrame) -> Dict[str, float]:
    """Calcula elasticidade-preço aproximada por categoria"""
    elasticity = {}

    for categoria, produtos in PRODUCT_CATEGORIES.items():
        cat_products = df[df['nome_produto_normalizado'].str.contains('|'.join(produtos), case=False, na=False)]

        if len(cat_products) < 10:
            continue

        # Agrupar por data e calcular preço médio
        daily_prices = cat_products.groupby('data_coleta')['preco_produto'].mean()

        if len(daily_prices) > 5:
            price_changes = daily_prices.pct_change().dropna()
            if len(price_changes) > 0:
                elasticity[categoria] = price_changes.mean()

    return elasticity

async def categorize_products_advanced(products: List[Dict]) -> Dict[str, List[Dict]]:
    """Categorização avançada de produtos usando múltiplos critérios"""
    categorized = {category: [] for category in PRODUCT_CATEGORIES.keys()}
    categorized['Outros'] = []

    for product in products:
        product_name = product.get('nome_produto', '').lower()
        categorized_flag = False

        for category, keywords in PRODUCT_CATEGORIES.items():
            if any(keyword in product_name for keyword in keywords):
                categorized[category].append(product)
                categorized_flag = True
                break

        if not categorized_flag:
            if any(word in product_name for word in ['molho', 'ketchup', 'mostarda', 'maionese']):
                categorized['Enlatados'].append(product)
            elif any(word in product_name for word in ['biscoito', 'bolacha', 'salgado', 'snack']):
                categorized['Outros'].append(product)
            else:
                categorized['Outros'].append(product)

    return categorized

def calculate_trend_analysis(df: pd.DataFrame) -> Dict[str, Any]:
    """Análise de tendências usando regressão linear"""
    if df.empty or 'data_coleta' not in df.columns:
        return {}

    try:
        df['data_num'] = pd.to_datetime(df['data_coleta']).astype(int) // 10**9
        x = df['data_num'].values
        y = df['preco_produto'].values

        if len(x) > 1:
            slope, intercept, r_value, p_value, std_err = stats.linregress(x, y)
            return {
                'tendencia': slope,
                'forca_tendencia': r_value ** 2,
                'significancia': p_value,
                'direcao': 'ALTA' if slope > 0 else 'BAIXA',
                'confianca': 1 - p_value if p_value < 0.05 else 0
            }
    except Exception as e:
        logging.error(f"Erro na análise de tendência: {e}")

    return {}

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

        dates = list(set([item['data_coleta'] for item in response.data]))
        date_objects = [datetime.fromisoformat(date_str).date() for date_str in dates]
        return sorted(date_objects, reverse=True)

    except Exception as e:
        logging.error(f"Erro ao buscar datas disponíveis: {e}")
        return []

async def _fetch_summary_data() -> Dict[str, Any]:
    """Busca todos os dados de resumo em uma única função RPC ou consultas separadas."""
    try:
        mercados_res = await asyncio.to_thread(
            supabase.table('supermercados').select('id', count='exact').execute
        )
        total_mercados = mercados_res.count if mercados_res.count else 0

        summary_res = await asyncio.to_thread(
            supabase_admin.rpc, 'get_dashboard_summary', {}
        ).execute()

        if summary_res.data and len(summary_res.data) > 0:
            data = summary_res.data[0]
        else:
            data = {}

        status_res = await asyncio.to_thread(
            supabase.table('coletas_status').select('status').order('id', desc=True).limit(1).execute
        )
        coleta_status = status_res.data[0]['status'] if status_res.data else 'IDLE'

        variacao_produtos = data.get('variacao_produtos', 0.0)

        return {
            'total_mercados': total_mercados,
            'total_produtos': data.get('total_produtos', 0),
            'total_coletas': data.get('total_coletas', 0),
            'ultima_coleta': data.get('ultima_coleta'),
            'produtos_hoje': data.get('produtos_hoje', 0),
            'variacao_produtos': variacao_produtos,
            'preco_medio_geral': data.get('preco_medio_geral', 0.0),
            'mercados_ativos_hoje': data.get('mercados_ativos_hoje', 0),
            'coleta_status': coleta_status
        }

    except Exception as e:
        logging.error(f"Erro ao buscar dados de sumário: {e}")
        return {
            'total_mercados': 0, 'total_produtos': 0, 'total_coletas': 0, 
            'ultima_coleta': None, 'produtos_hoje': 0, 'variacao_produtos': 0.0, 
            'preco_medio_geral': 0.0, 'mercados_ativos_hoje': 0, 'coleta_status': 'ERROR'
        }

async def _fetch_top_products(limit: int) -> List[Dict[str, Any]]:
    """Busca produtos mais frequentes e suas métricas chave."""
    try:
        data = await asyncio.to_thread(
            supabase_admin.rpc, 'get_top_products', {'limit_input': limit}
        ).execute()
        return data.data if data.data else []
    except Exception as e:
        logging.error(f"Erro ao buscar top produtos: {e}")
        return []

async def _fetch_price_anomalies(threshold: float) -> List[Dict[str, Any]]:
    """Busca anomalias de preço (preços que estão muito distantes do preço médio histórico)."""
    try:
        data = await asyncio.to_thread(
            supabase_admin.rpc, 'get_price_anomalies', {'z_score_threshold': threshold}
        ).execute()
        return data.data if data.data else []
    except Exception as e:
        logging.error(f"Erro ao buscar anomalias de preço: {e}")
        return []

# --------------------------------------------------------------------------
# --- ENDPOINTS PRINCIPAIS DO DASHBOARD ---
# --------------------------------------------------------------------------

@dashboard_router.get("/collections/aggregated", response_model=List[CollectionDataAggregated])
async def get_collections_aggregated(
    period: str = Query(..., description="Período de agregação: 'daily', 'weekly', 'monthly'"),
    date: date = Query(date.today(), description="Data de referência (fim do período)"),
    user: UserProfile = Depends(require_page_access('collections'))
):
    """Retorna o total de produtos e preço médio agregado por período (dia, semana ou mês)"""

    if period not in ['daily', 'weekly', 'monthly']:
        raise HTTPException(status_code=400, detail="Período inválido. Use 'daily', 'weekly' ou 'monthly'.")

    start_date, end_date = _calculate_date_range(period, date)
    raw_data = await _fetch_data_for_period(start_date, end_date, period)

    if not raw_data:
        return []

    df = pd.DataFrame(raw_data)
    df = df.rename(columns={
        'aggregation_date': 'data', 
        'total_products': 'produtos', 
        'average_price': 'preco_medio'
    })

    if 'data' in df.columns:
        df['data'] = df['data'].astype(str)
    else:
        logging.error("Coluna 'data' não encontrada.")
        return [CollectionDataAggregated(**item) for item in raw_data if 'produtos' in item]

    filled_df = _fill_missing_dates(df, start_date, end_date, period)
    result_list = filled_df.to_dict('records')
    final_list = [item for item in result_list if item.get('data')]

    return [CollectionDataAggregated(**item) for item in final_list]

@dashboard_router.get("/markets/ranking", response_model=List[MarketRankingItem])
async def get_markets_ranking(
    date: date = Query(date.today(), description="Data de referência para o ranking"),
    user: UserProfile = Depends(require_page_access('collections'))
):
    """Retorna o ranking dos mercados com base no total de produtos coletados até a data de referência."""

    raw_data = await _fetch_markets_ranking(date)

    if not raw_data:
        return []

    ranking_list = []
    for item in raw_data:
        ranking_list.append(MarketRankingItem(
            nome_supermercado=item.get('nome_supermercado', 'Desconhecido'),
            endereco_supermercado=item.get('endereco_supermercado'),
            total_produtos=item.get('total_produtos', 0),
            ultima_coleta=item.get('ultima_coleta')
        ))

    return ranking_list

@dashboard_router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna um resumo de métricas chave do dashboard."""
    summary_data = await _fetch_summary_data()
    return DashboardSummary(**summary_data)

@dashboard_router.get("/products/top", response_model=List[TopProduct])
async def get_top_products(
    limit: int = Query(10, gt=0, le=50),
    user: UserProfile = Depends(require_page_access('products'))
):
    """Retorna os produtos mais frequentes, com preço médio e variações."""
    raw_data = await _fetch_top_products(limit)

    top_products_list = []
    for item in raw_data:
        top_products_list.append(TopProduct(
            nome_produto=item.get('nome_produto', 'Desconhecido'),
            frequencia=item.get('frequencia', 0),
            preco_medio=item.get('preco_medio', 0.0),
            mercado_mais_barato=item.get('mercado_mais_barato', 'N/A'),
            preco_mais_barato=item.get('preco_mais_barato', 0.0),
            variacao_semanal=item.get('variacao_semanal', 0.0),
            categoria=item.get('categoria', 'Outros')
        ))

    return top_products_list

@dashboard_router.get("/prices/anomalies", response_model=List[AnomalyItem])
async def get_price_anomalies(
    z_score_threshold: float = Query(2.5, description="Limiar Z-Score para detecção de anomalia"),
    user: UserProfile = Depends(require_page_access('prices'))
):
    """Retorna produtos com preços atípicos (anomalias)."""
    raw_data = await _fetch_price_anomalies(z_score_threshold)

    anomaly_list = []
    for item in raw_data:
        anomaly_list.append(AnomalyItem(
            nome_produto=item.get('nome_produto', 'Desconhecido'),
            mercado=item.get('mercado', 'N/A'),
            preco_atual=item.get('preco_atual', 0.0),
            preco_medio_historico=item.get('preco_medio_historico', 0.0),
            desvio_padrao=item.get('desvio_padrao', 0.0),
            z_score=item.get('z_score', 0.0),
            data_coleta=item.get('data_coleta', datetime.now().isoformat())
        ))

    return anomaly_list

# --------------------------------------------------------------------------
# --- ENDPOINTS ORIGINAIS DO DASHBOARD ---
# --------------------------------------------------------------------------

@dashboard_router.get("/products-by-market")
async def get_products_by_market(
    start_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    cnpjs: Optional[List[str]] = Query(None),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna a contagem de produtos por mercado no período"""
    try:
        data = await get_date_range_data(start_date, end_date, cnpjs)

        if not data:
            return []

        df = pd.DataFrame(data)
        market_products = df.groupby('nome_supermercado').agg({
            'codigo_barras': 'nunique',
            'preco_produto': 'mean'
        }).reset_index()

        market_products.columns = ['nome_supermercado', 'total_produtos', 'preco_medio']
        market_products = market_products.sort_values('total_produtos', ascending=False)

        return market_products.to_dict('records')

    except Exception as e:
        logging.error(f"Erro ao calcular produtos por mercado: {e}")
        return []

@dashboard_router.get("/recent-collections")
async def get_recent_collections(
    limit: int = Query(10, ge=1, le=50),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna as coletas mais recentes"""
    try:
        response = await asyncio.to_thread(
            supabase.table('coletas')
            .select('*')
            .order('iniciada_em', desc=True)
            .limit(limit)
            .execute
        )

        collections = response.data if response.data else []

        for collection in collections:
            if collection.get('mercados_selecionados'):
                markets_response = await asyncio.to_thread(
                    supabase.table('supermercados')
                    .select('nome')
                    .in_('cnpj', collection['mercados_selecionados'])
                    .execute
                )
                market_names = [market['nome'] for market in markets_response.data] if markets_response.data else []
                collection['nomes_mercados'] = market_names

        return {
            "ultimas_coletas": collections,
            "total": len(collections)
        }

    except Exception as e:
        logging.error(f"Erro ao buscar coletas recentes: {e}")
        return {"ultimas_coletas": [], "total": 0}

@dashboard_router.get("/market-stats")
async def get_market_stats(
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna estatísticas gerais dos mercados"""
    try:
        markets_response = await asyncio.to_thread(
            supabase.table('supermercados')
            .select('cnpj', count='exact')
            .execute
        )

        thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        products_response = await asyncio.to_thread(
            supabase.table('produtos')
            .select('codigo_barras', count='exact')
            .gte('data_coleta', thirty_days_ago)
            .execute
        )

        collections_response = await asyncio.to_thread(
            supabase.table('coletas')
            .select('id', count='exact')
            .execute
        )

        last_collection_response = await asyncio.to_thread(
            supabase.table('coletas')
            .select('iniciada_em')
            .order('iniciada_em', desc=True)
            .limit(1)
            .execute
        )

        return {
            "total_mercados": markets_response.count or 0,
            "total_produtos": products_response.count or 0,
            "total_coletas": collections_response.count or 0,
            "ultima_coleta": last_collection_response.data[0]['iniciada_em'] if last_collection_response.data else None
        }

    except Exception as e:
        logging.error(f"Erro ao buscar estatísticas: {e}")
        return {
            "total_mercados": 0,
            "total_produtos": 0,
            "total_coletas": 0,
            "ultima_coleta": None
        }

@dashboard_router.get("/price-trends", response_model=List[PriceTrend])
async def get_price_trends(
    start_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    cnpjs: Optional[List[str]] = Query(None),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna tendência de preços ao longo do tempo com análise avançada"""
    try:
        data = await get_date_range_data(start_date, end_date, cnpjs)

        if not data:
            return []

        df = pd.DataFrame(data)
        df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
        df = df.dropna(subset=['preco_produto'])

        if 'data_coleta' not in df.columns:
            return []

        df['data_coleta'] = pd.to_datetime(df['data_coleta']).dt.date

        trends_data = df.groupby('data_coleta').agg({
            'preco_produto': ['mean', 'min', 'max', 'std', 'count']
        }).reset_index()

        trends_data.columns = ['data', 'preco_medio', 'preco_minimo', 'preco_maximo', 'desvio_padrao', 'total_produtos']
        trends_data['volatilidade'] = (trends_data['desvio_padrao'] / trends_data['preco_medio']).fillna(0)
        trends_data = trends_data.sort_values('data')

        return [PriceTrend(**{
            'data': row['data'].isoformat(),
            'preco_medio': round(row['preco_medio'], 2),
            'total_produtos': int(row['total_produtos']),
            'preco_minimo': round(row['preco_minimo'], 2),
            'preco_maximo': round(row['preco_maximo'], 2),
            'volatilidade': round(row['volatilidade'], 4)
        }) for _, row in trends_data.iterrows()]

    except Exception as e:
        logging.error(f"Erro ao calcular tendências: {e}", exc_info=True)
        return []

@dashboard_router.get("/advanced-metrics", response_model=AdvancedMetrics)
async def get_advanced_metrics(
    start_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    cnpjs: Optional[List[str]] = Query(None),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna métricas avançadas do dashboard"""
    try:
        data = await get_date_range_data(start_date, end_date, cnpjs)

        if not data:
            return AdvancedMetrics(
                inflacao_mensal=0,
                volatilidade_geral=0,
                indice_confianca=0,
                produtos_em_alta=0,
                produtos_em_baixa=0,
                mercado_mais_competitivo="N/A",
                categoria_mais_volatil="N/A"
            )

        df = pd.DataFrame(data)
        df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
        df = df.dropna(subset=['preco_produto'])

        days_diff = (end_date - start_date).days
        previous_start = start_date - timedelta(days=days_diff + 1)
        previous_end = start_date - timedelta(days=1)
        previous_data = await get_date_range_data(previous_start, previous_end, cnpjs)

        current_avg = df['preco_produto'].mean()
        previous_avg = 0
        if previous_data:
            prev_df = pd.DataFrame(previous_data)
            prev_df['preco_produto'] = pd.to_numeric(prev_df['preco_produto'], errors='coerce')
            prev_df = prev_df.dropna(subset=['preco_produto'])
            previous_avg = prev_df['preco_produto'].mean()

        inflacao_mensal = ((current_avg - previous_avg) / previous_avg * 100) if previous_avg > 0 else 0
        volatilidade_geral = df['preco_produto'].std() / df['preco_produto'].mean()

        price_variations = []
        for product in df['nome_produto_normalizado'].unique():
            product_prices = df[df['nome_produto_normalizado'] == product]['preco_produto']
            if len(product_prices) > 1:
                variation = product_prices.std() / product_prices.mean()
                price_variations.append(variation)

        indice_confianca = 1 - (np.mean(price_variations) if price_variations else 0)

        produtos_em_alta = 0
        produtos_em_baixa = 0

        market_stats = df.groupby('nome_supermercado').agg({
            'preco_produto': 'mean',
            'id_registro': 'count'
        })
        if not market_stats.empty:
            mercado_mais_competitivo = market_stats['preco_produto'].idxmin()
        else:
            mercado_mais_competitivo = "N/A"

        categorized = await categorize_products_advanced(data)
        categoria_volatilidade = {}
        for category, products in categorized.items():
            if products:
                cat_df = pd.DataFrame(products)
                cat_df['preco_produto'] = pd.to_numeric(cat_df['preco_produto'], errors='coerce')
                cat_df = cat_df.dropna(subset=['preco_produto'])
                if not cat_df.empty:
                    volatilidade = cat_df['preco_produto'].std() / cat_df['preco_produto'].mean()
                    categoria_volatilidade[category] = volatilidade

        categoria_mais_volatil = max(categoria_volatilidade.items(), key=lambda x: x[1])[0] if categoria_volatilidade else "N/A"

        return AdvancedMetrics(
            inflacao_mensal=round(inflacao_mensal, 2),
            volatilidade_geral=round(volatilidade_geral, 4),
            indice_confianca=round(indice_confianca, 4),
            produtos_em_alta=produtos_em_alta,
            produtos_em_baixa=produtos_em_baixa,
            mercado_mais_competitivo=mercado_mais_competitivo,
            categoria_mais_volatil=categoria_mais_volatil
        )

    except Exception as e:
        logging.error(f"Erro ao calcular métricas avançadas: {e}")
        return AdvancedMetrics(
            inflacao_mensal=0,
            volatilidade_geral=0,
            indice_confianca=0,
            produtos_em_alta=0,
            produtos_em_baixa=0,
            mercado_mais_competitivo="N/A",
            categoria_mais_volatil="N/A"
        )

@dashboard_router.get("/price-alerts")
async def get_price_alerts(
    start_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    cnpjs: Optional[List[str]] = Query(None),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna alertas de preços baseados em variações significativas"""
    try:
        data = await get_date_range_data(start_date, end_date, cnpjs)

        if not data:
            return []

        df = pd.DataFrame(data)
        df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
        df = df.dropna(subset=['preco_produto'])

        days_diff = (end_date - start_date).days
        previous_start = start_date - timedelta(days=days_diff + 1)
        previous_end = start_date - timedelta(days=1)
        previous_data = await get_date_range_data(previous_start, previous_end, cnpjs)

        alerts = []

        if previous_data:
            prev_df = pd.DataFrame(previous_data)
            prev_df['preco_produto'] = pd.to_numeric(prev_df['preco_produto'], errors='coerce')
            prev_df = prev_df.dropna(subset=['preco_produto'])

            current_prices = df.groupby('nome_produto_normalizado')['preco_produto'].mean()
            previous_prices = prev_df.groupby('nome_produto_normalizado')['preco_produto'].mean()

            for product in current_prices.index:
                if product in previous_prices.index:
                    current_price = current_prices[product]
                    previous_price = previous_prices[product]

                    if previous_price > 0:
                        variation = ((current_price - previous_price) / previous_price) * 100

                        if abs(variation) >= PRICE_ALERT_THRESHOLD * 100:
                            current_market = df[df['nome_produto_normalizado'] == product]['nome_supermercado'].mode()
                            market = current_market[0] if len(current_market) > 0 else "N/A"

                            alert = PriceAlert(
                                produto=product,
                                codigo_barras=df[df['nome_produto_normalizado'] == product]['codigo_barras'].iloc[0] if 'codigo_barras' in df.columns else "",
                                variacao=round(variation, 2),
                                tipo="ALTA" if variation > 0 else "BAIXA",
                                mercado=market,
                                preco_atual=round(current_price, 2),
                                preco_anterior=round(previous_price, 2),
                                gravidade="ALTA" if abs(variation) > 15 else "MEDIA"
                            )
                            alerts.append(alert)

        return sorted(alerts, key=lambda x: abs(x.variacao), reverse=True)[:20]

    except Exception as e:
        logging.error(f"Erro ao gerar alertas de preço: {e}")
        return []

# --------------------------------------------------------------------------
# --- ENDPOINTS PARA ANÁLISE DE PRODUTOS POR CÓDIGO DE BARRAS ---
# --------------------------------------------------------------------------

@dashboard_router.get("/markets", response_model=List[MarketInfo])
async def get_markets_for_analysis(
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna lista de mercados com estatísticas para seleção"""
    try:
        markets_response = await asyncio.to_thread(
            supabase.table('supermercados')
            .select('cnpj, nome, endereco')
            .order('nome')
            .execute
        )

        products_response = await asyncio.to_thread(
            supabase.table('produtos')
            .select('cnpj_supermercado, data_coleta')
            .execute
        )

        products_data = products_response.data if products_response.data else []
        market_stats = {}
        for product in products_data:
            cnpj = product.get('cnpj_supermercado')
            if cnpj not in market_stats:
                market_stats[cnpj] = {'count': 0, 'dates': set()}
            market_stats[cnpj]['count'] += 1
            market_stats[cnpj]['dates'].add(product.get('data_coleta'))

        markets = []
        for market in markets_response.data:
            stats = market_stats.get(market['cnpj'], {'count': 0, 'dates': set()})
            ultima_coleta = max(stats['dates']) if stats['dates'] else None

            markets.append(MarketInfo(
                cnpj=market['cnpj'],
                nome=market['nome'],
                endereco=market.get('endereco'),
                total_produtos=stats['count'],
                ultima_coleta=ultima_coleta
            ))

        return markets

    except Exception as e:
        logging.error(f"Erro ao buscar mercados: {e}")
        return []

@dashboard_router.post("/barcode-analysis")
async def get_barcode_analysis(
    request: ProductBarcodeAnalysisRequest,
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Análise simplificada de produtos por código de barras para dashboard"""
    try:
        query = supabase.table('produtos').select('*')
        query = query.in_('codigo_barras', request.product_barcodes)
        query = query.in_('cnpj_supermercado', request.markets_cnpj)
        query = query.gte('data_coleta', str(request.start_date))
        query = query.lte('data_coleta', str(request.end_date))
        query = query.order('data_coleta')

        response = await asyncio.to_thread(query.execute)
        data = response.data

        if not data:
            return {
                "message": "Nenhum dado encontrado para os critérios especificados",
                "results": []
            }

        results = []
        for item in data:
            results.append({
                'codigo_barras': item.get('codigo_barras'),
                'nome_produto': item.get('nome_produto'),
                'cnpj_supermercado': item.get('cnpj_supermercado'),
                'nome_supermercado': item.get('nome_supermercado'),
                'preco_produto': float(item.get('preco_produto', 0)),
                'tipo_unidade': item.get('tipo_unidade', 'UN'),
                'data_coleta': item.get('data_coleta')
            })

        return {
            "message": "Análise concluída com sucesso",
            "results": results,
            "total_records": len(results),
            "products_found": len(set(r['codigo_barras'] for r in results)),
            "markets_found": len(set(r['cnpj_supermercado'] for r in results)),
            "date_range": {
                "start": str(request.start_date),
                "end": str(request.end_date)
            }
        }

    except Exception as e:
        logging.error(f"Erro na análise de códigos de barras: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao processar análise: {str(e)}")

@dashboard_router.post("/advanced-product-analysis")
async def get_advanced_product_analysis(
    request: ProductBarcodeAnalysisRequest,
    background_tasks: BackgroundTasks,
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Análise avançada de produtos por código de barras com múltiplas métricas"""
    try:
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

        df = pd.DataFrame(data)
        df['data_coleta'] = pd.to_datetime(df['data_coleta']).dt.date
        df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
        df = df.dropna(subset=['preco_produto'])

        markets_response = await asyncio.to_thread(
            supabase.table('supermercados')
            .select('cnpj, nome, endereco')
            .in_('cnpj', request.markets_cnpj)
            .execute
        )

        markets_map = {market['cnpj']: market for market in markets_response.data}

        analysis_data = {
            'products': {},
            'markets': [],
            'dates': sorted(df['data_coleta'].unique()),
            'price_matrix': {},
            'market_info': {},
            'advanced_metrics': {},
            'trend_analysis': {},
            'statistical_insights': {}
        }

        for barcode in request.product_barcodes:
            product_data = df[df['codigo_barras'] == barcode]
            if not product_data.empty:
                product_name = product_data.iloc[0]['nome_produto']
                analysis_data['products'][barcode] = {
                    'nome': product_name,
                    'unidade': product_data.iloc[0].get('tipo_unidade', 'UN')
                }

                product_metrics = calculate_advanced_metrics(product_data)
                analysis_data['advanced_metrics'][barcode] = product_metrics

                trend_analysis = calculate_trend_analysis(product_data)
                analysis_data['trend_analysis'][barcode] = trend_analysis

                for market_cnpj in request.markets_cnpj:
                    market_data = product_data[product_data['cnpj_supermercado'] == market_cnpj]
                    if not market_data.empty:
                        if market_cnpj not in analysis_data['markets']:
                            analysis_data['markets'].append(market_cnpj)

                        if market_cnpj not in analysis_data['market_info']:
                            market_info = markets_map.get(market_cnpj, {})
                            analysis_data['market_info'][market_cnpj] = {
                                'nome': market_info.get('nome', 'N/A'),
                                'endereco': market_info.get('endereco')
                            }

                        key = f"{barcode}_{market_cnpj}"
                        analysis_data['price_matrix'][key] = {}

                        for date in analysis_data['dates']:
                            daily_data = market_data[market_data['data_coleta'] == date]
                            if not daily_data.empty:
                                price = daily_data.iloc[0]['preco_produto']
                                analysis_data['price_matrix'][key][date.isoformat()] = {
                                    'preco': float(price),
                                    'disponivel': True
                                }
                            else:
                                analysis_data['price_matrix'][key][date.isoformat()] = {
                                    'preco': None,
                                    'disponivel': False
                                }

        analysis_data['statistical_insights'] = {
            'total_observations': len(df),
            'date_range': f"{request.start_date} a {request.end_date}",
            'products_analyzed': len(request.product_barcodes),
            'markets_analyzed': len(request.markets_cnpj),
            'price_variation_coefficient': df['preco_produto'].std() / df['preco_produto'].mean() if len(df) > 0 else 0
        }

        anomalies = detect_price_anomalies(df)
        analysis_data['price_anomalies'] = anomalies[:10]

        return analysis_data

    except Exception as e:
        logging.error(f"Erro na análise avançada de produtos: {e}")
        return {"message": "Erro ao gerar análise avançada de produtos"}

# --------------------------------------------------------------------------
# --- ENDPOINTS DE RELATÓRIOS AVANÇADOS E EXPORTAÇÃO ---
# --------------------------------------------------------------------------

@dashboard_router.post("/comprehensive-report")
async def generate_comprehensive_report(
    request: TimeRangeRequest,
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Gera relatório abrangente com todas as métricas"""
    try:
        data = await get_date_range_data(request.start_date, request.end_date, request.cnpjs)

        if not data:
            return {"message": "Nenhum dado encontrado para o período especificado"}

        df = pd.DataFrame(data)
        df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
        df = df.dropna(subset=['preco_produto'])

        total_produtos = len(df)
        total_mercados = df['nome_supermercado'].nunique()
        preco_medio_geral = df['preco_produto'].mean()

        market_analysis = df.groupby('nome_supermercado').agg({
            'id_registro': 'count',
            'preco_produto': ['mean', 'min', 'max', 'std']
        }).reset_index()

        market_analysis.columns = ['mercado', 'total_produtos', 'preco_medio', 'preco_minimo', 'preco_maximo', 'desvio_padrao']
        market_analysis['volatilidade'] = (market_analysis['desvio_padrao'] / market_analysis['preco_medio']).round(4)

        produtos_mais_caros = df.nlargest(10, 'preco_produto')[['nome_produto', 'preco_produto', 'nome_supermercado']].to_dict('records')
        produtos_mais_baratos = df.nsmallest(10, 'preco_produto')[['nome_produto', 'preco_produto', 'nome_supermercado']].to_dict('records')

        price_ranges = {
            'ate_5': len(df[df['preco_produto'] <= 5]),
            '5_a_10': len(df[(df['preco_produto'] > 5) & (df['preco_produto'] <= 10)]),
            '10_a_20': len(df[(df['preco_produto'] > 10) & (df['preco_produto'] <= 20)]),
            '20_a_50': len(df[(df['preco_produto'] > 20) & (df['preco_produto'] <= 50)]),
            '50_a_100': len(df[(df['preco_produto'] > 50) & (df['preco_produto'] <= 100)]),
            'acima_100': len(df[df['preco_produto'] > 100])
        }

        categorized = await categorize_products_advanced(data)
        category_analysis = []
        for category, products in categorized.items():
            if products:
                cat_df = pd.DataFrame(products)
                cat_df['preco_produto'] = pd.to_numeric(cat_df['preco_produto'], errors='coerce')
                cat_df = cat_df.dropna(subset=['preco_produto'])

                category_analysis.append({
                    'categoria': category,
                    'total_produtos': len(products),
                    'preco_medio': round(cat_df['preco_produto'].mean(), 2),
                    'preco_minimo': round(cat_df['preco_produto'].min(), 2),
                    'preco_maximo': round(cat_df['preco_produto'].max(), 2),
                    'volatilidade': round(cat_df['preco_produto'].std() / cat_df['preco_produto'].mean(), 4)
                })

        advanced_metrics = calculate_advanced_metrics(df)

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
                'produto_mais_barato': round(df['preco_produto'].min(), 2),
                'volatilidade_geral': round(df['preco_produto'].std() / df['preco_produto'].mean(), 4)
            },
            'analise_mercados': market_analysis.to_dict('records'),
            'produtos_destaque': {
                'mais_caros': produtos_mais_caros,
                'mais_baratos': produtos_mais_baratos
            },
            'distribuicao_precos': price_ranges,
            'analise_categorias': category_analysis,
            'metricas_avancadas': advanced_metrics,
            'timestamp_geracao': datetime.now().isoformat()
        }

        return report

    except Exception as e:
        logging.error(f"Erro ao gerar relatório abrangente: {e}")
        return {"message": "Erro ao gerar relatório abrangente"}

@dashboard_router.get("/export-advanced-data")
async def export_advanced_dashboard_data(
    start_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    cnpjs: Optional[List[str]] = Query(None),
    export_type: str = Query('csv', regex='^(csv|json|xlsx)$'),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Exporta dados do dashboard em formatos avançados"""
    try:
        from fastapi.responses import Response
        import io

        data = await get_date_range_data(start_date, end_date, cnpjs)

        if not data:
            raise HTTPException(status_code=404, detail="Nenhum dado encontrado para exportação")

        if export_type == 'csv':
            df = pd.DataFrame(data)
            columns_to_export = ['nome_produto', 'preco_produto', 'nome_supermercado', 'data_coleta', 'tipo_unidade', 'codigo_barras', 'nome_produto_normalizado']
            df = df[[col for col in columns_to_export if col in df.columns]]

            output = io.StringIO()
            df.to_csv(output, index=False)
            content = output.getvalue()
            output.close()

            return Response(
                content=content,
                media_type='text/csv',
                headers={'Content-Disposition': f'attachment; filename=dashboard_advanced_export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'}
            )

        elif export_type == 'xlsx':
            df = pd.DataFrame(data)
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                df.to_excel(writer, sheet_name='Dados Completos', index=False)

                summary_data = {
                    'Metrica': ['Total de Produtos', 'Total de Mercados', 'Preço Médio', 'Data Início', 'Data Fim'],
                    'Valor': [
                        len(df),
                        df['nome_supermercado'].nunique(),
                        round(df['preco_produto'].mean(), 2),
                        start_date.isoformat(),
                        end_date.isoformat()
                    ]
                }
                pd.DataFrame(summary_data).to_excel(writer, sheet_name='Resumo', index=False)

                market_analysis = df.groupby('nome_supermercado').agg({
                    'preco_produto': ['count', 'mean', 'min', 'max']
                }).round(2)
                market_analysis.columns = ['Total Produtos', 'Preço Médio', 'Preço Mínimo', 'Preço Máximo']
                market_analysis.reset_index().to_excel(writer, sheet_name='Análise por Mercado', index=False)

            content = output.getvalue()
            output.close()

            return Response(
                content=content,
                media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                headers={'Content-Disposition': f'attachment; filename=dashboard_advanced_export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'}
            )

        else:  # JSON
            return {
                'periodo': {'start_date': str(start_date), 'end_date': str(end_date)},
                'total_registros': len(data),
                'metricas': {
                    'preco_medio': round(pd.DataFrame(data)['preco_produto'].mean(), 2),
                    'total_mercados': len(set(item.get('nome_supermercado', '') for item in data)),
                    'periodo_dias': (end_date - start_date).days
                },
                'dados': data
            }

    except Exception as e:
        logging.error(f"Erro ao exportar dados avançados: {e}")
        raise HTTPException(status_code=500, detail="Erro ao exportar dados")

# --------------------------------------------------------------------------
# --- ENDPOINTS PARA DADOS AUXILIARES AVANÇADOS ---
# --------------------------------------------------------------------------

@dashboard_router.get("/product-intelligence")
async def get_product_intelligence(
    barcode: str = Query(..., description="Código de barras do produto"),
    days: int = Query(30, description="Número de dias para análise"),
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna inteligência avançada sobre um produto específico"""
    try:
        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        query = supabase.table('produtos').select('*')
        query = query.eq('codigo_barras', barcode)
        query = query.gte('data_coleta', str(start_date))
        query = query.lte('data_coleta', str(end_date))
        query = query.order('data_coleta')

        response = await asyncio.to_thread(query.execute)
        data = response.data

        if not data:
            return {"message": "Nenhum dado encontrado para o produto especificado"}

        df = pd.DataFrame(data)
        df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
        df = df.dropna(subset=['preco_produto'])
        df['data_coleta'] = pd.to_datetime(df['data_coleta']).dt.date

        if df.empty:
            return {"message": "Dados insuficientes para análise"}

        product_info = {
            'nome': df.iloc[0]['nome_produto'],
            'unidade': df.iloc[0].get('tipo_unidade', 'UN'),
            'codigo_barras': barcode,
            'periodo_analisado': f"{start_date} a {end_date}"
        }

        price_analysis = {
            'preco_medio': round(df['preco_produto'].mean(), 2),
            'preco_minimo': round(df['preco_produto'].min(), 2),
            'preco_maximo': round(df['preco_produto'].max(), 2),
            'volatilidade': round(df['preco_produto'].std() / df['preco_produto'].mean(), 4),
            'mercado_mais_barato': df.loc[df['preco_produto'].idxmin()]['nome_supermercado'],
            'mercado_mais_caro': df.loc[df['preco_produto'].idxmax()]['nome_supermercado']
        }

        trend_data = df.groupby('data_coleta')['preco_produto'].mean().reset_index()
        trend_analysis = calculate_trend_analysis(trend_data)

        market_availability = df.groupby('nome_supermercado').agg({
            'preco_produto': ['count', 'mean', 'std']
        }).round(2)
        market_availability.columns = ['disponibilidade', 'preco_medio', 'desvio_padrao']
        market_availability = market_availability.reset_index().to_dict('records')

        recommendations = []
        current_price = df[df['data_coleta'] == df['data_coleta'].max()]['preco_produto'].mean()
        best_price_market = price_analysis['mercado_mais_barato']

        if current_price > price_analysis['preco_medio']:
            recommendations.append(f"Preço atual está {round((current_price - price_analysis['preco_medio']) / price_analysis['preco_medio'] * 100, 1)}% acima da média")

        recommendations.append(f"Melhor preço encontrado em: {best_price_market}")

        intelligence_report = {
            'informacoes_produto': product_info,
            'analise_precos': price_analysis,
            'analise_tendencia': trend_analysis,
            'disponibilidade_mercados': market_availability,
            'recomendacoes': recommendations,
            'total_observacoes': len(df),
            'dias_analisados': days
        }

        return intelligence_report

    except Exception as e:
        logging.error(f"Erro na análise de inteligência do produto: {e}")
        return {"message": "Erro ao gerar análise de inteligência"}

# --------------------------------------------------------------------------
# --- NOVOS ENDPOINTS PARA ANÁLISE DE COLETAS ---
# --------------------------------------------------------------------------

@dashboard_router.post("/collection-analysis", response_model=CollectionAnalysisResponse)
async def get_collection_analysis(
    request: CollectionAnalysisRequest,
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Análise avançada de coletas por mercado com filtros personalizados"""
    try:
        markets_response = await asyncio.to_thread(
            supabase.table('supermercados')
            .select('cnpj, nome, endereco')
            .in_('cnpj', request.market_cnpjs)
            .execute
        )

        if not markets_response.data:
            raise HTTPException(status_code=404, detail="Nenhum mercado encontrado")

        markets_map = {market['cnpj']: market for market in markets_response.data}
        data = await get_date_range_data(request.start_date, request.end_date, request.market_cnpjs)

        if not data:
            return CollectionAnalysisResponse(
                market_stats=[],
                total_products=0,
                total_collections=0,
                date_range={
                    "start_date": str(request.start_date),
                    "end_date": str(request.end_date)
                },
                summary={}
            )

        df = pd.DataFrame(data)
        df['data_coleta'] = pd.to_datetime(df['data_coleta'])

        market_stats = []
        total_products = 0

        for market_cnpj in request.market_cnpjs:
            market_info = markets_map.get(market_cnpj)
            if not market_info:
                continue

            market_data = df[df['cnpj_supermercado'] == market_cnpj]

            if market_data.empty:
                market_stats.append(MarketCollectionStats(
                    market_name=market_info['nome'],
                    market_address=market_info.get('endereco'),
                    cnpj=market_cnpj,
                    total_products=0,
                    collection_dates=[],
                    daily_counts=[],
                    average_daily=0,
                    last_collection=None
                ))
                continue

            if request.group_by == "day":
                date_format = "%Y-%m-%d"
                group_key = market_data['data_coleta'].dt.date
            elif request.group_by == "week":
                date_format = "Semana %Y-%U"
                group_key = market_data['data_coleta'].dt.to_period('W').dt.start_time
            else:  # month
                date_format = "%Y-%m"
                group_key = market_data['data_coleta'].dt.to_period('M').dt.start_time

            daily_counts = market_data.groupby(group_key).size()
            daily_counts = daily_counts.sort_index()

            market_stats.append(MarketCollectionStats(
                market_name=market_info['nome'],
                market_address=market_info.get('endereco'),
                cnpj=market_cnpj,
                total_products=len(market_data),
                collection_dates=[date.strftime(date_format) if hasattr(date, 'strftime') else str(date) for date in daily_counts.index],
                daily_counts=daily_counts.tolist(),
                average_daily=round(daily_counts.mean(), 2),
                last_collection=market_data['data_coleta'].max().strftime('%Y-%m-%d')
            ))

            total_products += len(market_data)

        summary = {
            "total_markets": len(request.market_cnpjs),
            "markets_with_data": len([m for m in market_stats if m.total_products > 0]),
            "average_products_per_market": round(total_products / len([m for m in market_stats if m.total_products > 0]), 2) if any(m.total_products > 0 for m in market_stats) else 0,
            "most_productive_market": max(market_stats, key=lambda x: x.total_products).market_name if market_stats else "N/A",
            "period_days": (request.end_date - request.start_date).days + 1
        }

        return CollectionAnalysisResponse(
            market_stats=market_stats,
            total_products=total_products,
            total_collections=len(df['data_coleta'].unique()),
            date_range={
                "start_date": str(request.start_date),
                "end_date": str(request.end_date)
            },
            summary=summary
        )

    except Exception as e:
        logging.error(f"Erro na análise de coletas: {e}")
        raise HTTPException(status_code=500, detail=f"Erro na análise: {str(e)}")

@dashboard_router.get("/available-markets")
async def get_available_markets(
    user: UserProfile = Depends(require_page_access('dashboard'))
):
    """Retorna lista de mercados disponíveis para análise"""
    try:
        response = await asyncio.to_thread(
            supabase.table('supermercados')
            .select('cnpj, nome, endereco')
            .order('nome')
            .execute
        )

        markets = []
        for market in response.data:
            markets.append({
                'cnpj': market['cnpj'],
                'nome': market['nome'],
                'endereco': market.get('endereco', 'Endereço não disponível'),
                'label': f"{market['nome']} - {market.get('endereco', 'Endereço não disponível')}"
            })

        return markets

    except Exception as e:
        logging.error(f"Erro ao buscar mercados: {e}")
        return []

# --------------------------------------------------------------------------
# --- HEALTH CHECK AVANÇADO ---
# --------------------------------------------------------------------------

@dashboard_router.get("/health", summary="Health Check", response_model=Dict[str, Any])
async def health_check():
    """Verifica a saúde do serviço de dashboard e a conectividade com o banco."""
    health_status = {
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'components': {}
    }
    required_tables = ['produtos', 'coletas', 'supermercados']

    try:
        for table in required_tables:
            try:
                await asyncio.to_thread(
                    supabase.table(table).select('id', count='exact').limit(1).execute
                )
                health_status['components'][table] = {
                    'status': 'healthy',
                    'message': f"Tabela '{table}' acessível"
                }
            except Exception as e:
                health_status['components'][table] = {
                    'status': 'unhealthy',
                    'error': str(e)
                }

        unhealthy_components = [comp for comp in health_status['components'].values() if comp.get('status') == 'unhealthy']
        if unhealthy_components:
            health_status['status'] = 'degraded'

        if not health_status['components']:
            health_status['status'] = 'unhealthy'

        return health_status

    except Exception as e:
        logging.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail="Dashboard service unavailable")

@dashboard_router.get("/advanced-health-check")
async def advanced_health_check(user: UserProfile = Depends(require_page_access('dashboard'))):
    """Health check avançado para o dashboard"""
    try:
        health_status = {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "components": {},
            "performance_metrics": {},
            "data_quality": {}
        }

        tables_to_check = ['produtos', 'supermercados', 'coletas']
        for table in tables_to_check:
            try:
                start_time = datetime.now()
                response = await asyncio.to_thread(
                    supabase.table(table).select('id', count='exact').limit(1).execute
                )
                response_time = (datetime.now() - start_time).total_seconds()

                health_status['components'][table] = {
                    'status': 'healthy',
                    'count': response.count or 0,
                    'response_time': round(response_time, 3)
                }
            except Exception as e:
                health_status['components'][table] = {
                    'status': 'unhealthy',
                    'error': str(e)
                }

        try:
            products_response = await asyncio.to_thread(
                supabase.table('produtos')
                .select('preco_produto, data_coleta')
                .limit(1000)
                .execute
            )

            if products_response.data:
                df = pd.DataFrame(products_response.data)
                df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')

                health_status['data_quality'] = {
                    'total_registros_amostra': len(df),
                    'precos_validos': df['preco_produto'].notna().sum(),
                    'preco_medio_amostra': round(df['preco_produto'].mean(), 2),
                    'datas_unicas': df['data_coleta'].nunique()
                }
        except Exception as e:
            health_status['data_quality'] = {'error': str(e)}

        unhealthy_components = [comp for comp in health_status['components'].values() if comp.get('status') == 'unhealthy']
        if unhealthy_components:
            health_status['status'] = 'degraded'

        if not health_status['components']:
            health_status['status'] = 'unhealthy'

        return health_status

    except Exception as e:
        logging.error(f"Advanced health check failed: {e}")
        raise HTTPException(status_code=503, detail="Dashboard service unavailable")

# --------------------------------------------------------------------------
# --- INICIALIZAÇÃO E CONFIGURAÇÃO ---
# --------------------------------------------------------------------------

@dashboard_router.on_event("startup")
async def startup_event():
    """Inicialização do módulo de dashboard"""
    logging.info("🔄 Inicializando módulo de dashboard...")

    try:
        await asyncio.to_thread(
            supabase.table('produtos').select('id_registro', count='exact').limit(1).execute
        )
        logging.info("✅ Conexão com o banco de dados estabelecida")
    except Exception as e:
        logging.error(f"❌ Erro na conexão com o banco: {e}")

    logging.info("✅ Módulo de dashboard inicializado com sucesso")

# Exportar o router
__all__ = ['dashboard_router']