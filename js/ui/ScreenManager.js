// ScreenManager — satu layar aktif pada satu waktu.
// Layar didefinisikan di HTML lewat atribut data-screen="<nama>".
export class ScreenManager {
  constructor(root) {
    this.root = root;
    this.current = null;
    this.screens = new Map();
    root.querySelectorAll('[data-screen]').forEach((el) => {
      this.screens.set(el.dataset.screen, el);
    });
  }

  show(name) {
    if (!this.screens.has(name)) {
      throw new Error(`Layar tidak dikenal: ${name}`);
    }
    for (const [screenName, el] of this.screens) {
      el.hidden = screenName !== name;
    }
    this.current = name;
    this.root.dataset.current = name;
  }
}
