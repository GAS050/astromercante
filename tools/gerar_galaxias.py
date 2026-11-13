#!/usr/bin/env python3
"""Gera galaxias.js (dados FIXOS do jogo). Edite as tabelas abaixo e rode: python3 tools/gerar_galaxias.py
Lê assets/planets/*.svg (a001_terra.svg ...) e escreve galaxias.js na raiz do projeto."""
import os, re, json, random
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(RAIZ, 'assets', 'planets')
rng = random.Random(2026)

# ---- metadados de cada SVG: cor dominante (halo) e fator de escala (raio do disco) ----
def meta(f):
    s = open(os.path.join(DIR, f), encoding='utf8').read()
    m = re.search(r'<radialGradient id="[^"]*_base"[^>]*>\s*<stop[^>]*stop-color="(#[0-9a-fA-F]{3,6})"', s) \
        or re.search(r'stop-color="(#(?!fff|000|ffffff|000000)[0-9a-fA-F]{3,6})"', s)
    c = m.group(1) if m else '#6fd3d9'
    if len(c) == 4: c = '#' + ''.join(ch * 2 for ch in c[1:])
    cr = re.search(r'<clipPath id="[^"]*_pl"><circle cx="128" cy="128" r="([\d.]+)"', s)
    return c.lower(), round(128 / float(cr.group(1)), 3) if cr else 2.0

POOL = {}
for f in sorted(os.listdir(DIR)):
    POOL.setdefault(re.sub(r'^[ab]\d+_(.*)\.svg$', r'\1', f), []).append(f)
for v in POOL.values(): rng.shuffle(v)
def pegar(tipo):
    if POOL.get(tipo): return POOL[tipo].pop()
    k = max(POOL, key=lambda t: len(POOL[t])); return POOL[k].pop()

RAIO = dict(gasoso=18, estrela=17, megaestrutura=16, holograma=15, toro=15, binario=15, buraco_negro=14, cidade=14)
CORE = ['neutronio', 'titanio', 'helio3', 'especiarias']

