# basket_service.py - VERSÃO COMPLETA COM LOGS DETALHADOS
import logging
import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

# Configurar logging mais detalhado
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Modelos Pydantic para a cesta básica
class BasketProduct(BaseModel):
    product_barcode: str
    product_name: Optional[str] = None

class UserBasket(BaseModel):
    id: Optional[int] = None
    user_id: str
    basket_name: str = "Minha Cesta"
    products: List[BasketProduct] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class BasketUpdateRequest(BaseModel):
    basket_name: Optional[str] = None
    products: Optional[List[BasketProduct]] = None

class BasketCalculationRequest(BaseModel):
    basket_id: int
    cnpjs: List[str]

# Cria o roteador para a cesta básica
basket_router = APIRouter(prefix="/api/basket", tags=["basket"])

# Variáveis globais que serão configuradas posteriormente
supabase = None
supabase_admin = None
get_current_user_dependency = None
get_current_user_optional_dependency = None

def setup_basket_routes(app, supabase_client, supabase_admin_client, get_current_user_dep, get_current_user_optional_dep):
    """
    Configura as rotas da cesta básica com as dependências do main.py
    """
    global supabase, supabase_admin, get_current_user_dependency, get_current_user_optional_dependency
    supabase = supabase_client
    supabase_admin = supabase_admin_client
    get_current_user_dependency = get_current_user_dep
    get_current_user_optional_dependency = get_current_user_optional_dep
    
    logger.info("✅ Rotas da cesta básica configuradas!")
    logger.info(f"📦 Supabase configurado: {supabase is not None}")
    logger.info(f"👤 Dependência de usuário configurada: {get_current_user_dependency is not None}")
    
    # Inclui o roteador no app principal
    app.include_router(basket_router)

# Funções auxiliares para obter o usuário atual
async def get_current_user():
    logger.debug("🔄 Chamando get_current_user dependency...")
    if get_current_user_dependency is None:
        logger.error("❌ get_current_user_dependency NÃO configurado!")
        raise HTTPException(
            status_code=500, 
            detail="Dependência não configurada. Chame setup_basket_routes primeiro."
        )
    try:
        user = await get_current_user_dependency()
        logger.debug(f"✅ Usuário obtido: {user}")
        return user
    except Exception as e:
        logger.error(f"❌ Erro ao obter usuário: {e}")
        raise

async def get_current_user_optional():
    if get_current_user_optional_dependency is None:
        return None
    return await get_current_user_optional_dependency()

# Função auxiliar para obter user_id de forma segura
def get_user_id(current_user):
    """Obtém o user_id de forma segura"""
    logger.debug(f"🔍 Analisando current_user: {current_user}")
    logger.debug(f"📝 Tipo do current_user: {type(current_user)}")
    
    if current_user is None:
        logger.error("❌ current_user é None!")
        raise HTTPException(status_code=401, detail="Usuário não autenticado")
    
    # Se for um objeto com atributo id
    if hasattr(current_user, 'id'):
        user_id = current_user.id
        logger.debug(f"✅ User_id obtido do atributo: {user_id}")
        return user_id
    
    # Se for um dicionário
    elif isinstance(current_user, dict) and 'id' in current_user:
        user_id = current_user['id']
        logger.debug(f"✅ User_id obtido do dicionário: {user_id}")
        return user_id
    
    # Tentativa de fallback
    elif hasattr(current_user, 'user_id'):
        user_id = current_user.user_id
        logger.debug(f"✅ User_id obtido do atributo user_id: {user_id}")
        return user_id
    elif isinstance(current_user, dict) and 'user_id' in current_user:
        user_id = current_user['user_id']
        logger.debug(f"✅ User_id obtido da chave user_id: {user_id}")
        return user_id
    else:
        logger.error(f"❌ Não foi possível extrair user_id. Estrutura do objeto: {dir(current_user) if not isinstance(current_user, dict) else 'dict keys: ' + str(current_user.keys())}")
        raise HTTPException(status_code=400, detail="Usuário não possui ID válido")

