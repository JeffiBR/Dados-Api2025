# main.py (completo e corrigido com as novas permissões) - VERSÃO 3.4.3
import os
import asyncio
from datetime import date, timedelta, datetime
import logging
from fastapi import FastAPI, BackgroundTasks, HTTPException, Query, Depends, Header, Request
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from supabase import create_client, Client
from postgrest.exceptions import APIError
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import pandas as pd
import collector_service
from dashboard_routes import dashboard_router

# Importar dependências compartilhadas e rotas de subadministradores
from dependencies import (
    get_current_user, get_current_user_optional, require_page_access, 
    UserProfile, supabase, supabase_admin, calcular_data_expiracao,
    update_group_members_expiration, renew_group_access, get_group_statistics
)
from group_admin_routes import group_admin_router

# --------------------------------------------------------------------------
# --- 1. CONFIGURAÇÕES INICIAIS E VARIÁVEIS DE AMBIENTE ---
# --------------------------------------------------------------------------
load_dotenv()
app = FastAPI(
    title="Preço Em Foco",
    description="Sistema completo para coleta e análise de preços de supermercados.",
    version="3.4.3"
)
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] %(message)s')

# --- Carregamento e Validação das Variáveis de Ambiente ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SERVICE_ROLE_KEY = os.getenv("SERVICE_ROLE_KEY")
ECONOMIZA_ALAGOAS_TOKEN = os.getenv("ECONOMIZA_ALAGOAS_TOKEN")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://127.0.0.1:5500,http://localhost:8000").split(',')

if not all([SUPABASE_URL, SUPABASE_KEY, SERVICE_ROLE_KEY, ECONOMIZA_ALAGOAS_TOKEN]):
    logging.error("Variáveis de ambiente essenciais (SUPABASE_URL, SUPABASE_KEY, SERVICE_ROLE_KEY, ECONOMIZA_ALAGOAS_TOKEN) não estão definidas. Verifique seu arquivo .env")
    exit(1)

# --------------------------------------------------------------------------
# --- 2. TRATAMENTO DE ERROS CENTRALIZADO ---
# --------------------------------------------------------------------------
@app.exception_handler(APIError)
async def handle_supabase_errors(request: Request, exc: APIError):
    logging.error(f"Erro do Supabase na rota {request.url.path}: {exc.message} (Código: {exc.code})")
    return JSONResponse(
        status_code=400,
        content={"detail": f"Erro de comunicação com o banco de dados: {exc.message}"},
    )

# --------------------------------------------------------------------------
# --- 3. MIDDLEWARES E CONFIGURAÇÕES GLOBAIS ---
# --------------------------------------------------------------------------

# Incluir rotas de subadministradores
app.include_router(group_admin_router)

# Incluir rotas do dashboard
app.include_router(dashboard_router)

initial_status = {
    "status": "IDLE", "startTime": None, "progressPercent": 0, "etaSeconds": 0,
    "currentMarket": "", "totalMarkets": 0, "marketsProcessed": 0,
    "currentProduct": "", "totalProducts": 0, "productsProcessedInMarket": 0,
    "totalItemsFound": 0, "progresso": "Aguardando início", "report": None
}
collection_status: Dict[str, Any] = initial_status.copy()

app.add_middleware(
    CORSMiddleware, 
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True, 
    allow_methods=["*"], 
    allow_headers=["*"]
)

# --------------------------------------------------------------------------
# --- 4. MODELOS DE DADOS (PYDANTIC) ---
# --------------------------------------------------------------------------
class Categoria(BaseModel):
    id: Optional[int] = None
    nome: str
    palavras_chave: List[str]
    regra_unidade: Optional[str] = None

class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = Field(default="user")
    allowed_pages: List[str] = []
    managed_groups: Optional[List[int]] = Field(None, description="IDs dos grupos que o admin de grupo pode gerenciar")

class UserUpdate(BaseModel):
    full_name: str
    role: str
    allowed_pages: List[str]
    managed_groups: Optional[List[int]] = Field(None, description="IDs dos grupos que o admin de grupo pode gerenciar")

class ProfileUpdateWithCredentials(BaseModel):
    full_name: Optional[str] = None
    job_title: Optional[str] = None
    avatar_url: Optional[str] = None
    email: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

    class Config:
        extra = "ignore" 

class Supermercado(BaseModel):
    id: Optional[int] = None
    nome: str
    cnpj: str
    endereco: Optional[str] = None

class RealtimeSearchRequest(BaseModel):
    produto: str
    cnpjs: List[str]

class PriceHistoryRequest(BaseModel):
    product_identifier: str
    cnpjs: List[str]
    end_date: date = Field(default_factory=date.today)
    start_date: date = Field(default_factory=lambda: date.today() - timedelta(days=29))

class PruneByCollectionsRequest(BaseModel):
    cnpj: str
    collection_ids: List[int]

class LogDeleteRequest(BaseModel):
    date: Optional[date] = None
    user_id: Optional[str] = None

class CustomActionRequest(BaseModel):
    action_type: str
    page: str
    details: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str

# NOVOS MODELOS PARA CESTA BÁSICA
class CestaItem(BaseModel):
    nome_produto: str = Field(..., max_length=150)
    codigo_barras: Optional[str] = Field(None, max_length=50)

class CestaCreate(BaseModel):
    nome: str = Field(..., max_length=100)
    produtos: List[CestaItem] = Field(default_factory=list, max_items=25)

class CestaUpdate(BaseModel):
    nome: Optional[str] = Field(None, max_length=100)

class CestaUpdateItem(BaseModel):
    nome_produto: Optional[str] = Field(None, max_length=150)
    codigo_barras: Optional[str] = Field(None, max_length=50)

class Cesta(CestaCreate):
    id: Optional[int] = None
    user_id: str

# MODELO PARA COLETA PERSONALIZADA - CORRIGIDO
class CollectionRequest(BaseModel):
    selected_markets: Optional[List[str]] = Field(None, description="Lista de CNPJs dos mercados a coletar (vazio = todos)")
    dias_pesquisa: Optional[int] = Field(None, ge=1, le=7, description="Número de dias para pesquisa (1 a 7)")
    days: Optional[int] = Field(None, ge=1, le=7, description="Campo alternativo para dias")

    # ✅ CORREÇÃO: Usar 'days' se 'dias_pesquisa' não for fornecido
    def get_dias_pesquisa(self):
        return self.dias_pesquisa if self.dias_pesquisa is not None else (self.days if self.days is not None else 3)

# --- MODELOS PARA GRUPOS ---
class GrupoBase(BaseModel):
    nome: str = Field(..., max_length=100)
    dias_acesso: int = Field(30, ge=1, le=365)
    descricao: Optional[str] = None

class GrupoCreate(GrupoBase):
    pass

