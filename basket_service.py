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
    id: int
    user_id: str
    basket_name: str = "Minha Cesta"
    products: List[BasketProduct] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

class BasketUpdateRequest(BaseModel):
    basket_name: Optional[str] = None
    products: Optional[List[BasketProduct]] = None

class BasketCalculationRequest(BaseModel):
    basket_id: int
    cnpjs: List[str]

# Cria o roteador para a cesta básica
basket_router = APIRouter(prefix="/api/basket", tags=["Cesta Básica"])

# Variáveis globais que serão configuradas pelo main.py
supabase = None
supabase_admin = None
get_current_user = None
get_current_user_optional = None

def setup_basket_routes(app, supabase_client, supabase_admin_client, get_current_user_dep, get_current_user_optional_dep):
    """
    Configura as rotas da cesta básica com as dependências do main.py
    """
    global supabase, supabase_admin, get_current_user, get_current_user_optional
    supabase = supabase_client
    supabase_admin = supabase_admin_client
    get_current_user = get_current_user_dep
    get_current_user_optional = get_current_user_optional_dep
    
    app.include_router(basket_router)

# --- Endpoints da Cesta Básica ---

@basket_router.get("/", response_model=UserBasket)
async def get_user_basket(current_user: dict = Depends(lambda: get_current_user())):
    """
    Retorna a cesta do usuário atual. Se não existir, cria uma nova.
    """
    try:
        # Tenta buscar a cesta existente
        response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets').select('*').eq('user_id', current_user.id).maybe_single().execute()
        )
        
        if response.data:
            return response.data

        # Se não encontrou, cria uma nova cesta
        logging.info(f"Nenhuma cesta encontrada para o usuário {current_user.id}. Criando uma nova.")
        new_basket_data = {'user_id': current_user.id, 'basket_name': 'Minha Cesta', 'products': []}
        create_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets').insert(new_basket_data).select().single().execute()
        )
        return create_response.data

    except Exception as e:
        logging.error(f"Erro ao buscar ou criar cesta para o usuário {current_user.id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro interno ao carregar a cesta do usuário.")

@basket_router.patch("/", response_model=UserBasket)
async def update_user_basket(
    basket_update: BasketUpdateRequest, 
    current_user: dict = Depends(lambda: get_current_user())
):
    """
    Atualiza a cesta do usuário (nome ou produtos). Usa PATCH para atualizações parciais.
    """
    try:
        update_data = basket_update.dict(exclude_unset=True)
        if not update_data:
            raise HTTPException(status_code=400, detail="Nenhum dado para atualizar foi fornecido.")

        # Converte produtos para dict se existirem
        if 'products' in update_data:
            update_data['products'] = [p.dict() for p in update_data['products']]
        
        update_data['updated_at'] = datetime.now().isoformat()

        response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .update(update_data)
            .eq('user_id', current_user.id)
            .select()
            .single()
            .execute()
        )
        
        return response.data
            
    except Exception as e:
        logging.error(f"Erro ao atualizar cesta para o usuário {current_user.id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Não foi possível salvar as alterações na cesta.")

@basket_router.get("/all")
async def get_all_baskets(current_user: dict = Depends(lambda: get_current_user())):
    """
    Retorna todas as cestas com informações dos usuários (apenas para administradores).
    """
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas administradores podem ver todas as cestas.")
    
    try:
        response = await asyncio.to_thread(
            lambda: supabase_admin.rpc('get_all_baskets_with_user_info').execute()
        )
        return response.data
    except Exception as e:
        logging.error(f"Erro ao buscar todas as cestas (admin): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro ao carregar as cestas dos usuários.")

@basket_router.post("/calculate")
async def calculate_basket_prices(
    request: BasketCalculationRequest, 
    current_user: dict = Depends(lambda: get_current_user())
):
    """
    Calcula os preços da cesta nos mercados selecionados.
    """
    try:
        # Busca a cesta pelo ID e verifica a permissão
        basket_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets').select('*').eq('id', request.basket_id).single().execute()
        )
        basket = basket_response.data
        
        if current_user.role != 'admin' and basket['user_id'] != current_user.id:
            raise HTTPException(status_code=403, detail="Acesso não autorizado a esta cesta.")
        
        products = basket.get('products', [])
        if not products:
            return {"best_complete_basket": None, "mixed_basket_results": {"total": 0, "products": [], "market_breakdown": {}, "economy_percent": 0}}

        barcodes = [p['product_barcode'] for p in products]
        
        # Chama a função RPC do Supabase para fazer o cálculo
        params = {'p_barcodes': barcodes, 'p_cnpjs': request.cnpjs}
        response = await asyncio.to_thread(
            lambda: supabase.rpc('
