// ScreenManager — satu layar aktif pada satu waktu.
// Layar didefinisikan di HTML lewat atribut data-screen="<nama>".
export class ScreenManager {
  /**
   * @param {HTMLElement} root
   * @param {{ onChange?: (name: string, previous: string|null) => void }} [options]
   */
  constructor(root, { onChange = null } = {}) {
    this.root = root;
    this.onChange = onChange;
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
    const previous = this.current;
    for (const [screenName, el] of this.screens) {
      el.hidden = screenName !== name;
    }
    this.current = name;
    this.root.dataset.current = name;
    if (this.onChange) this.onChange(name, previous);
  }
}