# Função auxiliar para verificar se usuário é admin
def is_admin(current_user):
    """Verifica se o usuário é admin"""
    try:
        if hasattr(current_user, 'role'):
            return current_user.role == 'admin'
        elif isinstance(current_user, dict) and 'role' in current_user:
            return current_user.get('role') == 'admin'
        return False
    except:
        return False

# Endpoints da cesta básica - COM LOGS DETALHADOS

@basket_router.get("/debug/diagnostic")
async def diagnostic_endpoint(current_user = Depends(get_current_user)):
    """
    Endpoint de diagnóstico para verificar configuração
    """
    try:
        logger.info("=== DIAGNÓSTICO INICIADO ===")
        user_id = get_user_id(current_user)
        
        diagnostic_info = {
            "user_id": user_id,
            "user_type": str(type(current_user)),
            "supabase_configured": supabase is not None,
            "user_dependency_configured": get_current_user_dependency is not None,
            "table_access_test": None,
            "error": None
        }
        
        # Testar acesso à tabela
        try:
            logger.info("🧪 Testando acesso à tabela user_baskets...")
            test_response = await asyncio.to_thread(
                lambda: supabase.table('user_baskets').select('id').limit(1).execute()
            )
            diagnostic_info["table_access_test"] = "SUCCESS"
            diagnostic_info["table_response"] = str(test_response)
            logger.info(f"✅ Teste de tabela bem-sucedido: {test_response}")
        except Exception as e:
            diagnostic_info["table_access_test"] = "FAILED"
            diagnostic_info["error"] = str(e)
            logger.error(f"❌ Teste de tabela falhou: {e}")
            
        return diagnostic_info
        
    except Exception as e:
        logger.error(f"💥 Erro no diagnóstico: {e}")
        return {"error": str(e)}

@basket_router.get("/")
async def get_user_basket(current_user = Depends(get_current_user)):
    """
    Retorna a cesta do usuário atual
    """
    try:
        logger.info("=== INICIANDO GET USER BASKET ===")
        user_id = get_user_id(current_user)
        logger.info(f"🔍 Buscando cesta para usuário: {user_id}")
        
        # Verificar se a tabela existe
        logger.info("📋 Verificando acesso à tabela user_baskets...")
        response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets').select('*').eq('user_id', user_id).execute()
        )
        
        logger.info(f"📊 Resposta do Supabase: {response}")
        logger.info(f"📦 Dados retornados: {response.data}")
        
        if response.data:
            logger.info(f"✅ Cesta encontrada: {len(response.data)} itens")
            return response.data[0]
        else:
            logger.info("ℹ️ Cesta não encontrada - retornando 404")
            raise HTTPException(status_code=404, detail="Cesta não encontrada")
            
    except HTTPException as he:
        logger.warning(f"⚠️ HTTPException: {he.detail}")
        raise
    except Exception as e:
        logger.error(f"💥 Erro ao buscar cesta do usuário: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao carregar cesta: {str(e)}")

@basket_router.post("/")
async def create_user_basket(current_user = Depends(get_current_user)):
    """
    Cria uma nova cesta para o usuário
    """
    try:
        logger.info("=== INICIANDO CREATE USER BASKET ===")
        user_id = get_user_id(current_user)
        logger.info(f"🆕 Criando cesta para usuário: {user_id}")
        
        # Verifica se já existe uma cesta
        logger.info("🔍 Verificando cesta existente...")
        existing_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .select('*')
            .eq('user_id', user_id)
            .execute()
        )
        
        logger.info(f"📊 Resposta da verificação: {existing_response}")
        
        if existing_response.data:
            logger.info(f"✅ Cesta já existe para usuário: {user_id}")
            return existing_response.data[0]
        
        # Cria nova cesta
        new_basket = {
            'user_id': user_id,
            'basket_name': 'Minha Cesta',
            'products': [],
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }
        
        logger.info(f"📝 Inserindo nova cesta: {new_basket}")
        
        create_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets').insert(new_basket).execute()
        )
        
        logger.info(f"📊 Resposta da criação: {create_response}")
        
        if create_response.data:
            logger.info(f"✅ Cesta criada com sucesso: {create_response.data[0]}")
            return create_response.data[0]
        else:
            logger.error("❌ Nenhum dado retornado na criação")
            raise HTTPException(status_code=500, detail="Erro ao criar cesta - nenhum dado retornado")
        
    except HTTPException as he:
        logger.warning(f"⚠️ HTTPException: {he.detail}")
        raise
    except Exception as e:
        logger.error(f"💥 Erro ao criar cesta: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao criar cesta: {str(e)}")

