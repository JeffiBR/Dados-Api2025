# basket_service.py
import logging
import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

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
    
    # Inclui o roteador no app principal
    app.include_router(basket_router)

# Função auxiliar para obter o usuário atual
async def get_current_user():
    if get_current_user_dependency is None:
        raise HTTPException(
            status_code=500, 
            detail="Dependência não configurada. Chame setup_basket_routes primeiro."
        )
    return await get_current_user_dependency()

# Função auxiliar para obter o usuário atual (opcional)
async def get_current_user_optional():
    if get_current_user_optional_dependency is None:
        return None
    return await get_current_user_optional_dependency()

# Endpoints da cesta básica
@basket_router.get("/")
async def get_user_basket(current_user = Depends(get_current_user)):
    """
    Retorna a cesta do usuário atual
    """
    try:
        logging.info(f"🔍 Buscando cesta para usuário: {current_user.id}")
        
        response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets').select('*').eq('user_id', current_user.id).execute()
        )
        
        if response.data:
            logging.info(f"✅ Cesta encontrada para usuário {current_user.id}")
            return response.data[0]
        else:
            logging.info(f"❌ Cesta não encontrada para usuário {current_user.id}")
            raise HTTPException(status_code=404, detail="Cesta não encontrada")
            
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar cesta do usuário {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao carregar cesta")

@basket_router.post("/")
async def create_user_basket(current_user = Depends(get_current_user)):
    """
    Cria uma nova cesta para o usuário
    """
    try:
        logging.info(f"🆕 Criando cesta para usuário: {current_user.id}")
        
        # Verifica se já existe uma cesta
        existing_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .select('*')
            .eq('user_id', current_user.id)
            .execute()
        )
        
        if existing_response.data:
            logging.info(f"✅ Cesta já existe para usuário: {current_user.id}")
            return existing_response.data[0]
        
        # Cria nova cesta
        new_basket = {
            'user_id': current_user.id,
            'basket_name': 'Minha Cesta',
            'products': [],
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }
        
        logging.info(f"📝 Inserindo nova cesta: {new_basket}")
        
        create_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets').insert(new_basket).execute()
        )
        
        if create_response.data:
            logging.info(f"✅ Cesta criada com sucesso: {create_response.data[0]}")
            return create_response.data[0]
        else:
            logging.error("❌ Nenhum dado retornado ao criar cesta")
            raise HTTPException(status_code=500, detail="Erro ao criar cesta - nenhum dado retornado")
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao criar cesta para usuário {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao criar cesta: {str(e)}")

@basket_router.get("/all")
async def get_all_baskets(current_user = Depends(get_current_user)):
    """
    Retorna todas as cestas com informações dos usuários (apenas para administradores)
    """
    try:
        # Verifica se o usuário é admin
        if not hasattr(current_user, 'role') or current_user.role != 'admin':
            raise HTTPException(status_code=403, detail="Acesso não autorizado")
        
        # Busca todas as cestas com informações dos usuários
        response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .select('*, profiles(full_name, email)')
            .execute()
        )
        
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
        
        return baskets_with_users
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar todas as cestas: {e}")
        raise HTTPException(status_code=500, detail="Erro ao carregar cestas")

@basket_router.patch("/")
async def update_user_basket(
    basket_update: BasketUpdateRequest, 
    current_user = Depends(get_current_user)):
        
    """
    Atualiza a cesta do usuário atual - USANDO PATCH
    """
    try:
        # Busca a cesta existente do usuário
        existing_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .select('*')
            .eq('user_id', current_user.id)
            .execute()
        )
        
        if not existing_response.data:
            raise HTTPException(status_code=404, detail="Cesta não encontrada")
        
        # Atualiza cesta existente
        basket_id = existing_response.data[0]['id']
        update_data = {
            'updated_at': datetime.now().isoformat()
        }
        
        if basket_update.basket_name is not None:
            update_data['basket_name'] = basket_update.basket_name
            
        if basket_update.products is not None:
            update_data['products'] = [product.dict() for product in basket_update.products]
        
        response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .update(update_data)
            .eq('id', basket_id)
            .eq('user_id', current_user.id)
            .execute()
        )
        
        if response.data:
            return response.data[0]
        else:
            raise HTTPException(status_code=500, detail="Erro ao atualizar cesta")
            
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao atualizar cesta: {e}")
        raise HTTPException(status_code=500, detail="Erro ao atualizar cesta")

