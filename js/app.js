// app.js — titik masuk. Hanya merangkai modul, tidak berisi logika game.
import { ScreenManager } from './ui/ScreenManager.js';

const screens = new ScreenManager(document.getElementById('screens'));

// Tombol dengan data-goto="<nama-layar>" berpindah layar.
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-goto]');
  if (trigger) screens.show(trigger.dataset.goto);
});

screens.show('home');