@basket_router.get("/all")
async def get_all_baskets(current_user = Depends(get_current_user)):
    """
    Retorna todas as cestas com informações dos usuários (apenas para administradores)
    """
    try:
        logger.info("=== INICIANDO GET ALL BASKETS ===")
        
        # Verifica se o usuário é admin
        if not is_admin(current_user):
            logger.warning("⛔ Usuário não é admin - acesso negado")
            raise HTTPException(status_code=403, detail="Acesso não autorizado")
        
        logger.info("👑 Usuário é admin - buscando todas as cestas")
        
        # Busca todas as cestas com informações dos usuários
        response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .select('*, profiles(full_name, email)')
            .execute()
        )
        
        logger.info(f"📊 Resposta do Supabase: {len(response.data)} cestas encontradas")
        
        # Processa os dados para incluir informações do usuário
        baskets_with_users = []
        for basket in response.data:
            user_info = basket.get('profiles', {})
            basket_with_user = {
                'id': basket['id'],
                'user_id': basket['user_id'],
                'basket_name': basket['basket_name'],
                'products': basket['products'],
                'created_at': basket['created_at'],
                'updated_at': basket['updated_at'],
                'user_name': user_info.get('full_name', 'Usuário'),
                'user_email': user_info.get('email', 'N/A')
            }
            baskets_with_users.append(basket_with_user)
        
        logger.info(f"✅ Retornando {len(baskets_with_users)} cestas")
        return baskets_with_users
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"💥 Erro ao buscar todas as cestas: {e}")
        raise HTTPException(status_code=500, detail="Erro ao carregar cestas")

@basket_router.patch("/")
async def update_user_basket(
    basket_update: BasketUpdateRequest, 
    current_user = Depends(get_current_user)):
        
    """
    Atualiza a cesta do usuário atual - USANDO PATCH
    """
    try:
        logger.info("=== INICIANDO UPDATE USER BASKET ===")
        user_id = get_user_id(current_user)
        logger.info(f"🔄 Atualizando cesta para usuário: {user_id}")
        
        # Busca a cesta existente do usuário
        existing_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .select('*')
            .eq('user_id', user_id)
            .execute()
        )
        
        logger.info(f"📊 Cesta existente: {existing_response.data}")
        
        if not existing_response.data:
            logger.warning("❌ Cesta não encontrada para atualização")
            raise HTTPException(status_code=404, detail="Cesta não encontrada")
        
        # Atualiza cesta existente
        basket_id = existing_response.data[0]['id']
        update_data = {
            'updated_at': datetime.now().isoformat()
        }
        
        if basket_update.basket_name is not None:
            update_data['basket_name'] = basket_update.basket_name
            logger.info(f"📝 Atualizando nome da cesta: {basket_update.basket_name}")
            
        if basket_update.products is not None:
            update_data['products'] = [product.dict() for product in basket_update.products]
            logger.info(f"📝 Atualizando produtos: {len(basket_update.products)} produtos")
        
        logger.info(f"📤 Dados de atualização: {update_data}")
        
        response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .update(update_data)
            .eq('id', basket_id)
            .eq('user_id', user_id)
            .execute()
        )
        
        logger.info(f"📊 Resposta da atualização: {response}")
        
        if response.data:
            logger.info("✅ Cesta atualizada com sucesso")
            return response.data[0]
        else:
            logger.error("❌ Erro ao atualizar cesta - nenhum dado retornado")
            raise HTTPException(status_code=500, detail="Erro ao atualizar cesta")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"💥 Erro ao atualizar cesta: {e}")
        raise HTTPException(status_code=500, detail="Erro ao atualizar cesta")

