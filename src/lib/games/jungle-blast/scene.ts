// Jungle Blast — a Phaser 4 arcade game.
//
// A hero auto-walks through a jungle. Wild animals charge in from the right.
// The kid KICKS (foot up) and JUMPS (hips rise), detected by MediaPipe,
// nearest animal into thin air. Run (lean left/right) to dodge.
//
// Pure Phaser 4 scene — no React. The React host (JungleBlastGame.tsx) creates
// the Phaser.Game and feeds it pose data via the game registry each frame.
//
// Art = primitives (Graphics shapes), so there are zero asset dependencies
// and zero licensing risk. Swap in a Kenney CC0 sprite sheet later by
// changing only preload() + the texture keys.

import Phaser from "phaser";

export interface JungleBlastPoseInput {
  kick: number;
  jump: number;
  run: number;
}

const GAME_W = 960;
const GAME_H = 540;
const GROUND_Y = 460;
const HERO_X = 220;
const HERO_SPEED = 260; // px/sec when running
const SCROLL_SPEED = 90; // base jungle scroll (hero auto-walks)
const ANIMAL_MIN_SPEED = 150;
const ANIMAL_MAX_SPEED = 260;
const SPAWN_MIN_MS = 900;
const SPAWN_MAX_MS = 1900;

// Palette — jungle greens + warm hero + danger reds.
const C = {
  sky: 0x1b2a1f,
  far: 0x243a2b,
  mid: 0x2f4d36,
  near: 0x3a6147,
  ground: 0x2a3d2f,
  hero: 0x4ade80,
  heroDark: 0x16a34a,
  animal: 0xb91c1c,
  animalDark: 0x7f1d1d,
  blast: 0xfde047,
  text: 0xf8fafc,
};

interface Animal {
  go: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  vx: number;
  alive: boolean;
}

interface Tree {
  go: Phaser.GameObjects.Graphics;
  speed: number; // parallax factor
}

export class JungleBlastScene extends Phaser.Scene {
  private hero!: Phaser.GameObjects.Container;
  private heroBody!: Phaser.GameObjects.Arc;
  private trees: Tree[] = [];
  private forestBg!: Phaser.GameObjects.Image;
  private animals: Animal[] = [];
  private ground!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private gameOverGroup: Phaser.GameObjects.GameObject[] = [];

  private score = 0;
  private lives = 3;
  private nextSpawnAt = 0;
  private elapsed = 0;
  private gameOver = false;
  private kickFlash = 0;
  private heroTargetX = HERO_X;
  private heroJumpY = 0; // current jump offset (0 = on ground)
  private heroJumping = false;

  constructor() {
    super("jungle-blast");
  }

  /**
   * Runs on every start AND restart (Phaser lifecycle). Reset ALL mutable
   * gameplay state here — NOT in the constructor (runs once) and NOT only in
   * a shutdown handler (fires after create, racing the restart).
   */
  init() {
    this.animals = [];
    this.trees = [];
    this.gameOverGroup = [];
    this.score = 0;
    this.lives = 3;
    this.nextSpawnAt = 0;
    this.elapsed = 0;
    this.gameOver = false;
    this.kickFlash = 0;
    this.heroTargetX = HERO_X;
    this.heroJumpY = 0;
    this.heroJumping = false;
  }

  preload() {
    // Reuse the forest photo already shipped on main (public/scene-bg.jpg)
    // as the deep parallax backdrop. Loaded by key 'forest'.
    this.load.image("forest", "/scene-bg.jpg");
  }

