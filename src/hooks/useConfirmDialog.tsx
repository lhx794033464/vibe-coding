'use client';

import { useState, useCallback, useRef } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface ConfirmOptions {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
}

export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ description: '' });
  const resolveRef = useRef<(value: boolean) => void>(() => {});

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleAction = useCallback((value: boolean) => {
    setOpen(false);
    resolveRef.current(value);
  }, []);

  const ConfirmDialog = (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleAction(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options.title || '确认操作'}</AlertDialogTitle>
          <AlertDialogDescription>{options.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => handleAction(false)}>
            {options.cancelText || '取消'}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => handleAction(true)}
            className={options.variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {options.confirmText || '确认'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, ConfirmDialog };
}
