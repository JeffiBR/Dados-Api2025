# dependencies.py - Funções e variáveis compartilhadas para evitar importação circular

import os
from supabase import create_client, Client
from fastapi import HTTPException, Header, Depends
from typing import Optional, List
from datetime import date, timedelta, datetime
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

# --- Constantes compartilhadas ---
DEFAULT_ACCESS_DAYS = 30
MAX_ACCESS_DAYS = 365
MIN_ACCESS_DAYS = 1

# --- Funções auxiliares básicas ---
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

async def get_user_managed_groups(user_id: str) -> List[int]:
    """Obtém a lista de grupos que um usuário pode gerenciar como subadmin"""
    try:
        response = await asyncio.to_thread(
            supabase.table('group_admins')
            .select('group_ids')
            .eq('user_id', user_id)
            .single()
            .execute
        )
        if response.data:
            return response.data.get('group_ids', [])
        return []
    except Exception as e:
        logging.error(f"Erro ao buscar grupos gerenciados pelo usuário {user_id}: {e}")
        return []

# --- Funções de dependência principais ---
async def get_current_user(authorization: str = Header(None)) -> UserProfile:
    """Obtém o usuário atual com base no token JWT"""
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
    """Versão opcional do get_current_user para endpoints públicos"""
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
    """Dependência para verificar acesso a páginas específicas"""
    async def _verify_access(current_user: UserProfile = Depends(get_current_user)):
        if current_user.role != 'admin' and page_key not in current_user.allowed_pages:
            raise HTTPException(status_code=403, detail=f"Acesso negado à funcionalidade: {page_key}")
        return current_user
    return _verify_access

# --- Funções específicas para administradores de grupo ---
async def verify_group_admin_access(user_id: str, group_id: int) -> bool:
    """Verifica se um usuário tem permissão de subadmin para um grupo específico"""
    try:
        managed_groups = await get_user_managed_groups(user_id)
        return group_id in managed_groups
    except Exception as e:
        logging.error(f"Erro ao verificar acesso de subadmin: {e}")
        return False

async def get_group_admin_user(current_user: UserProfile = Depends(get_current_user)) -> UserProfile:
    """Dependência para verificar se o usuário é subadministrador"""
    if current_user.role == 'admin':
        return current_user
    
    managed_groups = await get_user_managed_groups(current_user.id)
    if not managed_groups:
        raise HTTPException(
            status_code=403, 
            detail="Acesso negado. Você não tem permissões de subadministrador."
        )
    
    # Adiciona os grupos gerenciados ao perfil do usuário
    current_user.managed_groups = managed_groups
    return current_user

async def require_group_admin_access(group_id: int):
    """Dependência para verificar acesso de subadmin a um grupo específico"""
    async def _verify_group_access(current_user: UserProfile = Depends(get_group_admin_user)):
        if current_user.role != 'admin' and not await verify_group_admin_access(current_user.id, group_id):
            raise HTTPException(
                status_code=403, 
                detail="Acesso negado a este grupo."
            )
        return current_user
    return _verify_group_access

# --- Funções para verificação de hierarquia de permissões ---
def can_manage_users(user: UserProfile) -> bool:
    """Verifica se o usuário pode gerenciar outros usuários"""
    return user.role == 'admin' or 'users' in user.allowed_pages

def can_create_users(user: UserProfile) -> bool:
    """Verifica se o usuário pode criar novos usuários"""
    # Apenas admin geral pode criar usuários (subadmins não podem criar novos usuários)
    return user.role == 'admin'

def can_manage_group(user: UserProfile, group_id: int) -> bool:
    """Verifica se o usuário pode gerenciar um grupo específico"""
    if user.role == 'admin':
        return True
    return group_id in user.managed_groups

def get_user_permissions_hierarchy(user: UserProfile) -> dict:
    """Retorna a hierarquia de permissões do usuário"""
    return {
        'is_admin': user.role == 'admin',
        'is_group_admin': len(user.managed_groups) > 0,
        'can_create_users': can_create_users(user),
        'can_manage_users': can_manage_users(user),
        'managed_groups': user.managed_groups,
        'allowed_pages': user.allowed_pages
    }

