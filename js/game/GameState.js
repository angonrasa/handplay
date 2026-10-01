// GameState — satu sumber kebenaran untuk keadaan permainan.
export const Phase = Object.freeze({
  HOME: 'home',
  CALIBRATION: 'calibration',
  PLAYING: 'playing',
  PAUSED: 'paused',
  RESULT: 'result',
});

export class GameState {
  constructor() {
    this.phase = Phase.HOME;
    this.score = 0;
    this.lives = 0;
    this.timeLeft = 0;
  }

  // config berasal dari data/games.json: { duration, lives, ... }
  reset(config) {
    this.score = 0;
    this.lives = config.lives;
    this.timeLeft = config.duration;
  }
}
