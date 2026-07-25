// Sky Strike — a Phaser 4 fighter-pilot POV arcade game.
//
// The kid is the pilot. Two fists = a flight yoke (calibrated via MediaPipe
// GestureRecognizer in useFlightYoke). BANK left/right aims the guns (a
// nose reticle slides with your fists); PULL UP climbs — point the nose at
// far bandits to shoot them early, or fly OVER a close bandit to dodge it;
// a thumbs-up/down pumps the trigger and fires at whatever the nose points at.
//
// Pure 2D faked perspective: a rolling/pitching horizon + enemy sprites that
// scale up as they "approach" the cockpit. No 3D, no external art deps.
// Sounds are synthesized live with WebAudio (truly royalty-free, no files).
//
// The React host (SkyStrikeGame.tsx) creates the Phaser.Game and feeds it
// FlightState every frame via the game registry.

import Phaser from "phaser";

export interface FlightInput {
  aligned: boolean;
  bank: number; // -1..1
  climb: number; // 0..1
  fire: number; // 1 = fresh trigger
}

const GAME_W = 960;
const GAME_H = 540;
const HORIZON_Y = 250; // rest position of the horizon (center of roll)
const COCKPIT_TOP = 470; // dashboard coaming y

const MAX_ROLL = 0.45; // rad (~26°) horizon tilt at full bank
const MAX_PITCH = 90; // px horizon drops at full climb
const ROLL_EASE = 6; // per-second approach rate
const PITCH_EASE = 6;

const ENEMY_MIN_SPEED = 0.12; // approach "scale per second"
const ENEMY_MAX_SPEED = 0.26;
const ENEMY_START_SCALE = 0.5;
const ENEMY_END_SCALE = 2.2; // scale at which a bandit reaches the cockpit
const ENEMY_HIT_SCALE = 0.3; // below this a bandit is too far/small to hit
const NOSE_BANK_RANGE = 0.34; // fraction of width the nose sweeps as you bank
const NOSE_CLIMB_RANGE = 180; // px the nose rises at full climb
const NOSE_HIT_RADIUS = 80; // px — fire hits a bandit within this of the nose
const CLIMB_DODGE = 0.45; // climb >= this flies OVER a bandit at the cockpit
const SPAWN_MIN_MS = 1200;
const SPAWN_MAX_MS = 2400;
// Gentle start: long opening gap + breathing room before the first bandit so
// new pilots can learn to aim and shoot before being swarmed.
const SPAWN_START_MS = 4000; // long opening gap (fades into the difficulty curve)
const FIRST_SPAWN_DELAY_MS = 1500; // pause after alignment before the first bandit
const EARLY_SPAWN_HOLD_SEC = 15; // span over which the opening-gap bonus fades out
const ENEMY_CAP_START = 2; // max concurrent bandits in the opening
const ENEMY_CAP_GRACE_SEC = 15; // hold the opening cap for this long
const ENEMY_CAP_RAMP_SEC = 10; // after grace, +1 to the cap every this many seconds
const ENEMY_CAP_END = 5; // ceiling for the concurrent-bandit cap
const ENEMY_SPEED_RAMP_SEC = 45; // early bandits are slow; reach full speed by this time
const ENEMY_SPEED_START_FACTOR = 0.6; // multiply random speed range at t=0, → 1.0 at ramp end
const FIRE_COOLDOWN_MS = 350;
const LIVES = 3;

// Palette — dawn sky + steel cockpit.
const C = {
  skyTop: 0x0b1c3a,
  skyMid: 0x2b5a8f,
  skyLow: 0xbfd8ef,
  sun: 0xfff2b3,
  cloud: 0xeaf2fb,
  ground: 0x2a3d2f,
  groundFar: 0x3a6147,
  cockpit: 0x14171c,
  cockpitEdge: 0x2a2f38,
  enemy: 0x3a3a3a,
  enemyWing: 0x5a5f66,
  enemyMark: 0xc0392b,
  hud: 0xf8fafc,
  cross: 0xfde047,
  blast: 0xfde047,
  laser: 0x7dd3fc,
};

interface Enemy {
  go: Phaser.GameObjects.Image;
  trail: Phaser.GameObjects.Graphics; // contrail back to the horizon
  scale: number; // grows from ENEMY_START_SCALE as it approaches
  speed: number; // scale/sec
  drift: number; // target x offset from centre (px) — bandits fan out
  alive: boolean;
}

