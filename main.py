# main.py (completo e corrigido) - VERSÃO 3.5.1
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

# --------------------------------------------------------------------------
# --- CONFIGURAÇÕES INICIAIS ---
# --------------------------------------------------------------------------
load_dotenv()
app = FastAPI(
    title="API de Preços Arapiraca",
    description="Sistema completo para coleta e análise de preços de supermercados.",
    version="3.5.1"
)
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] %(message)s')

# Variáveis de ambiente
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SERVICE_ROLE_KEY = os.getenv("SERVICE_ROLE_KEY")
ECONOMIZA_ALAGOAS_TOKEN = os.getenv("ECONOMIZA_ALAGOAS_TOKEN")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://127.0.0.1:5500,http://localhost:8000").split(',')

if not all([SUPABASE_URL, SUPABASE_KEY, SERVICE_ROLE_KEY, ECONOMIZA_ALAGOAS_TOKEN]):
    logging.error("Variáveis de ambiente essenciais não estão definidas. Verifique seu arquivo .env")
    exit(1)

# Clientes Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
supabase_admin: Client = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

# --------------------------------------------------------------------------
# --- TRATAMENTO DE ERROS ---
# --------------------------------------------------------------------------
@app.exception_handler(APIError)
async def handle_supabase_errors(request: Request, exc: APIError):
    logging.error(f"Erro do Supabase na rota {request.url.path}: {exc.message} (Código: {exc.code})")
    return JSONResponse(
        status_code=400,
        content={"detail": f"Erro de comunicação com o banco de dados: {exc.message}"},
    )

# --------------------------------------------------------------------------
# --- AUTENTICAÇÃO E AUTORIZAÇÃO ---
# --------------------------------------------------------------------------
class UserProfile(BaseModel):
    id: str
    role: str = "user"
    allowed_pages: List[str] = []
    email: Optional[str] = None
    group_admin_of: Optional[List[int]] = None

def calcular_data_expiracao(dias_acesso: int) -> date:
    return date.today() + timedelta(days=dias_acesso)

async def verificar_acesso_usuario(user_id: str) -> bool:
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

async def get_current_user(authorization: str = Header(None)) -> UserProfile:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autorização ausente ou mal formatado")
    
    jwt = authorization.split(" ")[1]
    try:
        user_response = supabase.auth.get_user(jwt)
        user = user_response.user
        user_id = user.id
        
        # Buscar perfil completo
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
        
        # Buscar grupos onde o usuário é admin
        group_admin_of = []
        try:
            group_admin_response = await asyncio.to_thread(
                supabase.table('grupos').select('id').eq('admin_id', user_id).execute
            )
            group_admin_of = [group['id'] for group in group_admin_response.data] if group_admin_response.data else []
        except Exception as e:
            logging.warning(f"Erro ao buscar grupos admin: {e}")
        
        role = profile_data.get('role', 'user')
        allowed_pages = profile_data.get('allowed_pages', [])
        
        if allowed_pages is None:
            allowed_pages = []
        
        # Verificar acesso (exceto para admins e admins de grupo)
        if role != 'admin' and not group_admin_of:
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
            group_admin_of=group_admin_of
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
        
        group_admin_of = []
        try:
            group_admin_response = await asyncio.to_thread(
                supabase.table('grupos').select('id').eq('admin_id', user_id).execute
            )
            group_admin_of = [group['id'] for group in group_admin_response.data] if group_admin_response.data else []
        except Exception:
            pass
        
        if not profile_response.data:
            return UserProfile(
                id=user_id,
                role='user',
                allowed_pages=[],
                email=user.email,
                group_admin_of=group_admin_of
            )
        
        profile_data = profile_response.data
        role = profile_data.get('role', 'user')
        allowed_pages = profile_data.get('allowed_pages', [])
        
        return UserProfile(
            id=user_id, 
            role=role,
            allowed_pages=allowed_pages,
            email=user.email,
            group_admin_of=group_admin_of
        )
    except Exception as e:
        return None

def require_page_access(page_key: str):
    async def _verify_access(current_user: UserProfile = Depends(get_current_user)):
        if current_user.role != 'admin' and page_key not in current_user.allowed_pages:
            if page_key == 'group_users' and current_user.group_admin_of:
                return current_user
            raise HTTPException(status_code=403, detail=f"Acesso negado à funcionalidade: {page_key}")
        return current_user
    return _verify_access

