/*eslint global-require:off*/
/* eslint @typescript-eslint/no-use-before-define: ["error",{functions:false}]*/
// eslint-disable-next-line import/order
const local_storage = require('glov/client/local_storage');
local_storage.setStoragePrefix('LD56'); // Before requiring anything else that might load from this

import assert from 'assert';
import { AnimationSequencer, animationSequencerCreate } from 'glov/client/animation';
import { autoAtlas } from 'glov/client/autoatlas';
import * as camera2d from 'glov/client/camera2d';
import { editBoxAnyActive } from 'glov/client/edit_box';
import * as engine from 'glov/client/engine';
import {
  getFrameIndex,
  getFrameTimestamp,
  isInBackground,
  onEnterBackground,
} from 'glov/client/engine';
import {
  ALIGN,
  Font,
  FontDrawOpts,
  fontStyle,
  fontStyleColored,
  vec4ColorFromIntColor,
} from 'glov/client/font';
import {
  KEYS,
  PAD,
  eatAllInput,
  keyDown,
  keyUpEdge,
  mouseDownAnywhere,
  padButtonDown,
} from 'glov/client/input';
import { localStorageGetJSON, localStorageSetJSON } from 'glov/client/local_storage';
import { markdownAuto } from 'glov/client/markdown';
import { markdownSetColorStyle } from 'glov/client/markdown_renderables';
import { netInit } from 'glov/client/net';
import {
  ScoreSystem,
  scoreAlloc,
} from 'glov/client/score';
import { scoresDraw } from 'glov/client/score_ui';
import * as settings from 'glov/client/settings';
import { shaderCreate } from 'glov/client/shaders';
import {
  GlovSoundSetUp,
  soundLoad,
  soundPlay,
  soundResumed,
} from 'glov/client/sound';
import {
  SPOT_DEFAULT_LABEL,
  spot,
} from 'glov/client/spot';
import { spriteSetGet } from 'glov/client/sprite_sets';
import {
  Shader,
  Sprite,
  Texture,
  spriteCreate,
  spriteQueueRaw4,
} from 'glov/client/sprites';
import * as transition from 'glov/client/transition';
import {
  button,
  buttonImage,
  buttonSetDefaultYOffs,
  buttonText,
  buttonWasFocused,
  drawBox,
  drawHBox,
  drawRect,
  drawVBox,
  modalDialog,
  panel,
  playUISound,
  scaleSizes,
  setButtonHeight,
  setFontHeight,
  setFontStyles,
  uiButtonHeight,
  uiGetFont,
  uiSetPanelColor,
  uiTextHeight,
} from 'glov/client/ui';
import {
  randCreate,
  shuffleArray,
} from 'glov/common/rand_alea';
import { DataObject, TSMap } from 'glov/common/types';
import { clamp, clone, easeOut, lerp, map01, plural } from 'glov/common/util';
import {
  unit_vec,
  v4copy,
  vec4,
} from 'glov/common/vmath';

const { abs, ceil, floor, max, min, round, PI } = Math;

const palette_font = [
  0x081820ff,
  0x346856ff,
  0x88c070ff,
  0xe0f8d0ff,
];
const palette = palette_font.map((c) => {
  return vec4ColorFromIntColor(vec4(), c);
});
const PALETTE_BG = 1;
const PALETTE_TEXT= 0;

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;

const CHH = 8;
const LINEH = CHH + 1;
const CHW = 8;
// Virtual viewport for our game logic
const game_width = 384; // 1920x1080 / 5
const game_height = 216;

const BUTTON_H = 15;

const INFO_PANEL_W = 118;
const INFO_PANEL_H = 51;

const CAMPAIGN_PLANETS = 2;

// Mining minigame balance
const MIN_PROGRESS = 0.01; // if speed=0, still advance by this much
const PROGRESS_SPEED = 0.0001;
const ACCEL_MAX = 0.0005;
const ACCEL_MIN = -1.5; // relative to ACCEL_MAX
const ACCEL_SPEED = 0.01;
const DECEL_SPEED = 0.01;
const DAMAGE_RATE = 0.002 * 0.75; // JK TEST
const AMBIENT_DAMAGE_RATE = 0.000015;

const DANGER_MIN = 0;
const DANGER_MAX = 0.7;
const DESIRED_DANGER = DANGER_MIN + (DANGER_MAX - DANGER_MIN)/2;
const DANGER_TIME_SCALE_TIME = 0.0015;
// const PERFECT_TIME = 1 / (PROGRESS_SPEED * (1 - DESIRED_DANGER)); = 15.384
// const GOOD_TIME = 1 / (PROGRESS_SPEED * 0.8 *(1 - DESIRED_DANGER));
// 90% = 17094
// 80% = 19230
const BONUS_TIME1 = 18100; // anything reading 18.0s
const BONUS_TIME2 = 21100;

let rand = randCreate(Date.now());
let rand_levelgen = randCreate(1234); // just for values

let font: Font;

const KNOBS = [
  'Depth',
  'Weather',
  'Allotropy',
  'Resonance',
  'Frequency',
  'Striation',
];
const NUM_KNOBS = KNOBS.length;

const CONFIGURE_PANEL_W = 138;
const CONFIGURE_PANEL_H = 71 - 5 * CHH + NUM_KNOBS * CHH + 4;

const SURVEY_BONUS = 800;
const PLANET_GOAL = 4500;

type ExoticDef = {
  name: string;
  knobs: number[];
  value: number;
  total_value: number;
  total_found: number;
  knowledge: number;
  knob_order: number[];
  exotic_style: number;
  seed: number;
  survey_done: boolean;
  danger_schedule: [number, number][];
};
type RecentRecord = {
  exotic: number;
  knobs: number[];
  value: number;
  bonus: number;
};

type Score = {
  probes: number;
  progress: number;
};
let score_system: ScoreSystem<Score>;

function randomExoticName(): string {
  let num_numbers = 1 + rand.range(2);
  let str = [];
  for (let ii = 0; ii < 3 - num_numbers; ++ii) {
    str.push(String.fromCharCode('A'.charCodeAt(0) + rand.range(26)));
  }
  for (let ii = 0; ii < num_numbers; ++ii) {
    str.push(String.fromCharCode('0'.charCodeAt(0) + rand.range(10)));
  }
  str.push(String.fromCharCode('A'.charCodeAt(0) + rand.range(26)));
  str.splice(2 + rand.range(2), 0, '-');
  return str.join('');
}

function knobKnown(exotic: ExoticDef, idx: number): boolean {
  return (exotic.knob_order.indexOf(idx)+0.5) < exotic.knowledge;
}

function matchInfo(exotic: ExoticDef, probe_config: number[], for_value: boolean): {
  exact: number;
  total: number;
  min: number;
  max: number;
} {
  let known: Partial<Record<number, boolean>> = {};
  for (let ii = 0; ii < exotic.knowledge; ++ii) {
    known[exotic.knob_order[ii]] = true;
  }
  let sum_min = 0;
  let sum_max = 0;
  let sum_exact = 0;
  let total = 0;
  for (let ii = 0; ii < NUM_KNOBS; ++ii) {
    let probe = probe_config[ii];
    let desired = exotic.knobs[ii];
    let diff = abs(probe - desired);
    if (diff > 0) {
      ++diff; // 0/2/3
    }
    let match = 3 - diff; // 0/1/3
    let weight = (ii < 2) === !for_value ? 8 : 1;
    total += weight * 3;
    sum_exact += match * weight;
    if (known[ii]) {
      sum_min += match * weight;
      sum_max += match * weight;
    } else {
      sum_max += 3 * weight;
    }
  }
  return {
    exact: sum_exact,
    total,
    min: sum_min/total,
    max: sum_max/total,
  };
}

let tut_state = 0;

const serialized_fields: (keyof GameState)[] = [
  'level_idx',
  'endless_enabled',
  'game_score',
  'level_score',
  'probes_launched',
  'probe_config',
  'exotics',
  'recent_exotics',
];
class GameState {

  level_idx = 1;
  game_score = 0;
  endless_enabled = false;
  constructor() {
    this.initLevel(this.level_idx);
    if (engine.DEBUG && false) {
      for (let ii = 0; ii < 18; ++ii) {
        this.findExoticDebug();
      }
    }
  }


  saveGame(): void {
    localStorageSetJSON('savedgame', this.toJSON());
  }

  toJSON(): DataObject {
    let ret: DataObject = {};
    for (let ii = 0; ii < serialized_fields.length; ++ii) {
      let field = serialized_fields[ii];
      ret[field] = this[field];
    }
    return ret;
  }
  fromJSON(obj: DataObject): void {
    for (let ii = 0; ii < serialized_fields.length; ++ii) {
      let field = serialized_fields[ii];
      (this as unknown as DataObject)[field] = obj[field];
    }
  }

  addScoreFinalize(): void {
    let progress = this.level_idx - 1;
    progress += min(1, this.level_score / PLANET_GOAL);
    let score: Score = {
      probes: this.probes_launched,
      progress,
    };
    score_system.setScore(1, score);
    if (this.level_idx <= CAMPAIGN_PLANETS) {
      score_system.setScore(0, score);
    }
  }

  addScore(score: number): void {
    this.level_score += score;
    this.game_score += score;
    this.addScoreFinalize();
  }

  findExoticDebug(): void {
    this.pickExotic();
    this.findExotic(1);
    let recent = this.recent_exotics[0];
    let exotic = this.exotics[recent.exotic];
    if (exotic.knowledge < NUM_KNOBS) {
      exotic.knowledge++;
    }
    this.addScore(recent.value * recent.bonus);
    this.probes_launched++;
  }


