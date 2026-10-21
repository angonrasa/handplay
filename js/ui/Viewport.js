// js/ui/Viewport.js
// Viewport — mengikuti ukuran area tampilan dan orientasi perangkat.
// Menyamakan ukuran piksel canvas overlay dengan area tampilan, lalu
// memberi tahu pihak lain (nanti: LandmarkMapper, BubbleManager) lewat onChange.
// Orientasi tidak dikunci: portrait di HP, landscape di TV, semuanya diikuti.

const MAX_DPR = 2; // batas kerapatan piksel di HP
const BIG_SCREEN_W = 1200; // lebar (px CSS) ke atas dianggap TV/papan interaktif

// TV/papan interaktif sering melapor devicePixelRatio 2 (panel 4K): canvas jadi 4× lebih banyak piksel padahal
// ditonton dari jauh. Di layar besar dipakai 1. Ujicoba: ?dpr=1|1.5|2 menimpa aturan ini.
function pickDpr(width) {
  const forced = parseFloat(new URLSearchParams(window.location.search).get('dpr'));
  if (forced > 0) return Math.min(forced, 3);
  const cap = width >= BIG_SCREEN_W ? 1 : MAX_DPR;
  return Math.min(window.devicePixelRatio || 1, cap);
}

export class Viewport {
  /**
   * @param {HTMLElement} element  area yang diukur (mis. #stage)
   * @param {HTMLCanvasElement} canvas  canvas yang ukuran pikselnya disamakan
   * @param {(state: {width:number,height:number,dpr:number,orientation:'portrait'|'landscape'}) => void} onChange
   */
  constructor(element, canvas, onChange) {
    this.element = element;
    this.canvas = canvas;
    this.onChange = onChange;
    this.state = null;
    this._frame = 0;
    this._timer = 0;
    this._schedule = this._schedule.bind(this);
    this._onOrientation = this._onOrientation.bind(this);
  }

  start() {
    window.addEventListener('resize', this._schedule);
    window.addEventListener('orientationchange', this._onOrientation);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this._schedule);
    this.measure();
  }

  stop() {
    window.removeEventListener('resize', this._schedule);
    window.removeEventListener('orientationchange', this._onOrientation);
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', this._schedule);
    cancelAnimationFrame(this._frame);
    clearTimeout(this._timer);
  }

  measure() {
    const rect = this.element.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const dpr = pickDpr(width);
    if (width === 0 || height === 0) return;

    const prev = this.state;
    if (prev && prev.width === width && prev.height === height && prev.dpr === dpr) return;

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.state = { width, height, dpr, orientation: width >= height ? 'landscape' : 'portrait' };
    this.onChange(this.state);
  }

  _schedule() {
    cancelAnimationFrame(this._frame);
    this._frame = requestAnimationFrame(() => this.measure());
  }

  // Beberapa browser melaporkan ukuran lama sesaat setelah layar diputar: ukur lagi sebentar kemudian.
  _onOrientation() {
    this._schedule();
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.measure(), 300);
  }
}
