"use client";

import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { AlertTriangle } from "lucide-react";

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  title?: string;
  description?: string;
}

export default function DeleteModal({
  isOpen,
  onClose,
  onConfirm,
  loading,
  title = "Silme Onayı",
  description = "Bu öğeyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.",
}: DeleteModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex gap-3 mb-6">
        <div className="rounded-full bg-error/10 p-2 h-fit">
          <AlertTriangle className="h-5 w-5 text-error" />
        </div>
        <p className="text-sm text-text-muted">{description}</p>
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          İptal
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>
          Sil
        </Button>
      </div>
    </Modal>
  );
}
