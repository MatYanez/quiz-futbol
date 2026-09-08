// js/modal.js
function ensureDialogContainer() {
  let overlay = document.getElementById('custom-dialog-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'custom-dialog-overlay';
    overlay.className = 'custom-dialog-overlay';
    overlay.innerHTML = `
      <div class="custom-dialog">
        <div class="custom-dialog-icon" id="dialog-icon">⚠️</div>
        <h3 class="custom-dialog-title" id="dialog-title">Atención</h3>
        <p class="custom-dialog-msg" id="dialog-msg"></p>
        <div class="custom-dialog-actions" id="dialog-actions"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  return overlay;
}

export function showNotification({ title = 'Atención', message = '', icon = '⚡', btnText = 'Entendido' }) {
  return new Promise((resolve) => {
    const overlay = ensureDialogContainer();
    document.getElementById('dialog-icon').textContent = icon;
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-msg').textContent = message;

    const actions = document.getElementById('dialog-actions');
    actions.innerHTML = `<button class="btn-gold btn-block" id="dialog-ok-btn">${btnText}</button>`;

    overlay.classList.add('open');

    document.getElementById('dialog-ok-btn').onclick = () => {
      overlay.classList.remove('open');
      resolve();
    };
  });
}

export function showConfirm({ title = 'Confirmar', message = '', icon = '❓', confirmText = 'Aceptar', cancelText = 'Cancelar' }) {
  return new Promise((resolve) => {
    const overlay = ensureDialogContainer();
    document.getElementById('dialog-icon').textContent = icon;
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-msg').textContent = message;

    const actions = document.getElementById('dialog-actions');
    actions.innerHTML = `
      <button class="btn-muted" id="dialog-cancel-btn">${cancelText}</button>
      <button class="btn-gold" id="dialog-confirm-btn">${confirmText}</button>
    `;

    overlay.classList.add('open');

    document.getElementById('dialog-cancel-btn').onclick = () => {
      overlay.classList.remove('open');
      resolve(false);
    };
    document.getElementById('dialog-confirm-btn').onclick = () => {
      overlay.classList.remove('open');
      resolve(true);
    };
  });
}