  level_score!: number;
  probes_launched: number = 0;
  probe_config!: number[];
  exotics!: ExoticDef[];
  recent_exotics!: RecentRecord[];
  initLevel(seed: number): void {
    rand_levelgen.reseed(seed);
    this.level_score = 0;
    this.probe_config = [];

    for (let ii = 0; ii < NUM_KNOBS; ++ii) {
      this.probe_config.push(1);
    }

    let num_exotics = 4;
    let exotics: ExoticDef[] = [];
    let styles = [];
    for (let ii = 0; ii < 5; ++ii) {
      styles.push(ii);
    }
    for (let ii = 0; ii < num_exotics; ++ii) {
      let style_idx = rand.range(styles.length);
      let exotic: ExoticDef = {
        name: randomExoticName(),
        knobs: [],
        value: 5 + rand_levelgen.range(94),
        total_value: 0,
        total_found: 0,
        knowledge: 0,
        knob_order: [],
        exotic_style: styles[style_idx],
        seed: rand_levelgen.range(100000000),
        danger_schedule: genDangerSchedule(rand_levelgen),
        survey_done: false,
      };
      styles.splice(style_idx, 1);
      for (let jj = 0; jj < NUM_KNOBS; ++jj) {
        exotic.knobs.push(rand.range(3));
        exotic.knob_order.push(jj);
      }
      shuffleArray(rand, exotic.knob_order);
      exotics.push(exotic);
    }
    this.exotics = exotics;

    this.recent_exotics = [];
  }

  picked_exotic!: number;
  pickExotic(): void {
    let { exotics, probe_config } = this;
    let options = [];
    let total_w = 0;
    for (let ii = 0; ii < exotics.length; ++ii) {
      let exotic = exotics[ii];
      let match_info = matchInfo(exotic, probe_config, false);
      let w = match_info.exact;
      w *= w;
      total_w += w;
      options.push([w, ii]);
    }
    let choice;
    if (!total_w) {
      choice = rand.range(NUM_KNOBS);
    } else {
      let r = rand.range(total_w);
      choice = 0;
      while (r >= options[choice][0]) {
        r -= options[choice][0];
        choice++;
      }
      choice = options[choice][1];
    }
    this.picked_exotic = choice;
  }

  findExotic(bonus: number): void {
    let { exotics, probe_config, picked_exotic: choice } = this;
    let exotic = exotics[choice];
    let match_info_value = matchInfo(exotic, probe_config, true);
    let match_perc = match_info_value.exact / match_info_value.total;
    let base_value = exotic.value;
    // match   value range
    //   0       [0.1, 0.5], 0% crit
    //   0.5         0% crit
    //   1       [1,2], 10% crit => +0.5..1
    let a = lerp(match_perc, 0.1, 1);
    let b = lerp(match_perc, 0.5, 2);
    let c = max(0, lerp(match_perc, -0.1, 0.1));
    rand_levelgen.reseed(exotic.seed);
    let v = rand_levelgen.random() * rand_levelgen.random() * (b - a) + a;
    while (rand_levelgen.random() < c) {
      v += rand_levelgen.floatBetween(0.5, 1);
    }
    exotic.seed = rand_levelgen.range(100000000);

    // Rearrange if there's an undiscovered in the way
    while (choice > 0 && !exotics[choice-1].knowledge) {
      let t = exotics[choice];
      exotics[choice] = exotics[choice - 1];
      exotics[choice - 1] = t;
      --choice;
    }

    let recent: RecentRecord = {
      exotic: choice,
      knobs: probe_config.slice(0),
      value: ceil(base_value * v),
      bonus: bonus,
    };

    exotic.total_value += recent.value;
    exotic.total_found++;

    this.recent_exotics.splice(0, 0, recent);
  }

  planetDone(): boolean {
    return this.level_score >= PLANET_GOAL;
  }
}

let sprite_toggles: Sprite;
let sprite_title_gradient: Sprite;
let sprite_title_planet: Sprite;
let game_state: GameState;
let sprite_dither: Sprite;
let shader_dither: Shader;
let shader_gas_giant: Shader;
let shader_dither_transition: Shader;
const dither_uvs = vec4(0, 0, game_width / 4, game_height / 4);
function init(): void {
  sprite_toggles = spriteCreate({
    name: 'toggles',
    ws: [9, 9, 9],
    hs: [9, 9, 9, 9, 9],
  });
  sprite_dither = spriteCreate({
    name: 'dither',
    wrap_s: gl.REPEAT,
    wrap_t: gl.REPEAT,
  });
  sprite_title_planet = spriteCreate({
    name: 'title_planet',
    wrap_s: gl.CLAMP_TO_EDGE,
    wrap_t: gl.CLAMP_TO_EDGE,
  });
  sprite_title_gradient = spriteCreate({
    name: 'title_gradient',
    wrap_s: gl.REPEAT,
    wrap_t: gl.CLAMP_TO_EDGE,
  });
  shader_dither = shaderCreate('shaders/dither.fp');
  shader_dither_transition = shaderCreate('shaders/dither_transition.fp');
  shader_gas_giant = shaderCreate('shaders/test.fp');

  const ENCODE_PROBES = 100000;
  score_system = scoreAlloc({
    score_to_value: (score: Score): number => {
      let integer_progress = floor(score.progress * 100);
      return ENCODE_PROBES - 1 - score.probes +
        integer_progress * ENCODE_PROBES;
    },
    value_to_score: (value: number): Score => {
      let p = value % ENCODE_PROBES;
      value -= p;
      let integer_progress = floor(value / ENCODE_PROBES);
      return {
        probes: ENCODE_PROBES - 1 - p,
        progress: integer_progress / 100,
      };
    },
    level_defs: 2,
    score_key: 'LD56c',
    ls_key: 'ld56c',
    asc: false,
    rel: 8,
    num_names: 3,
    histogram: false,
  });

  let savedgame = localStorageGetJSON<DataObject>('savedgame');
  if (savedgame) {
    game_state = new GameState();
    game_state.fromJSON(savedgame);
  }
}

function startNewGame(): void {
  game_state = new GameState();
  engine.setState(stateDroneConfig);
}

function fadeDither(
  fade_time: number,
  z: number,
  initial: Texture,
  ms_since_start: number,
  force_end: boolean
): string {
  let progress = min(ms_since_start / fade_time, 1);
  let alpha = 1 - progress; //  (1 - easeOut(progress, 2));
  let color = vec4(1, 1, 1, 1);
  camera2d.setNormalized();
  spriteQueueRaw4([initial, sprite_dither.texs[0]],
    0, 0, 0, 1,
    1, 1, 1, 0,
    z,
    0, 1, 1, 0,
    color, shader_dither_transition, {
      uv_scale: dither_uvs,
      dither_param: [alpha],
    });

  if (force_end || progress === 1) {
    return transition.REMOVE;
  }
  return transition.CONTINUE;
}

const TRANSITION_TIME = engine.defines.VIDEOREC ? 1000 : 250;
function queueTransition(): void {
  if (getFrameIndex() > 1) {
    transition.queue(Z.TRANSITION_FINAL, fadeDither.bind(null, TRANSITION_TIME));
  }
}

function perc(v: number): string {
  return (v * 100).toFixed(0);
}

let style_text = fontStyleColored(null, palette_font[PALETTE_TEXT]);
const outline_width = 5.25;
let style_dwarfs = fontStyle(null, {
  color: palette_font[PALETTE_TEXT],
  outline_color: palette_font[2],
  outline_width,
});

let style_exotic = [
  fontStyle(style_text, {
    color: palette_font[1],
    outline_color: palette_font[2],
    outline_width,
  }),
  fontStyle(style_text, {
    color: palette_font[3],
    outline_color: palette_font[1],
    outline_width,
  }),
  fontStyle(style_text, {
    color: palette_font[2],
    outline_color: palette_font[0],
    outline_width,
  }),
  fontStyle(style_text, {
    color: palette_font[0],
    outline_color: palette_font[2],
    outline_width,
  }),
  fontStyle(style_text, {
    color: palette_font[1],
    outline_color: palette_font[0],
    outline_width,
  }),
];

const KNOB_W = 9;

