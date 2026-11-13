/* 100 conquistas. Cada família tem uma métrica (m), uma categoria (c), um ícone e uma lista de níveis [meta, nome].
   A métrica vem do estado do jogo gravado pelo servidor (S.st e outros) ou do banco; o aparelho nunca informa nada. */
const fam = (m, c, ic, d, d1, niveis) => ({ m, c, ic, d, d1, niveis });
export const CATEGORIAS = { comercio: 'Comércio', explor: 'Exploração', combate: 'Combate', fortuna: 'Fortuna', frota: 'Frota', dedic: 'Dedicação', social: 'Social', torneio: 'Torneios' };
const FAMILIAS = [
  fam('tr', 'comercio', 'fa-handshake', 'Faça {n} negociações (compras e vendas).', 'Faça a sua primeira negociação.', [[1, 'Primeiro Negócio'], [25, 'Comerciante de Esquina'], [100, 'Mascate Estelar'], [500, 'Corretor Interplanetário'], [2000, 'Barão das Trocas'], [10000, 'Lenda do Balcão']]),
  fam('lx', 'comercio', 'fa-sack-dollar', 'Lucre {n} Cr numa única venda.', '', [[100, 'Bom Faro'], [1000, 'Golpe de Mestre'], [10000, 'Jackpot'], [100000, 'Tacada do Século']]),
  fam('mg', 'comercio', 'fa-percent', 'Venda com {n}% de lucro sobre o custo.', '', [[10, 'Margem Saudável'], [25, 'Olho de Águia'], [50, 'Arbitragem'], [100, 'Dobrou o Capital']]),
  fam('mq', 'comercio', 'fa-boxes-stacked', 'Venda {n} unidades de uma vez.', '', [[40, 'Porão Cheio'], [120, 'Carregamento Pesado'], [400, 'Comboio']]),
  fam('vi', 'explor', 'fa-route', 'Conclua {n} viagens.', 'Conclua a sua primeira viagem.', [[1, 'Decolagem'], [10, 'Viajante'], [50, 'Rota Conhecida'], [200, 'Navegador'], [750, 'Cartógrafo Estelar'], [3000, 'Nômade das Estrelas']]),
  fam('ga', 'explor', 'fa-meteor', 'Visite {n} galáxias.', '', [[2, 'Além do Berço'], [3, 'Explorador'], [5, 'Desbravador'], [7, 'Cosmonauta'], [9, 'Peregrino do Infinito'], [11, 'Dono do Mapa']]),
  fam('pi', 'combate', 'fa-skull-crossbones', 'Derrote {n} piratas.', 'Derrote o seu primeiro pirata.', [[1, 'Batismo de Fogo'], [10, 'Caçador de Piratas'], [40, 'Flagelo dos Corsários'], [150, 'Terror do Cinturão'], [500, 'Exterminador']]),
  fam('mo', 'combate', 'fa-dragon', 'Derrote {n} monstros do vazio.', 'Derrote o seu primeiro monstro.', [[1, 'Primeiro Monstro'], [5, 'Matador de Feras'], [25, 'Domador do Vazio'], [100, 'Terror das Criaturas'], [300, 'Destruidor de Mundos']]),
  fam('fp', 'combate', 'fa-ship', 'Derrote {n} frotas piratas.', 'Derrote uma frota pirata inteira.', [[1, 'Quebra-Frotas'], [5, 'Almirante Rebelde'], [20, 'Pesadelo das Armadas']]),
  fam('lv', 'combate', 'fa-water', 'Derrote {n} leviatãs estelares.', 'Derrote um leviatã estelar.', [[1, 'Matador de Leviatã'], [3, 'Caçador de Gigantes'], [10, 'Ceifador de Leviatãs']]),
  fam('df', 'combate', 'fa-heart-crack', 'Perca {n} lutas e continue jogando.', 'Perca uma luta e continue jogando.', [[1, 'Aprendendo com a Derrota'], [10, 'Casco Duro']]),
  fam('lt', 'fortuna', 'fa-chart-line', 'Acumule {n} Cr de lucro total.', '', [[1000, 'Primeiros Lucros'], [10000, 'Lucro Estável'], [100000, 'Fortuna Crescente'], [1000000, 'Milionário do Vazio'], [10000000, 'Magnata'], [100000000, 'Titã das Finanças']]),
  fam('pk', 'fortuna', 'fa-gem', 'Chegue a {n} Cr de patrimônio.', '', [[12000, 'Subindo na Vida'], [100000, 'Seis Dígitos'], [1000000, 'Primeiro Milhão'], [10000000, 'Dez Milhões'], [100000000, 'Fortuna Galáctica']]),
  fam('na', 'frota', 'fa-rocket', 'Tenha {n} naves na frota.', '', [[2, 'Segunda Nave'], [5, 'Pequena Frota'], [10, 'Esquadra'], [25, 'Armada'], [50, 'Colecionador de Naves']]),
  fam('nm', 'frota', 'fa-screwdriver-wrench', 'Some {n} níveis de melhoria nas suas naves.', '', [[5, 'Mecânico Iniciante'], [20, 'Oficina Ativa'], [50, 'Engenheiro-Chefe'], [120, 'Tecnologia de Ponta'], [300, 'Obra-Prima da Engenharia']]),
  fam('mx', 'frota', 'fa-gauge-high', 'Deixe {n} naves no nível máximo (5/5/5).', 'Deixe uma nave no nível máximo (5/5/5).', [[1, 'Nave Perfeita'], [5, 'Linha de Elite'], [15, 'Hangar Lendário']]),
  fam('sk', 'dedic', 'fa-fire', 'Jogue {n} dias seguidos.', '', [[3, 'Hábito Estelar'], [7, 'Semana de Estrada'], [14, 'Quinzena Firme'], [30, 'Mês Inteiro'], [60, 'Incansável']]),
  fam('mi', 'dedic', 'fa-clipboard-check', 'Cumpra {n} missões do dia.', 'Cumpra uma missão do dia.', [[1, 'Missão Cumprida'], [15, 'Rotina Eficiente'], [75, 'Funcionário do Mês'], [300, 'Mestre das Missões']]),
  fam('dt', 'dedic', 'fa-calendar-check', 'Tenha uma conta com {n} dias.', '', [[7, 'Primeira Semana'], [30, 'Um Mês de Aventura'], [90, 'Trimestre de Estrelas'], [365, 'Um Ano no Espaço']]),
  fam('lo', 'dedic', 'fa-bag-shopping', 'Tenha {n} itens da Loja (avatares e molduras).', 'Compre o seu primeiro item na Loja.', [[1, 'Primeira Compra'], [4, 'Colecionador de Estilo'], [10, 'Guarda-Roupa Galáctico']]),
  fam('am', 'social', 'fa-user-group', 'Tenha {n} amigos.', 'Faça o seu primeiro amigo.', [[1, 'Primeiro Amigo'], [5, 'Turma Estelar'], [20, 'Popular']]),
  fam('tj', 'torneio', 'fa-flag-checkered', 'Dispute {n} torneios.', 'Dispute o seu primeiro torneio.', [[1, 'Estreia no Torneio'], [10, 'Competidor'], [40, 'Gladiador']]),
  fam('tv', 'torneio', 'fa-trophy', 'Vença {n} torneios.', 'Vença um torneio.', [[1, 'Campeão!'], [5, 'Dinastia'], [20, 'Lenda dos Torneios']]),
  fam('tf', 'torneio', 'fa-crown', 'Termine {n} semanas ou meses em 1º no ganho de patrimônio.', 'Termine uma semana ou um mês em 1º no ganho de patrimônio.', [[1, 'Rei do Período'], [5, 'Soberano do Ranking']]),
  fam('tl', 'torneio', 'fa-medal', 'Termine {n} semanas ou meses em 1º no lucro.', 'Termine uma semana ou um mês em 1º no lucro.', [[1, 'Mestre do Lucro'], [5, 'Imperador do Mercado']]),
];
export const CATALOGO = FAMILIAS.flatMap((f) => f.niveis.map(([g, n], i) => ({ id: f.m + (i + 1), m: f.m, c: f.c, n, g, ic: f.ic, r: f.niveis.length > 1 ? 1 + Math.round((i * 4) / (f.niveis.length - 1)) : 3, d: g === 1 && f.d1 ? f.d1 : f.d.replace('{n}', g.toLocaleString('pt-BR')) })));
/** m: valores das métricas. Devolve os ids das conquistas já ganhas. */
export const ganhas = (m) => CATALOGO.filter((c) => (m[c.m] || 0) >= c.g).map((c) => c.id);
/** Monta as métricas a partir do estado do jogo (S) e de números do banco (x). */
export function metricas(S, x) {
  const st = S.st || {}, fr = S.frota || {}, fl = Object.values(fr);
  return {
    tr: st.tr || 0, lx: Math.floor(st.lx || 0), mg: Math.floor(st.mg || 0), mq: st.mq || 0, vi: st.vi || 0, ga: Object.keys(S.vis || {}).length, pi: st.pi || 0, mo: st.mo || 0, fp: st.fp || 0, lv: st.lv || 0, df: st.df || 0,
    lt: Math.max(0, Math.floor(S.lt || 0)), pk: Math.max(st.pk || 0, Math.floor(x.pat || 0)), na: fl.length, nm: fl.reduce((a, f) => a + (f.c || 1) + (f.m || 1) + (f.a || 1) - 3, 0), mx: fl.filter((f) => f.c >= 5 && f.m >= 5 && f.a >= 5).length,
    sk: Math.max(S.streak || 0, st.bk || 0), mi: st.mi || 0, dt: x.criado ? Math.floor((Date.now() - x.criado) / 864e5) : 0, lo: x.lo || 0, am: x.am || 0, tj: x.tj || 0, tv: x.tv || 0, tf: x.tf || 0, tl: x.tl || 0,
  };
}
