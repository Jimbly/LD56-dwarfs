/*eslint global-require:off*/
// eslint-disable-next-line import/order
const local_storage = require('glov/client/local_storage');
local_storage.setStoragePrefix('LD56'); // Before requiring anything else that might load from this

import { autoAtlas } from 'glov/client/autoatlas';
import * as engine from 'glov/client/engine';
import {
  ALIGN,
  fontStyleColored,
  vec4ColorFromIntColor,
} from 'glov/client/font';
import {
  KEYS,
  keyDown,
  mouseDownAnywhere,
} from 'glov/client/input';
import { netInit } from 'glov/client/net';
import { spriteSetGet } from 'glov/client/sprite_sets';
import {
  Sprite,
  spriteCreate,
} from 'glov/client/sprites';
import {
  button,
  buttonSetDefaultYOffs,
  buttonText,
  buttonWasFocused,
  drawBox,
  drawHBox,
  drawVBox,
  panel,
  scaleSizes,
  setButtonHeight,
  setFontHeight,
  uiButtonHeight,
  uiGetFont,
  uiSetPanelColor,
} from 'glov/client/ui';
import {
  randCreate,
  shuffleArray,
} from 'glov/common/rand_alea';
import { clamp, plural } from 'glov/common/util';
import {
  unit_vec,
  v4copy,
  vec4,
} from 'glov/common/vmath';

const { ceil, floor, max, min, round } = Math;

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
const CONFIGURE_PANEL_W = 138;
const CONFIGURE_PANEL_H = 71;

let rand = randCreate(1234);

const KNOBS = [
  'Frequency',
  'Resonance',
  'Density',
  'Luminance',
  'SurvyDpth',
];
const NUM_KNOBS = KNOBS.length;

type MineralDef = {
  name: string;
  knobs: number[];
  value: number;
  total_value: number;
  total_found: number;
  knowledge: number;
  knob_order: number[];
};
type RecentRecord = {
  mineral: number;
  knobs: number[];
  value: number;
};

function randomMineralName(): string {
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

class GameState {

  game_score = 0;
  constructor() {
    this.initLevel(1234);
  }

  level_score!: number;
  probes_left!: number;
  probe_config!: number[];
  minerals!: MineralDef[];
  recent_minerals!: RecentRecord[];
  initLevel(seed: number): void {
    rand.reseed(seed);
    this.level_score = 0;
    this.probes_left = 24;
    this.probe_config = [];

    for (let ii = 0; ii < NUM_KNOBS; ++ii) {
      this.probe_config.push(1);
    }

    let num_minerals = 4;
    let minerals: MineralDef[] = [];
    for (let ii = 0; ii < num_minerals; ++ii) {
      let mineral: MineralDef = {
        name: randomMineralName(),
        knobs: [],
        value: 5 + rand.range(94),
        total_value: ii < 2 ? 77 : 0,
        total_found: ii < 2 ? 1 : 0,
        knowledge: ii === 0 ? 90 : ii === 1 ? 20 : 0,
        knob_order: [],
      };
      for (let jj = 0; jj < NUM_KNOBS; ++jj) {
        mineral.knobs.push(rand.range(3));
        mineral.knob_order.push(jj);
      }
      shuffleArray(rand, mineral.knob_order);
      minerals.push(mineral);
    }
    this.minerals = minerals;

    this.recent_minerals = [];
  }
}

let sprite_toggles: Sprite;
let game_state: GameState;
function init(): void {
  sprite_toggles = spriteCreate({
    name: 'toggles',
    ws: [9, 9, 9],
    hs: [9, 9, 9, 9, 9],
  });
  game_state = new GameState();
}

let style_text = fontStyleColored(null, palette_font[PALETTE_TEXT]);

const KNOB_W = 9;

function stateDroneConfig(dt: number): void {
  let font = uiGetFont();
  gl.clearColor(palette[PALETTE_BG][0], palette[PALETTE_BG][1], palette[PALETTE_BG][2], 1);

  let x = (game_width - CONFIGURE_PANEL_W) / 2;
  let y = 18;
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
    text: 'Configure Probe',
    style: style_text,
    align: ALIGN.HCENTER,
    x, y,
    w,
  });
  y += LINEH + 2;

  x += 7;
  w -= 7 * 2;
  let { probe_config, minerals } = game_state;
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
        disabled: probe_config[ii] === jj,
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
  }

  w = INFO_PANEL_W;
  x = game_width - 1 - w;
  y = 1;
  z = Z.UI;
  font.draw({
    color: palette_font[3],
    x, y, z, w,
    text: 'Minerals',
    align: ALIGN.HCENTER,
  });
  y += LINEH;
  for (let ii = 0; ii < minerals.length; ++ii) {
    let mineral = minerals[ii];
    z = Z.UI;
    w = INFO_PANEL_W;
    panel({
      x, y, z,
      w,
      h: INFO_PANEL_H,
      sprite: autoAtlas('game', ii === 0 ? 'panel_info' : 'panel_info_overlay'),
      eat_clicks: false,
    });
    z++;

    if (!mineral.knowledge) {
      font.draw({
        color: palette_font[1],
        x, y, z, w,
        h: INFO_PANEL_H,
        align: ALIGN.HVCENTER|ALIGN.HWRAP,
        text: 'Undiscovered\nMineral',
      });
    } else {
      let xx = x + 7;
      w -= 7 * 2;
      let yy = y + 5;
      // TODO: mineral icons
      font.draw({
        style: style_text,
        x: xx,
        y: yy,
        z,
        text: ` ${mineral.name}`,
      });
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
      if (mineral.knowledge) {
        let bar_w = INFO_PANEL_W - 7*2;
        if (mineral.knowledge < 100) {
          bar_w = floor(mineral.knowledge / 100 * bar_w);
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
          text: KNOBS[jj][0],
        });
        let known = 'todo';
        sprite_toggles.draw({
          x: xxx - 1,
          y: yy + CHH,
          w: KNOB_W, h: KNOB_W,
          frame: known ? mineral.knobs[jj] + 3 : 12,
        });
      }
      yy += LINEH * 2;
      font.draw({
        style: style_text,
        x: xx,
        y: yy,
        text: `Avg Val: $${round(mineral.total_value / mineral.total_found)}`,
      });
      yy += LINEH;
    }
    y += INFO_PANEL_H - 5;
  }

  // TODO: recent results

  let button_w = 95;
  y = 164;
  z = Z.UI;
  if (buttonText({
    x: floor((game_width - button_w)/2),
    y, z,
    w: button_w,
    text: game_state.probes_left ? 'LAUNCH!' : 'Next Planet',
  })) {
    game_state.probes_left--;
    startMining(); // eslint-disable-line @typescript-eslint/no-use-before-define
  }
  y += uiButtonHeight() + 2;
  font.draw({
    color: palette_font[3],
    x: 0, y, z,
    w: game_width,
    align: ALIGN.HCENTER,
    text: `${game_state.probes_left} ${plural(game_state.probes_left, 'Probe')} left`,
  });

  // TODO: game_score
  // TODO: level_score
  // TODO: survey bonus
}

