import { api } from './api';

/**
 * Imprime o PDF (HTML A4) da nota a partir de um iframe oculto: abre a janela de
 * impressao do navegador, onde o usuario escolhe "Salvar como PDF". Nao depende de pop-up.
 */
export async function printNote(id: string, _number?: string) {
  const blob = await api<Blob>(`/api/notes/${id}/pdf.html`);
  const html = await blob.text();
  document.getElementById('nay-print-frame')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'nay-print-frame';
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  document.body.appendChild(frame);
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });
  const w = frame.contentWindow!;
  try { await w.document.fonts?.ready; } catch { /* sem API de fontes */ }
  w.focus();
  w.print();
  // remove depois que a janela de impressao fecha
  setTimeout(() => frame.remove(), 60_000);
}