let any_claimable = false;
function drawExoticInfoPanel(param: {
  x: number;
  y: number;
  z: number;
  exotic: ExoticDef;
  style: string;
  show_match: boolean;
  allow_undiscovered: boolean;
}): number {
  let { x, y, z, exotic, style, show_match, allow_undiscovered } = param;
  let w = INFO_PANEL_W;
  panel({
    x, y, z,
    w,
    h: INFO_PANEL_H,
    sprite: autoAtlas('game', style),
    eat_clicks: false,
  });
  z++;

  if (!exotic.knowledge && allow_undiscovered) {
    font.draw({
      color: palette_font[1],
      x, y, z, w,
      h: INFO_PANEL_H,
      align: ALIGN.HVCENTER|ALIGN.HWRAP,
      text: 'Undiscovered\nExotic',
    });
  } else {
    let xx = x + 7;
    w -= 7 * 2;
    let yy = y + 6;
    autoAtlas('game', `exotic${exotic.exotic_style+1}`).draw({
      x: xx,
      y: yy,
      z,
      w: 7, h: 7,
    });
    font.draw({
      style: style_exotic[exotic.exotic_style],
      x: xx,
      y: yy,
      z,
      text: ` ${exotic.name}`,
    });
    let can_claim = exotic.knowledge === NUM_KNOBS && !exotic.survey_done;
    if (show_match && !can_claim) {
      spot({
        x: xx + CHW * 7,
        y: yy,
        w,
        h: CHH,
        def: SPOT_DEFAULT_LABEL,
        // eslint-disable-next-line max-len
        tooltip: 'This % indicates how well your current [c=dwarfs]DWARFS[/c] match the specified Exotic, based on what you currently know about it.\n\nHigher matches will also yield more valuable resources.',
      });
      let match_info = matchInfo(exotic, game_state.probe_config, false);
      font.draw({
        style: style_text,
        x: xx,
        y: yy,
        z,
        w,
        align: ALIGN.HRIGHT,
        text: match_info.min === match_info.max ? match_info.max === 1 ? '  %' : `${perc(match_info.max)}%` :
          match_info.max === 1 ? `${perc(match_info.min)}-  %` :
          `${perc(match_info.min)}-${perc(match_info.max)}%`,
      });
      if (match_info.max === 1) {
        autoAtlas('game', '100').draw({
          x: xx + w - CHW * 3,
          y: yy,
          z,
          w: 15,
          h: 7,
          color: palette[0],
        });
      }
    }
    yy += LINEH + 1;
    yy--;
    const BAR_FULL_W = INFO_PANEL_W - 7*2;
    let blink = shouldBlinkBar(exotic) && getFrameTimestamp() % 200 < 100;
    drawBox({
      x: x + 7,
      y: yy,
      z,
      w: BAR_FULL_W,
      h: 3,
    }, autoAtlas('game', 'progress_bar'), 1);
    z++;
    if (exotic.knowledge) {
      let bar_w = BAR_FULL_W;
      if (exotic.knowledge < NUM_KNOBS) {
        bar_w = floor(exotic.knowledge / NUM_KNOBS * bar_w);
      }
      drawBox({
        x: x + 7,
        y: yy,
        z,
        w: bar_w,
        h: 3,
      }, autoAtlas('game', blink ? 'progress_fill_blink' :
        exotic.knowledge === NUM_KNOBS ? 'progress_fill_full' : 'progress_fill'), 1);
    }
    z++;
    let tooltip = `[c=1]${exotic.knowledge}[/c] of [c=1]${NUM_KNOBS}[/c] affinities known about this Exotic.
${exotic.survey_done ? 'SURVEY BONUS already claimed.' :
  `[c=1]$${SURVEY_BONUS}[/c] SURVEY BONUS for complete knowledge.`}`;
    spot({
      x: x + 7,
      y: yy,
      w: BAR_FULL_W,
      h: 3 + (can_claim ? LINEH : 0),
      def: SPOT_DEFAULT_LABEL,
      tooltip,
    });
    yy += 5;

    if (can_claim) {
      any_claimable = true;
      font.draw({
        color: palette_font[0],
        x: xx,
        y: yy, z,
        w,
        align: ALIGN.HCENTER,
        text: '100% KNOWN!',
      });
      yy += LINEH;
      if (buttonText({
        x: xx, y: yy, z,
        w,
        text: 'CLAIM BONUNS',
        tooltip,
        sound_button: 'sell'
      })) {
        exotic.survey_done = true;
        game_state.addScore(SURVEY_BONUS);
        game_state.saveGame();
      }
    } else {

      spot({
        x: x + CHW,
        y: yy,
        w: CHW * 11,
        h: CHH * 2,
        def: SPOT_DEFAULT_LABEL,
        tooltip: `This Exotic's known affinities.

If you configure your probe's [c=dwarfs]DWARFS[/c] to match, you will be more likely to find this Exotic,` +
' and the samples you find will be of higher value.',
      });

      for (let jj = 0; jj < NUM_KNOBS; ++jj) {
        let xxx = xx + CHW + jj * CHW * 2;
        font.draw({
          style: style_dwarfs,
          x: xxx,
          y: yy,
          z,
          text: KNOBS[jj][0],
        });
        let known = knobKnown(exotic, jj);

        sprite_toggles.draw({
          x: xxx - 1,
          y: yy + CHH,
          z,
          w: KNOB_W, h: KNOB_W,
          frame: known ? exotic.knobs[jj] + 3 : 12,
        });
      }
      yy += LINEH * 2;
      font.draw({
        style: style_text,
        x: xx,
        y: yy,
        z,
        text: `Avg Val: $${round(exotic.total_value / exotic.total_found)}`,
      });
      yy += LINEH;
    }
  }
  y += INFO_PANEL_H;
  return y;
}

let bg_time = 0;
let bg_dither_uvs = vec4();
let bg_xoffs = 0;
let circuvs = vec4();
function drawBG(dt: number, h: number): void {
  let bounce = Math.sin(getFrameTimestamp() * 0.005) * 4;

  v4copy(engine.border_clear_color, palette[0]);
  v4copy(engine.border_color, palette[0]);

  let xoffs = h ? -90 : 0;
  if (h) {
    bg_xoffs = lerp(dt/1000, bg_xoffs, xoffs);
  } else {
    bg_xoffs = xoffs;
  }
  bg_time += dt;
  let time_scale = 0.0005;
  let zoom = 1024*2;
  let h_scale = 2;
  let hoffs_float = h * h_scale * game_height;
  let hoffs = round(hoffs_float);
  let uv_scale_y = game_height/zoom/dither_uvs[3];
  v4copy(bg_dither_uvs, dither_uvs);
  bg_dither_uvs[1] += hoffs/4;
  bg_dither_uvs[3] += hoffs/4;
  circuvs[0] = -((game_width - game_height) / game_height/2);
  circuvs[2] = 1 + -circuvs[0];
  circuvs[1] = 0;
  circuvs[3] = 1;
  let circ_u_offs = -(bg_xoffs + 7) / game_height;
  circuvs[0] += circ_u_offs;
  circuvs[2] += circ_u_offs;
  let circ_v_offs = -bounce / game_height;
  circuvs[1] += circ_v_offs;
  circuvs[3] += circ_v_offs;
  let circ_scale_u = (circuvs[2] - circuvs[0]) / (bg_dither_uvs[2] - bg_dither_uvs[0]);
  let circ_scale_v = (circuvs[3] - circuvs[1]) / (bg_dither_uvs[3] - bg_dither_uvs[1]);
  sprite_dither.draw({
    x: 0, y: 0, z: 1,
    w: game_width, h: game_height,
    shader: shader_gas_giant,
    shader_params: {
      params: [1, 1, h, bg_time * time_scale],
      uvscale: [game_width/(2*zoom)/dither_uvs[2], uv_scale_y, 0.1, 0],
      uvscale2: [
        circ_scale_u,
        circ_scale_v,
        circuvs[0] - (bg_dither_uvs[0] * circ_scale_u),
        circuvs[1] - (bg_dither_uvs[1] * circ_scale_v),
      ],
      c0: palette[0],
      c1: palette[1],
      c2: palette[2],
      c3: palette[3],
    },
    color: palette[0],
    uvs: bg_dither_uvs,
  });

  let blimp_y_base = 100 - hoffs_float*3;
  if (game_state.planetDone()) {
    blimp_y_base -= 30;
  }
  let blimp_y = blimp_y_base + bounce;
  autoAtlas('game', 'blimp').draw({
    x: 157 + bg_xoffs,
    y: blimp_y,
    z: 3,
    w: 80,
    h: 37,
  });

  if (game_state.planetDone() && !h) {
    return;
  }
  let probe_y = blimp_y + 33 + hoffs_float*3;
  probe_y -= round(clamp(map01(hoffs_float, 0, game_height * 0.25), 0, 1) * 40);
  autoAtlas('game', `probe${h ? floor(getFrameTimestamp() / 50) % 4 + 1 : 1}`).draw({
    x: 157 + 29 + bg_xoffs,
    y: probe_y,
    z: 3,
    w: 25,
    h: 29,
  });

}

const CONFIG_TRANSITION_IN_TIME = 600;
let transition_time = 0;

let style_non_panel = fontStyle(null, {
  color: palette_font[3],
  outline_color: palette_font[1],
  outline_width,
});
function drawNonPanel(param: FontDrawOpts): void {
  param.style = style_non_panel;
  let w = uiGetFont().draw(param);
  let rect_x: number;
  if ((param.align || 0) & ALIGN.HCENTER) {
    let x_mid = param.x + param.w! / 2;
    rect_x = floor(x_mid - w/2);
  } else if ((param.align || 0) & ALIGN.HRIGHT) {
    rect_x = param.x + (param.w || 0) - w;
  } else {
    rect_x = param.x;
  }
  if (false) {
    drawRect(rect_x - 2, param.y - 2, rect_x + w, param.y + CHH + 1, (param.z || Z.UI) - 0.5,
      palette[1]);
  }
}

settings.settingsSet('volume_music', 0.25);
let last_music: GlovSoundSetUp | null;
let playing_music: string | null;
let loading_music: TSMap<true> = {};
let loaded_music: TSMap<true> = {};
let want_music = !engine.DEBUG;
function tickMusic(music_name: string | null): void {
  if (keyUpEdge(KEYS.M) && !editBoxAnyActive()) {
    want_music = !want_music;
  }
  if (!settings.volume || isInBackground() || !want_music) {
    music_name = null;
  }
  if (music_name && !loading_music[music_name]) {
    loading_music[music_name] = true;
    soundLoad(music_name, { loop: true }, function () {
      loaded_music[music_name!] = true; // ! is workaround TypeScript bug fixed in v5.4.0 TODO: REMOVE
      if (playing_music === music_name) {
        last_music = soundPlay(music_name!, 0.01, true); // ! is workaround TypeScript bug fixed in v5.4.0 TODO: REMOVE
        if (last_music) {
          last_music.fade(1, 2500);
        }
      }
    });
  }
  if (!soundResumed()) {
    return;
  }
  if (playing_music !== music_name) {
    if (last_music) {
      last_music.fade(0, 5000);
      last_music = null;
    }
    if (music_name && loaded_music[music_name]) {
      last_music = soundPlay(music_name, 0.01, true);
      if (last_music) {
        last_music.fade(1, 2500);
      }
    }
    playing_music = music_name;
  }
}
onEnterBackground(tickMusic.bind(null, null));

