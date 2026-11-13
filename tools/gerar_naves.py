#!/usr/bin/env python3
"""Gera naves.js (jogo) e worker/naves.js (servidor) a partir de UMA tabela, para as regras não divergirem.
Para mudar nomes, preços, patentes ou força das naves, edite aqui e rode:  python3 tools/gerar_naves.py"""
import json, os
NOMES = ['Faísca','Pardal','Centelha','Gavião','Libélula','Andorinha','Falcão','Escaravelho','Cometa','Pioneira',
 'Corsário','Mariposa','Vespa','Peregrino','Sentinela','Escudeiro','Mensageiro','Predador','Aurora','Tormenta',
 'Valquíria','Caravela','Esfinge','Fantasma','Relâmpago','Titã','Serafim','Leviatã','Quimera','Ícaro',
 'Fênix II','Maelstrom','Colosso','Hidra','Nebulosa','Cruzador Vega','Imperatriz','Obelisco','Vanguarda','Eclipse',
 'Soberano','Behemoth','Armada Real','Singularidade','Ascendente','Oráculo','Dreadnought','Constelação','Éon','Astromarco']
assert len(NOMES) == 50
def arred(x):   # preço com 2 algarismos significativos
    import math; d = 10 ** (int(math.log10(x)) - 1); return int(round(x / d) * d)
naves = []
for i in range(1, 51):
    lista = 2000 * 1.24 ** (i - 1)
    naves.append({'id': i, 'nome': NOMES[i - 1], 'rank': (i - 1) // 5, 'preco': 0 if i == 1 else arred(lista), 'lista': arred(lista),
                  'cap0': round(40 * (1 + (i - 1) * .45)), 'eng0': round(min(4.2, 1 + 3.2 * (i - 1) / 30), 2), 'wp0': round(1 + 5 * (i - 1) / 49, 2)})
FORM = '''
/* níveis 1 a 5 de cada item; os valores efetivos alimentam as regras de viagem, combate e porão */
%(e)sconst NAVE_MAX = 5;
%(e)sconst capDe = (n, L) => Math.round(n.cap0 * (1 + .25 * (L - 1)));
%(e)sconst engDe = (n, L) => Math.round((n.eng0 + .2 * (L - 1)) * 100) / 100;
%(e)sconst wpDe = (n, L) => Math.round((n.wp0 + .5 * (L - 1)) * 100) / 100;
%(e)sconst upCusto = (n, k, L) => Math.round(n.lista * .25 * L * ({ cap: 1, eng: 1.2, wp: 1.5 }[k]));   // custo de ir do nível L para L+1
'''
cab = '// GERADO por tools/gerar_naves.py: não edite à mão.\n'
dados = 'NAVES = ' + json.dumps(naves, ensure_ascii=False, separators=(',', ':')) + ';\n'
open('naves.js', 'w', encoding='utf8').write(cab + 'const ' + dados + FORM % {'e': ''})
open('worker/naves.js', 'w', encoding='utf8').write(cab + 'export const ' + dados + FORM % {'e': 'export '})
for n in naves[::7] + [naves[-1]]: print(n)
