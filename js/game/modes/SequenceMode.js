// SequenceMode — mode "urutan". Mengikuti kontrak di ModeRegistry.js.
// TODO(M7.3)
export class SequenceMode {
  constructor({ config, items }) {
    this.config = config;
    this.items = items;
  }

  start() {
    throw new Error('SequenceMode.start: belum diimplementasi (M7.3)');
  }

  update(/* dt, cursor */) {
    throw new Error('SequenceMode.update: belum diimplementasi (M7.3)');
  }

  getBubbles() {
    throw new Error('SequenceMode.getBubbles: belum diimplementasi (M7.3)');
  }

  getPrompt() {
    throw new Error('SequenceMode.getPrompt: belum diimplementasi (M7.3)');
  }

  isFinished() {
    throw new Error('SequenceMode.isFinished: belum diimplementasi (M7.3)');
  }
}
