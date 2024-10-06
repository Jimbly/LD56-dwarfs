LD56 - Tiny Creatures
============================

Ludum Dare 56 Entry by Jimbly - "DWARFS"

* Play here: [dashingstrike.com/LudumDare/LD56/](http://www.dashingstrike.com/LudumDare/LD56/)
* Using [Javascript libGlov/GLOV.js framework](https://github.com/Jimbly/glovjs)

Acknowledgements:
* [IBM BIOS Font](https://int10h.org/oldschool-pc-fonts/fontlist/font?ibm_bios)
* [BGB Gameboy Palette](https://lospec.com/palette-list/nintendo-gameboy-bgb)
* Maybe [CGA MIBEND4 Palette](https://lospec.com/palette-list/cga-mibend4)
* Warp shader derived from [shadertoy/lsl3RH](https://www.shadertoy.com/view/lsl3RH)

Start with: `npm start` (after running `npm i` once)

Visuals
  Eyes / snakes

Gas Giant Game Plan
  Stats:
    Rare minerals (4 per world?)
      % surveyed
      4-6 knob stats
      avg value
      match percentage
      maybe: num found, value found
    Current score
      Bonus for complete survey
    Last ~4 finds
      What our settings were, and what we got, and what its value is
  Configure Drone
    4 Knobs: Freq, Resonance, Density, Brightness
    launch depth high/med/low alt?
    launch region: stormy / windy / calm?
  Launch! button
  Mining screen
    adjust speed
    view progress
    view stress
    view danger
    visuals while descending

Ideas:
# Gas Giant Surveying
Art:
  drone
  gas giant bg / minerals
  that's it?
Gameplay:
  status / launch screen
    view rare minerals & survey status of each
    select and configure drones and launch depth
    show much many drones are left
    launch button
  mining screen
    adjust speed, trigger explosion
    view hp
    visuals while descending

# Critterz
Art:
  4-5 critters broken into parts (problem, how make cute, me no art good!)
  nodes / connectors
Gameplay:
  zoomable infinite-ish playing field with output node and critter nodes
  click/drag to connect nodes
  click empty space to place a new node (menu with options)
  simulation that moves critters around
  current goal display and progress
  (stretch) upgrades (or, goals just do upgrades?)

# Creeper World vs Slimes
Art:
  Slimes
  nodes/weapons
  terrain (just colors?)
Gameplay:
  place nodes/weapons
  simulation
  multiple levels (probably all hand-designed)
  interesting weapon choices?