# ---- GALÁXIA 1 (inicial): planetas desenhados à mão (id, nome, x, y, patente, tipo, preços locais) ----
HOME = [
 ('orionis','Orionis Prime',70,150,0,'terra',{}), ('kepler','Kepler-9',150,50,0,'rochoso',{'titanio':.8,'neutronio':1.12}),
 ('icaro','Ícaro',300,90,0,'gasoso',{'helio3':.75,'titanio':1.15}), ('jove','Estação Jove',270,230,0,'deserto',{'especiarias':.75,'helio3':1.1}),
 ('nyx','Nyx',110,250,0,'tempestade',{'neutronio':.8,'especiarias':1.25}), ('vesta','Vesta',200,150,0,'toxico',{'titanio':.9,'especiarias':1.1}),
 ('tritao','Tritão',350,170,0,'oceano',{'helio3':.85,'neutronio':1.15}), ('lyra','Lyra',40,60,0,'nuvem',{'especiarias':.85,'titanio':1.1}),
 ('cetus','Cetus',190,215,0,'lava',{'neutronio':.9,'helio3':1.1}), ('zefira','Zéfira',360,40,0,'gelo',{'titanio':.85,'especiarias':1.2}),
 ('aurora','Aurora',25,210,1,'tech',{'plasma':.7,'neutronio':1.2}), ('umbra','Umbra',375,105,1,'cristal',{'plasma':.75,'helio3':1.2}),
 ('helion','Hélion',245,25,2,'estrela',{'antimateria':.7,'plasma':1.15}), ('ossian','Ossian',370,245,2,'vulcanico',{'antimateria':.75,'titanio':1.2}),
 ('chronos','Chronos',30,115,3,'holograma',{'cristal':.7,'antimateria':1.15}), ('omega','Ômega',215,95,3,'buraco_negro',{'cristal':.75,'plasma':1.2}),
]
# ---- GALÁXIAS 2-7: nome, patente mínima, nível de motor, tipos de planeta, 2 minérios (nome, preço-base), planetas ----
GAL = [
 ('cassiopeia','Cassiopeia',1,1,'gelo oceano terra nuvem cristal aurora',[('poeira','Poeira Estelar',40,'fa-star'),('fibra','Fibra Orgânica',30,'fa-leaf')],
  'Boreal,Glaciar,Cristalina,Névoa Azul,Aurora Alfa,Lago Cinza,Maré Branca,Safira,Alvorada,Brisa,Cúmulo,Orvalho,Serena,Zéfiro Dois'),
 ('draconis','Draconis',2,2,'vulcanico lava deserto rochoso asteroide toxico',[('escama','Escama Ígnea',28,'fa-dragon'),('magma','Magma Vítreo',22,'fa-fire-flame-curved')],
  'Fornalha,Brasa,Cinza Rubra,Dracônia,Magma Prime,Obsidiana,Pira,Caldeira,Escória,Sulfúrea,Ferrugem,Vulcânia,Calcinar,Tição,Ígnea,Basalto'),
 ('pegaso','Pegaso',3,2,'gasoso tempestade nuvem ilha_flutuante crescente doce',[('nevoa','Névoa Condensada',20,'fa-cloud'),('polen','Pólen Cósmico',16,'fa-seedling')],
  'Cirro,Tempestária,Alísio,Nimbo,Ventania,Pluma,Céu Alto,Relâmpago,Cúmulo-Nimbo,Brisa Longa,Aeris,Flutuante,Névoa Doce,Crescente,Algodão,Trovão'),
 ('lyrae','Lyrae',4,3,'tech cidade holograma megaestrutura toro organico',[('chip','Chip Quântico',14,'fa-microchip'),('neon','Fio de Neon',7,'fa-lightbulb')],
  'Nexus,Cibervila,Circuito,Neon Prime,Data-9,Bit Station,Matriz,Holograma Alfa,Servidor,Backbone,Firewall,Quantum,Pixel,Rede Mãe,Cripta Digital,Megalópolis,Anel Zero,Codex'),
 ('hydra','Hydra',5,4,'toxico organico fragmentado asteroide corte binario',[('veneno','Veneno Cristalino',175,'fa-skull-crossbones'),('cinza','Cinza de Supernova',87.5,'fa-smog')],
  'Peçonha,Toxina,Pântano,Esporo,Miasma,Bile,Hidra Menor,Fungo Rei,Cisto,Veneno Azul,Fragmento,Cacos,Ruína,Estilhaço,Ninho,Verme,Fenda,Mutante'),
 ('abismo','Abismo',6,5,'buraco_negro estrela binario toro fragmentado holograma megaestrutura',[('escura','Matéria Escura',395,'fa-moon'),('eco','Eco do Vazio',197.5,'fa-wave-square')],
  'Horizonte,Singular,Vazio Prime,Ergosfera,Eco Final,Anã Negra,Gêmeos,Binária Zero,Halo,Abismo Alfa,Abismo Beta,Quasar,Pulsar,Último Porto,Fim do Mapa,Ômega Dois,Origem,Éter,Memória,Trono'),
 ('andromeda','Andrômeda',7,5,'cristal tech holograma estrela aurora toro',[('prisma','Prisma Estelar',1226,'fa-gem'),('luz','Luz Fóssil',613,'fa-sun')],
  'Alpheratz,Mirach,Almach,Aurea,Prisma Zero,Lumen,Nítida,Cintila,Opala,Cristalis,Halo Branco,Espectro,Radiante,Fulgor,Gema Mãe,Iridium,Lâmina,Reflexo,Albor,Zênite Claro'),
 ('carina','Carina',8,5,'oceano ilha_flutuante organico nuvem terra doce',[('perola','Pérola Abissal',2700,'fa-circle-notch'),('coral','Coral Cósmico',1350,'fa-water')],
  'Maré Alta,Recife,Abissal,Pérola Doce,Naufrágio,Lagoa Azul,Cais Estelar,Arquipélago,Correnteza,Maresia,Baía Quieta,Atol,Sereia,Âncora,Vaga,Espuma,Delta,Estuário,Fiorde,Remanso'),
 ('fenix','Fênix',8,5,'lava vulcanico estrela deserto rochoso binario',[('cinzas','Cinzas Renascentes',2700,'fa-feather'),('brasa','Brasa Eterna',1350,'fa-fire')],
  'Pira Viva,Renasce,Cinzeiro,Brasão,Chama Azul,Solfatara,Cratera,Lavaflow,Ardente,Carvão,Crisol,Forja Mãe,Labareda,Centelha,Pirotécnica,Fumaça,Incandescente,Rubro,Combustão,Chamejante,Fênix Prime'),
 ('terminus','Terminus',9,5,'buraco_negro megaestrutura fragmentado binario holograma cidade',[('relogio','Fragmento do Tempo',5400,'fa-clock'),('origem','Semente do Universo',2700,'fa-seedling')],
  'Última Fronteira,Fim da Linha,Pórtico,Limiar,Zero Absoluto,Réquiem,Derradeiro,Pós-Horizonte,Cinzas do Tempo,Relíquia,Memento,Anamnese,Crepúsculo,Fóssil,Sentinela,Cripta Final,Obelisco,Epílogo,Aeon,Eternidade,Alfa e Ômega'),
]
WORLD = {'orionis':(0,0),'cassiopeia':(-560,-250),'draconis':(560,-280),'pegaso':(-600,300),'lyrae':(600,320),'hydra':(-1150,-20),'abismo':(1150,0),
         'andromeda':(0,-760),'carina':(0,760),'fenix':(-1200,560),'terminus':(1200,-560)}