let mining_state: {
  progress: number;
  speed: number;
  accel: number;
  stress: number;
  danger: number;
  danger_target: number;
  danger_target_time: number;
};

const BAR_LONG_SIZE = 120;
const BAR_SHORT_SIZE = 10;
let over_danger_time = 0;
function stateMine(dt: number): void {
  dt = min(dt, 200);
  let font = uiGetFont();
  gl.clearColor(palette[PALETTE_BG][0], palette[PALETTE_BG][1], palette[PALETTE_BG][2], 1);


  if (keyDown(KEYS.SPACE) || mouseDownAnywhere()) {
    mining_state.accel += dt * 0.01;
  } else {
    mining_state.accel -= dt * 0.01;
  }
  mining_state.accel = clamp(mining_state.accel, -1, 1);

  mining_state.speed += mining_state.accel * dt * 0.0005;
  mining_state.speed = clamp(mining_state.speed, 0, 1);
  if (!mining_state.speed) {
    mining_state.accel = 0;
  } else if (mining_state.speed === 1) {
    mining_state.accel = 0;
  }

  let dprogress = mining_state.speed * dt * 0.0001;
  mining_state.progress += dprogress;
  let maxp = (0.5 + game_state.probe_config[4] * 0.5);
  mining_state.progress = clamp(mining_state.progress, 0, maxp);

  if (mining_state.progress === maxp) {
    // TODO: win!
    engine.setState(stateDroneConfig);
  } else {
    if (mining_state.progress >= mining_state.danger_target_time) {
      mining_state.danger = mining_state.danger_target;
      mining_state.danger_target_time += rand.floatBetween(0.05, 0.15);
      mining_state.danger_target = rand.floatBetween(0, 0.9);
    }
    let time_to_target = mining_state.danger_target_time - mining_state.progress;
    if (time_to_target > 0) {
      let danger_to_target = mining_state.danger_target - mining_state.danger;
      mining_state.danger += dprogress / time_to_target * danger_to_target;
    }
  }

  let over_danger = max(0, mining_state.speed - (1 - mining_state.danger));
  if (over_danger) {
    over_danger = 0.1 + over_danger;
    mining_state.stress += over_danger * 0.001 * dt;
    over_danger_time += dt;
  } else {
    over_danger_time = 0;
  }
  if (mining_state.stress >= 1) {
    // TODO: crash!
    engine.setState(stateDroneConfig);
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
      h: CHH + 11,
    });
    y += CHH + 7;
    z+=2;
  }

  let hbar_x = (game_width - BAR_LONG_SIZE) / 2;
  // let hbar_x = 64;
  drawHBar(hbar_x, 8, 'Progress', mining_state.progress / maxp);
  drawHBar(hbar_x, 174, 'Stress', mining_state.stress);
  let vbar_y = 42;
  let vbar_xoffs = 12;
  let flicker = over_danger ? over_danger_time % 200 < 100 : false;
  drawVBar(flicker ? 'vbar' : 'vbar2', 268 + vbar_xoffs, vbar_y, 'Speed', mining_state.speed);
  drawVBar(flicker ? 'vbar2' : 'vbar', game_width - BAR_SHORT_SIZE - 4*2 - 36 + vbar_xoffs, vbar_y,
    'Safety', 1 - mining_state.danger);
}

function startMining(): void {
  engine.setState(stateMine);
  let danger_init = rand.floatBetween(0.25, 0.75);
  mining_state = {
    progress: 0,
    speed: 0,
    accel: 0,
    stress: 0,
    danger: 0,
    danger_target: danger_init,
    danger_target_time: 0.1,
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
  if (engine.DEBUG) {
    startMining();
  }
}