export class SkyStrikeScene extends Phaser.Scene {
  private sky!: Phaser.GameObjects.Graphics;
  private horizonContainer!: Phaser.GameObjects.Container;
  private horizonStrip!: Phaser.GameObjects.Graphics;
  private clouds: Phaser.GameObjects.Graphics[] = [];
  private cockpitFrame!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private gameOverGroup: Phaser.GameObjects.GameObject[] = [];

  private enemies: Enemy[] = [];
  private score = 0;
  private lives = LIVES;
  private nextSpawnAt = 0;
  private elapsed = 0;
  private gameOver = false;
  private lastFireAt = 0;
  private roll = 0; // current horizon roll (rad)
  private pitch = 0; // current horizon pitch (px, positive = down)
  private flashRed = 0;
  // Nose reticle = where your guns point. Bank moves it x, climb moves it y.
  private nose!: Phaser.GameObjects.Graphics;
  private noseX = GAME_W / 2;
  private noseY = COCKPIT_TOP - 40;
  private currentClimb = 0;

  // WebAudio synth (royalty-free, no asset files).
  private audioCtx: AudioContext | null = null;

  constructor() {
    super("sky-strike");
  }

  init() {
    this.enemies = [];
    this.gameOverGroup = [];
    this.score = 0;
    this.lives = LIVES;
    // Delay the first spawn after alignment so the pilot has breathing room.
    this.nextSpawnAt = FIRST_SPAWN_DELAY_MS / 1000;
    this.elapsed = 0;
    this.gameOver = false;
    this.lastFireAt = 0;
    this.roll = 0;
    this.pitch = 0;
    this.flashRed = 0;
    this.noseX = GAME_W / 2;
    this.noseY = COCKPIT_TOP - 40;
    this.currentClimb = 0;
  }

  preload() {
    // Procedural enemy-plane texture (drawn once in create via generateTexture).
  }

  create() {
    const { width, height } = this.scale;

    // --- Sky gradient (banded; cheap and gap-free under a rolling horizon) ---
    this.sky = this.add.graphics();
    this.drawSky(width, height);
    this.sky.setDepth(-10);

    // --- Horizon container (rotates around HORIZON_Y center; pitches down) ---
    // Wide enough that rotation never exposes the sky edge. Drawn far below
    // the cockpit so pitch-down still shows ground.
    this.horizonStrip = this.add.graphics();
    const stripW = width * 2.4;
    const stripH = height * 2;
    // Distant terrain band (green) — the "earth" below the horizon line.
    this.horizonStrip.fillStyle(C.groundFar, 1);
    this.horizonStrip.fillRect(-stripW / 2, 0, stripW, stripH);
    this.horizonStrip.fillStyle(C.ground, 1);
    this.horizonStrip.fillRect(-stripW / 2, 120, stripW, stripH);
    // A bright horizon line.
    this.horizonStrip.lineStyle(3, 0xf8fafc, 0.5);
    this.horizonStrip.beginPath();
    this.horizonStrip.moveTo(-stripW / 2, 0);
    this.horizonStrip.lineTo(stripW / 2, 0);
    this.horizonStrip.strokePath();

    // A few clouds above the horizon (drawn into the same strip so they roll
    // and pitch together — sells the banking motion).
    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      const cg = this.add.graphics();
      cg.fillStyle(C.cloud, 0.85);
      const cx = -width + i * (width * 0.6);
      const cy = -Phaser.Math.Between(120, 220);
      for (let b = 0; b < 4; b++) {
        cg.fillCircle(cx + b * 26, cy + Phaser.Math.Between(-8, 8), Phaser.Math.Between(26, 40));
      }
      this.clouds.push(cg);
    }
    // A low sun on the horizon.
    const sun = this.add.graphics();
    sun.fillStyle(C.sun, 0.9);
    sun.fillCircle(width * 0.3, -40, 46);
    this.clouds.push(sun);

    this.horizonContainer = this.add.container(width / 2, HORIZON_Y, [
      this.horizonStrip,
      ...this.clouds,
    ]);
    this.horizonContainer.setDepth(-5);