@basket_router.delete("/product/{barcode}")
async def remove_product_from_basket(
    barcode: str,
    current_user = Depends(get_current_user)):
        
    """
    Remove um produto específico da cesta do usuário
    """
    try:
        # Busca a cesta do usuário
        basket_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .select('*')
            .eq('user_id', current_user.id)
            .execute()
        )
        
        if not basket_response.data:
            raise HTTPException(status_code=404, detail="Cesta não encontrada")
        
        basket = basket_response.data[0]
        current_products = basket.get('products', [])
        
        # Filtra o produto a ser removido
        new_products = [p for p in current_products if p.get('product_barcode') != barcode]
        
        if len(new_products) == len(current_products):
            raise HTTPException(status_code=404, detail="Produto não encontrado na cesta")
        
        # Atualiza a cesta
        update_data = {
            'products': new_products,
            'updated_at': datetime.now().isoformat()
        }
        
        response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .update(update_data)
            .eq('id', basket['id'])
            .eq('user_id', current_user.id)
            .execute()
        )
        
        if response.data:
            return response.data[0]
        else:
            raise HTTPException(status_code=500, detail="Erro ao remover produto")
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao remover produto da cesta: {e}")
        raise HTTPException(status_code=500, detail="Erro ao remover produto")

@basket_router.delete("/clear")
async def clear_user_basket(current_user = Depends(get_current_user)):
    """
    Limpa todos os produtos da cesta do usuário
    """
    try:
        # Busca a cesta do usuário
        basket_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .select('*')
            .eq('user_id', current_user.id)
            .execute()
        )
        
        if not basket_response.data:
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
            .eq('user_id', current_user.id)
            .execute()
        )
        
        if response.data:
            return response.data[0]
        else:
            raise HTTPException(status_code=500, detail="Erro ao limpar cesta")
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao limpar cesta: {e}")
        raise HTTPException(status_code=500, detail="Erro ao limpar cesta")

@basket_router.post("/calculate")
async def calculate_basket_prices(
    request: BasketCalculationRequest, 
    current_user = Depends(get_current_user)):
    """
    Calcula os preços da cesta nos mercados selecionados
    """
    try:
        # Busca a cesta pelo ID
        basket_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets').select('*').eq('id', request.basket_id).execute()
        )
        
        if not basket_response.data:
            raise HTTPException(status_code=404, detail="Cesta não encontrada")
        
        basket = basket_response.data[0]
        
        # Verifica se a cesta pertence ao usuário (a menos que seja admin)
        if (not hasattr(current_user, 'role') or current_user.role != 'admin') and basket['user_id'] != current_user.id:
            raise HTTPException(status_code=403, detail="Acesso não autorizado a esta cesta")
        
        products = basket.get('products', [])
        
        if len(products) > 25:
            raise HTTPException(status_code=400, detail="A cesta não pode ter mais de 25 produtos")
        
        if not products:
            return {
                "complete_basket_results": {},
                "mixed_basket_results": {},
                "best_complete_basket": None
            }
        
        # Busca os preços mais recentes para cada produto nos mercados selecionados
        barcodes = [product['product_barcode'] for product in products]
        
        # Primeiro, busca informações básicas dos produtos
        products_info = {}
        for barcode in barcodes:
            product_response = await asyncio.to_thread(
                lambda: supabase.table('produtos').select('nome_produto').eq('codigo_barras', barcode).limit(1).execute()
            )
            if product_response.data:
                products_info[barcode] = product_response.data[0]['nome_produto']
        
        # Agora busca os preços
        price_query = supabase.table('produtos').select(
            'codigo_barras,nome_produto,preco_produto,cnpj_supermercado,nome_supermercado'
        ).in_('codigo_barras', barcodes).in_('cnpj_supermercado', request.cnpjs)
        
        prices_response = await asyncio.to_thread(lambda: price_query.execute())
        
        if not prices_response.data:
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
        
        # Encontra a melhor cesta completa
        best_complete = None
        if complete_basket_results:
            valid_markets = {k: v for k, v in complete_basket_results.items() if v['products_found'] > 0}
            if valid_markets:
                best_complete = min(valid_markets.values(), key=lambda x: x['total'])
        
        # Calcula economia percentual
        if best_complete and mixed_basket_results['total'] > 0:
            economy_percent = ((best_complete['total'] - mixed_basket_results['total']) / best_complete['total']) * 100
            mixed_basket_results['economy_percent'] = round(economy_percent, 1)
        else:
            mixed_basket_results['economy_percent'] = 0
        
        return {
            "complete_basket_results": complete_basket_results,
            "mixed_basket_results": mixed_basket_results,
            "best_complete_basket": best_complete
        }
        
    except Exception as e:
        logging.error(f"Erro ao calcular preços da cesta: {e}")
        raise HTTPException(status_code=500, detail="Erro ao calcular preços da cesta")

@basket_router.get("/debug/search")
async def debug_search_product(barcode: str = Query(...)):
    """
    Endpoint de debug para verificar se a busca está funcionando
    """
    try:
        # Busca direta na tabela produtos
        response = await asyncio.to_thread(
            lambda: supabase.table('produtos')
            .select('codigo_barras, nome_produto')
            .eq('codigo_barras', barcode)
            .limit(5)
            .execute()
        )
        
        return {
            "barcode": barcode,
            "found": len(response.data) > 0,
            "results": response.data
        }
    except Exception as e:
        return {"error": str(e)}
