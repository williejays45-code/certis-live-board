const button = document.getElementById('enter-certis');
const board = document.getElementById('live-board');
if (button && board) {
  button.addEventListener('click', () => {
    document.body.classList.add('board-entering');
    window.setTimeout(() => {
      board.scrollIntoView({behavior:'smooth', block:'start'});
      window.setTimeout(() => document.body.classList.remove('board-entering'), 900);
    }, 280);
  });
}