    // --- Enemy plane texture (procedural top-down fighter, nose up) ---
    if (!this.textures.exists("enemy-plane")) {
      const EW = 96;
      const EH = 116;
      const ex = EW / 2;
      const pg = this.make.graphics({ x: 0, y: 0 });

      // Wings (drawn first, behind fuselage) — swept-back trapezoids.
      pg.fillStyle(0x2b2f36, 1);
      pg.beginPath();
      pg.moveTo(ex - 7, 40);
      pg.lineTo(ex - 46, 30);
      pg.lineTo(ex - 46, 52);
      pg.lineTo(ex - 9, 60);
      pg.closePath();
      pg.fillPath();
      pg.beginPath();
      pg.moveTo(ex + 7, 40);
      pg.lineTo(ex + 46, 30);
      pg.lineTo(ex + 46, 52);
      pg.lineTo(ex + 9, 60);
      pg.closePath();
      pg.fillPath();

      // Tail planes (smaller, near the back).
      pg.fillStyle(0x3a3f47, 1);
      pg.beginPath();
      pg.moveTo(ex - 6, 92);
      pg.lineTo(ex - 24, 88);
      pg.lineTo(ex - 24, 100);
      pg.lineTo(ex - 5, 102);
      pg.closePath();
      pg.fillPath();
      pg.beginPath();
      pg.moveTo(ex + 6, 92);
      pg.lineTo(ex + 24, 88);
      pg.lineTo(ex + 24, 100);
      pg.lineTo(ex + 5, 102);
      pg.closePath();
      pg.fillPath();

      // Fuselage — rounded, nose at top. Dark red = enemy.
      pg.fillStyle(0x4a1010, 1);
      pg.fillRoundedRect(ex - 10, 14, 20, 86, 10);
      // Nose spinner.
      pg.fillStyle(0x6b1414, 1);
      pg.fillCircle(ex, 18, 7);

      // Cockpit canopy (dark glass).
      pg.fillStyle(0x0b1c3a, 1);
      pg.fillEllipse(ex, 42, 13, 22);

      // Vertical tail fin.
      pg.fillStyle(0x4a1010, 1);
      pg.beginPath();
      pg.moveTo(ex - 4, 94);
      pg.lineTo(ex + 4, 94);
      pg.lineTo(ex + 3, 110);
      pg.lineTo(ex - 3, 110);
      pg.closePath();
      pg.fillPath();

      // Enemy roundels on the wings.
      pg.fillStyle(C.enemyMark, 1);
      pg.fillCircle(ex - 27, 42, 5);
      pg.fillCircle(ex + 27, 42, 5);

      pg.generateTexture("enemy-plane", EW, EH);
    }

    // --- Cockpit frame (bottom dashboard coaming) ---
    this.cockpitFrame = this.add.graphics();
    this.drawCockpit(width, height);
    this.cockpitFrame.setDepth(25);

    // --- Nose reticle (your guns' aim point; bank + climb move it) ---
    this.nose = this.add.graphics();
    this.nose.setDepth(22);

    // --- HUD ---
    this.scoreText = this.add
      .text(16, 14, "Score: 0", { fontSize: "22px", color: "#f8fafc" })
      .setDepth(30);
    this.livesText = this.add
      .text(16, 42, `Lives: ${this.lives}`, { fontSize: "18px", color: "#f8fafc" })
      .setDepth(30);
    this.statusText = this.add
      .text(width - 16, 18, "ALIGNING…", { fontSize: "16px", color: "#fde047" })
      .setOrigin(1, 0)
      .setDepth(30);
    this.hint = this.add
      .text(width / 2, height - 26, "BANK to aim  •  PULL UP to climb / fly over  •  THUMB to fire", {
        fontSize: "13px",
        color: "#94a3b8",
      })
      .setOrigin(0.5)
      .setDepth(30);

