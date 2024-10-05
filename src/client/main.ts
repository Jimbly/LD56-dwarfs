/*eslint global-require:off*/
/* eslint @typescript-eslint/no-use-before-define: ["error",{functions:false}]*/
// eslint-disable-next-line import/order
const local_storage = require('glov/client/local_storage');
local_storage.setStoragePrefix('LD56'); // Before requiring anything else that might load from this

import { autoResetSkippedFrames } from 'glov/client/auto_reset';
import { autoAtlas } from 'glov/client/autoatlas';
import * as camera2d from 'glov/client/camera2d';
import * as engine from 'glov/client/engine';
import {
  getFrameIndex,
  getFrameTimestamp,
} from 'glov/client/engine';
import {
  ALIGN,
  FontDrawOpts,
  fontStyle,
  fontStyleColored,
  vec4ColorFromIntColor,
} from 'glov/client/font';
import {
  KEYS,
  keyDown,
  mouseDownAnywhere,
} from 'glov/client/input';
import { netInit } from 'glov/client/net';
import { shaderCreate } from 'glov/client/shaders';
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
  buttonSetDefaultYOffs,
  buttonText,
  buttonWasFocused,
  drawBox,
  drawHBox,
  drawRect,
  drawVBox,
  panel,
  scaleSizes,
  setButtonHeight,
  setFontHeight,
  uiButtonHeight,
  uiGetFont,
  uiSetPanelColor,
  uiTextHeight,
} from 'glov/client/ui';
import {
  randCreate,
  shuffleArray,
} from 'glov/common/rand_alea';
import { clamp, lerp, map01, plural } from 'glov/common/util';
import {
  unit_vec,
  v4copy,
  vec4,
} from 'glov/common/vmath';

const { abs, ceil, floor, max, min, round } = Math;

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

const INFO_PANEL_W = 118;
const INFO_PANEL_H = 49;

const GOAL_SCORE = 75000;

// Mining minigame balance
const MIN_PROGRESS = 0.01; // if speed=0, still advance by this much
const PROGRESS_SPEED = 0.0001;
const ACCEL_MAX = 0.0005;
const ACCEL_MIN = -1.5; // relative to ACCEL_MAX
const ACCEL_SPEED = 0.01;
const DECEL_SPEED = 0.01;
const DAMAGE_RATE = 0.002;
const AMBIENT_DAMAGE_RATE = 0.000015;


let rand = randCreate(1234);

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

type ExoticDef = {
  name: string;
  knobs: number[];
  value: number;
  total_value: number;
  total_found: number;
  knowledge: number;
  knob_order: number[];
};
type RecentRecord = {
  exotic: number;
  knobs: number[];
  value: number;
};

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
    if (diff === 2) {
      ++diff; // 0/1/3
    }
    let match = 3 - diff; // 0/2/3
    let weight = (ii < 2) === !for_value ? 4 : 1;
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

class GameState {

  level_idx = 1;
  game_score = 0;
  constructor() {
    this.initLevel(1234);
    if (engine.DEBUG && true) {
      for (let ii = 0; ii < 23; ++ii) {
        this.findExoticDebug();
      }
    }
  }

  findExoticDebug(): void {
    this.findExotic();
    let recent = this.recent_exotics[0];
    let exotic = this.exotics[recent.exotic];
    if (exotic.knowledge < NUM_KNOBS) {
      exotic.knowledge++;
    }
    this.level_score += recent.value;
    this.game_score += recent.value;
    this.probes_left--;
  }