function tutPanel(x: number, y: number, w: number, text: string, do_button?: string): void {
  let z = Z.UI + 20;
  let yy = y + 7;
  let dims = markdownAuto({
    font_style: style_text,
    x: x + 7,
    y: yy,
    z: z + 1,
    w: w - 7 * 2,
    align: ALIGN.HWRAP,
    line_height: uiTextHeight() + 1,
    text,
  });
  yy += dims.h;
  if (do_button) {
    yy += 2;
    let button_w = (do_button.length + 1) * CHW;
    if (buttonText({
      x: x + floor((w - button_w)/2),
      y: yy,
      z: z + 1,
      w: button_w,
      text: do_button,
    })) {
      tut_state++;
    }
    yy += BUTTON_H;
  }
  panel({
    x, y, z,
    w: dims.w + 7 * 2,
    h: yy - y + 7,
  });
}

function stateDroneConfig(dt: number): void {
  gl.clearColor(palette[PALETTE_BG][0], palette[PALETTE_BG][1], palette[PALETTE_BG][2], 1);
  tickMusic('music_main');

  drawBG(dt, 0);

  let disabled = false;
  if (transition_time) {
    transition_time = max(transition_time - dt, 0);
    if (transition_time) {
      drawMiningConclusion(transition_time / CONFIG_TRANSITION_IN_TIME);
      disabled = true;
    }
  }

  if (!transition_time) {
    // eslint-disable-next-line
    disabled = doMiningResult(dt);
  }

  let x = (game_width - CONFIGURE_PANEL_W) / 2;
  let y = 14;
  let z = Z.UI;
  let w = CONFIGURE_PANEL_W;

  let { probe_config, exotics, recent_exotics, endless_enabled } = game_state;

  if (tut_state === 0) {
    // eslint-disable-next-line max-len
    tutPanel(1, 1, 382, `EXOTIC RESOURCES have been discovered in the atmospheres of GAS GIANTS. Though we are just TINY CREATURES on these planets, sure to be CRUSHED if we venture TOO DEEP, we have built CONFIGURABLE PROBES, code-named DWARFS, to safely EXTRACT these EXOTICS.

NOTE: Interplanetary Expeditions Ltd assures us the probes contain no actual dwarfs.`, 'Uh, huh...');
    disabled = true;
  } else if (tut_state === 1) {
    tutPanel(1, 22, 220, `YOU have arrived at a GAS GIANT (the first of 2 in your Campaign).

LAUNCH your first DWARF PROBE to discover an EXOTIC.`);
  } else if (tut_state === 2) {
    game_state.probes_launched = 0;
    tutPanel(1, 10, 240, `Your very first DWARF PROBE was lost!

Remember: keep your SPEED ` +
      'under the SAFETY range to keep it alive. Interplanetary Expeditions Ltd has sent you ' +
      'an extra probe since you\'re clearly new at this.');
  } else if (tut_state === 3 && !disabled) {
    // eslint-disable-next-line max-len
    tutPanel(20, 94, 344, `You can now CONFIGURE a DWARF's launch region, and what properties it scans for. As you learn more about the planet's Exotics (shown on the right), you can tune your [c=dwarfs]DWARFS[/c] to be MORE or LESS likely to find any specific Exotic. The launch region ([c=dwarfs]DW[/c]) strongly affects WHICH Exotic will be found. The properties ([c=dwarfs]ARFS[/c]) strongly affect the VALUE of the Exotics found.
`, 'OK');
  }

  let game_done = game_state.planetDone();
  if (!game_done && tut_state > 2) {
    panel({
      x, y, z,
      w,
      h: CONFIGURE_PANEL_H,
      eat_clicks: false,
    });
    z++;
    y += 8;

    markdownAuto({
      text: 'Configure DWARF',
      font_style: style_text,
      align: ALIGN.HCENTER,
      x: x + 1,
      y,
      w,
    });
    y += LINEH + 2;

    x += 7;
    w -= 7 * 2;
    for (let ii = 0; ii < NUM_KNOBS; ++ii) {
      markdownAuto({
        font_style: style_text,
        x: x + CHW,
        y, z,
        text: `[c=dwarfs]${KNOBS[ii][0]}[/c]${KNOBS[ii].slice(1)}:`,
      });
      let xx = x + w - KNOB_W * 3 - 4;
      for (let jj = 0; jj < 3; ++jj) {
        let ret = button({
          x: xx, y,
          w: KNOB_W,
          h: KNOB_W,
          no_bg: true,
          text: ' ',
          sound_button: `button_click${jj+1}`,
          disabled: probe_config[ii] === jj || disabled,
        });
        if (ret) {
          probe_config[ii] = jj;
          game_state.saveGame();
        }
        sprite_toggles.draw({
          x: xx,
          y, z,
          w: KNOB_W, h: KNOB_W,
          frame: jj + (buttonWasFocused() ? 6 : 0) + (probe_config[ii] === jj ? 3 : 0),
        });
        xx += KNOB_W;
      }
      y += LINEH;
      if (ii === 1) {
        y += 4;
      }
    }
  }

  w = INFO_PANEL_W;
  x = game_width - 1 - w;
  y = 1;
  z = Z.UI;
  drawNonPanel({
    color: palette_font[3],
    x, y, z, w,
    text: 'Exotics',
    align: ALIGN.HCENTER,
  });
  y += LINEH;
  any_claimable = false;
  for (let ii = 0; ii < exotics.length; ++ii) {
    let exotic = exotics[ii];

    y = drawExoticInfoPanel({
      x, y,
      z: Z.UI,
      exotic,
      style: ii === 0 ? 'panel_info' : 'panel_info_overlay',
      show_match: true,
      allow_undiscovered: true,
    });
    y -= 5;
  }

  x = 1;
  y = 1;
  w = INFO_PANEL_W;
  z = Z.UI;
  if (recent_exotics.length) {
    font.draw({
      color: palette_font[3],
      x, y, z, w,
      text: 'Recent Finds',
      align: ALIGN.HCENTER,
    });
    y += LINEH;
    let left_y0 = y;
    x += 6;
    w -= 6 * 2;
    y += 2;
    for (let ii = 0; ii < min(recent_exotics.length, 8); ++ii) {
      y += 4;
      let recent = recent_exotics[ii];
      let exotic = exotics[recent.exotic];

      autoAtlas('game', `exotic${exotic.exotic_style+1}`).draw({
        x, y, z,
        w: 7, h: 7,
      });
      font.draw({
        style: style_exotic[exotic.exotic_style],
        x, y, z,
        text: ` ${exotic.name}`,
      });
      font.draw({
        color: palette_font[1],
        x: x + CHW * 7,
        y, z,
        text: `$${recent.value}`, // ${recent.bonus > 1 ? ` x${recent.bonus}` : ''}
      });
      y += LINEH;
      font.draw({
        color: palette_font[1],
        x, y, z,
        text: 'DWARFS:',
      });
      spot({
        x: x,
        y: y - 1,
        w: CHW * KNOB_W + 2 + CHW * 7,
        h: KNOB_W,
        def: SPOT_DEFAULT_LABEL,
        // eslint-disable-next-line max-len
        tooltip: 'This record shows your configured [c=dwarfs]DWARFS[/c] when this Exotic was collected.',
      });

      for (let jj = 0; jj < NUM_KNOBS; ++jj) {
        let xxx = x + CHW * 7 + jj * CHW;
        if (jj > 1) {
          xxx += 2;
        }
        sprite_toggles.draw({
          x: xxx - 1,
          y: y - 1,
          z,
          w: KNOB_W, h: KNOB_W,
          frame: recent.knobs[jj] + 3,
        });
      }
      y += LINEH;
    }
    y += 4;
    panel({
      x: 1,
      y: left_y0,
      z: Z.UI - 1,
      w: INFO_PANEL_W,
      h: y - left_y0,
      sprite: autoAtlas('game', 'panel_info'),
    });
  }

  let planets_left = CAMPAIGN_PLANETS - game_state.level_idx;

  let button_w = 95;
  y = !game_done ? 164 : 150;
  z = Z.UI;
  if (!disabled) {
    if (buttonText({
      x: floor((game_width - button_w)/2),
      y, z,
      w: button_w,
      disabled: disabled || any_claimable,
      text: !game_done ? 'LAUNCH!' : planets_left || endless_enabled ? 'Next Planet' : 'FINISH',
      sound_button: 'launch',
      hotkey: KEYS.SPACE,
    })) {
      if (tut_state < 2) {
        tut_state = 2;
      }
      if (!game_done) {
        game_state.probes_launched++;
        game_state.saveGame();
        startMining();
      } else {
        queueTransition();
        if (planets_left || endless_enabled) {
          game_state.initLevel(++game_state.level_idx);
        } else {
          engine.setState(stateScores);
        }
      }
    }
  }
  y += uiButtonHeight() + 2;
  if (!disabled) {
    if (!game_done) {
      // drawNonPanel({
      //   color: palette_font[3],
      //   x: 0, y, z,
      //   w: game_width,
      //   align: ALIGN.HCENTER,
      //   text: `${game_state.probes_launched} ${plural(game_state.probes_launched, 'Probe')} launched`,
      // });
    } else if (!endless_enabled) {
      drawNonPanel({
        color: palette_font[3],
        x: 0, y, z,
        w: game_width,
        align: ALIGN.HCENTER | ALIGN.HWRAP,
        text: `${planets_left} ${plural(planets_left, 'Planet')} left\nin campaign`,
      });
    }
  }

  z = Z.UI;
  y = game_height - LINEH * 2 - 1;
  drawNonPanel({
    color: palette_font[3],
    x: 1, y, z,
    text: `Money: $${game_state.level_score}`,
  });
  y += LINEH;
  drawNonPanel({
    color: palette_font[3],
    x: 1, y, z,
    text: `Quota: $${PLANET_GOAL}`,
  });
  // drawNonPanel({
  //   color: palette_font[3],
  //   x: 1, y, z,
  //   text: `$${game_state.game_score} ${endless_enabled ? 'Endless' : 'Campaign'} Score`,
  // });
  if (game_state.probes_launched) {
    drawNonPanel({
      color: palette_font[3],
      x: 0, y, z,
      w: game_width - 1,
      align: ALIGN.HRIGHT,
      text: `${game_state.probes_launched} ${plural(game_state.probes_launched, 'Probe')} launched`,
    });
  }

  if (keyUpEdge(KEYS.ESC) && !disabled) {
    queueTransition();
    engine.setState(stateTitle);
  }
}