def require_group_admin(group_id: int):
    async def _verify_group_admin(current_user: UserProfile = Depends(get_current_user)):
        if current_user.role != 'admin' and (not current_user.group_admin_of or group_id not in current_user.group_admin_of):
            raise HTTPException(status_code=403, detail="Acesso negado: você não é administrador deste grupo")
        return current_user
    return _verify_group_admin

def require_admin_or_group_admin(group_id: Optional[int] = None):
    async def _verify_admin_or_group_admin(current_user: UserProfile = Depends(get_current_user)):
        if current_user.role == 'admin':
            return current_user
        if group_id and current_user.group_admin_of and group_id in current_user.group_admin_of:
            return current_user
        raise HTTPException(status_code=403, detail="Acesso negado: privilégios administrativos necessários")
    return _verify_admin_or_group_admin

# Status da coleta
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
# --- MODELOS DE DADOS ---
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
    role: str
    allowed_pages: List[str] = []

class UserUpdate(BaseModel):
    full_name: str
    role: str
    allowed_pages: List[str]

class ProfileUpdateWithCredentials(BaseModel):
    full_name: Optional[str] = None
    job_title: Optional[str] = None
    avatar_url: Optional[str] = None
    email: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

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

# Cesta Básica
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

# Coleta Personalizada
class CollectionRequest(BaseModel):
    selected_markets: Optional[List[str]] = Field(None, description="Lista de CNPJs dos mercados a coletar (vazio = todos)")
    dias_pesquisa: int = Field(3, ge=1, le=7, description="Número de dias para pesquisa (1 a 7)")

# Grupos
class GrupoBase(BaseModel):
    nome: str = Field(..., max_length=100)
    dias_acesso: int = Field(30, ge=1, le=365)
    max_usuarios: int = Field(10, ge=1, le=1000)
    admin_id: Optional[str] = None
    descricao: Optional[str] = None

class GrupoCreate(GrupoBase):
    pass

class Grupo(GrupoBase):
    id: int
    created_at: datetime
    updated_at: datetime

class UserGroupBase(BaseModel):
    user_id: str
    group_id: int

class UserGroupCreate(UserGroupBase):
    data_expiracao: Optional[date] = None

class UserGroup(UserGroupBase):
    id: int
    data_expiracao: date
    created_at: datetime

class UserGroupWithDetails(UserGroup):
    grupo_nome: str
    grupo_dias_acesso: int
    grupo_max_usuarios: int
    user_name: Optional[str] = None
    user_email: Optional[str] = None

class GroupUserCreate(BaseModel):
    email: str
    password: str
    full_name: str

class GroupUserUpdate(BaseModel):
    full_name: Optional[str] = None
    allowed_pages: Optional[List[str]] = None

# --------------------------------------------------------------------------
# --- FUNÇÕES DE LOG ---
# --------------------------------------------------------------------------
def log_search(term: str, type: str, cnpjs: Optional[List[str]], count: int, user: Optional[UserProfile] = None):
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
# --- ENDPOINTS DE DIAGNÓSTICO ---
# --------------------------------------------------------------------------
@app.get("/api/debug/database")
async def debug_database():
    """Endpoint para diagnosticar problemas no banco de dados"""
    try:
        # Teste 1: Verificar se a tabela grupos existe
        try:
            groups_test = await asyncio.to_thread(
                supabase.table('grupos').select('id', count='exact').limit(1).execute
            )
            groups_exists = True
            groups_count = groups_test.count
        except Exception as e:
            groups_exists = False
            groups_count = 0
            groups_error = str(e)

        # Teste 2: Verificar se a tabela user_groups existe
        try:
            user_groups_test = await asyncio.to_thread(
                supabase.table('user_groups').select('id', count='exact').limit(1).execute
            )
            user_groups_exists = True
            user_groups_count = user_groups_test.count
        except Exception as e:
            user_groups_exists = False
            user_groups_count = 0
            user_groups_error = str(e)

        return {
            "database_status": "connected",
            "tables": {
                "grupos": {
                    "exists": groups_exists,
                    "count": groups_count,
                    "error": groups_error if not groups_exists else None
                },
                "user_groups": {
                    "exists": user_groups_exists,
                    "count": user_groups_count,
                    "error": user_groups_error if not user_groups_exists else None
                }
            }
        }
    except Exception as e:
        return {
            "database_status": "error",
            "error": str(e)
        }

