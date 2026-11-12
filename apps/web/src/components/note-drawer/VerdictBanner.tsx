import type { NoteDetailDTO } from '@nay/shared';
import { useToast } from '../../lib/ui';
import { VERDICT } from '../../lib/verdict';

/** Faixa do veredito no topo do diagnostico: a resposta curta para quem abriu a nota. */
export function VerdictBanner({ n }: { n: NoteDetailDTO }) {
  const toast = useToast();
  if (!n.verdict) return null;
  const v = VERDICT[n.verdict];
  const copy = () => {
    navigator.clipboard?.writeText(n.supplierMessage!);
    toast('Mensagem para o fornecedor copiada');
  };
  return (
    <div className={'vbanner ' + v.cls} role="status">
      <i className={'ti ' + v.icon} />
      <div>
        <b>{v.label}</b>
        {v.text}
        {n.supplierMessage && (
          <div><button className="btn" onClick={copy}><i className="ti ti-copy" />Copiar mensagem para o fornecedor</button></div>
        )}
      </div>
    </div>
  );
}