  level_score!: number;
  probes_left!: number;
  probe_config!: number[];
  exotics!: ExoticDef[];
  recent_exotics!: RecentRecord[];
  survey_bonus!: number;
  survey_done!: boolean;
  initLevel(seed: number): void {
    rand.reseed(seed);
    this.level_score = 0;
    this.probes_left = 24;
    this.survey_bonus = 1500;
    this.survey_done = false;
    this.probe_config = [];

    for (let ii = 0; ii < NUM_KNOBS; ++ii) {
      this.probe_config.push(1);
    }

    let num_exotics = 4;
    let exotics: ExoticDef[] = [];
    for (let ii = 0; ii < num_exotics; ++ii) {
      let exotic: ExoticDef = {
        name: randomExoticName(),
        knobs: [],
        value: 5 + rand.range(94),
        total_value: 0,
        total_found: 0,
        knowledge: 0,
        knob_order: [],
      };
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

  findExotic(): void {
    let { exotics, probe_config } = this;
    let options = [];
    let total_w = 0;
    for (let ii = 0; ii < exotics.length; ++ii) {
      let exotic = exotics[ii];
      let match_info = matchInfo(exotic, probe_config, false);
      let w = match_info.exact;
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
    let v = rand.random() * rand.random() * (b - a) + a;
    while (rand.random() < c) {
      v += rand.floatBetween(0.5, 1);
    }

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
    };

    exotic.total_value += recent.value;
    exotic.total_found++;

    this.recent_exotics.splice(0, 0, recent);
  }
}

let sprite_toggles: Sprite;
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
  shader_dither = shaderCreate('shaders/dither.fp');
  shader_dither_transition = shaderCreate('shaders/dither_transition.fp');
  shader_gas_giant = shaderCreate('shaders/test.fp');
  game_state = new GameState();
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

const KNOB_W = 9;

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
  let font = uiGetFont();
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
    let yy = y + 5;
    // TODO: exotic icons
    font.draw({
      style: style_text,
      x: xx,
      y: yy,
      z,
      text: ` ${exotic.name}`,
    });
    if (show_match) {
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
    yy += LINEH;
    yy--;
    drawBox({
      x: x + 7,
      y: yy,
      z,
      w: INFO_PANEL_W - 7*2,
      h: 3,
    }, autoAtlas('game', 'progress_bar'), 1);
    z++;
    if (exotic.knowledge) {
      let bar_w = INFO_PANEL_W - 7*2;
      if (exotic.knowledge < NUM_KNOBS) {
        bar_w = floor(exotic.knowledge / NUM_KNOBS * bar_w);
      }
      drawBox({
        x: x + 7,
        y: yy,
        z,
        w: bar_w,
        h: 3,
      }, autoAtlas('game', 'progress_fill'), 1);
    }
    z++;
    yy += 4;

    for (let jj = 0; jj < NUM_KNOBS; ++jj) {
      let xxx = xx + CHW + jj * CHW * 2;
      font.draw({
        style: style_text,
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
  y += INFO_PANEL_H;
  return y;
}

let bg_time = 0;
let bg_dither_uvs = vec4();
let bg_xoffs = 0;
function drawBG(dt: number, h: number): void {
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
  sprite_dither.draw({
    x: 0, y: 0, z: 1,
    w: game_width, h: game_height,
    shader: shader_gas_giant,
    shader_params: {
      params: [1, 1, 1, bg_time * time_scale],
      uvscale: [game_width/(2*zoom)/dither_uvs[2], uv_scale_y, 0.1, 0],
      c0: palette[0],
      c1: palette[1],
      c2: palette[2],
      c3: palette[3],
    },
    color: palette[0],
    uvs: bg_dither_uvs,
  });

  let blimp_y_base = 100 - hoffs_float*3;
  let blimp_y = blimp_y_base + Math.sin(getFrameTimestamp() * 0.005) * 4;
  autoAtlas('game', 'blimp').draw({
    x: 157 + bg_xoffs,
    y: blimp_y,
    z: 3,
    w: 80,
    h: 37,
  });

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
  outline_width: 5.25,
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

function stateDroneConfig(dt: number): void {
  let font = uiGetFont();
  gl.clearColor(palette[PALETTE_BG][0], palette[PALETTE_BG][1], palette[PALETTE_BG][2], 1);

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
  panel({
    x, y, z,
    w,
    h: CONFIGURE_PANEL_H,
    eat_clicks: false,
  });
  z++;
  y += 8;

  font.draw({
    text: 'Configure DWARF',
    style: style_text,
    align: ALIGN.HCENTER,
    x, y,
    w,
  });
  y += LINEH + 2;

  x += 7;
  w -= 7 * 2;
  let { probe_config, exotics, recent_exotics } = game_state;
  for (let ii = 0; ii < NUM_KNOBS; ++ii) {
    font.draw({
      style: style_text,
      x, y, z,
      text: `${KNOBS[ii]}:`,
    });
    let xx = x + w - KNOB_W * 3;
    for (let jj = 0; jj < 3; ++jj) {
      let ret = button({
        x: xx, y,
        w: KNOB_W,
        h: KNOB_W,
        no_bg: true,
        text: ' ',
        disabled: probe_config[ii] === jj || disabled,
      });
      if (ret) {
        probe_config[ii] = jj;
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
  for (let ii = 0; ii < exotics.length; ++ii) {
    let exotic = exotics[ii];

    y = drawExoticInfoPanel({
      x, y,
      z: Z.UI,
      exotic,
      style: ii === 0 ? 'panel_info' : 'panel_info_overlay',
      show_match: true,
      allow_undiscovered: true
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

      // TODO: exotic icons
      font.draw({
        style: style_text,
        x, y, z,
        text: ` ${exotic.name}`,
      });
      font.draw({
        color: palette_font[1],
        x: x + CHW * 7,
        y, z,
        text: `$${recent.value}`,
      });
      y += LINEH;
      font.draw({
        color: palette_font[1],
        x, y, z,
        text: 'DWARFS:',
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

  let button_w = 95;
  y = 164;
  z = Z.UI;
  if (!disabled) {
    if (buttonText({
      x: floor((game_width - button_w)/2),
      y, z,
      w: button_w,
      disabled,
      text: game_state.probes_left ? 'LAUNCH!' : 'Next Planet',
      hotkey: KEYS.SPACE,
    })) {
      if (game_state.probes_left) {
        game_state.probes_left--;
        startMining();
      } else {
        queueTransition();
        game_state.initLevel(game_state.level_idx++);
      }
    }
  }
  y += uiButtonHeight() + 2;
  if (!disabled) {
    drawNonPanel({
      color: palette_font[3],
      x: 0, y, z,
      w: game_width,
      align: ALIGN.HCENTER,
      text: `${game_state.probes_left} ${plural(game_state.probes_left, 'Probe')} left`,
    });
  }

  z = Z.UI;
  y = game_height - LINEH * 2 - 1;
  drawNonPanel({
    color: palette_font[3],
    x: 1, y, z,
    text: `$${game_state.level_score} Planet Score`,
  });
  y += LINEH;
  drawNonPanel({
    color: palette_font[3],
    x: 1, y, z,
    text: `$${game_state.game_score}/$${GOAL_SCORE} Campaign`,
  });

  y = game_height - LINEH - 1;
  let total_knowledge = 0;
  for (let ii = 0; ii < exotics.length; ++ii) {
    total_knowledge += exotics[ii].knowledge;
  }
  if (total_knowledge >= 0.8 * NUM_KNOBS * exotics.length && !game_state.survey_done) {
    button_w = 106;
    if (button({
      x: game_width - 1 - button_w - 4,
      y: game_height - 1 - uiButtonHeight(),
      z,
      w: button_w,
      text: `Claim $${game_state.survey_bonus}`,
    })) {
      game_state.survey_done = true;
      game_state.level_score += game_state.survey_bonus;
      game_state.game_score += game_state.survey_bonus;
    }
  } else {
    drawNonPanel({
      color: palette_font[3],
      x: 1, y, z,
      w: game_width - 1,
      align: ALIGN.HRIGHT,
      text: game_state.survey_done ? 'Survey Bonus Claimed' : `Survey Bonus: $${game_state.survey_bonus}`,
    });
  }
}

let mining_state: {
  progress: number;
  speed: number;
  accel: number;
  stress: number;
  danger: number;
  danger_target: number;
  danger_target_time: number;
  done: boolean;
};

let mining_result_state: {
  stage: string; // study, stud_anim, choice, dismantle_anim, sell_anim
  is_new: boolean;
  t: number;
  knowledge_start: number;
  done: boolean;
  value_given: number;
};
const RESULT_W = INFO_PANEL_W + 40;
const STUDY_ANIM_TIME = 1000;
const SELL_ANIM_TIME = 1000;
let mr_ymax = 0;
function doMiningResult(dt: number): boolean {
  let font = uiGetFont();
  if (!mining_state || mining_state.stress >= 1) {
    return false;
  }

  let { recent_exotics, exotics } = game_state;
  let recent = recent_exotics[0];
  let exotic = exotics[recent.exotic];
  let knowledge = exotic.knowledge;
  if (autoResetSkippedFrames('mining_result')) {
    mining_result_state = {
      is_new: knowledge === 0,
      stage: knowledge === NUM_KNOBS ? 'choice' : 'study',
      t: 0,
      knowledge_start: knowledge,
      done: false,
      value_given: 0,
    };
  }
  if (mining_result_state.done) {
    return false;
  }

  mining_result_state.t += dt;

  if (mining_result_state.stage === 'study_anim' || mining_result_state.stage === 'dismantle_anim') {
    if (mining_result_state.t >= STUDY_ANIM_TIME) {
      exotic.knowledge = mining_result_state.knowledge_start + 1;
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
    let expected_given = floor(recent.value * min(mining_result_state.t / SELL_ANIM_TIME, 1));
    let left = expected_given - mining_result_state.value_given;
    mining_result_state.value_given = expected_given;
    game_state.level_score += left;
    game_state.game_score += left;
    if (mining_result_state.t >= SELL_ANIM_TIME) {
      mining_result_state.done = true;
    }
  }
  if (mining_result_state.stage === 'choice' && exotic.knowledge === NUM_KNOBS) {
    mining_result_state.stage = 'sell_anim';
    mining_result_state.t = 0;
  }

  let x = floor((game_width - RESULT_W)/2);
  const x0 = x;
  let y = 30;
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

  font.draw({
    style: style_text,
    x, y, z,
    w,
    align: ALIGN.HCENTER,
    text: `Value: $${recent.value}`,
  });
  y += LINEH + 2;

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
      text: `Sell this Exotic for $${recent.value}.`,
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
let over_danger_time = 0;
function stateMine(dt: number): void {
  dt = min(dt, 200);
  let font = uiGetFont();
  gl.clearColor(palette[PALETTE_BG][0], palette[PALETTE_BG][1], palette[PALETTE_BG][2], 1);

  drawBG(dt, mining_state.progress);

  let do_accel = keyDown(KEYS.SPACE) || mouseDownAnywhere();
  let maxp = 1; // (0.7 + game_state.probe_config[0] * 0.3);
  let do_flicker = false;
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
      game_state.findExotic();
      transition_time = 0;
    } else {
      if (mining_state.progress >= mining_state.danger_target_time) {
        mining_state.danger_target_time += rand.floatBetween(0.05, 0.15);
        mining_state.danger_target = rand.floatBetween(0, 0.8);
      }
      let time_to_target = mining_state.danger_target_time - mining_state.progress;
      if (time_to_target > 0) {
        let danger_to_target = mining_state.danger_target - mining_state.danger;
        mining_state.danger += min(dprogress / time_to_target, 1) *
          danger_to_target;
      }
    }

    let over_danger = max(0, mining_state.speed - (1 - mining_state.danger));
    if (over_danger && !mining_state.done) {
      over_danger = 0.1 + over_danger;
      mining_state.stress += over_danger * DAMAGE_RATE * dt;
      mining_state.stress = clamp(mining_state.stress, 0, 1);
      over_danger_time += dt;
      do_flicker = true;
    } else if (!mining_state.done) {
      // minimal stress accumulation based on real time
      mining_state.stress += AMBIENT_DAMAGE_RATE * dt;
      mining_state.stress = clamp(mining_state.stress, 0, 1);
    } else {
      over_danger_time = 0;
    }
    if (engine.DEBUG && keyDown(KEYS.L)) {
      mining_state.stress += dt * 0.01;
    }
    if (mining_state.stress >= 1) {
      mining_state.done = true;
      transition_time = 0;
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

  function drawVBar(style: string, x: number, y: number, label: string, p: number): void {
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
    y += BAR_LONG_SIZE + 3;

    let x_mid = x + BAR_SHORT_SIZE/2;
    let text_w = font.draw({
      style: style_text,
      x: x_mid,
      y: y + 6,
      z: z + 1,
      w: 0,
      align: ALIGN.HCENTER,
      text: label,
    });
    text_w += 7 * 2;
    panel({
      x: x_mid - ceil(text_w/2),
      y,
      z,
      w: text_w,
      h: CHH + 12,
    });
    y += CHH + 7;
    z+=2;
  }

  let hbar_x = (game_width - BAR_LONG_SIZE) / 2;
  // let hbar_x = 64;
  drawHBar(hbar_x, 8, 'Progress', mining_state.progress / maxp);
  let vbar_y = 54;
  let flicker = do_flicker ? over_danger_time % 200 < 100 : false;
  let x0 = 186;
  let x1 = x0 + 59;
  let x2 = x1 + 59;
  let armor_flicker = mining_state.stress > 0.9 ? getFrameTimestamp() % 200 < 100 : false;
  drawVBar(armor_flicker ? 'vbar' : 'vbar2', x0, vbar_y, 'Armor', 1 - mining_state.stress);
  drawVBar(flicker ? 'vbar' : 'vbar2', x1, vbar_y, 'Speed', mining_state.speed);
  drawVBar(flicker ? 'vbar2' : 'vbar', x2, vbar_y,
    'Safety', 1 - mining_state.danger);
}

function startMining(): void {
  engine.setState(stateMine);
  let danger_init = rand.floatBetween(0.25, 0.75);
  mining_state = {
    progress: 0,
    speed: 0.5,
    accel: 0,
    stress: 0,
    danger: 0,
    danger_target: danger_init,
    danger_target_time: 0.1,
    done: false,
  };
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
  })) {
    return;
  }
  // let font = engine.font;
  v4copy(engine.border_color, palette[PALETTE_BG]);

  // Perfect sizes for pixely modes
  scaleSizes(13 / 32);
  setButtonHeight(15);
  setFontHeight(8);
  uiSetPanelColor(unit_vec);
  buttonSetDefaultYOffs({
    'down': 1,
  });

  init();

  engine.setState(stateDroneConfig);
  if (engine.DEBUG && false) {
    startMining();
  }
}
