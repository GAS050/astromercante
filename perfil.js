/* Perfil do piloto: apelido público, avatar e faixa etária. O servidor valida tudo (apelido único, filtro, menores de 13 bloqueados). */
let PF = null, pfCarregando = false, pfSel = 'a1', pfObrig = false;
const pfRenderAcct = renderAccount;
renderAccount = function () {   // mostra avatar + apelido no botão da conta
  pfRenderAcct();
  if (TOK && PF) { const b = $('#acct'); b.innerHTML = `<img class="acct-av" src="${avSrc(PF.avatar)}" alt="" width="22" height="22">`; b.append(PF.apelido); const n = $('#acct-nome'); if (n) n.textContent = 'Piloto: ' + PF.apelido; }
  const r = $('#pf-row'); if (r) r.hidden = !(TOK && PF);
};
function abrirPerfil(obrigatorio) {
  pfObrig = !!obrigatorio; pfSel = PF.avatar || 'a1';
  $('#pf-t').textContent = obrigatorio ? 'Crie seu perfil' : 'Seu avatar'; $('#pf-ok').textContent = obrigatorio ? 'Começar' : 'Salvar'; $('#pf-x').hidden = obrigatorio;
  const ja = !!PF.completo;   // depois de criado, o apelido e a faixa etária não mudam por aqui
  $('#pf-ap').value = ja ? PF.apelido : ''; $('#pf-ap').placeholder = 'Apelido (sugestão: ' + (PF.sugestao || 'Piloto') + ')'; $('#pf-ap').disabled = ja; $('#pf-err').textContent = '';
  $('#pf-fx').hidden = ja; $('#pf-leg').hidden = ja; $('#pf-intro').textContent = ja ? 'Escolha o avatar que os outros pilotos veem no ranking e nos torneios. Mais avatares e molduras estão na Loja.' : 'Este é o nome e a imagem que os outros pilotos veem no ranking e nos torneios.';
  $('#pf-av').innerHTML = (PF.avatares || ['a1']).map(a => `<button type="button" data-a="${a}" class="${a === pfSel ? 'on' : ''}" aria-label="Avatar ${a}"><img src="${avSrc(a)}" alt=""></button>`).join('');
  document.querySelectorAll('#pf-fx input').forEach(i => { i.checked = i.value === PF.faixa; i.disabled = !!PF.faixa; });
  $('#perfil').hidden = false;
}
async function salvarPerfil() {
  const err = m => { $('#pf-err').textContent = m; }, ap = $('#pf-ap').value.trim(), fx = (document.querySelector('#pf-fx input:checked') || {}).value;
  if (PF.completo) { /* já definida */ } else if (!fx) return err('Escolha sua faixa etária.'); else if (fx === '<13') return err('O Astromercante é para maiores de 13 anos. Volte quando tiver 13 anos ou mais!');
  if (!PF.completo && !ap) return err('Escolha um apelido.');
  $('#pf-ok').disabled = true; err('');
  try {
    const corpo = { avatar: pfSel, faixa: fx }; if (!$('#pf-ap').disabled && ap) corpo.apelido = ap;
    PF = await api('/perfil', 'POST', corpo); $('#perfil').hidden = true; renderAccount(); carregarRanking && carregarRanking(true);
  } catch (e) { err(e.message || 'Não foi possível salvar.'); }
  $('#pf-ok').disabled = false;
}
$('#pf-av').onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; pfSel = b.dataset.a; document.querySelectorAll('#pf-av button').forEach(x => x.classList.toggle('on', x === b)); };
$('#pf-ok').onclick = salvarPerfil;
$('#pf-x').onclick = () => { $('#perfil').hidden = true; };
$('#pf-edit').onclick = () => { if (PF) abrirPerfil(false); };
setInterval(async () => {   // carrega o perfil assim que há sessão; se ainda não está completo, pede antes de jogar
  if (!TOK) { PF = null; return; }
  if (PF || pfCarregando || !CLOUD() || !READY) return; pfCarregando = true;
  try { PF = await api('/perfil'); renderAccount(); if (!PF.completo) abrirPerfil(true); } catch {}
  pfCarregando = false;
}, 700);