let mining_state: {
  progress: number;
  time: number;
  speed: number;
  accel: number;
  stress: number;
  last_danger: number;
  last_danger_time: number;
  danger_index: number;
  danger_schedule: [number, number][];
  last_bonus: number;
  done: boolean;
};

let mining_result_state: {
  stage: string; // study, stud_anim, choice, dismantle_anim, sell_anim
  is_new: boolean;
  t: number;
  knowledge_start: number;
  done: boolean;
  value_given: number;
  need_init: boolean;
};
function shouldBlinkBar(exotic: ExoticDef): boolean {
  if (!mining_result_state || mining_result_state.done) {
    return false;
  }
  if (mining_result_state.stage === 'study_anim' || mining_result_state.stage === 'dismantle_anim') {
    if (game_state.exotics[game_state.recent_exotics[0].exotic] === exotic) {
      return true;
    }
  }
  return false;
}
function bonusForTime(time_ms: number): number {
  if (time_ms < BONUS_TIME1) {
    return 4;
  } else if (time_ms < BONUS_TIME2) {
    return 2;
  }
  return 1;
}
function pad2(v: number): string {
  let s = String(v);
  if (s.length < 2) {
    s = ` ${s}`;
  }
  return s;
}

function formatTime(time_ms: number): string {
  let time_s = floor(time_ms / 1000);
  let time_ts = floor((time_ms - time_s * 1000)/100);
  // let time_m = floor(time_s / 60);
  // time_s -= time_m * 60;
  // return `${time_m}:${pad2(time_s)}.${time_ts}`;
  return `${pad2(time_s)}.${time_ts}`;
}

const RESULT_W = INFO_PANEL_W + 40;
const STUDY_ANIM_TIME = 1000;
const SELL_ANIM_TIME = 1000;
let mr_ymax = 0;
function doMiningResult(dt: number): boolean {
  if (!mining_state || mining_state.stress >= 1) {
    return false;
  }

  if (!mining_result_state || mining_result_state.need_init) {
    let { recent_exotics, exotics } = game_state;
    let recent = recent_exotics[0];
    let exotic = exotics[recent.exotic];
    let knowledge = exotic.knowledge;
    mining_result_state = {
      is_new: knowledge === 0,
      stage: knowledge === NUM_KNOBS ? 'choice' : 'study',
      t: 0,
      knowledge_start: knowledge,
      done: false,
      value_given: 0,
      need_init: false,
    };
  }
  if (mining_result_state.done) {
    return false;
  }
  let { recent_exotics, exotics } = game_state;
  let recent = recent_exotics[0];
  let exotic = exotics[recent.exotic];

  mining_result_state.t += dt;

  if (mining_result_state.stage === 'study_anim' || mining_result_state.stage === 'dismantle_anim') {
    if (mining_result_state.t >= STUDY_ANIM_TIME) {
      exotic.knowledge = mining_result_state.knowledge_start + 1;
      game_state.saveGame();
      if (mining_result_state.stage === 'dismantle_anim') {
        // delay closing?
        mining_result_state.done = true;
      } else {
        mining_result_state.stage = 'choice';
        mining_result_state.t = 0;
      }
    } else {
      exotic.knowledge = mining_result_state.knowledge_start + mining_result_state.t / STUDY_ANIM_TIME;
    }
  }
  if (mining_result_state.stage === 'sell_anim') {
    let expected_given = floor(recent.value * recent.bonus * min(mining_result_state.t / SELL_ANIM_TIME, 1));
    let left = expected_given - mining_result_state.value_given;
    mining_result_state.value_given = expected_given;
    game_state.level_score += left;
    game_state.game_score += left;
    if (mining_result_state.t >= SELL_ANIM_TIME) {
      game_state.addScoreFinalize();
      game_state.saveGame();
      mining_result_state.done = true;
    }
  }
  if (mining_result_state.stage === 'choice' && exotic.knowledge === NUM_KNOBS) {
    playUISound('sell');
    mining_result_state.stage = 'sell_anim';
    mining_result_state.t = 0;
  }

  let x = floor((game_width - RESULT_W)/2);
  const x0 = x;
  let y = 20;
  const y0 = y;
  let z = Z.UI + 100;
  const z0 = z;
  x += 7;
  let w = RESULT_W - 7 * 2;
  y += 7;
  z++;

  y += font.draw({
    style: style_text,
    x, y, z,
    w,
    align: ALIGN.HCENTER | ALIGN.HWRAP,
    text: mining_result_state.is_new ? 'Sample of NEW Exotic found!' :
      'Exotic retrieved!',
  }) + 1;

  y = drawExoticInfoPanel({
    style: 'panel_info',
    x: x + floor((w - INFO_PANEL_W)/2),
    y, z,
    exotic,
    show_match: false,
    allow_undiscovered: false,
  }) + 2;

  let bonus = bonusForTime(mining_state.time);
  if (bonus > 1) {
    markdownAuto({
      font_style: style_text,
      x, y, z,
      w,
      align: ALIGN.HCENTER,
      text: `Base Value: [c=1]$${recent.value}[/c]`,
    });
    y += LINEH;
    markdownAuto({
      font_style: style_text,
      x, y, z,
      w,
      align: ALIGN.HCENTER,
      text: `Time Bonus: [c=1]x${bonus}[/c]`,
    });
    spot({
      def: SPOT_DEFAULT_LABEL,
      x, y,
      w, h: CHH,
      tooltip: `Time: ${formatTime(mining_state.time)}`,
    });
    y += LINEH;
  }
  markdownAuto({
    font_style: style_text,
    x, y, z,
    w,
    align: ALIGN.HCENTER,
    text: `Value: [c=1]$${bonus * recent.value}[/c]`,
  });
  y += LINEH;
  y += 2;

  let button_w = 95;
  if (mining_result_state.stage === 'study') {
    if (buttonText({
      x: x + floor((w - button_w)/2),
      y: y,
      z,
      w: button_w,
      text: 'STUDY',
      auto_focus: true,
      hotkey: KEYS.SPACE,
      sound_button: 'study',
    })) {
      mining_result_state.stage = 'study_anim';
      if (!mining_result_state.knowledge_start) {
        mining_result_state.t = STUDY_ANIM_TIME * 0.1;
      } else {
        mining_result_state.t = 0;
      }
    }
    y += uiButtonHeight() + 2;
    y += font.draw({
      color: palette_font[1],
      x, y, z,
      w,
      align: ALIGN.HCENTER | ALIGN.HWRAP,
      text: 'Learn more about the affinities of this Exotic.',
    }) + 1;
  } else if (
    mining_result_state.stage === 'study_anim' ||
    mining_result_state.stage === 'dismantle_anim' ||
    mining_result_state.stage === 'sell_anim'
  ) {
    y += 12;
    y += font.draw({
      color: palette_font[1],
      x, y, z,
      w,
      align: ALIGN.HCENTER | ALIGN.HWRAP,
      text: mining_result_state.stage === 'study_anim' ? 'Studying...' :
        mining_result_state.stage === 'dismantle_anim' ? 'Dismantling...' :
        'Shipping...',
    }) + 1;
  } else if (mining_result_state.stage === 'choice') {
    if (buttonText({
      x: x + floor((w - button_w)/2),
      y: y,
      z,
      w: button_w,
      text: 'DISMANTLE',
      sound_button: 'dismantle',
    })) {
      mining_result_state.stage = 'dismantle_anim';
      mining_result_state.knowledge_start = exotic.knowledge;
      mining_result_state.t = 0;
    }
    y += uiButtonHeight() + 2;
    y += font.draw({
      color: palette_font[1],
      x, y, z,
      w,
      align: ALIGN.HCENTER | ALIGN.HWRAP,
      text: 'Destroy this Exotic to learn even more.',
    }) + 1;

    y += 2;
    if (buttonText({
      x: x + floor((w - button_w)/2),
      y: y,
      z,
      w: button_w,
      text: 'SHIP',
      sound_button: 'sell',
    })) {
      mining_result_state.stage = 'sell_anim';
      mining_result_state.t = 0;
    }
    y += uiButtonHeight() + 2;
    y += font.draw({
      color: palette_font[1],
      x, y, z,
      w,
      align: ALIGN.HCENTER | ALIGN.HWRAP,
      text: `Sell this Exotic for $${bonus * recent.value}.`,
    }) + 1;
  }

  y += 7;
  mr_ymax = max(y, mr_ymax);
  panel({
    x: x0,
    y: y0,
    z: z0,
    w: RESULT_W,
    h: mr_ymax - y0,
  });

  return true;
}