def raio(tipo): return RAIO.get(tipo, 12) + rng.randint(0, 3)
def posicoes(n, md=50):
    pts = []
    while len(pts) < n:
        for _ in range(4000):
            p = (rng.uniform(35, 365), rng.uniform(45, 255))
            if all((p[0]-q[0])**2 + ((p[1]-q[1])*1.25)**2 >= md*md for q in pts): pts.append(p); break
        else: md -= 2
    return sorted(afastar(pts))
def afastar(pts, X=(35, 365), Y=(45, 255)):
    """Relaxamento por repulsão (sem sorteio: não muda a sequência aleatória do resto dos dados): empurra para longe os planetas que se tocam,
    sem sair da área do mapa, até a menor distância (com o eixo y esticado, como no sorteio) ficar a maior possível."""
    n = len(pts); best = None
    for alvo in range(72, 44, -2):
        q = [list(p) for p in pts]
        for _ in range(600):
            mexeu = False
            for i in range(n):
                for j in range(i + 1, n):
                    dx, dy = q[j][0] - q[i][0], (q[j][1] - q[i][1]) * 1.25; d = (dx*dx + dy*dy) ** .5
                    if d < alvo:
                        if d < 1e-6: dx, dy, d = 1, 0, 1
                        f = (alvo - d) / 2 / d + 1e-3; mexeu = True
                        q[i][0] -= dx*f; q[j][0] += dx*f; q[i][1] -= dy*f/1.25; q[j][1] += dy*f/1.25
            for p_ in q: p_[0] = min(X[1], max(X[0], p_[0])); p_[1] = min(Y[1], max(Y[0], p_[1]))
            if not mexeu: break
        r = [(round(a), round(b)) for a, b in q]
        mn = min(((r[i][0]-r[j][0])**2 + ((r[i][1]-r[j][1])*1.25)**2) ** .5 for i in range(n) for j in range(i+1, n))
        if mn >= alvo - 2: return r
        if best is None or mn > best[0]: best = (mn, r)
    return best[1]
def planeta(i, nome, x, y, t, tipo, m, gid):
    f = pegar(tipo); c, k = meta(f)
    return dict(id=f'{gid}_{i}' if gid != 'orionis' else nome, nome=nome, x=x, y=y, t=t, r=raio(tipo), img=f, c=c, k=k, m=m)

GALAXIES, MINERALS = [], []
g1 = [planeta(i, n, x, y, t, ty, m, 'orionis') for i, (_, n, x, y, t, ty, m) in enumerate(HOME)]
for p, h in zip(g1, HOME): p['id'] = h[0]
GALAXIES.append(dict(id='orionis', nome='Orionis', t=0, eng=1, wx=0, wy=0, planetas=g1))
# Cada produto segue o preço (variação 24 h) de um ativo REAL da CoinGecko. chave -> (id na CoinGecko, símbolo, nome)
FEEDS = {
    'xmr': ('monero', 'XMR', 'Monero'), 'sol': ('solana', 'SOL', 'Solana'), 'xaut': ('tether-gold', 'XAUt', 'Tether Gold'),
    'xlm': ('stellar', 'XLM', 'Stellar'), 'ada': ('cardano', 'ADA', 'Cardano'), 'avax': ('avalanche-2', 'AVAX', 'Avalanche'),
    'trx': ('tron', 'TRX', 'TRON'), 'fil': ('filecoin', 'FIL', 'Filecoin'), 'atom': ('cosmos', 'ATOM', 'Cosmos'),
    'rndr': ('render-token', 'RENDER', 'Render'), 'ltc': ('litecoin', 'LTC', 'Litecoin'), 'doge': ('dogecoin', 'DOGE', 'Dogecoin'),
    'xrp': ('ripple', 'XRP', 'XRP'), 'dot': ('polkadot', 'DOT', 'Polkadot'), 'near': ('near', 'NEAR', 'NEAR'),
    'algo': ('algorand', 'ALGO', 'Algorand'), 'hbar': ('hedera-hashgraph', 'HBAR', 'Hedera'), 'sui': ('sui', 'SUI', 'Sui'),
    'apt': ('aptos', 'APT', 'Aptos'), 'etc': ('ethereum-classic', 'ETC', 'Ethereum Classic'), 'bch': ('bitcoin-cash', 'BCH', 'Bitcoin Cash'),
    'link': ('chainlink', 'LINK', 'Chainlink'), 'uni': ('uniswap', 'UNI', 'Uniswap'),
}
MSRC = dict(poeira='xlm', fibra='ada', escama='avax', magma='trx', nevoa='fil', polen='atom', chip='rndr', neon='ltc', veneno='doge',
            cinza='xrp', escura='dot', eco='near', prisma='algo', luz='hbar', perola='sui', coral='apt', cinzas='etc', brasa='bch',
            relogio='link', origem='uni')
