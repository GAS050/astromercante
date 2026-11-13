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
  $('#pf-t').textContent = obrigatorio ? 'Crie seu perfil' : 'Editar perfil'; $('#pf-ok').textContent = obrigatorio ? 'Começar' : 'Salvar'; $('#pf-x').hidden = obrigatorio;
  $('#pf-ap').value = PF.completo ? PF.apelido : ''; $('#pf-ap').placeholder = 'Apelido (sugestão: ' + (PF.sugestao || 'Piloto') + ')';
  $('#pf-ap').disabled = PF.completo && PF.troca_em > 0; $('#pf-err').textContent = PF.completo && PF.troca_em > 0 ? `O apelido pode ser trocado de novo em ${Math.ceil(PF.troca_em / 864e5)} dia(s).` : '';
  $('#pf-av').innerHTML = (PF.avatares || ['a1']).map(a => `<button type="button" data-a="${a}" class="${a === pfSel ? 'on' : ''}" aria-label="Avatar ${a}"><img src="${avSrc(a)}" alt=""></button>`).join('');
  document.querySelectorAll('#pf-fx input').forEach(i => { i.checked = i.value === PF.faixa; i.disabled = !!PF.faixa; });
  $('#perfil').hidden = false;
}
async function salvarPerfil() {
  const err = m => { $('#pf-err').textContent = m; }, ap = $('#pf-ap').value.trim(), fx = (document.querySelector('#pf-fx input:checked') || {}).value;
  if (!fx) return err('Escolha sua faixa etária.'); if (fx === '<13') return err('O Astromercante é para maiores de 13 anos. Volte quando tiver 13 anos ou mais!');
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