const BAR_LONG_SIZE = 120;
const BAR_SHORT_SIZE = 10;
const MINING_TRANSITION_OUT_TIME = CONFIG_TRANSITION_IN_TIME;
function drawMiningConclusion(v: number): void {
  let z = Z.UI + 100;
  sprite_dither.draw({
    x: 0, y: 0, z,
    w: game_width, h: game_height,
    shader: shader_dither,
    shader_params: {
      dither_param: [min(1, v)],
    },
    color: palette[0],
    uvs: dither_uvs,
  });
  z++;
  const FINISH_W = 200;
  const FINISH_H = 100;

  panel({
    x: floor((game_width - FINISH_W) / 2),
    y: floor((game_height - FINISH_H) / 2),
    z,
    w: FINISH_W,
    h: FINISH_H,
  });
  z++;
  uiGetFont().draw({
    style: style_text,
    x: 0,
    y: 0,
    z,
    w: game_width,
    h: game_height,
    align: ALIGN.HVCENTER | ALIGN.HWRAP,
    size: uiTextHeight() * 2,
    text: mining_state.stress >= 1 ? 'DWARF LOST' : 'EXTRACTION\nSUCCESS',
  });
}
let last_damage_time = 0;
function takeDamage(): void {
  let now = getFrameTimestamp();
  if (now - last_damage_time > 333) {
    playUISound(`damage${1+rand.range(4)}`);
    last_damage_time = now;
  }
}
let over_danger_time = 0;
let next_wind_time = 0;
function stateMine(dt: number): void {
  tickMusic(mining_state.progress > 0.75 ? null : 'music_ambient');
  dt = min(dt, 200);
  gl.clearColor(palette[PALETTE_BG][0], palette[PALETTE_BG][1], palette[PALETTE_BG][2], 1);

  drawBG(dt, mining_state.progress);

  let do_accel = keyDown(KEYS.SPACE) || keyDown(KEYS.A) || mouseDownAnywhere() || padButtonDown(PAD.A) ||
     padButtonDown(PAD.B) || padButtonDown(PAD.X);

  if (tut_state === 2) {
    if (mining_state.progress < 0.75) {
      tutPanel(1, 116 - 10, 160, `CLICK/TAP ANYWHERE or hold SPACE or A to ACCELERATE.

But watch out!  If your SPEED is beyond the current SAFETY range, your will lose` +
' ARMOR and potentially lose your DWARF.');
    }
    if (!do_accel && !mining_state.progress) {
      dt = 0;
    }
  }

  let maxp = 1; // (0.7 + game_state.probe_config[0] * 0.3);
  let do_flicker = false;

  if (!mining_state.done) {
    mining_state.time += dt;
  }
  let bonus = bonusForTime(mining_state.time);
  if (bonus !== mining_state.last_bonus) {
    mining_state.last_bonus = bonus;
    playUISound('bonus_down');
  }

  let time_dangerscale = mining_state.time*DANGER_TIME_SCALE_TIME;
  let danger_sched_entry = mining_state.danger_schedule[mining_state.danger_index];
  let danger_time_end = mining_state.last_danger_time + danger_sched_entry[0];
  while (time_dangerscale >= danger_time_end) {
    mining_state.last_danger = danger_sched_entry[1];
    mining_state.last_danger_time = danger_time_end;
    mining_state.danger_index = (mining_state.danger_index + 1) % mining_state.danger_schedule.length;
    danger_sched_entry = mining_state.danger_schedule[mining_state.danger_index];
    danger_time_end = mining_state.last_danger_time + danger_sched_entry[0];
  }

  let danger = lerp(
    (time_dangerscale - mining_state.last_danger_time) / danger_sched_entry[0],
    mining_state.last_danger, danger_sched_entry[1]);


  if (mining_state.done) {
    transition_time += dt;
    transition_time = min(transition_time, MINING_TRANSITION_OUT_TIME);
    drawMiningConclusion(transition_time / MINING_TRANSITION_OUT_TIME);
    if (transition_time >= MINING_TRANSITION_OUT_TIME && !do_accel) {
      engine.setState(stateDroneConfig);
      transition_time = CONFIG_TRANSITION_IN_TIME;
    }
  } else {

    if (do_accel) {
      mining_state.accel += dt * ACCEL_SPEED;
    } else {
      mining_state.accel -= dt * DECEL_SPEED;
    }
    mining_state.accel = clamp(mining_state.accel, ACCEL_MIN, 1);

    mining_state.speed += mining_state.accel * dt * ACCEL_MAX;
    mining_state.speed = clamp(mining_state.speed, 0, 1);
    if (!mining_state.speed && mining_state.accel < 0) {
      mining_state.accel = 0;
    } else if (mining_state.speed === 1 && mining_state.accel > 0) {
      mining_state.accel = 0;
    }

    let dprogress = max(mining_state.speed, MIN_PROGRESS) * dt * PROGRESS_SPEED;
    if (engine.DEBUG && keyDown(KEYS.W)) {
      dprogress += dt * 0.01;
    }
    mining_state.progress += dprogress;
    mining_state.progress = clamp(mining_state.progress, 0, maxp);

    if (mining_state.progress === maxp) {
      mining_state.done = true;

      if (mining_result_state) {
        mining_result_state.need_init = true;
      }
      playUISound('success');
      game_state.findExotic(bonus);
      transition_time = 0;
      if (tut_state === 2) {
        tut_state = 3;
      }
    }

    if (mining_state.speed > 0.5 && getFrameTimestamp() > next_wind_time) {
      next_wind_time = getFrameTimestamp() + rand.floatBetween(4000, 10000);
      playUISound('wind', (mining_state.speed - 0.5) * 2 * 0.75 + 0.25);
    }

    let over_danger = max(0, mining_state.speed - (1 - danger));
    if (over_danger && !mining_state.done) {
      over_danger = 0.1 + over_danger;
      mining_state.stress += over_danger * DAMAGE_RATE * dt;
      takeDamage();
      mining_state.stress = clamp(mining_state.stress, 0, 1);
      over_danger_time += dt;
      do_flicker = true;
    } else if (!mining_state.done) {
      // minimal stress accumulation based on real time
      mining_state.stress += AMBIENT_DAMAGE_RATE * dt;
      mining_state.stress = clamp(mining_state.stress, 0, 1);
      over_danger_time = 0;
    } else {
      over_danger_time = 0;
    }
    if (engine.DEBUG && keyDown(KEYS.L)) {
      takeDamage();
      mining_state.stress += dt * 0.01;
    }
    if (mining_state.stress >= 1) {
      mining_state.done = true;
      transition_time = 0;
      playUISound('failure');
    }
  }

  function drawHBar(x: number, y: number, label: string, p: number): void {
    let z = Z.UI;
    let w = BAR_LONG_SIZE;
    let text_w = font.draw({
      style: style_text,
      x,
      y: y + 6,
      z: z + 1,
      w,
      align: ALIGN.HCENTER,
      text: label,
    });
    text_w += 7 * 2;
    panel({
      x: x + floor((BAR_LONG_SIZE - text_w)/2),
      y,
      z,
      w: text_w,
      h: CHH + 18,
    });
    y += CHH + 7;
    z+=2;
    panel({
      x: x - 4,
      y, z,
      w: w + 4*2,
      h: BAR_SHORT_SIZE + 4 * 2,
    });
    z++;
    y += 4;
    drawHBox({
      x, y, z,
      w: BAR_LONG_SIZE,
      h: BAR_SHORT_SIZE,
    }, autoAtlas('game', 'hbar_base'));
    let fill_w = clamp(round(8 + p * (BAR_LONG_SIZE - 8)), 1, BAR_LONG_SIZE);
    if (p < 1 && fill_w > BAR_LONG_SIZE - 1) {
      fill_w = BAR_LONG_SIZE - 1;
    }
    z++;
    drawHBox({
      x, y, z,
      w: fill_w,
      h: BAR_SHORT_SIZE,
    }, autoAtlas('game', 'hbar_fill'));
  }

  function drawVBar(style: string, x: number, y: number, label: string, p: number, label_right: boolean): void {
    let z = Z.UI;
    let h = BAR_LONG_SIZE;
    panel({
      x: x - 4,
      y, z,
      w: BAR_SHORT_SIZE + 4*2,
      h: h + 4 * 2,
    });
    z++;
    y += 4;
    drawVBox({
      x, y, z,
      w: BAR_SHORT_SIZE,
      h: BAR_LONG_SIZE,
    }, autoAtlas('game', `${style}_base`));
    let fill_w = clamp(round(8 + p * (BAR_LONG_SIZE - 8)), 1, BAR_LONG_SIZE);
    if (p < 1 && fill_w > BAR_LONG_SIZE - 1) {
      fill_w = BAR_LONG_SIZE - 1;
    }
    z++;
    drawVBox({
      x,
      y: y + BAR_LONG_SIZE - fill_w,
      z,
      w: BAR_SHORT_SIZE,
      h: fill_w,
    }, autoAtlas('game', `${style}_fill`));
    // y += BAR_LONG_SIZE + 3;

    let text_w = font.draw({
      style: style_text,
      x: label_right ? x + BAR_SHORT_SIZE + 9 : x - CHH - 1,
      y: y + BAR_LONG_SIZE/2,
      z: z + 1,
      w: 0,
      h: 0,
      align: ALIGN.HVCENTER,
      text: label,
      rot: label_right ? PI/2 : -PI/2,
    });
    text_w += 7 * 2;
    let y_mid = y + BAR_LONG_SIZE/2;
    panel({
      x: label_right ? x + BAR_SHORT_SIZE - 5 : x - 19,
      y: y_mid - text_w / 2,
      z: z - 3,
      w: CHW + 7 * 2 + 2,
      h: text_w,
    });
    y += CHH + 7;
    z+=2;
  }

  let hbar_x = (game_width - BAR_LONG_SIZE) / 2;
  // let hbar_x = 64;
  drawHBar(hbar_x, 8, 'Progress', mining_state.progress / maxp);
  const time_y = 44;
  const TIME_W = 149;
  const time_x = floor((game_width - TIME_W)/2);

  markdownAuto({
    font_style: style_text,
    x: time_x,
    w: TIME_W,
    y: time_y,
    align: ALIGN.HCENTER,
    text: `${formatTime(mining_state.time)}  ${bonus > 1 ? `BONUS: [c=1]${bonus}x[/c]` : 'NO Bonus '}`,
  });
  panel({
    x: time_x,
    y: time_y - 8,
    z: Z.UI - 1,
    w: TIME_W,
    h: CHH + 7*2,
  });
  let vbar_y = 72;
  let flicker = do_flicker ? over_danger_time % 200 < 100 : false;
  let x0 = 186;
  let x1 = x0 + 17;
  let x2 = x1 + 55;
  let armor_flicker = mining_state.stress > 0.9 ? getFrameTimestamp() % 200 < 100 : false;
  drawVBar(flicker ? 'vbar' : 'vbar2', x0, vbar_y, 'Speed', mining_state.speed, false);
  drawVBar(flicker ? 'vbar2' : 'vbar', x1, vbar_y,
    'Safety', 1 - danger, true);
  drawVBar(armor_flicker ? 'vbar' : 'vbar2', x2, vbar_y, 'Armor', 1 - mining_state.stress, false);
}