# --- Classes de exceção personalizadas ---
class APIError(Exception):
    """Exceção personalizada para erros de API"""
    def __init__(self, message: str, code: str = None, details: str = None):
        self.message = message
        self.code = code
        self.details = details
        super().__init__(self.message)

class PermissionDeniedError(APIError):
    """Exceção para permissões negadas"""
    def __init__(self, message: str = "Permissão negada"):
        super().__init__(message, code="PERMISSION_DENIED")

# --- Funções de utilidade para logging ---
def setup_logging():
    """Configura o logging da aplicação"""
    logging.basicConfig(
        level=logging.INFO,
        format='[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

def log_user_activity(user_id: str, action: str, details: dict = None):
    """Registra atividade do usuário de forma assíncrona"""
    try:
        log_data = {
            "user_id": user_id,
            "action_type": action,
            "details": details or {},
            "created_at": datetime.now().isoformat()
        }
        
        # Executar em thread separada para não bloquear
        asyncio.create_task(
            asyncio.to_thread(
                supabase_admin.table('user_activity_logs').insert(log_data).execute
            )
        )
    except Exception as e:
        logging.error(f"Erro ao registrar atividade do usuário: {e}")

def log_admin_activity(admin_user: UserProfile, action: str, target_user_id: str = None, details: dict = None):
    """Registra atividade administrativa"""
    log_details = {
        "admin_id": admin_user.id,
        "admin_role": admin_user.role,
        "admin_managed_groups": admin_user.managed_groups,
        **({"target_user_id": target_user_id} if target_user_id else {})
    }
    
    if details:
        log_details.update(details)
    
    log_user_activity(admin_user.id, f"admin_{action}", log_details)

# --- Validações comuns ---
def validate_email(email: str) -> bool:
    """Valida formato de email básico"""
    import re
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_password_strength(password: str) -> bool:
    """Valida força da senha (mínimo 8 caracteres)"""
    return len(password) >= 8

# --- Funções para controle de acesso baseado em grupos ---
async def get_user_accessible_groups(user: UserProfile) -> List[int]:
    """Retorna os grupos que o usuário pode acessar"""
    if user.role == 'admin':
        # Admin geral acessa todos os grupos
        response = await asyncio.to_thread(
            supabase.table('grupos').select('id').execute
        )
        return [group['id'] for group in response.data] if response.data else []
    else:
        # Subadmin acessa apenas seus grupos designados
        return user.managed_groups

async def get_group_users_count(group_id: int) -> int:
    """Retorna a quantidade de usuários ativos em um grupo"""
    try:
        today = date.today().isoformat()
        response = await asyncio.to_thread(
            supabase.table('user_groups')
            .select('user_id', count='exact')
            .eq('group_id', group_id)
            .gte('data_expiracao', today)
            .execute
        )
        return response.count or 0
    except Exception as e:
        logging.error(f"Erro ao contar usuários do grupo {group_id}: {e}")
        return 0

async def get_user_groups_info(user_id: str) -> List[dict]:
    """Retorna informações detalhadas sobre os grupos do usuário"""
    try:
        response = await asyncio.to_thread(
            supabase.table('user_groups')
            .select('group_id, data_expiracao, grupos(nome, dias_acesso)')
            .eq('user_id', user_id)
            .execute
        )
        
        groups_info = []
        for item in response.data:
            group_data = item.get('grupos', {})
            groups_info.append({
                'group_id': item['group_id'],
                'group_name': group_data.get('nome', 'N/A'),
                'data_expiracao': item['data_expiracao'],
                'dias_acesso': group_data.get('dias_acesso', 0)
            })
        
        return groups_info
    except Exception as e:
        logging.error(f"Erro ao buscar grupos do usuário {user_id}: {e}")
        return []

# Inicializar logging
setup_logging()
