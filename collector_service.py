import asyncio
import aiohttp
import hashlib
from datetime import datetime, timedelta
import logging
import time
from typing import Dict, Any, List, Optional
import unicodedata

# --- Configurações Otimizadas ---
ECONOMIZA_ALAGOAS_API_URL = 'http://api.sefaz.al.gov.br/sfz-economiza-alagoas-api/api/public/produto/pesquisa'
REGISTROS_POR_PAGINA = 50
RETRY_MAX = 3
RETRY_BASE_MS = 2000
CONCORRENCIA_PRODUTOS = 4
TIMEOUT_POR_MERCADO_SEGUNDOS = 20 * 60

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] %(message)s')

# --- Funções Utilitárias ---
def normalizar_texto(txt: str) -> str:
    if not txt: return ""
    return txt.lower().strip()

def remover_acentos(texto: str) -> str:
    """Remove acentos e caracteres especiais do texto"""
    if not texto: return ""
    return ''.join(
        c for c in unicodedata.normalize('NFD', texto)
        if unicodedata.category(c) != 'Mn'
    ).lower()

def gerar_id_registro(item: Dict[str, Any]) -> str:
    h = hashlib.sha1()
    h.update(f"{item.get('cnpj_supermercado')}|{item.get('id_produto')}|{item.get('preco_produto')}|{item.get('data_ultima_venda')}".encode('utf-8'))
    return h.digest().hex()[:16]

def detectar_tipo_unidade(nome_produto: str, unidade_medida_api: str) -> str:
    nome_lower = nome_produto.lower(); unidade_lower = unidade_medida_api.lower() if unidade_medida_api else ""
    palavras_kg = ['kg', 'quilo', ' a granel'];
    if unidade_lower == 'kg': return 'KG'
    for palavra in palavras_kg:
        if palavra in nome_lower or palavra in unidade_lower: return 'KG'
    return 'UN'

# --- Lógica Principal de Coleta ---
async def consultar_produto(produto: str, mercado: Dict[str, str], data_coleta: str, token: str, coleta_id: int, dias_pesquisa: int = 3) -> List[Dict[str, Any]]:
    cnpj = mercado['cnpj']
    pagina = 1
    todos_os_itens = []
    async with aiohttp.ClientSession() as session:
        while True:
            request_body = {
                "produto": {"descricao": produto.upper()}, 
                "estabelecimento": {"individual": {"cnpj": cnpj}},
                "dias": dias_pesquisa, 
                "pagina": pagina, 
                "registrosPorPagina": REGISTROS_POR_PAGINA
            }
            headers = {'AppToken': token, 'Content-Type': 'application/json'}
            response_data = None
            for attempt in range(RETRY_MAX):
                try:
                    await asyncio.sleep(0.3)
                    async with session.post(ECONOMIZA_ALAGOAS_API_URL, json=request_body, headers=headers, timeout=45) as response:
                        if response.status == 200:
                            response_data = await response.json(); break
                        else:
                            logging.warning(f"API ERRO: Status {response.status} para '{produto}' em {mercado['nome']}. Tentativa {attempt + 1}/{RETRY_MAX}")
                            await asyncio.sleep((RETRY_BASE_MS / 1000) * (2 ** attempt))
                except Exception as e:
                    logging.error(f"CONEXÃO ERRO para '{produto}' em {mercado['nome']}: {e}. Tentativa {attempt + 1}/{RETRY_MAX}")
                    await asyncio.sleep((RETRY_BASE_MS / 1000) * (2 ** attempt))
            if not response_data:
                logging.error(f"FALHA TOTAL ao coletar '{produto}' em {mercado['nome']}."); return []
            conteudo = response_data.get('conteudo', [])
            for item in conteudo:
                prod_info = item.get('produto', {}); venda_info = prod_info.get('venda', {})
                nome_produto_original = prod_info.get('descricao', ''); unidade_medida_original = prod_info.get('unidadeMedida', '')
                registro = {
                    'nome_supermercado': mercado['nome'], 'cnpj_supermercado': cnpj,
                    'nome_produto': nome_produto_original, 'nome_produto_normalizado': normalizar_texto(nome_produto_original),
                    'id_produto': prod_info.get('gtin') or normalizar_texto(f"{nome_produto_original}_{unidade_medida_original}"),
                    'preco_produto': venda_info.get('valorVenda'), 'unidade_medida': unidade_medida_original,
                    'data_ultima_venda': venda_info.get('dataVenda'), 'data_coleta': data_coleta, 
                    'codigo_barras': prod_info.get('gtin'), 'tipo_unidade': detectar_tipo_unidade(nome_produto_original, unidade_medida_original),
                    'coleta_id': coleta_id
                }
                if registro['preco_produto'] is not None:
                    registro['id_registro'] = gerar_id_registro(registro); todos_os_itens.append(registro)
            total_paginas = response_data.get('totalPaginas', 1)
            logging.info(f"Coletado: {mercado['nome']} - '{produto}' - Página {pagina}/{total_paginas} - Itens: {len(conteudo)} - Dias: {dias_pesquisa}")
            if pagina >= total_paginas: break
            pagina += 1
    return todos_os_itens

