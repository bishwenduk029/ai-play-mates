// Boxing Brawl — a Phaser 4 POV boxing game.
//
// The kid throws real punches (detected by MediaPipe PoseLandmarker in
// useBoxingGloves). Each punch swoops a glove from the bottom of the screen
// onto the opponent (Kenney Zombie). The opponent punches back on a timer —
// a glove flies at the camera and lands unless the kid counters during the
// windup. First to land 20 punches wins.
//
// Pure 2D, procedural arena + glove art, WebAudio SFX (royalty-free).
// The React host (BoxingBrawlGame.tsx) feeds PunchState via game.registry.

import Phaser from "phaser";

export interface PunchInput {
  punch: number; // 1 = fresh trigger
  arm: "L" | "R" | "";
}

const GAME_W = 960;
const GAME_H = 540;
const FLOOR_Y = 470;
const OPP_X = GAME_W / 2;
const OPP_Y = 360;
const TARGET_PUNCHES = 20;

const OPP_PUNCH_MIN_MS = 2200;
const OPP_PUNCH_MAX_MS = 3800;
const OPP_WINDUP_MS = 550; // telegraph before the opponent's glove lands
const PLAYER_STUN_MS = 600; // can't punch right after being hit
const PLAYER_PUNCH_CD_MS = 300;

// Palette — smoky arena + red gloves.
const C = {
  bgTop: 0x05060a,
  bgLow: 0x141a2b,
  spotlight: 0xfff4d6,
  rope: 0xc0392b,
  ropePost: 0xd4a017,
  crowd: 0x0a0d14,
  floor: 0x1c2230,
  floorLine: 0x2a3142,
  glove: 0xc0392b,
  gloveDark: 0x7d2114,
  oppGlove: 0x2c2c2c,
  hud: 0xf8fafc,
  barYou: 0x22c55e,
  barOpp: 0xef4444,
  flash: 0xff3b3b,
};

type Phase = "fight" | "over";

interface OppState {
  bob: number; // idle bob phase
  winding: boolean;
  windupUntil: number;
  nextPunchAt: number;
  hurtUntil: number;
}

