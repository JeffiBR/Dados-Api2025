# dependencies.py - Funções e variáveis compartilhadas para evitar importação circular

import os
from supabase import create_client, Client
from fastapi import HTTPException, Header, Depends
from typing import Optional, List
from datetime import date, timedelta
import logging
from pydantic import BaseModel
from postgrest.exceptions import APIError
import asyncio

# --- Configurações do Supabase ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SERVICE_ROLE_KEY = os.getenv("SERVICE_ROLE_KEY")

if not all([SUPABASE_URL, SUPABASE_KEY, SERVICE_ROLE_KEY]):
    logging.error("Variáveis de ambiente do Supabase não estão definidas.")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
supabase_admin: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

# --- Modelos compartilhados ---
class UserProfile(BaseModel):
    id: str
    role: str = "user"
    allowed_pages: List[str] = []
    email: Optional[str] = None
    managed_groups: List[int] = []

# --- Funções auxiliares ---
def calcular_data_expiracao(dias_acesso: int) -> date:
    """Calcula a data de expiração baseada nos dias de acesso"""
    return date.today() + timedelta(days=dias_acesso)

async def verificar_acesso_usuario(user_id: str) -> bool:
    """Verifica se o usuário tem acesso ativo baseado nos grupos"""
    try:
        today = date.today()
        response = await asyncio.to_thread(
            supabase.table('user_groups')
            .select('id')
            .eq('user_id', user_id)
            .gte('data_expiracao', today)
            .execute
        )
        return len(response.data) > 0
    except Exception as e:
        logging.error(f"Erro ao verificar acesso do usuário {user_id}: {e}")
        return False

# --- Funções de dependência compartilhadas ---
async def get_current_user(authorization: str = Header(None)) -> UserProfile:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autorização ausente ou mal formatado")
    
    jwt = authorization.split(" ")[1]
    try:
        user_response = supabase.auth.get_user(jwt)
        user = user_response.user
        user_id = user.id
        
        # Buscar o perfil completo
        profile_response = await asyncio.to_thread(
            supabase.table('profiles').select('*').eq('id', user_id).single().execute
        )
        
        if not profile_response.data:
            # Criar perfil padrão se não existir
            try:
                new_profile = {
                    'id': user_id,
                    'full_name': user.email or 'Usuário',
                    'role': 'user',
                    'allowed_pages': []
                }
                await asyncio.to_thread(
                    supabase.table('profiles').insert(new_profile).execute
                )
                profile_data = new_profile
            except Exception as e:
                logging.error(f"Erro ao criar perfil padrão: {e}")
                profile_data = {'role': 'user', 'allowed_pages': []}
        else:
            profile_data = profile_response.data
        
        # GARANTIR que role e allowed_pages sempre tenham valores
        role = profile_data.get('role', 'user')
        allowed_pages = profile_data.get('allowed_pages', [])
        
        if allowed_pages is None:
            allowed_pages = []
        
        # Buscar grupos gerenciados se for subadmin
        managed_groups = []
        if role != 'admin':
            try:
                # Verificar se é subadmin
                admin_response = await asyncio.to_thread(
                    supabase.table('group_admins').select('group_ids').eq('user_id', user_id).execute
                )
                if admin_response.data:
                    managed_groups = admin_response.data[0].get('group_ids', [])
            except Exception as e:
                logging.error(f"Erro ao buscar grupos gerenciados: {e}")
        
        # VERIFICAR ACESSO (exceto para admins e subadmins com grupos ativos)
        if role != 'admin' and not managed_groups:
            has_access = await verificar_acesso_usuario(user_id)
            if not has_access:
                raise HTTPException(
                    status_code=403, 
                    detail="Seu acesso à plataforma expirou. Entre em contato com o suporte para renovação."
                )
        
        return UserProfile(
            id=user_id, 
            role=role,
            allowed_pages=allowed_pages,
            email=user.email,
            managed_groups=managed_groups
        )
    except HTTPException:
        raise
    except Exception as e:
        if isinstance(e, APIError): 
            raise e
        logging.error(f"Erro de validação de token: {e}")
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")

async def get_current_user_optional(authorization: str = Header(None)) -> Optional[UserProfile]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    
    jwt = authorization.split(" ")[1]
    try:
        user_response = supabase.auth.get_user(jwt)
        user = user_response.user
        user_id = user.id
        
        profile_response = await asyncio.to_thread(
            supabase.table('profiles').select('*').eq('id', user_id).single().execute
        )
        
        if not profile_response.data:
            return UserProfile(
                id=user_id,
                role='user',
                allowed_pages=[],
                email=user.email,
                managed_groups=[]
            )
        
        profile_data = profile_response.data
        
        # Garantir valores não nulos
        role = profile_data.get('role', 'user')
        allowed_pages = profile_data.get('allowed_pages', [])
        
        # Buscar grupos gerenciados se for subadmin
        managed_groups = []
        if role != 'admin':
            try:
                admin_response = await asyncio.to_thread(
                    supabase.table('group_admins').select('group_ids').eq('user_id', user_id).execute
                )
                if admin_response.data:
                    managed_groups = admin_response.data[0].get('group_ids', [])
            except Exception as e:
                logging.error(f"Erro ao buscar grupos gerenciados: {e}")
        
        return UserProfile(
            id=user_id, 
            role=role,
            allowed_pages=allowed_pages,
            email=user.email,
            managed_groups=managed_groups
        )
    except Exception as e:
        return None

def require_page_access(page_key: str):
    async def _verify_access(current_user: UserProfile = Depends(get_current_user)):
        if current_user.role != 'admin' and page_key not in current_user.allowed_pages:
            raise HTTPException(status_code=403, detail=f"Acesso negado à funcionalidade: {page_key}")
        return current_user
    return _verify_access
