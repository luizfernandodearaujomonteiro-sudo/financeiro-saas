/** Comando "desfazer" do WhatsApp: só o último gasto do próprio remetente, dentro da janela. */
export interface UndoCandidate {
  id: string;
  owner_id: string;
  source: string;
  created_at: string | Date;
}

export const DEFAULT_UNDO_MINUTES = 10;

export function withinUndoWindow(createdAt: string | Date, now: Date, minutes: number): boolean {
  const t = new Date(createdAt).getTime();
  const diff = now.getTime() - t;
  return diff >= 0 && diff <= minutes * 60_000;
}

export function pickUndoTarget<T extends UndoCandidate>(entries: readonly T[], senderId: string, now: Date, minutes = DEFAULT_UNDO_MINUTES): T | null {
  const mine = entries
    .filter((e) => e.owner_id === senderId && e.source === "whatsapp")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const latest = mine[0];
  if (!latest) return null;
  return withinUndoWindow(latest.created_at, now, minutes) ? latest : null;
}
