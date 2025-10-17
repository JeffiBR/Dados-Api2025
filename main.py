# main.py (completo e corrigido com as novas permissões) - VERSÃO 3.4.1
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

# Importar dependências compartilhadas e rotas de subadministradores
from dependencies import get_current_user, get_current_user_optional, require_page_access, UserProfile, supabase, supabase_admin
from group_admin_routes import group_admin_router

# --------------------------------------------------------------------------
# --- 1. CONFIGURAÇÕES INICIAIS E VARIÁVEIS DE AMBIENTE ---
# --------------------------------------------------------------------------
load_dotenv()
app = FastAPI(
    title="API de Preços Arapiraca",
    description="Sistema completo para coleta e análise de preços de supermercados.",
    version="3.4.1"
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

# MODELO PARA COLETA PERSONALIZADA
class CollectionRequest(BaseModel):
    selected_markets: Optional[List[str]] = Field(None, description="Lista de CNPJs dos mercados a coletar (vazio = todos)")
    dias_pesquisa: int = Field(3, ge=1, le=7, description="Número de dias para pesquisa (1 a 7)")

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
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro interno inesperado no servidor.")

@app.put("/api/users/{user_id}")
async def update_user(user_id: str, user_data: UserUpdate, admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        # Atualizar perfil
        await asyncio.to_thread(
            lambda: supabase_admin.table('profiles').update({
                'full_name': user_data.full_name,
                'role': user_data.role,
                'allowed_pages': user_data.allowed_pages
            }).eq('id', user_id).execute()
        )
        
        # Se for admin de grupo, atualizar grupos gerenciados
        if user_data.role == "group_admin" and user_data.managed_groups:
            # Verificar se já existe registro
            existing_admin = await asyncio.to_thread(
                supabase_admin.table('group_admins').select('*').eq('user_id', user_id).execute
            )
            
            if existing_admin.data:
                # Atualizar
                await asyncio.to_thread(
                    supabase_admin.table('group_admins').update({
                        'group_ids': user_data.managed_groups
                    }).eq('user_id', user_id).execute()
                )
            else:
                # Criar novo
                admin_record = {
                    'user_id': user_id,
                    'group_ids': user_data.managed_groups
                }
                await asyncio.to_thread(
                    supabase_admin.table('group_admins').insert(admin_record).execute
                )
        elif user_data.role != "group_admin":
            # Remover da tabela group_admins se não for mais admin de grupo
            await asyncio.to_thread(
                lambda: supabase_admin.table('group_admins').delete().eq('user_id', user_id).execute()
            )
        
        return {"message": "Usuário atualizado com sucesso"}
    except Exception as e:
        logging.error(f"Erro ao atualizar usuário: {e}")
        raise HTTPException(status_code=500, detail="Erro ao atualizar usuário")
        
@app.get("/api/users")
async def list_users(admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        profiles_response = await asyncio.to_thread(
            supabase.table('profile