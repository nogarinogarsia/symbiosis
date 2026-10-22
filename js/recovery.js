import { loadIssue, importSave, reset } from './game.js';

export function showRecovery(start) {
  const overlay = document.createElement('section');
  overlay.className = 'recovery'; overlay.setAttribute('role', 'alertdialog'); overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'recoveryTitle');
  overlay.innerHTML = `<div class="dialog"><h2 id="recoveryTitle">💾 저장 파일을 보호하고 있어요</h2><p id="recoveryMessage"></p><p class="hint">원본을 내려받거나, 이전에 백업한 정상 저장을 불러올 수 있어요. 새 게임을 선택하기 전까지 기존 저장은 바뀌지 않습니다.</p><div class="row"><button class="btn" id="downloadOriginal">원본 저장 내려받기</button><button class="btn" id="restoreRecovery">백업으로 복구</button><button class="btn gray" id="newRecovery">새 게임 시작</button></div><div id="recoveryConfirm" hidden><p>원본을 먼저 내려받아 보관해 주세요. 새 게임을 시작하면 기존 저장을 교체합니다.</p><div class="row"><button class="btn gray" id="cancelRecovery">취소</button><button class="btn peach" id="confirmRecovery">원본 교체하고 새 게임 시작</button></div></div><input type="file" id="recoveryFile" accept="application/json,.json" hidden><p id="recoveryStatus" role="status"></p></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#recoveryMessage').textContent = loadIssue.message;
  const status = overlay.querySelector('#recoveryStatus');
  const original = loadIssue.raw;
  const download = overlay.querySelector('#downloadOriginal');
  download.disabled = original === null;
  download.onclick = () => {
    const url = URL.createObjectURL(new Blob([original], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = '냥냥-원본저장-복구용.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const fileInput = overlay.querySelector('#recoveryFile');
  overlay.querySelector('#restoreRecovery').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files[0]; if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 저장 파일을 골라 주세요');
      importSave(await file.text()); overlay.remove(); await start();
    } catch (err) { status.textContent = err.message; }
    finally { fileInput.value = ''; }
  };
  overlay.querySelector('#newRecovery').onclick = () => { overlay.querySelector('#recoveryConfirm').hidden = false; overlay.querySelector('#cancelRecovery').focus(); };
  overlay.querySelector('#cancelRecovery').onclick = () => { overlay.querySelector('#recoveryConfirm').hidden = true; overlay.querySelector('#newRecovery').focus(); };
  overlay.querySelector('#confirmRecovery').onclick = async () => {
    reset(); overlay.remove(); await start();
  };
  overlay.querySelector('button:not(:disabled)').focus();
  overlay.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const buttons = [...overlay.querySelectorAll('button:not(:disabled)')].filter(button => !button.closest('[hidden]'));
    const first = buttons[0], last = buttons.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}
