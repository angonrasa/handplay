// PickCorrectMode — mode "pilih-benar". Mengikuti kontrak di ModeRegistry.js.
// TODO(M4.6)
export class PickCorrectMode {
  constructor({ config, items }) {
    this.config = config;
    this.items = items;
  }

  start() {
    throw new Error('PickCorrectMode.start: belum diimplementasi (M4.6)');
  }

  update(/* dt, cursor */) {
    throw new Error('PickCorrectMode.update: belum diimplementasi (M4.6)');
  }

  getBubbles() {
    throw new Error('PickCorrectMode.getBubbles: belum diimplementasi (M4.6)');
  }

  getPrompt() {
    throw new Error('PickCorrectMode.getPrompt: belum diimplementasi (M4.6)');
  }

  isFinished() {
    throw new Error('PickCorrectMode.isFinished: belum diimplementasi (M4.6)');
  }
}