  create() {
    const { width, height } = this.scale;

    // --- Far parallax: real forest photo, scrolls slowest ---
    // Image is 2048x1152 (16:9); canvas is 960x540 (16:9) so it fills with no crop.
    // Scaled to canvas height; positioned centred; scrolls left at 0.1x and wraps.
    this.forestBg = this.add.image(width / 2, height / 2, "forest");
    const bgScale = height / 1152;
    this.forestBg.setScale(bgScale).setScrollFactor(0).setDepth(-1);
    // Tint slightly darker so the bright cartoon shapes read in front.
    this.forestBg.setAlpha(0.85);

    // --- Parallax jungle: three layers of stylized tree silhouettes ---
    this.trees = [
      ...this.makeTreeLayer(C.far, 0.25, 60, 120),
      ...this.makeTreeLayer(C.mid, 0.5, 90, 180),
      ...this.makeTreeLayer(C.near, 0.85, 120, 240),
    ];

    // --- Ground ---
    this.ground = this.add.rectangle(
      width / 2,
      GROUND_Y + 40,
      width,
      160,
      C.ground,
    );
    this.ground.setDepth(5);

    // --- Hero (green capsule-ish blob on legs) ---
    this.heroBody = this.add.circle(0, -20, 26, C.hero, 1);
    this.heroBody.setStrokeStyle(3, C.heroDark);
    const head = this.add.circle(0, -52, 16, C.hero, 1);
    head.setStrokeStyle(3, C.heroDark);
    const eye = this.add.circle(8, -54, 3, 0x0f172a);
    const armL = this.add.rectangle(-26, -18, 10, 30, C.heroDark);
    const armR = this.add.rectangle(26, -18, 10, 30, C.heroDark);
    const legL = this.add.rectangle(-12, 12, 12, 26, C.heroDark);
    const legR = this.add.rectangle(12, 12, 12, 26, C.heroDark);
    this.hero = this.add.container(HERO_X, GROUND_Y, [
      legL,
      legR,
      this.heroBody,
      armL,
      armR,
      head,
      eye,
    ]);
    this.hero.setDepth(10);

    // --- HUD ---
    this.scoreText = this.add
      .text(16, 14, "Score: 0", { fontSize: "22px", color: "#f8fafc" })
      .setDepth(20);
    this.livesText = this.add
      .text(16, 42, "Lives: ❤❤❤", { fontSize: "18px", color: "#f8fafc" })
      .setDepth(20);
    this.hintText = this.add
      .text(width / 2, height - 24, "KICK to blast!  JUMP to ground-pound!  ←/→ or lean to run", {
        fontSize: "14px",
        color: "#94a3b8",
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.events.once("shutdown", this.cleanup, this);
  }

  update(_time: number, deltaMs: number) {
    const delta = deltaMs / 1000;
    if (this.gameOver) return;

    this.elapsed += delta;

    // Read pose input from the React host (set via the game registry).
    const pose = this.game.registry.get("pose") as JungleBlastPoseInput | undefined;
    const run = pose?.run ?? 0;
    const kick = pose?.kick ?? 0;
    const jump = pose?.jump ?? 0;

    // --- Hero run (camera scrolls to fake forward motion + actual x shift) ---
    // Deadzone: ignore tiny run values (poses are noisy); ease toward target
    // instead of snapping so the hero glides rather than jitters back and forth.
    const RUN_DEADZONE = 0.25;
    const clampedRun = Math.abs(run) < RUN_DEADZONE ? 0 : run;
    const forward = SCROLL_SPEED + clampedRun * HERO_SPEED * 0.4;
    this.heroTargetX = Phaser.Math.Clamp(
      HERO_X + clampedRun * 60,
      HERO_X - 120,
      HERO_X + 140,
    );
    // Ease the hero toward its target (~5x slower than a snap = smooth glide).
    const ease = Math.min(1, delta * 8);
    this.hero.x += (this.heroTargetX - this.hero.x) * ease;
    // Bobbing walk animation (suppressed while airborne).
    if (!this.heroJumping) {
      this.hero.y = GROUND_Y + Math.sin(this.elapsed * 10) * 3;
      (this.hero.getAt(0) as Phaser.GameObjects.Rectangle).rotation = Math.sin(
        this.elapsed * 10,
      ) * 0.3;
      (this.hero.getAt(1) as Phaser.GameObjects.Rectangle).rotation = -Math.sin(
        this.elapsed * 10,
      ) * 0.3;
    }

    // --- Kick animation + blast (nearest animal) ---
    if (kick >= 1 && this.kickFlash <= 0) {
      this.doKick();
      this.kickFlash = 0.3;
    }
    if (this.kickFlash > 0) {
      this.kickFlash -= delta;
      // Kick the right leg forward while kicking.
      const legR = this.hero.getAt(1) as Phaser.GameObjects.Rectangle;
      legR.rotation = -1.4 * Math.max(0, this.kickFlash / 0.3);
    }

    // --- Jump (hero leaps; ground-pound blasts ALL nearby animals on landing) ---
    if (jump >= 1 && !this.heroJumping) {
      this.heroJumping = true;
      const startY = this.hero.y;
      this.tweens.add({
        targets: this,
        heroJumpY: { from: 0, to: -150 },
        duration: 220,
        yoyo: true,
        ease: "Quad.out",
        onUpdate: () => {
          this.hero.y = startY + this.heroJumpY;
        },
        onComplete: () => {
          this.heroJumpY = 0;
          this.heroJumping = false;
          this.doGroundPound();
        },
      });
    }

    // --- Parallax scroll ---
    // Far photo scrolls slowest (0.1x), wraps when it has scrolled one full width.
    this.forestBg.x -= forward * 0.1 * delta;
    const halfScaled = this.forestBg.displayWidth / 2;
    if (this.forestBg.x < GAME_W / 2 - halfScaled) {
      this.forestBg.x = GAME_W / 2;
    }
    for (const tree of this.trees) {
      tree.go.x -= forward * tree.speed * delta;
      if (tree.go.x < -120) tree.go.x += GAME_W + 240;
    }

    // --- Spawning animals ---
    if (this.elapsed >= this.nextSpawnAt) {
      this.spawnAnimal();
      const difficulty = Math.min(1, this.elapsed / 45);
      const gap = SPAWN_MAX_MS - (SPAWN_MAX_MS - SPAWN_MIN_MS) * difficulty;
      this.nextSpawnAt = this.elapsed + gap / 1000;
    }

    // --- Move animals; check if they reach the hero ---
    for (const a of this.animals) {
      if (!a.alive) continue;
      a.go.x += a.vx * delta;
      // Little hop animation.
      a.body.y = -16 + Math.abs(Math.sin(this.elapsed * 8 + a.go.x)) * 6;
      if (a.go.x < HERO_X - 40) {
        // Animal got past the hero — lose a life.
        a.alive = false;
        a.go.destroy();
        this.loseLife();
      }
    }
    // Cull blasted/off-screen animals.
    this.animals = this.animals.filter((a) => a.alive);
  }

  private doKick() {
    // Blast the nearest alive animal to the right of the hero.
    let target: Animal | null = null;
    let bestDist = Infinity;
    for (const a of this.animals) {
      if (!a.alive || a.go.x < HERO_X) continue;
      const d = a.go.x - HERO_X;
      if (d < bestDist) {
        bestDist = d;
        target = a;
      }
    }
    if (!target) {
      // Whiff — small dust puff at the hero's foot.
      this.spawnBurst(HERO_X + 40, GROUND_Y, 0x94a3b8, 6);
      return;
    }
    target.alive = false;
    this.spawnBurst(target.go.x, target.go.y - 16, C.blast, 16);
    // Fling the animal up and fade it ("into thin air").
    this.tweens.add({
      targets: target.go,
      y: target.go.y - 180,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 1.4,
      duration: 450,
      ease: "Quad.out",
      onComplete: () => target.go.destroy(),
    });
    this.score += 10;
    this.scoreText.setText(`Score: ${this.score}`);
  }

  /**
   * Ground-pound on jump landing: blast every alive animal within a radius of
   * the hero. Bigger reward than a kick (clears a crowd) but only reachable
   * via jump, which has its own cooldown in the pose hook.
   */
  private doGroundPound() {
    const POUND_RADIUS = 220;
    let hits = 0;
    // Shockwave ring.
    const ring = this.add.circle(HERO_X, GROUND_Y, 20, 0xfde047, 0.4);
    ring.setStrokeStyle(4, 0xfde047);
    ring.setDepth(12);
    this.tweens.add({
      targets: ring,
      scale: POUND_RADIUS / 20,
      alpha: 0,
      duration: 350,
      ease: "Quad.out",
      onComplete: () => ring.destroy(),
    });
    for (const a of this.animals) {
      if (!a.alive) continue;
      if (Math.abs(a.go.x - HERO_X) <= POUND_RADIUS) {
        a.alive = false;
        this.spawnBurst(a.go.x, a.go.y - 16, C.blast, 12);
        this.tweens.add({
          targets: a.go,
          y: a.go.y - 160,
          alpha: 0,
          scaleX: 1.4,
          scaleY: 1.4,
          duration: 400,
          ease: "Quad.out",
          onComplete: () => a.go.destroy(),
        });
        hits += 1;
      }
    }
    if (hits > 0) {
      this.score += hits * 15; // crowd-clear bonus
      this.scoreText.setText(`Score: ${this.score}`);
    }
  }

  private spawnAnimal() {
    const body = this.add.circle(0, -16, 20, C.animal, 1);
    body.setStrokeStyle(3, C.animalDark);
    const earL = this.add.triangle(-14, -26, 0, 8, -10, -8, 8, -2, C.animalDark);
    const earR = this.add.triangle(14, -26, 0, 8, 10, -8, -8, -2, C.animalDark);
    const eye = this.add.circle(8, -18, 3, 0xfde047);
    const container = this.add.container(GAME_W + 40, GROUND_Y, [
      earL,
      earR,
      body,
      eye,
    ]);
    container.setDepth(8);
    const speed =
      ANIMAL_MIN_SPEED +
      Math.random() * (ANIMAL_MAX_SPEED - ANIMAL_MIN_SPEED);
    this.animals.push({ go: container, body, vx: -speed, alive: true });
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
    this.livesText.setText("Lives: " + "❤".repeat(Math.max(0, this.lives)));
    // Red flash on the hero.
    this.heroBody.setFillStyle(0xef4444);
    this.time.delayedCall(150, () => this.heroBody.setFillStyle(C.hero));
    if (this.lives <= 0) this.endGame();
  }

  private endGame() {
    this.gameOver = true;
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const overlay = this.add.rectangle(cx, cy, GAME_W, GAME_H, 0x000000, 0.6);
    overlay.setDepth(30);
    this.gameOverGroup.push(overlay);
    const title = this.add
      .text(cx, cy - 30, "GAME OVER", {
        fontSize: "48px",
        color: "#fde047",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(31);
    const scoreLabel = this.add
      .text(cx, cy + 20, `Score: ${this.score}`, {
        fontSize: "24px",
        color: "#f8fafc",
      })
      .setOrigin(0.5)
      .setDepth(31);
    const restartLabel = this.add
      .text(cx, cy + 70, "Press SPACE / UP or tap to play again", {
        fontSize: "16px",
        color: "#94a3b8",
      })
      .setOrigin(0.5)
      .setDepth(31);
    this.gameOverGroup.push(title, scoreLabel, restartLabel);

    // Restart on space / click.
    this.input.keyboard?.once("keydown-SPACE", () => this.scene.restart());
    this.input.once("pointerdown", () => this.scene.restart());
  }

  private makeTreeLayer(
    color: number,
    speed: number,
    minH: number,
    maxH: number,
  ): Tree[] {
    const trees: Tree[] = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
      const h = Phaser.Math.Between(minH, maxH);
      const w = Phaser.Math.Between(40, 70);
      const x = (GAME_W / count) * i + Phaser.Math.Between(-30, 30);
      const g = this.add.graphics();
      g.fillStyle(color, 1);
      // Trunk
      g.fillRect(x - 4, GROUND_Y - h * 0.4, 8, h * 0.4);
      // Canopy (a few overlapping circles)
      for (let c = 0; c < 4; c++) {
        g.fillCircle(
          x + Phaser.Math.Between(-w / 2, w / 2),
          GROUND_Y - h + Phaser.Math.Between(-10, 10),
          Phaser.Math.Between(w / 3, w / 2),
        );
      }
      g.setDepth(speed < 0.4 ? 1 : speed < 0.7 ? 2 : 3);
      trees.push({ go: g, speed });
    }
    return trees;
  }

  private cleanup() {
    // Destroy game-over overlay objects so they don't persist after restart.
    for (const go of this.gameOverGroup) go.destroy();
    this.gameOverGroup = [];
  }
}

export const JUNGLE_BLAST_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_W,
  height: GAME_H,
  backgroundColor: "#1b2a1f",
  parent: "jungle-blast-container",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: JungleBlastScene,
};