class Grupo(GrupoBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class UserGroupBase(BaseModel):
    user_id: str
    group_id: int

class UserGroupCreate(UserGroupBase):
    data_expiracao: Optional[date] = None

class UserGroup(UserGroupBase):
    id: int
    data_expiracao: date
    created_at: datetime

    class Config:
        from_attributes = True

class UserGroupWithDetails(UserGroup):
    grupo_nome: str
    grupo_dias_acesso: int
    user_name: Optional[str] = None
    user_email: Optional[str] = None

# MODELO PARA RENOVAÇÃO DE ACESSO
class UserRenewRequest(BaseModel):
    dias_adicionais: int = Field(..., ge=1, le=365)

# --------------------------------------------------------------------------
# --- 5. FUNÇÕES DE LOG ---
# --------------------------------------------------------------------------
def log_search(term: str, type: str, cnpjs: Optional[List[str]], count: int, user: Optional[UserProfile] = None):
    """Função para registrar logs de busca, rodando em background."""
    try:
        user_id = user.id if user else None
        user_name = None
        user_email = None

        if user_id:
            try:
                profile_response = supabase_admin.table('profiles').select('full_name').eq('id', user_id).single().execute()
                if profile_response.data:
                    user_name = profile_response.data.get('full_name')

                auth_response = supabase_admin.auth.admin.get_user_by_id(user_id)
                if auth_response.user:
                    user_email = auth_response.user.email
                    if not user_name:
                        user_name = user_email
            except Exception as e:
                logging.error(f"Erro ao buscar informações do usuário {user_id}: {e}")

        log_data = {
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "action_type": "search" if type == 'database' else "realtime_search",
            "search_term": term,
            "selected_markets": cnpjs if cnpjs else [],
            "result_count": count
        }

        supabase_admin.table('log_de_usuarios').insert(log_data).execute()
        logging.info(f"Log de busca salvo para usuário {user_id}: {term}")

    except Exception as e: 
        logging.error(f"Erro ao salvar log de busca: {e}")

def log_page_access(page_key: str, user: UserProfile):
    """Função para registrar o acesso à página, rodando em background."""
    try:
        user_name = None
        user_email = None

        if user.id:
            try:
                profile_response = supabase_admin.table('profiles').select('full_name').eq('id', user.id).single().execute()
                if profile_response.data:
                    user_name = profile_response.data.get('full_name')

                auth_response = supabase_admin.auth.admin.get_user_by_id(user.id)
                if auth_response.user:
                    user_email = auth_response.user.email
                    if not user_name:
                        user_name = user_email
            except Exception as e:
                logging.error(f"Erro ao buscar informações do usuário {user.id}: {e}")

        log_data = {
            "user_id": user.id,
            "user_name": user_name,
            "user_email": user_email,
            "action_type": "access",
            "page_accessed": page_key,
        }
        supabase_admin.table('log_de_usuarios').insert(log_data).execute()
        logging.info(f"Log de acesso salvo para usuário {user.id}: {page_key}")
    except Exception as e:
        logging.error(f"Erro ao salvar log de acesso à página {page_key} para {user.id}: {e}")

def log_custom_action_internal(request: CustomActionRequest, user: Optional[UserProfile]):
    """Função interna para registrar ações customizadas."""
    try:
        user_id = user.id if user else None
        user_name = None
        user_email = None

        if user_id:
            try:
                profile_response = supabase_admin.table('profiles').select('full_name').eq('id', user_id).single().execute()
                if profile_response.data:
                    user_name = profile_response.data.get('full_name')

                auth_response = supabase_admin.auth.admin.get_user_by_id(user_id)
                if auth_response.user:
                    user_email = auth_response.user.email
                    if not user_name:
                        user_name = user_email
            except Exception as e:
                logging.error(f"Erro ao buscar informações do usuário {user_id}: {e}")

        log_data = {
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "action_type": request.action_type,
            "page_accessed": request.page,
            "details": request.details,
            "created_at": request.timestamp
        }

        supabase_admin.table('log_de_usuarios').insert(log_data).execute()
        logging.info(f"Ação customizada registrada: {request.action_type} para usuário {user_id}")

    except Exception as e:
        logging.error(f"Erro ao salvar ação customizada: {e}")

# --------------------------------------------------------------------------
# --- 6. ENDPOINTS DA APLICAÇÃO ---
# --------------------------------------------------------------------------

# --- Gerenciamento de Perfil Pessoal ---
@app.get("/api/users/me")
async def get_my_profile(current_user: UserProfile = Depends(get_current_user)):
    try:
        response = await asyncio.to_thread(
            supabase.table('profiles').select('*').eq('id', current_user.id).single().execute
        )

        profile_data = response.data

        if profile_data:
            profile_data['email'] = current_user.email

            # Adicionar grupos gerenciados se for admin de grupo
            if current_user.role == 'group_admin' or current_user.managed_groups:
                try:
                    from dependencies import get_user_managed_groups
                    managed_groups = await get_user_managed_groups(current_user.id)
                    profile_data['managed_groups'] = managed_groups
                except Exception as e:
                    logging.error(f"Erro ao buscar grupos gerenciados: {e}")
                    profile_data['managed_groups'] = []
            else:
                profile_data['managed_groups'] = []

        else:
            raise HTTPException(status_code=404, detail="Perfil do usuário não encontrado.")

        return profile_data

    except Exception as e:
        logging.error(f"Erro ao buscar o perfil do usuário: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erro interno ao carregar o perfil do usuário.")

@app.put("/api/users/me")
async def update_my_profile(profile_data: ProfileUpdateWithCredentials, current_user: UserProfile = Depends(get_current_user)):
    try:
        profile_update_data = {}

        if profile_data.full_name is not None:
            profile_update_data['full_name'] = profile_data.full_name
        if profile_data.job_title is not None:
            profile_update_data['job_title'] = profile_data.job_title
        if profile_data.avatar_url is not None:
            profile_update_data['avatar_url'] = profile_data.avatar_url

        if profile_data.email or profile_data.new_password:
            if not profile_data.current_password:
                raise HTTPException(status_code=400, detail="Senha atual é necessária para alterar e-mail ou senha.")
            try:
                await asyncio.to_thread(
                    lambda: supabase.auth.sign_in_with_password({
                        "email": current_user.email,
                        "password": profile_data.current_password
                    })
                )
            except Exception:
                raise HTTPException(status_code=400, detail="Senha atual incorreta.")

            if profile_data.email and profile_data.email != current_user.email:
                await asyncio.to_thread(lambda: supabase.auth.update_user({"email": profile_data.email}))
            if profile_data.new_password:
                await asyncio.to_thread(lambda: supabase.auth.update_user({"password": profile_data.new_password}))

        if profile_update_data:
            logging.info(f"Atualizando perfil {current_user.id} com os dados: {profile_update_data}")
            response = await asyncio.to_thread(
                lambda: supabase.table('profiles').update(profile_update_data).eq('id', current_user.id).execute()
            )
            if response.data:
                return response.data[0]

        response = await asyncio.to_thread(
            lambda: supabase.table('profiles').select('*').eq('id', current_user.id).single().execute()
        )
        return response.data

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro CRÍTICO ao atualizar perfil: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno ao atualizar perfil: {str(e)}")

# --- Gerenciamento de Usuários ---
@app.post("/api/users")
async def create_user(user_data: UserCreate, admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        logging.info(f"Admin {admin_user.id} tentando criar usuário: {user_data.email}")
        print(f"DEBUG: Dados recebidos para criar usuário: {user_data}")

        # Verificar se é admin de grupo
        if user_data.role == "group_admin" and not user_data.managed_groups:
            raise HTTPException(status_code=400, detail="Admin de grupo deve ter pelo menos um grupo associado.")

        created_user_res = await asyncio.to_thread(
            lambda: supabase_admin.auth.admin.create_user({
                "email": user_data.email, "password": user_data.password,
                "email_confirm": True, "user_metadata": {'full_name': user_data.full_name}
            })
        )

        user_id = created_user_res.user.id
        logging.info(f"Usuário criado no Auth com ID: {user_id}")

        # Atualizar perfil com role e páginas permitidas
        profile_update_response = await asyncio.to_thread(
            supabase_admin.table('profiles').update({
                'role': user_data.role, 
                'allowed_pages': user_data.allowed_pages,
                'full_name': user_data.full_name
            }).eq('id', user_id).execute
        )

        if not profile_update_response.data:
             logging.warning(f"Usuário {user_id} foi criado no Auth, mas o perfil não foi encontrado para atualizar.")
             raise HTTPException(status_code=404, detail="Usuário criado, mas o perfil não foi encontrado para definir as permissões.")

        # Se for admin de grupo, criar registro na tabela group_admins
        if user_data.role == "group_admin" and user_data.managed_groups:
            admin_record = {
                'user_id': user_id,
                'group_ids': user_data.managed_groups
            }
            await asyncio.to_thread(
                supabase_admin.table('group_admins').insert(admin_record).execute
            )
            logging.info(f"Admin de grupo criado com ID {user_id} para grupos: {user_data.managed_groups}")

        logging.info(f"Perfil do usuário {user_id} atualizado com a role: {user_data.role}")
        return {"message": "Usuário criado com sucesso"}
    except APIError as e:
        logging.error(f"Erro da API do Supabase ao criar usuário: {e}")
        raise HTTPException(status_code=400, detail=f"Erro do Supabase: {e.message}")
    except Exception as e:
        logging.error(f"Falha CRÍTICA ao criar usuário: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro interno inesperado no servidor: {str(e)}")

@app.put("/api/users/{user_id}")
async def update_user(user_id: str, user_data: UserUpdate, admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        print(f"DEBUG: Atualizando usuário {user_id} com dados: {user_data}")

        # Verificar se o usuário existe
        user_resp = await asyncio.to_thread(
            lambda: supabase.table('profiles').select('id, role, allowed_pages, full_name').eq('id', user_id).execute()
        )
        if not user_resp.data:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")

        print(f"DEBUG: Usuário encontrado: {user_resp.data[0]}")

        # Atualizar perfil - FORMA CORRETA de verificar erro
        profile_update_data = {
            'full_name': user_data.full_name,
            'role': user_data.role,
            'allowed_pages': user_data.allowed_pages
        }

        print(f"DEBUG: Dados de atualização do perfil: {profile_update_data}")

        # CORREÇÃO: Usar supabase_admin para operações de atualização
        profile_response = await asyncio.to_thread(
            lambda: supabase_admin.table('profiles').update(profile_update_data).eq('id', user_id).execute()
        )

        # CORREÇÃO: Verificar erro da forma correta para a biblioteca Supabase
        if hasattr(profile_response, 'error') and profile_response.error:
            error_msg = getattr(profile_response.error, 'message', str(profile_response.error))
            print(f"DEBUG: Erro ao atualizar perfil: {error_msg}")
            raise HTTPException(status_code=400, detail=f"Erro ao atualizar perfil: {error_msg}")

        print(f"DEBUG: Perfil atualizado com sucesso: {profile_response.data}")

        # Gerenciar grupos de admin
        if user_data.role == "group_admin":
            print(f"DEBUG: Configurando admin de grupo com grupos: {user_data.managed_groups}")

            if user_data.managed_groups:
                # Verificar se todos os grupos existem
                groups_response = await asyncio.to_thread(
                    lambda: supabase.table('grupos').select('id').in_('id', user_data.managed_groups).execute()
                )
                existing_group_ids = [group['id'] for group in groups_response.data]
                invalid_groups = set(user_data.managed_groups) - set(existing_group_ids)

                if invalid_groups:
                    raise HTTPException(status_code=404, detail=f"Grupos não encontrados: {invalid_groups}")

            # Verificar se já existe registro
            existing_admin = await asyncio.to_thread(
                lambda: supabase.table('group_admins').select('*').eq('user_id', user_id).execute()
            )

            admin_record = {
                'user_id': user_id,
                'group_ids': user_data.managed_groups or [],
                'updated_at': datetime.now().isoformat()
            }

            if existing_admin.data:
                # Atualizar
                update_result = await asyncio.to_thread(
                    lambda: supabase.table('group_admins').update(admin_record).eq('user_id', user_id).execute()
                )
                if hasattr(update_result, 'error') and update_result.error:
                    error_msg = getattr(update_result.error, 'message', str(update_result.error))
                    print(f"DEBUG: Erro ao atualizar group_admins: {error_msg}")
                else:
                    print(f"DEBUG: Group admin atualizado: {update_result.data}")
            else:
                # Criar novo
                insert_result = await asyncio.to_thread(
                    lambda: supabase.table('group_admins').insert(admin_record).execute()
                )
                if hasattr(insert_result, 'error') and insert_result.error:
                    error_msg = getattr(insert_result.error, 'message', str(insert_result.error))
                    print(f"DEBUG: Erro ao criar group_admins: {error_msg}")
                else:
                    print(f"DEBUG: Group admin criado: {insert_result.data}")
        elif user_data.role != "group_admin":
            print("DEBUG: Removendo de group_admins (não é mais admin de grupo)")
            # Remover da tabela group_admins se não for mais admin de grupo
            delete_result = await asyncio.to_thread(
                lambda: supabase.table('group_admins').delete().eq('user_id', user_id).execute()
            )
            if hasattr(delete_result, 'error') and delete_result.error:
                error_msg = getattr(delete_result.error, 'message', str(delete_result.error))
                print(f"DEBUG: Erro ao remover group_admins: {error_msg}")

        print("DEBUG: Usuário atualizado com sucesso")
        return {"message": "Usuário atualizado com sucesso"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: Erro detalhado ao atualizar usuário: {str(e)}")
        logging.error(f"Erro ao atualizar usuário: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar usuário: {str(e)}")

@app.get("/api/users")
async def list_users(admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        profiles_response = await asyncio.to_thread(
            supabase.table('profiles').select(
                'id, full_name, role, allowed_pages, avatar_url'
            ).execute
        )
        profiles = profiles_response.data or []

        users = []
        for profile in profiles:
            email = None
            try:
                auth_response = await asyncio.to_thread(
                    lambda: supabase_admin.auth.admin.get_user_by_id(profile['id'])
                )
                if auth_response.user:
                    email = auth_response.user.email
            except Exception as e:
                logging.error(f"Erro ao buscar e-mail do usuário {profile['id']}: {e}")

            # Buscar grupos gerenciados se for admin de grupo
            managed_groups = []
            if profile.get('role') == 'group_admin':
                try:
                    admin_response = await asyncio.to_thread(
                        supabase_admin.table('group_admins').select('group_ids').eq('user_id', profile['id']).execute
                    )
                    if admin_response.data:
                        managed_groups = admin_response.data[0].get('group_ids', [])
                except Exception as e:
                    logging.error(f"Erro ao buscar grupos gerenciados: {e}")

            users.append({
                "id": profile["id"],
                "full_name": profile.get("full_name"),
                "role": profile.get("role"),
                "allowed_pages": profile.get("allowed_pages"),
                "avatar_url": profile.get("avatar_url"),
                "email": email or "N/A",
                "managed_groups": managed_groups
            })

        return users

    except Exception as e:
        logging.error(f"Erro ao listar usuários: {e}")
        raise HTTPException(status_code=500, detail="Erro interno ao listar usuários")

# NOVO ENDPOINT: Buscar usuário por ID
@app.get("/api/users/{user_id}")
async def get_user(
    user_id: str, 
    admin_user: UserProfile = Depends(require_page_access('users'))
):
    """Busca um usuário específico por ID"""
    try:
        print(f"DEBUG: Buscando usuário {user_id}")

        # Buscar perfil do usuário
        profile_response = await asyncio.to_thread(
            supabase.table('profiles').select('*').eq('id', user_id).single().execute
        )

        if not profile_response.data:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")

        profile = profile_response.data
        print(f"DEBUG: Perfil encontrado: {profile}")

        # Buscar email do usuário
        email = None
        try:
            auth_response = await asyncio.to_thread(
                lambda: supabase_admin.auth.admin.get_user_by_id(user_id)
            )
            if auth_response.user:
                email = auth_response.user.email
        except Exception as e:
            logging.error(f"Erro ao buscar email do usuário {user_id}: {e}")

        # Buscar grupos gerenciados se for admin de grupo
        managed_groups = []
        if profile.get('role') == 'group_admin':
            try:
                admin_response = await asyncio.to_thread(
                    supabase_admin.table('group_admins').select('group_ids').eq('user_id', user_id).execute
                )
                if admin_response.data:
                    managed_groups = admin_response.data[0].get('group_ids', [])
            except Exception as e:
                logging.error(f"Erro ao buscar grupos gerenciados: {e}")

        user_data = {
            "id": user_id,
            "full_name": profile.get('full_name'),
            "role": profile.get('role'),
            "allowed_pages": profile.get('allowed_pages', []),
            "email": email,
            "managed_groups": managed_groups
        }

        print(f"DEBUG: Dados do usuário preparados: {user_data}")
        return user_data

    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: Erro ao buscar usuário: {str(e)}")
        logging.error(f"Erro ao buscar usuário {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao buscar usuário: {str(e)}")

@app.delete("/api/users/{user_id}", status_code=204)
async def delete_user(user_id: str, admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        # Remover de group_admins se existir
        await asyncio.to_thread(
            lambda: supabase_admin.table('group_admins').delete().eq('user_id', user_id).execute()
        )

        # Deletar usuário
        await asyncio.to_thread(
            lambda: supabase_admin.auth.admin.delete_user(user_id)
        )
        logging.info(f"Usuário com ID {user_id} foi excluído pelo admin {admin_user.id}")
        return
    except Exception as e:
        logging.error(f"Falha ao excluir usuário {user_id}: {e}")
        raise HTTPException(status_code=400, detail="Não foi possível excluir o usuário.")

# --- Gerenciamento de Categorias ---
@app.get("/api/categories", response_model=List[Categoria])
async def list_categories(user: UserProfile = Depends(get_current_user)):
    resp = await asyncio.to_thread(
        supabase.table('categorias').select('*').order('nome').execute
    )
    return resp.data

@app.post("/api/categories", response_model=Categoria)
async def create_category(categoria: Categoria, admin_user: UserProfile = Depends(require_page_access('users'))):
    resp = await asyncio.to_thread(
        supabase.table('categorias').insert(categoria.dict(exclude={'id'})).execute
    )
    return resp.data[0]

@app.put("/api/categories/{id}", response_model=Categoria)
async def update_category(id: int, categoria: Categoria, admin_user: UserProfile = Depends(require_page_access('users'))):
    resp = await asyncio.to_thread(
        supabase.table('categorias').update(categoria.dict(exclude={'id', 'created_at'})).eq('id', id).execute
    )
    if not resp.data: 
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return resp.data[0]

@app.delete("/api/categories/{id}", status_code=204)
async def delete_category(id: int, admin_user: UserProfile = Depends(require_page_access('users'))):
    await asyncio.to_thread(
        lambda: supabase.table('categorias').delete().eq('id', id).execute()
    )
    return

# --- Gerenciamento da Coleta ---
@app.post("/api/trigger-collection")
async def trigger_collection(
    request: CollectionRequest, 
    background_tasks: BackgroundTasks, 
    user: UserProfile = Depends(require_page_access('coleta'))
):
    if collection_status["status"] == "RUNNING":
        raise HTTPException(status_code=409, detail="A coleta de dados já está em andamento.")

    collection_status.update(initial_status.copy())

    dias_pesquisa = request.get_dias_pesquisa()

    logging.info(f"🎯 SOLICITAÇÃO DE COLETA RECEBIDA - Dias: {dias_pesquisa}, Mercados: {len(request.selected_markets) if request.selected_markets else 'todos'}")

    if request.selected_markets:
        resp = await asyncio.to_thread(
            supabase.table('supermercados').select('cnpj').in_('cnpj', request.selected_markets).execute
        )
        existing_markets = [market['cnpj'] for market in resp.data]
        invalid_markets = set(request.selected_markets) - set(existing_markets)

        if invalid_markets:
            logging.warning(f"Mercados inválidos selecionados: {invalid_markets}")

    background_tasks.add_task(
        collector_service.run_full_collection, 
        supabase_admin, 
        ECONOMIZA_ALAGOAS_TOKEN, 
        collection_status,
        request.selected_markets,
        dias_pesquisa
    )

    market_count = len(request.selected_markets) if request.selected_markets else "todos"
    return {
        "message": f"Processo de coleta iniciado para {market_count} mercados ({dias_pesquisa} dias)."
    }

@app.get("/api/collection-status")
async def get_collection_status(user: UserProfile = Depends(get_current_user)):
    return collection_status

# --- Gerenciamento de Supermercados ---
@app.get("/api/supermarkets", response_model=List[Supermercado])
async def list_supermarkets_admin(user: UserProfile = Depends(get_current_user)):
    resp = await asyncio.to_thread(
        supabase.table('supermercados').select('id, nome, cnpj, endereco').order('nome').execute
    )
    return resp.data

@app.post("/api/supermarkets", status_code=201, response_model=Supermercado)
async def create_supermarket(market: Supermercado, user: UserProfile = Depends(require_page_access('markets'))):
    market_data = market.dict(exclude={'id'})
    market_data = {k: v for k, v in market_data.items() if v is not None}

    resp = await asyncio.to_thread(
        supabase.table('supermercados').insert(market_data).execute
    )
    return resp.data[0]

@app.put("/api/supermarkets/{id}", response_model=Supermercado)
async def update_supermarket(id: int, market: Supermercado, user: UserProfile = Depends(require_page_access('markets'))):
    market_data = market.dict(exclude={'id'})
    market_data = {k: v for k, v in market_data.items() if v is not None}

    resp = await asyncio.to_thread(
        supabase.table('supermercados').update(market_data).eq('id', id).execute
    )
    if not resp.data: 
        raise HTTPException(status_code=404, detail="Mercado não encontrada")
    return resp.data[0]

@app.delete("/api/supermarkets/{id}", status_code=204)
async def delete_supermarket(id: int, user: UserProfile = Depends(require_page_access('markets'))):
    await asyncio.to_thread(
        lambda: supabase.table('supermercados').delete().eq('id', id).execute()
    )
    return

# --- Endpoint Público de Supermercados ---
@app.get("/api/supermarkets/public", response_model=List[Supermercado])
async def list_supermarkets_public():
    resp = await asyncio.to_thread(
        supabase.table('supermercados').select('id, nome, cnpj, endereco').order('nome').execute
    )
    return resp.data

# --- Gerenciamento de Dados Históricos ---
@app.get("/api/collections")
async def list_collections(user: UserProfile = Depends(require_page_access('collections'))):
    response = await asyncio.to_thread(
        supabase.table('coletas').select('*').order('iniciada_em', desc=True).execute
    )
    return response.data

@app.get("/api/collections/{collection_id}/details")
async def get_collection_details(collection_id: int, user: UserProfile = Depends(require_page_access('collections'))):
    response = await asyncio.to_thread(
        lambda: supabase.rpc('get_collection_details', {'p_coleta_id': collection_id}).execute()
    )
    return response.data

@app.delete("/api/collections/{collection_id}", status_code=204)
async def delete_collection(collection_id: int, user: UserProfile = Depends(require_page_access('collections'))):
    await asyncio.to_thread(
        lambda: supabase.table('coletas').delete().eq('id', collection_id).execute()
    )
    return

@app.post("/api/prune-by-collections")
async def prune_by_collections(request: PruneByCollectionsRequest, user: UserProfile = Depends(require_page_access('prune'))):
    if not request.collection_ids:
        raise HTTPException(status_code=400, detail="Pelo menos uma coleta deve ser selecionada.")
    response = await asyncio.to_thread(
        lambda: supabase.table('produtos').delete().eq('cnpj_supermercado', request.cnpj).in_('coleta_id', request.collection_ids).execute()
    )
    deleted_count = len(response.data) if response.data else 0
    logging.info(f"Limpeza de dados: {deleted_count} registros apagados para o CNPJ {request.cnpj} das coletas {request.collection_ids}.")
    return {"message": "Operação de limpeza concluída com sucesso.", "deleted_count": deleted_count}

@app.get("/api/collections-by-market/{cnpj}")
async def get_collections_by_market(cnpj: str, user: UserProfile = Depends(require_page_access('prune'))):
    response = await asyncio.to_thread(
        lambda: supabase.rpc('get_collections_for_market', {'market_cnpj': cnpj}).execute()
    )
    return response.data

# --- LOGS DE USUÁRIOS ---
@app.get("/api/user-logs")
async def get_user_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    user: UserProfile = Depends(require_page_access('user_logs'))
):
    try:
        start_index = (page - 1) * page_size
        end_index = start_index + page_size - 1

        query = supabase.table('log_de_usuarios').select('*', count='exact')

        if user_id:
            query = query.eq('user_id', user_id)
        if date:
            query = query.gte('created_at', f'{date}T00:00:00').lte('created_at', f'{date}T23:59:59')
        if action_type:
            query = query.eq('action_type', action_type)

        response = await asyncio.to_thread(
            query.order('created_at', desc=True).range(start_index, end_index).execute
        )

        user_logs = []
        for log in response.data:
            user_logs.append({
                'id': log['id'],
                'user_id': log.get('user_id'),
                'user_name': log.get('user_name') or 'N/A',
                'user_email': log.get('user_email') or 'N/A',
                'action_type': log.get('action_type'),
                'search_term': log.get('search_term'),
                'selected_markets': log.get('selected_markets') or [],
                'result_count': log.get('result_count'),
                'page_accessed': log.get('page_accessed'),
                'created_at': log.get('created_at')
            })

        return {
            "data": user_logs,
            "total_count": response.count or 0,
            "page": page,
            "page_size": page_size
        }
    except Exception as e:
        logging.error(f"Erro ao buscar logs de usuários: {e}")
        raise HTTPException(status_code=500, detail=f"Erro interno ao buscar logs: {str(e)}")

@app.delete("/api/user-logs/{log_id}")
async def delete_single_log(log_id: int, user: UserProfile = Depends(require_page_access('user_logs'))):
    try:
        response = await asyncio.to_thread(
            lambda: supabase.table('log_de_usuarios').delete().eq('id', log_id).execute()
        )
        deleted_count = len(response.data) if response.data else 0
        return {"message": "Log excluído com sucesso", "deleted_count": deleted_count}
    except Exception as e:
        logging.error(f"Erro ao deletar log {log_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao deletar log: {str(e)}")

@app.delete("/api/user-logs")
async def delete_user_logs(
    user_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    user: UserProfile = Depends(require_page_access('user_logs'))
):
    try:
        query = supabase.table('log_de_usuarios').delete()

        if user_id:
            query = query.eq('user_id', user_id)
        if date:
            query = query.gte('created_at', f'{date}T00:00:00').lte('created_at', f'{date}T23:59:59')

        response = await asyncio.to_thread(
            query.execute
        )
        deleted_count = len(response.data) if response.data else 0
        return {"message": "Logs excluídos com sucesso", "deleted_count": deleted_count}
    except Exception as e:
        logging.error(f"Erro ao deletar logs em lote: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao deletar logs: {str(e)}")

@app.get("/api/user-logs/export")
async def export_user_logs(
    user_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    user: UserProfile = Depends(require_page_access('user_logs'))
):
    try:
        import csv
        import io

        query = supabase.table('log_de_usuarios').select('*')

        if user_id:
            query = query.eq('user_id', user_id)
        if date:
            query = query.gte('created_at', f'{date}T00:00:00').lte('created_at', f'{date}T23:59:59')
        if action_type:
            query = query.eq('action_type', action_type)

        response = await asyncio.to_thread(
            query.order('created_at', desc=True).execute
        )

        if not response.data:
            raise HTTPException(status_code=404, detail="Nenhum log encontrado para exportação")

        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow(['ID', 'Usuário', 'Email', 'Ação', 'Termo Pesquisado', 'Mercados', 'Resultados', 'Página Acessada', 'Data/Hora'])

        for log in response.data:
            writer.writerow([
                log['id'],
                log.get('user_name', ''),
                log.get('user_email', ''),
                log.get('action_type', ''),
                log.get('search_term', ''),
                ', '.join(log.get('selected_markets', [])),
                log.get('result_count', ''),
                log.get('page_accessed', ''),
                log.get('created_at', '')
            ])

        content = output.getvalue()
        output.close()

        return Response(
            content=content,
            media_type='text/csv',
            headers={'Content-Disposition': f'attachment; filename=user_logs_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'}
        )
    except Exception as e:
        logging.error(f"Erro ao exportar logs: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao exportar logs: {str(e)}")

@app.post("/api/user-logs/delete-by-date")
async def delete_logs_by_date(
    request: LogDeleteRequest,
    user: UserProfile = Depends(require_page_access('user_logs'))
):
    if not request.date:
        raise HTTPException(status_code=400, detail="Data é obrigatória para esta operação.")

    try:
        response = await asyncio.to_thread(
            lambda: supabase.table('log_de_usuarios').delete().lte('created_at', request.date.isoformat()).execute()
        )
        deleted_count = len(response.data) if response.data else 0
        return {"message": f"Logs até a data {request.date.isoformat()} deletados com sucesso.", "deleted_count": deleted_count}
    except Exception as e:
        logging.error(f"Erro ao deletar logs por data: {e}")
        raise HTTPException(status_code=500, detail="Erro ao deletar logs.")

# --- NOVOS ENDPOINTS PARA MONITORAMENTO COMPLETO ---
@app.post("/api/log-page-access")
async def log_page_access_endpoint(
    request: dict,
    background_tasks: BackgroundTasks,
    current_user: UserProfile = Depends(get_current_user)
):
    page_key = request.get('page_key')
    if not page_key:
        raise HTTPException(status_code=400, detail="page_key é obrigatório")

    background_tasks.add_task(log_page_access, page_key, current_user)
    return {"message": "Log de acesso registrado"}

@app.post("/api/log-custom-action")
async def log_custom_action(
    request: CustomActionRequest,
    background_tasks: BackgroundTasks,
    current_user: UserProfile = Depends(get_current_user_optional)
):
    background_tasks.add_task(log_custom_action_internal, request, current_user)
    return {"message": "Ação customizada registrada"}

@app.get("/api/usage-statistics")
async def get_usage_statistics(
    start_date: date = Query(..., description="Data de início (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    user: UserProfile = Depends(require_page_access('user_logs'))
):
    try:
        page_stats_response = await asyncio.to_thread(
            lambda: supabase_admin.table('log_de_usuarios') \
                .select('page_accessed', count='exact') \
                .eq('action_type', 'access') \
                .gte('created_at', str(start_date)) \
                .lte('created_at', f'{end_date} 23:59:59') \
                .execute()
        )

        active_users_response = await asyncio.to_thread(
            lambda: supabase_admin.table('log_de_usuarios') \
                .select('user_id', count='exact') \
                .gte('created_at', str(start_date)) \
                .lte('created_at', f'{end_date} 23:59:59') \
                .execute()
        )

        top_actions_response = await asyncio.to_thread(
            lambda: supabase_admin.table('log_de_usuarios') \
                .select('action_type', count='exact') \
                .gte('created_at', str(start_date)) \
                .lte('created_at', f'{end_date} 23:59:59') \
                .execute()
        )

        statistics = {
            "period": {
                "start_date": str(start_date),
                "end_date": str(end_date)
            },
            "page_access": page_stats_response.count or 0,
            "active_users": active_users_response.count or 0,
            "top_actions": top_actions_response.data or []
        }

        return statistics

    except Exception as e:
        logging.error(f"Erro ao buscar estatísticas de uso: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar estatísticas de uso")

# --- Endpoints Públicos e de Usuário Logado ---
@app.get("/api/products-log")
async def get_products_log(page: int = 1, page_size: int = 50, user: UserProfile = Depends(require_page_access('product_log'))):
    start_index = (page - 1) * page_size
    end_index = start_index + page_size - 1
    response = await asyncio.to_thread(
        supabase.table('produtos').select('*', count='exact').order('created_at', desc=True).range(start_index, end_index).execute
    )
    return {"data": response.data, "total_count": response.count}

# --- NOVOS ENDPOINTS PARA VERIFICAÇÃO DE STATUS DE ACESSO ---
@app.get("/api/user/access-status")
async def get_user_access_status(current_user: UserProfile = Depends(get_current_user)):
    """Endpoint para verificar o status de acesso do usuário - ✅ ADMIN SEM VERIFICAÇÃO"""
    try:
        # ✅ Se for admin, retorna acesso imediato sem verificar grupos
        if current_user.role == 'admin':
            return {
                'has_access': True,
                'reason': 'Usuário admin tem acesso irrestrito',
                'active_groups': [],
                'expired_groups': [],
                'is_admin': True
            }

        from dependencies import verificar_acesso_completo
        access_status = await verificar_acesso_completo(current_user.id)
        return access_status
    except Exception as e:
        logging.error(f"Erro ao verificar status de acesso: {e}")
        raise HTTPException(status_code=500, detail="Erro ao verificar status de acesso")

@app.get("/api/user/active-groups")
async def get_user_active_groups(current_user: UserProfile = Depends(get_current_user)):
    """Endpoint para obter grupos ativos do usuário - ✅ ADMIN RETORNA VAZIO"""
    try:
        # ✅ Se for admin, retorna lista vazia (não precisa de grupos)
        if current_user.role == 'admin':
            return {
                "user_id": current_user.id,
                "active_groups": [],
                "total_active": 0
            }

        from dependencies import get_user_active_groups
        active_groups = await get_user_active_groups(current_user.id)
        return {
            "user_id": current_user.id,
            "active_groups": active_groups,
            "total_active": len(active_groups)
        }
    except Exception as e:
        logging.error(f"Erro ao buscar grupos ativos: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar grupos ativos")

@app.get("/api/search")
async def search_products(
    q: str, 
    background_tasks: BackgroundTasks, 
    cnpjs: Optional[List[str]] = Query(None),
    current_user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    termo_busca = f"%{q.lower().strip()}%"
    query = supabase.table('produtos').select(
    '*, supermercados(endereco)'
).ilike('nome_produto_normalizado', termo_busca)
    if cnpjs: 
        query = query.in_('cnpj_supermercado', cnpjs)

    response = await asyncio.to_thread(
        query.limit(500).execute
    )

    background_tasks.add_task(log_search, q, 'database', cnpjs, len(response.data), current_user)

    if not response.data: 
        return {"results": []}

    df = pd.DataFrame(response.data)
    df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
    df.dropna(subset=['preco_produto'], inplace=True)

    if not df.empty:
        preco_medio = df['preco_produto'].mean()
        df['status_preco'] = df['preco_produto'].apply(
            lambda x: 'Barato' if x < preco_medio * 0.9 else ('Caro' if x > preco_medio * 1.1 else 'Na Média')
        )

    df = df.sort_values(by='preco_produto', ascending=True)
    results = df.head(100).to_dict(orient='records')
    return {"results": results}

@app.post("/api/realtime-search")
async def realtime_search(
    request: RealtimeSearchRequest, 
    background_tasks: BackgroundTasks, 
    current_user: Optional[UserProfile] = Depends(get_current_user_optional)
):
    if not request.cnpjs: 
        raise HTTPException(status_code=400, detail="Pelo menos um CNPJ deve ser fornecido.")

    # ✅ MANTIDO SEM ENDEREÇO (busca em tempo real)
    resp = await asyncio.to_thread(
        supabase.table('supermercados').select('cnpj, nome').in_('cnpj', request.cnpjs).execute
    )
    mercados_map = {m['cnpj']: m['nome'] for m in resp.data}  # ✅ Apenas nome, sem endereço

    tasks = [
        collector_service.consultar_produto_realtime(
            request.produto, 
            {"cnpj": cnpj, "nome": mercados_map.get(cnpj, cnpj)},  # ✅ Sem endereço
            datetime.now().isoformat(), 
            ECONOMIZA_ALAGOAS_TOKEN, 
            -1
        ) for cnpj in request.cnpjs
    ]

    resultados_por_mercado = await asyncio.gather(*tasks, return_exceptions=True)
    resultados_finais = []

    for i, resultado in enumerate(resultados_por_mercado):
        if isinstance(resultado, Exception):
            cnpj_com_erro = request.cnpjs[i]
            logging.error(f"Falha na busca em tempo real para o CNPJ {cnpj_com_erro}: {resultado}")
        elif resultado:
            resultados_finais.extend(resultado)

    background_tasks.add_task(log_search, request.produto, 'realtime', request.cnpjs, len(resultados_finais), current_user)

    return {"results": sorted(resultados_finais, key=lambda x: x.get('preco_produto', float('inf')))}

@app.post("/api/price-history")
async def get_price_history(request: PriceHistoryRequest, user: UserProfile = Depends(require_page_access('compare'))):
    if not request.cnpjs: 
        raise HTTPException(status_code=400, detail="Pelo menos dois mercados devem ser selecionados.")
    if (request.end_date - request.start_date).days > 30: 
        raise HTTPException(status_code=400, detail="O período não pode exceder 30 dias.")

    query = supabase.table('produtos').select('nome_supermercado, preco_produto, data_ultima_venda').in_('cnpj_supermercado', request.cnpjs).gte('data_ultima_venda', str(request.start_date)).lte('data_ultima_venda', str(request.end_date))

    if request.product_identifier.isdigit() and len(request.product_identifier) > 7:
        query = query.eq('codigo_barras', request.product_identifier)
    else:
        query = query.like('nome_produto_normalizado', f"%{request.product_identifier.lower()}%")

    response = await asyncio.to_thread(
        query.execute
    )

    if not response.data: 
        return {}

    df = pd.DataFrame(response.data)
    df['preco_produto'] = pd.to_numeric(df['preco_produto'], errors='coerce')
    df.dropna(subset=['preco_produto', 'data_ultima_venda'], inplace=True)
    df['data_ultima_venda'] = pd.to_datetime(df['data_ultima_venda']).dt.date

    pivot_df = df.pivot_table(index='data_ultima_venda', columns='nome_supermercado', values='preco_produto', aggfunc='min')
    pivot_df.index = pd.to_datetime(pivot_df.index)
    pivot_df = pivot_df.resample('D').mean().interpolate(method='linear')

    history_by_market = {}
    for market_name in pivot_df.columns:
        market_series = pivot_df[market_name].dropna()
        history_by_market[market_name] = [{'x': index.strftime('%Y-%m-%d'), 'y': round(value, 2)} for index, value in market_series.items()]

    return history_by_market

# --------------------------------------------------------------------------
# --- GERENCIAMENTO DE CESTAS BÁSICAS ---
# --------------------------------------------------------------------------

BASKET_LIMIT_PER_USER = 3
PRODUCT_LIMIT_PER_BASKET = 25

@app.post("/api/baskets", response_model=Cesta, status_code=201)
async def create_basket(
    basket_data: CestaCreate,
    current_user: UserProfile = Depends(require_page_access('baskets'))
):
    try:
        count_response = await asyncio.to_thread(
            supabase_admin.table('cestas_basicas').select('id', count='exact').eq('user_id', current_user.id).execute
        )
        current_baskets_count = count_response.count if count_response.count is not None else 0

        if current_baskets_count >= BASKET_LIMIT_PER_USER:
            raise HTTPException(status_code=403, detail=f"Limite de {BASKET_LIMIT_PER_USER} cestas básicas atingido.")

        new_basket = {
            'user_id': current_user.id,
            'nome': basket_data.nome,
            'produtos': [item.dict() for item in basket_data.produtos]
        }

        resp = await asyncio.to_thread(
            supabase_admin.table('cestas_basicas').insert(new_basket).execute
        )

        if not resp.data:
            raise HTTPException(status_code=500, detail="Nenhum dado retornado ao criar cesta")

        return resp.data[0]

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao criar cesta: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno ao criar a cesta básica: {str(e)}")

@app.get("/api/baskets", response_model=List[Cesta])
async def list_baskets(
    current_user: UserProfile = Depends(require_page_access('baskets')),
    user_id: Optional[str] = Query(None)
):
    query = supabase_admin.table('cestas_basicas').select('*').order('id', desc=False)

    if current_user.role == 'admin':
        if user_id:
            query = query.eq('user_id', user_id)
    else:
        query = query.eq('user_id', current_user.id)

    resp = await asyncio.to_thread(query.execute)

    return [Cesta(**data) for data in resp.data]

@app.put("/api/baskets/{basket_id}", response_model=Cesta)
async def update_basket_name(
    basket_id: int,
    basket_data: CestaUpdate,
    current_user: UserProfile = Depends(require_page_access('baskets'))
):
    resp = await asyncio.to_thread(
        supabase_admin.table('cestas_basicas').update(basket_data.dict(exclude_none=True))
                 .eq('id', basket_id)
                 .eq('user_id', current_user.id)
                 .execute
    )

    if not resp.data:
        raise HTTPException(status_code=404, detail="Cesta não encontrada ou você não tem permissão para editar.")

    return resp.data[0]

@app.post("/api/baskets/{basket_id}/products", response_model=Cesta)
async def add_product_to_basket(
    basket_id: int,
    product: CestaItem,
    current_user: UserProfile = Depends(require_page_access('baskets'))
):
    basket_resp = await asyncio.to_thread(
        supabase_admin.table('cestas_basicas').select('user_id, produtos').eq('id', basket_id).single().execute
    )

    basket_data = basket_resp.data
    if not basket_data or basket_data['user_id'] != current_user.id:
        raise HTTPException(status_code=404, detail="Cesta não encontrada ou você não tem permissão.")

    current_products = basket_data['produtos'] or []

    if len(current_products) >= PRODUCT_LIMIT_PER_BASKET:
        raise HTTPException(status_code=403, detail=f"Limite de {PRODUCT_LIMIT_PER_BASKET} produtos por cesta atingido.")

    new_product_list = current_products + [product.dict()]

    update_resp = await asyncio.to_thread(
        supabase_admin.table('cestas_basicas').update({'produtos': new_product_list}).eq('id', basket_id).execute
    )
    return update_resp.data[0]

@app.put("/api/baskets/{basket_id}/products/{product_index}", response_model=Cesta)
async def edit_product_in_basket(
    basket_id: int,
    product_index: int,
    product_update: CestaUpdateItem,
    current_user: UserProfile = Depends(require_page_access('baskets'))
):
    basket_resp = await asyncio.to_thread(
        supabase_admin.table('cestas_basicas').select('user_id, produtos').eq('id', basket_id).single().execute
    )

    basket_data = basket_resp.data
    if not basket_data or basket_data['user_id'] != current_user.id:
        raise HTTPException(status_code=404, detail="Cesta não encontrada ou você não tem permissão.")

    current_products = basket_data['produtos'] or []

    if not (0 <= product_index < len(current_products)):
        raise HTTPException(status_code=400, detail="Índice de produto inválido.")

    product_to_update = current_products[product_index]

    if product_update.nome_produto is not None:
        product_to_update['nome_produto'] = product_update.nome_produto
    if product_update.codigo_barras is not None:
        product_to_update['codigo_barras'] = product_update.codigo_barras

    current_products[product_index] = product_to_update

    update_resp = await asyncio.to_thread(
        supabase_admin.table('cestas_basicas').update({'produtos': current_products}).eq('id', basket_id).execute
    )
    return update_resp.data[0]

@app.delete("/api/baskets/{basket_id}/products/{product_index}", response_model=Cesta)
async def remove_product_from_basket(
    basket_id: int,
    product_index: int,
    current_user: UserProfile = Depends(require_page_access('baskets'))
):
    basket_resp = await asyncio.to_thread(
        supabase_admin.table('cestas_basicas').select('user_id, produtos').eq('id', basket_id).single().execute
    )

    basket_data = basket_resp.data
    if not basket_data or basket_data['user_id'] != current_user.id:
        raise HTTPException(status_code=404, detail="Cesta não encontrada ou você não tem permissão.")

    current_products = basket_data['produtos'] or []

    if not (0 <= product_index < len(current_products)):
        raise HTTPException(status_code=400, detail="Índice de produto inválido.")

    new_product_list = [
        item for i, item in enumerate(current_products) if i != product_index
    ]

    update_resp = await asyncio.to_thread(
        supabase_admin.table('cestas_basicas').update({'produtos': new_product_list}).eq('id', basket_id).execute
    )
    return update_resp.data[0]

@app.delete("/api/baskets/{basket_id}/products", response_model=Cesta)
async def clear_basket_products(
    basket_id: int,
    current_user: UserProfile = Depends(require_page_access('baskets'))
):
    basket_resp = await asyncio.to_thread(
        supabase_admin.table('cestas_basicas').select('user_id').eq('id', basket_id).single().execute
    )

    if not basket_resp.data or basket_resp.data['user_id'] != current_user.id:
        raise HTTPException(status_code=404, detail="Cesta não encontrada ou você não tem permissão.")

    update_resp = await asyncio.to_thread(
        supabase_admin.table('cestas_basicas').update({'produtos': []}).eq('id', basket_id).execute
    )
    return update_resp.data[0]

@app.delete("/api/baskets/{basket_id}", status_code=204)
async def delete_basket(
    basket_id: int,
    current_user: UserProfile = Depends(require_page_access('baskets'))
):
    resp = await asyncio.to_thread(
        lambda: supabase_admin.table('cestas_basicas').delete()
                        .eq('id', basket_id)
                        .eq('user_id', current_user.id)
                        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Cesta não encontrada ou você não tem permissão para excluir.")
    return

@app.post("/api/baskets/{basket_id}/realtime-prices")
async def get_basket_realtime_prices(
    basket_id: int,
    cnpjs: List[str] = Query(..., description="Lista de CNPJs dos mercados para pesquisa."),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: UserProfile = Depends(require_page_access('baskets'))
):
    basket_resp = await asyncio.to_thread(
        supabase_admin.table('cestas_basicas').select('user_id, nome, produtos').eq('id', basket_id).single().execute
    )

    basket_data = basket_resp.data
    if not basket_data or (basket_data['user_id'] != current_user.id and current_user.role != 'admin'):
        raise HTTPException(status_code=404, detail="Cesta não encontrada ou você não tem permissão.")

    products_to_search = basket_data['produtos'] or []
    if not products_to_search:
        return {"results": [], "message": "Nenhum produto na cesta para buscar."}

    resp_markets = await asyncio.to_thread(
        supabase.table('supermercados').select('cnpj, nome').in_('cnpj', cnpjs).execute
    )
    mercados_map = {m['cnpj']: m['nome'] for m in resp_markets.data}

    all_tasks = []

    for product in products_to_search:
        if not product.get('nome_produto'):
            continue 

        product_tasks = [
            collector_service.consultar_produto_realtime(
                product['nome_produto'], 
                {"cnpj": cnpj, "nome": mercados_map.get(cnpj, cnpj)}, 
                datetime.now().isoformat(), 
                ECONOMIZA_ALAGOAS_TOKEN, 
                -1 
            ) for cnpj in cnpjs
        ]
        all_tasks.extend(product_tasks)

    if not all_tasks:
        return {"results": [], "message": "Nenhum produto válido encontrado para busca."}

    resultados_por_mercado = await asyncio.gather(*all_tasks, return_exceptions=True)
    resultados_finais = []

    for resultado in resultados_por_mercado:
        if isinstance(resultado, Exception):
            logging.error(f"Falha na busca em tempo real de cesta: {resultado}")
        elif resultado:
            resultados_finais.extend(resultado)

    basket_name = basket_data.get('nome', f"Cesta #{basket_id}")
    background_tasks.add_task(log_search, f"[Cesta: {basket_name}]", 'realtime', cnpjs, len(resultados_finais), current_user)

    return {"results": sorted(resultados_finais, key=lambda x: (x.get('nome_produto_normalizado', ''), x.get('preco_produto', float('inf'))))}

# --------------------------------------------------------------------------
# --- ENDPOINTS PARA GERENCIAMENTO DE GRUPOS ---
# --------------------------------------------------------------------------

@app.post("/api/groups", response_model=Grupo)
async def create_group(
    group: GrupoCreate, 
    admin_user: UserProfile = Depends(require_page_access('group_admin_users'))
):
    try:
        group_data = group.dict()
        resp = await asyncio.to_thread(
            supabase.table('grupos').insert(group_data).execute
        )
        return resp.data[0]
    except Exception as e:
        logging.error(f"Erro ao criar grupo: {e}")
        raise HTTPException(status_code=400, detail="Erro ao criar grupo")

@app.get("/api/groups", response_model=List[Grupo])
async def list_groups(admin_user: UserProfile = Depends(require_page_access('group_admin_users'))):
    try:
        resp = await asyncio.to_thread(
            supabase.table('grupos').select('*').order('nome').execute
        )
        return resp.data
    except Exception as e:
        logging.error(f"Erro ao listar grupos: {e}")
        raise HTTPException(status_code=500, detail="Erro ao listar grupos")

@app.put("/api/groups/{group_id}", response_model=Grupo)
async def update_group(
    group_id: int, 
    group: GrupoCreate, 
    admin_user: UserProfile = Depends(require_page_access('group_admin_users'))
):
    try:
        group_data = group.dict()
        group_data['updated_at'] = datetime.now().isoformat()

        # Buscar dados antigos do grupo
        old_group_resp = await asyncio.to_thread(
            supabase.table('grupos').select('dias_acesso').eq('id', group_id).single().execute
        )

        resp = await asyncio.to_thread(
            supabase.table('grupos').update(group_data).eq('id', group_id).execute
        )

        if not resp.data:
            raise HTTPException(status_code=404, detail="Grupo não encontrado")

        # Se os dias de acesso foram alterados, atualizar automaticamente as datas de expiração
        if old_group_resp.data and old_group_resp.data['dias_acesso'] != group.dias_acesso:
            await update_group_members_expiration(group_id, group.dias_acesso)
            logging.info(f"Datas de expiração atualizadas automaticamente para o grupo {group_id}")

        return resp.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao atualizar grupo: {e}")
        raise HTTPException(status_code=400, detail="Erro ao atualizar grupo")

@app.delete("/api/groups/{group_id}", status_code=204)
async def delete_group(
    group_id: int, 
    admin_user: UserProfile = Depends(require_page_access('group_admin_users'))
):
    try:
        group_resp = await asyncio.to_thread(
            supabase.table('grupos').select('id').eq('id', group_id).execute
        )

        if not group_resp.data:
            raise HTTPException(status_code=404, detail="Grupo não encontrado")

        await asyncio.to_thread(
            lambda: supabase.table('grupos').delete().eq('id', group_id).execute()
        )
        return
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao deletar grupo: {e}")
        raise HTTPException(status_code=400, detail="Erro ao deletar grupo")

@app.post("/api/user-groups", response_model=UserGroup)
async def add_user_to_group(
    user_group: UserGroupCreate,
    admin_user: UserProfile = Depends(require_page_access('group_admin_users'))
):
    try:
        logging.info(f"Tentando adicionar usuário {user_group.user_id} ao grupo {user_group.group_id}")

        # Verificar se o usuário existe
        user_resp = await asyncio.to_thread(
            supabase.table('profiles').select('id, full_name').eq('id', user_group.user_id).execute
        )
        if not user_resp.data:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")

        # Verificar se o grupo existe
        group_resp = await asyncio.to_thread(
            supabase.table('grupos').select('dias_acesso').eq('id', user_group.group_id).execute
        )
        if not group_resp.data:
            raise HTTPException(status_code=404, detail="Grupo não encontrado")

        # Calcular data de expiração
        if user_group.data_expiracao:
            data_expiracao = user_group.data_expiracao
        else:
            dias_acesso = group_resp.data[0]['dias_acesso']
            data_expiracao = calcular_data_expiracao(dias_acesso)

        # Verificar se a associação já existe
        existing_assoc = await asyncio.to_thread(
            supabase.table('user_groups')
            .select('id')
            .eq('user_id', user_group.user_id)
            .eq('group_id', user_group.group_id)
            .execute
        )

        if existing_assoc.data:
            # Atualizar data de expiração se já existir
            user_group_data = {
                'data_expiracao': data_expiracao.isoformat()
            }

            resp = await asyncio.to_thread(
                supabase.table('user_groups')
                .update(user_group_data)
                .eq('user_id', user_group.user_id)
                .eq('group_id', user_group.group_id)
                .execute
            )
        else:
            # Criar nova associação
            user_group_data = {
                'user_id': user_group.user_id,
                'group_id': user_group.group_id,
                'data_expiracao': data_expiracao.isoformat()
            }

            resp = await asyncio.to_thread(
                supabase.table('user_groups').insert(user_group_data).execute
            )

        logging.info(f"Usuário {user_group.user_id} adicionado/atualizado no grupo {user_group.group_id}")
        return resp.data[0]

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao adicionar usuário ao grupo: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Erro ao adicionar usuário ao grupo: {str(e)}")

@app.get("/api/user-groups", response_model=List[UserGroupWithDetails])
async def list_user_groups(
    user_id: Optional[str] = Query(None),
    group_id: Optional[int] = Query(None),
    admin_user: UserProfile = Depends(require_page_access('group_admin_users'))
):
    try:
        query = supabase_admin.table('user_groups').select('*')

        if user_id:
            query = query.eq('user_id', user_id)
        if group_id:
            query = query.eq('group_id', group_id)

        user_groups_response = await asyncio.to_thread(
            query.order('created_at', desc=True).execute
        )

        # Se não há dados, retornar lista vazia imediatamente
        if not user_groups_response.data:
            return []

        user_groups_with_details = []

        for user_group in user_groups_response.data:
            try:
                # Buscar informações do grupo
                group_response = await asyncio.to_thread(
                    supabase_admin.table('grupos').select('*').eq('id', user_group['group_id']).execute
                )
                grupo_data = group_response.data[0] if group_response.data else {'nome': 'Grupo Não Encontrado', 'dias_acesso': 0}

                # Buscar informações do perfil
                profile_response = await asyncio.to_thread(
                    supabase_admin.table('profiles').select('full_name').eq('id', user_group['user_id']).execute
                )
                user_name = profile_response.data[0]['full_name'] if profile_response.data else 'N/A'

                # Buscar email do usuário
                user_email = "N/A"
                try:
                    auth_response = await asyncio.to_thread(
                        lambda: supabase_admin.auth.admin.get_user_by_id(user_group['user_id'])
                    )
                    if auth_response.user:
                        user_email = auth_response.user.email
                except Exception as e:
                    logging.error(f"Erro ao buscar email do usuário {user_group['user_id']}: {e}")

                user_group_detail = UserGroupWithDetails(
                    id=user_group['id'],
                    user_id=user_group['user_id'],
                    group_id=user_group['group_id'],
                    data_expiracao=user_group['data_expiracao'],
                    created_at=user_group['created_at'],
                    grupo_nome=grupo_data['nome'],
                    grupo_dias_acesso=grupo_data['dias_acesso'],
                    user_name=user_name,
                    user_email=user_email
                )
                user_groups_with_details.append(user_group_detail)

            except Exception as e:
                logging.error(f"Erro ao processar user_group {user_group.get('id')}: {e}")
                continue  # Continuar com os próximos registros mesmo se um falhar

        return user_groups_with_details

    except Exception as e:
        logging.error(f"Erro ao listar associações usuário-grupo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno ao listar associações: {str(e)}")

# Adicionar estes endpoints ao main.py após os endpoints existentes de grupos

@app.put("/api/groups/{group_id}/update-expiration")
async def update_group_expiration_dates(
    group_id: int,
    user: UserProfile = Depends(require_page_access('group_admin_users'))
):
    """Atualiza as datas de expiração de todos os membros do grupo com base nos dias_acesso atuais"""
    try:
        # Buscar o grupo
        group_resp = await asyncio.to_thread(
            supabase.table('grupos').select('dias_acesso').eq('id', group_id).single().execute
        )
        if not group_resp.data:
            raise HTTPException(status_code=404, detail="Grupo não encontrado")

        dias_acesso = group_resp.data['dias_acesso']
        updated_count = await update_group_members_expiration(group_id, dias_acesso)

        return {
            "message": f"Datas de expiração atualizadas para {updated_count} usuários",
            "updated_count": updated_count
        }

    except Exception as e:
        logging.error(f"Erro ao atualizar datas de expiração do grupo: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar datas: {str(e)}")

@app.post("/api/groups/{group_id}/renew")
async def renew_group_access_endpoint(
    group_id: int,
    renew_data: UserRenewRequest,
    user: UserProfile = Depends(require_page_access('group_admin_users'))
):
    """Renova o acesso de todos os usuários do grupo adicionando dias"""
    try:
        # Verificar se o grupo existe
        group_resp = await asyncio.to_thread(
            supabase.table('grupos').select('id').eq('id', group_id).execute
        )
        if not group_resp.data:
            raise HTTPException(status_code=404, detail="Grupo não encontrado")

        renewed_count = await renew_group_access(group_id, renew_data.dias_adicionais)

        return {
            "message": f"Acesso renovado para {renewed_count} usuários",
            "renewed_count": renewed_count
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao renovar acesso do grupo: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao renovar acesso: {str(e)}")

@app.get("/api/users/{user_id}/groups", response_model=List[UserGroupWithDetails])
async def get_user_groups(
    user_id: str,
    admin_user: UserProfile = Depends(require_page_access('group_admin_users'))
):
    try:
        user_groups_response = await asyncio.to_thread(
            supabase_admin.table('user_groups').select('*')
            .eq('user_id', user_id)
            .order('created_at', desc=True)
            .execute
        )

        # Se não há dados, retornar lista vazia
        if not user_groups_response.data:
            return []

        user_groups = []

        for user_group in user_groups_response.data:
            try:
                group_response = await asyncio.to_thread(
                    supabase_admin.table('grupos').select('*').eq('id', user_group['group_id']).execute
                )

                if group_response.data:
                    profile_response = await asyncio.to_thread(
                        supabase_admin.table('profiles').select('full_name').eq('id', user_id).execute
                    )

                    user_email = "N/A"
                    try:
                        auth_response = await asyncio.to_thread(
                            lambda: supabase_admin.auth.admin.get_user_by_id(user_id)
                        )
                        if auth_response.user:
                            user_email = auth_response.user.email
                    except Exception as e:
                        logging.error(f"Erro ao buscar email do usuário {user_id}: {e}")

                    user_name = profile_response.data[0]['full_name'] if profile_response.data else 'N/A'

                    group_detail = UserGroupWithDetails(
                        id=user_group['id'],
                        user_id=user_group['user_id'],
                        group_id=user_group['group_id'],
                        data_expiracao=user_group['data_expiracao'],
                        created_at=user_group['created_at'],
                        grupo_nome=group_response.data[0]['nome'],
                        grupo_dias_acesso=group_response.data[0]['dias_acesso'],
                        user_name=user_name,
                        user_email=user_email
                    )
                    user_groups.append(group_detail)
            except Exception as e:
                logging.error(f"Erro ao processar grupo do usuário {user_id}: {e}")
                continue

        return user_groups

    except Exception as e:
        logging.error(f"Erro ao buscar grupos do usuário: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar grupos do usuário")

# NOVO ENDPOINT CORRIGIDO PARA COMPATIBILIDADE COM FRONTEND
@app.get("/api/my-groups-detailed", response_model=List[dict])
async def get_my_groups_detailed(current_user: UserProfile = Depends(get_current_user)):
    """Endpoint alternativo para compatibilidade com frontend existente"""
    try:
        # Reutilizar a lógica do group_admin_routes
        if current_user.role == 'admin':
            groups_response = await asyncio.to_thread(
                supabase.table('grupos').select('*').order('nome').execute
            )
            groups = groups_response.data or []
        else:
            # Buscar grupos gerenciados pelo subadmin
            managed_groups = []
            try:
                admin_response = await asyncio.to_thread(
                    supabase.table('group_admins').select('group_ids').eq('user_id', current_user.id).execute
                )
                if admin_response.data:
                    managed_groups = admin_response.data[0].get('group_ids', [])
            except Exception as e:
                logging.error(f"Erro ao buscar grupos gerenciados: {e}")

            if not managed_groups:
                return []

            groups_response = await asyncio.to_thread(
                supabase.table('grupos')
                .select('*')
                .in_('id', managed_groups)
                .order('nome')
                .execute
            )
            groups = groups_response.data or []

        # Formatar resposta para o frontend
        groups_with_details = []
        for group in groups:
            # Contar usuários ativos no grupo
            user_groups_response = await asyncio.to_thread(
                supabase_admin.table('user_groups')
                .select('user_id', count='exact')
                .eq('group_id', group['id'])
                .gte('data_expiracao', date.today().isoformat())
                .execute
            )

            group_with_details = {
                'group_id': group['id'],
                'grupo_nome': group['nome'],
                'grupo_dias_acesso': group['dias_acesso'],
                'usuarios_ativos': user_groups_response.count or 0,
                'descricao': group.get('descricao', ''),
                'created_at': group.get('created_at')
            }
            groups_with_details.append(group_with_details)

        return groups_with_details

    except Exception as e:
        logging.error(f"Erro ao listar grupos do usuário: {e}")
        raise HTTPException(status_code=500, detail="Erro ao listar grupos")

# NOVO ENDPOINT: Remover associação usuário-grupo
@app.delete("/api/user-groups/{user_group_id}", status_code=204)
async def delete_user_group_association(
    user_group_id: int, 
    admin_user: UserProfile = Depends(require_page_access('group_admin_users'))
):
    """Remove uma associação usuário-grupo específica"""
    try:
        await asyncio.to_thread(
            lambda: supabase.table('user_groups').delete().eq('id', user_group_id).execute()
        )
        return
    except Exception as e:
        logging.error(f"Erro ao deletar associação usuário-grupo {user_group_id}: {e}")
        raise HTTPException(status_code=400, detail="Erro ao remover usuário do grupo")

# ENDPOINT ALTERNATIVO PARA RENOVAÇÃO DE ACESSO
@app.post("/api/user-groups/{user_group_id}/renew")
async def renew_user_group_access(
    user_group_id: int,
    renew_data: UserRenewRequest,
    user: UserProfile = Depends(require_page_access('group_admin_users'))
):
    """Endpoint alternativo para renovar acesso via user_group_id"""
    try:
        # Buscar a associação
        user_group_response = await asyncio.to_thread(
            supabase.table('user_groups')
            .select('*')
            .eq('id', user_group_id)
            .single()
            .execute
        )

        if not user_group_response.data:
            raise HTTPException(status_code=404, detail="Associação não encontrada")

        user_group = user_group_response.data

        # Calcular nova data
        data_atual = date.today()
        dias_adicionais = renew_data.dias_adicionais

        data_expiracao = user_group['data_expiracao']
        if isinstance(data_expiracao, str):
            data_expiracao = datetime.fromisoformat(data_expiracao).date()

        if data_expiracao < data_atual:
            nova_data = data_atual + timedelta(days=dias_adicionais)
        else:
            nova_data = data_expiracao + timedelta(days=dias_adicionais)

        # Atualizar
        await asyncio.to_thread(
            lambda: supabase.table('user_groups')
            .update({'data_expiracao': nova_data.isoformat()})
            .eq('id', user_group_id)
            .execute()
        )

        return {"message": f"Acesso renovado por {dias_adicionais} dias"}

    except Exception as e:
        logging.error(f"Erro ao renovar acesso: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao renovar acesso: {str(e)}")

# NOVO ENDPOINT: Buscar usuários para designação como admin de grupo
@app.get("/api/users/search")
async def search_users_for_group_admin(
    q: str = Query(..., description="Termo de busca por nome ou email"),
    admin_user: UserProfile = Depends(require_page_access('group_admin_users'))
):
    """Busca usuários para designação como admin de grupo"""
    try:
        # Buscar por nome
        profiles_response = await asyncio.to_thread(
            supabase.table('profiles')
            .select('id, full_name, role')
            .ilike('full_name', f"%{q}%")
            .execute
        )

        users = []
        for profile in profiles_response.data:
            # Buscar email
            email = None
            try:
                auth_response = await asyncio.to_thread(
                    lambda: supabase_admin.auth.admin.get_user_by_id(profile['id'])
                )
                if auth_response.user:
                    email = auth_response.user.email
            except Exception as e:
                logging.error(f"Erro ao buscar email do usuário {profile['id']}: {e}")

            users.append({
                "id": profile["id"],
                "full_name": profile.get("full_name"),
                "email": email,
                "role": profile.get("role")
            })

        return users

    except Exception as e:
        logging.error(f"Erro ao buscar usuários: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar usuários")

# Adicione estas rotas ao main.py

@app.get("/api/group-renewal/stats")
async def get_group_renewal_stats(
    group_id: int = Query(..., description="ID do grupo"),
    admin_user: UserProfile = Depends(require_page_access('group_admin_users'))
):
    """Obtém estatísticas de um grupo para renovação em massa"""
    try:
        stats = await get_group_statistics(group_id)
        return stats

    except Exception as e:
        logging.error(f"Erro ao buscar estatísticas do grupo: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar estatísticas do grupo")

@app.post("/api/group-renewal/renew")
async def renew_group_access_bulk(
    request: dict,
    admin_user: UserProfile = Depends(require_page_access('group_admin_users'))
):
    """Renova o acesso de todos os usuários de um grupo"""
    try:
        group_id = request.get('group_id')
        days = request.get('days')

        if not group_id or not days:
            raise HTTPException(status_code=400, detail="group_id e days são obrigatórios")

        renewed_count = await renew_group_access(group_id, days)

        return {
            "message": f"Acesso renovado para {renewed_count} usuários",
            "renewed_count": renewed_count
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao renovar acesso do grupo: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao renovar acesso: {str(e)}")

# --- Servir o Frontend ---
app.mount("/", StaticFiles(directory="web", html=True), name="static")

# --------------------------------------------------------------------------
# --- 7. ENDPOINT RAIZ ---
# --------------------------------------------------------------------------

@app.get("/")
def read_root():
    return {"message": "Bem-vindo à API de Preços Em Foco - Versão 3.4.3"}