# FUNÇÃO PARA BUSCA EM TEMPO REAL (MANTÉM 3 DIAS FIXOS)
async def consultar_produto_realtime(produto: str, mercado: Dict[str, str], data_coleta: str, token: str, coleta_id: int) -> List[Dict[str, Any]]:
    """
    Função específica para busca em tempo real - SEMPRE usa 3 dias
    """
    return await consultar_produto(produto, mercado, data_coleta, token, coleta_id, dias_pesquisa=3)

async def coletar_dados_mercado(mercado: Dict[str, Any], token: str, supabase_client: Any, status_tracker: Dict[str, Any], coleta_id: int, dias_pesquisa: int):
    produtos_a_buscar = status_tracker['produtos_lista']
    total_produtos = len(produtos_a_buscar)
    registros_salvos_neste_mercado = 0
    status_tracker['currentMarket'] = mercado['nome']
    status_tracker['productsProcessedInMarket'] = 0
    
    async def task_wrapper(prod, index):
        status_tracker['currentProduct'] = prod
        status_tracker['productsProcessedInMarket'] = index + 1
        resultados = await consultar_produto(prod, mercado, datetime.now().isoformat(), token, coleta_id, dias_pesquisa)
        if resultados:
            status_tracker['totalItemsFound'] += len(resultados)
        return resultados

    tasks = [task_wrapper(produto, i) for i, produto in enumerate(produtos_a_buscar)]
    resultados_por_produto = await asyncio.gather(*tasks)
    
    resultados_finais = [item for sublist in resultados_por_produto for item in sublist]
    registros_unicos = {registro['id_registro']: registro for registro in resultados_finais}
    resultados_unicos_lista = list(registros_unicos.values())
    
    logging.info(f"COLETA PARA '{mercado['nome']}': {len(resultados_finais)} brutos -> {len(resultados_unicos_lista)} únicos. (Dias: {dias_pesquisa})")
    
    if resultados_unicos_lista:
        dados_para_db = [{k: v for k, v in item.items() if k != 'id_produto'} for item in resultados_unicos_lista]
        try:
            supabase_client.table('produtos').upsert(dados_para_db, on_conflict='id_registro').execute()
            registros_salvos = len(dados_para_db)
            logging.info(f"-----> SUPABASE SUCESSO: {registros_salvos} salvos para {mercado['nome']}.")
        except Exception as e:
            logging.error(f"-----> SUPABASE ERRO: Falha ao salvar para {mercado['nome']}: {e}")
            
    return registros_salvos