export class BoxingBrawlScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Graphics;
  private ropes!: Phaser.GameObjects.Graphics;
  private opp!: Phaser.GameObjects.Sprite;
  private yourBar!: Phaser.GameObjects.Rectangle;
  private oppBar!: Phaser.GameObjects.Rectangle;
  private yourText!: Phaser.GameObjects.Text;
  private oppText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private gameOverGroup: Phaser.GameObjects.GameObject[] = [];

  private youScore = 0;
  private oppScore = 0;
  private phase: Phase = "fight";
  private oppState: OppState = { bob: 0, winding: false, windupUntil: 0, nextPunchAt: 0, hurtUntil: 0 };
  private lastPlayerPunchAt = 0;
  private stunUntil = 0;
  private elapsed = 0;

  private audioCtx: AudioContext | null = null;

  constructor() {
    super("boxing-brawl");
  }

  init() {
    this.youScore = 0;
    this.oppScore = 0;
    this.phase = "fight";
    this.oppState = { bob: 0, winding: false, windupUntil: 0, nextPunchAt: 1500, hurtUntil: 0 };
    this.lastPlayerPunchAt = 0;
    this.stunUntil = 0;
    this.elapsed = 0;
    this.gameOverGroup = [];
  }

  preload() {
    this.load.image("zombie-idle", "/games/boxing-brawl/zombie/zombie_idle.png");
    this.load.image("zombie-action1", "/games/boxing-brawl/zombie/zombie_action1.png");
    this.load.image("zombie-action2", "/games/boxing-brawl/zombie/zombie_action2.png");
    this.load.image("zombie-hurt", "/games/boxing-brawl/zombie/zombie_hurt.png");
    this.load.image("zombie-cheer", "/games/boxing-brawl/zombie/zombie_cheer1.png");
    this.load.image("zombie-fall", "/games/boxing-brawl/zombie/zombie_fall.png");
  }

  create() {
    const { width, height } = this.scale;
    this.drawArena(width, height);

    // --- Opponent (Kenney Zombie) ---
    this.opp = this.add.sprite(OPP_X, OPP_Y, "zombie-idle");
    this.opp.setOrigin(0.5, 1).setDepth(10).setScale(2.4);

    // --- HUD: two punch-count bars (You vs Opponent), first to 20 ---
    const barW = 280;
    const barH = 22;
    const yourBarBg = this.add.rectangle(40 + barW / 2, 26, barW, barH, 0x000000, 0.5).setDepth(30);
    yourBarBg.setStrokeStyle(2, C.barYou);
    this.yourBar = this.add.rectangle(40, 26, 6, barH - 6, C.barYou).setOrigin(0, 0.5).setDepth(31);
    this.yourText = this.add
      .text(40, 48, "YOU  0", { fontSize: "14px", color: "#bbf7d0" })
      .setDepth(31);

    const oppBarBg = this.add
      .rectangle(width - 40 - barW / 2, 26, barW, barH, 0x000000, 0.5)
      .setDepth(30);
    oppBarBg.setStrokeStyle(2, C.barOpp);
    this.oppBar = this.add
      .rectangle(width - 40, 26, 6, barH - 6, C.barOpp)
      .setOrigin(1, 0.5)
      .setDepth(31);
    this.oppText = this.add
      .text(width - 40, 48, "0  ZOMBIE", { fontSize: "14px", color: "#fecaca" })
      .setOrigin(1, 0)
      .setDepth(31);

    this.hint = this.add
      .text(width / 2, height - 20, "THROW PUNCHES!  Counter the zombie's windup to interrupt.", {
        fontSize: "13px",
        color: "#94a3b8",
      })
      .setOrigin(0.5)
      .setDepth(30);

    this.updateBars();
    this.events.once("shutdown", this.cleanup, this);
  }

  update(_time: number, deltaMs: number) {
    const delta = deltaMs / 1000;
    if (this.phase !== "fight") return;
    this.elapsed += delta;
    const now = this.time.now;

    // --- Opponent idle bob ---
    this.oppState.bob += delta * 2.5;
    const bobY = Math.sin(this.oppState.bob) * 6;
    this.opp.y = OPP_Y + bobY;

    // --- Opponent state machine ---
    if (this.oppState.hurtUntil > now) {
      // recovering from a hit
    } else if (this.oppState.winding) {
      if (now >= this.oppState.windupUntil) {
        // Windup complete → opponent glove lands on the player.
        this.oppState.winding = false;
        this.opponentPunchLands();
      } else {
        this.opp.setTexture("zombie-action1");
      }
    } else {
      this.opp.setTexture("zombie-idle");
      if (now >= this.oppState.nextPunchAt) {
        // Start a windup (telegraph).
        this.oppState.winding = true;
        this.oppState.windupUntil = now + OPP_WINDUP_MS;
        this.opp.setTexture("zombie-action2");
        this.playWhoosh();
      }
    }

    // --- Player punch ---
    const input = this.game.registry.get("punch") as PunchInput | undefined;
    const canPunch = now > this.stunUntil && now - this.lastPlayerPunchAt > PLAYER_PUNCH_CD_MS;
    if ((input?.punch ?? 0) >= 1 && canPunch) {
      this.lastPlayerPunchAt = now;
      this.playerPunch(input?.arm === "L" ? "L" : "R");
    }
  }

  // --- Player punch: glove swoops onto the zombie ---
  private playerPunch(side: "L" | "R") {
    const fromX = side === "L" ? GAME_W * 0.2 : GAME_W * 0.8;
    const fromY = GAME_H + 80;
    const glove = this.add.image(fromX, fromY, "player-glove");
    glove.setDepth(40).setScale(0.5).setAngle(side === "L" ? -15 : 15);
    const targetX = OPP_X + (side === "L" ? -20 : 20);
    const targetY = OPP_Y - 120;

    // Cancel an opponent windup if we land during it (counter).
    const wasWinding = this.oppState.winding;
    this.tweens.add({
      targets: glove,
      x: targetX,
      y: targetY,
      scale: 1.1,
      duration: 130,
      ease: "Quad.out",
      onComplete: () => {
        this.playHit();
        this.spawnImpact(targetX, targetY, C.glove);
        // Zombie reacts: hurt + knockback.
        this.oppState.hurtUntil = this.time.now + 220;
        this.oppState.winding = false;
        this.opp.setTexture("zombie-hurt");
        this.opp.x = OPP_X + (side === "L" ? 14 : -14);
        this.tweens.add({
          targets: this.opp,
          x: OPP_X,
          duration: 200,
          ease: "Quad.out",
        });
        // Retract glove.
        this.tweens.add({
          targets: glove,
          y: GAME_H + 80,
          scale: 0.4,
          alpha: 0,
          duration: 160,
          ease: "Quad.in",
          onComplete: () => glove.destroy(),
        });
        this.youScore += 1;
        this.updateBars();
        if (wasWinding) this.playCounter();
        if (this.youScore >= TARGET_PUNCHES) this.endFight(true);
      },
    });
  }

  // --- Opponent's windup completes: glove flies at the camera ---
  private opponentPunchLands() {
    const glove = this.add.image(OPP_X, OPP_Y - 110, "opp-glove");
    glove.setDepth(45).setScale(0.6);
    this.tweens.add({
      targets: glove,
      y: GAME_H / 2,
      scale: 3.2,
      duration: 260,
      ease: "Quad.in",
      onComplete: () => {
        this.playHit();
        // Screen flash + stun the player.
        this.cameras.main.shake(160, 0.008);
        this.cameras.main.flash(120, 255, 60, 60);
        this.stunUntil = this.time.now + PLAYER_STUN_MS;
        glove.destroy();
        this.oppScore += 1;
        this.updateBars();
        // Schedule the next opponent punch (faster as the fight goes on).
        const diff = Math.min(1, this.elapsed / 60);
        const gap = OPP_PUNCH_MAX_MS - (OPP_PUNCH_MAX_MS - OPP_PUNCH_MIN_MS) * diff;
        this.oppState.nextPunchAt = this.time.now + gap;
        if (this.oppScore >= TARGET_PUNCHES) this.endFight(false);
      },
    });
  }

  private updateBars() {
    const barW = 280;
    this.yourBar.width = Math.max(6, (this.youScore / TARGET_PUNCHES) * (barW - 6));
    this.oppBar.width = Math.max(6, (this.oppScore / TARGET_PUNCHES) * (barW - 6));
    // Opp bar grows leftward (origin 1), so we reposition.
    this.oppBar.x = GAME_W - 40;
    this.oppBar.width = Math.max(6, (this.oppScore / TARGET_PUNCHES) * (barW - 6));
    this.yourText.setText(`YOU  ${this.youScore}`);
    this.oppText.setText(`${this.oppScore}  ZOMBIE`);
  }

  private endFight(won: boolean) {
    this.phase = "over";
    this.oppState.winding = false;
    this.opp.setTexture(won ? "zombie-fall" : "zombie-cheer");
    this.opp.x = OPP_X;
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const overlay = this.add.rectangle(cx, cy, GAME_W, GAME_H, 0x000000, 0.65).setDepth(60);
    const title = this.add
      .text(cx, cy - 40, won ? "KNOCKOUT! 🥊" : "YOU LOSE", {
        fontSize: "48px",
        color: won ? "#fde047" : "#f87171",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(61);
    const sub = this.add
      .text(cx, cy + 16, `You ${this.youScore}  —  ${this.oppScore} Zombie`, {
        fontSize: "22px",
        color: "#f8fafc",
      })
      .setOrigin(0.5)
      .setDepth(61);
    const restart = this.add
      .text(cx, cy + 66, "Press SPACE / tap to fight again", { fontSize: "16px", color: "#94a3b8" })
      .setOrigin(0.5)
      .setDepth(61);
    this.gameOverGroup.push(overlay, title, sub, restart);
    this.input.keyboard?.once("keydown-SPACE", () => this.scene.restart());
    this.input.once("pointerdown", () => this.scene.restart());
  }

  // --- Drawing ---

  private drawArena(w: number, h: number) {
    this.bg = this.add.graphics();
    // Sky/back wall gradient (dark arena).
    const bands = 20;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      this.bg.fillStyle(this.lerpColor(C.bgTop, C.bgLow, t), 1);
      this.bg.fillRect(0, (h / bands) * i, w, h / bands + 1);
    }
    // Spotlight cone on the opponent.
    this.bg.fillStyle(C.spotlight, 0.08);
    this.bg.beginPath();
    this.bg.moveTo(w / 2, -40);
    this.bg.lineTo(w / 2 - 220, h);
    this.bg.lineTo(w / 2 + 220, h);
    this.bg.closePath();
    this.bg.fillPath();
    this.bg.fillStyle(C.spotlight, 0.05);
    this.bg.fillCircle(w / 2, OPP_Y - 60, 200);

    // Crowd silhouette (a row of bumps along the back).
    this.bg.fillStyle(C.crowd, 1);
    this.bg.fillRect(0, FLOOR_Y - 90, w, 90);
    for (let x = 0; x < w; x += 26) {
      this.bg.fillCircle(x + 13, FLOOR_Y - 90, 16);
    }

    // Ring floor.
    this.bg.fillStyle(C.floor, 1);
    this.bg.fillRect(0, FLOOR_Y, w, h - FLOOR_Y);
    this.bg.lineStyle(2, C.floorLine, 1);
    for (let y = FLOOR_Y + 20; y < h; y += 24) {
      this.bg.beginPath();
      this.bg.moveTo(0, y);
      this.bg.lineTo(w, y);
      this.bg.strokePath();
    }

    // Ring ropes (3 horizontal red ropes, posts at the corners).
    this.ropes = this.add.graphics();
    this.ropes.setDepth(20);
    const postL = 40;
    const postR = w - 40;
    for (let i = 0; i < 3; i++) {
      const ry = 70 + i * 26;
      this.ropes.lineStyle(5, C.rope, 1);
      this.ropes.beginPath();
      this.ropes.moveTo(postL, ry);
      this.ropes.lineTo(postR, ry);
      this.ropes.strokePath();
    }
    // Posts.
    this.ropes.fillStyle(C.ropePost, 1);
    this.ropes.fillRect(postL - 6, 60, 12, 90);
    this.ropes.fillRect(postR - 6, 60, 12, 90);

    // --- Procedural glove textures ---
    if (!this.textures.exists("player-glove")) {
      const g = this.make.graphics({ x: 0, y: 0 });
      // Red boxing glove, fist shape.
      g.fillStyle(C.gloveDark, 1);
      g.fillCircle(26, 30, 22); // main body
      g.fillStyle(C.glove, 1);
      g.fillCircle(26, 28, 20);
      // Thumb knot.
      g.fillStyle(C.gloveDark, 1);
      g.fillCircle(44, 34, 8);
      g.fillStyle(C.glove, 1);
      g.fillCircle(44, 33, 7);
      // Cuff.
      g.fillStyle(C.gloveDark, 1);
      g.fillRect(12, 44, 28, 12);
      g.generateTexture("player-glove", 60, 60);
    }
    if (!this.textures.exists("opp-glove")) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x111111, 1);
      g.fillCircle(26, 30, 22);
      g.fillStyle(C.oppGlove, 1);
      g.fillCircle(26, 28, 20);
      g.fillStyle(0x111111, 1);
      g.fillCircle(44, 34, 8);
      g.fillStyle(C.oppGlove, 1);
      g.fillCircle(44, 33, 7);
      g.fillStyle(0x111111, 1);
      g.fillRect(12, 44, 28, 12);
      g.generateTexture("opp-glove", 60, 60);
    }
  }

  private spawnImpact(x: number, y: number, color: number) {
    for (let i = 0; i < 10; i++) {
      const p = this.add.circle(x, y, Phaser.Math.Between(3, 6), color);
      p.setDepth(46);
      const a = Math.random() * Math.PI * 2;
      const d = Phaser.Math.Between(20, 60);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        alpha: 0,
        scale: 0.2,
        duration: 320,
        ease: "Quad.out",
        onComplete: () => p.destroy(),
      });
    }
    // Impact ring.
    const ring = this.add.circle(x, y, 12, 0xffffff, 0.5);
    ring.setStrokeStyle(3, color).setDepth(46);
    this.tweens.add({
      targets: ring,
      scale: 4,
      alpha: 0,
      duration: 280,
      ease: "Quad.out",
      onComplete: () => ring.destroy(),
    });
  }

  private lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    return (
      (Math.round(ar + (br - ar) * t) << 16) |
      (Math.round(ag + (bg - ag) * t) << 8) |
      Math.round(ab + (bb - ab) * t)
    );
  }

  // --- WebAudio SFX (no asset files → royalty-free) ---
  private ensureAudio(): AudioContext | null {
    if (this.audioCtx) {
      if (this.audioCtx.state === "suspended") void this.audioCtx.resume();
      return this.audioCtx;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    this.audioCtx = new Ctx();
    return this.audioCtx;
  }

  private playHit() {
    const ctx = this.ensureAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const dur = 0.18;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(1200, t);
    f.frequency.exponentialRampToValueAtTime(200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur);
  }

  private playWhoosh() {
    const ctx = this.ensureAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    const dur = 0.3;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur);
  }

  private playCounter() {
    const ctx = this.ensureAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(660, t);
    o.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.18);
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

export const BOXING_BRAWL_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_W,
  height: GAME_H,
  backgroundColor: "#05060a",
  parent: "boxing-brawl-container",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: BoxingBrawlScene,
};
