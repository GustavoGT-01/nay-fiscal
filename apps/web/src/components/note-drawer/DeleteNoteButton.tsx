import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../../lib/ui';
import { useSession } from '../../lib/session';

/* ---------- Apagar nota (so quem tem dados.apagar) ---------- */
export function DeleteNoteButton({ id, label, onDeleted }: { id: string; label: string; onDeleted: () => void }) {
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancel = useCallback(() => { if (!busy) setOpen(false); }, [busy]);
  if (!can('dados.apagar')) return null;
  const run = async () => {
    setBusy(true);
    try {
      await api(`/api/notes/${id}`, { method: 'DELETE' });
      setOpen(false);
      onDeleted();
      toast(`${label} apagada`, 'ti-trash');
      qc.removeQueries({ queryKey: ['note', id] });
      await qc.invalidateQueries();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Não foi possível apagar. Tente de novo.', 'ti-alert-triangle');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Apagar nota" title="Apagar nota"><i className="ti ti-trash" /></button>
      <ConfirmDialog
        open={open}
        busy={busy}
        title="Apagar nota"
        text={`Apagar a ${label}? Não dá para desfazer.`}
        confirmLabel="Apagar nota"
        onConfirm={run}
        onCancel={cancel}
      />
    </>
  );
}
