/* Suporte: formulário de chamado. O servidor guarda o chamado e avisa o suporte por e-mail. */
(() => {
  const $ = s => document.querySelector(s), mail = (typeof CONFIG !== 'undefined' && CONFIG.SUPORTE_EMAIL) || '';
  if (mail) { const e = $('#sup-mail'); e.textContent = ''; e.append('Abra um chamado ou escreva para '); const a = document.createElement('a'); a.href = 'mailto:' + mail; a.textContent = mail; e.append(a, '.'); }
  const m = $('#suporte'), msg = $('#sp-msg'), err = t => { $('#sp-err').textContent = t; };
  $('#sup-open').onclick = () => { if (!TOK) return openAuth('in'); err(''); $('#sp-ok').disabled = false; $('#sp-ok').textContent = 'Enviar chamado'; m.hidden = false; msg.focus(); };
  $('#sp-x').onclick = () => { m.hidden = true; };
  m.addEventListener('click', e => { if (e.target === m) m.hidden = true; });
  msg.addEventListener('input', () => { $('#sp-n').textContent = msg.value.length; });
  $('#sp-ok').onclick = async () => {
    const t = msg.value.trim(); if (t.length < 10) return err('Conte um pouco mais (mínimo de 10 caracteres).'); err(''); $('#sp-ok').disabled = true;
    try { const r = await api('/suporte', 'POST', { categoria: $('#sp-cat').value, mensagem: t }); msg.value = ''; $('#sp-n').textContent = '0'; $('#sp-ok').textContent = 'Enviado!'; err(''); m.hidden = true; say(`Chamado #${r.numero} enviado. Responderemos no e-mail da sua conta.`, 'ok'); }
    catch (e) { err(e.message || 'Não foi possível enviar agora.'); $('#sp-ok').disabled = false; }
  };
})();
