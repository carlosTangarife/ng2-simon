import { Component } from '@angular/core';
import { SynthService } from '../shared/synth.service';
import { SimonModelService } from '../model/simon-model.service';

const SIMON_TONES = [
  192,  /* G3 */
  262,  /* C4 */
  330,  /* E4 */
  392   /* G4 */
];

const MAX_TONE_DURATION = 300;
const MIN_TONE_DURATION = 100;
const TONE_DURATION_DELTA = 10;

@Component({
  selector: 'simon-game',
  template: `
  <div>
    <simon-score [score]="playing ? score : 'PLAY'"></simon-score>

    <div class="simon-row">
      <simon-segment color="green"  (click)="button(0, 'green')" [state]="ledStates[0]">
      </simon-segment>
      <simon-segment color="red"    (click)="button(1, 'red')" [state]="ledStates[1]">
      </simon-segment>
    </div>
    <div class="simon-row">
      <simon-segment color="blue"   (click)="button(3, 'blue')" [state]="ledStates[3]">
      </simon-segment>
      <simon-segment color="yellow" (click)="button(2, 'yellow')" [state]="ledStates[2]">
      </simon-segment>
    </div>
    <simon-blink *ngIf="!playing">
      Click any color to start...
    </simon-blink>
  </div>
  `,
  styles: [`
    .simon-row {
      margin-bottom: 1pc;
    }

    simon-segment {
      margin-right: 0.5pc;
    }

    simon-blink {
      margin-top: 3pc;
      font-family: monospace;
    }
  `],
  providers: [SimonModelService]
})
export class SimonGameComponent {
  /**
   * Controls the states of each of the 4 buttons: on/off
   */
  ledStates = [false, false, false, false];

  /**
   * The sequence that the user has to repeat. Grows by one element
   * every turn.
   */
  private sequence: number[] = [];

  /**
   * Keeps track of the current user position in the sequence
   */
  private sequenceIndex: number;

  /**
   * Determines whether we are currently playing the sequence or waiting for user to repeat it
   */
  private playerTurn: boolean;

  /**
   * Indicates whether the game is currently active
   */
  playing: boolean = false;

  /**
   * Current score of the player
   */
  score: number = 0;

  /**
   * Keeps track of the time when the game started
   */
  private gameStartTime: Date;

  /**
   * Contains the color chosen at the beginning of the game:
   * 'red', 'green', 'blue' or 'yellow'
   */
  private gameColor: string;

  /**
   * Contains the color of the last button that was pressed (used for syncing to firebase)
   */
  private lastColor: string;

  constructor(private synth: SynthService, private simonModel: SimonModelService) {
  }

  startGame() {
    this.gameStartTime = new Date();
    this.nextTurn();
  }

  nextTurn() {
    this.sequence.push(Math.floor(Math.random() * 4));
    this.sequenceIndex = 0;
    this.playSequence();
    this.updateModel();
  }

  blink(ledIndex) {
    return new Promise(resolve => {
      this.ledStates[ledIndex] = true;
      const duration = Math.max(MAX_TONE_DURATION - this.score * TONE_DURATION_DELTA, MIN_TONE_DURATION);
      this.synth.playTone(SIMON_TONES[ledIndex], duration);
      setTimeout(() => {
        this.ledStates[ledIndex] = false;
        resolve();
      }, duration);
    });
  }

  playSequence() {
    if (this.sequenceIndex < this.sequence.length) {
      const ledIndex = this.sequence[this.sequenceIndex];
      this.blink(ledIndex).then(() => {
        this.sequenceIndex++;
        setTimeout(() => this.playSequence(), 50);
      });
    } else {
      this.playerTurn = true;
      this.sequenceIndex = 0;
    }
  }

  button(idx: number, color: string) {
    if (!this.playing) {
      this.playing = true;
      this.gameColor = color;
      this.lastColor = color;
      setTimeout(() => this.startGame(), 300);
      return;
    }
    if (this.playerTurn) {
      this.playerTurn = false;
      this.lastColor = color;
      this.updateModel();
      this.blink(idx).then(() => {
        if (idx !== this.sequence[this.sequenceIndex]) {
          this.gameOver();
          return;
        }
        this.sequenceIndex++;
        if (this.sequenceIndex === this.sequence.length) {
          this.playerTurn = false;
          this.nextRound();
        } else {
          this.playerTurn = true;
        }
      });
    }
  }

  nextRound() {
    this.score++;
    this.synth.playSound('assets/sound/levelup.mp3').then(() => {
      setTimeout(() => this.nextTurn(), 200);
    });
  }

  gameOver() {
    console.log('Game Over!');
    this.updateModel(true);
    this.simonModel.publishScore({
      score: this.score,
      color: this.gameColor,
      playingTime: (new Date().getTime() - this.gameStartTime.getTime()) / 1000.0
    });
    this.synth.playSound('assets/sound/gameover.mp3').then(() => {
      this.sequence = [];
      this.score = 0;
      this.playing = false;
      this.updateModel();
    });
  }

  private updateModel(gameOver = false) {
    this.simonModel.updateGame({
      score: this.score,
      playing: this.playing,
      gameColor: this.gameColor,
      lastColor: this.lastColor,
      sequenceIndex: this.sequenceIndex,
      gameOver: gameOver
    });
  }
}