# --------------------------------------------------------------------------
# --- NOVO ENDPOINT PARA BUSCAR USUÁRIOS PARA ADMIN DE GRUPO ---
# --------------------------------------------------------------------------
@app.get("/api/users/for-group-admin")
async def get_users_for_group_admin(admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        # Buscar todos os usuários
        response = await asyncio.to_thread(
            supabase.table('profiles').select('id, full_name, role').execute
        )
        users = response.data or []
        
        # Formatar resposta
        formatted_users = []
        for user in users:
            try:
                # Buscar email do auth
                auth_response = await asyncio.to_thread(
                    lambda: supabase_admin.auth.admin.get_user_by_id(user['id'])
                )
                email = auth_response.user.email if auth_response.user else 'N/A'
            except:
                email = 'N/A'
            
            formatted_users.append({
                "id": user["id"],
                "full_name": user.get("full_name"),
                "email": email,
                "role": user.get("role", "user")
            })
        
        return formatted_users
        
    except Exception as e:
        logging.error(f"Erro ao buscar usuários para admin de grupo: {e}")
        raise HTTPException(status_code=500, detail="Erro interno ao carregar usuários")

# --------------------------------------------------------------------------
# --- ENDPOINTS DE GRUPOS (CORRIGIDOS) ---
# --------------------------------------------------------------------------
@app.get("/api/groups", response_model=List[Grupo])
async def list_groups(admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        logging.info("Tentando buscar grupos do banco de dados")
        
        resp = await asyncio.to_thread(
            supabase.table('grupos').select('*').order('nome').execute
        )
        
        logging.info(f"Grupos encontrados: {len(resp.data)}")
        return resp.data
        
    except Exception as e:
        error_msg = str(e)
        logging.error(f"Erro detalhado ao listar grupos: {error_msg}")
        
        if "does not exist" in error_msg:
            raise HTTPException(
                status_code=500, 
                detail="Tabela 'grupos' não encontrada. Execute o script SQL de configuração."
            )
        elif "permission" in error_msg.lower():
            raise HTTPException(
                status_code=500,
                detail="Sem permissão para acessar a tabela 'grupos'."
            )
        else:
            raise HTTPException(
                status_code=500, 
                detail=f"Erro interno ao carregar grupos: {error_msg}"
            )

@app.post("/api/groups", response_model=Grupo)
async def create_group(group: GrupoCreate, admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        logging.info(f"Tentando criar grupo: {group.nome}")
        
        # Verificar se o admin_id existe (se fornecido)
        if group.admin_id:
            profile_response = await asyncio.to_thread(
                supabase.table('profiles').select('id, full_name').eq('id', group.admin_id).execute
            )
            if not profile_response.data:
                raise HTTPException(status_code=404, detail="Usuário administrador não encontrado")
        
        group_data = group.dict()
        logging.info(f"Dados do grupo a serem inseridos: {group_data}")
        
        resp = await asyncio.to_thread(
            supabase.table('grupos').insert(group_data).execute
        )
        
        if not resp.data:
            logging.error("Nenhum dado retornado ao criar grupo")
            raise HTTPException(status_code=500, detail="Erro ao criar grupo - nenhum dado retornado")
            
        logging.info(f"Grupo criado com sucesso: {resp.data[0]}")
        return resp.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro detalhado ao criar grupo: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno ao criar grupo: {str(e)}")

@app.put("/api/groups/{group_id}", response_model=Grupo)
async def update_group(group_id: int, group: GrupoCreate, admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        group_resp = await asyncio.to_thread(
            supabase.table('grupos').select('*').eq('id', group_id).execute
        )
        if not group_resp.data:
            raise HTTPException(status_code=404, detail="Grupo não encontrado")
        
        if group.admin_id:
            profile_response = await asyncio.to_thread(
                supabase.table('profiles').select('id, allowed_pages').eq('id', group.admin_id).execute
            )
            if not profile_response.data:
                raise HTTPException(status_code=404, detail="Usuário administrador não encontrado")
        
        group_data = group.dict()
        group_data['updated_at'] = datetime.now().isoformat()
        
        resp = await asyncio.to_thread(
            supabase.table('grupos').update(group_data).eq('id', group_id).execute
        )
        
        if not resp.data:
            raise HTTPException(status_code=404, detail="Grupo não encontrado")
            
        return resp.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao atualizar grupo: {e}")
        raise HTTPException(status_code=400, detail="Erro ao atualizar grupo")

@app.delete("/api/groups/{group_id}", status_code=204)
async def delete_group(group_id: int, admin_user: UserProfile = Depends(require_page_access('users'))):
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

@app.get("/api/my-admin-groups", response_model=List[Grupo])
async def get_my_admin_groups(current_user: UserProfile = Depends(get_current_user)):
    try:
        if current_user.role == 'admin':
            resp = await asyncio.to_thread(
                supabase.table('grupos').select('*').order('nome').execute
            )
        else:
            resp = await asyncio.to_thread(
                supabase.table('grupos').select('*').eq('admin_id', current_user.id).order('nome').execute
            )
        return resp.data
    except Exception as e:
        logging.error(f"Erro ao buscar grupos do admin: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar seus grupos")

# --------------------------------------------------------------------------
# --- ENDPOINTS DE ASSOCIAÇÕES USUÁRIO-GRUPO ---
# --------------------------------------------------------------------------
@app.post("/api/user-groups", response_model=UserGroup)
async def add_user_to_group(user_group: UserGroupCreate, admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        user_resp = await asyncio.to_thread(
            supabase.table('profiles').select('id, full_name').eq('id', user_group.user_id).execute
        )
        if not user_resp.data:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        
        group_resp = await asyncio.to_thread(
            supabase.table('grupos').select('dias_acesso, max_usuarios').eq('id', user_group.group_id).execute
        )
        if not group_resp.data:
            raise HTTPException(status_code=404, detail="Grupo não encontrado")
        
        user_count_resp = await asyncio.to_thread(
            supabase.table('user_groups').select('id', count='exact').eq('group_id', user_group.group_id).execute
        )
        current_user_count = user_count_resp.count if user_count_resp.count is not None else 0
        max_users = group_resp.data[0]['max_usuarios']
        
        if current_user_count >= max_users:
            raise HTTPException(
                status_code=400, 
                detail=f"Limite máximo de {max_users} usuários atingido para este grupo"
            )
        
        if user_group.data_expiracao:
            data_expiracao = user_group.data_expiracao
        else:
            dias_acesso = group_resp.data[0]['dias_acesso']
            data_expiracao = calcular_data_expiracao(dias_acesso)
        
        user_group_data = {
            'user_id': user_group.user_id,
            'group_id': user_group.group_id,
            'data_expiracao': data_expiracao.isoformat()
        }
        
        resp = await asyncio.to_thread(
            supabase.table('user_groups').insert(user_group_data).execute
        )
        return resp.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao adicionar usuário ao grupo: {e}")
        raise HTTPException(status_code=400, detail="Erro ao adicionar usuário ao grupo")

@app.get("/api/user-groups", response_model=List[UserGroupWithDetails])
async def list_user_groups(
    user_id: Optional[str] = Query(None),
    group_id: Optional[int] = Query(None),
    admin_user: UserProfile = Depends(require_page_access('users'))
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
        
        if not user_groups_response.data:
            return []
        
        user_groups_with_details = []
        
        for user_group in user_groups_response.data:
            try:
                group_response = await asyncio.to_thread(
                    supabase_admin.table('grupos').select('*').eq('id', user_group['group_id']).single().execute
                )
                
                profile_response = await asyncio.to_thread(
                    supabase_admin.table('profiles').select('full_name').eq('id', user_group['user_id']).execute
                )
                
                user_email = "N/A"
                try:
                    auth_response = await asyncio.to_thread(
                        lambda: supabase_admin.auth.admin.get_user_by_id(user_group['user_id'])
                    )
                    if auth_response.user:
                        user_email = auth_response.user.email
                except Exception as e:
                    logging.error(f"Erro ao buscar email do usuário {user_group['user_id']}: {e}")
                
                user_name = profile_response.data[0]['full_name'] if profile_response.data and len(profile_response.data) > 0 else 'N/A'
                grupo_data = group_response.data if group_response.data else {'nome': 'N/A', 'dias_acesso': 0, 'max_usuarios': 0}
                
                user_group_detail = UserGroupWithDetails(
                    id=user_group['id'],
                    user_id=user_group['user_id'],
                    group_id=user_group['group_id'],
                    data_expiracao=user_group['data_expiracao'],
                    created_at=user_group['created_at'],
                    grupo_nome=grupo_data['nome'],
                    grupo_dias_acesso=grupo_data['dias_acesso'],
                    grupo_max_usuarios=grupo_data['max_usuarios'],
                    user_name=user_name,
                    user_email=user_email
                )
                user_groups_with_details.append(user_group_detail)
            except Exception as e:
                logging.error(f"Erro ao processar user_group {user_group['id']}: {e}")
                continue
        
        return user_groups_with_details
        
    except Exception as e:
        logging.error(f"Erro ao listar associações usuário-grupo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno ao listar associações: {str(e)}")

@app.delete("/api/user-groups/{user_group_id}", status_code=204)
async def remove_user_from_group(user_group_id: int, admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        await asyncio.to_thread(
            lambda: supabase.table('user_groups').delete().eq('id', user_group_id).execute()
        )
        return
    except Exception as e:
        logging.error(f"Erro ao remover usuário do grupo: {e}")
        raise HTTPException(status_code=400, detail="Erro ao remover usuário do grupo")

# --------------------------------------------------------------------------
# --- ENDPOINTS DE USUÁRIOS POR ADMIN DE GRUPO ---
# --------------------------------------------------------------------------
@app.post("/api/group-users/{group_id}")
async def create_group_user(
    group_id: int,
    user_data: GroupUserCreate,
    current_user: UserProfile = Depends(get_current_user)
):
    if current_user.role != 'admin' and (not current_user.group_admin_of or group_id not in current_user.group_admin_of):
        raise HTTPException(status_code=403, detail="Acesso negado: você não é administrador deste grupo")
    
    try:
        group_resp = await asyncio.to_thread(
            supabase.table('grupos').select('*').eq('id', group_id).single().execute
        )
        if not group_resp.data:
            raise HTTPException(status_code=404, detail="Grupo não encontrado")
        
        group_info = group_resp.data
        
        user_count_resp = await asyncio.to_thread(
            supabase.table('user_groups').select('id', count='exact').eq('group_id', group_id).execute
        )
        current_user_count = user_count_resp.count if user_count_resp.count is not None else 0
        
        if current_user_count >= group_info['max_usuarios']:
            raise HTTPException(
                status_code=400, 
                detail=f"Limite máximo de {group_info['max_usuarios']} usuários atingido para este grupo"
            )
        
        created_user_res = await asyncio.to_thread(
            lambda: supabase_admin.auth.admin.create_user({
                "email": user_data.email, 
                "password": user_data.password,
                "email_confirm": True, 
                "user_metadata": {'full_name': user_data.full_name}
            })
        )
        
        user_id = created_user_res.user.id
        logging.info(f"Usuário criado no Auth com ID: {user_id} para o grupo {group_id}")
        
        admin_profile = await asyncio.to_thread(
            supabase.table('profiles').select('allowed_pages').eq('id', group_info['admin_id']).single().execute
        )
        
        allowed_pages = admin_profile.data.get('allowed_pages', []) if admin_profile.data else []
        
        profile_update_response = await asyncio.to_thread(
            supabase_admin.table('profiles').update({
                'full_name': user_data.full_name,
                'role': 'user',
                'allowed_pages': allowed_pages
            }).eq('id', user_id).execute
        )
        
        if not profile_update_response.data:
            logging.warning(f"Usuário {user_id} foi criado no Auth, mas o perfil não foi encontrado para atualizar.")
            raise HTTPException(status_code=404, detail="Usuário criado, mas o perfil não foi encontrado para definir as permissões.")
        
        dias_acesso = group_info['dias_acesso']
        data_expiracao = calcular_data_expiracao(dias_acesso)
        
        user_group_data = {
            'user_id': user_id,
            'group_id': group_id,
            'data_expiracao': data_expiracao.isoformat()
        }
        
        await asyncio.to_thread(
            supabase.table('user_groups').insert(user_group_data).execute
        )
        
        logging.info(f"Usuário {user_id} adicionado ao grupo {group_id} com expiração em {data_expiracao}")
        
        return {"message": "Usuário criado e adicionado ao grupo com sucesso"}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao criar usuário no grupo: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao criar usuário no grupo: {str(e)}")

@app.get("/api/group-users/{group_id}")
async def get_group_users(
    group_id: int,
    current_user: UserProfile = Depends(get_current_user)
):
    if current_user.role != 'admin' and (not current_user.group_admin_of or group_id not in current_user.group_admin_of):
        raise HTTPException(status_code=403, detail="Acesso negado: você não é administrador deste grupo")
    
    try:
        user_groups_response = await asyncio.to_thread(
            supabase_admin.table('user_groups').select('*')
            .eq('group_id', group_id)
            .order('created_at', desc=True)
            .execute
        )
        
        if not user_groups_response.data:
            return []
        
        group_users = []
        
        for user_group in user_groups_response.data:
            profile_response = await asyncio.to_thread(
                supabase_admin.table('profiles').select('full_name, allowed_pages').eq('id', user_group['user_id']).execute
            )
            
            user_email = "N/A"
            try:
                auth_response = await asyncio.to_thread(
                    lambda: supabase_admin.auth.admin.get_user_by_id(user_group['user_id'])
                )
                if auth_response.user:
                    user_email = auth_response.user.email
            except Exception as e:
                logging.error(f"Erro ao buscar email do usuário {user_group['user_id']}: {e}")
            
            user_name = profile_response.data[0]['full_name'] if profile_response.data and len(profile_response.data) > 0 else 'N/A'
            allowed_pages = profile_response.data[0]['allowed_pages'] if profile_response.data and len(profile_response.data) > 0 else []
            
            today = date.today()
            is_active = user_group['data_expiracao'] >= today.isoformat()
            status = "Ativo" if is_active else "Expirado"
            
            group_user_info = {
                'user_id': user_group['user_id'],
                'user_name': user_name,
                'user_email': user_email,
                'allowed_pages': allowed_pages,
                'data_expiracao': user_group['data_expiracao'],
                'status': status,
                'created_at': user_group['created_at']
            }
            group_users.append(group_user_info)
        
        return group_users
        
    except Exception as e:
        logging.error(f"Erro ao buscar usuários do grupo: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar usuários do grupo")

@app.put("/api/group-users/{group_id}/{user_id}")
async def update_group_user(
    group_id: int,
    user_id: str,
    user_data: GroupUserUpdate,
    current_user: UserProfile = Depends(get_current_user)
):
    if current_user.role != 'admin' and (not current_user.group_admin_of or group_id not in current_user.group_admin_of):
        raise HTTPException(status_code=403, detail="Acesso negado: você não é administrador deste grupo")
    
    try:
        user_group_resp = await asyncio.to_thread(
            supabase.table('user_groups').select('id')
            .eq('group_id', group_id)
            .eq('user_id', user_id)
            .execute
        )
        
        if not user_group_resp.data:
            raise HTTPException(status_code=404, detail="Usuário não encontrado neste grupo")
        
        update_data = {}
        if user_data.full_name is not None:
            update_data['full_name'] = user_data.full_name
        if user_data.allowed_pages is not None:
            update_data['allowed_pages'] = user_data.allowed_pages
        
        if update_data:
            await asyncio.to_thread(
                lambda: supabase.table('profiles').update(update_data)
                .eq('id', user_id)
                .execute()
            )
        
        logging.info(f"Usuário {user_id} atualizado no grupo {group_id} pelo admin {current_user.id}")
        
        return {"message": "Usuário atualizado com sucesso"}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao atualizar usuário do grupo: {e}")
        raise HTTPException(status_code=500, detail="Erro ao atualizar usuário do grupo")

@app.delete("/api/group-users/{group_id}/{user_id}")
async def remove_user_from_group_admin(
    group_id: int,
    user_id: str,
    current_user: UserProfile = Depends(get_current_user)
):
    if current_user.role != 'admin' and (not current_user.group_admin_of or group_id not in current_user.group_admin_of):
        raise HTTPException(status_code=403, detail="Acesso negado: você não é administrador deste grupo")
    
    try:
        user_group_resp = await asyncio.to_thread(
            supabase.table('user_groups').select('id')
            .eq('group_id', group_id)
            .eq('user_id', user_id)
            .execute
        )
        
        if not user_group_resp.data:
            raise HTTPException(status_code=404, detail="Usuário não encontrado neste grupo")
        
        await asyncio.to_thread(
            lambda: supabase.table('user_groups').delete()
            .eq('group_id', group_id)
            .eq('user_id', user_id)
            .execute()
        )
        
        logging.info(f"Usuário {user_id} removido do grupo {group_id} pelo admin {current_user.id}")
        
        return {"message": "Usuário removido do grupo com sucesso"}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao remover usuário do grupo: {e}")
        raise HTTPException(status_code=500, detail="Erro ao remover usuário do grupo")

# --------------------------------------------------------------------------
# --- OUTROS ENDPOINTS (MANTIDOS ORIGINAIS) ---
# --------------------------------------------------------------------------

# Gerenciamento de Perfil Pessoal
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

# Gerenciamento de Usuários
@app.post("/api/users")
async def create_user(user_data: UserCreate, admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        logging.info(f"Admin {admin_user.id} tentando criar usuário: {user_data.email}")
        
        created_user_res = await asyncio.to_thread(
            lambda: supabase_admin.auth.admin.create_user({
                "email": user_data.email, 
                "password": user_data.password,
                "email_confirm": True, 
                "user_metadata": {'full_name': user_data.full_name}
            })
        )
        
        user_id = created_user_res.user.id
        logging.info(f"Usuário criado no Auth com ID: {user_id}")
        
        profile_update_response = await asyncio.to_thread(
            supabase_admin.table('profiles').update({
                'full_name': user_data.full_name,
                'role': user_data.role, 
                'allowed_pages': user_data.allowed_pages
            }).eq('id', user_id).execute
        )
        
        if not profile_update_response.data:
             logging.warning(f"Usuário {user_id} foi criado no Auth, mas o perfil não foi encontrado para atualizar.")
             raise HTTPException(status_code=404, detail="Usuário criado, mas o perfil não foi encontrado para definir as permissões.")
        
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
        await asyncio.to_thread(
            lambda: supabase_admin.table('profiles').update(user_data.dict()).eq('id', user_id).execute()
        )
        return {"message": "Usuário atualizado com sucesso"}
    except Exception as e:
        logging.error(f"Erro ao atualizar usuário: {e}")
        raise HTTPException(status_code=500, detail="Erro ao atualizar usuário")
        
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

            users.append({
                "id": profile["id"],
                "full_name": profile.get("full_name"),
                "role": profile.get("role"),
                "allowed_pages": profile.get("allowed_pages"),
                "avatar_url": profile.get("avatar_url"),
                "email": email or "N/A"
            })

        return users

    except Exception as e:
        logging.error(f"Erro ao listar usuários: {e}")
        raise HTTPException(status_code=500, detail="Erro interno ao listar usuários")

@app.delete("/api/users/{user_id}", status_code=204)
async def delete_user(user_id: str, admin_user: UserProfile = Depends(require_page_access('users'))):
    try:
        await asyncio.to_thread(
            lambda: supabase_admin.auth.admin.delete_user(user_id)
        )
        logging.info(f"Usuário com ID {user_id} foi excluído pelo admin {admin_user.id}")
        return
    except Exception as e:
        logging.error(f"Falha ao excluir usuário {user_id}: {e}")
        raise HTTPException(status_code=400, detail="Não foi possível excluir o usuário.")

# Gerenciamento de Categorias
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
    
# Gerenciamento da Coleta
@app.post("/api/trigger-collection")
async def trigger_collection(
    request: CollectionRequest, 
    background_tasks: BackgroundTasks, 
    user: UserProfile = Depends(require_page_access('coleta'))
):
    if collection_status["status"] == "RUNNING":
        raise HTTPException(status_code=409, detail="A coleta de dados já está em andamento.")
    
    collection_status.update(initial_status.copy())
    
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
        request.dias_pesquisa
    )
    
    market_count = len(request.selected_markets) if request.selected_markets else "todos"
    return {
        "message": f"Processo de coleta iniciado para {market_count} mercados ({request.dias_pesquisa} dias)."
    }

@app.get("/api/collection-status")
async def get_collection_status(user: UserProfile = Depends(get_current_user)):
    return collection_status

# Gerenciamento de Supermercados
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

# Endpoint Público de Supermercados
@app.get("/api/supermarkets/public", response_model=List[Supermercado])
async def list_supermarkets_public():
    resp = await asyncio.to_thread(
        supabase.table('supermercados').select('id, nome, cnpj, endereco').order('nome').execute
    )
    return resp.data

# Gerenciamento de Dados Históricos
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

# LOGS DE USUÁRIOS
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

# NOVOS ENDPOINTS PARA MONITORAMENTO COMPLETO
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

# Endpoints Públicos e de Usuário Logado
@app.get("/api/products-log")
async def get_products_log(page: int = 1, page_size: int = 50, user: UserProfile = Depends(require_page_access('product_log'))):
    start_index = (page - 1) * page_size
    end_index = start_index + page_size - 1
    response = await asyncio.to_thread(
        supabase.table('produtos').select('*', count='exact').order('created_at', desc=True).range(start_index, end_index).execute
    )
    return {"data": response.data, "total_count": response.count}

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
    
    resp = await asyncio.to_thread(
        supabase.table('supermercados').select('cnpj, nome').in_('cnpj', request.cnpjs).execute
    )
    mercados_map = {m['cnpj']: m['nome'] for m in resp.data}
    
    tasks = [
        collector_service.consultar_produto_realtime(
            request.produto, 
            {"cnpj": cnpj, "nome": mercados_map.get(cnpj, cnpj)}, 
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

@app.get("/api/dashboard/summary")
async def get_dashboard_summary(start_date: date, end_date: date, cnpjs: Optional[List[str]] = Query(None), user: UserProfile = Depends(get_current_user)):
    params = {'start_date': str(start_date), 'end_date': str(end_date)}
    if cnpjs: 
        params['market_cnpjs'] = cnpjs
    
    response = await asyncio.to_thread(
        lambda: supabase.rpc('get_dashboard_summary', params).execute()
    )
    
    if not response.data:
        return {"total_mercados": 0, "total_produtos": 0, "total_coletas": 0, "ultima_coleta": None}
    return response.data[0]

@app.get("/api/dashboard/stats")
async def get_dashboard_stats(start_date: date, end_date: date, cnpjs: Optional[List[str]] = Query(None), user: UserProfile = Depends(require_page_access('dashboard'))):
    params = {'start_date': str(start_date), 'end_date': str(end_date)}
    if cnpjs: 
        params['market_cnpjs'] = cnpjs
    
    top_products_resp = await asyncio.to_thread(
        lambda: supabase.rpc('get_top_products_by_filters', params).execute()
    )
    top_markets_resp = await asyncio.to_thread(
        lambda: supabase.rpc('get_top_markets_by_filters', params).execute()
    )
    
    return {"top_products": top_products_resp.data or [], "top_markets": top_markets_resp.data or []}

@app.get("/api/dashboard/bargains")
async def get_dashboard_bargains(start_date: date, end_date: date, cnpjs: Optional[List[str]] = Query(None), category: Optional[str] = Query(None), user: UserProfile = Depends(require_page_access('dashboard'))):
    params = {'start_date': str(start_date), 'end_date': str(end_date)}
    if cnpjs: 
        params['market_cnpjs'] = cnpjs
    
    response = await asyncio.to_thread(
        lambda: supabase.rpc('get_cheapest_products_by_barcode', params).execute()
    )
    
    if not response.data: 
        return []
    
    if not category or category == 'Todos': 
        return response.data
    
    category_rules_resp = await asyncio.to_thread(
        supabase.table('categorias').select('palavras_chave, regra_unidade').eq('nome', category).single().execute
    )
    
    if not category_rules_resp.data: 
        return []
    
    category_rules = category_rules_resp.data
    df = pd.DataFrame(response.data)
    keywords = category_rules.get('palavras_chave', [])
    
    if not keywords: 
        return response.data
    
    regex_pattern = '|'.join(keywords)
    
    if category_rules.get('regra_unidade') == 'KG':
        filtered_df = df[df['nome_produto'].str.contains(regex_pattern, case=False, na=False) & (df['tipo_unidade'] == 'KG')]
    else:
        filtered_df = df[df['nome_produto'].str.contains(regex_pattern, case=False, na=False)]
    
    return filtered_df.to_dict(orient='records')

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
# --- ENDPOINT RAIZ ---
# --------------------------------------------------------------------------

@app.get("/")
def read_root():
    return {"message": "Bem-vindo à API de Preços AL - Versão 3.5.1"}

# Servir o Frontend
app.mount("/", StaticFiles(directory="web", html=True), name="static")