const MIN_FIXUP_TIME = 0.5;
type RandProvider = {
  floatBetween(a: number, b: number): number;
};
function genDangerSchedule(rand_use: RandProvider): [number, number][] {
  let danger_schedule: [number, number][] = [];
  let danger_sum = 0;
  let danger_div = 0;
  let last_danger = 0.5;
  function pushDangerStep(time: number, value: number): void {
    assert(time > 0);
    assert(value > 0);
    danger_sum += (last_danger + value) / 2 * time;
    danger_div += time;
    danger_schedule.push([time, value]);
    last_danger = value;
  }
  pushDangerStep(1, rand_use.floatBetween(0.3, 0.7));

  while (danger_div < 10) {
    pushDangerStep(rand_use.floatBetween(1, 3), rand_use.floatBetween(DANGER_MIN, DANGER_MAX));
  }
  // console.log('danger_sched random', danger_schedule.slice(0), danger_sum / danger_div);
  while (true) {
    let cur_avg_danger = danger_sum / danger_div;
    let too_low = cur_avg_danger < DESIRED_DANGER - 0.02;
    let too_high = cur_avg_danger > DESIRED_DANGER + 0.02;
    if (!too_low && !too_high) {
      break;
    }
    let dvalue = too_low ? rand_use.floatBetween(0.6, 0.8) : rand_use.floatBetween(0, 0.3);
    // what time is needed to get to the desired average at this danger?
    // DESIRED_DANGER = (danger_sum + (last_danger + dvalue)/2 * desired_t) / (danger_div + desired_t);
    let desired_t = (danger_sum - DESIRED_DANGER * danger_div) / (DESIRED_DANGER - (last_danger + dvalue) / 2);
    if (desired_t < MIN_FIXUP_TIME) {
      // too short a time, what danger is needed instead?
      // DESIRED_DANGER = (danger_sum + (last_danger + dvalue)/2 * MIN_FIXUP_TIME) / (danger_div + MIN_FIXUP_TIME)
      dvalue = (DESIRED_DANGER * (danger_div + MIN_FIXUP_TIME) - danger_sum) / (MIN_FIXUP_TIME/2) - last_danger;
      if (dvalue > 0) {
        // never happens because of +/- 0.02 threshold above, I think.
        pushDangerStep(MIN_FIXUP_TIME, dvalue);
        // console.log('danger_sched too short', MIN_FIXUP_TIME, dvalue);
        break;
      }
      // console.log('danger_sched too short, but need negative');
    }
    if (desired_t >= MIN_FIXUP_TIME && desired_t < 5) {
      pushDangerStep(desired_t, dvalue);
      // console.log('danger_sched just right', desired_t, dvalue);
      break;
    }
    // too long, push something random and in the right direction and try again
    pushDangerStep(rand_use.floatBetween(1, 3),
      too_low ?
        rand_use.floatBetween(DESIRED_DANGER + 0.1, DANGER_MAX) :
        rand_use.floatBetween(DANGER_MIN, DESIRED_DANGER - 0.1));
    // console.log('danger_sched too long (add random)');
  }
  // console.log('danger_sched final', danger_schedule.slice(0), danger_sum / danger_div);

  // // Shuffle all but the first
  // doesn't work, since averages were based on the time above!
  // let danger_added = danger_schedule.slice(1);
  // shuffleArray(rand_use, danger_added);
  // for (let ii = 0; ii < danger_added.length; ++ii) {
  //   danger_schedule[ii + 1] = danger_added[ii];
  // }
  return danger_schedule;
}

function startMining(): void {
  engine.setState(stateMine);

  game_state.pickExotic();
  let exotic = game_state.exotics[game_state.picked_exotic];

  mining_state = {
    progress: 0,
    time: 0,
    speed: 0.5,
    accel: 0,
    stress: 0,
    last_danger: 0,
    last_danger_time: 0,
    danger_index: 0,
    danger_schedule: exotic.danger_schedule || genDangerSchedule(rand),
    done: false,
    last_bonus: bonusForTime(0),
  };
}

