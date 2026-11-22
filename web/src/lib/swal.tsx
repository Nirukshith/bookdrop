'use client';

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { SweetAlertIcon, SweetAlertOptions } from 'sweetalert2';

/*
 * Result alerts (success / error / warning / info) on SweetAlert2:
 * - native draw-in stroke icons (checkmark, ring, X), recoloured in globals.css
 * - cubic-bezier zoom + backdrop transitions (hms-swal-show / hms-swal-hide)
 * - auto-dismiss, paused while the pointer is over the alert
 *
 *   await customSwal.success('Hold placed', 'Collect it within 24 hours.');
 *   await customSwal.error('Couldn’t cancel the hold', err.message);
 *
 * Messages may be plain text (escaped) or React content (rendered into the
 * alert, e.g. <ModalDetails/> receipt rows). Yes/no questions use ConfirmModal.
 */

type AlertKind = 'success' | 'error' | 'warning' | 'info';
type Message = React.ReactNode;

const DEFAULT_TIMER: Record<AlertKind, number> = {
  success: 2000,
  error: 2500,
  warning: 2500,
  info: 2000,
};
const DEFAULT_TITLE: Record<AlertKind, string> = {
  success: 'Done',
  error: 'Action failed',
  warning: 'Warning',
  info: 'Notice',
};

const BASE_OPTIONS: SweetAlertOptions = {
  customClass: {
    popup: 'hms-swal-popup',
    title: 'swal2-title',
    htmlContainer: 'swal2-html-container',
    confirmButton: 'hms-swal-confirm',
    cancelButton: 'hms-swal-cancel',
    actions: 'swal2-actions',
  },
  buttonsStyling: false,
  backdrop: 'rgba(13, 13, 13, 0.4)',
  showClass: { popup: 'hms-swal-show', backdrop: 'hms-swal-backdrop-show' },
  hideClass: { popup: 'hms-swal-hide', backdrop: 'hms-swal-backdrop-hide' },
  // Don't let SweetAlert2 force `height: auto` on <html>/<body> (breaks the portal layout).
  heightAuto: false,
};

let swalPromise: Promise<typeof import('sweetalert2').default> | null = null;
/** Loaded on first use, in the browser only. */
function loadSwal() {
  swalPromise ??= import('sweetalert2').then((m) => m.default.mixin(BASE_OPTIONS));
  return swalPromise;
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Renders the message into an element SweetAlert2 can host; returns it with its React root. */
function renderMessage(message: Message): { html?: string | HTMLElement; root?: Root } {
  if (message === undefined || message === null || message === '') return {};
  if (typeof message === 'string') {
    return { html: `<span class="hms-swal-text">${escapeHtml(message)}</span>` };
  }
  const el = document.createElement('div');
  el.className = 'hms-swal-text';
  const root = createRoot(el);
  flushSync(() => root.render(<>{message}</>));
  return { html: el, root };
}

async function fireAlert(kind: AlertKind, title: string | undefined, message?: Message, timer?: number) {
  const Swal = await loadSwal();
  const { html, root } = renderMessage(message);
  await Swal.fire({
    icon: kind as SweetAlertIcon,
    title: title ?? DEFAULT_TITLE[kind],
    html,
    showConfirmButton: false,
    timer: timer ?? DEFAULT_TIMER[kind],
    timerProgressBar: false,
    didOpen: (popup) => {
      popup.addEventListener('mouseenter', Swal.stopTimer);
      popup.addEventListener('mouseleave', Swal.resumeTimer);
    },
    didDestroy: () => root?.unmount(),
  });
}

/**
 * `customSwal.success(title, message?, timer?)`. With a single argument the
 * error/warning/info helpers treat it as the message under a default title,
 * mirroring the original helper's behaviour.
 */
export const customSwal = {
  success: (title: string, message?: Message, timer?: number) => fireAlert('success', title, message, timer),
  error: (titleOrMsg: string, message?: Message, timer?: number) =>
    message === undefined ? fireAlert('error', undefined, titleOrMsg, timer) : fireAlert('error', titleOrMsg, message, timer),
  warning: (titleOrMsg: string, message?: Message, timer?: number) =>
    message === undefined ? fireAlert('warning', undefined, titleOrMsg, timer) : fireAlert('warning', titleOrMsg, message, timer),
  info: (titleOrMsg: string, message?: Message, timer?: number) =>
    message === undefined ? fireAlert('info', undefined, titleOrMsg, timer) : fireAlert('info', titleOrMsg, message, timer),
};

export default customSwal;
