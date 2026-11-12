import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useDashboard } from '../hooks/useDashboard';

interface Msg { who: 'me' | 'ai'; text: string; typing?: boolean }
const SUGS = ['Como corrigir o cClassTrib em remessa?', 'Vale a pena ir para o Simples Híbrido?', 'Quais fornecedores mais erram?'];

export function IA() {
  const { client, user } = useSession();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const timer = useRef<number>(undefined);
  const dash = useDashboard(client?.id);

  useEffect(() => {
    const d = dash.data;
    if (!d || msgs.length) return;
    const top = d.topErrors[0];
    setMsgs([{ who: 'ai', text: `Olá, ${user?.name.split(' ')[0]}. Analisei as ${d.totals.audited} notas da ${client?.name}. ${top ? `O maior problema é “${top.title}”: ${top.items} itens. Quer que eu explique como corrigir?` : 'Não encontrei erros. Posso ajudar com outra dúvida?'}` }]);
  }, [dash.data, client?.name, user?.name, msgs.length]);
  // troca de cliente reinicia a conversa (nao roda na montagem, senao apaga a saudacao)
  const lastClient = useRef(client?.id);
  useEffect(() => {
    if (lastClient.current !== client?.id) { lastClient.current = client?.id; setMsgs([]); }
  }, [client?.id]);
  useEffect(() => () => window.clearInterval(timer.current), []);

  const ask = async (q: string) => {
    if (!q.trim()) { setErr('Escreva uma pergunta primeiro.'); return; }
    if (busy || !client) return;
    setErr('');
    setText('');
    setBusy(true);
    setMsgs((m) => [...m, { who: 'me', text: q }, { who: 'ai', text: '', typing: true }]);
    try {
      const r = await api<{ answer: string }>('/api/ia/ask', { method: 'POST', body: JSON.stringify({ clientId: client.id, question: q }) });
      let i = 0;
      timer.current = window.setInterval(() => {
        i += 3;
        setMsgs((m) => [...m.slice(0, -1), { who: 'ai', text: r.answer.slice(0, i), typing: i < r.answer.length }]);
        if (i >= r.answer.length) { window.clearInterval(timer.current); setBusy(false); }
      }, 16);
    } catch (e) {
      setMsgs((m) => [...m.slice(0, -1), { who: 'ai', text: (e as Error).message }]);
      setBusy(false);
    }
  };

  return (
    <section className="view on" aria-labelledby="h-ia">
      <h1 id="h-ia">Diagnóstico IA</h1>
      <p className="lede">Pergunte sobre as notas da carteira. As respostas citam a regra e a base legal.</p>
      <div className="chat">
        <div className="msgs" aria-live="polite">
          {msgs.map((m, i) => (
            <div key={i} className={'msg ' + m.who}>{m.text}{m.typing && <span className="caret" />}</div>
          ))}
        </div>
        <div className="sugs">{SUGS.map((s) => <button key={s} className="sug" onClick={() => ask(s)}>{s}</button>)}</div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
          <input value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} placeholder="Escreva sua pergunta" aria-label="Pergunta" />
          <button className="btn primary" type="submit" disabled={busy}><i className="ti ti-send" />Enviar</button>
        </form>
        {err && <p className="err-msg">{err}</p>}
        <p className="hint" style={{ marginTop: 10, fontSize: 12.5 }}>Nesta versão as respostas vêm direto dos achados da auditoria. A conversa livre com IA chega na próxima etapa.</p>
      </div>
    </section>
  );
}