    this.events.once("shutdown", this.cleanup, this);
  }

  update(_time: number, deltaMs: number) {
    const delta = deltaMs / 1000;
    const input = this.game.registry.get("flight") as FlightInput | undefined;

    // --- Phase routing ---
    const aligned = !!input?.aligned;
    this.statusText.setText(aligned ? "ALIGNED ✓" : "ALIGNING…");
    this.statusText.setColor(aligned ? "#86efac" : "#fde047");

    if (this.gameOver) {
      this.roll += (0 - this.roll) * Math.min(1, delta * 2);
      this.pitch += (0 - this.pitch) * Math.min(1, delta * 2);
      this.applyHorizon();
      return;
    }

    // --- Horizon roll/pitch ease toward input ---
    const bank = input?.bank ?? 0;
    const climb = input?.climb ?? 0;
    const targetRoll = aligned ? -bank * MAX_ROLL : 0;
    const targetPitch = aligned ? climb * MAX_PITCH : 0;
    this.roll += (targetRoll - this.roll) * Math.min(1, delta * ROLL_EASE);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, delta * PITCH_EASE);
    this.applyHorizon();

    // --- Nose reticle (aim point) ---
    if (aligned) {
      this.currentClimb = climb;
      const targetNoseX = this.scale.width / 2 + bank * this.scale.width * NOSE_BANK_RANGE;
      const targetNoseY = COCKPIT_TOP - 40 - climb * NOSE_CLIMB_RANGE;
      // Ease so the reticle feels like a heavy gun, not teleporting.
      const e = Math.min(1, delta * 12);
      this.noseX += (targetNoseX - this.noseX) * e;
      this.noseY += (targetNoseY - this.noseY) * e;
      this.drawNose();
    } else {
      this.currentClimb = 0;
      this.nose.clear();
    }

    if (!aligned) {
      // Calibrating — freeze enemies, don't spawn.
      return;
    }

    this.elapsed += delta;

    // --- Spawning (gentle ramp: long opening gap → difficulty curve, capped) ---
    const aliveCount = this.enemies.filter((e) => e.alive).length;
    const cap = this.enemyCap();
    if (this.elapsed >= this.nextSpawnAt && aliveCount < cap) {
      this.spawnEnemy();
      const difficulty = Math.min(1, this.elapsed / 50);
      // Difficulty curve alone spans SPAWN_MAX_MS → SPAWN_MIN_MS.
      const baseGap = SPAWN_MAX_MS - (SPAWN_MAX_MS - SPAWN_MIN_MS) * difficulty;
      // Opening bonus stretches the gap up to SPAWN_START_MS, fading over the
      // hold window so early play stays calm before handing off to the curve.
      const earlyBonus =
        (SPAWN_START_MS - SPAWN_MAX_MS) * Math.max(0, 1 - this.elapsed / EARLY_SPAWN_HOLD_SEC);
      const gap = baseGap + earlyBonus;
      this.nextSpawnAt = this.elapsed + gap / 1000;
    } else if (this.elapsed >= this.nextSpawnAt && aliveCount >= cap) {
      // At the cap — retry shortly so a freed slot fills promptly.
      this.nextSpawnAt = this.elapsed + 0.2;
    }

    // --- Enemies approach (scale up + move toward viewer) ---
    const cx = this.scale.width / 2;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.scale += e.speed * delta;
      e.go.setScale(e.scale);
      // World y grows from HORIZON_Y toward COCKPIT_TOP as scale grows.
      const t = Phaser.Math.Clamp((e.scale - ENEMY_START_SCALE) / (ENEMY_END_SCALE - ENEMY_START_SCALE), 0, 1);
      e.go.y = HORIZON_Y + t * (COCKPIT_TOP - HORIZON_Y);
      e.go.x = cx + e.drift * t; // fans out toward its target lane
      // Fade in as it leaves the horizon; contrail makes it visible from far.
      e.go.setAlpha(Math.min(1, t * 2 + 0.3));
      // Contrail: a tapering streak from the plane back up to the horizon.
      e.trail.clear();
      e.trail.lineStyle(Math.max(1, e.scale * 3), 0xffffff, 0.22 * Math.min(1, t + 0.3));
      e.trail.beginPath();
      e.trail.moveTo(e.go.x, e.go.y - e.scale * 10);
      e.trail.lineTo(e.go.x, HORIZON_Y);
      e.trail.strokePath();
      if (e.go.y >= COCKPIT_TOP - 10) {
        // Bandit reached the cockpit. Pull up (climb) to fly OVER it (dodge);
        // else it rams you and costs a life.
        if (this.currentClimb >= CLIMB_DODGE) {
          this.flyOver(e);
        } else {
          this.killEnemy(e);
          this.loseLife();
        }
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);

    // --- Fire ---
    if ((input?.fire ?? 0) >= 1 && this.time.now - this.lastFireAt > FIRE_COOLDOWN_MS) {
      this.lastFireAt = this.time.now;
      this.doFire();
    }

    // --- Damage flash ---
    if (this.flashRed > 0) {
      this.flashRed -= delta;
      this.cockpitFrame.setAlpha(1);
    }
  }

  private applyHorizon() {
    this.horizonContainer.rotation = this.roll;
    this.horizonContainer.y = HORIZON_Y + this.pitch;
  }

  /** Max concurrent bandits the sky can hold right now (ramps up over time). */
  private enemyCap(): number {
    if (this.elapsed < ENEMY_CAP_GRACE_SEC) return ENEMY_CAP_START;
    const steps = Math.floor((this.elapsed - ENEMY_CAP_GRACE_SEC) / ENEMY_CAP_RAMP_SEC) + 1;
    return Math.min(ENEMY_CAP_END, ENEMY_CAP_START + steps);
  }

  private spawnEnemy() {
    const cx = this.scale.width / 2;
    const trail = this.add.graphics();
    trail.setDepth(9);
    const go = this.add.image(cx, HORIZON_Y, "enemy-plane");
    go.setOrigin(0.5, 0.5).setDepth(10).setScale(ENEMY_START_SCALE).setAlpha(0);
    // Early bandits are slow (factor starts ~0.6, reaches 1.0 by the speed-ramp
    // window) so new pilots have time to line up shots before things get busy.
    const ramp = Math.min(1, this.elapsed / ENEMY_SPEED_RAMP_SEC);
    const factor = ENEMY_SPEED_START_FACTOR + (1 - ENEMY_SPEED_START_FACTOR) * ramp;
    const speed =
      (ENEMY_MIN_SPEED + Math.random() * (ENEMY_MAX_SPEED - ENEMY_MIN_SPEED)) * factor;
    // Each bandit picks a lane across the view; the player must bank to aim at it.
    const drift = (Math.random() * 2 - 1) * (this.scale.width * 0.33);
    this.enemies.push({ go, trail, scale: ENEMY_START_SCALE, speed, drift, alive: true });
  }

  /** Destroy an enemy and its contrail (no fade). */
  private killEnemy(e: Enemy) {
    e.alive = false;
    e.trail.destroy();
    e.go.destroy();
  }

  private doFire() {
    this.playLaser();
    // Muzzle flash at the nose reticle (where the guns point).
    const flash = this.add.circle(this.noseX, this.noseY, 9, C.laser, 0.9);
    flash.setDepth(23);
    this.tweens.add({
      targets: flash,
      scale: 3,
      alpha: 0,
      duration: 180,
      ease: "Quad.out",
      onComplete: () => flash.destroy(),
    });

    // Hit the bandit the nose is pointing at (within NOSE_HIT_RADIUS), else miss.
    let target: Enemy | null = null;
    let best = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || e.scale < ENEMY_HIT_SCALE) continue;
      const d = Phaser.Math.Distance.Between(this.noseX, this.noseY, e.go.x, e.go.y);
      if (d < NOSE_HIT_RADIUS && d < best) {
        best = d;
        target = e;
      }
    }
    if (!target) return; // clean miss — only the muzzle flash plays
    target.alive = false;
    target.trail.destroy();
    this.spawnBurst(target.go.x, target.go.y, C.blast, 16);
    this.playExplosion();
    this.tweens.add({
      targets: target.go,
      scale: target.go.scaleX * 1.6,
      alpha: 0,
      angle: Phaser.Math.Between(-90, 90),
      duration: 360,
      ease: "Quad.out",
      onComplete: () => target.go.destroy(),
    });
    this.score += 10;
    this.scoreText.setText(`Score: ${this.score}`);
  }

  /** A bandit reached the cockpit but the pilot pulled up — it passes under. */
  private flyOver(e: Enemy) {
    e.alive = false;
    e.trail.destroy();
    // Whoosh: the bandit drops below the cockpit and fades (you flew over it).
    this.spawnBurst(e.go.x, COCKPIT_TOP, 0x7dd3fc, 6);
    this.tweens.add({
      targets: e.go,
      y: e.go.y + 80,
      alpha: 0,
      duration: 280,
      ease: "Quad.in",
      onComplete: () => e.go.destroy(),
    });
  }

  private spawnBurst(x: number, y: number, color: number, count: number) {
    for (let i = 0; i < count; i++) {
      const p = this.add.circle(x, y, Phaser.Math.Between(3, 7), color);
      p.setDepth(15);
      const angle = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(30, 80);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 400,
        ease: "Quad.out",
        onComplete: () => p.destroy(),
      });
    }
  }

  private loseLife() {
    this.lives -= 1;
    this.livesText.setText(`Lives: ${this.lives}`);
    this.flashRed = 0.4;
    this.cockpitFrame.setAlpha(0.6);
    this.cameras.main.shake(180, 0.006);
    this.playExplosion();
    if (this.lives <= 0) this.endGame();
  }

  private endGame() {
    this.gameOver = true;
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const overlay = this.add.rectangle(cx, cy, GAME_W, GAME_H, 0x000000, 0.65);
    overlay.setDepth(40);
    const title = this.add
      .text(cx, cy - 30, "MISSION OVER", { fontSize: "46px", color: "#fde047", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(41);
    const scoreLabel = this.add
      .text(cx, cy + 20, `Score: ${this.score}`, { fontSize: "24px", color: "#f8fafc" })
      .setOrigin(0.5)
      .setDepth(41);
    const restart = this.add
      .text(cx, cy + 70, "Press SPACE / tap to fly again", { fontSize: "16px", color: "#94a3b8" })
      .setOrigin(0.5)
      .setDepth(41);
    this.gameOverGroup.push(overlay, title, scoreLabel, restart);
    this.input.keyboard?.once("keydown-SPACE", () => this.scene.restart());
    this.input.once("pointerdown", () => this.scene.restart());
  }

  // --- Drawing helpers ---

  private drawSky(w: number, h: number) {
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const col = this.lerpColor(C.skyTop, C.skyLow, t);
      this.sky.fillStyle(col, 1);
      this.sky.fillRect(0, (h / bands) * i, w, h / bands + 1);
    }
  }

  private drawCockpit(w: number, h: number) {
    this.cockpitFrame.clear();
    // Dashboard coaming — a dark trapezoid hugging the bottom.
    this.cockpitFrame.fillStyle(C.cockpit, 1);
    this.cockpitFrame.beginPath();
    this.cockpitFrame.moveTo(0, COCKPIT_TOP);
    this.cockpitFrame.lineTo(w, COCKPIT_TOP + 26);
    this.cockpitFrame.lineTo(w, h);
    this.cockpitFrame.lineTo(0, h);
    this.cockpitFrame.closePath();
    this.cockpitFrame.fillPath();
    // Coaming highlight edge.
    this.cockpitFrame.lineStyle(3, C.cockpitEdge, 1);
    this.cockpitFrame.beginPath();
    this.cockpitFrame.moveTo(0, COCKPIT_TOP);
    this.cockpitFrame.lineTo(w, COCKPIT_TOP + 26);
    this.cockpitFrame.strokePath();
    // Side frame arcs (suggest a canopy).
    this.cockpitFrame.fillStyle(C.cockpit, 0.9);
    this.cockpitFrame.fillRect(0, 0, 40, h);
    this.cockpitFrame.fillRect(w - 40, 0, 40, h);
  }

  private drawNose() {
    this.nose.clear();
    const x = this.noseX;
    const y = this.noseY;
    this.nose.lineStyle(2, 0xfde047, 0.95);
    this.nose.strokeCircle(x, y, 14);
    this.nose.beginPath();
    this.nose.moveTo(x - 22, y);
    this.nose.lineTo(x - 7, y);
    this.nose.moveTo(x + 7, y);
    this.nose.lineTo(x + 22, y);
    this.nose.moveTo(x, y - 22);
    this.nose.lineTo(x, y - 7);
    this.nose.moveTo(x, y + 7);
    this.nose.lineTo(x, y + 22);
    this.nose.strokePath();
    this.nose.fillStyle(0xfde047, 1);
    this.nose.fillCircle(x, y, 2);
  }

  private lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff;
    const ag = (a >> 8) & 0xff;
    const ab = a & 0xff;
    const br = (b >> 16) & 0xff;
    const bg = (b >> 8) & 0xff;
    const bb = b & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | bl;
  }

  // --- WebAudio synth (no asset files → royalty-free by construction) ---

  private ensureAudio() {
    if (this.audioCtx) {
      if (this.audioCtx.state === "suspended") void this.audioCtx.resume();
      return this.audioCtx;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    this.audioCtx = new Ctx();
    return this.audioCtx;
  }

  private playLaser() {
    const ctx = this.ensureAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.18);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  private playExplosion() {
    const ctx = this.ensureAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    // Noise burst through a lowpass for a "boom".
    const dur = 0.45;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(t);
    noise.stop(t + dur);
  }

  private cleanup() {
    for (const go of this.gameOverGroup) go.destroy();
    this.gameOverGroup = [];
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}

export const SKY_STRIKE_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_W,
  height: GAME_H,
  backgroundColor: "#0b1c3a",
  parent: "sky-strike-container",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: SkyStrikeScene,
};
