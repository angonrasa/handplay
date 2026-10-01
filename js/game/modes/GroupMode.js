// GroupMode — mode "kelompokkan". Mengikuti kontrak di ModeRegistry.js.
// TODO(M7.2)
export class GroupMode {
  constructor({ config, items }) {
    this.config = config;
    this.items = items;
  }

  start() {
    throw new Error('GroupMode.start: belum diimplementasi (M7.2)');
  }

  update(/* dt, cursor */) {
    throw new Error('GroupMode.update: belum diimplementasi (M7.2)');
  }

  getBubbles() {
    throw new Error('GroupMode.getBubbles: belum diimplementasi (M7.2)');
  }

  getPrompt() {
    throw new Error('GroupMode.getPrompt: belum diimplementasi (M7.2)');
  }

  isFinished() {
    throw new Error('GroupMode.isFinished: belum diimplementasi (M7.2)');
  }
}