@basket_router.delete("/product/{barcode}")
async def remove_product_from_basket(
    barcode: str,
    current_user = Depends(get_current_user)):
        
    """
    Remove um produto específico da cesta do usuário
    """
    try:
        logger.info(f"=== INICIANDO REMOVE PRODUCT {barcode} ===")
        user_id = get_user_id(current_user)
        logger.info(f"🗑️ Removendo produto {barcode} do usuário: {user_id}")
        
        # Busca a cesta do usuário
        basket_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .select('*')
            .eq('user_id', user_id)
            .execute()
        )
        
        if not basket_response.data:
            logger.warning("❌ Cesta não encontrada")
            raise HTTPException(status_code=404, detail="Cesta não encontrada")
        
        basket = basket_response.data[0]
        current_products = basket.get('products', [])
        logger.info(f"📦 Produtos atuais: {len(current_products)}")
        
        # Filtra o produto a ser removido
        new_products = [p for p in current_products if p.get('product_barcode') != barcode]
        
        if len(new_products) == len(current_products):
            logger.warning(f"❌ Produto {barcode} não encontrado na cesta")
            raise HTTPException(status_code=404, detail="Produto não encontrado na cesta")
        
        logger.info(f"✅ Produto {barcode} encontrado, removendo...")
        
        # Atualiza a cesta
        update_data = {
            'products': new_products,
            'updated_at': datetime.now().isoformat()
        }
        
        response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .update(update_data)
            .eq('id', basket['id'])
            .eq('user_id', user_id)
            .execute()
        )
        
        if response.data:
            logger.info("✅ Produto removido com sucesso")
            return response.data[0]
        else:
            logger.error("❌ Erro ao remover produto")
            raise HTTPException(status_code=500, detail="Erro ao remover produto")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"💥 Erro ao remover produto da cesta: {e}")
        raise HTTPException(status_code=500, detail="Erro ao remover produto")

@basket_router.delete("/clear")
async def clear_user_basket(current_user = Depends(get_current_user)):
    """
    Limpa todos os produtos da cesta do usuário
    """
    try:
        logger.info("=== INICIANDO CLEAR BASKET ===")
        user_id = get_user_id(current_user)
        logger.info(f"🧹 Limpando cesta do usuário: {user_id}")
        
        # Busca a cesta do usuário
        basket_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .select('*')
            .eq('user_id', user_id)
            .execute()
        )
        
        if not basket_response.data:
            logger.warning("❌ Cesta não encontrada")
            raise HTTPException(status_code=404, detail="Cesta não encontrada")
        
        # Limpa os produtos
        update_data = {
            'products': [],
            'updated_at': datetime.now().isoformat()
        }
        
        response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .update(update_data)
            .eq('id', basket_response.data[0]['id'])
            .eq('user_id', user_id)
            .execute()
        )
        
        if response.data:
            logger.info("✅ Cesta limpa com sucesso")
            return response.data[0]
        else:
            logger.error("❌ Erro ao limpar cesta")
            raise HTTPException(status_code=500, detail="Erro ao limpar cesta")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"💥 Erro ao limpar cesta: {e}")
        raise HTTPException(status_code=500, detail="Erro ao limpar cesta")