async def coletar_dados_mercado_com_timeout(mercado: Dict[str, Any], token: str, supabase_client: Any, status_tracker: Dict[str, Any], coleta_id: int, dias_pesquisa: int):
    start_time_market = time.time()
    registros_salvos = 0
    try:
        registros_salvos = await asyncio.wait_for(
            coletar_dados_mercado(mercado, token, supabase_client, status_tracker, coleta_id, dias_pesquisa),
            timeout=TIMEOUT_POR_MERCADO_SEGUNDOS
        )
    except asyncio.TimeoutError:
        logging.error(f"TIMEOUT! Coleta para {mercado['nome']} excedeu {TIMEOUT_POR_MERCADO_SEGUNDOS / 60} min.")
    
    end_time_market = time.time()
    duration_market = end_time_market - start_time_market
    
    status_tracker['report']['marketBreakdown'].append({
        "marketName": mercado['nome'], 
        "itemsFound": registros_salvos, 
        "duration": round(duration_market, 2),
        "diasPesquisa": dias_pesquisa
    })
    
    status_tracker['marketsProcessed'] += 1
    
    elapsed_time = time.time() - status_tracker['startTime']
    markets_processed = status_tracker['marketsProcessed']
    total_markets = status_tracker['totalMarkets']
    
    if markets_processed > 0:
        time_per_market = elapsed_time / markets_processed
        remaining_markets = total_markets - markets_processed
        eta = remaining_markets * time_per_market
        status_tracker['etaSeconds'] = round(eta)
    
    status_tracker['progressPercent'] = (markets_processed / total_markets) * 100
    status_tracker['progresso'] = f"Processado {mercado['nome']} ({markets_processed}/{total_markets}) - {dias_pesquisa} dias"
    return registros_salvos