for gi, (gid, nome, t, eng, tipos, mins, nomes) in enumerate(GAL, start=1):
    tipos, nomes = tipos.split(), nomes.split(',')
    for j, (mid, mn, base, ic) in enumerate(mins):
        MINERALS.append(dict(id=mid, nome=mn, base=base, vol=round(.008 + .002*gi, 3), src=MSRC[mid], corr=f'Mineral de {nome} · {FEEDS[MSRC[mid]][2]} ({FEEDS[MSRC[mid]][1]})', icon=ic, t=t, ex=1))
    lo, hi = max(.42, .78 - .06*gi), 1.15 + .1*gi
    pts, pl = posicoes(len(nomes)), []
    for i, ((x, y), n) in enumerate(zip(pts, nomes)):
        m = {}
        for k in rng.sample(CORE, 2): m[k] = round(rng.uniform(lo, lo + .15), 2)
        for k in rng.sample([c for c in CORE if c not in m], 1): m[k] = round(rng.uniform(hi, hi + .25), 2)
        for j, (mid, *_r) in enumerate(mins):                      # minérios da galáxia: baratos em uns planetas, caros em outros
            slot = (i + j*2) % 5
            if slot == 1: m[mid] = round(rng.uniform(lo - .1, lo + .05), 2)
            if slot == 3: m[mid] = round(rng.uniform(hi, hi + .35), 2)
        pl.append(planeta(i, n, x, y, min(7 if t <= 6 else 9, t + (i * 3) // len(nomes)), tipos[i % len(tipos)], m, gid))
    GALAXIES.append(dict(id=gid, nome=nome, t=t, eng=eng, wx=WORLD[gid][0], wy=WORLD[gid][1], planetas=pl))
import itertools
assert all(((WORLD[a][0]-WORLD[b][0])**2+(WORLD[a][1]-WORLD[b][1])**2)**.5 >= 520 for a, b in itertools.combinations(WORLD, 2)), 'galáxias muito próximas'
out = '// GERADO por tools/gerar_galaxias.py: dados fixos do jogo. Edite o script, não este arquivo.\n'
out += 'const GALAXIES = ' + json.dumps(GALAXIES, ensure_ascii=False, separators=(',', ':')) + ';\n'
out += 'const FEEDS = ' + json.dumps({k: dict(cg=v[0], sym=v[1], nome=v[2]) for k, v in FEEDS.items()}, ensure_ascii=False, separators=(',', ':')) + ';\n'
out += 'const MINERALS = ' + json.dumps(MINERALS, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(os.path.join(RAIZ, 'galaxias.js'), 'w', encoding='utf8').write(out)
open(os.path.join(RAIZ, 'worker', 'dados.js'), 'w', encoding='utf8').write('// GERADO por tools/gerar_galaxias.py (mesmos dados do jogo, usados pelo servidor para validar as ações).\nexport const GALAXIES = ' + json.dumps(GALAXIES, ensure_ascii=False, separators=(',', ':')) + ';\nexport const FEEDS = ' + json.dumps({k: dict(cg=v[0], sym=v[1], nome=v[2]) for k, v in FEEDS.items()}, ensure_ascii=False, separators=(',', ':')) + ';\nexport const MINERALS = ' + json.dumps(MINERALS, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(GALAXIES), 'galáxias,', sum(len(g['planetas']) for g in GALAXIES), 'planetas,', len(MINERALS), 'minérios,', sum(len(v) for v in POOL.values()), 'SVG sem uso')