@basket_router.post("/calculate")
async def calculate_basket_prices(
    request: BasketCalculationRequest, 
    current_user = Depends(get_current_user)):
    """
    Calcula os preços da cesta nos mercados selecionados
    """
    try:
        logger.info("=== INICIANDO CALCULATE BASKET PRICES ===")
        logger.info(f"📊 Calculando cesta ID: {request.basket_id} para {len(request.cnpjs)} mercados")
        
        # Busca a cesta pelo ID
        basket_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets').select('*').eq('id', request.basket_id).execute()
        )
        
        if not basket_response.data:
            logger.warning(f"❌ Cesta {request.basket_id} não encontrada")
            raise HTTPException(status_code=404, detail="Cesta não encontrada")
        
        basket = basket_response.data[0]
        user_id = get_user_id(current_user)
        logger.info(f"📦 Cesta encontrada: {basket['basket_name']} com {len(basket.get('products', []))} produtos")
        
        # Verifica se a cesta pertence ao usuário (a menos que seja admin)
        if not is_admin(current_user) and basket['user_id'] != user_id:
            logger.warning(f"⛔ Acesso não autorizado à cesta {request.basket_id}")
            raise HTTPException(status_code=403, detail="Acesso não autorizado a esta cesta")
        
        products = basket.get('products', [])
        logger.info(f"🛒 Produtos na cesta: {len(products)}")
        
        if len(products) > 25:
            logger.warning("❌ Cesta com mais de 25 produtos")
            raise HTTPException(status_code=400, detail="A cesta não pode ter mais de 25 produtos")
        
        if not products:
            logger.info("ℹ️ Cesta vazia - retornando resultados vazios")
            return {
                "complete_basket_results": {},
                "mixed_basket_results": {},
                "best_complete_basket": None
            }
        
        # Busca os preços mais recentes para cada produto nos mercados selecionados
        barcodes = [product['product_barcode'] for product in products]
        logger.info(f"🔍 Buscando preços para {len(barcodes)} códigos de barras")
        
        # Primeiro, busca informações básicas dos produtos
        products_info = {}
        for barcode in barcodes:
            product_response = await asyncio.to_thread(
                lambda: supabase.table('produtos').select('nome_produto').eq('codigo_barras', barcode).limit(1).execute()
            )
            if product_response.data:
                products_info[barcode] = product_response.data[0]['nome_produto']
        
        logger.info(f"📋 Informações de {len(products_info)} produtos obtidas")
        
        # Agora busca os preços
        price_query = supabase.table('produtos').select(
            'codigo_barras,nome_produto,preco_produto,cnpj_supermercado,nome_supermercado'
        ).in_('codigo_barras', barcodes).in_('cnpj_supermercado', request.cnpjs)
        
        prices_response = await asyncio.to_thread(lambda: price_query.execute())
        logger.info(f"💰 {len(prices_response.data)} preços encontrados")
        
        if not prices_response.data:
            logger.info("ℹ️ Nenhum preço encontrado - retornando resultados vazios")
            return {
                "complete_basket_results": {},
                "mixed_basket_results": {},
                "best_complete_basket": None
            }
        
        # Organiza os preços por mercado e por produto
        market_prices = {}
        product_prices = {}
        
        for price in prices_response.data:
            market_cnpj = price['cnpj_supermercado']
            market_name = price['nome_supermercado']
            barcode = price['codigo_barras']
            product_price = float(price['preco_produto'])
            
            # Organiza por mercado
            if market_cnpj not in market_prices:
                market_prices[market_cnpj] = {
                    'market_name': market_name,
                    'products': {},
                    'total': 0
                }
            
            # Pega o menor preço para cada produto no mesmo mercado
            if barcode not in market_prices[market_cnpj]['products'] or product_price < market_prices[market_cnpj]['products'][barcode]:
                market_prices[market_cnpj]['products'][barcode] = product_price
            
            # Organiza por produto para a cesta mista
            if barcode not in product_prices:
                product_prices[barcode] = {}
            
            if market_cnpj not in product_prices[barcode] or product_price < product_prices[barcode][market_cnpj]:
                product_prices[barcode][market_cnpj] = {
                    'price': product_price,
                    'market_name': market_name
                }
        
        logger.info(f"🏪 {len(market_prices)} mercados com preços organizados")
        
        # Calcula totais para cada mercado (cesta completa)
        complete_basket_results = {}
        for market_cnpj, market_data in market_prices.items():
            total = 0
            market_products = []
            
            for product in products:
                barcode = product['product_barcode']
                if barcode in market_data['products']:
                    price = market_data['products'][barcode]
                    total += price
                    market_products.append({
                        'barcode': barcode,
                        'name': products_info.get(barcode, 'Produto não encontrado'),
                        'price': price,
                        'found': True
                    })
                else:
                    market_products.append({
                        'barcode': barcode,
                        'name': products_info.get(barcode, 'Produto não encontrado'),
                        'price': 0,
                        'found': False
                    })
            
            complete_basket_results[market_cnpj] = {
                'market_name': market_data['market_name'],
                'total': round(total, 2),
                'products': market_products,
                'products_found': len([p for p in market_products if p['found']]),
                'total_products': len(products)
            }
        
        logger.info(f"📊 Cestas completas calculadas: {len(complete_basket_results)}")
        
        # Calcula a cesta mista (melhor preço de cada produto em qualquer mercado)
        mixed_basket_results = {
            'total': 0,
            'products': [],
            'market_breakdown': {}
        }
        
        for product in products:
            barcode = product['product_barcode']
            if barcode in product_prices:
                # Encontra o menor preço para este produto
                best_price = float('inf')
                best_market = None
                best_market_name = None
                
                for market_cnpj, price_data in product_prices[barcode].items():
                    if price_data['price'] < best_price:
                        best_price = price_data['price']
                        best_market = market_cnpj
                        best_market_name = price_data['market_name']
                
                if best_price != float('inf'):
                    mixed_basket_results['total'] += best_price
                    product_info = {
                        'barcode': barcode,
                        'name': products_info.get(barcode, 'Produto não encontrado'),
                        'price': best_price,
                        'market_cnpj': best_market,
                        'market_name': best_market_name,
                        'found': True
                    }
                    mixed_basket_results['products'].append(product_info)
                    
                    # Adiciona ao breakdown por mercado
                    if best_market not in mixed_basket_results['market_breakdown']:
                        mixed_basket_results['market_breakdown'][best_market] = {
                            'market_name': best_market_name,
                            'products': [],
                            'subtotal': 0
                        }
                    
                    mixed_basket_results['market_breakdown'][best_market]['products'].append(product_info)
                    mixed_basket_results['market_breakdown'][best_market]['subtotal'] += best_price
                else:
                    mixed_basket_results['products'].append({
                        'barcode': barcode,
                        'name': products_info.get(barcode, 'Produto não encontrado'),
                        'price': 0,
                        'market_cnpj': None,
                        'market_name': 'Não encontrado',
                        'found': False
                    })
            else:
                mixed_basket_results['products'].append({
                    'barcode': barcode,
                    'name': products_info.get(barcode, 'Produto não encontrado'),
                    'price': 0,
                    'market_cnpj': None,
                    'market_name': 'Não encontrado',
                    'found': False
                })
        
        mixed_basket_results['total'] = round(mixed_basket_results['total'], 2)
        logger.info(f"🛒 Cesta mista calculada: R$ {mixed_basket_results['total']}")
        
        # Encontra a melhor cesta completa
        best_complete = None
        if complete_basket_results:
            valid_markets = {k: v for k, v in complete_basket_results.items() if v['products_found'] > 0}
            if valid_markets:
                best_complete = min(valid_markets.values(), key=lambda x: x['total'])
                logger.info(f"🏆 Melhor cesta completa: {best_complete['market_name']} - R$ {best_complete['total']}")
        
        # Calcula economia percentual
        if best_complete and mixed_basket_results['total'] > 0:
            economy_percent = ((best_complete['total'] - mixed_basket_results['total']) / best_complete['total']) * 100
            mixed_basket_results['economy_percent'] = round(economy_percent, 1)
            logger.info(f"💰 Economia: {mixed_basket_results['economy_percent']}%")
        else:
            mixed_basket_results['economy_percent'] = 0
        
        logger.info("✅ Cálculo de preços concluído com sucesso")
        return {
            "complete_basket_results": complete_basket_results,
            "mixed_basket_results": mixed_basket_results,
            "best_complete_basket": best_complete
        }
        
    except Exception as e:
        logger.error(f"💥 Erro ao calcular preços da cesta: {e}")
        raise HTTPException(status_code=500, detail="Erro ao calcular preços da cesta")

@basket_router.get("/debug/search")
async def debug_search_product(barcode: str = Query(...)):
    """
    Endpoint de debug para verificar se a busca está funcionando
    """
    try:
        logger.info(f"🔍 DEBUG SEARCH: Buscando produto {barcode}")
        
        # Busca direta na tabela produtos
        response = await asyncio.to_thread(
            lambda: supabase.table('produtos')
            .select('codigo_barras, nome_produto')
            .eq('codigo_barras', barcode)
            .limit(5)
            .execute()
        )
        
        logger.info(f"📊 DEBUG SEARCH RESULT: {len(response.data)} resultados")
        
        return {
            "barcode": barcode,
            "found": len(response.data) > 0,
            "results": response.data
        }
    except Exception as e:
        logger.error(f"💥 Erro no debug search: {e}")
        return {"error": str(e)}