async def run_full_collection(
    supabase_client: Any, 
    token: str, 
    status_tracker: Dict[str, Any],
    selected_markets: Optional[List[str]] = None,
    dias_pesquisa: int = 3
):
    """
    Executa coleta completa com opções flexíveis
    
    Args:
        supabase_client: Cliente Supabase
        token: Token de autenticação
        status_tracker: Tracker de status
        selected_markets: Lista de CNPJs dos mercados a coletar (None = todos)
        dias_pesquisa: Número de dias para pesquisa (1 a 7)
    """
    logging.info(f"Iniciando processo de coleta completa - Mercados: {len(selected_markets) if selected_markets else 'Todos'}, Dias: {dias_pesquisa}")
    coleta_id = -1
    
    # Validar dias de pesquisa (1 a 7)
    if dias_pesquisa not in range(1, 8):
        logging.warning(f"Dias de pesquisa inválido: {dias_pesquisa}. Usando padrão: 3")
        dias_pesquisa = 3
    
    try:
        # Criar registro de coleta
        coleta_registro = supabase_client.table('coletas').insert({
            'dias_pesquisa': dias_pesquisa,
            'mercados_selecionados': selected_markets
        }).execute()
        coleta_id = coleta_registro.data[0]['id']
        logging.info(f"Novo registro de coleta criado com ID: {coleta_id} - Dias: {dias_pesquisa}")
        
        # Buscar mercados (todos ou apenas os selecionados) - SEM ENDEREÇO
        query = supabase_client.table('supermercados').select('nome, cnpj')
        if selected_markets:
            query = query.in_('cnpj', selected_markets)
        
        response = query.execute()
        if not response.data: 
            raise Exception("Nenhum supermercado encontrado para coleta.")
        
        MERCADOS = response.data
        logging.info(f"Mercados selecionados para coleta: {len(MERCADOS)}")
        
        # LISTA COMPLETA DE PRODUTOS SEM ACENTOS
        NOMES_PRODUTOS = [
            # MERCEARIA (ALIMENTOS BÁSICOS E SECOS)
            'arroz', 'arroz tipo 1', 'arroz tipo 2', 'arroz integral', 'arroz parboilizado', 
            'arroz agulhinha', 'arroz branco', 'feijao', 'feijao carioca', 'feijao preto', 
            'feijao branco', 'feijao fradinho', 'feijao verde', 'acucar', 'acucar cristal', 
            'acucar refinado', 'acucar mascavo', 'acucar demerara', 'adocante', 'adocante em po', 
            'adocante liquido', 'sal', 'sal refinado', 'sal grosso', 'sal light', 'oleo', 
            'oleo de soja', 'oleo de girassol', 'oleo de milho', 'oleo de canola', 'azeite', 
            'azeite de oliva', 'azeite extra virgem', 'vinagre', 'vinagre de alcool', 
            'vinagre de maca', 'cafe', 'cafe em po', 'cafe torrado', 'cafe moido', 
            'cafe soluvel', 'cafe descafeinado', 'filtro de cafe', 'farinha de trigo', 
            'farinha de mandioca', 'farinha de rosca', 'farinha de milho', 'fubá', 
            'amido de milho', 'moreira', 'macarrao', 'macarrao espaguete', 'macarrao parafuso', 
            'macarrao pena', 'macarrao ninho', 'massa para lasanha', 'massa para pastel', 
            'massa para pizza', 'molho de tomate', 'extrato de tomate', 'polpa de tomate', 
            'milho', 'milho verde', 'ervilha', 'seleta de legumes', 'palmito', 'azeitona', 
            'conserva', 'atum', 'sardinha', 'sardinha em lata', 'maionese', 'ketchup', 
            'mostarda', 'catchup', 'caldo de carne', 'caldo de galinha', 'caldo de legumes', 
            'tempero', 'tempero completo', 'alho e sal', 'cebola e sal', 'pimenta', 
            'pimenta do reino', 'cominho', 'acafrao', 'paprica', 'orégano', 'manjericao', 
            'salsa', 'cebolinha', 'azeite de dende', 'leite de coco', 'fermento', 
            'fermento em po', 'fermento biologico', 'gelatina', 'gelatina em po', 
            'massa para bolo', 'massa pronta', 'farinha lactea', 'nisso', 'maizena', 
            'creme de arroz', 'flocao', 'canjica', 'rapadura', 'melado', 'mel', 
            'geleia', 'geleia de mocoto', 'mocoto', 'paçoca', 'pacoquinha', 'amendoim', 
            'castanha', 'castanha de caju', 'castanha do para', 'amendoa', 'nozes', 
            'passas', 'damasco', 'ameixa', 'figo', 'tamara', 'bala', 'bombom', 'chocolate', 
            'chocolate em po', 'achocolatado', 'nescau', 'toddy', 'ovomaltine', 
            
            # HORTIFRÚTI (FRUTAS, VERDURAS E LEGUMES)
            'alho', 'cebola', 'cebola roxa', 'cebola branca', 'batata', 'batata inglesa', 
            'batata doce', 'batata baroa', 'batata salsa', 'mandioca', 'aipim', 'macaxeira', 
            'cará', 'inhame', 'tomate', 'tomate italiano', 'tomate cereja', 'tomate caqui', 
            'cenoura', 'beterraba', 'chuchu', 'pepino', 'pimentao', 'pimentao verde', 
            'pimentao amarelo', 'pimentao vermelho', 'abobora', 'abobrinha', 'abobrinha italiana', 
            'berinjela', 'jilo', 'maxixe', 'quiabo', 'vagem', 'ervilha torta', 'brocolis', 
            'couve flor', 'repolho', 'repolho roxo', 'couve', 'couve manteiga', 'alface', 
            'alface crespa', 'alface americana', 'alface roxa', 'rucula', 'agriao', 'espinafre', 
            'acelga', 'salsa', 'cebolinha', 'coentro', 'manjericao', 'hortela', 'alecrim', 
            'tomilho', 'louro', 'gengibre', 'cebolinha verde', 'salsinha', 'banana', 
            'banana prata', 'banana nanica', 'banana da terra', 'banana ouro', 'banana maçã', 
            'maca', 'maca argentina', 'maca fuji', 'maca gala', 'pera', 'pera williams', 
            'pera portuguesa', 'uva', 'uva italiana', 'uva rubi', 'uva thompson', 'uva branca', 
            'uva preta', 'mamao', 'mamao formosa', 'mamao papaia', 'melancia', 'melao', 
            'melao amarelo', 'melao pele de sapo', 'melao cantaloupe', 'melao galia', 
            'abacaxi', 'abacaxi perola', 'abacaxi havaí', 'manga', 'manga tommy', 
            'manga palmer', 'manga espada', 'manga rosa', 'limao', 'limao taiti', 
            'limao cravo', 'limao siciliano', 'laranja', 'laranja pera', 'laranja bahia', 
            'laranja lima', 'laranja da terra', 'tangerina', 'tangerina ponkan', 
            'tangerina murcott', 'bergamota', 'mexerica', 'caju', 'goiaba', 'goiaba branca', 
            'goiaba vermelha', 'maracuja', 'maracuja doce', 'maracuja azedo', 'caqui', 
            'caqui fuyu', 'caqui rama forte', 'kiwi', 'kiwi verde', 'kiwi gold', 'ameixa', 
            'ameixa vermelha', 'ameixa preta', 'ameixa seca', 'figo', 'figo fresco', 
            'figo seco', 'carambola', 'jabuticaba', 'pitanga', 'seriguela', 'coco', 
            'coco verde', 'coco seco', 'agua de coco', 'ovos', 'ovo branco', 'ovo vermelho', 
            'ovo caipira', 'ovo de codorna', 
            
            # AÇOUGUE (CARNES)
            'carne bovina', 'bife', 'bife ancho', 'bife de chorizo', 'contra file', 
            'file mignon', 'picanha', 'alcatra', 'coxao mole', 'coxao duro', 'patinho', 
            'maminha', 'cupim', 'costela', 'costela de vaca', 'paleta', 'acém', 'musculo', 
            'carne moída', 'carne de sol', 'carne seca', 'jabá', 'carna seca', 'hamburguer', 
            'hamburguer bovino', 'linguica', 'linguica toscana', 'linguica calabresa', 
            'linguica portuguesa', 'linguica de frango', 'linguica de pernil', 'salsicha', 
            'salsicha hot dog', 'salsicha viena', 'salsichao', 'paio', 'salame', 
            'presunto cru', 'prosciutto', 'carne suina', 'bisteca suina', 'lombo suino', 
            'pernil', 'pernil suino', 'panceta', 'toucinho', 'bacon', 'carneiro', 
            'cordeiro', 'frango', 'frango inteiro', 'frango cortado', 'peito de frango', 
            'coxa de frango', 'sobrecoxa de frango', 'asa de frango', 'file de frango', 
            'coracao de frango', 'figado de frango', 'moela de frango', 'peru', 'chester', 
            'faisao', 'codorna', 'coelho', 'carne de avestruz', 
            
            # FRIOS E LATICÍNIOS
            'presunto', 'presunto defumado', 'presunto cozido', 'presunto parma', 
            'presunto pernil', 'queijo', 'queijo mussarela', 'queijo prato', 
            'queijo minas', 'queijo minas frescal', 'queijo minas padrao', 
            'queijo coalho', 'queijo provolone', 'queijo parmesao', 'queijo gorgonzola', 
            'queijo brie', 'queijo camembert', 'queijo cheddar', 'queijo cream cheese', 
            'queijo cottage', 'queijo ricota', 'queijo requeijao', 'requeijao cremoso', 
            'requeijao tradicional', 'mortadela', 'mortadela comum', 'mortadela premium', 
            'mortadela com azeitona', 'salame', 'salame italiano', 'salame milano', 
            'salame tipo copa', 'apresuntado', 'peito de peru', 'peito de frango defumado', 
            'blanquet de peru', 'leite', 'leite integral', 'leite desnatado', 
            'leite semidesnatado', 'leite longa vida', 'leite em po', 'leite condensado', 
            'leite fermentado', 'creme de leite', 'creme de leite fresco', 
            'creme de leite uht', 'nata', 'chantilly', 'iogurte', 'iogurte natural', 
            'iogurte grego', 'iogurte com frutas', 'iogurte bebivel', 'coalhada', 
            'bebida lactea', 'achocolatado lacteo', 'manteiga', 'manteiga com sal', 
            'manteiga sem sal', 'margarina', 'margarina com sal', 'margarina sem sal', 
            'margarina light', 'creme vegetal', 
            
            # PADARIA E MATINAIS
            'pao', 'pao frances', 'pao de forma', 'pao integral', 'pao doce', 
            'pao de queijo', 'pao de batata', 'pao de hot dog', 'pao de hamburguer', 
            'pao sirio', 'pao italiano', 'pao australiano', 'bisnaguinha', 'croissant', 
            'baguete', 'focaccia', 'ciabatta', 'torrada', 'torrada integral', 
            'torrada doce', 'bolo', 'bolo de chocolate', 'bolo de fuba', 'bolo de laranja', 
            'bolo de cenoura', 'bolo de milho', 'bolo formigueiro', 'bolo simples', 
            'bolo decorado', 'bolo de aniversario', 'bolo de casamento', 'rosquinha', 
            'donuts', 'sonho', 'croissant', 'pastel', 'pastel de carne', 'pastel de queijo', 
            'pastel de frango', 'pastel de palmito', 'pastel de pizza', 'empada', 
            'empada de frango', 'empada de camarão', 'empada de palmito', 'torta', 
            'torta de frango', 'torta de palmito', 'torta de camarão', 'torta doce', 
            'torta de limao', 'torta de chocolate', 'torta holandesa', 'cereal', 
            'cereal matinal', 'granola', 'aveia', 'aveia em flocos', 'aveia instantanea', 
            'musli', 'corn flakes', 'sucrilhos', 'nescau cereal', 'achocolatado', 
            'nescau', 'toddy', 'ovomaltine', 'biscoito', 'bolacha', 'biscoito doce', 
            'biscoito salgado', 'biscoito cream cracker', 'biscoito agua e sal', 
            'biscoito maisena', 'biscoito recheado', 'biscoito wafer', 'biscoito de polvilho', 
            'biscoito de queijo', 'biscoito de goiaba', 'biscoito de chocolate', 
            
            # BEBIDAS
            'refrigerante', 'coca cola', 'guarana', 'fanta', 'sprite', 'pepsi', 
            'soda', 'agua tonica', 'agua com gas', 'agua mineral', 'agua sem gas', 
            'agua de coco', 'suco', 'suco de laranja', 'suco de uva', 'suco de maca', 
            'suco de goiaba', 'suco de caju', 'suco de manga', 'suco de pessego', 
            'suco de maracuja', 'suco de abacaxi', 'suco de limao', 'suco de acerola', 
            'suco integral', 'suco concentrado', 'suco em po', 'suco pronto', 
            'néctar', 'bebida isotonica', 'gatorade', 'powerade', 'energetico', 
            'red bull', 'monster', 'burn', 'cafe', 'cafe soluvel', 'cafe moido', 
            'cafe em capsula', 'cha', 'cha verde', 'cha preto', 'cha de camomila', 
            'cha de hortela', 'cha de boldo', 'cha de erva doce', 'cha mate', 
            'erva mate', 'chimarrão', 'terere', 'cerveja', 'cerveja pilsen', 
            'cerveja lager', 'cerveja weiss', 'cerveja stout', 'cerveja artesanal', 
            'vinho', 'vinho tinto', 'vinho branco', 'vinho rose', 'vinho seco', 
            'vinho suave', 'vinho espumante', 'champagne', 'prosecco', 'whisky', 
            'vodka', 'rum', 'cachaca', 'gin', 'tequila', 'conhaque', 'licor', 
            'aperitivo', 'vermute', 
            
            # HIGIENE PESSOAL
            'sabonete', 'sabonete liquido', 'sabonete em barra', 'sabonete intimo', 
            'sabonete facial', 'shampoo', 'condicionador', 'creme para cabelos', 
            'mascara para cabelos', 'finalizador para cabelos', 'gel para cabelos', 
            'pomada para cabelos', 'spray para cabelos', 'creme dental', 'pasta de dente', 
            'escova de dente', 'fio dental', 'enxaguante bucal', 'protese dentaria', 
            'aparelho dental', 'desodorante', 'desodorante roll on', 'desodorante aerosol', 
            'desodorante cream', 'antitranspirante', 'perfume', 'colonia', 'agua de colonia', 
            'desodorante corporal', 'creme para o corpo', 'loção hidratante', 'oleo corporal', 
            'protetor solar', 'bronzeador', 'pos sol', 'creme para as maos', 'creme para os pes', 
            'sabao para rosto', 'demaquilante', 'tonico facial', 'creme facial', 'serum facial', 
            'maquiagem', 'base', 'po', 'blush', 'batom', 'lapis para olhos', 'rimel', 
            'delineador', 'sombra', 'corretivo', 'iluminador', 'pincel de maquiagem', 
            'esponja de maquiagem', 'algodao', 'cotonete', 'lenco umedecido', 'lenco demaquilante', 
            'papel higienico', 'papel higienico dupla face', 'papel higienico neutro', 
            'papel higienico perfumado', 'toalha de papel', 'guardanapo', 'fralda', 
            'fralda descartavel', 'fralda p', 'fralda m', 'fralda g', 'fralda xg', 
            'fralda xxg', 'fralda geriatrica', 'pomada para assaduras', 'absorvente', 
            'absorvente interno', 'absorvente externo', 'protetor diario', 'coletor menstrual', 
            'calcinha absorvente', 
            
            # LIMPEZA
            'sabao em po', 'sabao liquido', 'sabao em barra', 'sabao para roupa', 
            'amaciante', 'amaciante concentrado', 'alvejante', 'agua sanitária', 
            'agua oxigenada', 'alcool', 'alcool em gel', 'alcool liquido', 'detergente', 
            'detergente liquido', 'detergente em po', 'sabao para louça', 'limpa vidros', 
            'multiuso', 'desinfetante', 'desinfetante em po', 'desinfetante liquido', 
            'lustra moveis', 'cera para moveis', 'polidor', 'limpa carpetes', 'shampoo para tapetes', 
            'tira manchas', 'limpa forno', 'limpa piso', 'limpa banheiro', 'limpa vaso sanitario', 
            'saca po', 'desentupidor', 'inseticida', 'repelente', 'aromatizador', 'desodorizador', 
            'spray aromatico', 'difusor de ambiente', 'vela aromatica', 'incenso', 'sache', 
            'esponja', 'esponja de aço', 'esponja multiuso', 'palha de aço', 'bucha vegetal', 
            'bucha sintetica', 'luvas de borracha', 'saco de lixo', 'saco para lixo', 
            'saco plastico', 'saco biodegradavel', 'papel toalha', 'papel toalha interfolhado', 
            'papel toalha simples', 'rodo', 'vassoura', 'pá', 'balde', 'esfregão', 'pano de chão', 
            'pano de prato', 'pano multiuso', 'flanela', 'microfibra', 
            
            # PET SHOP
            'racao para caes', 'racao para gatos', 'racao seca', 'racao umida', 
            'racao premium', 'racao super premium', 'racao veterinary', 'racao filhote', 
            'racao adulto', 'racao idoso', 'racao para porte pequeno', 'racao para porte grande', 
            'racao light', 'racao hipoalergenica', 'petisco', 'biscoito para caes', 
            'biscoito para gatos', 'ossinho', 'palito dental', 'brinquedo', 'brinquedo interativo', 
            'bola', 'pelucia', 'arranhador', 'arranhador para gatos', 'caixa de transporte', 
            'guia', 'coleira', 'peitoral', 'cama', 'caminha', 'casinha', 'tapete higienico', 
            'fralda para caes', 'areia para gatos', 'areia sanitária', 'areia aglomerante', 
            'areia silica', 'pá para areia', 'caixa de areia', 'shampoo para pets', 
            'condicionador para pets', 'perfume para pets', 'antipulgas', 'carrapaticida', 
            'vermifugo', 'vitamina', 'suplemento', 'medicamento veterinary', 'seringa', 
            'curativo', 'algodao veterinary', 'tapete higienico', 'fralda geriatrica', 
            
            # OUTROS
            'pilha', 'pilha alcalina', 'pilha recarregavel', 'carregador', 'carregador de pilha', 
            'lampada', 'lampada led', 'lampada fluorescente', 'lampada incandescente', 
            'vela', 'isqueiro', 'fosforo', 'fita adesiva', 'fita crepe', 'fita dupla face', 
            'cola', 'cola branca', 'cola quente', 'super bonder', 'adesivo', 'envelope', 
            'papel carta', 'caderno', 'agenda', 'caneta', 'lapis', 'borracha', 'apontador', 
            'tesoura', 'estilete', 'furador', 'grampeador', 'clips', 'elastico', 'pasta', 
            'arquivo', 'organizador', 'caixa organizadora', 'saco plastico', 'filme pvc', 
            'papel aluminio', 'forma de alumínio', 'forma descartavel', 'pote plastico', 
            'tampa', 'vasilha', 'tupperware', 'garrafa termica', 'isopor', 'prato descartavel', 
            'copo descartavel', 'talher descartavel', 'guardanapo descartavel', 'toalha de mesa', 
            'rolo de plastico', 'sacola', 'sacola plastica', 'sacola biodegradavel', 
            'sacola retornavel'
        ]
        
        # Aplicar remoção de acentos em todos os produtos
        NOMES_PRODUTOS_SEM_ACENTOS = [remover_acentos(produto) for produto in NOMES_PRODUTOS]
        
        # Atualizar status tracker
        status_tracker.update({
            'status': 'RUNNING', 
            'startTime': time.time(),
            'progressPercent': 0, 
            'etaSeconds': -1,
            'currentMarket': '', 
            'totalMarkets': len(MERCADOS), 
            'marketsProcessed': 0,
            'currentProduct': '', 
            'totalProducts': len(NOMES_PRODUTOS_SEM_ACENTOS), 
            'productsProcessedInMarket': 0,
            'totalItemsFound': 0, 
            'progresso': f'Iniciando coleta - {len(MERCADOS)} mercados, {dias_pesquisa} dias', 
            'produtos_lista': NOMES_PRODUTOS_SEM_ACENTOS,
            'report': {
                'marketBreakdown': [],
                'diasPesquisa': dias_pesquisa,
                'mercadosSelecionados': [m['cnpj'] for m in MERCADOS]  # Apenas CNPJs
            }
        })
        
        total_registros_salvos = 0
        for mercado in MERCADOS:
            registros_salvos = await coletar_dados_mercado_com_timeout(
                mercado, token, supabase_client, status_tracker, coleta_id, dias_pesquisa
            )
            total_registros_salvos += registros_salvos
            
        final_duration = time.time() - status_tracker['startTime']
        
        status_tracker['report']['totalDurationSeconds'] = round(final_duration)
        status_tracker['report']['totalItemsSaved'] = total_registros_salvos
        status_tracker['report']['endTime'] = datetime.now().isoformat()
        
        # Atualizar registro da coleta
        supabase_client.table('coletas').update({
            'status': 'concluida', 
            'finalizada_em': datetime.now().isoformat(), 
            'total_registros': total_registros_salvos
        }).eq('id', coleta_id).execute()
        
        status_tracker.update({ 
            'status': 'COMPLETED', 
            'progresso': f'Coleta #{coleta_id} finalizada! {total_registros_salvos} registros - {dias_pesquisa} dias'
        })
        logging.info(f"Processo de coleta #{coleta_id} completo. Registros: {total_registros_salvos}, Dias: {dias_pesquisa}")

    except Exception as e:
        logging.error(f"ERRO CRÍTICO na coleta: {e}")
        status_tracker.update({
            'status': 'FAILED', 
            'progresso': f'Coleta falhou: {e}'
        })
        if coleta_id != -1:
            supabase_client.table('coletas').update({
                'status': 'falhou', 
                'finalizada_em': datetime.now().isoformat()
            }).eq('id', coleta_id).execute()