let title_anim: AnimationSequencer | null = null;
let title_alpha = {
  title: 0,
  sub: 0,
  button: 0,
  gradient: 0,
  planet: 0,
  ship_x: 0,
};
function stateTitleInit(): void {
  title_anim = animationSequencerCreate();
  let t = 0;

  title_anim.add(0, 4000, (progress) => {
    title_alpha.gradient = progress;
  });

  title_anim.add(0, 3500, (progress) => {
    title_alpha.ship_x = progress;
  });

  title_anim.add(300, 5000, (progress) => {
    title_alpha.planet = progress;
  });

  t = title_anim.add(1500, 300, (progress) => {
    title_alpha.title = progress;
  });
  t = title_anim.add(t + 300, 300, (progress) => {
    title_alpha.sub = progress;
  });
  title_anim.add(t + 500, 300, (progress) => {
    title_alpha.button = progress;
  });
}
const style_title = fontStyle(null, {
  color: palette_font[3],
  outline_color: palette_font[0],
  outline_width,
});
function stateTitle(dt: number): void {
  tickMusic('music_ambient');
  gl.clearColor(palette[0][0], palette[0][1], palette[0][2], 1);

  let W = game_width;
  let H = game_height;

  if (title_anim && (mouseDownAnywhere() || engine.DEBUG)) {
    title_anim.update(Infinity);
    title_anim = null;
  }
  if (title_anim) {
    if (!title_anim.update(dt)) {
      title_anim = null;
    } else {
      eatAllInput();
    }
  }

  if (engine.defines.COMPO) {
    modalDialog({
      title: 'POST-JAM VERSION',
      // eslint-disable-next-line max-len
      text: 'You have appeared to arrive at the post-jam edition of this game via an old link.  Please refresh the ldjam.com page and use the latest link to ensure you are playing the original COMPO version of this game.  If you enjoy the game, seek out the post-jam version (has balance tweaks) after giving a fair rating.',
    });
  }

  let z = 1;

  sprite_title_gradient.draw({
    x: 0,
    y: lerp(easeOut(title_alpha.gradient, 2), -384, -250),
    z,
    w: game_width,
    h: 384,
  });
  z++;
  if (title_alpha.planet) {
    sprite_title_planet.draw({
      x: 0,
      y: lerp(easeOut(title_alpha.planet, 2), game_height, 50),
      z,
      w: game_width,
      h: game_height,
    });
  }
  z++;

  let blimp_x = lerp(easeOut(title_alpha.ship_x, 2), game_width, 150);
  let bounce = Math.sin(getFrameTimestamp() * 0.005) * 4;
  let blimp_y = 74 + bounce;
  autoAtlas('game', 'blimp').draw({
    x: blimp_x,
    y: blimp_y,
    z: 3,
    w: 80,
    h: 37,
  });

  // let probe_y = blimp_y + 33;
  // autoAtlas('game', 'probe1').draw({
  //   x: blimp_x + 29,
  //   y: probe_y,
  //   z: 3,
  //   w: 25,
  //   h: 29,
  // });

  let y = 12;

  let title_x = 7;
  font.draw({
    style: style_title,
    alpha: title_alpha.title,
    x: title_x, y, w: W, align: ALIGN.HCENTER,
    size: CHH * 4,
    text: 'DWA   ',
  });
  font.draw({
    style: style_title,
    alpha: title_alpha.title,
    x: title_x - 4, y, w: W, align: ALIGN.HCENTER,
    size: CHH * 4,
    text: '   RFS',
  });

  font.draw({
    color: palette_font[0],
    alpha: title_alpha.sub,
    x: 0,
    y: H - CHH * 2 - 3,
    w: W, align: ALIGN.HCENTER,
    text: 'By Jimb Esser for Ludum Dare 56',
  });
  font.draw({
    color: palette_font[0],
    alpha: title_alpha.sub,
    x: 0,
    y: H - CHH - 1,
    w: W, align: ALIGN.HCENTER,
    text: '(post-Jam edition with balance tweaks)',
  });

  const PROMPT_PAD = 8;
  if (title_alpha.button) {
    let button_w = BUTTON_H * 8;
    let button_x0 = floor((W - button_w * 2 - PROMPT_PAD) / 2);
    let button_h = BUTTON_H;
    let color = [1,1,1, title_alpha.button] as const;
    let y2 = H - BUTTON_H - 44;
    let button_param = {
      color,
      w: button_w,
      h: button_h,
    };

    if (button({
      ...button_param,
      x: button_x0,
      y: y2,
      text: game_state ? 'NEW GAME' : 'START GAME',
    })) {
      tut_state = 0;
      queueTransition();
      startNewGame();
    }

    if (buttonText({
      ...button_param,
      x: button_x0 + button_w + PROMPT_PAD,
      y: y2,
      text: 'HIGH SCORES',
    })) {
      queueTransition();
      engine.setState(stateScores);
    }

    if (game_state) {
      if (button({
        ...button_param,
        x: floor(button_x0 + (button_w + PROMPT_PAD)/2),
        y: y2 + BUTTON_H + 4,
        text: 'RESUME GAME',
      })) {
        queueTransition();
        engine.setState(stateDroneConfig);
      }
    }

    const toggle_button_w = 27;
    if (buttonImage({
      ...button_param,
      w: toggle_button_w,
      x: game_width - toggle_button_w - 2,
      y: y2,
      shrink: 1,
      frame: 0,
      sound_button: null,
      img: autoAtlas('game', settings.volume_sound ? 'sfx_on' : 'sfx_off'),
    })) {
      settings.settingsSet('volume_sound', settings.volume_sound ? 0 : 1);
      if (settings.volume_sound) {
        playUISound('button_click');
      }
    }
    if (buttonImage({
      ...button_param,
      w: toggle_button_w,
      x: game_width - toggle_button_w - 2,
      y: y2 + BUTTON_H + 4,
      shrink: 1,
      frame: 0,
      img: autoAtlas('game', want_music ? 'mus_on' : 'mus_off'),
    })) {
      want_music = !want_music;
    }

  }

  // font.draw({
  //   color: palette_font[9],
  //   alpha: title_alpha.sub,
  //   x: 0, y: game_height - CHH - 8, w: W, align: ALIGN.HCENTER,
  //   text: 'Copywrite 1977 QuantumPulse Ltd, Novi Grad, Sokovia',
  // });
}

const SCORE_COLUMNS = [
  // widths are just proportional, scaled relative to `width` passed in
  { name: '', width: CHW * 3, align: ALIGN.HFIT | ALIGN.HRIGHT | ALIGN.VCENTER },
  { name: 'Name', width: CHW * 8, align: ALIGN.HFIT | ALIGN.VCENTER },
  { name: 'Prog', width: CHW * 4 },
  { name: 'Dwfs', width: CHW * 4 },
];
const SCORE_COLUMNS_ENDLESS = clone(SCORE_COLUMNS);
SCORE_COLUMNS_ENDLESS[2].name = 'Plnt';
const style_score = fontStyleColored(null, palette_font[2]);
const style_me = fontStyleColored(null, palette_font[1]);
const style_header = fontStyleColored(null, palette_font[2]);
function myScoreToRowCampaign(row: unknown[], score: Score): void {
  row.push(floor(score.progress * 100 / 2), score.probes);
}
function myScoreToRowEndless(row: unknown[], score: Score): void {
  row.push(score.progress.toFixed(1), score.probes);
}

function stateScores(dt: number): void {
  tickMusic('music_main');
  gl.clearColor(palette[PALETTE_BG][0], palette[PALETTE_BG][1], palette[PALETTE_BG][2], 1);

  let x = 1;
  let y = 3;

  if (buttonText({
    x: 1,
    y: 1,
    w: CHW * 6,
    text: 'BACK',
    hotkey: KEYS.ESC,
  })) {
    queueTransition();
    engine.setState(stateTitle);
  }

  font.draw({
    style: style_title,
    x: 0,
    y,
    w: game_width,
    text: 'HIGH SCORES',
    size: CHH * 2,
    align: ALIGN.HCENTER,
  });
  y += CHH * 2 + 3;

  let w = game_width / 2 - 2;
  font.draw({
    color: palette_font[0],
    x, y, w,
    text: 'Campaign',
    align: ALIGN.HCENTER,
  });
  y += LINEH;
  let text_height = uiTextHeight();
  scoresDraw<Score>({
    score_system,
    allow_rename: true,
    x,
    width: w,
    y,
    height: game_height - y,
    z: Z.UI,
    size: text_height,
    line_height: text_height + 2,
    level_index: 0,
    columns: SCORE_COLUMNS,
    scoreToRow: myScoreToRowCampaign,
    style_score,
    style_me,
    style_header,
    color_line: palette[3],
    color_me_background: palette[0],
    rename_button_size: 12,
  });

  x = game_width/2 + 1;
  y -= LINEH;
  font.draw({
    color: palette_font[0],
    x, y, w,
    text: 'Endless',
    align: ALIGN.HCENTER,
  });
  y += LINEH;
  scoresDraw<Score>({
    score_system,
    allow_rename: false,
    x,
    width: w,
    y,
    height: game_height - y,
    z: Z.UI,
    size: text_height,
    line_height: text_height + 2,
    level_index: 1,
    columns: SCORE_COLUMNS_ENDLESS,
    scoreToRow: myScoreToRowEndless,
    style_score,
    style_me,
    style_header,
    color_line: palette[3],
    color_me_background: palette[0],
    rename_button_size: 7,
  });

  if (game_state) {
    let button_w = CHW * 22;
    if (buttonText({
      x: game_width - button_w - 1,
      w: button_w,
      y: game_height - BUTTON_H - 8,
      text: 'Play ENDLESS MODE...',
    })) {
      game_state.endless_enabled = true;
      queueTransition();
      engine.setState(stateDroneConfig);
    }
  }
}

export function main(): void {
  if (engine.DEBUG) {
    // Enable auto-reload, etc
    netInit({ engine });
  }

  // const font_info_04b03x2 = require('./img/font/04b03_8x2.json');
  // const font_info_04b03x1 = require('./img/font/04b03_8x1.json');
  const font_info_ibm = require('./img/font/ibm8x8x1.json');
  let pixely = 'strict';
  let font_def;
  let ui_sprites;
  let pixel_perfect = 0.75;
  font_def = { info: font_info_ibm, texture: 'font/ibm8x8x1' };
  ui_sprites = spriteSetGet('pixely');

  if (!engine.startup({
    game_width,
    game_height,
    pixely,
    font: font_def,
    viewport_postprocess: false,
    antialias: false,
    ui_sprites,
    pixel_perfect,
    ui_sounds: {
      rollover: { file: 'rollover', volume: 0.05 },
      button_click: { file: 'button_click' },
      button_click1: { file: 'button_click1' },
      button_click2: { file: 'button_click' },
      button_click3: { file: 'button_click2' },
      launch: { file: 'launch' },
      damage1: { file: 'damage1' },
      damage2: { file: 'damage2' },
      damage3: { file: 'damage3' },
      damage4: { file: 'damage4' },
      study: { file: 'study' },
      dismantle: { file: 'dismantle' },
      sell: { file: 'sell' },
      success: { file: 'success' },
      failure: { file: 'failure' },
      bonus_down: { file: 'bonus_down' },
      wind: { file: 'wind', volume: 0.25 },
    },
  })) {
    return;
  }
  // let font = engine.font;
  v4copy(engine.border_clear_color, palette[0]);
  v4copy(engine.border_color, palette[0]);
  font = uiGetFont();
  setFontStyles(style_text, null, null, null);

  // Perfect sizes for pixely modes
  scaleSizes(13 / 32);
  setButtonHeight(BUTTON_H);
  setFontHeight(8);
  uiSetPanelColor(unit_vec);
  buttonSetDefaultYOffs({
    'down': 1,
  });
  markdownSetColorStyle('dwarfs', style_dwarfs);
  markdownSetColorStyle(1, fontStyleColored(null, palette_font[1]));
  markdownSetColorStyle(2, fontStyleColored(null, palette_font[2]));
  markdownSetColorStyle(3, fontStyleColored(null, palette_font[3]));

  init();

  stateTitleInit();
  engine.setState(stateTitle);
  if (engine.DEBUG && !true) {
    if (game_state) {
      engine.setState(stateDroneConfig);
    } else {
      startNewGame();
    }
    tut_state = 999;
    //startMining();
  } else if (engine.DEBUG && true) {
    engine.setState(stateTitle);
  }
}
