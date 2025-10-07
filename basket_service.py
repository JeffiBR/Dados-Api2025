# basket_service.py - VERSÃO CORRIGIDA
import logging
import asyncio
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
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

# Cria o roteador para a cesta básica
basket_router = APIRouter(prefix="/api/basket", tags=["basket"])

# Variáveis globais que serão configuradas posteriormente
supabase = None
supabase_admin = None
get_current_user_dependency = None

def setup_basket_routes(app, supabase_client, supabase_admin_client, get_current_user_dep):
    """
    Configura as rotas da cesta básica com as dependências do main.py
    """
    global supabase, supabase_admin, get_current_user_dependency
    supabase = supabase_client
    supabase_admin = supabase_admin_client
    get_current_user_dependency = get_current_user_dep
    
    # Inclui o roteador no app principal
    app.include_router(basket_router)

# Funções auxiliares para obter o usuário atual
async def get_current_user():
    if get_current_user_dependency is None:
        raise HTTPException(
            status_code=500, 
            detail="Dependência não configurada. Chame setup_basket_routes primeiro."
        )
    return await get_current_user_dependency()

# Endpoints da cesta básica - FUNÇÕES ESSENCIAIS
@basket_router.get("/")
async def get_user_basket(current_user: dict = Depends(get_current_user)):
    """
    Retorna a cesta do usuário atual - CRIA AUTOMATICAMENTE SE NÃO EXISTIR
    """
    try:
        print(f"🔍 Buscando cesta para usuário: {current_user.id}")
        
        response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets').select('*').eq('user_id', current_user.id).execute()
        )
        
        if response.data:
            print(f"✅ Cesta encontrada: {response.data[0]}")
            return response.data[0]
        else:
            # Se não existe, cria uma nova cesta automaticamente
            print(f"🆕 Criando nova cesta automaticamente para usuário: {current_user.id}")
            new_basket = {
                'user_id': current_user.id,
                'basket_name': 'Minha Cesta',
                'products': [],
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }
            
            create_response = await asyncio.to_thread(
                lambda: supabase.table('user_baskets').insert(new_basket).execute()
            )
            
            if create_response.data:
                print(f"✅ Cesta criada automaticamente: {create_response.data[0]}")
                return create_response.data[0]
            else:
                raise HTTPException(status_code=500, detail="Erro ao criar cesta automaticamente")
            
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar/criar cesta do usuário: {e}")
        raise HTTPException(status_code=500, detail="Erro ao carregar cesta")

@basket_router.post("/")
async def create_user_basket(current_user: dict = Depends(get_current_user)):
    """
    Cria uma NOVA cesta para o usuário (substitui qualquer existente)
    """
    try:
        print(f"🆕 Criando NOVA cesta para usuário: {current_user.id}")
        
        # Primeiro, deleta qualquer cesta existente
        delete_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets')
            .delete()
            .eq('user_id', current_user.id)
            .execute()
        )
        
        print(f"🗑️ Cestas antigas removidas: {delete_response}")
        
        # Cria nova cesta
        new_basket = {
            'user_id': current_user.id,
            'basket_name': 'Minha Cesta',
            'products': [],
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }
        
        create_response = await asyncio.to_thread(
            lambda: supabase.table('user_baskets').insert(new_basket).execute()
        )
        
        if create_response.data:
            print(f"✅ Nova cesta criada com sucesso: {create_response.data[0]}")
            return create_response.data[0]
        else:
            raise HTTPException(status_code=500, detail="Erro ao criar cesta")
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao criar cesta: {e}")
        raise HTTPException(status_code=500, detail="Erro ao criar cesta")

@basket_router.patch("/")
async def update_user_basket(
    basket_update: BasketUpdateRequest, 
    current_user: dict = Depends(get_current_user)):
    """
    Atualiza a cesta do usuário atual
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
    current_user: dict = Depends(get_current_user)):
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
async def clear_user_basket(current_user: dict = Depends(get_current_user)):
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

@basket_router.get("/all")
async def get_all_baskets(current_user: dict = Depends(get_current_user)):
    """
    Retorna todas as cestas com informações dos usuários (apenas para administradores)
    """
    try:
        # Verifica se o usuário é admin
        if current_user.role != 'admin':
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
