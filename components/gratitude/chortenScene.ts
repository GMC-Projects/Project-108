/**
 * The scene behind /gratitude: the real Mau Chhu valley at Gelephu, with the
 * night's lights on it.
 *
 *  - valley.glb (scripts/valley): the terrain from the Copernicus 30 m
 *    elevation model, painted here from Poly Haven textures by height, slope
 *    and the Mau Chhu's gravel bed. site.ts, baked alongside, holds where the
 *    108 and the crowd stand.
 *  - the 108 foundations along the Mau Chhu's east bank, each with four
 *    spotlights set in the ground at its corners, shining up into the space
 *    where its chorten will stand
 *  - the crowd: gold lights held by the attendees, in eight gatherings on the
 *    west bank. At 3:00 AM they leave the bank and form one chorten, CHORTEN;
 *    the first 1,265 of them are the contributors' lights, which can be
 *    searched, picked and shared.
 *  - the other 107: solid chortens, turned from 108.bt's chorten outline,
 *    which rise out of their sites as the camera pulls back at the end.
 *
 * A sky dome and the light move with the clock: a clear moonlit night with
 * 108.bt's clouds (indigo, a few stars, clouds lit round the moon), an
 * orange dawn while the chortens are raised, and a clear noon when the
 * camera pulls back to all 108. The pointer swings the camera a little, as
 * on 108.bt's hero.
 *
 * The camera moves between the valley view (from downstream and above,
 * looking back up the valley, as 108.bt opens its own) and a close shot of
 * CHORTEN from across the water. The page owns scroll and time and calls
 * frame() with the story's state.
 */
import * as THREE from "three";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
  mergeGeometries,
  mergeVertices,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { PROFILE, STUPA_ASPECT } from "./valley/chorten-profile";
import { ATTRIBUTION, FEET, bedEdge, groundAt } from "./valley/site";
import { stoneWest } from "./valley/river";

export { ATTRIBUTION };

export type SceneState = {
  gather: number; // 0 the lights in the hands → 1 all in the mandala in the sky
  descend: number; // 0 in the mandala → 1 the chorten complete
  reveal: number; // contributor lights coming on
  valley: number; // the valley: 1 as it is, 0 graded to the page's maroon and gold
  toValley: number; // camera: 1 the valley view, 0 CHORTEN's close shot
  night: number; // the page's top to the close shot settled, 0..1, straight from the scroll: the camera's one way down the valley and in among the people to one of them
  release: number; // the raising's first part, 0..1: back from the orb, wide to the side
  breath: number; // the chorten complete, 0..1: one slow breath of light up through it
  pulse: number; // a slow wave through the waiting crowd, 0..1
  orbit: number; // the chorten complete, 0..1: the camera comes slowly round it and in (noon, lights)
  stone: number; // CHORTEN's stone rising through its lights, 0..1, the lights going into it
  many: number; // the camera pulls back out and the other 107 rise
  settle: number; // the ending's first part, 0..1: the camera on round the chorten while the night comes back and the stone rises
  daylight: number; // 0 night, through the blue hour, to 1 first light
  fade: number; // 1 visible → 0 hidden, as the record scrolls over
  time: number; // seconds, frozen under reduced motion
  dt: number;
  hold: boolean; // stop turning, e.g. while a chosen light faces the reader
  resting?: boolean; // drawn at a slower rate, nothing having been touched for a while
};

export type ChortenScene = {
  frame(s: SceneState): void;
  resize(): void;
  select(n: number): void;
  setHits(hits: Set<number>): void;
  pickAt(clientX: number, clientY: number): number;
  drag(dx: number): void;
  setDragging(on: boolean): void;
  dispose(): void;
};

/** The chorten the crowd forms: near the middle of the row, the 41st of the
    108 sites (FEET). */
const CHORTEN_SITE = 40;
/* The row as drawn: every ROW_STEP-th site, CHORTEN's own among them. The
   real 108 stood 108 m apart, six chortens' height and more; at the valley's
   scale all 108 crowd the bank, so a third of them, some 54 m apart, give
   the row its breadth. (The camera's way is still set along all 108, FEET.) */
const ROW_STEP = 3;
const SITES = FEET.filter((_, i) => (i - CHORTEN_SITE) % ROW_STEP === 0);
/** CHORTEN's place in SITES. */
const CHORTEN = Math.floor(CHORTEN_SITE / ROW_STEP);
/* A chorten's outline is R0 wide at its base and HS tall; on the row it is
   drawn at WALK times that, as 108.bt draws its own. */
const R0 = 0.55;
const HS = R0 * 2 * STUPA_ASPECT;
const WALK = 1.5;
const CHORTEN_H = HS * WALK;

const NIGHT = 0x0d0408; // the page's maroon-night

/* ── The valley's own shading: moonlight, fog, and a fade to the night ── */
const LIT = /* glsl */ `
uniform vec3 uMoon, uMoonCol, uAmbient, uNight, uHaze;
uniform float uFogNear, uFogFar, uShow;
vec3 lit(vec3 base, vec3 n, float depth) {
  vec3 c = base * (uAmbient + uMoonCol * max(dot(n, uMoon), 0.0));
  // Distance pales into the sky's own horizon colour.
  c = mix(c, uHaze, smoothstep(uFogNear, uFogFar, depth));
  return mix(uNight, c, uShow);
}`;

/* 108.bt's ranges: their baked colour, greyed toward the night and lit by
   it, then into the haze with distance (each ring its own share, uFar). */
const PEAK_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying float vDepth;
varying float vY;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vY = (modelMatrix * vec4(position, 1.0)).y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const PEAK_FRAG = /* glsl */ `
uniform vec3 uMoon, uMoonCol, uAmbient, uNight, uHaze;
uniform float uShow, uFar, uDay, uTop, uDim, uHazeK;
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vN;
varying float vDepth;
varying float vY;
// The forest's light and dark over them: the map's own, and its grain at a
// finer scale, so the slopes read as wooded, with clearings, not one smooth
// skin. (Mipmapped both, so from far off it averages, not shimmers.)
float forestMottle(vec2 uv) {
  float a = dot(texture2D(uMap, uv).rgb, vec3(0.3, 0.59, 0.11));
  float b = dot(texture2D(uMap, uv * 5.3 + 0.37).rgb, vec3(0.3, 0.59, 0.11));
  return clamp(a * 0.55 + b * 0.45, 0.0, 1.0);
}
void main() {
  vec3 base = texture2D(uMap, vUv).rgb;
  base = mix(vec3(dot(base, vec3(0.3, 0.59, 0.11))), base, 0.55) * 0.7;
  vec3 n = normalize(vN);
  float lit = max(dot(n, uMoon), 0.0);
  // (By night as by day: the forest's colour, deep, the moon on the slopes
  // turned to it and the rest in shadow, and the haze lying low: in the
  // haze's flat blue they stood as cut-outs.)
  float lumN = forestMottle(vUv);
  vec3 c = vec3(0.16, 0.24, 0.12) * (0.45 + 1.1 * lumN) * (uAmbient * 2.0 + uMoonCol * (0.2 + 1.2 * lit));
  float lowN = 1.0 - smoothstep(0.0, uTop, vY);
  // (Darker than the sky behind them, as hills stand against a moonlit
  // sky, with the moon catching their crests: in the haze's blue they were
  // the sky's own colour, their outline weak.)
  float crest = smoothstep(uTop * 0.6, uTop, vY) * lit;
  c = (c * 0.8 + uMoonCol * crest * 0.12) * uDim;
  float haze = clamp(uFar * 0.55 + lowN * 0.2 + smoothstep(1500.0, 3200.0, vDepth) * 0.15, 0.0, 0.9);
  /* By day, in the sun: their slopes lit and shaded by it, so ridge and
     gully show, and less of the haze on the nearer rings, so the forest's
     colour comes through, thickest low down, where it settles, and
     thinner on the crests; the furthest ring still pale. (In the night's
     haze, kept for the day, they stood as flat blue cut-outs, one behind
     another.) */
  float dayK = smoothstep(0.0, 0.45, uDay);
  // (Their forest green, its light and dark from the baked colour: the
  // baked colour itself is the haze's blue-grey already, and lit, it stayed
  // a cut-out.)
  vec3 forest = vec3(0.16, 0.24, 0.12) * (0.45 + 1.1 * lumN);
  vec3 cDay = forest * (uAmbient * 0.6 + uMoonCol * (0.25 + 1.1 * lit));
  float low = 1.0 - smoothstep(0.0, uTop, vY);
  // (Each ring well paler than the one before it: at near the same haze,
  // the middle and furthest stood as one.)
  float hazeDay = clamp((uFar - 0.38) * 1.7 + low * 0.22 + smoothstep(1500.0, 3200.0, vDepth) * 0.15, 0.0, 0.92);
  c = mix(c, cDay, dayK);
  c = mix(c, uHaze, mix(haze, hazeDay, dayK) * uHazeK);
  gl_FragColor = vec4(mix(uNight, c, uShow), 1.0);
}`;

/* 108.bt's grass and rocks: their colour, greyed by night as the ground is,
   lit from above as the ground under them, hazed with distance; the grass
   swaying a little at its tips, its cut-out edges kept sharp (uCut). */
/* Mist in the low ground: thickest on the valley floor (about 4 to 7 units
   up along the river), gone by 9, so the hills stand clear above it; only
   far off (from 160 units out), a band in the distance, never over the
   ground below the eye; broken into banks, not a sheet. Pale grey, with a
   hint of the low sky's colour (uHaze). TERRAIN_FRAG and PLANT_FRAG. */
const MIST = /* glsl */ `
float mist(vec3 w, float depth) {
  float band = 1.0 - smoothstep(4.0, 9.0, w.y);
  float banks = 0.55 + 0.25 * sin(w.x * 0.021 + sin(w.z * 0.017) * 2.0) + 0.2 * sin(w.z * 0.043 - w.x * 0.011 + 1.3);
  return band * banks * smoothstep(160.0, 600.0, depth) * 0.35;
}
// (Pale and nearly grey, as mist is: silvery by moonlight, a soft warm grey
// at dawn; only a hint of the sky's own colour.)
vec3 mistColour(vec3 sky) {
  float grey = dot(sky, vec3(0.3, 0.59, 0.11));
  return mix(vec3(grey), sky, 0.25) * 1.6;
}`;

const MISTLAYER_VERT = /* glsl */ `
attribute float aUnder;
varying float vUnder;
varying vec3 vW;
varying float vDepth;
void main() {
  vUnder = aUnder;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const MISTLAYER_FRAG = /* glsl */ `
${MIST}
uniform vec3 uHaze, uNight;
uniform float uShow, uDay, uTime, uSolo, uAmt, uFogNear, uFogFar;
varying float vUnder;
varying vec3 vW;
varying float vDepth;
void main() {
  // Thick where the ground lies well under it; none where the land comes up
  // through it (a hillside), so it ends softly, not in a line.
  float thick = smoothstep(0.2, 2.2, vUnder);
  // In banks, drifting slowly down the valley.
  vec2 q = vW.xz * 0.012 + vec2(uTime * 0.004, 0.0);
  float banks = 0.5 + 0.3 * sin(q.x * 3.1 + sin(q.y * 2.3) * 1.7) + 0.2 * sin(q.y * 4.7 - q.x * 1.3 + 1.1);
  // Only off in the distance, and only seen from above it.
  float a = thick * banks * smoothstep(120.0, 520.0, vDepth) * smoothstep(-0.5, 2.0, cameraPosition.y - vW.y);
  // (By day, burning off; and gone once CHORTEN stands alone.)
  a *= uAmt * (1.0 - 0.6 * smoothstep(0.2, 0.9, uDay)) * (1.0 - uSolo) * uShow;
  a *= 1.0 - smoothstep(uFogNear, uFogFar, vDepth);
  if (a < 0.003) discard;
  gl_FragColor = vec4(mistColour(uHaze), a);
}`;

/* The pointer's trail over the meadow, as 108.bt's pollen: specks kicked up
   where it passes, each rising and drifting out a little and fading in
   LIFE seconds, warm gold, glowing. A size in the world (aSize, px by
   uScale over depth, as DOT's), drawn only on the ground near the eye. */
const POLLEN_LIFE = 1.35;
const POLLEN_VERT = /* glsl */ `
attribute vec3 aVel;
attribute float aBirth;
attribute float aSize;
attribute vec3 aCol;
uniform float uTime, uScale, uShow, uPx;
varying vec3 vCol;
varying float vA;
void main() {
  float age = uTime - aBirth;
  float life = ${POLLEN_LIFE.toFixed(2)};
  vA = age >= 0.0 && age < life ? (1.0 - age / life) * smoothstep(0.0, 0.12, age) * uShow : 0.0;
  vCol = aCol;
  float a = max(age, 0.0);
  vec3 p = position + aVel * a;
  p.y += aSize * 1.6 * a * a;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vA > 0.0 ? clamp(aSize * uScale / max(-mv.z, 0.01), 1.0, uPx) : 0.0;
}`;
const POLLEN_FRAG = /* glsl */ `
precision mediump float;
varying vec3 vCol;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.03, 0.5, r)) * vA * 0.28;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol, a);
}`;

/* The pointer's ripples: a square of water RIP_N texels a side, stepped on
   by the wave equation as three.js's gpgpu water and Evan Wallace's WebGL
   Water are: each point's new height from its four neighbours' and its own
   last, a little lost each step. Red the height, green the last. The
   pointer presses the water down along its way since the last frame (uA to
   uB, in the patch's own 0..1, uA.z how wide, uA.w how deep); the patch
   moves under the water by uShift whole texels, so what is on it stays
   where it lies in the world; its edges soak waves up rather than throw
   them back. */
const RIP_N = 256;
const RIP_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uPrev;
uniform vec2 uShift;
uniform vec4 uA, uB;
uniform float uDamp;
varying vec2 vUv;
void main() {
  vec2 e = vec2(1.0 / ${RIP_N}.0);
  vec2 q = vUv + uShift * e;
  vec2 c = texture2D(uPrev, q).rg;
  float n = texture2D(uPrev, q + vec2(0.0, e.y)).r;
  float so = texture2D(uPrev, q - vec2(0.0, e.y)).r;
  float ea = texture2D(uPrev, q + vec2(e.x, 0.0)).r;
  float w = texture2D(uPrev, q - vec2(e.x, 0.0)).r;
  float h = ((n + so + ea + w) * 0.5 - c.g) * uDamp;
  // (Evened out a little toward its neighbours each step: the crests
  // softened, as water's own are.)
  h = mix(h, (n + so + ea + w) * 0.25, 0.04);
  vec2 pa = vUv - uA.xy, ba = uB.xy - uA.xy;
  float k = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-10), 0.0, 1.0);
  float d = length(pa - ba * k);
  if (d < uA.z) h -= (cos(d / uA.z * 3.14159) + 1.0) * 0.5 * uA.w;
  vec2 m = min(vUv, 1.0 - vUv);
  h *= mix(0.9, 1.0, smoothstep(0.0, 0.08, min(m.x, m.y)));
  gl_FragColor = vec4(h, c.r, 0.0, 1.0);
}`;

const TERRAIN_VERT = /* glsl */ `
attribute vec3 color;
// (TERRAIN_FRAG's river map: red its water, green its gravel; over uRiverBox.)
uniform sampler2D uRiver;
uniform vec4 uRiverBox;
uniform float uRiverOn;
varying float vBed;
varying float vAcross;
varying vec3 vN;
varying vec3 vW;
varying float vDepth;
// (How far down the bank, 0 to 1, how steep it falls there, and which
// way: the sink's gradient.)
varying float vSink;
varying float vSteep;
varying vec2 vFall;
// (TERRAIN_FRAG's zones down the bank: bankAt.)
varying vec2 vBank;
// (The bank's baked light, uBankShade's green and blue.)
varying vec3 vBankLight;
float riverAt(vec2 p, float ch) {
  vec2 u = vec2((p.x - uRiverBox.x) / (uRiverBox.z - uRiverBox.x), (uRiverBox.w - p.y) / (uRiverBox.w - uRiverBox.y));
  if (u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0) return 0.0;
  vec4 r = texture2D(uRiver, u);
  return ch < 0.5 ? r.r : r.r + r.g;
}
// The banks (scripts/valley/bake_bank.py, over uRiverBox). uBank: red and
// green the way into the stone from the grass (whole tenths of a unit and
// their fraction), blue the way to the water. uBankShade, the bank's own
// shape and its light, baked in Blender (bake_bank_shade.py): red how far
// the ground falls below the meadow (0 to 2 units), green how open it is to
// the sky, blue lit by the moon (0 in the cut's shadow). The river's bed
// lies level with the meadow in the land's heights, so it is cut here.
uniform sampler2D uBank, uBankShade;
const float BED_DROP = 1.8;
vec2 boxUv(vec2 p) {
  return vec2((p.x - uRiverBox.x) / (uRiverBox.z - uRiverBox.x), (uRiverBox.w - p.y) / (uRiverBox.w - uRiverBox.y));
}
bool inRiverBox(vec2 u) { return u.x > 0.0 && u.x < 1.0 && u.y > 0.0 && u.y < 1.0; }
// (The way in from the grass and to the water, in units; off the map, on grass far from it.)
vec2 bankAt(vec2 p) {
  vec2 u = boxUv(p);
  if (!inRiverBox(u)) return vec2(0.0, 25.5);
  vec3 b = texture2D(uBank, u).rgb;
  return vec2((b.r * 255.0 + b.g) / 10.0, b.b * 25.5);
}
float sinkAt(vec2 p) {
  vec2 u = boxUv(p);
  return inRiverBox(u) ? uRiverOn * texture2D(uBankShade, u).r * 2.0 : 0.0;
}
void main() {
  vBed = color.r;
  vAcross = color.g;
  vec3 pos = position;
  vec3 n = normal;
  vec2 wp = (modelMatrix * vec4(position, 1.0)).xz;
  float h = sinkAt(wp);
  vSink = h / BED_DROP;
  vBank = bankAt(wp);
  vec2 bu = boxUv(wp);
  // (Green the sky, blue the moon, alpha the noon sun, from 0.3: bake_bank_shade.py.)
  vBankLight = inRiverBox(bu) ? texture2D(uBankShade, bu).gba : vec3(1.0);
  vSteep = 0.0;
  vFall = vec2(0.0);
  if (h > 0.0001) {
    // (Its slope into the normal, so the sunk gravel is lit as sloping.)
    float e = 0.3;
    vec2 g = vec2(sinkAt(wp + vec2(e, 0.0)) - sinkAt(wp - vec2(e, 0.0)), sinkAt(wp + vec2(0.0, e)) - sinkAt(wp - vec2(0.0, e))) / (2.0 * e);
    pos.y -= h;
    vSteep = length(g);
    vFall = g;
    // (Not over the lip's first fall, where the turf still is: tilted from
    // the moon there, its grass drew a dark seam along the edge.)
    n = normalize(n / max(n.y, 0.2) + vec3(g.x, 0.0, g.y) * smoothstep(0.0, 0.35, h));
  }
  vN = normalize(mat3(modelMatrix) * n);
  vW = (modelMatrix * vec4(pos, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

/* The ground, painted from four Poly Haven textures (CC0) by height, slope
   and the gravel bed: mossy grass on the valley floor, a darker moss for the
   forested hills, rock on the steepest faces, and river pebbles in the Mau
   Chhu's bed. Each is sampled at two scales and angles and mixed by a broad
   noise, so its tiling never shows, and lit from the terrain's real slopes. */
const TERRAIN_FRAG = /* glsl */ `
${MIST}
precision highp float;
${LIT}
uniform sampler2D uDetail;
// The ground's materials (scripts/valley/pack_textures.py, Poly Haven, CC0):
// their grain, a channel each (uGrain0: meadow, damp, dirt, rock; uGrain1:
// moss, gravel), and their surface detail, two to a map (uNor0: meadow,
// damp; uNor1: dirt, rock; uNor2: moss, gravel).
uniform sampler2D uGrain0, uGrain1, uNor0, uNor1, uNor2;
// (The gravel's own colour, its stones and the shade between them.)
uniform sampler2D uGravelCol;
// The land's colour, and its shade (red: open to the sky; green: in the
// low moon's light), baked over the valley from above (uBakeBox).
uniform sampler2D uGroundShade;
// How much the groves cover the ground (red; scripts/valley/bake_plants.py).
// The Mao Chhu's bed from the satellite (scripts/valley/bake_river.py): red
// its water, green its gravel, blue the scrub on its islands, over uRiverBox
// (x0, z0, x1, z1); and the moon in the sky, for its glint on the water.
uniform sampler2D uRiver;
uniform vec4 uRiverBox;
uniform vec3 uMoonSky;
// (Off while the river's look is settled: the bed as it was, water filling it.)
uniform float uRiverOn;
uniform vec4 uBakeBox;
// The chortens' shadows, softened, seen from above over uChBox (x0, z0, x1,
// z1), and how dark (uChAmt).
uniform sampler2D uChShadow;
uniform vec4 uChBox;
uniform float uChAmt;
uniform float uWind;
// The pointer's ripples: a patch of water simulated in uRipple (red its
// height), lying over uRipBox (its corner x, z; its size; on or off).
uniform sampler2D uRipple;
uniform vec4 uRipBox;
// Where the gathering the camera comes down among sits (uCrowdBox: its
// corner and size in x, z): in uCrowd, red the soft shadow under each
// person, green their orb's light on the ground before them, blue when that
// orb leaves (its aOrder), against the lights' uGatherT.
uniform sampler2D uCrowd;
uniform vec4 uCrowdBox;
uniform float uCrowdOn, uGatherT;
uniform vec3 uOrbWarm;
// Every gathering, for the warmth of its lights on the ground round it: its
// centre and half-size (x, z, along, across) and its turn.
uniform vec4 uGroups[8];
uniform float uGroupTurn[8];
uniform float uDay, uTime;
varying float vSink;
varying float vSteep;
varying vec2 vFall;
varying vec2 vBank;
varying vec3 vBankLight;
// The bank's own ground (scripts/valley/pack_bank.py, Poly Haven, CC0): grain
// (red damp_sand, green excavated_soil_wall, blue grass_ground, alpha that
// turf's grass). (Its surface detail the gravel's, uNor2: the terrain is at
// the GPU's sixteen textures.)
uniform sampler2D uBankGrain;
// The river's ripples (scripts/valley/bake_water.py): slope across and along
// in red and green, height in blue, tiling, waves drawn out along x.
uniform sampler2D uWaterNor;
varying float vBed;
varying float vAcross;
varying vec3 vN;
varying vec3 vW;
varying float vDepth;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + 1.0), f.x), f.y);
}
vec3 tex2(sampler2D t, vec2 p, float s, float m) {
  vec2 r = mat2(0.8, -0.6, 0.6, 0.8) * p;
  return mix(texture2D(t, p * s).rgb, texture2D(t, r * s * 0.37 + 0.31).rgb, m);
}
void main() {
  vec3 n = normalize(vN);
  vec2 p = vW.xz;
  float m = smoothstep(0.3, 0.7, vn(p * 0.012 + 4.0));
  float slope = 1.0 - n.y;

  vec2 bakeUv = vec2((p.x - uBakeBox.x) / (uBakeBox.z - uBakeBox.x), (uBakeBox.w - p.y) / (uBakeBox.w - uBakeBox.y));
  vec3 shadeT = texture2D(uGroundShade, bakeUv).rgb;
  vec2 shade = shadeT.rg;

  /* The land, painted as 108.bt's is: what each place is (meadow, damp
     ground, dirt, rock, moss on rock) from its slope, its wetness, its folds
     and a broad variation; its light from the moon, low, on the surface's
     own detail, shadowed by the hills and darker in the folds; and its
     colour taken from that light along the material's own ramp (shadow,
     mid, lit, and the moon's cool sheen on what faces the eye), so the
     greens are always the brief's, whatever the photographs' own. */
  float macro = vn(p * 0.006) * 0.6 + vn(p * 0.021 + 3.0) * 0.4;
  float patchN = vn(p * 0.045 + 7.0) * 0.7 + vn(p * 0.13 + 1.0) * 0.3;
  float gully = 1.0 - smoothstep(0.78, 0.97, shade.r);
  // The river's map (bake_river.py): red its water, green its gravel, blue
  // its bank, out from the stone into the grass; nothing outside uRiverBox.
  vec2 rUv = vec2((p.x - uRiverBox.x) / (uRiverBox.z - uRiverBox.x), (uRiverBox.w - p.y) / (uRiverBox.w - uRiverBox.y));
  float inBox = uRiverOn * step(0.0, rUv.x) * step(rUv.x, 1.0) * step(0.0, rUv.y) * step(rUv.y, 1.0);
  vec3 rv = vec3(0.0);
  // (The water's outline smoothed: the map read round the point, so its
  // edge runs in a soft line, not along the map's pixels. Only inside its
  // box: outside it all ten reads came to nothing, on every pixel.)
  if (inBox > 0.5) {
    rv = texture2D(uRiver, clamp(rUv, 0.0, 1.0)).rgb;
    vec2 du = vec2(1.6 / (uRiverBox.z - uRiverBox.x), 1.6 / (uRiverBox.w - uRiverBox.y));
    float w = rv.r * 2.0;
    w += texture2D(uRiver, clamp(rUv + vec2(du.x, 0.0), 0.0, 1.0)).r + texture2D(uRiver, clamp(rUv - vec2(du.x, 0.0), 0.0, 1.0)).r;
    w += texture2D(uRiver, clamp(rUv + vec2(0.0, du.y), 0.0, 1.0)).r + texture2D(uRiver, clamp(rUv - vec2(0.0, du.y), 0.0, 1.0)).r;
    w += texture2D(uRiver, clamp(rUv + du, 0.0, 1.0)).r + texture2D(uRiver, clamp(rUv - du, 0.0, 1.0)).r;
    w += texture2D(uRiver, clamp(rUv + vec2(du.x, -du.y), 0.0, 1.0)).r + texture2D(uRiver, clamp(rUv - vec2(du.x, -du.y), 0.0, 1.0)).r;
    rv.r = w / 10.0 * inBox;
  }
  // (The grass by the river damp and dark, out to the bank's end.)
  float nearWater = rv.b * rv.b;
  // Rock on the steep faces, and along the crests: open to the sky all round
  // (the bake's red), up off the floor, broken by noise into outcrops.
  float crest = smoothstep(0.955, 0.99, shade.r) * smoothstep(0.1, 0.25, slope) * smoothstep(10.0, 22.0, vW.y);
  float wRock = max(smoothstep(0.36, 0.52, slope + (macro - 0.5) * 0.18), crest * smoothstep(0.45, 0.7, patchN));
  float wMoss = smoothstep(0.22, 0.38, slope + (patchN - 0.5) * 0.12) * (1.0 - wRock);
  float wDamp = clamp(max(nearWater * 0.85, gully * 0.75) * (0.7 + 0.6 * patchN), 0.0, 1.0) * (1.0 - wRock) * (1.0 - wMoss * 0.5);
  float wDirt = smoothstep(0.66, 0.74, patchN) * (1.0 - smoothstep(0.08, 0.2, slope)) * (1.0 - wDamp) * 0.7;
  // (Few bare patches near the eye, where they read as dirt on the meadow,
  // not as its variety.)
  wDirt *= 1.0 - 0.7 * (1.0 - smoothstep(20.0, 80.0, vDepth));
  float wMeadow = max(0.0, 1.0 - wRock - wMoss - wDamp - wDirt);
  // The grain and the detail: each at two sizes, the smaller fading out with
  // distance before it can shimmer; rock and moss also from the side, so
  // the steep faces do not stretch.
  float far = smoothstep(25.0, 140.0, vDepth);
  vec2 ua = p * 0.16, ub = mat2(0.8, -0.6, 0.6, 0.8) * p * 0.031 + 0.37;
  vec4 g0 = mix(texture2D(uGrain0, ua), texture2D(uGrain0, ub), far * 0.7 + 0.15);
  // (Each read only where its material lies: on the meadow, most of the
  // valley, they came to nothing. Weighed by zero, the same picture.)
  vec3 tw = pow(abs(n), vec3(4.0));
  tw /= tw.x + tw.y + tw.z;
  float rockSide = 0.0, mossSide = 0.0;
  if (wRock > 0.0) rockSide = texture2D(uGrain0, vW.zy * 0.12).a * tw.x + texture2D(uGrain0, vW.xy * 0.12).a * tw.z + g0.a * tw.y;
  if (wMoss > 0.0) {
    vec4 g1 = mix(texture2D(uGrain1, ua), texture2D(uGrain1, ub), far * 0.7 + 0.15);
    mossSide = texture2D(uGrain1, vW.zy * 0.12).r * tw.x + texture2D(uGrain1, vW.xy * 0.12).r * tw.z + g1.r * tw.y;
  }
  float grainV = g0.r * wMeadow + g0.g * wDamp + g0.b * wDirt + rockSide * wRock + mossSide * wMoss - 0.5;
  vec4 n0 = mix(texture2D(uNor0, ua), texture2D(uNor0, ub), far * 0.7 + 0.15);
  vec2 dn = n0.rg * wMeadow + n0.ba * wDamp;
  if (wDirt + wRock > 0.0) {
    vec4 n1 = mix(texture2D(uNor1, ua), texture2D(uNor1, ub), far * 0.7 + 0.15);
    dn += n1.rg * wDirt + n1.ba * wRock;
  }
  if (wMoss > 0.0) {
    vec4 n2 = mix(texture2D(uNor2, ua), texture2D(uNor2, ub), far * 0.7 + 0.15);
    dn += n2.rg * wMoss;
  }
  dn = dn * 2.0 - (wMeadow + wDamp + wDirt + wRock + wMoss);
  // (Laid flat over the ground from above: x along the world's x, y along
  // its z; strongest close by, where the moon's skim can find it.)
  vec3 nd = normalize(n + vec3(dn.x, 0.0, -dn.y) * mix(0.9, 0.35, far));
  // The moon's light: as if low, skimming, so ridges and the surface's
  // own detail stand out; shadowed by the hills; darker in the folds.
  vec3 rl = normalize(vec3(uMoon.x, uMoon.y * 0.4, uMoon.z));
  // (Flat ground lands at the ramp's middle; slopes turned to the moon at its
  // lit end, those turned away in shadow.)
  float L = clamp(dot(nd, rl) * 1.05 - 0.12, 0.0, 1.0);
  L *= mix(0.3, 1.0, shade.g) * mix(0.5, 1.0, smoothstep(0.55, 1.0, shade.r));
  L = clamp(L + grainV * mix(0.55, 0.25, far), 0.0, 1.0);
  // The brief's ramps (shadow, mid, lit), for each material.
  #define RAMP(s, m, l) mix(mix(s, m, smoothstep(0.0, 0.5, L)), l, smoothstep(0.5, 1.0, L))
  // (Cool, deep emerald even where the moon is on it: lit, it reads lighter,
  // never yellower; yellow-olive under the moon read as daylight.)
  vec3 meadow = RAMP(vec3(0.05, 0.096, 0.04), vec3(0.078, 0.14, 0.058), vec3(0.13, 0.192, 0.105));
  // (Some of the meadow a cooler, bluer green, some a touch warmer.)
  meadow *= mix(vec3(0.94, 1.0, 1.08), vec3(1.03, 1.03, 0.95), macro);
  // The slopes turned to the moon drier and paler, the grass thinner there;
  // the hollows lush and dark.
  float parched = smoothstep(0.15, 0.6, dot(n, normalize(vec3(rl.x, 0.0, rl.z)))) * smoothstep(0.04, 0.2, slope);
  meadow = mix(meadow, meadow * vec3(1.1, 1.12, 1.05), parched * 0.6);
  meadow *= mix(1.0, 0.78, gully);
  vec3 dampC = RAMP(vec3(0.043, 0.078, 0.043), vec3(0.078, 0.118, 0.071), vec3(0.133, 0.169, 0.125));
  vec3 dirtC = RAMP(vec3(0.082, 0.082, 0.063), vec3(0.137, 0.137, 0.102), vec3(0.212, 0.208, 0.165));
  vec3 rockC = RAMP(vec3(0.071, 0.09, 0.11), vec3(0.125, 0.149, 0.169), vec3(0.204, 0.235, 0.267));
  vec3 mossC = mix(rockC, meadow, 0.55);
  vec3 c = meadow * wMeadow + dampC * wDamp + dirtC * wDirt + rockC * wRock + mossC * wMoss;
  // Under the groves and just past them, the ground in their shade: dark,
  // the forest floor's, so a grove reads as one soft mass on the hill.
  // (Packed into the land's shade map, its blue: the land's shader is at
  // its sixteen textures.)
  float cover = shadeT.b;
  c = mix(c, c * vec3(0.5, 0.56, 0.52), cover);
  // Broad light and dark over the land, so from up here no hill and no
  // stretch of the floor is one tone: at three sizes, strongest far off,
  // where the grain no longer carries.
  float tone = vn(p * 0.0045 + 11.0) * 0.5 + vn(p * 0.013 + 5.0) * 0.3 + vn(p * 0.04 + 2.0) * 0.2;
  c *= mix(1.0, 0.72 + tone * 0.56, 0.55 + 0.45 * far);
  // The grass's own coarse pattern (clumps, worn patches, stones), a few
  // metres across: kept where the fine grain has faded, so from up here the
  // hills are textured, not airbrushed.
  float coarse = texture2D(uGrain0, p * 0.021 + 0.13).r * 0.6 + texture2D(uGrain0, mat2(0.6, -0.8, 0.8, 0.6) * p * 0.0073 + 0.61).a * 0.4;
  c *= mix(1.0, 0.62 + coarse * 0.76, 0.35 + 0.55 * far);
  // The moon's cool sheen, where the land turns from the eye (ridges, the
  // shoulders of the hills): strongest on rock.
  // (Not close by, where the grass stands on it: its floor is in the
  // blades' shade, with no sheen.)
  float nearG = 1.0 - smoothstep(0.8, 9.0, vDepth);
  vec3 toEye = normalize(cameraPosition - vW);
  float rim = pow(1.0 - clamp(dot(nd, toEye), 0.0, 1.0), 3.0) * smoothstep(0.2, 0.8, L) * (1.0 - nearG);
  c += mix(vec3(0.2, 0.26, 0.23), vec3(0.29, 0.333, 0.408), wRock) * rim * 0.35;
  // Close by, where the people sit: the meadow's own blades and soil (108.bt's
  // ground detail), at two scales, and the turf's shaded floor under the
  // blades (BLADE_*), darker than they are.
  if (nearG > 0.0) {
    vec2 r2 = mat2(0.8, -0.6, 0.6, 0.8) * p;
    float dt = texture2D(uDetail, p * 3.7).r * 0.6 + texture2D(uDetail, r2 * 1.3 + 0.37).r * 0.4;
    c *= mix(1.0, 0.45 + dt * 1.1, nearG * 0.8);
    c *= 1.0 - 0.22 * nearG;
  }
  // The wind over the meadow: broad, slow swells of a lighter green passing
  // over the flat ground, the blades bent over and their paler sides to
  // the light, as a breeze reads across a field from afar. (In narrow,
  // patchy bands they stood still in any one frame as worm-shaped blotches,
  // and on the far bank, seen across the river, fell under a pixel and
  // were cut, so one bank had them and the other not; on the hills too.)
  // The meadow is painted, its own blades too fine to bend; only the close
  // grass, made blade by blade, moves itself.
  if (uWind > 0.0 && vDepth < 260.0) {
    vec2 wd = normalize(vec2(0.2, 1.0));
    float ph = dot(p, wd) * 0.85 - uTime * 0.55 + (vn(p * 0.08 + 4.0) - 0.5) * 2.2;
    float g = 0.5 + 0.5 * sin(ph);
    g = g * g * (3.0 - 2.0 * g);
    // (Waxing and waning along their length, broadly.)
    g *= mix(0.45, 1.0, smoothstep(0.2, 0.8, vn(p * 0.06 - wd * uTime * 0.12 + 9.0)));
    float px = fwidth(ph);
    float k = wMeadow * (1.0 - smoothstep(0.03, 0.08, slope)) * (1.0 - smoothstep(0.5, 1.2, px)) * smoothstep(1.5, 6.0, vDepth) * uWind;
    c *= 1.0 + (g - 0.4) * 0.04 * k;
    c = mix(c, c * vec3(1.03, 1.05, 0.99), g * 0.22 * k);
  }
  vec2 chUv = vec2((p.x - uChBox.x) / (uChBox.z - uChBox.x), (uChBox.w - p.y) / (uChBox.w - uChBox.y));
  if (uChAmt > 0.0 && chUv.x > 0.0 && chUv.x < 1.0 && chUv.y > 0.0 && chUv.y < 1.0) c *= 1.0 - uChAmt * texture2D(uChShadow, chUv).r;
  // (By day, the ending: a natural green, lighter, a little greyed at first
  // light; by noon brighter and fuller, in broad lighter, drier stretches
  // and deeper ones, as a sunlit meadow is.)
  float dayK = smoothstep(0.0, 0.45, uDay);
  float noonK = smoothstep(0.55, 1.0, uDay);
  vec3 dayC = c * mix(vec3(1.75, 1.7, 1.5), vec3(2.3, 2.25, 1.8) * (0.86 + 0.28 * macro), noonK);
  dayC = mix(dayC, dayC * vec3(1.08, 1.04, 0.86), noonK * smoothstep(0.55, 0.85, patchN) * 0.6);
  dayC = mix(dayC, vec3(dot(dayC, vec3(0.3, 0.59, 0.11))), mix(0.3, 0.1, noonK));
  c = mix(c, dayC, dayK);
  vec3 land = c;

  // The Mau Chhu: water fills the bed, with a thin strip of pebbles along
  // each bank and a few slim islands lying with the current.
  // (Under the river box's own painting below, never seen but at its edges;
  // the gravel's colour, uGravelCol, so it costs no texture of its own.)
  // A ragged bank, not a ruled line: the edge wanders with noise at two
  // scales, grass creeps onto the gravel in tufts, and a darker band of
  // damp ground runs along it.
  float edgeN = vn(p * 0.035) * 0.65 + vn(p * 0.14 + 5.0) * 0.35;
  float bedM = smoothstep(0.2, 0.8, vBed + (edgeN - 0.5) * 0.7);
  float tufts = smoothstep(0.5, 0.72, vn(p * 0.09 + 11.0)) * (1.0 - smoothstep(0.6, 1.0, vBed));
  bedM *= 1.0 - tufts * 0.8;
  // (The old bed's own painting only where it shows: under the river's box
  // the river is painted over it, and over the meadow its mask is nought.)
  if (bedM > 0.0 && inBox < 0.5) {
    vec3 stones = tex2(uGravelCol, p, 0.11, m) * 0.4;
    float wobble = (vn(vec2(p.x * 0.03, 1.7)) - 0.5) * 0.08;
    float edge = min(vAcross, 1.0 - vAcross) + wobble;
    float dry = 1.0 - smoothstep(0.04, 0.09, edge);
    // Broad across and long in the flow, so they are simple lozenges, never forks.
    float isle = vn(vec2(p.x * 0.007, vAcross * 3.0)) * 0.85 + vn(vec2(p.x * 0.02, vAcross * 6.0) + 3.0) * 0.15;
    // No islands in the narrow reach below the gorge, where they would squeeze
    // into slivers; they appear only once the bed has widened.
    float wide = smoothstep(200.0, 260.0, p.x);
    dry = max(dry, smoothstep(0.74, 0.78, isle) * smoothstep(0.18, 0.32, edge) * wide);
    // Dark water holding the sky; fine ripples, long in the flow, carried
    // downstream; a soft path of moonlight down its length.
    float t = uTime;
    float rip = vn(vec2(p.x * 0.35 - t * 1.2, p.y * 2.2)) * 0.6 + vn(vec2(p.x * 0.9 - t * 2.0, p.y * 4.5) + 7.0) * 0.4;
    float streak = smoothstep(0.62, 0.8, rip) * (1.0 - smoothstep(150.0, 600.0, vDepth));
    vec3 deep = mix(vec3(0.03, 0.05, 0.09), vec3(0.14, 0.24, 0.26), uDay);
    vec3 water = mix(deep, uHaze, mix(0.35, 0.15, uDay));
    water += mix(vec3(0.5, 0.56, 0.72), vec3(0.7, 0.78, 0.8), uDay) * streak * mix(0.22, 0.15, uDay);
    float sheen = smoothstep(0.3, 0.7, vn(vec2(p.x * 0.02 - t * 0.2, p.y * 0.05)));
    water += vec3(0.08, 0.1, 0.14) * sheen * (1.0 - uDay);
    // The water's edge: a pale lip of wet stone.
    float lip = smoothstep(0.0, 0.6, dry) * (1.0 - smoothstep(0.6, 1.0, dry));
    vec3 bedCol = mix(water, stones, dry);
    bedCol = mix(bedCol, stones * 1.15, lip * 0.4);
    // (The bed keeps its own light until the river is rebuilt.)
    float night = 1.0 - smoothstep(0.0, 0.3, uDay);
    bedCol = mix(bedCol, vec3(dot(bedCol, vec3(0.3, 0.59, 0.11))) * vec3(0.9, 0.97, 1.08), 0.2 * night);
    float l = clamp(dot(n, rl) * 1.15 + 0.1, 0.0, 1.0) * mix(0.3, 1.0, shade.g);
    vec3 key = mix(uMoonCol, vec3(dot(uMoonCol, vec3(0.333))), 0.55 * night) * mix(1.0, 1.15, night);
    bedCol *= (uAmbient * mix(1.0, 1.3, night) + key * l) * mix(0.35, 1.0, smoothstep(0.45, 1.0, shade.r));
    c = mix(land, bedCol, bedM);
  }

  /* The river, as bake_river.py draws it: winding down from the gorge,
     gravel bars on the inside of its bends and a strip of stone along its
     edges, side channels across the widest bars; the water deep, taking
     the sky where it is seen at a low angle, rippled as it runs downstream
     (+x), with the moon's path glinting on it. */
  if (inBox > 0.5) {
    vec3 stones = tex2(uGravelCol, p, 0.11, m) * 0.4;
    /* The stone: a river's shingle, dry and pale on the bars' crowns, darker
       and wet toward the water, in streaks laid down along the flow; sand
       between; and at its landward edge the grass growing out over it in
       tufts, so stone and meadow meet raggedly, not on a line. */
    float nearS = 1.0 - smoothstep(6.0, 40.0, vDepth);
    // (Cobbles, dry_river_pebbles (scripts/valley/pack_gravel.py): sorted by
    // the river as real banks are, finer up the bank and coarser down by the
    // water, so the stones themselves grow as the bank falls; each size at
    // two scales, the larger for far off, where the smaller would blur.)
    // (At about the stones' own size, a hand to a foot across: drawn bigger,
    // as they were, they read as rubble from the page's heights.)
    vec2 uA = p * 1.6, uB = mat2(0.8, -0.6, 0.6, 0.8) * p * 0.5 + 0.17;
    vec2 uA2 = mat2(0.6, 0.8, -0.8, 0.6) * p * 0.75 + 0.41, uB2 = p * 0.24 + 0.63;
    // (Coarser toward the water, and in patches anywhere over the bars, as
    // floods leave them: fine gravel here, a spread of big cobbles there,
    // not one even size, nor a row of them traced along the water.)
    float coarse = clamp(smoothstep(0.35, 0.9, vSink) * 0.55 * smoothstep(0.3, 0.6, vn(p * 0.12 + 17.0)) + smoothstep(0.5, 0.72, vn(p * 0.055 + 31.0)), 0.0, 1.0);
    float gA = mix(texture2D(uGrain1, uA).g, texture2D(uGrain1, uA2).g, coarse);
    float gB = mix(texture2D(uGrain1, uB).g, texture2D(uGrain1, uB2).g, coarse);
    vec4 nA = mix(texture2D(uNor2, uA), texture2D(uNor2, uA2), coarse);
    vec4 nB = mix(texture2D(uNor2, uB), texture2D(uNor2, uB2), coarse);
    vec3 cA = mix(texture2D(uGravelCol, uA).rgb, texture2D(uGravelCol, uA2).rgb, coarse);
    vec3 cB = mix(texture2D(uGravelCol, uB).rgb, texture2D(uGravelCol, uB2).rgb, coarse);
    float stoneG = mix(gB, gA * 0.65 + gB * 0.35, nearS);
    vec2 sn = mix(nB.ba, nA.ba, nearS) * 2.0 - 1.0;
    // (On the slope with the sky's floor the sand has, then its own relief.)
    float gL = clamp(dot(normalize(n + vec3(sn.x, 0.0, -sn.y) * 1.1), rl) * 1.05 - 0.05, 0.0, 1.0);
    gL = clamp(max(gL, 0.5 * smoothstep(0.05, 0.8, vSteep)) + (stoneG - 0.5) * mix(0.8, 1.2, nearS), 0.0, 1.0);
    gL *= mix(0.4, 1.0, shade.g);
    vec3 gravelC = mix(mix(vec3(0.1, 0.102, 0.105), vec3(0.2, 0.203, 0.21), smoothstep(0.0, 0.5, gL)), vec3(0.32, 0.325, 0.335), smoothstep(0.5, 1.0, gL));
    // (The stones' own colours, greys and tans, kept a little.)
    vec3 sc = mix(cB, cA * 0.65 + cB * 0.35, nearS);
    gravelC *= mix(vec3(1.0), sc / max(dot(sc, vec3(0.333)), 0.05), 0.22);
    // The bank, as a river leaves it, and lit as baked (uBankShade): sand
    // over most of it, the cobbles in a band along the water, where the
    // current washes the fines away, and only a few strewn up the slope; the
    // cut's face bare silt; the meadow's turf ending at the lip. Every edge
    // between them is blended by height, as material meets material in
    // fact: the stones come up through the sand where it thins, each by its
    // own height (stoneG, their tops bright), and the turf breaks up at the
    // lip into its own clumps (grass_ground's grass), soil between, not
    // along a line or a blur.
    float hDrop = vSink * 1.8; // (TERRAIN_VERT's BED_DROP: the fall in units.)
    float jag = vn(p * 0.3 + 5.0) - 0.5 + (vn(p * 1.1 + 2.0) - 0.5) * 0.4;
    // (The sand: damp_sand, lit by the bank's own slope.)
    vec2 sA = p * 1.1, sB = mat2(0.8, -0.6, 0.6, 0.8) * p * 0.27 + 0.3;
    vec4 bgA = texture2D(uBankGrain, sA), bgB = texture2D(uBankGrain, sB);
    float sG = mix(bgB.r, bgA.r * 0.65 + bgB.r * 0.35, nearS);
    vec2 along = normalize(vec2(-vFall.y, vFall.x) + vec2(1e-4, 0.0));
    float wallT = smoothstep(0.1, 0.8, vSteep);
    vec2 sNo = (mix(texture2D(uNor2, sB).ba, texture2D(uNor2, sA).ba, nearS) * 2.0 - 1.0) * 0.4;
    vec3 sGrain = vec3(sNo.x, 0.0, -sNo.y) * 0.6;
    float sL = clamp(dot(normalize(n + sGrain), rl) * 1.05 - 0.05, 0.0, 1.0);
    // (Only a third of the slope's own light: in full, the bank falling
    // away from the moon came out a shade of grey beside the bright one
    // across the water, as if of another stuff. The two are the same sand.)
    sL = mix(clamp(dot(normalize(vec3(0.0, 1.0, 0.0) + sGrain), rl) * 1.05 - 0.05, 0.0, 1.0), sL, 0.35);
    sL *= mix(0.4, 1.0, shade.g);
    // (A steep face turned from the moon still has the sky on it, and the
    // bright sand below: lit by them at about the level ground's light, not
    // the moon's black side.)
    sL = max(sL, 0.5 * smoothstep(0.05, 0.8, vSteep));
    // (Its grain over that, not under it: taken into the light before the
    // sky's floor, the floor flattened it away and the slope read smooth
    // beside the grainy level sand.)
    sL = clamp(sL + (sG - 0.5) * mix(0.4, 0.8, nearS), 0.0, 1.0);
    // (damp_sand's own brown, greyed toward the Mao Chhu's grey micaceous
    // sand; damper and a little darker over the last metres to the water.)
    vec3 sandC = mix(vec3(0.488, 0.369, 0.218) / 0.39, vec3(1.0), 0.9) * mix(0.13, 0.31, sL);
    // (Not one even colour: in broad patches a cooler grey silt, a warmer
    // dry sand, as floods lay them down in turn.)
    float silt = vn(p * 0.06 + 41.0) * 0.65 + vn(p * 0.21 + 7.0) * 0.35;
    sandC *= mix(vec3(0.94, 0.97, 1.02), vec3(1.05, 1.01, 0.94), smoothstep(0.3, 0.7, silt));
    // (Over a fixed width from the waterline, not the bank's whole breadth:
    // measured out to three units, a narrow cut bank's sand was damp, and
    // dark, from the water to the foot of the cut.)
    sandC *= mix(0.84, 1.0, smoothstep(0.0, 2.4, vBank.y + jag * 1.2));
    // (Broad, soft changes of tone over it: drier crowns, damper hollows.)
    sandC *= mix(0.92, 1.08, vn(p * 0.04 + 11.0) * 0.6 + vn(p * 0.13 + 2.0) * 0.4);
    // (Lit by its slope as a relief map is, the slope drawn three times as
    // steep for the light alone: a bar's fall to the water is too gentle for
    // the true light to show from the page's heights, as a real one shows it
    // to the eye by its sheen and its shadows. Faces toward the light a
    // little brighter, those away a shade darker, the flat as it was.)
    vec3 Lsl = normalize(uMoon);
    float relief = dot(normalize(vec3(vFall.x * 3.0, 1.0, vFall.y * 3.0)), Lsl) - Lsl.y;
    // (Toward the light by more than away: the shaded side is filled by the
    // sky and the bright bar, and kept from going dark again.)
    // (Not on the cut's wall, whose steepness, drawn three times over, put
    // it all in the shade side: there the sky and the bar light it.)
    // (And by steepness, not at a threshold, so wall, talus and bar meet in
    // one tone with no line between.)
    float wallK = smoothstep(0.05, 0.8, vSteep);
    sandC *= mix(clamp(1.0 + relief * (relief > 0.0 ? 0.9 : 0.2), 0.93, 1.25), 0.96, wallK);
    // (The stones: in a band along the water two to four metres wide, its
    // width wandering, and a few on the slope above, fewer the higher.)
    // (Its top thinning out into the sand over a broad margin, the larger
    // stones standing furthest up it, so no line marks where it ends.)
    // (Narrower where the bank is narrow: the same three metres on a cut
    // bank's short strip covered nearly all of it, and in grey stones it
    // read as another, darker bank from the sandy bar across the water.)
    float bandK = mix(0.4, 1.0, smoothstep(4.0, 12.0, vBank.x + vBank.y));
    float stoneAmt = 1.0 - smoothstep(0.3 * bandK, 3.2 * bandK, vBank.y + jag * 2.2 * bandK);
    stoneAmt = max(stoneAmt, 0.55 * smoothstep(0.74, 0.86, vn(p * 0.5 + 9.0)) * (1.0 - smoothstep(1.0 * bandK, 5.0 * bandK, vBank.y)));
    // (And down the slope under the cut, the stones fallen out of it with
    // the sand, scattered, thinning toward the turf: bare, it read smooth
    // beside the stony level ground.)
    stoneAmt = max(stoneAmt, 0.5 * smoothstep(0.45, 0.7, vn(p * 3.2 + 3.0)) * smoothstep(0.25, 0.8, hDrop) * smoothstep(0.05, 0.4, vSteep));
    float stoneSel = smoothstep(-0.06, 0.06, stoneAmt - 0.5 + (stoneG - 0.5) * 1.4);
    vec3 groundC = mix(sandC, gravelC, stoneSel);
    // (The cut's face: the bank's own sand and silt, bared, a little browner
    // than the sand below and with its runnels down it (excavated_soil_wall,
    // laid on the face, along the bank and up it); lit as the sand is, by
    // its own slope, the sky and the bright bar below it filling its shade,
    // not dark earth.)
    // (excavated_soil_wall at its own scale, its layers and runnels clear:
    // faint, the wall read as a blur beside the crisp stones.)
    vec2 fUv = vec2(dot(p, along), vW.y * 1.3) * 1.4;
    float soG = texture2D(uBankGrain, fUv).g * 0.7 + texture2D(uBankGrain, fUv * 0.31 + 0.5).g * 0.3;
    // (Dry silt: near the sand's own colour, a touch browner, in faint
    // runnels down it.)
    vec3 faceC = sandC * vec3(0.99, 0.96, 0.91) * mix(0.72, 1.18, soG);
    // (Into the sand below over a broad, broken margin, as the talus is its
    // own fallen sand: no line where the wall ends.)
    float face = smoothstep(0.35, 1.4, vSteep + jag * 0.5) * (1.0 - smoothstep(0.6, 1.3, hDrop + jag * 0.15));
    // (Only faintly: the wall is the sand's own slope, rolling down to the
    // stones, not a band of its own.)
    groundC = mix(groundC, faceC, face * 0.35);
    // (The meadow's edge, as one is: over the lip's first fall the turf
    // thins into its own clumps standing on the sand (grass_ground's grass,
    // turfH), each drier and paler the further out, the sand between them,
    // until the last tufts give out; wide on a bar's gentle fall, narrow on
    // a cut's steep one. No line along it, light or dark.)
    vec4 tg = texture2D(uBankGrain, p * 0.7 + 0.2);
    float turfH = tg.a * 0.5 + tg.b * 0.25 + vn(p * 2.3 + 7.0) * 0.25;
    float edgeT = smoothstep(0.0, 0.26, hDrop + jag * 0.07);
    float grassSel = smoothstep(-0.07, 0.07, (1.0 - edgeT) - 0.5 + (turfH - 0.5) * 1.0);
    // (All meadow where the ground has not begun to fall: the edge's noise
    // only moves the lip, never out onto the level grass.)
    grassSel = max(grassSel, 1.0 - smoothstep(0.0, 0.03, hDrop));
    // (Dried grass: the meadow's own, its green gone to straw, as bright.)
    vec3 straw = vec3(dot(land, vec3(0.3, 0.59, 0.11))) * vec3(1.22, 1.08, 0.72);
    vec3 riverC = groundC;
    // (The meadow in the last metre before the lip a little worn, in patches.)
    vec3 bankLand = mix(land, mix(land, straw, 0.35), smoothstep(0.0, 0.6, vBank.x) * smoothstep(0.4, 0.7, tg.b));
    bankLand = mix(bankLand, mix(land, straw, 0.6), smoothstep(0.1, 0.8, edgeT));
    // (By day, the bank pale, lighter than the grass, as sand and shingle
    // are in sun.)
    riverC = mix(riverC, riverC * vec3(1.85, 1.84, 1.8), dayK);
    riverC = mix(riverC, bankLand, grassSel);
    // Its light, baked (bake_bank_shade.py): the sky shut out at the foot of
    // the cut and in the hollows, and by night the cut's shadow on the bank
    // below; softly, the sky and the sand's own light filling them.
    float aoK = smoothstep(0.7, 1.0, vBankLight.x);
    // (By day, the cut's shadow from the low noon sun on the bank below it,
    // the sky filling it.)
    float sunLit = clamp((vBankLight.z - 0.3) / 0.7, 0.0, 1.0);
    float bankK = mix(0.78, 1.0, aoK) * mix(1.0, mix(0.76, 1.0, vBankLight.y), 1.0 - dayK);
    // (Together, on the sand below the cut, no darker than the face's own
    // shade allows: on a narrow cut bank the crease's shade, the cut's moon
    // shadow, the damp and the slope's own fall from the moon all lay over
    // the same strip and multiplied it nearly to black. The face keeps more
    // of them, the sky still on it.)
    riverC *= max(bankK, 0.9);
    // (Outside that floor: a shadow, not a shading.)
    riverC *= mix(1.0, mix(0.72, 1.0, sunLit), dayK);
    float t = uTime;
    float rough = 0.35 + 0.9 * smoothstep(0.3, 0.7, vn(p * 0.035 + vec2(-t * 0.015, 0.0)));
    /* Its ripples (uWaterNor, scripts/valley/bake_water.py), twice, at two
       scales, drifting downstream (+x) at two paces, so they never repeat in
       step. (Made of noise alone, they were soft blotches, the same
       everywhere and going nowhere.) */
    // (In the world's own x and z, the river's way near enough. Turned to
    // its course as read off the water map, they tore along contour lines:
    // an 8-bit map turns the course in small steps, and coordinates hundreds
    // of units out swing far at each.)
    vec3 wa = texture2D(uWaterNor, (p - vec2(t * 1.1, 0.0)) / vec2(26.0, 11.0)).rgb;
    vec3 wb = texture2D(uWaterNor, (p - vec2(t * 1.8, 0.0)) / vec2(9.0, 4.8) + 0.37).rgb;
    /* Halfway between that and the soft swell it had before (noise warped
       along the flow), to sit with the rest of the valley, which is painted
       soft: on its own the map's fine, crisp facets read as photographed
       water, and where the eye looks along the surface (low, or far off) they
       crowded into marbled contours, the moon and sky glittering in them. So
       its fine layer kept faint, and the map's part of the surface easing to
       the soft swell with distance and as the view lowers. */
    vec2 slope = (wa.rg - 0.5) * 0.3 + (wb.rg - 0.5) * 0.1;
    vec2 q = vec2(p.x * 0.22 - t * 0.55, p.y * 1.5);
    q += vec2(vn(p * 0.05 + vec2(-t * 0.08, 3.0)) * 1.6, vn(p * 0.07 + 9.0) * 0.8);
    float h0 = vn(q) * 0.6 + vn(q * 2.9 + 5.0) * 0.4;
    float hx = vn(q + vec2(0.06, 0.0)) * 0.6 + vn((q + vec2(0.06, 0.0)) * 2.9 + 5.0) * 0.4;
    float hz = vn(q + vec2(0.0, 0.06)) * 0.6 + vn((q + vec2(0.0, 0.06)) * 2.9 + 5.0) * 0.4;
    vec2 soft = vec2((hx - h0) * 1.1, (hz - h0) * 1.8);
    float graze = abs(normalize(cameraPosition - vW).y);
    float mapK = 0.5 * (1.0 - smoothstep(60.0, 400.0, vDepth)) * smoothstep(0.08, 0.4, graze);
    // How deep: the water map blurred wide, a cheap measure of how far in
    // from the edge (0 at the shallows, 1 in the channel's deep middle).
    float deepK = smoothstep(0.55, 0.97, textureLod(uRiver, clamp(rUv, 0.0, 1.0), 4.5).r);
    vec2 slopeW = mix(soft, slope, mapK) * rough;
    /* The pointer's ripples, from the simulated patch: its slope across
       and along, from the heights either side. (Rings drawn one by one
       from each touch read as beads, folds or a graphic laid on the water,
       and the same size on screen near and far; simulated, a moving touch
       draws a wake, the rings run through one another, and, being a size
       in the world, they are small far off and large close by.) Its
       mipmaps soften the waves where they are finer than the pixels, along
       the way they are, so they don't shimmer, yet seen low over the water
       those running across the view still show. */
    vec2 ringS = vec2(0.0);
    if (uRipBox.w > 0.0) {
      vec2 ru = (p - uRipBox.xy) / uRipBox.z;
      if (ru.x > 0.0 && ru.x < 1.0 && ru.y > 0.0 && ru.y < 1.0) {
        float e = 1.0 / 256.0;
        float hl = texture2D(uRipple, ru - vec2(e, 0.0)).r;
        float hr = texture2D(uRipple, ru + vec2(e, 0.0)).r;
        float hd = texture2D(uRipple, ru - vec2(0.0, e)).r;
        float hu = texture2D(uRipple, ru + vec2(0.0, e)).r;
        ringS = vec2(hr - hl, hu - hd) * 1.6;
        // (Never steep: where the pointer presses, the slope ran far past
        // any ripple's, and the sky in it turned to black blots and glare.)
        ringS *= min(1.0, 0.12 / max(length(ringS), 1e-5));
        // (Fading out toward the patch's edges: a wake left behind as it
        // follows the pointer dies away there rather than ending at once.)
        vec2 rm = min(ru, 1.0 - ru);
        ringS *= smoothstep(0.0, 0.25, min(rm.x, rm.y));
      }
    }
    slopeW += ringS;
    vec3 nW = normalize(vec3(-slopeW.x, 1.0, -slopeW.y));
    vec3 V = normalize(cameraPosition - vW);
    vec3 refl = reflect(-V, nW);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(nW, V), 0.0), 5.0);
    float shallowK = 1.0 - smoothstep(0.0, 0.35, deepK);
    /* White water: broken lines of it over the shallows, running with the
       bank (along the depth's own contours, so they follow each bend), in
       pieces drifting downstream, thinning out toward the channel. (In
       blobs of noise, they lay over the shallows as white confetti.) */
    float brk = vn(p * vec2(0.18, 0.45) + vec2(-t * 0.5, 3.0)) * 0.7 + vn(p * 0.9 + vec2(-t * 1.3, 0.0)) * 0.3;
    float ring = deepK * 7.0 + (vn(p * 0.08 + 1.0) - 0.5) * 1.2;
    float rline = 1.0 - abs(fract(ring) - 0.5) * 2.0;
    // (Faint, and in short, uneven pieces: whole and bright, they ran along
    // the banks as painted dashes.)
    float rif = smoothstep(0.86, 0.98, rline) * smoothstep(0.58, 0.8, brk) * (0.5 + 0.5 * vn(p * 0.5 + 8.0)) * (1.0 - smoothstep(0.08, 0.45, deepK));
    float rifNear = 1.0 - smoothstep(150.0, 500.0, vDepth);
    /* By night: nearly black, a deep blue-green in the channel, a little
       lighter over the shallows, the stony bed faint through them; the
       night sky in it only where it is seen low, grey-blue; a dark rim of
       the banks mirrored along its edges; the moon's path; and the riffles
       catching its light. (It was one glowing royal blue bank to bank,
       brighter than the meadow.) */
    vec3 bodyN = mix(vec3(0.07, 0.09, 0.1), vec3(0.03, 0.05, 0.07), smoothstep(0.0, 0.8, deepK));
    bodyN = mix(bodyN, stones * 0.5, shallowK * 0.25);
    vec3 skyN = mix(vec3(0.19, 0.22, 0.31), vec3(0.09, 0.11, 0.17), pow(clamp(refl.y, 0.0, 1.0), 0.6));
    // (Some of the sky in it from every angle, the moonlit sheen water has;
    // with none, looked down on, the river was a black ribbon.)
    vec3 waterN = mix(bodyN, skyN, clamp(0.22 + fres * 1.4, 0.0, 0.85));
    waterN = mix(waterN, bodyN * 0.6, shallowK * fres * 0.7);
    // Patches of the surface catching more of the sky, others less.
    waterN *= 0.85 + 0.3 * vn(p * 0.06 + vec2(-t * 0.03, 2.0));
    // (The moon's path, held from burning out near the lens at a low angle.)
    float glint = pow(max(dot(refl, uMoonSky), 0.0), 260.0) * 3.0 + pow(max(dot(refl, uMoonSky), 0.0), 30.0) * 0.1;
    waterN += vec3(0.875, 0.902, 0.949) * min(glint, 0.85);
    // (A faint silver by the moon: the one thing in the dark water showing
    // it runs.)
    waterN += vec3(0.36, 0.4, 0.46) * rif * rifNear * 0.6;
    /* By day, its own: coloured by its depth, the stony bed showing through
       at the shallows; the sky in it where it is seen low, its own colour
       looking down; the sun's glitter; and white water broken over the
       shallows, running with the current. (It was one flat slate blue,
       opaque, as paint.) */
    // (A clear blue-green, chosen over the Mao Chhu's milky grey-turquoise;
    // greyed well down: the page's grade lifts colour a third again, and
    // fuller, the river read as a swimming pool.)
    vec3 shallowW = vec3(0.4, 0.46, 0.42);
    vec3 midW = vec3(0.21, 0.31, 0.34);
    vec3 deepW = vec3(0.1, 0.18, 0.22);
    vec3 bodyW = mix(mix(shallowW, midW, smoothstep(0.0, 0.5, deepK)), deepW, smoothstep(0.45, 1.0, deepK));
    // (The bed under the shallows, its own pattern through the water.)
    // (Clearer the more steeply it is looked into: from above, the bed seen
    // well out from the edge, fading as the water deepens, and the channel
    // dark; seen low, its own colour and the sky. Looked down on, it was one
    // even opaque blue.)
    float downK = smoothstep(0.25, 0.85, V.y);
    float bedK = mix(shallowK * 0.25, (1.0 - smoothstep(0.0, 0.7, deepK)) * 0.5, downK);
    bodyW = mix(bodyW, stones * 1.5 * vec3(0.85, 0.97, 0.95), bedK);
    vec3 skyDay = mix(uHaze * 1.05, vec3(0.42, 0.58, 0.8), smoothstep(0.0, 0.6, refl.y));
    // (The far reach a little less bright than the sky it mirrors.)
    vec3 waterD = mix(bodyW, skyDay, clamp(fres * 1.1, 0.0, 0.75));
    vec3 sunL = normalize(uMoon);
    float sunG = pow(max(dot(refl, sunL), 0.0), 140.0) * 1.6 + pow(max(dot(refl, sunL), 0.0), 18.0) * 0.08;
    waterD += vec3(1.0, 0.98, 0.92) * sunG * (1.0 - smoothstep(300.0, 900.0, vDepth));
    // (Softly: stronger, the riffles at the near edge read as white chips.)
    waterD = mix(waterD, vec3(0.82, 0.87, 0.86), rif * rifNear * 0.28);
    vec3 waterC = mix(waterN, waterD, smoothstep(0.0, 0.45, uDay));
    /* Looked down on, the ripples lit in relief as well: the side of each
       turned toward the moon (the sun by day) a little lighter, the side
       away a little darker. (From above the water mirrors a sky nearly
       even overhead, so by their slope alone they hardly showed; seen low,
       the mirrored sky shows them, as on real water, and this goes.) */
    float ringL = dot(ringS, normalize(uMoon.xz + vec2(1e-4)));
    waterC *= clamp(1.0 + ringL * 1.2 * smoothstep(0.3, 0.85, V.y), 0.86, 1.14);
    // (By night the water near black, so a ripple, mirroring a sky as dark
    // and even, hardly showed from any side: the moonlit sky's grey-blue
    // caught softly on the side of each turned toward the moon.)
    waterC += vec3(0.16, 0.19, 0.26) * clamp(ringL * 2.0, -0.1, 0.18) * (1.0 - smoothstep(0.0, 0.45, uDay));
    // (Its edge shallow: the water thin over the wet stones at first, the
    // stones seen through it, deepening to its own colour a little way out.)
    // Over a broad margin: wet stones under a film of water, then the
    // stones seen through it, tinted by it, then its own colour as it deepens.
    // (Only where the bank has come down to the water's level: faint water
    // in the map up on the shingle left dark wet patches on dry stone.)
    float wr = rv.r * smoothstep(0.88, 0.98, vSink);
    // (Above it, the stones and sand wet a hand's breadth or so up from the
    // water, darker and a little cooler, its edge ragged as the lapping
    // leaves it: the water met dry stone at a clean line.)
    float wetB = (1.0 - smoothstep(0.9, 2.3, vBank.y + jag * 0.6)) * (1.0 - smoothstep(0.3, 0.6, wr));
    riverC = mix(riverC, riverC * vec3(0.9, 0.92, 0.94), wetB);
    vec3 shoal = mix(riverC, waterC, 0.35) + vec3(0.01, 0.015, 0.02);
    riverC = mix(riverC, shoal, smoothstep(0.02, 0.4, wr));
    riverC = mix(riverC, waterC, smoothstep(0.35, 0.95, wr));
    // (A fine line of foam where the water laps the stones, broken, coming
    // and going with the current.)
    float lapF = smoothstep(0.3, 0.42, wr) * (1.0 - smoothstep(0.48, 0.66, wr)) * smoothstep(0.5, 0.72, brk) * (0.4 + 0.6 * vn(p * 0.7 + 2.0)) * rifNear;
    riverC = mix(riverC, mix(vec3(0.36, 0.4, 0.46), vec3(0.84, 0.88, 0.87), smoothstep(0.0, 0.45, uDay)), lapF * mix(0.5, 0.3, uDay));
    // (Over the whole of uRiverBox, so the old bed's paint never shows.)
    c = riverC;
  }
  // The people sitting on it: the ground darkened where they rest on it, and
  // warmed before them by the orb in their hands, until it rises.
  if (uCrowdOn > 0.5) {
    vec2 cu = (p - uCrowdBox.xy) / uCrowdBox.zw;
    if (cu.x > 0.0 && cu.x < 1.0 && cu.y > 0.0 && cu.y < 1.0) {
      vec3 cm = texture2D(uCrowd, cu).rgb;
      // (When its light leaves: CROWD_VERT's st.)
      float st = cm.b < 0.002 ? 0.086 : 0.13 + cm.b * 0.3;
      float held = 1.0 - smoothstep(st, st + 0.012, uGatherT);
      c *= 1.0 - 0.75 * cm.r;
      // (Only a little: from high up the warmth on the grass, more of it,
      // ran into one yellow-green patch and the people in it were lost;
      // less, their shadows and lights read as a crowd sitting with lamps.)
      c += uOrbWarm * cm.g * 0.07 * held;
    }
  }
  // And round every gathering, a soft warmth on the ground from all their
  // lights together, going as the lights rise.
  float warmK = 0.035 * (1.0 - smoothstep(0.1, 0.45, uGatherT)) * (1.0 - smoothstep(0.1, 0.5, uDay));
  if (warmK > 0.0) {
    float warm = 0.0;
    for (int i = 0; i < 8; i++) {
      vec2 q = p - uGroups[i].xy;
      float ct = cos(uGroupTurn[i]), sn = sin(uGroupTurn[i]);
      q = vec2(ct * q.x + sn * q.y, -sn * q.x + ct * q.y);
      warm += exp(-1.6 * (pow(q.x / uGroups[i].z, 2.0) + pow(q.y / uGroups[i].w, 2.0)));
    }
    // (Faint, and uneven at its edge, not a lit oval.)
    float wob = 0.5 + 0.25 * sin(p.x * 0.9 + sin(p.y * 0.6)) + 0.25 * sin(p.y * 1.3 + p.x * 0.4);
    warm *= mix(1.0, wob, smoothstep(0.85, 0.15, warm));
    c += uOrbWarm * warmK * min(warm, 1.0);
  }
  // Distance: the far land takes the sky's colour, cooled, as air does,
  // so the hills step back one behind another.
  c = mix(c, mistColour(uHaze), mist(vW, vDepth));
  c = mix(c, uHaze, smoothstep(600.0, 1800.0, vDepth) * 0.3);
  c = mix(c, uHaze, smoothstep(uFogNear, uFogFar, vDepth));
  gl_FragColor = vec4(mix(uNight, c, uShow), 1.0);
}`;

/* The chortens are 108.bt's own (public/gratitude/chorten-hero.glb, their
   chorten.glb, used with their permission), drawn with its own physically
   based materials, and lit by the scene's lights (see "The chortens" below).
   Onto that material: building it course by course from the base up, a line
   of gold light at the course being laid (uRise; aDelay: how long after the
   first this one starts), and the scene's own finish: its colours written out
   as the rest of the scene's are, its haze, its fade to the night. */
const CHORTEN_VERT_HEAD = /* glsl */ `
uniform float uRise, uBaseM, uTallM;
attribute float aDelay;
varying float vHb;
varying float vBuild;
varying float vDepthC;
`;
/* A chorten's shadow: its own shape flattened along the light (uMoon: the
   moon, then the sun) onto the stone it stands on, and past the stone's
   edge (uFootHalf from its middle) onto the ground, uDrop below; as far up
   it as it has risen (as CHORTEN_*). Dark, and darker by day. */
const CSHADOW_VERT = /* glsl */ `
uniform vec3 uMoon;
uniform float uRise, uBaseM, uTallM, uFootHalf, uDrop;
attribute float aDelay;
varying float vHb;
varying float vBuild;
void main() {
  vHb = (position.y - uBaseM) / uTallM;
  vBuild = clamp((uRise - aDelay * 0.65) / 0.35, 0.0, 1.0);
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 o = (modelMatrix * instanceMatrix * vec4(0.0, uBaseM, 0.0, 1.0)).xyz;
  vec3 L = normalize(uMoon);
  L.y = max(L.y, 0.3);
  w.xz -= L.xz * ((w.y - o.y) / L.y);
  vec2 d = abs(w.xz - o.xz);
  w.y = o.y - (max(d.x, d.y) > uFootHalf ? uDrop : 0.0) + 0.01;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const CSHADOW_FRAG = /* glsl */ `
varying float vHb;
varying float vBuild;
void main() {
  if (vBuild <= 0.0 || vHb > vBuild * 1.02) discard;
  // (Into the shadow map, darkest under the base, lighter toward the tip's
  // shadow, as the light spreads round it.)
  gl_FragColor = vec4(vec3(1.0 - 0.45 * clamp(vHb, 0.0, 1.0)), 1.0);
}`;

/* The shadow map softened: one direction of a Gaussian at a time (uStep, in
   the map's own texels). */
const BLUR_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
  float w[5];
  w[0] = 0.2270; w[1] = 0.1946; w[2] = 0.1216; w[3] = 0.0541; w[4] = 0.0162;
  float v = texture2D(uMap, vUv).r * w[0];
  for (int i = 1; i < 5; i++) v += (texture2D(uMap, vUv + uStep * float(i)).r + texture2D(uMap, vUv - uStep * float(i)).r) * w[i];
  gl_FragColor = vec4(v, v, v, 1.0);
}`;

const CHORTEN_FRAG_HEAD = /* glsl */ `
uniform vec3 uEdge, uHaze, uNight;
uniform float uFogNear, uFogFar, uShow, uDay;
varying float vHb;
varying float vBuild;
varying float vDepthC;
`;
const CHORTEN_FRAG_TAIL = /* glsl */ `
  gl_FragColor.rgb = sRGBTransferOETF(vec4(max(gl_FragColor.rgb, 0.0), 1.0)).rgb;
  float edge = (1.0 - smoothstep(0.0, 0.08, vBuild * 1.02 - vHb)) * (1.0 - smoothstep(0.96, 1.0, vBuild));
  // (Gentle, and only on those near enough to read as a course being laid:
  // far off, a few bright pixels, it blooms into a white flash; and fading
  // as the day comes up.)
  edge *= (1.0 - smoothstep(8.0, 20.0, vDepthC)) * (1.0 - smoothstep(0.1, 0.5, uDay));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdge, edge * 0.8);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, smoothstep(uFogNear, uFogFar, vDepthC));
  gl_FragColor.rgb = mix(uNight, gl_FragColor.rgb, uShow);
`;

/* The foundations: stone, lit by the night and, while the lamps are on,
   by their own spotlights from below. Under uSolo all but CHORTEN's own
   sink into the ground. */
const SOLO = /* glsl */ `
uniform float uSolo, uDim;
uniform vec3 uSoloAt;
// Its own lamps stand 1.3 out; the next site is 3.6 away.
float away(vec3 p) { return uSolo * step(1.8, distance(p.xz, uSoloAt.xz)); }
// The other sites' lamps: dimmed through the night (uDim) so the eye goes
// to CHORTEN's, and out under uSolo.
float dim(vec3 p) { return max(uSolo, uDim) * step(1.8, distance(p.xz, uSoloAt.xz)); }`;

/* The valley's trees and bushes (scripts/valley/bake_plants.py), each a card
   from Poly Haven's models (scripts/valley/bake_impostors.py): turned to the
   eye about its trunk, showing whichever of its VIEWS faces the eye, and lit
   by the moon, low, on the card's own normals, in the brief's forest greens
   (as TERRAIN_FRAG lights the land). */
/* The breeze, as 108.bt's: one wind for all that grows, its gusts rolling
   across the valley as waves along it, a small flutter riding on them;
   uWind its strength (0 under reduced motion). An offset in the wind's way
   for a thing rooted at base, to be scaled by how far it bends. (Gusts some
   forty metres apart: two and a half units.) */
// (Strengths, each thing's uSway: a blade's or tussock's tip leaning a
// quarter to a third of its height in a gust, as 108.bt's grass does; at
// a tenth of it, the first try, it barely moved.)
const WIND = /* glsl */ `
uniform float uWind;
vec2 windOff(vec2 base, float t) {
  // (Across the ending's view, which looks down the valley along x: blowing
  // with it, the leaves on it went straight away from the camera and
  // seemed to hang in the air.)
  vec2 d = normalize(vec2(0.2, 1.0));
  float g = 0.5 + 0.5 * sin(dot(base, d) * 2.8 - t * 1.3);
  g *= g;
  float fl = sin(t * 3.7 + base.x * 11.0 + base.y * 9.0);
  return (d * (0.35 + 1.0 * g) + vec2(-d.y, d.x) * fl * 0.25) * uWind;
}
// The pointer parting the grass, as 108.bt's does: away from where it meets
// the ground (uPointer), within uPushR of it, uPush how hard (eased in and
// out, so blades spring back rather than snap).
uniform vec3 uPointer;
uniform float uPush, uPushR;
vec2 pushOff(vec2 at) {
  vec2 a = at - uPointer.xz;
  float l = length(a);
  float k = uPush * (1.0 - smoothstep(0.0, uPushR, l));
  return l > 1e-5 ? a / l * k : vec2(0.0);
}
// A blade or stem leaning over from its root, away from the pointer: turned
// about the root rather than its tip slid aside, so it keeps its length and
// bows (slid, it stretched and smeared). t, 0 at the root to 1 at the tip,
// curves it, the tip leaning most.
vec3 pushBend(vec3 w, vec3 root, float t) {
  vec2 pd = pushOff(root.xz);
  float k = length(pd);
  if (k < 1e-4) return w;
  float hgt = max(w.y - root.y, 0.0);
  float th = k * 1.15 * (0.35 + 0.65 * t);
  w.xz += pd / k * hgt * sin(th);
  w.y = root.y + hgt * cos(th);
  return w;
}`;

const PLANT_VERT = /* glsl */ `
${WIND}
uniform float uTime;
attribute vec3 aPos;
attribute float aSize;
attribute float aKind;
attribute float aTurn;
attribute float aShade;
attribute float aRidge;
uniform vec4 uAspect;
uniform float uViews, uRows;
varying vec2 vUv;
varying vec3 vR;
varying vec3 vF;
varying float vDepth;
varying float vShade;
varying float vRidge;
varying float vKind;
varying vec3 vW;
varying float vUp;
varying float vFoot;
varying float vAcross;
void main() {
  vUp = uv.y;
  vAcross = uv.x;
  vec3 toEye = cameraPosition - aPos;
  vec3 f = normalize(vec3(toEye.x, 0.0, toEye.z));
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
  int k = int(aKind + 0.5);
  float aspect = k == 0 ? uAspect.x : k == 1 ? uAspect.y : k == 2 ? uAspect.z : uAspect.w;
  float w = aSize, h = aSize * aspect;
  // (A little into the ground, so it stands in it on a slope.)
  vec3 p = aPos + r * (uv.x - 0.5) * w + vec3(0.0, 1.0, 0.0) * (uv.y * h - 0.06 * h);
  // (Its height over the ground, in units, for the grass at its foot.)
  vFoot = uv.y * h - 0.06 * h;
  // (Its crown stirring in the breeze, its foot still.)
  vec2 sw = windOff(aPos.xz, uTime) * h * 0.05 * uv.y * uv.y;
  p.xz += sw;
  // Which view: the eye's way round the plant, against the plant's own turn.
  float a = atan(-f.z, f.x) - aTurn * 6.2831853;
  float view = mod(floor(a / 6.2831853 * uViews + 0.5), uViews);
  vUv = vec2((view + uv.x) / uViews, (uRows - aKind - 1.0 + uv.y) / uRows);
  vR = r;
  vF = f;
  vShade = aShade;
  vRidge = aRidge;
  vKind = aKind;
  vW = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const PLANT_FRAG = /* glsl */ `
${MIST}
uniform vec3 uMoon, uMoonCol, uAmbient, uNight, uHaze;
uniform float uFogNear, uFogFar, uShow, uDay;
uniform sampler2D uGrainMap, uNormalMap;
varying vec2 vUv;
varying vec3 vR;
varying vec3 vF;
varying float vDepth;
varying float vShade;
varying float vRidge;
varying float vKind;
varying vec3 vW;
varying float vUp;
varying float vFoot;
varying float vAcross;
void main() {
  /* The grass grown up round its foot: below a ragged line of blades the
     card is cut away and the meadow shows, so the trunk stands in the turf,
     not on it. (Cut off straight at the ground, every tree sat on the hill
     like a sticker.) A few centimetres to half a metre, some blades taller. */
  float bx = vAcross * 26.0 + vShade * 7.0;
  float bi = floor(bx);
  float bh = fract(sin(bi * 91.7 + vShade * 13.1) * 43758.5453);
  float tip = 1.0 - abs(fract(bx) - 0.5) * 2.0;
  // (Taller with distance, so it reads at every range: from far off a
  // true half-metre is under a pixel and the cut line showed again.)
  float grassH = (0.006 + 0.022 * bh * bh + vDepth * 0.0016 * (0.4 + 0.6 * bh)) * tip;
  if (vFoot < grassH) discard;
  vec4 g = texture2D(uGrainMap, vUv);
  // A ragged edge, not a cut-out (the outline dithered); and none close to
  // the eye, where a card shows itself flat.
  float h = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  if (g.a < 0.35 + 0.3 * h) discard;
  if (h < 1.0 - smoothstep(6.0, 14.0, vDepth)) discard;
  vec3 nc = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
  vec3 n = normalize(vR * nc.x + vec3(0.0, 1.0, 0.0) * nc.y + vF * nc.z);
  vec3 rl = normalize(vec3(uMoon.x, uMoon.y * 0.4, uMoon.z));
  // Lit as the ground is (TERRAIN_FRAG's L), so they sit in the same light.
  float L = clamp(dot(n, rl) * 1.05 - 0.05, 0.0, 1.0);
  // (The leaves' light and dark kept gentle: strong, single clusters flash.)
  L = clamp(L + (g.r - 0.5) * 0.3, 0.0, 1.0);
  // Lighter along the ridges, darker down the gullies; dark in at the foot,
  // where the crown shades the trunk and the ground.
  L = clamp(L * (1.0 + 0.3 * vRidge) * mix(0.45, 1.0, smoothstep(0.0, 0.35, vUp)), 0.0, 1.0);
  #define RAMP(s, m, l) mix(mix(s, m, smoothstep(0.0, 0.5, L)), l, smoothstep(0.5, 1.0, L))
  // (The canopy's greens the meadow's own, a little deeper: woodland from
  // afar is only a shade darker than the grass beside it, never a hole in
  // the hill.)
  vec3 c = RAMP(vec3(0.044, 0.084, 0.036), vec3(0.068, 0.124, 0.052), vec3(0.108, 0.162, 0.088));
  // (Rounded: lit at the top of the crown, darker toward its base, so it
  // reads as a mass of leaves, not a flat cut-out.)
  c *= mix(0.75, 1.35, smoothstep(0.25, 0.95, vUp));
  // Further off, softer: less light and dark between the crowns, and their
  // colour toward the shade under them, so a far grove reads as woodland,
  // not specks.
  float far = smoothstep(90.0, 600.0, vDepth);
  c = mix(c, vec3(0.07, 0.125, 0.054), far * 0.45);
  // Each its own green; the bushes a little lighter and warmer.
  c *= mix(vec3(0.93, 0.97, 1.04), vec3(1.04, 1.03, 0.96), vShade);
  if (vKind > 2.5) c *= vec3(1.06, 1.06, 1.0);
  float dayK = smoothstep(0.0, 0.45, uDay);
  vec3 dayC = c * vec3(1.75, 1.7, 1.5);
  c = mix(c, mix(dayC, vec3(dot(dayC, vec3(0.3, 0.59, 0.11))), 0.3), dayK);
  c = mix(c, mistColour(uHaze), mist(vW, vDepth));
  c = mix(c, uHaze, smoothstep(600.0, 1800.0, vDepth) * 0.3);
  c = mix(c, uHaze, smoothstep(uFogNear, uFogFar, vDepth));
  gl_FragColor = vec4(mix(uNight, c, uShow), 1.0);
}`;

/* The meadow close by, where the camera comes down to the ground among the
   people (their close shot, the raising's first moments): tufts of blades
   made here (BLADE_*: aH up the blade, aTone each blade's own shade), and
   among them 108.bt's dandelions (the yellow heads of their grass clumps,
   FLOWER_*, in their own colours, dimmed to the night). Each sways a little and
   sinks into the ground with distance (uFade), so it gives way to
   TERRAIN_FRAG's painted meadow with no edge; warmed by the orbs as the
   ground beneath them is (uCrowd). */
const BLADE_VERT = /* glsl */ `
${WIND}
uniform float uTime, uSway;
uniform vec2 uFade;
attribute float aH;
attribute float aTone;
varying float vH;
varying float vTone;
varying float vDepth;
varying vec3 vW;
void main() {
  vH = aH;
  vTone = aTone;
  vec4 o = viewMatrix * modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float keep = 1.0 - smoothstep(uFade.x, uFade.y, -o.z);
  vec4 w = modelMatrix * instanceMatrix * vec4(position * keep, 1.0);
  float bend = aH * aH * keep;
  // (The breeze, and each blade a little its own way on it.)
  vec4 root = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  w.xz += windOff(root.xz, uTime) * uSway * bend;
  w.x += sin(uTime * 2.1 + w.x * 13.0 + w.z * 9.0) * 0.3 * uSway * bend * uWind;
  w.xyz = pushBend(w.xyz, root.xyz, aH * keep);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

/* (The orbs' warmth on whatever stands in the meadow, as on the ground.) */
const MEADOW_WARM = /* glsl */ `
uniform vec3 uOrbWarm;
uniform float uCrowdOn, uGatherT;
uniform sampler2D uCrowd;
uniform vec4 uCrowdBox;
float orbWarm(vec3 w) {
  if (uCrowdOn < 0.5) return 0.0;
  vec2 cu = (w.xz - uCrowdBox.xy) / uCrowdBox.zw;
  if (cu.x < 0.0 || cu.x > 1.0 || cu.y < 0.0 || cu.y > 1.0) return 0.0;
  vec3 cm = texture2D(uCrowd, cu).rgb;
  float st = cm.b < 0.002 ? 0.086 : 0.13 + cm.b * 0.3;
  return cm.g * (1.0 - smoothstep(st, st + 0.012, uGatherT));
}
`;

const BLADE_FRAG = /* glsl */ `
uniform vec3 uHaze, uMoon;
uniform float uFogNear, uFogFar;
// The ground under the grass as the land draws it (TERRAIN_FRAG, its light,
// patches, wear and the people's shadows), seen from above over uGroundBox
// (x0, z0, x1, z1): each blade grows out of it in its colour.
uniform sampler2D uGround;
uniform vec4 uGroundBox;
// (Root and tip against the ground's colour: near the eye as gentle as the
// close shot's (xy), far off, from uRootFar's distances, more between them
// (zw), so a tuft still reads as one.)
uniform vec4 uRootTip;
uniform vec2 uRootFar;
varying float vH;
varying float vTone;
varying float vDepth;
varying vec3 vW;
void main() {
  vec2 gu = vec2((vW.x - uGroundBox.x) / (uGroundBox.z - uGroundBox.x), (uGroundBox.w - vW.z) / (uGroundBox.w - uGroundBox.y));
  vec3 g = texture2D(uGround, gu).rgb;
  // The meadow's ramp (TERRAIN_FRAG's): dark at the root, lighter up the
  // blade; some blades greener, some going straw.
  // Each blade lit by which way it faces: turned to the moon, lighter; edge
  // on or away, darker (either face, the blade being thin).
  vec3 bn = normalize(cross(dFdx(vW), dFdy(vW)));
  float face = abs(dot(bn, normalize(vec3(uMoon.x, 0.5, uMoon.z))));
  // The ground's own colour at the root, a shade under it where the blades
  // crowd; lighter up the blade, as its tips catch the sky; some blades
  // going straw.
  vec2 rt = mix(uRootTip.xy, uRootTip.zw, smoothstep(uRootFar.x, uRootFar.y, vDepth));
  vec3 c = g * mix(rt.x, rt.y, smoothstep(0.0, 1.0, vH)) * (0.8 + 0.4 * face) * (0.9 + 0.2 * vTone);
  c = mix(c, c * vec3(1.3, 1.18, 0.75), smoothstep(0.75, 0.98, vTone) * vH);
  c = mix(c, uHaze, smoothstep(uFogNear, uFogFar, vDepth));
  gl_FragColor = vec4(c, 1.0);
}`;

const FLOWER_VERT = /* glsl */ `
${WIND}
uniform float uTime, uSway, uTop;
uniform vec2 uFade;
attribute float aStem;
varying vec2 vUv;
varying float vH;
varying float vDepth;
varying vec3 vW;
varying float vStem;
varying float vVar;
void main() {
  vUv = uv;
  vH = clamp(position.y / uTop, 0.0, 1.0);
  vStem = aStem;
  // (Each clump its own shade, from where it stands.)
  vec4 root = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vVar = fract(sin(dot(root.xz, vec2(12.9898, 78.233))) * 43758.5453);
  vec4 o = viewMatrix * root;
  // (Further out than the grass: a head holds its shape where a blade is a
  // hair; none right at the lens, a blur across the shot.)
  float keep = (1.0 - smoothstep(uFade.x, uFade.y, -o.z)) * smoothstep(0.15, 0.35, -o.z);
  vec4 w = modelMatrix * instanceMatrix * vec4(position * keep, 1.0);
  float bend = vH * vH * keep;
  w.xz += windOff(root.xz, uTime) * uSway * bend;
  w.xyz = pushBend(w.xyz, root.xyz, vH * keep);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FLOWER_FRAG = /* glsl */ `
${MEADOW_WARM}
uniform vec3 uHaze, uNight, uTint;
uniform float uFogNear, uFogFar, uShow, uDay, uGain, uCut;
uniform sampler2D uMap;
varying vec2 vUv;
varying float vH;
varying float vDepth;
varying vec3 vW;
varying float vStem;
varying float vVar;
void main() {
  vec3 c;
  if (vStem > 0.5) {
    // The stalks: the grass's own greens, dark at the root.
    c = mix(vec3(0.05, 0.09, 0.04), vec3(0.09, 0.15, 0.065), smoothstep(0.0, 0.8, vH));
  } else {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < uCut) discard;
    // Their own colours, cooled and dimmed by the moon.
    // (Only the heads: any of the clump's grass at their edges left out.)
    if (t.r < t.b * 1.8 || t.g < t.r * 0.3 || t.r < 0.06) discard;
    c = t.rgb * uTint * uGain * (0.8 + 0.2 * vH);
    // (Some clumps a deeper gold, some a paler lemon, some brighter.)
    c *= mix(vec3(1.06, 0.93, 0.72), vec3(0.96, 1.02, 1.12), vVar) * (0.85 + 0.3 * fract(vVar * 7.13));
  }
  vec3 own = c / (uGain * 0.9);
  c += uOrbWarm * orbWarm(vW) * (0.06 + 0.5 * own) * (0.4 + 0.6 * vH);
  // (By day, the ending: lighter, as TERRAIN_FRAG's meadow.)
  c = mix(c, own * (0.55 + 0.45 * vH) * 0.75, smoothstep(0.0, 0.45, uDay));
  c = mix(c, uHaze, smoothstep(uFogNear, uFogFar, vDepth));
  gl_FragColor = vec4(mix(uNight, c, uShow), 1.0);
}`;

/* The dandelions where the camera stands higher (round CHORTEN's site): a
   head a pixel or two across, drawn as a dot of its yellow, a little
   larger than life so it reads, and gone into the meadow with distance. */
const SPECK_VERT = /* glsl */ `
uniform float uScale;
uniform vec2 uFade;
attribute float aSeed;
varying float vA;
varying float vSeed;
varying float vDepth;
varying float vSize;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vDepth = -mv.z;
  // (Far off, a pixel and fainter, not a carpet of dots.)
  float px = 0.035 * (0.8 + 0.4 * aSeed) * uScale / vDepth;
  gl_PointSize = clamp(px, 1.4, 6.0);
  vSize = gl_PointSize;
  // (And dimmer with distance, as small things go into the dusk.)
  vA = (1.0 - smoothstep(uFade.x, uFade.y, vDepth)) * clamp(px / 2.5, 0.35, 1.0) * (1.0 - 0.55 * smoothstep(15.0, 60.0, vDepth));
  vSeed = aSeed;
}`;

const SPECK_FRAG = /* glsl */ `
uniform vec3 uHaze, uNight;
uniform float uFogNear, uFogFar, uShow, uDay, uSolo;
varying float vA;
varying float vSeed;
varying float vDepth;
varying float vSize;
void main() {
  // (Not once CHORTEN stands alone (uSolo), the land gone dark round it:
  // there they read as more lights, among the contributors' own.)
  // (Round only once big enough to be: a tiny dot's soft edge is all of it.)
  float a = mix(1.0, smoothstep(0.5, 0.3, length(gl_PointCoord - 0.5)), smoothstep(2.0, 4.0, vSize)) * vA * (1.0 - uSolo);
  if (a < 0.02) discard;
  // Dandelion yellow, dimmed and cooled under the moon; its own at dawn.
  vec3 c = mix(vec3(0.62, 0.44, 0.05), vec3(0.7, 0.55, 0.08), vSeed);
  c = mix(c * vec3(0.85, 0.85, 0.95), c * 1.1, smoothstep(0.0, 0.45, uDay));
  c = mix(c, uHaze, smoothstep(uFogNear, uFogFar, vDepth));
  gl_FragColor = vec4(mix(uNight, c, uShow), a);
}`;

/* The shade where a foundation or a lamp meets the ground (aShade: how dark). */
const CONTACT_VERT = /* glsl */ `
${SOLO}
attribute float aShade;
varying float vShade;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vShade = aShade * (1.0 - away(w.xyz));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const CONTACT_FRAG = /* glsl */ `
uniform float uShow;
varying float vShade;
void main() {
  gl_FragColor = vec4(0.0, 0.0, 0.0, vShade * uShow);
}`;

const FOUND_VERT = /* glsl */ `
${SOLO}
varying vec3 vN;
varying float vDepth;
varying float vH;
varying vec3 vW;
void main() {
  vH = position.y;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  w.y -= 0.6 * away((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FOUND_FRAG = /* glsl */ `
precision highp float;
${LIT}
uniform vec3 uCol;
uniform float uGlow;
uniform sampler2D uStone;
varying vec3 vN;
varying float vDepth;
varying float vH;
varying vec3 vW;
void main() {
  // Laid stone: the rock texture across the top and down the sides.
  vec3 n = normalize(vN);
  vec2 uv = abs(n.y) > 0.5 ? vW.xz : vec2(vW.x + vW.z, vW.y);
  // (uStone: the ground's grain, its rock in alpha.)
  vec3 stone = uCol * (0.55 + 0.75 * texture2D(uStone, uv * 0.9).aaa);
  vec3 c = lit(stone, n, vDepth) * 0.5 + stone * 0.06 * uGlow * uShow;
  gl_FragColor = vec4(c, 1.0);
}`;

/* A spotlight's beam: brightest at the lamp, fading up its length, with a
   faint slow shimmer as if through night air. */
const BEAM_VERT = /* glsl */ `
${SOLO}
varying float vH;
varying vec3 vN;
varying vec3 vView;
varying float vOn;
void main() {
  vH = position.y;
  vOn = 1.0 - dim((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vView = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const BEAM_FRAG = /* glsl */ `
precision mediump float;
uniform vec3 uCol;
uniform float uAlpha, uH, uTime;
varying float vH;
varying vec3 vN;
varying vec3 vView;
varying float vOn;
void main() {
  if (vOn < 0.01) discard;
  float t = clamp(vH / uH, 0.0, 1.0);
  float fall = pow(1.0 - t, 2.2);
  // Brighter where the beam is seen edge-on, so it reads as a volume.
  float rim = 1.0 - abs(dot(normalize(vN), vView));
  float shimmer = 0.85 + 0.15 * sin(uTime * 1.3 + vH * 3.0);
  gl_FragColor = vec4(uCol, uAlpha * vOn * fall * (0.12 + 0.5 * rim * rim) * shimmer);
}`;

/* Originkit's Cloud Sky noise, as 108.bt's sky uses it (its
   surroundings/cloud-noise.glsl.js): the puffs, their erosion and shade.
   Reads uSize, uCoverage and uShadow as globals. */
const CLOUD_NOISE = /* glsl */ `
vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}
float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float vnoise2(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm2(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise2(p); p *= 2.03; a *= 0.5; }
  return s;
}
vec2 blobs(vec2 uv, float seed) {
  vec2 id = floor(uv), f = fract(uv);
  float best = -1e4, wsum = 0.0, ysum = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 h = hash22(id + o + seed);
      if (fract(h.x * 37.1) > uCoverage) continue;
      vec2 c = o + 0.15 + h * 0.7;
      float w = min(2.15, (0.30 + 0.42 * fract(h.y * 19.7)) * uSize);
      vec2 d = f - c;
      float ry = (d.y > 0.0 ? 0.34 : 0.19) * uSize * (0.8 + 0.5 * fract(h.y * 7.3));
      float e = length(vec2(d.x / max(w, 1e-3), d.y / max(ry, 1e-3)));
      float val = 1.0 - e;
      float yN = d.y / max(ry, 1e-3);
      if (val > best) {
        float k = exp(12.0 * (best - val));
        wsum = wsum * k + 1.0; ysum = ysum * k + yN; best = val;
      } else {
        float g = exp(12.0 * (val - best));
        wsum += g; ysum += g * yN;
      }
    }
  }
  return vec2(best, ysum / max(wsum, 1e-4));
}
vec2 cloudField(vec2 uv, float seed, float detailScale) {
  vec2 b = blobs(uv, seed);
  float n = fbm2(uv * detailScale + seed * 3.1) * 0.72 + fbm2(uv * detailScale * 3.3 + seed * 7.7) * 0.28;
  return vec2(b.x - (1.0 - n) * 0.7, b.y);
}
vec3 shadeCloud(float dyNorm, vec3 sky, vec3 cloudCol) {
  float t = smoothstep(-0.95, 0.25, dyNorm);
  vec3 base = mix(cloudCol * 0.52, sky, 0.34);
  return mix(mix(cloudCol, base, uShadow), cloudCol, t);
}`;

/* The sky: a dome round the camera, zenith to horizon, with the sun's glow
   and, at night, stars. */
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uZenith, uHorizon, uGlow, uSun, uMoonDir, uNight;
uniform float uStars, uMoonAmt, uSunAmt, uShow, uTime, uClouds;
uniform vec3 uCloudCol;
// Originkit's cloud parameters, as 108.bt's sky sets them.
const float uCoverage = 1.0;
const float uSize = 1.3;
const float uSoftness = 2.25;
const float uShadow = 0.7;
const float PI = 3.14159265;
varying vec3 vDir;
${CLOUD_NOISE}
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + 1.0), f.x), f.y), f.z);
}
// One layer of stars: a few per cell, each a different brightness and colour.
vec3 stars(vec3 d, float scale, float density) {
  vec3 cell = floor(d * scale);
  float r = hash(cell);
  if (r < 1.0 - density) return vec3(0.0);
  vec3 at = (cell + 0.5 + (vec3(hash(cell + 1.1), hash(cell + 2.3), hash(cell + 3.7)) - 0.5) * 0.7) / scale;
  float dist = length(d - normalize(at)) * scale;
  float mag = pow(hash(cell + 5.9), 6.0);
  float core = exp(-dist * dist * 60.0) * (0.3 + 1.6 * mag);
  float tw = 0.75 + 0.25 * sin(uTime * (1.5 + 3.0 * hash(cell + 7.1)) + hash(cell) * 50.0);
  float t = hash(cell + 9.3);
  vec3 tint = t < 0.15 ? vec3(1.0, 0.82, 0.68) : t < 0.35 ? vec3(0.78, 0.86, 1.0) : vec3(1.0, 0.98, 0.95);
  return tint * core * tw;
}
// The clouds at a way round the sky (az) and height (elev), over the sky's
// colour c: their colour, and in alpha how thickly they cover it.
vec4 cloudsAt(float az, float elev, vec3 c, vec3 cloudCol) {
  vec2 q = vec2(az * 6.0, elev * 6.0);
  float drift = uTime * 1.28;
  vec3 col = c;
  vec2 cuv = vec2(q.x * 1.4 - drift * 0.014, q.y * 5.5);
  float veil = fbm2(cuv) * fbm2(cuv * 2.3 + 9.0);
  veil = smoothstep(0.24, 0.55, veil) * smoothstep(0.15, 0.7, q.y);
  col = mix(col, cloudCol, veil * 0.35);
  vec2 fd = cloudField(vec2(q.x - drift * 0.026, q.y) * 2.15, 17.0, 11.0);
  float fa = clamp(fd.x * uSoftness, 0.0, 1.0);
  col = mix(col, mix(shadeCloud(fd.y, c, cloudCol), c, 0.55), fa);
  vec2 nuv = vec2(q.x - drift * 0.055, q.y) * 1.05;
  vec2 nd = cloudField(nuv, 3.0, 8.5);
  float na = clamp(nd.x * uSoftness, 0.0, 1.0);
  col = mix(col, shadeCloud(nd.y, c, cloudCol), na);
  return vec4(col, max(fa, na));
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float cover = 0.0;
  vec3 c = mix(uHorizon, uZenith, pow(smoothstep(-0.05, 0.6, h), 0.7));
  // Sun: a broad warm glow along the horizon and a brighter one near it.
  float sun = max(dot(d, uSun), 0.0);
  c += uGlow * (pow(sun, 4.0) * 0.5 + pow(sun, 32.0) * 0.7) * smoothstep(-0.15, 0.2, h);
  float above = smoothstep(-0.02, 0.12, h);
  if (uStars > 0.0) {
    // A moonlit sky: only the brighter stars show, sparse and gentle.
    vec3 st = stars(d, 110.0, 0.022) + stars(d, 220.0, 0.012) * 0.6;
    float moonWash = 1.0 - smoothstep(0.9, 0.99, dot(d, uMoonDir));
    c += st * 0.8 * uStars * above * moonWash;
  }
  // Clouds as 108.bt draws them (Originkit's Cloud Sky): two layers of
  // puffs with rounded tops and flat bases, eroded by noise, and a high
  // cirrus veil, laid round the sky by direction and drifting; lit by the
  // moon at night, white by day.
  {
    float elev = asin(clamp(d.y, 0.0, 1.0));
    float az = atan(d.x, -d.z);
    float lit = pow(max(dot(d, uMoonDir), 0.0), 5.0) * uMoonAmt;
    vec3 cloudCol = mix(uCloudCol, vec3(0.72, 0.75, 0.86), lit);
    vec4 cl = cloudsAt(az, elev, c, cloudCol);
    // (Where the way round comes back to its start, due south behind the
    // valley, the pattern meets its other end; faded from one to the other
    // there, or it stood as a straight seam up the sky.)
    const float SEAM = 0.35;
    if (abs(az) > PI - SEAM) {
      float u = az < 0.0 ? az + 2.0 * PI : az;
      vec4 a = cloudsAt(u, elev, c, cloudCol), b = cloudsAt(u - 2.0 * PI, elev, c, cloudCol);
      cl = mix(a, b, smoothstep(PI - SEAM, PI + SEAM, u));
    }
    c = mix(c, cl.rgb, smoothstep(0.0, 0.12, d.y) * uClouds);
    cover = cl.a * uClouds;
  }
  if (uMoonAmt > 0.0) {
    // The moon: a pale disc with faint seas, in a soft halo.
    float m = dot(d, uMoonDir);
    float disc = smoothstep(0.99978, 0.99983, m);
    float seas = 1.0 - 0.18 * smoothstep(0.45, 0.75, n3(d * 160.0 + 2.0));
    // Over the clouds, dimmed where they are thick, so it shows through a thin one.
    float veiled = 1.0 - 0.7 * cover;
    c += vec3(0.6, 0.64, 0.78) * (pow(max(m, 0.0), 2500.0) * 0.5 + pow(max(m, 0.0), 90.0) * 0.28) * uMoonAmt * veiled;
    c = mix(c, vec3(0.96, 0.95, 0.9) * seas, disc * uMoonAmt * veiled);
  }
  if (uSunAmt > 0.0) {
    // The sun by day, where the moon hung by night: a small white disc in a
    // warm haze, dimmed behind the clouds.
    float m = max(dot(d, uSun), 0.0);
    float veiled = 1.0 - 0.75 * cover;
    c += vec3(1.0, 0.96, 0.86) * (pow(m, 1200.0) * 0.6 + pow(m, 90.0) * 0.12 + pow(m, 12.0) * 0.015) * uSunAmt * veiled;
    c = mix(c, vec3(1.0, 0.99, 0.95), smoothstep(0.99955, 0.99965, m) * uSunAmt * veiled);
  }
  gl_FragColor = vec4(mix(uNight, c, uShow), 1.0);
}`;

/* Dots are sized in world units: px = size * uScale / depth, uScale being the
   drawing buffer's height. */
const DOT = /* glsl */ `
uniform float uTime, uScale, uSize, uMaxPx, uAlpha;
float dotPx(float depth, float size) { return clamp(size * uScale / depth, 1.0, uMaxPx); }
`;

/* Small flowers in that grass: specks of gold, dim under the moon; and a few
   fireflies over the crowd's grass, drifting, each in its own slow flicker. */
const FLECK_VERT = /* glsl */ `
${DOT}
attribute float aSeed;
uniform float uFly;
// (A soft glow with a halo, uSoft.)
uniform float uSoft;
varying float vA;
varying float vSeed;
void main() {
  vec3 p = position;
  // (The fireflies drift and bob; the flowers stay put.)
  p += uFly * vec3(sin(uTime * 0.3 + aSeed * 40.0), 0.6 * sin(uTime * 0.5 + aSeed * 17.0), cos(uTime * 0.27 + aSeed * 23.0)) * 0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  // (Soft, the point drawn larger to hold its halo.)
  gl_PointSize = dotPx(d, uSize * (0.7 + aSeed * 0.6)) * (1.0 + 1.6 * uSoft);
  vA = uAlpha * (1.0 - smoothstep(25.0, 60.0, d));
  // A slow flicker; soft, a brief glow and a long dark, as 108.bt's.
  float flick = smoothstep(0.2, 0.9, sin(uTime * (0.8 + aSeed) + aSeed * 60.0) * 0.5 + 0.5);
  float beat = sin(uTime * (0.6 + fract(aSeed * 0.37) * 0.9) + aSeed * 60.0);
  float glow = 0.12 + 0.88 * pow(max(beat, 0.0), 3.0);
  vA *= mix(1.0, mix(flick, glow, uSoft), uFly);
  vSeed = aSeed;
}`;

const FLECK_FRAG = /* glsl */ `
precision mediump float;
uniform vec3 uCol;
uniform highp float uSoft;
varying float vA;
varying float vSeed;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.15, d);
  // (Soft: a small bright core in a wide halo.)
  float r = d * 2.0;
  a = mix(a, smoothstep(0.14, 0.0, r) + exp(-r * r * 7.0) * 0.55, uSoft) * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uCol * (0.85 + 0.3 * vSeed), a);
}`;

/* Work-lights: soft white pools that breathe and take the crowd's pulse. */
const LIGHT_VERT = /* glsl */ `
${DOT}
${SOLO}
uniform float uPulse, uMinPx;
attribute float aSeed;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = max(dotPx(d, uSize * (0.8 + aSeed * 0.4)), uMinPx);
  vA = uAlpha;
  vA *= 1.0 - dim(position);
}`;

const LIGHT_FRAG = /* glsl */ `
precision mediump float;
uniform vec3 uCol, uCore;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float halo = smoothstep(0.5, 0.0, d);
  float core = smoothstep(0.24, 0.1, d) * 0.35;
  gl_FragColor = vec4(mix(uCol, uCore, core), (halo * halo * 0.5 + core) * vA);
}`;

/* The people on the bank: one seated figure (public/gratitude/figure.glb,
   scripts/figure/build_figure.py), instanced in rows, each lit almost only by
   the orb in its own hands, as the photographs of the night show them. Its
   parts (aPart: robe, skin, cuff, hair) take their colours here, the robe
   each person's own (aTint). uOrbAt is the orb in the figure's own metres. */
const FIG_VERT = /* glsl */ `
attribute float aPart;
attribute float aHair;
attribute float aFold;
attribute float aGrey;
attribute vec3 aTint;
// When this person's own orb leaves (its aOrder), against the lights' uGather.
attribute float aLeave;
uniform float uGather;
// The first light's way up from the hands so far (the scene's firstUp, less
// where it started), and where its orb sits in the figure.
uniform vec3 uFirstOff, uOrbAt;
varying float vHeld;
varying float vBall;
varying vec3 vLocal;
varying vec3 vNl;
varying vec3 vN;
varying float vDepth;
varying float vPart;
varying vec3 vTint;
varying float vHair;
varying float vGrey;
varying vec3 vWorld;
varying float vFold;
void main() {
  vHair = aHair;
  vFold = aFold;
  vGrey = aGrey;
  vLocal = position;
  vNl = normal;
  // Their hands go dark as the orb rises out of them: as its light leaves
  // (CROWD_VERT's st; the first's a little after, as its lift is gentler),
  // quickly, gone by the time the light is clear of the hands (the people
  // are small: a few centimetres), or the orb is seen twice.
  float st = aLeave < 0.00001 ? 0.086 : 0.13 + aLeave * 0.3;
  vHeld = 1.0 - smoothstep(st, st + 0.012, uGather);
  vPart = aPart;
  vTint = aTint;
  // The first person's orb itself goes up with its light, along the same way
  // as the light and the camera beside it, shrinking into the light's glow
  // as it climbs: put out where it sat, it left the glow alone in a frame,
  // round and flat where a lit ball had been, and the light seemed to jump.
  float first = 1.0 - step(0.00001, aLeave);
  float ball = step(6.5, aPart) * step(aPart, 7.5) * first;
  vBall = mix(vHeld, 1.0 - smoothstep(0.1, 0.2, uGather), first);
  vec3 lp = mix(position, uOrbAt + (position - uOrbAt) * vBall, ball);
  vec4 w = modelMatrix * instanceMatrix * vec4(lp, 1.0);
  w.xyz += uFirstOff * ball;
  vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FIG_FRAG = /* glsl */ `
precision highp float;
${LIT}
uniform vec3 uOrbAt, uOrbCol;
uniform float uOrbOn;
varying float vHeld;
varying float vBall;
varying vec3 vLocal;
varying vec3 vNl;
varying vec3 vN;
varying float vDepth;
varying float vPart;
varying vec3 vTint;
varying float vHair;
varying float vGrey;
varying vec3 vWorld;
varying float vFold;
void main() {
  // The gho's weave: fine stripes running down it, two shades of the
  // person's colour with a gold thread every few, as the night's ghos were.
  float a = atan(vLocal.x, vLocal.z) * 9.55;
  vec3 robe = vTint * mix(0.78, 1.15, step(0.5, fract(a * 0.5)));
  robe = mix(robe, vec3(0.62, 0.48, 0.22), smoothstep(0.86, 0.96, fract(a)) * step(0.66, fract(floor(a) / 3.0)) * 0.55);
  // (The cloth's own shade: under the pouch, along the front's overlap.)
  robe *= 1.0 - 0.8 * vFold;
  vec3 base = vPart < 0.5 || vPart > 7.5 ? robe
    // Skin, with the hair painted on the scalp (black, or grey for some).
    : vPart < 1.5 ? mix(vec3(0.42, 0.28, 0.2), mix(vec3(0.035, 0.03, 0.03), vec3(0.42, 0.41, 0.4), vGrey), smoothstep(0.25, 0.6, vHair))
    // (The lagey, shaded inside its opening.)
    : vPart < 2.5 ? vec3(0.85, 0.83, 0.78) * (1.0 - 0.8 * vFold)
    : vPart < 3.5 ? vec3(0.03, 0.025, 0.025)
    : vPart < 4.5 ? vec3(0.5, 0.48, 0.46)
    // Knee-length socks, dark; the kera woven in bands of gold and red.
    : vPart < 5.5 ? vec3(0.13, 0.115, 0.105)
    : mix(vec3(0.55, 0.4, 0.16), vec3(0.45, 0.12, 0.1), step(0.5, fract(vLocal.y * 90.0)));
  // The orb's light: falling off over a hand's breadth or two, wrapping a
  // little round the side away from it.
  vec3 L = uOrbAt - vLocal;
  float d = length(L);
  float diff = max(dot(normalize(vNl), L / d), 0.0);
  // (Far enough to reach down over the lap and knees below it.)
  float fall = 1.0 / (1.0 + pow(d / 0.3, 2.0));
  vec3 glow = uOrbCol * (diff * 0.85 + 0.15) * fall * 2.4 * uOrbOn * vHeld;
  float fog = smoothstep(uFogNear, uFogFar, vDepth);
  vec3 c = lit(base * 0.35, normalize(vN), vDepth) + base * glow * (1.0 - fog) * uShow;
  // Settled on the ground: darker where the cloth and legs rest on it.
  c *= mix(0.55, 1.0, smoothstep(0.0, 0.12, vLocal.y));
  // The orb itself, resting in the hands: lit from within, brightest where
  // it faces the eye, gone once it has risen out of them (its light flies on).
  if (vPart > 6.5 && vPart < 7.5) {
    if (vBall < 0.02) discard;
    float facing = abs(dot(normalize(vN), normalize(cameraPosition - vWorld)));
    // (Fading with distance: far off the orb is a speck the bloom swells,
    // and a gathering's specks run together into a glaring bar. Its light
    // there is the crowd's own, which allows for that.)
    c = uOrbCol * (0.4 + 0.45 * facing) * uShow * mix(1.0, 0.12, smoothstep(12.0, 45.0, vDepth));
  }
  gl_FragColor = vec4(c, 1.0);
}`;

/* The attendees. Sitting, each is a gold orb in the crowd; at 3:00 AM they
   leave the bank one by one, arc through the air and settle into the
   chorten from its base up, where the contributors' lights come on. */
const CROWD_VERT = /* glsl */ `
${DOT}
uniform float uReveal, uSel, uRot, uPulse, uMinPx, uDotSize, uGrow;
// A trail: the same lights drawn again a little behind on their flight
// (uLag, in uGather and uDescend), fainter (uGhost); 0 for the lights themselves.
uniform float uLag, uGhost;
// The breath (0..1): a wave of light up the finished chorten, base to spire,
// leaving it a little brighter; uTall, the chorten's height in position.y.
uniform float uBreath, uTall;
uniform vec3 uFoot;
/* The mandala in the sky (public/assets/Mandala.webp, traced): its centre,
   the two axes of its face (turned to the camera below it), its radius, and
   how far it has turned. aMand is each light's place in it, -1..1. */
uniform vec3 uMandC, uMandU, uMandV;
uniform float uMandR, uSpin;
// Up (uGather) to the mandala, then down (uDescend) to the foundation.
uniform float uGather, uDescend;
// The river of light: one curve from the mandala's rim to the foundation's
// side (a cubic, uS0..uS3), which every light follows on its way down.
uniform vec3 uS0, uS1, uS2, uS3;
attribute vec3 aScatter;
attribute vec2 aMand;
attribute float aRand, aOrder, aId, aHit;
varying float vA;
varying float vHot;
varying float vFar;
// (Held in the hands and seen from beyond the gathering's own shot: 1.)
varying float vAmber;
// Of each light's way down (e): drawn in to the mandala's centre (to JOINF),
// out along the river of light to the foundation (to FL), then wound up the
// chorten's own surface.
const float JOINF = 0.18;
const float FL = 0.7;
// Of uGather, the camera's move round to the person's side before any rise.
const float PAN = 0.07;
void main() {
  /* Each light goes up by its distance from the first (aOrder: 0 the one orb
     the camera watches, 1 the furthest), so that one rises alone to the
     mandala's centre, its neighbours follow to the rings round it, and so on
     out, the mandala drawing itself from the middle. They come down in the
     same order and take the chorten's places lowest first, so it still
     builds from its base. */
  float first = 1.0 - step(0.00001, aOrder);
  float g = uGather - uLag;
  // All rise together (the first a moment ahead, nearest after it, furthest last)...
  // (Nothing moves until the camera has come round to the person's side.)
  float st = PAN + 0.06 * (1.0 - first) + aOrder * 0.3;
  float up = smoothstep(st, st + 0.4, g);
  // (The first leaves the hands gently: the camera is beside it, under a
  // metre off, and at the others' pace it is over the person's head at once.
  // As firstUp has it.)
  up = mix(up, pow(up, 1.6), first);
  // ...wait in a halo turning round the mandala, and are taken into it from
  // the centre outward, ring by ring, each winding anticlockwise into place.
  float rr = clamp(length(aMand) / 0.9, 0.0, 1.0);
  float join = max(first, smoothstep(0.55 + rr * 0.33, 0.67 + rr * 0.33, g));
  // (A long, unhurried way down each, so the stream can be followed.)
  // Down, from the centre out (aOrder 0 first): the mandala drains into its
  // centre ring by ring and pours out from there, the first light leading.
  // The places in the chorten are dealt in the same order, lowest first.
  float e = smoothstep(aOrder * 0.25, aOrder * 0.25 + 0.75, uDescend - uLag);
  float cs = cos(uSpin), sn = sin(uSpin);
  vec2 m2 = vec2(cs * aMand.x - sn * aMand.y, sn * aMand.x + cs * aMand.y);
  vec3 inPlane = (uMandU * m2.x + uMandV * m2.y) * uMandR;
  vec3 M = uMandC + inPlane;
  vec2 dir2 = length(m2) > 0.0001 ? normalize(m2) : vec2(1.0, 0.0);
  float wait = 1.0 - join;
  float ha = -2.4 * wait;
  vec2 hd = vec2(cos(ha) * dir2.x - sin(ha) * dir2.y, sin(ha) * dir2.x + cos(ha) * dir2.y);
  vec2 h2 = hd * mix(length(m2), 1.0 + 0.25 * aRand, wait);
  vec3 H = uMandC + (uMandU * h2.x + uMandV * h2.y) * uMandR;
  float c = cos(uRot), s = sin(uRot);
  vec3 lp = position * uGrow;
  vec3 t = vec3(c * lp.x + s * lp.z, lp.y, -s * lp.x + c * lp.z) + uFoot;
  vec3 from = aScatter;
  // Held in someone's hands: it rises and falls a little with their breath.
  from.y += sin(uTime * 0.9 + aRand * 40.0) * 0.003;
  /* Up: out of the hands, straight up, then in to its place in the mandala
     from below. Down: into the river of light at the mandala's rim, along it
     to the foundation's side, low down; then a coil round the chorten's axis,
     drawing in and climbing to the light's own place. */
  vec2 rt = t.xz - uFoot.xz;
  // The winding begins where the river ends, at the foundation's edge.
  vec2 r3 = uS3.xz - uFoot.xz;
  float th0 = atan(r3.y, r3.x) + (aRand - 0.5) * 1.0;
  float r0 = length(r3);
  float h0 = uS3.y;
  float th1 = atan(rt.y, rt.x);
  // Always the same way round, and at most one turn more than it needs.
  float dth = -(mod(th0 - th1, 6.2831853) + 6.2831853 * floor(aRand * 1.999));
  vec3 p;
  if (e <= 0.0) {
    float m = 1.0 - up;
    vec3 a1 = from + vec3(0.0, 6.0 + aRand * 4.0, 0.0);
    vec3 a2 = H - (H - uMandC) * 0.3 - vec3(0.0, 3.0, 0.0);
    p = m * m * m * from + 3.0 * m * m * up * a1 + 3.0 * m * up * up * a2 + up * up * up * H;
  } else if (e < JOINF) {
    // Drawn in: winding anticlockwise in the mandala's face to its centre.
    float q = smoothstep(0.0, 1.0, e / JOINF);
    float a = 2.4 * q;
    vec2 d2 = vec2(cos(a) * m2.x - sin(a) * m2.y, sin(a) * m2.x + cos(a) * m2.y) * (1.0 - q);
    p = uMandC + (uMandU * d2.x + uMandV * d2.y) * uMandR;
  } else if (e < FL) {
    // Out along the river of light: a braid of two strands turning about the
    // curve, wider over the water, closing to nothing at the foundation.
    float k = (e - JOINF) / (FL - JOINF);
    float m = 1.0 - k;
    vec3 c = m * m * m * uS0 + 3.0 * m * m * k * uS1 + 3.0 * m * k * k * uS2 + k * k * k * uS3;
    vec3 T = normalize(3.0 * m * m * (uS1 - uS0) + 6.0 * m * k * (uS2 - uS1) + 3.0 * k * k * (uS3 - uS2));
    vec3 Nn = normalize(cross(T, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
    vec3 B = cross(Nn, T);
    float strand = step(0.5, fract(aRand * 5.3));
    float phi = k * 18.0 + strand * 3.14159 + (fract(aRand * 11.1) - 0.5) * 0.7;
    float rad = mix(1.8, 0.6, k) * (0.8 + 0.4 * fract(aRand * 17.3)) * (1.0 - smoothstep(0.85, 1.0, k)) * smoothstep(0.0, 0.08, k);
    p = c + (Nn * cos(phi) + B * sin(phi)) * rad;
  } else {
    float k = (e - FL) / (1.0 - FL);
    float f = 1.0 - (1.0 - k) * (1.0 - k);
    float th = th0 + dth * f;
    // In to the chorten's own outline first, then up it to its place.
    float rr = mix(r0, length(rt), smoothstep(0.0, 0.35, f));
    p = vec3(uFoot.x + cos(th) * rr, mix(h0, t.y, f), uFoot.z + sin(th) * rr);
  }
  p += vec3(sin(uTime * 0.7 + aRand * 40.0), cos(uTime * 0.6 + aRand * 30.0), 0.0) * 0.005 * e;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // Held, its glow is drawn from the near side of the orb, along the line of
  // sight (so not moving on screen): the fingers cupped round it, at about its
  // middle, would otherwise cut dark shapes out of the glow.
  mv.xyz -= normalize(mv.xyz) * 0.026 * (1.0 - smoothstep(0.0, 0.05, up)) * (1.0 - step(0.0001, e));
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  float rv = step(0.5, aId) * smoothstep(aRand * 0.8, aRand * 0.8 + 0.2, uReveal);
  float sel = (aId > 0.5 && abs(aId - uSel) < 0.5) ? 1.0 : 0.0;
  vHot = max(sel, aHit * 0.7);
  // The first orb a little larger and brighter: the one the eye follows.
  // (Larger still while it climbs, the camera riding beside it.)
  // The first light grows only as it rises: in the hands it is one of many.
  float risen = smoothstep(0.0, 0.05, up);
  float firstBig = first * risen * (0.5 + 1.5 * up * (1.0 - step(0.0001, e)));
  float orb = max(dotPx(d, uSize * (0.8 + aRand * 0.4) * (1.0 + firstBig)), uMinPx * (1.0 + 0.6 * first * risen));
  float settled = max(dotPx(d, uDotSize * (1.0 + rv * 1.4 + aHit * 2.0 + sel * 4.0)), 1.5);
  // An orb, at its true size, all the way across, except that once it leaves
  // the hands one passing close by the camera is drawn no larger than a few
  // dozen pixels (only the first keeps its size: it is the subject); drawn in
  // small for the swirl, so it reads as threads of light, not a glare.
  // (Smaller still on the way down, where they arrive close by the camera.)
  float flyPx = mix(min(orb, uMinPx * mix(14.0, 6.0, step(0.0001, e))), orb, max(first * (1.0 - step(0.0001, e)), 1.0 - smoothstep(0.0, 0.06, up)));
  gl_PointSize = mix(max(flyPx, settled * 2.0), settled * 1.3, smoothstep(FL - 0.08, FL + 0.08, e));
  gl_PointSize = mix(gl_PointSize, settled, smoothstep(FL + 0.08, 1.0, e));
  // (Steady for the first: the subject should not flicker.)
  // (Steady while held: a lamp in the hands, not a flicker; the first always.)
  float tw = mix(0.75 + 0.25 * sin(uTime * (1.0 + aRand * 2.0) + aRand * 60.0), 1.0, max(first, 1.0 - smoothstep(0.0, 0.05, up)));
  // Seen from far off an orb is smaller than the least it is drawn at, so it
  // gives only its share of light: a gathering reads as a soft field of
  // lights from across the valley, not a solid patch of overlapping dots.
  // (In proportion to its size, not softened: there they crowd together on
  // screen and, added up, would glare as solid bars.)
  float share = clamp(uSize * uScale / d / uMinPx, 0.04, 1.0);
  // (Far off a light is a few pixels, nearly all its pale core: so its core
  // is taken toward the gold of its halo there, or a gathering reads beige.)
  vFar = (1.0 - share) * (1.0 - up);
  vAmber = (1.0 - smoothstep(0.0, 0.05, up)) * smoothstep(15.0, 40.0, d);
  vA = uAlpha * tw * mix(share, 1.0, up) * mix(1.0, mix(0.55, 1.0, rv), e);
  vA = max(vA, vHot * uAlpha);
  // Only once a light is in its place.
  float rest = smoothstep(0.96, 1.0, e);
  float front = uBreath * 1.3 - 0.15;
  float swell = exp(-pow((position.y / uTall - front) / 0.06, 2.0)) * (1.0 - smoothstep(0.85, 1.0, uBreath));
  vA *= 1.0 + rest * (1.1 * swell + 0.2 * smoothstep(0.0, 0.6, uBreath));
  gl_PointSize *= 1.0 + rest * 0.3 * swell;
  // Brighter, and trailed, only over the river, so the stream reads there
  // without the swirl, bunched at the foundation, running to a glare.
  // (Not where an orb is already large on screen: that would glare.)
  float rising = smoothstep(0.0, 0.04, up) * (1.0 - smoothstep(0.8, 1.0, up)) * (1.0 - step(0.0001, e));
  float falling = smoothstep(0.0, 0.04, e) * (1.0 - smoothstep(FL - 0.15, FL - 0.03, e));
  float flying = max(rising, falling) * (1.0 - smoothstep(uMinPx * 4.0, uMinPx * 12.0, flyPx));
  vA *= (1.0 + 0.8 * rising * flying) * (1.0 + 0.6 * first * risen * (1.0 - smoothstep(FL - 0.1, FL, e)));
  // In the river all of them pass close together: each gives a share, so it
  // reads as a stream of lights, not a beam.
  // Winding up the chorten to their places they bunch at the build's top
  // edge: dimmed there, so it reads as lights gathering, not a glare.
  vA *= 1.0 - 0.55 * smoothstep(FL, FL + 0.05, e) * (1.0 - smoothstep(0.94, 1.0, e));
  vA *= 1.0 - 0.3 * smoothstep(0.0, JOINF, e) * (1.0 - smoothstep(FL - 0.05, FL + 0.05, e));
  // Held in the mandala: a slow ripple of light out from its centre.
  float held = up * join * (1.0 - step(0.0001, e));
  vA *= 1.0 + held * 0.35 * sin(uTime * 1.3 - length(aMand) * 9.0);
  // (Softer while held in it, and softer still toward its centre, where
  // they lie thickest: added up there and spread by the bloom, the mandala
  // shone as a glaring white sun.)
  float heart = 1.0 - smoothstep(0.0, 0.45, length(aMand));
  vA *= 1.0 - held * (0.3 + 0.62 * heart);
  gl_PointSize *= 1.0 - held * 0.4 * heart;
  // (And as the mandala drains, all of them funnel through its centre on
  // the way to the river of light: there, thousands on one spot added up to
  // a glaring white sun. Fainter close to it.)
  float funnel = (1.0 - smoothstep(0.0, uMandR * 0.4, distance(p, uMandC))) * step(0.0001, e) * (1.0 - smoothstep(FL - 0.1, FL, e));
  vA *= 1.0 - 0.85 * funnel;
  if (uLag > 0.0) {
    // (No trail behind the first: at its size it shows as a shaky double.)
    flying *= 1.0 - first;
    vA *= uGhost * flying;
    vHot = 0.0;
  }
}`;

const CROWD_FRAG = /* glsl */ `
precision mediump float;
uniform vec3 uCol, uCore, uHotCol;
varying float vA;
varying float vHot;
varying float vFar;
varying float vAmber;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float halo = smoothstep(0.5, 0.0, d);
  float core = smoothstep(0.24, 0.1, d);
  vec3 col = mix(mix(uCol, mix(uCore, uCol * 1.25, 0.75 * vFar), core), uHotCol, vHot);
  // (Far off, still held, a deeper amber: added over the grass, its gold ran
  // to a lemon yellow and a gathering read as a patch of flowers, not lamps.)
  // (Far off, still held, the brand's gold (#C8A663) in hue, richer and a
  // little brighter, so they glow as lamps: in its own pale tone, over the
  // grass, they went dull.)
  vec3 brand = vec3(0.86, 0.64, 0.26);
  col = mix(col, brand * 1.18 * dot(col, vec3(0.3, 0.5, 0.2)) / dot(brand, vec3(0.3, 0.5, 0.2)), 0.85 * vAmber * (1.0 - vHot));
  gl_FragColor = vec4(col, (halo * halo * 0.85 + core) * vA);
}`;

/* The people under the lights, seen from afar: each a small dark seated
   shape at their orb, drawn over the grass under its light, so from the
   valley's opening a gathering reads as people sitting with lamps, not a
   patch of gold. Fades out near, where the people themselves are drawn
   (PEOPLE_FROM), and is the crowd's own geometry (aScatter: the orb in the
   hands). */
const SEATED_VERT = /* glsl */ `
${DOT}
attribute vec3 aScatter;
attribute float aRand;
uniform float uShow;
varying float vA;
void main() {
  // (Centred a little under the orb: the lap and shoulders round it.)
  vec4 mv = modelViewMatrix * vec4(aScatter + vec3(0.0, 0.02, 0.0), 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = max(dotPx(d, 0.34 * (0.85 + 0.3 * aRand)), 2.0);
  vA = uAlpha * uShow * smoothstep(30.0, 60.0, d);
}`;
const SEATED_FRAG = /* glsl */ `
precision mediump float;
uniform vec3 uCol;
varying float vA;
void main() {
  // A seated figure: broad at the base, narrowing to the shoulders and head.
  vec2 q = gl_PointCoord - vec2(0.5, 0.55);
  float w = mix(0.46, 0.2, smoothstep(-0.3, 0.45, -q.y));
  float body = smoothstep(w, w - 0.12, abs(q.x)) * smoothstep(0.42, 0.3, abs(q.y));
  if (body < 0.01) discard;
  gl_FragColor = vec4(uCol, body * vA * 0.85);
}`;

/* ── The camera's finish, drawn over the whole picture ──
   The bloom (UnrealBloomPass) comes first; then this: the page's grade,
   where uTint maps the picture onto maroon and gold by its brightness, so
   the valley stays in the frame while the chorten stands complete; a
   vignette; and a fine moving grain. */
const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uTint: { value: 0 },
    uExposure: { value: 1.35 },
    uVibrance: { value: 1.3 },
    uDeep: { value: new THREE.Color() },
    uMaroon: { value: new THREE.Color() },
    uGold: { value: new THREE.Color() },
    uCream: { value: new THREE.Color() },
  },
  vertexShader: `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse;
uniform float uTime, uTint, uExposure, uVibrance;
uniform vec3 uDeep, uMaroon, uGold, uCream;
varying vec2 vUv;
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 g = mix(uDeep, uMaroon, smoothstep(0.0, 0.32, l));
  g = mix(g, uGold, smoothstep(0.22, 0.7, l));
  g = mix(g, uCream, smoothstep(0.75, 1.2, l));
  // The lamps and their beams, bright and near colourless, stay white.
  float hi = max(c.r, max(c.g, c.b));
  float sat = (hi - min(c.r, min(c.g, c.b))) / max(hi, 1e-4);
  float white = smoothstep(0.18, 0.5, l) * (1.0 - smoothstep(0.12, 0.3, sat));
  g = mix(g, vec3(l), white);
  // The valley, brighter and its colours fuller, as 108.bt's is at every
  // hour (the brief's maroon and gold, under uTint, as they are): lifted,
  // the lights rolled off gently so nothing burns out.
  vec3 v = c * uExposure;
  v = v / (1.0 + 0.18 * max(v - 0.6, 0.0));
  float lv = dot(v, vec3(0.299, 0.587, 0.114));
  v = max(mix(vec3(lv), v, uVibrance), 0.0);
  c = mix(v, g, uTint);
  vec2 q = (vUv - 0.5) * vec2(1.0, 0.8);
  c *= 1.0 - 0.2 * smoothstep(0.25, 0.8, length(q));
  c += (hash(gl_FragCoord.xy + floor(uTime * 24.0) * vec2(37.0, 17.0)) - 0.5) * 0.03;
  gl_FragColor = vec4(c, 1.0);
}`,
};

/* The land's mesh made finer along the Mao Chhu's banks, so TERRAIN_VERT's
   cut (sinkAt) is a step and not a ramp ten metres wide: each of the mesh's
   two-unit triangles on the stone short of the deep water, and a ring of
   them round it, split `n` ways along each side, their new points laid on
   the old surface (TERRAIN_VERT sinks them). The ring keeps the split ones'
   edges on level grass or deep water, where the sink is even and no crack
   opens against an unsplit neighbour. `bank` is bank.webp's pixels. */
function refineBanks(g: THREE.BufferGeometry, bank: ImageData, n: number) {
  const pos = g.getAttribute("position"),
    nor = g.getAttribute("normal"),
    col = g.getAttribute("color");
  const idx = g.index!;
  const tris = idx.count / 3;
  // (bank.webp over uRiverBox, x -130 to 880, z -180 to 75.)
  const into = (x: number, z: number) => {
    const i = Math.floor(((x + 130) / 1010) * bank.width),
      j = Math.floor(((z + 180) / 255) * bank.height);
    if (i < 0 || i >= bank.width || j < 0 || j >= bank.height) return -1;
    const k = (j * bank.width + i) * 4;
    // (-1 off the map; 0 on grass; 2 in deep water; 1 on the bank.)
    return bank.data[k] === 0
      ? 0
      : bank.data[k + 2] === 0 && bank.data[k] > 20
        ? 2
        : 1;
  };
  const near = new Uint8Array(pos.count);
  const corner = (t: number, c: number) => idx.getX(t * 3 + c);
  for (let t = 0; t < tris; t++) {
    let on = false;
    for (let s = 0; s <= 4 && !on; s++)
      for (let r = 0; r <= 4 - s && !on; r++) {
        const a = corner(t, 0),
          b = corner(t, 1),
          c = corner(t, 2),
          w = 1 - (s + r) / 4;
        const x =
          pos.getX(a) * w + pos.getX(b) * (s / 4) + pos.getX(c) * (r / 4);
        const z =
          pos.getZ(a) * w + pos.getZ(b) * (s / 4) + pos.getZ(c) * (r / 4);
        on = into(x, z) === 1;
      }
    if (on) for (let c = 0; c < 3; c++) near[corner(t, c)] = 1;
  }
  // How many ways to split each: the mesh's two-unit cells `n`, its five-by-two
  // ones beyond (the river's far reaches) twice that, so the points of either
  // fall on a shared lattice; 0, not split.
  const split = (t: number) => {
    const a = corner(t, 0),
      b = corner(t, 1),
      c = corner(t, 2);
    if (!near[a] && !near[b] && !near[c]) return 0;
    const span = Math.max(
      Math.abs(pos.getX(a) - pos.getX(b)),
      Math.abs(pos.getX(a) - pos.getX(c)),
      Math.abs(pos.getZ(a) - pos.getZ(b)),
      Math.abs(pos.getZ(a) - pos.getZ(c)),
    );
    // (Within a tenth: Draco's quantising leaves the mesh's points a little off its grid.)
    return Math.abs(span - 2) < 0.1 ? n : Math.abs(span - 5) < 0.1 ? n * 2 : 0;
  };
  const cs = col.itemSize;
  const P: number[] = [],
    N: number[] = [],
    C: number[] = [];
  for (let v = 0; v < pos.count; v++) {
    P.push(pos.getX(v), pos.getY(v), pos.getZ(v));
    N.push(nor.getX(v), nor.getY(v), nor.getZ(v));
    for (let i = 0; i < cs; i++) C.push(col.getComponent(v, i));
  }
  const out: number[] = [];
  const at = new Map<number, number>();
  const key = (x: number, z: number) =>
    Math.round(x * 16 + 16000) * 100000 + Math.round(z * 16 + 16000);
  for (let v = 0; v < pos.count; v++) at.set(key(pos.getX(v), pos.getZ(v)), v);
  for (let t = 0; t < tris; t++) {
    const a = corner(t, 0),
      b = corner(t, 1),
      c = corner(t, 2);
    const n = split(t);
    if (!n) {
      out.push(a, b, c);
      continue;
    }
    const vert = (s: number, r: number) => {
      const w = 1 - (s + r) / n,
        u = s / n,
        q = r / n;
      const x = pos.getX(a) * w + pos.getX(b) * u + pos.getX(c) * q;
      const z = pos.getZ(a) * w + pos.getZ(b) * u + pos.getZ(c) * q;
      const k = key(x, z);
      let v = at.get(k);
      if (v === undefined) {
        v = P.length / 3;
        at.set(k, v);
        P.push(x, pos.getY(a) * w + pos.getY(b) * u + pos.getY(c) * q, z);
        for (let i = 0; i < 3; i++)
          N.push(
            nor.getComponent(a, i) * w +
              nor.getComponent(b, i) * u +
              nor.getComponent(c, i) * q,
          );
        for (let i = 0; i < cs; i++)
          C.push(
            col.getComponent(a, i) * w +
              col.getComponent(b, i) * u +
              col.getComponent(c, i) * q,
          );
      }
      return v;
    };
    for (let s = 0; s < n; s++)
      for (let r = 0; r < n - s; r++) {
        out.push(vert(s, r), vert(s + 1, r), vert(s, r + 1));
        if (r < n - s - 1)
          out.push(vert(s + 1, r), vert(s + 1, r + 1), vert(s, r + 1));
      }
  }
  const f = new THREE.BufferGeometry();
  f.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  f.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  f.setAttribute("color", new THREE.Float32BufferAttribute(C, cs));
  f.setIndex(out);
  f.computeBoundingSphere();
  f.computeBoundingBox();
  return f;
}

export async function createChortenScene(
  canvas: HTMLCanvasElement,
  contributorCount: number,
  valleyUrl: string,
): Promise<ChortenScene> {
  const dir = valleyUrl.replace(/valley\.glb$/, "textures/");
  const loadImage = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
  const figDraco = new DRACOLoader().setDecoderPath(
    valleyUrl.replace(/valley\.glb$/, "draco/"),
  );
  const figLoader = new GLTFLoader().setDRACOLoader(figDraco);
  // Where the trees and bushes grow (scripts/valley/bake_plants.py).
  const plantsBinP = fetch(
    valleyUrl.replace(/valley\.glb$/, "plants.bin"),
  ).then((r) => r.arrayBuffer());
  const [
    gltf,
    figGltf,
    figFarGltf,
    figDistantGltf,
    mandalaImg,
    detailTex,
    groundShade,
    grain0,
    grain1,
    nor0,
    nor1,
    nor2,
    gravelCol,
    bankGrain,
    waterNor,
    plantGrain,
    plantNormal,
    plantCover,
    riverTex,
    bankTex,
    bankShadeTex,
  ] = await Promise.all([
    // (Draco-compressed: scripts/valley/README.md.)
    figLoader.loadAsync(valleyUrl),
    // The seated figure in full, for those near the camera, simplified, and
    // simpler again for those further off (scripts/figure/build_figure_mpfb.py,
    // decimate_figure.py; Draco-compressed).
    figLoader.loadAsync(valleyUrl.replace(/valley\.glb$/, "figure.glb")),
    figLoader.loadAsync(valleyUrl.replace(/valley\.glb$/, "figure-far.glb")),
    figLoader.loadAsync(valleyUrl.replace(/valley\.glb$/, "figure-distant.glb")),
    // The home page's mandala ("Why 108"), whose lines the lights trace in the sky.
    loadImage(
      valleyUrl.replace(/gratitude\/valley\.glb$/, "assets/Mandala.webp"),
    ),
    // 108.bt's ground detail (their models/ground_detail.jpg), for the ground close by.
    new THREE.TextureLoader().loadAsync(`${dir}ground_detail.jpg`),
    // The land's shade, baked in Blender (scripts/valley/bake_ground.py).
    new THREE.TextureLoader().loadAsync(
      valleyUrl.replace(/valley\.glb$/, "ground-shade.webp"),
    ),
    // The ground's materials (scripts/valley/pack_textures.py).
    // (And the river's ripples, scripts/valley/bake_water.py.)
    ...[
      "grain-0",
      "grain-1",
      "meadow-damp-nor",
      "dirt-rock-nor",
      "moss-gravel-nor",
      "gravel-colour",
      "bank-grain",
      "water-nor",
    ].map((n) =>
      new THREE.TextureLoader().loadAsync(
        valleyUrl.replace(/valley\.glb$/, `ground/${n}.webp`),
      ),
    ),
    // The trees and bushes: their cards, and where each grows.
    new THREE.TextureLoader().loadAsync(
      valleyUrl.replace(/valley\.glb$/, "plants-grain.webp"),
    ),
    new THREE.TextureLoader().loadAsync(
      valleyUrl.replace(/valley\.glb$/, "plants-normal.webp"),
    ),
    new THREE.TextureLoader().loadAsync(
      valleyUrl.replace(/valley\.glb$/, "plants-cover.webp"),
    ),
    new THREE.TextureLoader().loadAsync(
      valleyUrl.replace(/valley\.glb$/, "river.webp"),
    ),
    // Its banks: the way in from the grass and to the water (scripts/valley/bake_bank.py).
    new THREE.TextureLoader().loadAsync(
      valleyUrl.replace(/valley\.glb$/, "bank.webp"),
    ),
    // Their shape and light, baked in Blender (scripts/valley/bake_bank_shade.py).
    new THREE.TextureLoader().loadAsync(
      valleyUrl.replace(/valley\.glb$/, "bank-shade.webp"),
    ),
  ]);
  const plantsBin = await plantsBinP;
  figDraco.dispose();

  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !small,
    alpha: false,
  });
  // Sharpness as 108.bt has it: up to 1.75 on a desktop, 2 on a phone (1.5
  // on a weak one), never past seven million pixels. QUALITY, below, takes a
  // share of it on a device that cannot keep up, but never under 1.5 (1 on a
  // weak phone): the page was drawn at 1.5 before QUALITY, and under it, at
  // 108.bt's floor of the screen's own, ours went visibly soft (its bloom,
  // lens and ground are finer-grained than theirs).
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weak = (nav.deviceMemory ?? 8) <= 4 || (nav.hardwareConcurrency ?? 8) <= 4;
  const sharpness = (q: number) => {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const phone = w < 768;
    const top = Math.min(dpr, phone ? (weak ? 1.5 : 2) : 1.75) * q;
    const floor = Math.min(dpr, phone && weak ? 1 : 1.5);
    return Math.max(floor, Math.min(top, Math.sqrt(7e6 / Math.max(1, w * h))));
  };
  renderer.setPixelRatio(sharpness(1));
  renderer.setClearColor(NIGHT, 1); // under the sky, only ever seen fading in
  const pr = renderer.getPixelRatio();

  // The chorten, 108.bt's: theirs for the one the lights make, and the same
  // mesh made lighter for the row (scripts/chorten), in its textures. Its
  // textures are KTX2, so these need the renderer.
  const gratitudeDir = valleyUrl.replace(/valley\.glb$/, "");
  const ktx2 = new KTX2Loader()
    .setTranscoderPath(`${gratitudeDir}basis/`)
    .detectSupport(renderer);
  const draco = new DRACOLoader().setDecoderPath(`${gratitudeDir}draco/`);
  const models = new GLTFLoader()
    .setDRACOLoader(draco)
    .setKTX2Loader(ktx2)
    .setMeshoptDecoder(MeshoptDecoder);
  const [
    heroGltf,
    nearGltf,
    rowGltf,
    peaksGltf,
    spotGltf,
    plinthGltf,
    grassGltf,
  ] = await Promise.all([
    models.loadAsync(
      `${gratitudeDir}${small ? "chorten-hero-mobile.glb" : "chorten-hero.glb"}`,
    ),
    models.loadAsync(`${gratitudeDir}chorten-hero-mobile.glb`),
    models.loadAsync(
      `${gratitudeDir}${small ? "chorten-row-mobile.glb" : "chorten-row.glb"}`,
    ),
    // 108.bt's ranges (their mountains.glb, baked colour), for the skyline.
    models.loadAsync(
      `${gratitudeDir}${small ? "mountains-mobile.glb" : "mountains.glb"}`,
    ),
    // The sites' ground floodlights (scripts/fixtures/build_spotlight.py).
    models.loadAsync(`${gratitudeDir}spotlight.glb`),
    models.loadAsync(`${gratitudeDir}plinth.glb`),
    // 108.bt's grass clumps, for the dandelions in them.
    models.loadAsync(
      `${gratitudeDir}${small ? "grass-patches-mobile.glb" : "grass-patches.glb"}`,
    ),
  ]);
  ktx2.dispose();
  draco.dispose();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 4000);

  let seed = 1265;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  // Raw brand hex: the shaders write these straight out, so skip three's
  // sRGB-to-linear conversion, which would turn the gold orange.
  const hex = (h: number) =>
    new THREE.Color().setHex(h, THREE.LinearSRGBColorSpace);

  // Drawn through the finish: the scene into a half-float target (so the
  // lights can run past white into the bloom), the bloom, then GRADE.
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: small ? 0 : 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  // Depth of field, for the close shot among the people only (off elsewhere:
  // it draws the scene's depth a second time). Their orbs don't write depth,
  // so each takes the depth of what stands behind it: the held orb that of
  // its person, in focus, the gathering's behind blurred, as a lens has it.
  const bokeh = new BokehPass(scene, camera, {
    focus: 1,
    aperture: 0,
    maxblur: 0.012,
  });
  bokeh.enabled = false;
  // (Its depth drawn without the meadow's close-range parts, the blades,
  // tussocks and dandelions: millions of triangles, drawn a second time for a
  // depth no different from the ground's they stand on.)
  // The blur itself drawn at half size, and laid over the picture only where
  // it is more than a pixel or two across: at full size its 41 reads a pixel
  // cost more than the rest of the finish together, and what it draws there
  // is soft by its nature, so half the pixels show no different. Where the
  // lens is in focus the picture is the scene's own, at full size.
  const bokehHalf = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const bu = bokeh.uniforms as Record<string, THREE.IUniform>;
  const bokehMix = new FullScreenQuad(
    new THREE.ShaderMaterial({
      defines: { DEPTH_PACKING: 1, PERSPECTIVE_CAMERA: 1 },
      uniforms: {
        tColor: { value: null },
        tBlur: { value: bokehHalf.texture },
        tDepth: bu.tDepth,
        focus: bu.focus,
        aperture: bu.aperture,
        maxblur: bu.maxblur,
        nearClip: bu.nearClip,
        farClip: bu.farClip,
        uWidth: { value: 1 },
      },
      vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
      fragmentShader: /* glsl */ `
#include <common>
#include <packing>
varying vec2 vUv;
uniform sampler2D tColor, tBlur, tDepth;
uniform float focus, aperture, maxblur, nearClip, farClip, uWidth;
void main() {
  float viewZ = perspectiveDepthToViewZ(unpackRGBAToDepth(texture2D(tDepth, vUv)), nearClip, farClip);
  // (The blur's reach in pixels, as BokehShader's furthest read.)
  float px = abs(clamp((focus + viewZ) * aperture, -maxblur, maxblur)) * 0.4 * uWidth;
  vec3 sharp = texture2D(tColor, vUv).rgb;
  gl_FragColor = vec4(mix(sharp, texture2D(tBlur, vUv).rgb, smoothstep(0.75, 2.0, px)), 1.0);
}`,
    }),
  );
  bokeh.render = (renderer, writeBuffer, readBuffer) => {
    const shown = nearOnly.map((n) => n.mesh.visible);
    for (const n of nearOnly) n.mesh.visible = false;
    // (As BokehPass draws it: the depth, then the blur, here into the half.)
    scene.overrideMaterial = bokeh.materialDepth;
    const clear = renderer.getClearColor(new THREE.Color());
    const clearA = renderer.getClearAlpha();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(0xffffff, 1);
    renderer.setRenderTarget(bokeh.renderTargetDepth);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    nearOnly.forEach((n, i) => (n.mesh.visible = shown[i]));
    bu.tColor.value = readBuffer.texture;
    bu.nearClip.value = camera.near;
    bu.farClip.value = camera.far;
    renderer.setRenderTarget(bokehHalf);
    renderer.clear();
    bokeh.fsQuad.render(renderer);
    (bokehMix.material as THREE.ShaderMaterial).uniforms.tColor.value = readBuffer.texture;
    renderer.setRenderTarget(bokeh.renderToScreen ? null : writeBuffer);
    renderer.clear();
    bokehMix.render(renderer);
    renderer.setClearColor(clear, clearA);
    renderer.autoClear = autoClear;
  };
  {
    const sizeBokeh = bokeh.setSize.bind(bokeh);
    bokeh.setSize = (w: number, h: number) => {
      sizeBokeh(w, h);
      bokehHalf.setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
      (bokehMix.material as THREE.ShaderMaterial).uniforms.uWidth.value = w;
    };
  }
  composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.84);
  composer.addPass(bloom);
  const grade = new ShaderPass(GRADE);
  grade.uniforms.uDeep.value = hex(NIGHT);
  grade.uniforms.uMaroon.value = hex(0x4a1a2c);
  grade.uniforms.uGold.value = hex(0xc8a663);
  grade.uniforms.uCream.value = hex(0xf2e9d8);
  composer.addPass(grade);

  const shared = { uTime: { value: 0 }, uScale: { value: 800 } };
  // The breeze's strength (WIND): none under reduced motion.
  const windU = { value: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1 };
  // Where the pointer meets the ground, and how hard it parts the grass there.
  // The pointer's ripples, TERRAIN_FRAG's uRipple (set below).
  const ripU = {
    uRipple: { value: null as THREE.Texture | null },
    uRipBox: { value: new THREE.Vector4(0, 0, 1, 0) },
  };
  let pointerMoved = false;
  const pushU = { uPointer: { value: new THREE.Vector3(0, -1e3, 0) }, uPush: { value: 0 }, uPushR: { value: 0.15 } };
  // While the chorten forms, only its own site is shown: the other
  // foundations sink away and their lamps go out (uSolo 1).
  const solo = {
    uSolo: { value: 0 },
    uDim: { value: 0 },
    uSoloAt: { value: new THREE.Vector3() },
  };
  // One set of light and fog for the valley, the river and the chortens.
  const night = {
    uMoon: { value: new THREE.Vector3(0.35, 0.8, 0.5).normalize() },
    // Set each frame from KEYS: the moon's or the sun's light, and the sky's.
    uMoonCol: { value: new THREE.Vector3(0.32, 0.4, 0.58) },
    uAmbient: { value: new THREE.Vector3(0.035, 0.045, 0.075) },
    uNight: { value: hex(NIGHT) },
    uHaze: { value: hex(NIGHT) },
    uFogNear: { value: 700 },
    uFogFar: { value: 2600 },
    uShow: { value: 1 },
  };
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  // The valley view's eye and target (the camera section below explains them).
  const rowXs = FEET.map((f) => f[0]);
  const rowZs = FEET.map((f) => f[2]);
  const rowCx = (Math.min(...rowXs) + Math.max(...rowXs)) / 2;
  const rowCz = (Math.min(...rowZs) + Math.max(...rowZs)) / 2;
  const T0 = new THREE.Vector3(rowCx, groundAt(rowCx, rowCz) + 10, rowCz);
  // 108.bt's direction, brought in closer, so the valley floor and the row fill the frame.
  const C0 = T0.clone().add(
    new THREE.Vector3(525, 135, 190).multiplyScalar(0.5),
  );

  /* ── The sky ── */
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: hex(NIGHT) },
      uHorizon: { value: hex(NIGHT) },
      uGlow: { value: new THREE.Color(0, 0, 0) },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonAmt: { value: 1 },
      uSunAmt: { value: 0 },
      uClouds: { value: 1 },
      uCloudCol: { value: new THREE.Color() },
      uNight: night.uNight,
      uStars: { value: 1 },
      uShow: { value: 1 },
      uTime: shared.uTime,
    },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), skyMat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);
  geometries.push(sky.geometry);
  materials.push(skyMat);

  /* The light, as keyframes on daylight (0 night .. 1 noon): zenith,
     horizon, the sun's glow, the key light and the sky's fill. A clear
     moonlit night, the blue hour, the first gold light behind the ridges,
     and on to midday, when the last of the 108 was finished (11:58 to
     12:00): a clear sky, the sun high in the south. */
  const KEYS = [
    {
      at: 0,
      zenith: 0x161c3e,
      horizon: 0x3a4677,
      glow: 0x000000,
      key: [0.5, 0.58, 0.78],
      fill: [0.13, 0.16, 0.26],
      stars: 1,
      moon: 1,
    },
    {
      at: 0.3,
      zenith: 0x1a2350,
      horizon: 0x5a4a74,
      glow: 0x6a3a40,
      key: [0.58, 0.56, 0.72],
      fill: [0.14, 0.15, 0.24],
      stars: 0.5,
      moon: 0.8,
    },
    {
      at: 0.55,
      zenith: 0x2b3d6e,
      horizon: 0xd9935a,
      glow: 0xffa860,
      key: [0.95, 0.76, 0.58],
      fill: [0.18, 0.17, 0.22],
      stars: 0.08,
      moon: 0.45,
    },
    {
      at: 1,
      zenith: 0x3f70b4,
      horizon: 0xbfd4e4,
      glow: 0x0c0c0a,
      key: [1.05, 1.02, 0.95],
      fill: [0.36, 0.42, 0.52],
      stars: 0,
      moon: 0,
    },
  ];
  const cb = new THREE.Color();
  // Clouds: blue-grey by night (lit pale near the moon in the shader), rose at
  // first light, white at noon.
  const cloudNight = hex(0x3c4570);
  const cloudDawn = hex(0xb08a8c);
  const cloudNoon = hex(0xc4ccd6);
  /* The moon hangs low in the upper right of the opening view, over the far
     end of the valley; the night's light comes from it. */
  const view = new THREE.Vector3().subVectors(T0, C0).setY(0).normalize();
  const right = new THREE.Vector3(-view.z, 0, view.x);
  const moonDir = view
    .clone()
    .addScaledVector(right, 0.42)
    .setY(0.15)
    .normalize();
  /* The night's light on the land comes from the moon's side of the valley
     (east, the opening view's right) and a little behind the eye, low, so
     it rakes across the hills: the slopes facing us still lit, but each one
     turned to it brighter than the one turned away, and the land's height
     and folds read. (From over the viewer's
     shoulder, as 108.bt lights its hero, every slope facing us lit alike, and
     the hills read flat. bake_ground.py traces its shadows from here: NIGHT.) */
  // (As high as the old light, so open ground keeps its brightness; only its
  // way round has changed.)
  const nightLight = view
    .clone()
    .multiplyScalar(-0.4)
    .add(new THREE.Vector3(0, 1.1, 0))
    .addScaledVector(right, 0.7)
    .normalize();
  // The sun comes up behind the ridges to the east (-z).
  const sunDir = new THREE.Vector3();
  const noonSun = moonDir
    .clone()
    .setY(0)
    .normalize()
    .multiplyScalar(Math.cos(0.5))
    .setY(Math.sin(0.5));
  function daylight(d: number) {
    let i = 0;
    while (i < KEYS.length - 2 && d > KEYS[i + 1].at) i++;
    const A = KEYS[i];
    const B = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((d - A.at) / (B.at - A.at), 0, 1);
    const mixHex = (a: number, b: number, out: THREE.Color) =>
      out.copy(hex(a)).lerp(cb.copy(hex(b)), t);
    mixHex(A.zenith, B.zenith, skyMat.uniforms.uZenith.value);
    mixHex(A.horizon, B.horizon, skyMat.uniforms.uHorizon.value);
    mixHex(A.glow, B.glow, skyMat.uniforms.uGlow.value);
    // The fog and the river take the low sky, cooled toward the zenith.
    night.uHaze.value
      .copy(skyMat.uniforms.uHorizon.value)
      .lerp(skyMat.uniforms.uZenith.value, 0.4);
    skyMat.uniforms.uStars.value = A.stars + (B.stars - A.stars) * t;
    skyMat.uniforms.uMoonAmt.value = A.moon + (B.moon - A.moon) * t;
    skyMat.uniforms.uMoonDir.value.copy(moonDir);
    (night.uMoonCol.value as THREE.Vector3).set(
      ...(A.key.map((v, k) => v + (B.key[k] - v) * t) as [
        number,
        number,
        number,
      ]),
    );
    (night.uAmbient.value as THREE.Vector3).set(
      ...(A.fill.map((v, k) => v + (B.fill[k] - v) * t) as [
        number,
        number,
        number,
      ]),
    );
    // East is -z; in November the sun comes up a little south of east, and
    // by noon stands where the moon hung through the night (moonDir's way
    // round, the upper right of the valley's view), higher.
    const noon = THREE.MathUtils.smoothstep(d, 0.55, 1);
    sunDir
      .set(0.35, 0.02 + 0.18 * Math.min(d / 0.55, 1), -0.94)
      .normalize()
      .lerp(noonSun, noon)
      .normalize();
    skyMat.uniforms.uSunAmt.value = noon;
    skyMat.uniforms.uSun.value.copy(sunDir);
    // The key light turns part way toward the low sun, so the slopes still
    // read; by noon it is the sun's.
    night.uMoon.value
      .copy(nightLight)
      .lerp(
        sunDir,
        THREE.MathUtils.lerp(
          0.55 * THREE.MathUtils.smoothstep(d, 0.25, 0.55),
          1,
          noon,
        ),
      )
      .normalize();
    dayU.value = 0.45 * THREE.MathUtils.smoothstep(d, 0.2, 0.55) + 0.55 * noon;
    skyMat.uniforms.uCloudCol.value
      .copy(cloudNight)
      .lerp(cloudDawn, THREE.MathUtils.smoothstep(d, 0.2, 0.55))
      .lerp(cloudNoon, noon);
  }

  /* ── The valley model: the terrain, painted in the shader ── */
  // (The gathering's own marks on the ground, filled in once the people are placed.)
  const crowdMap = {
    uCrowd: { value: null as THREE.Texture | null },
    uCrowdBox: { value: new THREE.Vector4(0, 0, 1, 1) },
    uCrowdOn: { value: 0 },
    uGatherT: { value: 0 },
    uOrbWarm: { value: hex(0xffc070) },
    uGroups: {
      value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 1, 1)),
    },
    uGroupTurn: { value: new Array(8).fill(0) as number[] },
  };
  const dayU = { value: 0 };
  // (Filled in once the chortens are placed: their soft shadows, CSHADOW_*.)
  const chShadowU = {
    uChShadow: { value: null as THREE.Texture | null },
    uChBox: { value: new THREE.Vector4(0, 0, 1, 1) },
    uChAmt: { value: 0 },
  };
  const textures = [
    detailTex,
    grain0,
    grain1,
    nor0,
    nor1,
    nor2,
    gravelCol,
    bankGrain,
    waterNor,
  ];
  for (const t of textures) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace; // written straight out, as their own sRGB
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  /* The plants' cover packed into the land's shade map's blue (it uses only
     red and green; both lie over the same box), freeing one of the land
     shader's sixteen textures for the pointer's ripples: past sixteen, one
     goes unbound and the GPU warns every frame. */
  const shadeCover = (() => {
    const si = groundShade.image as HTMLImageElement;
    const ci = plantCover.image as HTMLImageElement;
    const cv = document.createElement("canvas");
    cv.width = si.width;
    cv.height = si.height;
    const cx = cv.getContext("2d", { willReadFrequently: true })!;
    cx.drawImage(ci, 0, 0, si.width, si.height);
    const cover = cx.getImageData(0, 0, si.width, si.height).data;
    cx.clearRect(0, 0, si.width, si.height);
    cx.drawImage(si, 0, 0);
    const out = cx.getImageData(0, 0, si.width, si.height);
    for (let i = 0; i < out.data.length; i += 4) {
      out.data[i + 2] = cover[i];
      out.data[i + 3] = 255;
    }
    cx.putImageData(out, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    groundShade.dispose();
    plantCover.dispose();
    return t;
  })();
  for (const t of [shadeCover, riverTex, bankTex, bankShadeTex]) {
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textures.push(t);
  }
  // The banks' map read back (bake_bank.py), for the mesh made finer along
  // them and to keep the grass off ground the cut lowers.
  const bankPx = (() => {
    const bc = document.createElement("canvas");
    const bimg = bankTex.image as HTMLImageElement;
    bc.width = bimg.width;
    bc.height = bimg.height;
    const bx = bc.getContext("2d", { willReadFrequently: true })!;
    bx.drawImage(bimg, 0, 0);
    return bx.getImageData(0, 0, bc.width, bc.height);
  })();
  // ...and the bank's baked shape (bake_bank_shade.py, its red), so what
  // stands on the bank stands on it, not on the level ground above it.
  const shadePx = (() => {
    const bc = document.createElement("canvas");
    const bimg = bankShadeTex.image as HTMLImageElement;
    bc.width = bimg.width;
    bc.height = bimg.height;
    const bx = bc.getContext("2d", { willReadFrequently: true })!;
    bx.drawImage(bimg, 0, 0);
    return bx.getImageData(0, 0, bc.width, bc.height);
  })();
  /** How far the bank has fallen below the meadow at (x, z), units. */
  const bankSink = (x: number, z: number) => {
    const i = Math.floor(((x + 130) / 1010) * shadePx.width),
      j = Math.floor(((z + 180) / 255) * shadePx.height);
    if (i < 0 || i >= shadePx.width || j < 0 || j >= shadePx.height) return 0;
    return (shadePx.data[(j * shadePx.width + i) * 4] / 255) * 2;
  };
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let g = mesh.geometry as THREE.BufferGeometry;
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    // (Finer along the banks: a quarter of a unit, half on a phone, so the
    // cut stands as steep as it is baked.)
    const fine = refineBanks(g, bankPx, small ? 4 : 8);
    g.dispose();
    g = mesh.geometry = fine;
    geometries.push(g);
    (mesh.material as THREE.Material).dispose();
    mesh.material = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VERT,
      fragmentShader: TERRAIN_FRAG,
      uniforms: {
        ...night,
        uGrain0: { value: grain0 },
        uGrain1: { value: grain1 },
        uNor0: { value: nor0 },
        uNor1: { value: nor1 },
        uNor2: { value: nor2 },
        uGravelCol: { value: gravelCol },
        uBankGrain: { value: bankGrain },
        uWaterNor: { value: waterNor },
        ...ripU,
        uDetail: { value: detailTex },
        uGroundShade: { value: shadeCover },
        uRiver: { value: riverTex },
        uBank: { value: bankTex },
        uBankShade: { value: bankShadeTex },
        // (scripts/valley/bake_river.py's RIVER: x0, z0, x1, z1.)
        uRiverBox: { value: new THREE.Vector4(-130, -180, 880, 75) },
        uMoonSky: { value: moonDir },
        uRiverOn: { value: 1 },
        // The area the bake covers, x0, z0, x1, z1 (public/gratitude/ground-bake.json).
        uBakeBox: { value: new THREE.Vector4(-692, -569, 878, 553) },
        ...chShadowU,
        ...crowdMap,
        uDay: dayU,
        uTime: shared.uTime,
        uWind: windU,
      },
    });
    materials.push(mesh.material as THREE.Material);
  });
  scene.add(gltf.scene);

  // The scenery's own dice, so adding to it never moves the people's seats.
  let sseed = 108;
  const srnd = () => {
    sseed = (sseed * 16807) % 2147483647;
    return (sseed - 1) / 2147483646;
  };
  /* ── The ranges beyond the valley: 108.bt's ── */
  /* Their foothills and middle ridges (not the snow summits: Gelephu looks
     out on forested hills), set in rings round the valley, each copy turned
     to face it and some mirrored, so no one shape repeats side by side. The
     baked daylight colour is greyed and lit by the night, and each ring
     falls further into the haze, so they step back in tone. */
  {
    const centre = new THREE.Vector3(93, 0, -8);
    const peakMat = (
      map: THREE.Texture | null,
      haze: number,
      top: number,
      dim = 1,
      hazeK = 1,
    ) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: PEAK_VERT,
        fragmentShader: PEAK_FRAG,
        uniforms: {
          ...night,
          uDay: dayU,
          uMap: { value: map },
          uFar: { value: haze },
          uTop: { value: top },
          uDim: { value: dim },
          uHazeK: { value: hazeK },
        },
      });
      materials.push(m);
      return m;
    };
    const ranges: [string, number, number, number, number][] = [
      // name, ring radius, copies, height above the floor, how far into the haze
      ["Alpine_Foothills", 1150, 7, 55, 0.5],
      ["Alpine_Middle_Ridges", 1750, 7, 105, 0.68],
      ["Alpine_Middle_Ridges", 2450, 6, 160, 0.82],
    ];
    peaksGltf.scene.updateMatrixWorld(true);
    ranges.forEach(([name, radius, copies, height, haze], ri) => {
      const src = peaksGltf.scene.getObjectByName(name);
      let mesh: THREE.Mesh | null = null;
      src?.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh;
      });
      if (!mesh) return;
      const m0 = mesh as THREE.Mesh;
      // (Shaded smooth: as made, their faces were flat, and the ridges read
      // as facets.)
      // (Copied out of their interleaved buffers first, which mergeVertices
      // cannot write.)
      const src0 = m0.geometry as THREE.BufferGeometry;
      const flat = new THREE.BufferGeometry();
      for (const name of ["position", "uv"]) {
        const at = src0.getAttribute(name);
        if (!at) continue;
        const arr = new Float32Array(at.count * at.itemSize);
        for (let v = 0; v < at.count; v++)
          for (let c = 0; c < at.itemSize; c++)
            arr[v * at.itemSize + c] = at.getComponent(v, c);
        flat.setAttribute(name, new THREE.BufferAttribute(arr, at.itemSize));
      }
      if (src0.index)
        flat.setIndex(Array.from(src0.index.array as ArrayLike<number>));
      const g = mergeVertices(flat, 1e-3);
      flat.dispose();
      g.computeVertexNormals();
      g.computeBoundingBox();
      const b = g.boundingBox!;
      const width = b.max.x - b.min.x;
      const tall = b.max.y - b.min.y;
      const mat = peakMat(
        (m0.material as THREE.MeshBasicMaterial).map ?? null,
        haze,
        height,
      );
      const arc = ((2 * Math.PI * radius) / copies) * 1.5;
      for (let i = 0; i < copies; i++) {
        const a = ((i + ri * 0.37) / copies) * Math.PI * 2;
        const at = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
          .multiplyScalar(radius)
          .add(centre);
        const copy = new THREE.Mesh(g, mat);
        // (Each a little wider or narrower and turned its own way, from its
        // own place in the ring, so one shape does not come round again.)
        const jit = (k: number) => {
          const v =
            Math.sin((i + 1) * 12.9898 + (ri + 1) * 78.233 + k * 37.719) *
            43758.5453;
          return v - Math.floor(v);
        };
        const sx = (arc / width) * (0.8 + 0.45 * jit(1)) * (i % 2 ? -1 : 1);
        const sy = (height * (0.8 + 0.4 * srnd())) / tall;
        // (Six tenths deep: at their full depth their front slopes reached
        // out through the foothills, in blue patches.)
        copy.scale.set(sx, sy, Math.abs(sx) * 0.6);
        // Their ranges face +z, toward the camera at their origin: turned to face the valley.
        const toward = centre.clone().sub(at).normalize();
        copy.rotation.y =
          Math.atan2(toward.x, toward.z) + (jit(2) - 0.5) * 0.35;
        copy.position.set(at.x, -b.min.y * sy - 12, at.z);
        copy.frustumCulled = false;
        copy.renderOrder = -0.5;
        scene.add(copy);
      }
      geometries.push(g);
    });

    /* The foothills: low forested ridges in a ring between the valley and
       the first of the ranges, rising out from under the plain's edge, so
       the land steps up to the mountains and does not run flat into their
       feet along one line. Coloured as the ranges are (PEAK_FRAG), nearer
       and so less into the haze. (Their own dice.) */
    {
      let hseed = 3301;
      const hrnd = () => {
        hseed = (hseed * 16807) % 2147483647;
        return (hseed - 1) / 2147483646;
      };
      const G = 64;
      const lat = Array.from({ length: G * G }, () => hrnd());
      const vn2 = (x: number, y: number) => {
        const i = Math.floor(x),
          j = Math.floor(y);
        let fx = x - i,
          fy = y - j;
        fx = fx * fx * (3 - 2 * fx);
        fy = fy * fy * (3 - 2 * fy);
        const h = (a: number, b: number) =>
          lat[(((a % G) + G) % G) * G + (((b % G) + G) % G)];
        return (
          (h(i, j) * (1 - fx) + h(i + 1, j) * fx) * (1 - fy) +
          (h(i, j + 1) * (1 - fx) + h(i + 1, j + 1) * fx) * fy
        );
      };
      // Ridged: crests and the gullies between them, at three sizes.
      const ridges = (x: number, z: number) => {
        let r = 0,
          amp = 0.55,
          f = 1 / 160;
        for (let o = 0; o < 4; o++) {
          r +=
            amp * (1 - Math.abs(2 * vn2(x * f + o * 7.1, z * f - o * 3.3) - 1));
          amp *= 0.5;
          f *= 2.1;
        }
        return r;
      };
      const R0 = 700,
        R1 = 1080,
        NR = 50,
        NA = 900;
      const pos = new Float32Array((NR + 1) * NA * 3);
      const uv = new Float32Array((NR + 1) * NA * 2);
      for (let i = 0; i <= NR; i++) {
        const r = R0 + ((R1 - R0) * i) / NR;
        for (let j = 0; j < NA; j++) {
          const th = (j / NA) * Math.PI * 2;
          const x = centre.x + Math.cos(th) * r,
            z = centre.z + Math.sin(th) * r;
          // (Under the plain at the valley's edge; up to their full height
          // by the first range's foot.)
          // (Low: at their first height they stood as one green wall and
          // hid the ranges behind.)
          // (A low step up from the plain, all in front of the first range:
          // reaching under it, high, they stood as one tall green slab with
          // the range's own slopes breaking through.)
          const rise = THREE.MathUtils.smoothstep(r, 860, 1040);
          // (Higher here, lower there, as hills go: at one height all round,
          // their top ran along the horizon as one even belt.)
          // (Rolling all along, knolls added on top: the knolls multiplied
          // in instead flattened the ground between them, and they stood as
          // mesas on a plain.)
          const knoll = vn2(x / 260 + 11, z / 260 - 5);
          const y = -14 + rise * (10 + 12 * ridges(x, z) + 10 * knoll * knoll);
          const k = i * NA + j;
          pos.set([x, y, z], k * 3);
          uv.set([x * 0.02, z * 0.02], k * 2);
        }
      }
      const idx: number[] = [];
      for (let i = 0; i < NR; i++)
        for (let j = 0; j < NA; j++) {
          const a0 = i * NA + j,
            a1 = i * NA + ((j + 1) % NA),
            b0 = a0 + NA,
            b1 = a1 + NA;
          idx.push(a0, a1, b0, a1, b1, b0);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      // (Darker by night than the ranges: nearer, less of the moonlit haze
      // on them; at the ranges' own light they stood as a pale teal band.)
      // (The haze even over them, top to foot: low as they are, at the
      // ranges' low-lying haze their hollows went pale and their crests
      // stayed dark, and they stood as mesas on a flat.)
      // (And less of it than on the ranges, nearer as they are: at the
      // ranges' share they stood pale, grey by day, a flat mist at dawn.)
      const foothills = new THREE.Mesh(g, peakMat(grain0, 0.5, 400, 0.62, 0.5));
      foothills.frustumCulled = false;
      foothills.renderOrder = -0.5;
      scene.add(foothills);
      geometries.push(g);
    }
  }

  function layer(
    attrs: Record<string, [Float32Array, number]>,
    vert: string,
    frag: string,
    uniforms: Record<string, THREE.IUniform>,
  ) {
    const g = new THREE.BufferGeometry();
    for (const [name, [arr, size]] of Object.entries(attrs))
      g.setAttribute(name, new THREE.BufferAttribute(arr, size));
    const m = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...shared, uAlpha: { value: 1 }, ...uniforms },
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false; // the crowd moves in the shader
    pts.renderOrder = 2;
    scene.add(pts);
    geometries.push(g);
    materials.push(m);
    return { g, m };
  }
  const feet = SITES.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const allFeet = FEET.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const foot = feet[CHORTEN];
  solo.uSoloAt.value.copy(foot);

  /* ── The chortens: 108.bt's ── */
  const meshIn = (g: GLTF) => {
    let mesh: THREE.Mesh | null = null;
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    const m = mesh as unknown as THREE.Mesh;
    return {
      geo: m.geometry.clone().applyMatrix4(m.matrixWorld),
      mat: m.material as THREE.MeshStandardMaterial,
    };
  };
  const heroSrc = meshIn(heroGltf);
  const nearSrc = meshIn(nearGltf);
  const rowSrc = meshIn(rowGltf);
  heroSrc.geo.computeBoundingBox();
  const chortenBox = heroSrc.geo.boundingBox!;
  const BASE_M = chortenBox.min.y;
  const TALL_M = chortenBox.max.y - chortenBox.min.y;
  for (const src of [heroSrc, nearSrc])
    for (const t of [src.mat.map, src.mat.normalMap, src.mat.roughnessMap])
      if (t && !textures.includes(t)) textures.push(t);
  /* Something for the gold to reflect: a soft sky over dark ground, with a
     warm glow low on one side, all within white (three's RoomEnvironment
     runs far past it, for tone-mapped scenes, and blew the whitewash out on
     a real GPU). On the materials themselves: a material's envMapIntensity
     scales only its own envMap, not the scene's. */
  const roomEnv = (() => {
    const envScene = new THREE.Scene();
    const sphere = new THREE.SphereGeometry(10, 32, 16);
    const pos = sphere.getAttribute("position");
    const col = new Float32Array(pos.count * 3);
    const sky = new THREE.Color(0.22, 0.24, 0.34);
    const horizon = new THREE.Color(0.42, 0.36, 0.32);
    const ground = new THREE.Color(0.05, 0.05, 0.04);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / 10;
      if (t >= 0) c.copy(horizon).lerp(sky, Math.pow(t, 0.6));
      else c.copy(horizon).lerp(ground, Math.min(1, -t * 3));
      c.toArray(col, i * 3);
    }
    sphere.setAttribute("color", new THREE.BufferAttribute(col, 3));
    envScene.add(
      new THREE.Mesh(
        sphere,
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.BackSide,
        }),
      ),
    );
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 3),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.78, 0.52) }),
    );
    glow.position.set(0, 1.5, -9);
    envScene.add(glow);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
    sphere.dispose();
    return tex;
  })();
  textures.push(roomEnv);
  // Its own material, with the build and the scene's finish added (CHORTEN_*).
  const chortenMat = (from: THREE.MeshStandardMaterial = heroSrc.mat) => {
    const m = from.clone();
    m.envMap = roomEnv;
    m.side = THREE.FrontSide;
    m.envMapIntensity = 0.2;
    const u = {
      uRise: { value: 0 },
      uBaseM: { value: BASE_M },
      uTallM: { value: TALL_M },
      uEdge: { value: hex(0xe2c788) },
    };
    m.userData.build = u.uRise;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u, {
        uHaze: night.uHaze,
        uNight: night.uNight,
        uFogNear: night.uFogNear,
        uFogFar: night.uFogFar,
        uShow: night.uShow,
        uDay: dayU,
      });
      sh.vertexShader =
        CHORTEN_VERT_HEAD +
        sh.vertexShader
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\n  vHb = (position.y - uBaseM) / uTallM;\n  vBuild = clamp((uRise - aDelay * 0.65) / 0.35, 0.0, 1.0);",
          )
          .replace(
            "#include <project_vertex>",
            "#include <project_vertex>\n  vDepthC = -mvPosition.z;",
          );
      sh.fragmentShader =
        CHORTEN_FRAG_HEAD +
        sh.fragmentShader
          .replace(
            "void main() {",
            "void main() {\n  if (vBuild <= 0.0 || vHb > vBuild * 1.02) discard;",
          )
          // (Where the surface turns faster than a pixel can show, the shine
          // spread wider: the gold's fine rings, else, glint on and off from
          // frame to frame as the camera moves, and the bloom makes each a
          // flash. And far off, satin: there a whole course is a pixel, and
          // any shine on it a twinkle.)
          .replace(
            "#include <lights_physical_fragment>",
            "vec3 nDx = dFdx(normal), nDy = dFdy(normal);\n  roughnessFactor = sqrt(clamp(roughnessFactor * roughnessFactor + min(0.5 * (dot(nDx, nDx) + dot(nDy, nDy)), 0.3), 0.0, 1.0));\n  roughnessFactor = max(roughnessFactor, 0.85 * smoothstep(6.0, 25.0, vDepthC));\n  #include <lights_physical_fragment>",
          )
          .replace(
            "#include <dithering_fragment>",
            CHORTEN_FRAG_TAIL + "\n  #include <dithering_fragment>",
          );
    };
    m.customProgramCacheKey = () => "gratitude-chorten";
    return m;
  };
  // Placed on a foot, standing on its base, `height` tall, turned `turn`.
  const chortenAt = (
    at: THREE.Vector3,
    height: number,
    turn: number,
    out: THREE.Matrix4,
  ) => {
    const k = height / TALL_M;
    return out.compose(
      new THREE.Vector3(at.x, at.y - BASE_M * k, at.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn),
      new THREE.Vector3(k, k, k),
    );
  };

  /* The other 107, in two weights: CHORTEN's nearest neighbours, which the
     closing shot sees close, in 108.bt's own lighter chorten (made properly,
     so its texture holds); the rest, small on screen, in the same mesh
     simplified (scripts/chorten), whose texture tears along its seams close
     up but not at their distance. */
  const NEAR = small ? 1 : 3;
  const m4 = new THREE.Matrix4();
  const reach = Math.max(CHORTEN, feet.length - 1 - CHORTEN);
  const rowOf = (
    geo: THREE.BufferGeometry,
    mat: THREE.MeshStandardMaterial,
    near: boolean,
  ) => {
    const at: THREE.Vector3[] = [];
    const delay: number[] = [];
    feet.forEach((f, i) => {
      const n = Math.abs(i - CHORTEN);
      if (n === 0 || n <= NEAR !== near) return;
      at.push(f);
      delay.push((n - 1) / (reach - 1));
    });
    geo.setAttribute(
      "aDelay",
      new THREE.InstancedBufferAttribute(Float32Array.from(delay), 1),
    );
    const mesh = new THREE.InstancedMesh(geo, mat, at.length);
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    geometries.push(geo);
    return { mesh, at };
  };
  const stupaMat = chortenMat();
  const nearMat = chortenMat(nearSrc.mat);
  materials.push(stupaMat, nearMat);
  const rows = [
    rowOf(nearSrc.geo, nearMat, true),
    rowOf(rowSrc.geo, stupaMat, false),
  ];
  let rowHeight = -1;
  const placeRow = (height: number) => {
    if (Math.abs(height - rowHeight) < 1e-4) return;
    rowHeight = height;
    for (const r of rows) {
      r.at.forEach((f, k) =>
        r.mesh.setMatrixAt(k, chortenAt(f, height, 0, m4)),
      );
      r.mesh.instanceMatrix.needsUpdate = true;
    }
  };
  placeRow(CHORTEN_H);

  /* CHORTEN's own, at full detail: built course by course where its lights
     stood, as the camera pulls back to the 108 and they go, turned as they
     were. A touch smaller than their figure, so the two never fight. */
  const heroMat = chortenMat();
  heroSrc.geo.setAttribute(
    "aDelay",
    new THREE.InstancedBufferAttribute(new Float32Array(1), 1),
  );
  const hero1 = new THREE.InstancedMesh(heroSrc.geo, heroMat, 1);
  hero1.frustumCulled = false;
  hero1.visible = false;
  scene.add(hero1);
  geometries.push(heroSrc.geo);
  materials.push(heroMat);

  /* The chortens' light: they take the scene's own (set from KEYS each
     frame): the key (moon, then the low sun), the sky's fill, and their own
     site's four lamps. */
  const keyLight = new THREE.DirectionalLight(0xffffff, 1);
  const fillLight = new THREE.HemisphereLight(0xffffff, 0x223322, 1);
  scene.add(keyLight, keyLight.target, fillLight);

  /* ── The 108 foundations, and the spotlights set into the ground ──
     Before the raising each site was a square stone foundation with lights
     fitted in the ground at its corners, shining up into the space where
     the chorten would stand. The chortens then rise on these foundations. */
  const BASE = R0 * WALK * 2.3; // a little wider than the chorten's own base
  // Two laid courses, the lower sunk into the bank, the upper stepped in; its
  // top where the chorten stands (scripts/fixtures/build_plinth.py).
  const foundGeo = (plinthGltf.scene.getObjectByName("plinth") as THREE.Mesh)
    .geometry;
  const foundMat = new THREE.ShaderMaterial({
    vertexShader: FOUND_VERT,
    fragmentShader: FOUND_FRAG,
    uniforms: {
      ...night,
      ...solo,
      uRise: { value: 1 },
      uGrow: { value: 1 },
      uCol: { value: hex(0xb8ad98) },
      uGlow: { value: 1 },
      uStone: { value: grain0 },
    },
  });
  const foundations = new THREE.InstancedMesh(foundGeo, foundMat, feet.length);
  // Each foundation turned to follow the row, as they were laid along the bank.
  const yaw = feet.map((_, i) => {
    const a2 = feet[Math.max(0, i - 1)],
      b2 = feet[Math.min(feet.length - 1, i + 1)];
    return Math.atan2(-(b2.z - a2.z), b2.x - a2.x);
  });
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  feet.forEach((f, i) => {
    turn.setFromAxisAngle(up, yaw[i]);
    foundations.setMatrixAt(i, m4.compose(f, turn, new THREE.Vector3(1, 1, 1)));
  });
  foundations.frustumCulled = false;
  scene.add(foundations);
  geometries.push(foundGeo);
  materials.push(foundMat);

  /* ── The trees and bushes ── (plants.bin's format: scripts/valley/bake_plants.py) */
  // (Kept, to clear those among the gatherings once they are laid out.)
  let plantAt: Float32Array | null = null;
  let plantSize: THREE.InstancedBufferAttribute | null = null;
  let plantKind: Float32Array | null = null;
  {
    for (const t of [plantGrain, plantNormal]) {
      t.colorSpace = THREE.NoColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    const view = new DataView(plantsBin);
    const all = view.getUint32(0, true);
    // (Half of them on a small screen, each a little larger.)
    const keep = small ? 2 : 1;
    const count = Math.ceil(all / keep);
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const kind = new Float32Array(count);
    const turn = new Float32Array(count);
    const shadeA = new Float32Array(count);
    const ridge = new Float32Array(count);
    for (let i = 0, j = 0; i < all; i += keep, j++) {
      const o = 4 + i * 12;
      pos.set(
        [
          view.getInt16(o, true) / 20,
          view.getInt16(o + 2, true) / 20,
          view.getInt16(o + 4, true) / 20,
        ],
        j * 3,
      );
      size[j] = (view.getUint8(o + 6) / 20) * (small ? 1.2 : 1);
      kind[j] = view.getUint8(o + 7);
      turn[j] = view.getUint8(o + 8) / 255;
      shadeA[j] = view.getUint8(o + 9) / 255;
      ridge[j] = view.getInt8(o + 10) / 127;
    }
    const quad = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("uv", quad.getAttribute("uv"));
    g.setAttribute("aPos", new THREE.InstancedBufferAttribute(pos, 3));
    plantAt = pos;
    plantSize = new THREE.InstancedBufferAttribute(size, 1);
    g.setAttribute("aSize", plantSize);
    g.setAttribute("aKind", new THREE.InstancedBufferAttribute(kind, 1));
    plantKind = kind;
    g.setAttribute("aTurn", new THREE.InstancedBufferAttribute(turn, 1));
    g.setAttribute("aShade", new THREE.InstancedBufferAttribute(shadeA, 1));
    g.setAttribute("aRidge", new THREE.InstancedBufferAttribute(ridge, 1));
    g.instanceCount = count;
    quad.dispose();
    const plantMat = new THREE.ShaderMaterial({
      vertexShader: PLANT_VERT,
      fragmentShader: PLANT_FRAG,
      side: THREE.DoubleSide,
      uniforms: {
        ...night,
        ...solo,
        uDay: dayU,
        uGrainMap: { value: plantGrain },
        uNormalMap: { value: plantNormal },
        uTime: shared.uTime,
        uWind: windU,
        // Each plant's height over its width, and the sheet's layout (plants.json).
        uAspect: { value: new THREE.Vector4(1.044, 0.81, 1.062, 0.64) },
        uViews: { value: 8 },
        uRows: { value: 4 },
      },
    });
    const plants = new THREE.Mesh(g, plantMat);
    plants.frustumCulled = false;
    scene.add(plants);
    geometries.push(g);
    materials.push(plantMat);
    textures.push(plantGrain, plantNormal);
  }

  // Four spotlights set in the ground just outside the foundation, one past
  // each of its four edges, each aimed in and up at where the chorten stands.
  const AIM_H = CHORTEN_H * 0.55;
  const OUT = BASE * 0.5 + 0.35; // from the centre, along each side
  const beamGeo = new THREE.CylinderGeometry(0.38, 0.03, 1, 10, 1, true);
  beamGeo.translate(0, 0.5, 0); // base at the lamp, length 1 along +y; scaled per beam
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: {
      ...solo,
      uAlpha: { value: 1 },
      uH: { value: 1 },
      uCol: { value: hex(0xfff4dc) },
      uTime: shared.uTime,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, feet.length * 4);
  // One off the middle of each of the four sides.
  const corners: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const aimQ = new THREE.Quaternion();
  const lamp = new THREE.Vector3();
  const aimAt = new THREE.Vector3();
  const dirV = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const lampPos: number[] = [];
  // Each fixture: where it stands on the ground, and the way its head points.
  // (CHORTEN's four first, so that alone they can be drawn alone.)
  const fixtures: { at: THREE.Vector3; dir: THREE.Vector3 }[] = [];
  const slot = (i: number, k: number) =>
    i === CHORTEN ? k : (i < CHORTEN ? i + 1 : i) * 4 + k;
  // The fixture's tilt pivot above the ground, and its lens ahead of that
  // along the head (as build_spotlight.py makes it).
  const PIVOT = 0.085;
  const FRONT = 0.07;
  feet.forEach((f, i) => {
    const c = Math.cos(yaw[i]),
      sn = Math.sin(yaw[i]);
    aimAt.set(f.x, f.y + AIM_H, f.z);
    corners.forEach(([cx, cz], k) => {
      const lx = cx * OUT,
        lz = cz * OUT;
      const ground = new THREE.Vector3(
        f.x + c * lx + sn * lz,
        0,
        f.z - sn * lx + c * lz,
      );
      ground.y = groundAt(ground.x, ground.z);
      lamp.copy(ground).y += PIVOT;
      dirV.subVectors(aimAt, lamp).normalize();
      fixtures[slot(i, k)] = { at: ground, dir: dirV.clone() };
      // The beam and the lamp's glow from its lens.
      lamp.addScaledVector(dirV, FRONT);
      const len = aimAt.distanceTo(lamp); // reaching the centre
      aimQ.setFromUnitVectors(up, dirV);
      scl.set(1, len, 1);
      beams.setMatrixAt(i * 4 + k, m4.compose(lamp, aimQ, scl));
      lampPos.push(lamp.x, lamp.y, lamp.z);
    });
  });
  // CHORTEN's own four lamps light its stone (they are its spotlights).
  const siteLamps = [0, 1, 2, 3].map((k) => {
    // (The beams' own white, and set in from the lamp toward the stone, so
    // it lights the foundation and the chorten as the others' beams seem to,
    // not its own fixture: right by it, it burned the yoke orange and this
    // one site stood out from the 107.)
    // (Out at the lamp and up at a beam's height, so its light falls evenly
    // over the base: set in low by it, the nearest step took four times the
    // rest and burnt white.)
    const l = new THREE.PointLight(0xfff4dc, 0, 9, 2);
    l.position.fromArray(lampPos, (CHORTEN * 4 + k) * 3).lerp(foot, 0.1).y =
      foot.y + 1.4;
    scene.add(l);
    return l;
  });
  beams.frustumCulled = false;
  beams.renderOrder = 3;
  scene.add(beams);
  geometries.push(beamGeo);
  materials.push(beamMat);

  // The lamps themselves: a bright point at each corner, visible from afar.
  const lightsMat = (() => {
    const pos = new Float32Array(lampPos);
    const sd = new Float32Array(pos.length / 3);
    for (let i = 0; i < sd.length; i++) sd[i] = rnd();
    return layer(
      { position: [pos, 3], aSeed: [sd, 1] },
      LIGHT_VERT,
      LIGHT_FRAG,
      {
        uSize: { value: 0.35 },
        uMaxPx: { value: 30 * pr },
        uMinPx: { value: 2.5 * pr },
        ...solo,
        uPulse: { value: 0 },
        uCol: { value: hex(0xfff2d6) },
        uCore: { value: hex(0xffffff) },
      },
    ).m;
  })();

  /* The fixtures themselves: a floodlight on a yoke, its base turned to the
     chorten and its head tilted along the beam, the lens lit while the lamps
     burn. Under uSolo only CHORTEN's own four are drawn (they come first). */
  // (A dull, powder-coated finish: polished, each of the 432 heads, a pixel
  // or two from afar, catches the sun and lets it go, a flash.)
  const fixtureMat = new THREE.MeshStandardMaterial({
    color: 0x1c1c1e,
    roughness: 0.85,
    metalness: 0.15,
  });
  const lensMat = new THREE.MeshBasicMaterial({
    color: 0xffe2b0,
    toneMapped: false,
  });
  const fixtureParts = (["base", "head", "lens"] as const).map((name) => {
    const src = spotGltf.scene.getObjectByName(name) as THREE.Mesh;
    const mesh = new THREE.InstancedMesh(
      src.geometry,
      name === "lens" ? lensMat : fixtureMat,
      fixtures.length,
    );
    fixtures.forEach(({ at, dir }, n) => {
      // Its tilt axis, level and square to the beam; the head's axis is +y.
      const side = new THREE.Vector3().crossVectors(up, dir).normalize();
      const along = name === "base" ? up : dir;
      const fwd = new THREE.Vector3().crossVectors(side, along);
      const rot = new THREE.Matrix4().makeBasis(side, along, fwd);
      const pos = name === "base" ? at : at.clone().setY(at.y + PIVOT);
      mesh.setMatrixAt(n, rot.setPosition(pos));
    });
    mesh.frustumCulled = false;
    scene.add(mesh);
    geometries.push(src.geometry);
    return mesh;
  });
  materials.push(fixtureMat, lensMat);
  const lensCol = new THREE.Color(0xffe2b0);

  /* Where the foundations and their lamps meet the ground, its shade: soft
     and dark at their edges, gone a little way out (CONTACT_*), laid over
     the land and following it; under uSolo only CHORTEN's own. */
  foundGeo.computeBoundingBox();
  const footHalf = Math.max(
    -foundGeo.boundingBox!.min.x,
    foundGeo.boundingBox!.max.x,
    -foundGeo.boundingBox!.min.z,
    foundGeo.boundingBox!.max.z,
  );
  const contact = (() => {
    const pos: number[] = [],
      shade: number[] = [],
      idx: number[] = [];
    // A grid laid over the ground about (x, z), turned by `turn`: each point's
    // shade from how far it is outside a square of half-side `half`.
    const lay = (
      x: number,
      z: number,
      turnBy: number,
      half: number,
      reach: number,
      dark: number,
      n: number,
    ) => {
      const c = Math.cos(turnBy),
        sn = Math.sin(turnBy),
        H = half + reach,
        b = pos.length / 3;
      for (let j = 0; j <= n; j++)
        for (let i = 0; i <= n; i++) {
          const lx = -H + (2 * H * i) / n,
            lz = -H + (2 * H * j) / n;
          const wx = x + c * lx + sn * lz,
            wz = z - sn * lx + c * lz;
          pos.push(wx, groundAt(wx, wz) + 0.012, wz);
          const d = Math.max(Math.abs(lx) - half, Math.abs(lz) - half, 0);
          shade.push(dark * (1 - THREE.MathUtils.smoothstep(d, 0, reach)));
        }
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const a = b + j * (n + 1) + i;
          idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
        }
    };
    feet.forEach((f, i) => lay(f.x, f.z, yaw[i], footHalf, 0.9, 0.12, 12));
    fixtures.forEach(({ at }) => lay(at.x, at.z, 0, 0.04, 0.14, 0.2, 4));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aShade", new THREE.Float32BufferAttribute(shade, 1));
    g.setIndex(idx);
    geometries.push(g);
    const mat = new THREE.ShaderMaterial({
      vertexShader: CONTACT_VERT,
      fragmentShader: CONTACT_FRAG,
      uniforms: { ...solo, uShow: night.uShow },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    materials.push(mat);
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  })();

  /* The chortens' shadows (CSHADOW_*): each chorten's shape flattened along
     the light, drawn from above into a map of the row (the brightest where
     several fall), softened, and laid on the land by TERRAIN_FRAG (uChShadow),
     so they follow the ground and the grass grows in them; one for each of
     the chortens' meshes, sharing its places, drawn when it is shown. */
  const shadowPairs: [THREE.InstancedMesh, THREE.InstancedMesh][] = [];
  const shadowMaps: THREE.WebGLRenderTarget[] = [];
  let shadeRow: () => void = () => {};
  // (Counts each time the shadows are drawn again: the grass's pictures of
  // the ground are taken again after them.)
  let shadeCount = 0;
  {
    const drop = Math.max(
      0,
      foot.y - groundAt(foot.x + footHalf + 0.4, foot.z),
    );
    for (const [src, build] of [
      ...rows.map(
        (r) => [r.mesh, r.mesh.material as THREE.MeshStandardMaterial] as const,
      ),
      [hero1, heroMat] as const,
    ].map(
      ([m, mat]) => [m, mat.userData.build as { value: number }] as const,
    )) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: CSHADOW_VERT,
        fragmentShader: CSHADOW_FRAG,
        uniforms: {
          uMoon: night.uMoon,
          uRise: build,
          uBaseM: { value: BASE_M },
          uTallM: { value: TALL_M },
          uFootHalf: { value: footHalf },
          uDrop: { value: drop },
        },
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        blending: THREE.CustomBlending,
        blendEquation: THREE.MaxEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
      });
      materials.push(mat);
      const sh = new THREE.InstancedMesh(src.geometry, mat, src.count);
      sh.instanceMatrix = src.instanceMatrix;
      sh.frustumCulled = false;
      shadowPairs.push([src, sh]);
    }
    // The map: over the row and some way round it, from straight above.
    const xs = feet.map((f) => f.x),
      zs = feet.map((f) => f.z);
    const M = 20;
    const x0 = Math.min(...xs) - M,
      x1 = Math.max(...xs) + M,
      z0 = Math.min(...zs) - M,
      z1 = Math.max(...zs) + M;
    const N = small ? 1024 : 2048;
    const opts = { depthBuffer: false } as const;
    const mapA = new THREE.WebGLRenderTarget(N, N, opts),
      mapB = new THREE.WebGLRenderTarget(N, N, opts);
    shadowMaps.push(mapA, mapB);
    const cam = new THREE.OrthographicCamera(
      (x0 - x1) / 2,
      (x1 - x0) / 2,
      (z1 - z0) / 2,
      (z0 - z1) / 2,
      -500,
      500,
    );
    cam.up.set(0, 0, -1);
    cam.position.set((x0 + x1) / 2, 100, (z0 + z1) / 2);
    cam.lookAt((x0 + x1) / 2, 0, (z0 + z1) / 2);
    cam.updateMatrixWorld();
    const blurMat = new THREE.ShaderMaterial({
      vertexShader:
        "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: BLUR_FRAG,
      uniforms: {
        uMap: { value: null as THREE.Texture | null },
        uStep: { value: new THREE.Vector2() },
      },
      depthTest: false,
      depthWrite: false,
    });
    materials.push(blurMat);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat);
    quad.frustumCulled = false;
    geometries.push(quad.geometry);
    const blurCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    chShadowU.uChShadow.value = mapA.texture;
    chShadowU.uChBox.value.set(x0, z0, x1, z1);
    // (Under a metre of softening: the edge soft, the chorten's shape kept.)
    const SOFT = 0.12 / ((x1 - x0) / N);
    let key = "";
    shadeRow = () => {
      const shown = shadowPairs.filter(([src]) => src.visible);
      const m = night.uMoon.value as THREE.Vector3;
      const now =
        [
          m.x,
          m.y,
          m.z,
          ...shown.map(
            ([src, sh]) =>
              Number(
                (sh.material as THREE.ShaderMaterial).uniforms.uRise.value,
              ) +
              src.instanceMatrix.version * 7,
          ),
        ]
          .map((v) => v.toFixed(3))
          .join() + shown.length;
      if (now === key) return;
      key = now;
      shadeCount++;
      const was = renderer.getRenderTarget();
      const clear = renderer.getClearColor(new THREE.Color()),
        alpha = renderer.getClearAlpha();
      renderer.setClearColor(0x000000, 1);
      renderer.setRenderTarget(mapA);
      renderer.clear();
      // (Each drawn over the last: not cleared between.)
      const clearing = renderer.autoClear;
      renderer.autoClear = false;
      for (const [, sh] of shown) renderer.render(sh, cam);
      renderer.autoClear = clearing;
      for (let pass = 0; pass < 2; pass++) {
        blurMat.uniforms.uMap.value = mapA.texture;
        blurMat.uniforms.uStep.value.set(SOFT / N, 0);
        renderer.setRenderTarget(mapB);
        renderer.render(quad, blurCam);
        blurMat.uniforms.uMap.value = mapB.texture;
        blurMat.uniforms.uStep.value.set(0, SOFT / N);
        renderer.setRenderTarget(mapA);
        renderer.render(quad, blurCam);
      }
      renderer.setClearColor(clear, alpha);
      renderer.setRenderTarget(was);
    };
  }

  /* ── The crowd, and the chorten it becomes ──
     Targets follow 108.bt's own chorten figure at the row's scale: a 26-turn
     helix round the outline, a shell, an inner haze and a bright core. */
  const prof = (t: number) => {
    const f = Math.min(Math.max(t, 0), 1) * (PROFILE.length - 1);
    const i = Math.floor(f);
    const a = PROFILE[i];
    const b = PROFILE[Math.min(i + 1, PROFILE.length - 1)];
    return (a + (b - a) * (f - i)) * R0;
  };
  const N = small ? 4500 : 9000;
  const TOTAL = Math.min(contributorCount, N);
  const tgt = new Float32Array(N * 3),
    sct = new Float32Array(N * 3);
  const rand = new Float32Array(N),
    ord = new Float32Array(N),
    ids = new Float32Array(N);
  /* The eight gatherings of the day, along the left bank across from the row,
     each a different size and set back a different distance from the water.
     Each is people seated in rows facing the river, as on the night, every
     one holding an orb: the crowd's lights, one to a person. People are drawn
     at the chortens' scale (PERSON units to the metre: a 15 m chorten is about
     three units), not the valley's. */
  const PERSON = 0.2;
  const SEAT = 1.6 * PERSON; // along a row
  const ROW = 2.0 * PERSON; // between rows
  // Along the stretch of west bank the valley view shows (measured on screen:
  // x 180 to 440), at uneven gaps: some close together, some far apart, so
  // they read as gatherings that formed, not stepping stones.
  const gaps = Array.from({ length: 7 }, () => 0.45 + rnd() * 1.1);
  const xAt = (k: number) =>
    180 +
    (gaps.slice(0, k).reduce((t, v) => t + v, 0) /
      gaps.reduce((t, v) => t + v, 0)) *
      260;
  const nearest = () =>
    [0, 1, 2, 3, 4, 5, 6, 7].reduce(
      (best, k) =>
        Math.abs(xAt(k) - foot.x) < Math.abs(xAt(best) - foot.x) ? k : best,
      0,
    );
  // How steep the ground is at x, z.
  const steep = (x: number, z: number) =>
    Math.hypot(
      groundAt(x + 3, z) - groundAt(x - 3, z),
      groundAt(x, z + 3) - groundAt(x, z - 3),
    ) / 6;
  const GROUPS = Array.from({ length: 8 }, (_, k) => {
    const rz = 4 + rnd() * 2;
    // In one line along the bank, each about as far from the water, with a
    // little give: set further back by turns, or further still, one stood in
    // front of another from above.
    const back = [5, 7, 6, 8, 6, 7, 5, 6][k];
    // (Back from the river's stone by a bank's width of rough grass; where the
    // river swings away across its bed, they follow it.)
    const zAt = (x: number) =>
      Math.min(bedEdge(x, "west"), stoneWest(x)) + 11 + back + rz;
    const x = xAt(k);
    // (One on a hillside kept small and close: spread over the slope, seen
    // from down the valley, its lights are drawn into a bright streak at the
    // crest.)
    const hill = steep(x, zAt(x)) > 0.08;
    return {
      x,
      back,
      z: zAt(x),
      // (The one the camera comes down among kept to a middling size: its
      // people are drawn in full, and many more would weigh on the scroll.)
      // (Each its own size, from the far end: one clearly large, one large,
      // one small, the rest between; the dice still thrown, so nothing after
      // moves.)
      size: Math.min(
        (rnd(), [0.9, 1.0, 0.4, 1.0, 2.6, 0.7, 1.6, 1.0][k]),
        k === nearest() ? 0.75 : hill ? 0.45 : 3,
      ),
      // Each its own outline: longer or rounder, turned a little to the bank,
      // and uneven round its edge (lobes at a phase of its own).
      aspect: 1.1 + rnd() * 0.7,
      // (Turned well enough that, seen down the valley, no row lines up with
      // the eye: one that does stacks its lights into a bright streak.)
      turn: (rnd() < 0.5 ? -1 : 1) * (0.2 + rnd() * 0.3),
      lobes: [rnd() * 6.28, rnd() * 6.28, 0.18 + rnd() * 0.22],
    };
  });
  // The figure: its parts merged into one geometry, each marked by part.
  const PART: Record<string, number> = {
    robe: 0,
    skin: 1,
    cuff: 2,
    hair: 3,
    grey: 4,
    sock: 5,
    kera: 6,
    orb: 7,
    fold: 8,
  };
  const figureGeo = (src: GLTF) => {
    const figParts: THREE.BufferGeometry[] = [];
    src.scene.updateMatrixWorld(true);
    src.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      const n = g.getAttribute("position").count;
      // How much of the skin is hair (painted on the scalp, in the red of the
      // second colour set: Blender's exporter writes a blank one first).
      const colour = g.getAttribute("color_1") ?? g.getAttribute("color");
      const hair = new Float32Array(n);
      // ...and in its green, the cloth's own shade: the crease under the
      // pouch, the line along the front's overlap.
      const fold = new Float32Array(n);
      if (colour)
        for (let i = 0; i < n; i++) {
          hair[i] = colour.getX(i);
          fold[i] = colour.getY(i);
        }
      for (const k of Object.keys(g.attributes))
        if (k !== "position" && k !== "normal") g.deleteAttribute(k);
      g.setAttribute("aHair", new THREE.BufferAttribute(hair, 1));
      g.setAttribute("aFold", new THREE.BufferAttribute(fold, 1));
      const part = PART[(m.material as THREE.Material).name] ?? 0;
      g.setAttribute(
        "aPart",
        new THREE.BufferAttribute(new Float32Array(n).fill(part), 1),
      );
      figParts.push(g.index ? g.toNonIndexed() : g);
    });
    const merged = mergeGeometries(figParts)!;
    for (const g of figParts) g.dispose();
    geometries.push(merged);
    return merged;
  };
  // One person, in full and simplified; each seat their own colours and
  // turn, and some grey-haired.
  const figGeo = figureGeo(figGltf);
  const figGeoFar = figureGeo(figFarGltf);
  const figGeoDistant = figureGeo(figDistantGltf);
  const orbLocal = figGltf.scene
    .getObjectByName("orb")!
    .getWorldPosition(new THREE.Vector3());

  // The seats: in each gathering, rows across the bank, bowed a little toward
  // the river, with an aisle about every ninth seat, rounded off at the ends.
  type Seat = { x: number; y: number; z: number; yaw: number; group: number };
  const seats: Seat[] = [];
  const weight = GROUPS.reduce((t, g) => t + g.size, 0);
  // Some not in any gathering: in small knots by a gathering's edge, come
  // late, and out between them.
  // (More out in four of the gaps, counting from the far end: between the
  // 1st and 2nd, 2nd and 3rd, 3rd and 4th, and 7th and 8th.)
  const GAPS = [0, 1, 2, 6];
  const STRAY_GAP = Math.round(N * 0.0125);
  const STRAY = Math.round(N * 0.06) + GAPS.length * STRAY_GAP;
  GROUPS.forEach((g, k) => {
    const n =
      k === GROUPS.length - 1
        ? N - STRAY - seats.length
        : Math.round(((N - STRAY) * g.size) / weight);
    const b = Math.sqrt((n * SEAT * ROW) / Math.PI / g.aspect) * 1.08; // depth half-width
    const a = b * g.aspect; // along the river
    crowdMap.uGroups.value[k].set(g.x, g.z, a * 2, b * 2);
    crowdMap.uGroupTurn.value[k] = -g.turn;
    const cand: { x: number; z: number; m: number }[] = [];
    for (let i = -Math.ceil(a / SEAT) - 2; i <= Math.ceil(a / SEAT) + 2; i++) {
      for (let r = -Math.ceil(b / ROW) - 2; r <= Math.ceil(b / ROW) + 2; r++) {
        // (The aisles wander a little from row to row: walked, not ruled.)
        if ((i + Math.round(Math.sin(r * 0.45 + k * 2.1) * 1.4)) % 9 === 0)
          continue;
        // (Every other row shifted half a place, as people settle between
        // those in front, not square behind them.)
        const dx = i * SEAT + (r & 1 ? SEAT * 0.5 : 0);
        const dz = r * ROW + dx * dx * 0.025;
        // (Never on the stones or in the water.)
        if (g.z + dz < stoneWest(g.x + dx) + 3) continue;
        // Uneven round the edge, and thinning toward it: full in the middle,
        // sparser out to the edge, a few sitting apart beyond it.
        const th = Math.atan2(dz / b, dx / a);
        const [p1, p2, amp] = g.lobes;
        const edge =
          1 + amp * Math.sin(2 * th + p1) + amp * 0.6 * Math.sin(3 * th + p2);
        const rr = ((dx / a) ** 2 + (dz / b) ** 2) / (edge * edge);
        cand.push({ x: dx, z: dz, m: rr + rnd() * (0.3 + 1.2 * rr) });
      }
    }
    cand.sort((p, q) => p.m - q.m);
    for (const c of cand.slice(0, n)) {
      // Where each actually sat: near their place, not on it; the whole
      // gathering turned a little to the bank.
      const ct = Math.cos(g.turn),
        stn = Math.sin(g.turn);
      // (Enough that from afar no pattern of rows shows through. In the far
      // gatherings, where only the lights are ever seen, anywhere in their own
      // place: a row there seen end on stacks its lights into a bright streak.)
      const loose = k === nearest() ? 0.7 : 1;
      const x = g.x + c.x * ct - c.z * stn + (rnd() - 0.5) * SEAT * loose;
      const z =
        g.z +
        c.x * stn +
        c.z * ct +
        (rnd() - 0.5) * ROW * loose * (k === nearest() ? 1 : 1.4);
      // Facing the river (figure's +Z to the world's -z), a little turned
      // each, and now and then one turned well round, to a neighbour.
      const turned = rnd() < 0.12 ? (rnd() - 0.5) * 1.8 : 0;
      seats.push({
        x,
        y: groundAt(x, z),
        z,
        yaw: Math.PI + (rnd() - 0.5) * 0.5 + turned,
        group: k,
      });
    }
  });
  for (let i = 0; i < STRAY; ) {
    // Most just outside a gathering's edge; the rest out between two of
    // them, off the line between. Alone, in twos and threes, or a larger
    // knot of up to eight, a row or two deep. (The last of them all out in
    // GAPS, a quarter to each.)
    const inGap = i >= STRAY - GAPS.length * STRAY_GAP;
    const k = inGap
      ? GAPS[
          Math.min(
            GAPS.length - 1,
            Math.floor((i - (STRAY - GAPS.length * STRAY_GAP)) / STRAY_GAP),
          )
        ]
      : Math.floor(rnd() * (GROUPS.length - 1));
    let cx: number, cz: number, group: number;
    if (!inGap && rnd() < 0.6) {
      group = k + (rnd() < 0.5 ? 0 : 1);
      const gv = crowdMap.uGroups.value[group];
      const th = rnd() * Math.PI * 2;
      const out = 0.55 + rnd() * 0.35; // of uGroups' half-size (twice the gathering's)
      cx = GROUPS[group].x + Math.cos(th) * gv.z * out;
      cz = GROUPS[group].z + Math.sin(th) * gv.w * out;
    } else {
      const t = 0.2 + rnd() * 0.6;
      group = t < 0.5 ? k : k + 1;
      cx =
        THREE.MathUtils.lerp(GROUPS[k].x, GROUPS[k + 1].x, t) +
        (rnd() - 0.5) * 8;
      cz =
        THREE.MathUtils.lerp(GROUPS[k].z, GROUPS[k + 1].z, t) +
        (rnd() - 0.5) * 12;
    }
    // (None near the gathering the camera comes down among: its people are
    // drawn in full, these only as lights, and there they would float.)
    const hg = crowdMap.uGroups.value[nearest()];
    if (Math.hypot(cx - hg.x, cz - hg.y) < Math.max(hg.z, hg.w) * 1.1) continue;
    const roll = rnd();
    const together =
      roll < 0.35
        ? 1
        : roll < 0.75
          ? 2 + Math.floor(rnd() * 2)
          : 4 + Math.floor(rnd() * 5);
    for (let j = 0; j < together && i < STRAY; j++, i++) {
      const x = cx + (j % 3) * SEAT * (0.9 + rnd() * 0.3);
      const z = cz + Math.floor(j / 3) * ROW + (rnd() - 0.5) * ROW * 0.5;
      // (Never on the stones or in the water.)
      if (z < stoneWest(x) + 3) continue;
      seats.push({
        x,
        y: groundAt(x, z),
        z,
        yaw: Math.PI + (rnd() - 0.5) * 0.9,
        group,
      });
    }
  }
  // Shuffled, so the contributors' lights are spread through every gathering.
  for (let i = seats.length - 1; i > 0; i--) {
    const k = Math.floor(rnd() * (i + 1));
    [seats[i], seats[k]] = [seats[k], seats[i]];
  }
  // No tree or bush among the gatherings or out in the grass between them,
  // where the people sit: none within a few units of anyone, nor in the band
  // along the bank joining one gathering to the next. (Laid out from the
  // river's edge, the gatherings moved back with it when it widened, in
  // among a few bushes and under trees.)
  if (plantAt && plantSize) {
    const band = (x: number, z: number) => {
      let d = Infinity;
      for (let k = 0; k + 1 < GROUPS.length; k++) {
        const a = GROUPS[k],
          b = GROUPS[k + 1];
        const dx = b.x - a.x,
          dz = b.z - a.z;
        const t = Math.min(
          Math.max(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0),
          1,
        );
        d = Math.min(d, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
      }
      return d;
    };
    const near = new Map<string, Seat[]>();
    const cell = (x: number, z: number) =>
      `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
    for (const st of seats) {
      const c = cell(st.x, st.z);
      if (!near.has(c)) near.set(c, []);
      near.get(c)!.push(st);
    }
    const bySeat = (x: number, z: number) => {
      const i = Math.floor(x / 8),
        j = Math.floor(z / 8);
      for (let a = i - 1; a <= i + 1; a++)
        for (let b = j - 1; b <= j + 1; b++)
          for (const st of near.get(`${a},${b}`) ?? [])
            if (Math.hypot(st.x - x, st.z - z) < 6) return true;
      return false;
    };
    const sz = plantSize.array as Float32Array;
    for (let i = 0; i < sz.length; i++) {
      const x = plantAt[i * 3],
        z = plantAt[i * 3 + 2];
      if (x < GROUPS[0].x - 30 || x > GROUPS[GROUPS.length - 1].x + 30)
        continue;
      if (band(x, z) < 14 || bySeat(x, z)) sz[i] = 0;
    }
    plantSize.needsUpdate = true;
  }
  const tmpV = new THREE.Vector3();
  const handAt = (st: Seat, out: THREE.Vector3) =>
    out
      .copy(orbLocal)
      .multiplyScalar(PERSON)
      .applyAxisAngle(up, st.yaw)
      .add(new THREE.Vector3(st.x, st.y, st.z));

  /* The gathering straight across the river from CHORTEN's site, and in it
     the one person the camera comes to: in the front row, near the middle. */
  const hero = GROUPS.reduce(
    (best, g, k) =>
      Math.abs(g.x - foot.x) < Math.abs(GROUPS[best].x - foot.x) ? k : best,
    0,
  );
  const heroSeats = seats.filter((st) => st.group === hero);
  const g0 = GROUPS[hero];
  const front = heroSeats.filter((st) => Math.abs(st.x - g0.x) < 1.5);
  const one = (front.length ? front : heroSeats).reduce((a2, b2) =>
    b2.z < a2.z ? b2 : a2,
  );
  // (The one the camera comes to faces the river: the close shot is framed
  // on that.)
  one.yaw = Math.PI + THREE.MathUtils.clamp(one.yaw - Math.PI, -0.2, 0.2);
  const oneOrb = handAt(one, new THREE.Vector3());

  /* ── Close by: the fireflies ── (FLECK_*) */
  const flies = (() => {
    const onLand = (x: number, z: number, bank: "west" | "east") =>
      bank === "west"
        ? z > bedEdge(x, "west") + 0.6
        : z < bedEdge(x, "east") - 0.6;
    const clearOfFeet = (x: number, z: number) =>
      SITES.every(
        ([fx, , fz]) => Math.abs(x - fx) > 1.25 || Math.abs(z - fz) > 1.25,
      );
    const where = (
      cx: number,
      cz: number,
      radius: number,
      bank: "west" | "east",
    ) => {
      for (let tries = 0; tries < 40; tries++) {
        // Thicker toward the middle, thinning out at the edge.
        const r = radius * Math.sqrt(srnd()) * (0.4 + 0.6 * srnd());
        const a = srnd() * Math.PI * 2;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        if (onLand(x, z, bank) && clearOfFeet(x, z)) return { x, z, r };
      }
      return null;
    };
    const flecks = (
      cx: number,
      cz: number,
      radius: number,
      count: number,
      bank: "west" | "east",
      lift: number,
    ) => {
      const pos: number[] = [];
      const sd: number[] = [];
      for (let i = 0; i < count; i++) {
        const w = where(cx, cz, radius, bank);
        if (!w) continue;
        pos.push(w.x, groundAt(w.x, w.z) + 0.02 + lift * srnd(), w.z);
        sd.push(srnd());
      }
      return {
        position: [new Float32Array(pos), 3] as [Float32Array, number],
        aSeed: [new Float32Array(sd), 1] as [Float32Array, number],
      };
    };
    // (108.bt's grass clumps read as shards and boards here, not grass: the
    // grass round the person the camera comes to is made below, BLADE_*.)
    // The fireflies: a few over the crowd's grass.
    const softU = { value: 1 };
    const flyU = () => ({
      uSize: { value: 0.04 },
      uMaxPx: { value: 9 * pr },
      uFly: { value: 1 },
      uCol: { value: hex(0xc8e66a) },
      uSoft: softU,
    });
    const fly = layer(
      flecks(one.x, one.z, 5, small ? 40 : 80, "west", 0.5),
      FLECK_VERT,
      FLECK_FRAG,
      flyU(),
    ).m;
    // (On trial: more of them, on their own dice, so the scene's other
    // dice fall as they did. `bank` null: either side of the river.)
    const extra = (
      cx: number,
      cz: number,
      radius: number,
      count: number,
      seed: number,
      bank: "west" | "east" | null,
    ) => {
      let sd = seed;
      const rnd = () => {
        sd = (sd * 16807) % 2147483647;
        return (sd - 1) / 2147483646;
      };
      const pos: number[] = [];
      const sds: number[] = [];
      for (let tries = 0; sds.length < count && tries < count * 20; tries++) {
        const r = radius * Math.sqrt(rnd());
        const a = rnd() * Math.PI * 2;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        if (bank ? !onLand(x, z, bank) : !onLand(x, z, "west") && !onLand(x, z, "east")) continue;
        pos.push(x, groundAt(x, z) + 0.02 + 0.5 * rnd(), z);
        sds.push(rnd());
      }
      return layer(
        {
          position: [new Float32Array(pos), 3],
          aSeed: [new Float32Array(sds), 1],
        },
        FLECK_VERT,
        FLECK_FRAG,
        flyU(),
      ).m;
    };
    const more = extra(one.x, one.z, 5, small ? 25 : 50, 4409, "west");
    return { fly, more, extra };
  })();

  /* The ground as the land draws it (TERRAIN_FRAG: its light, patches, wear
     and the people's shadows), seen from straight above over a box (x0, z0,
     x1, z1) from `over` above it, so with the land's detail as from that
     far: for grass to grow out of in its colour (BLADE_FRAG's uGround).
     Taken before a frame is drawn whenever the light on it has changed,
     while the camera is within `near` of it. */
  const snaps: (() => void)[] = [];
  const groundTargets: THREE.WebGLRenderTarget[] = [];
  const groundSnap = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    over: number,
    near: number,
  ) => {
    const rt = new THREE.WebGLRenderTarget(
      small ? 512 : 1024,
      small ? 512 : 1024,
      { type: THREE.HalfFloatType },
    );
    groundTargets.push(rt);
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    let top = -Infinity;
    for (let i = 0; i <= 12; i++)
      for (let j = 0; j <= 12; j++)
        top = Math.max(
          top,
          groundAt(x0 + ((x1 - x0) * i) / 12, z0 + ((z1 - z0) * j) / 12),
        );
    const cam = new THREE.OrthographicCamera(
      (x0 - x1) / 2,
      (x1 - x0) / 2,
      (z1 - z0) / 2,
      (z0 - z1) / 2,
      0.01,
      over + 50,
    );
    // (Looking down, the picture's right along x, its top toward -z.)
    cam.up.set(0, 0, -1);
    cam.position.set(cx, top + over, cz);
    cam.lookAt(cx, top - 10, cz);
    cam.updateMatrixWorld();
    let key = "";
    snaps.push(() => {
      const p = camera.position;
      if (
        Math.hypot(
          Math.max(x0 - p.x, 0, p.x - x1),
          Math.max(z0 - p.z, 0, p.z - z1),
        ) > near
      )
        return;
      const m = night.uMoon.value as THREE.Vector3;
      const now = [
        m.x,
        m.y,
        m.z,
        dayU.value,
        night.uShow.value,
        crowdMap.uGatherT.value,
        crowdMap.uCrowdOn.value,
        shadeCount,
      ]
        .map((v) => Number(v).toFixed(3))
        .join();
      if (now === key) return;
      key = now;
      const was = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(gltf.scene, cam);
      const clearing = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(contact, cam);
      renderer.autoClear = clearing;
      renderer.setRenderTarget(was);
    });
    return {
      uGround: { value: rt.texture },
      uGroundBox: { value: new THREE.Vector4(x0, z0, x1, z1) },
    };
  };
  /* The meadow's close-range parts (its blades, tussocks and dandelions),
     each drawn only while the camera is near enough that any of it can
     show: they sink into the ground with distance (uFade), and sunk, all of
     them were still drawn, millions of triangles in every frame of the
     story, the opening's far above them too. */
  const nearOnly: { mesh: THREE.Object3D; c: THREE.Vector3; reach: number }[] = [];

  /* ── The meadow close by: blades, and 108.bt's dandelions ── (BLADE_*, FLOWER_*) */
  {
    // (Their own dice, so laying them moves nothing else.)
    let bseed = 9173;
    const brnd = () => {
      bseed = (bseed * 16807) % 2147483647;
      return (bseed - 1) / 2147483646;
    };
    // A tuft, a unit tall: blades from a small footprint, each tapering,
    // leaning out and curving over as it rises, of uneven heights.
    const tuft = (blades: number, broad = 1) => {
      const pos: number[] = [],
        h: number[] = [],
        tone: number[] = [],
        idx: number[] = [];
      for (let b = 0; b < blades; b++) {
        const a = brnd() * Math.PI * 2;
        const r0 = Math.sqrt(brnd()) * 0.6;
        const bx = Math.cos(a) * r0,
          bz = Math.sin(a) * r0;
        const lean = 0.15 + brnd() * 0.85;
        const la = a + (brnd() - 0.5) * 1.4;
        const tall = 0.3 + brnd() * brnd() * 0.7;
        const wide = (0.02 + brnd() * 0.016) * broad;
        // (Its flat face turned square to its lean, a little twisted.)
        const fa = la + Math.PI / 2 + (brnd() - 0.5) * 0.8;
        const fx = Math.cos(fa),
          fz = Math.sin(fa);
        const tn = brnd();
        const base = pos.length / 3;
        [0, 0.5, 1].forEach((t, i) => {
          const cx = bx + Math.cos(la) * lean * t * t * tall;
          const cz = bz + Math.sin(la) * lean * t * t * tall;
          const cy = tall * (t - 0.3 * lean * t * t);
          const w = wide * (1 - t * 0.6);
          if (i < 2) {
            pos.push(
              cx - fx * w,
              cy,
              cz - fz * w,
              cx + fx * w,
              cy,
              cz + fz * w,
            );
            h.push(t, t);
            tone.push(tn, tn);
          } else {
            pos.push(cx, cy, cz);
            h.push(1);
            tone.push(tn);
          }
        });
        idx.push(
          base,
          base + 1,
          base + 2,
          base + 1,
          base + 3,
          base + 2,
          base + 2,
          base + 3,
          base + 4,
        );
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("aH", new THREE.Float32BufferAttribute(h, 1));
      g.setAttribute("aTone", new THREE.Float32BufferAttribute(tone, 1));
      g.setIndex(idx);
      geometries.push(g);
      return g;
    };
    // 108.bt's dandelions: the yellow heads in their grass clumps
    // (grass-patches.glb), without the grass. The clump's picture is read
    // back (it comes compressed), and only the triangles drawing yellow are
    // kept: the heads, stood where they stood in the clump, its root at y 0.
    const dandelions = (name: string, height: number) => {
      let src: THREE.Mesh | null = null;
      grassGltf.scene.getObjectByName(name)?.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !src) src = o as THREE.Mesh;
      });
      if (!src) return null;
      const from = (src as THREE.Mesh).geometry as THREE.BufferGeometry;
      const map = ((src as THREE.Mesh).material as THREE.MeshStandardMaterial)
        .map;
      if (!map) return null;
      const N = 256;
      const rt = new THREE.WebGLRenderTarget(N, N);
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
          uniforms: { uMap: { value: map } },
          vertexShader:
            "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
          fragmentShader:
            "uniform sampler2D uMap; varying vec2 vUv; void main() { gl_FragColor = texture2D(uMap, vUv); }",
        }),
      );
      const px = new Uint8Array(N * N * 4);
      renderer.setRenderTarget(rt);
      renderer.render(card, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
      renderer.readRenderTargetPixels(rt, 0, 0, N, N, px);
      renderer.setRenderTarget(null);
      rt.dispose();
      card.geometry.dispose();
      (card.material as THREE.Material).dispose();
      const yellow = (u: number, v: number) => {
        const k =
          (Math.min(N - 1, Math.max(0, Math.floor(v * N))) * N +
            Math.min(N - 1, Math.max(0, Math.floor(u * N)))) *
          4;
        const [r, g, b, a] = [px[k], px[k + 1], px[k + 2], px[k + 3]];
        return a > 100 && r > 40 && r > b * 2 && g > r * 0.35;
      };
      const P = from.getAttribute("position"),
        U = from.getAttribute("uv");
      let lo = Infinity,
        hi = -Infinity;
      for (let i = 0; i < P.count; i++) {
        lo = Math.min(lo, P.getY(i));
        hi = Math.max(hi, P.getY(i));
      }
      const pos: number[] = [],
        uv: number[] = [];
      const ix = from.index;
      const tris = (ix ? ix.count : P.count) / 3;
      for (let t = 0; t < tris; t++) {
        const v = [0, 1, 2].map((c) => (ix ? ix.getX(t * 3 + c) : t * 3 + c));
        const cu = v.reduce((a, i) => a + U.getX(i), 0) / 3,
          cv = v.reduce((a, i) => a + U.getY(i), 0) / 3;
        if (!yellow(cu, cv) && !v.some((i) => yellow(U.getX(i), U.getY(i))))
          continue;
        for (const i of v) {
          pos.push(P.getX(i), P.getY(i) - lo, P.getZ(i));
          uv.push(U.getX(i), U.getY(i));
        }
      }
      if (!pos.length) return null;
      // A stalk under each head: its triangles gathered by where they stand
      // (a cell a fifth of the clump's height across), and from the
      // ground up to the lowest of them, two thin crossed strips.
      const stem: number[] = new Array(pos.length / 3).fill(0);
      const cell = (hi - lo) / 5;
      const heads = new Map<
        string,
        { x: number; z: number; y: number; n: number }
      >();
      for (let i = 0; i < pos.length; i += 9) {
        const x = (pos[i] + pos[i + 3] + pos[i + 6]) / 3,
          z = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3;
        const key = `${Math.round(x / cell)},${Math.round(z / cell)}`;
        const hd = heads.get(key) ?? { x: 0, z: 0, y: Infinity, n: 0 };
        hd.x += x;
        hd.z += z;
        hd.n++;
        hd.y = Math.min(hd.y, pos[i + 1], pos[i + 4], pos[i + 7]);
        heads.set(key, hd);
      }
      const sw = (hi - lo) * 0.004;
      heads.forEach((hd) => {
        const x = hd.x / hd.n,
          z = hd.z / hd.n,
          y = hd.y + sw;
        for (const [dx, dz] of [
          [sw, 0],
          [0, sw],
        ]) {
          pos.push(
            x - dx,
            0,
            z - dz,
            x + dx,
            0,
            z + dz,
            x + dx * 0.6,
            y,
            z + dz * 0.6,
          );
          pos.push(
            x - dx,
            0,
            z - dz,
            x + dx * 0.6,
            y,
            z + dz * 0.6,
            x - dx * 0.6,
            y,
            z - dz * 0.6,
          );
          for (let k = 0; k < 6; k++) {
            uv.push(0, 0);
            stem.push(1);
          }
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute("aStem", new THREE.Float32BufferAttribute(stem, 1));
      geometries.push(geo);
      return { geo, map, top: hi - lo, scale: height / (hi - lo) };
    };
    // Round the one the camera comes to, thickest there and through the
    // gathering behind, thinning out; not under anyone sitting, nor on the
    // river's stone.
    const sitting = seats.filter((st) => st.group === hero);
    const R = 4.5;
    const free = (x: number, z: number, clear: number) =>
      z > stoneWest(x) + 1.5 &&
      sitting.every(
        (st) => Math.abs(st.x - x) > clear || Math.abs(st.z - z) > clear,
      );
    const place = (n: number, clear: number, rnd = brnd) => {
      const out: [number, number][] = [];
      for (let tries = 0; out.length < n && tries < n * 4; tries++) {
        const r = R * Math.pow(rnd(), 0.75);
        const a = rnd() * Math.PI * 2;
        const x = one.x + Math.cos(a) * r,
          z = one.z + Math.sin(a) * r * 1.3 + 1.2;
        if (free(x, z, clear)) out.push([x, z]);
      }
      return out;
    };
    const fade = new THREE.Vector2(small ? 2.5 : 3, small ? 4 : 5);
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const at = new THREE.Vector3();
    const sc = new THREE.Vector3();
    /* Each kind stood in patches, one mesh to a patch, each with its own
       bounds: the camera's view takes in only some of them (the carpet lies
       all round the close shot's eye, half of it behind), and those outside
       it are not drawn at all. As one mesh, all of it was, always. (So 108.bt
       draws its grass cards, in culled chunks.) Three by three over each
       stand's spread: smaller, the site's broad tussocks came to thousands
       of meshes, and the drawing of each cost more than culling saved. */
    const CHUNKS = 3;
    // (Shared corners: drawn from a list of separate triangles, every corner
    // was worked out once for each triangle it belongs to.)
    const indexed = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
    const stand = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      spots: [number, number][],
      size: (x: number, z: number) => number,
      rnd = brnd,
    ) => {
      if (!indexed.has(geo)) {
        const g = geo.index ? geo : mergeVertices(geo);
        if (g !== geo) geometries.push(g);
        indexed.set(geo, g);
      }
      const shape = indexed.get(geo)!;
      // (Every spot placed first, in order, so the dice fall as they did.)
      const placed = spots.map(([x, z]) => {
        const s = size(x, z);
        at.set(x, groundAt(x, z) - bankSink(x, z) - 0.002, z);
        q.setFromAxisAngle(yAxis, rnd() * Math.PI * 2);
        sc.set(s, s * (0.8 + 0.4 * rnd()), s);
        return m4.compose(at, q, sc).clone();
      });
      const patches = new Map<string, number[]>();
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of spots) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
      const cw = (x1 - x0) / CHUNKS + 1e-6, cd = (z1 - z0) / CHUNKS + 1e-6;
      spots.forEach(([x, z], k) => {
        const key = `${Math.min(CHUNKS - 1, Math.floor((x - x0) / cw))},${Math.min(CHUNKS - 1, Math.floor((z - z0) / cd))}`;
        const list = patches.get(key);
        if (list) list.push(k);
        else patches.set(key, [k]);
      });
      const fadeAt = (mat as THREE.ShaderMaterial).uniforms?.uFade?.value as THREE.Vector2 | undefined;
      for (const list of patches.values()) {
        const mesh = new THREE.InstancedMesh(shape, mat, list.length);
        list.forEach((k, n) => mesh.setMatrixAt(n, placed[k]));
        mesh.computeBoundingSphere();
        // (A little over, for the breeze's sway and the pointer's push.)
        mesh.boundingSphere!.radius += 0.5;
        scene.add(mesh);
        // (Its middle and spread; drawn while the camera is within its spread
        // and the distance it sinks by.)
        if (fadeAt) {
          const c = new THREE.Vector3();
          for (const k of list) {
            c.x += spots[k][0] / list.length;
            c.z += spots[k][1] / list.length;
          }
          let r = 0;
          for (const k of list) r = Math.max(r, Math.hypot(spots[k][0] - c.x, spots[k][1] - c.z));
          c.y = groundAt(c.x, c.z);
          nearOnly.push({ mesh, c, reach: r + fadeAt.y + 2 });
        }
      }
    };
    // (The ground under it, seen from a little over it, as the close shot
    // sees it.)
    const closeGround = groundSnap(
      one.x - 6.5,
      one.z - 5.3,
      one.x + 6.5,
      one.z + 7.7,
      1.5,
      8,
    );
    // The close grass: blades made here (BLADE_*), thick with fine blades,
    // so it reads as turf.
    const bladeMat = new THREE.ShaderMaterial({
      vertexShader: BLADE_VERT,
      fragmentShader: BLADE_FRAG,
      side: THREE.DoubleSide,
      uniforms: {
        ...night,
        uTime: shared.uTime,
        uWind: windU,
        ...pushU,
        uSway: { value: 0.009 },
        uFade: { value: fade },
        uRootTip: { value: new THREE.Vector4(0.85, 1.55, 0.85, 1.55) },
        uRootFar: { value: new THREE.Vector2(10, 20) },
        ...closeGround,
      },
    });
    materials.push(bladeMat);
    // (Several tufts, so no two neighbours are the same shape.)
    const TUFTS = 4;
    const before = bseed;
    const tufts = Array.from({ length: TUFTS }, () =>
      tuft(small ? 11 : 16, 0.7),
    );
    // In patches, as turf grows: thick, longer clumps, and between them
    // thinner, shorter, trodden stretches (a lumpy field, under a metre).
    const lush = (x: number, z: number) =>
      THREE.MathUtils.smoothstep(
        0.5 +
          0.28 * Math.sin(x * 3.1 + Math.sin(z * 2.3) * 1.7) +
          0.22 * Math.sin(z * 4.7 - x * 1.9 + 1.3) * Math.sin(x * 6.3 + 0.7),
        0.25,
        0.8,
      );
    const spots = place(small ? 14000 : 42000, 0.07).filter(
      ([x, z]) => brnd() < 0.3 + 0.7 * lush(x, z),
    );
    tufts.forEach((g, t) =>
      stand(
        g,
        bladeMat,
        spots.filter((_, k) => k % TUFTS === t),
        (x, z) => (0.024 + brnd() * 0.014) * (0.7 + 0.6 * lush(x, z)),
      ),
    );
    // (The flowers' dice as they were before the turf grew thick and in
    // patches, so they stand where they stood: as many throws as the even
    // lawn took, nine to each of its tufts' blades and three to each spot.)
    bseed = before;
    for (let k = TUFTS * (small ? 7 : 10) * 9; k > 0; k--) brnd();
    for (let k = place(small ? 10000 : 30000, 0.07).length * 3; k > 0; k--)
      brnd();
    // The dandelions, in drifts, as 108.bt's: thickest before the camera,
    // which comes to rest just in front of the one it comes to, looking past
    // them. (Each a whole clump's worth, a few heads together.)
    const drift = (x: number, z: number) =>
      0.5 +
      0.3 * Math.sin(x * 1.7 + Math.sin(z * 1.3) * 1.5) +
      0.2 * Math.sin(z * 2.9 - x * 0.8);
    const blooms: [number, number][] = [];
    const eye = { x: one.x + 0.25, z: one.z - 0.45 };
    /* The dandelions round the one the camera comes to: an even carpet all
       round, as thick a few units off as at the camera's feet, thinning
       softly to none by seven and a half, wider than the close shot sees, so
       no edge of it stands in the frame. (Heaped in a wedge before the
       camera, then evened out over a wider wedge, they stood from a step
       back as one dense patch, then were too thin to see: a unit is some
       eighteen metres, and the close shot looks at a few square units.)
       (Their own dice; the old ones still thrown, so all after stand where
       they stood.) */
    for (let k = (small ? 900 : 2800) * 3; k > 0; k--) brnd();
    let rseed = 6151;
    const rrnd = () => {
      rseed = (rseed * 16807) % 2147483647;
      return (rseed - 1) / 2147483646;
    };
    // (Fewer on a phone: each is some 580 triangles.)
    for (let n = small ? 12000 : 60000; n > 0; n--) {
      const d = 7.5 * Math.sqrt(rrnd());
      const a = rrnd() * Math.PI * 2;
      const x = eye.x + Math.cos(a) * d,
        z = eye.z + Math.sin(a) * d;
      // (A little uneven over it, never bare: no patches within the carpet.)
      const keep =
        (1 - THREE.MathUtils.smoothstep(d, 3.5, 7.5)) *
        (0.65 + 0.35 * drift(x, z));
      if (rrnd() < keep && free(x, z, 0.08)) blooms.push([x, z]);
    }
    // (At the heights the clumps stood at on 108.bt's meadow.)
    const KINDS = [
      dandelions("grass_near", 0.022),
      dandelions("grass2_near", 0.032),
    ];
    // (Sinking into the grass from ten units off, past the carpet's edge.)
    const sets: [[number, number][], THREE.Vector2, () => number][] = [
      [blooms, new THREE.Vector2(10, 14), rrnd],
    ];
    sets.forEach(([spots, fadeAt, dice]) =>
      KINDS.forEach((f, i) => {
        if (!f) return;
        const mat = new THREE.ShaderMaterial({
          vertexShader: FLOWER_VERT,
          fragmentShader: FLOWER_FRAG,
          side: THREE.DoubleSide,
          uniforms: {
            ...night,
            ...crowdMap,
            uDay: dayU,
            uTime: shared.uTime,
            uWind: windU,
            ...pushU,
            uMap: { value: f.map },
            uTop: { value: f.top },
            uSway: { value: 0.007 },
            uFade: { value: fadeAt },
            uGain: { value: 0.8 },
            uCut: { value: 0.5 },
            uTint: { value: new THREE.Color(0.8, 0.92, 1.0) },
          },
        });
        materials.push(mat);
        stand(
          f.geo,
          mat,
          spots.filter((_, j) => j % KINDS.length === i),
          () => f.scale * (0.7 + 0.6 * dice()),
          dice,
        );
      }),
    );

    /* Round CHORTEN's site, where the lights come down and the 108 stand at
       dawn. The camera is higher there, ten metres and more, so the grass
       is the meadow's coarser tussocks and the dandelions' drifts, which
       read from that far; none on a foundation, nor on the river's stone. */
    // (The stone read from river.webp itself, its gravel and water (TERRAIN_FRAG's
    // uRiverBox): rows from z -180 at the top, half a unit to a pixel.)
    const RW = 2020,
      RH = 510;
    const rcv = document.createElement("canvas");
    rcv.width = RW;
    rcv.height = RH;
    const rcx = rcv.getContext("2d", { willReadFrequently: true })!;
    rcx.drawImage(riverTex.image as CanvasImageSource, 0, 0, RW, RH);
    const rpx = rcx.getImageData(0, 0, RW, RH).data;
    const onStone = (x: number, z: number) => {
      const i = Math.floor(((x + 130) / 1010) * RW),
        j = Math.floor(((z + 180) / 255) * RH);
      if (i < 0 || i >= RW || j < 0 || j >= RH) return false;
      const k = (j * RW + i) * 4;
      if (rpx[k] + rpx[k + 1] > 60) return true;
      // (Or where the bank's cut has begun to lower the ground, a little way
      // out into the grass, past a tenth of a unit, at the lip: there the tussocks
      // would stand in the air.)
      const bi = Math.floor(((x + 130) / 1010) * bankPx.width),
        bj = Math.floor(((z + 180) / 255) * bankPx.height);
      const bk = (bj * bankPx.width + bi) * 4;
      return bankPx.data[bk] >= 1;
    };
    const siteFree = (x: number, z: number) =>
      !onStone(x, z) &&
      !onStone(x, z + 1.2) &&
      SITES.every(
        ([fx, , fz]) => Math.abs(x - fx) > 1.55 || Math.abs(z - fz) > 1.55,
      );
    const along = allFeet[Math.min(allFeet.length - 1, CHORTEN_SITE + 10)]
      .clone()
      .sub(foot)
      .setY(0)
      .normalize();
    const across = new THREE.Vector3(along.z, 0, -along.x);
    // (From BACK upstream of the site to reach down the row; out across the
    // meadow on the land side, and to the river's stone on the other.)
    const BACK = 40;
    // (The grass right up to the foundations' stone and round their lamps;
    // and over the bank's lip, thinning out down its first fall, fewer and
    // fewer tufts on the sand (by a hash of the spot, so the dice stay as
    // they were), as the painted turf does (TERRAIN_FRAG's edgeT).)
    const grassFree = (x: number, z: number) => {
      const sk = bankSink(x, z);
      if (sk > 0.22) return false;
      if (sk > 0.01) {
        const h = Math.abs(Math.sin(x * 127.1 + z * 311.7) * 43758.5453) % 1;
        if (h < THREE.MathUtils.smoothstep(sk, 0.01, 0.22) * 1.05) return false;
      }
      for (let i = 0; i < feet.length; i++) {
        const dx = x - feet[i].x,
          dz = z - feet[i].z;
        if (Math.abs(dx) > 2 || Math.abs(dz) > 2) continue;
        const c = Math.cos(yaw[i]),
          sn = Math.sin(yaw[i]);
        if (
          Math.abs(c * dx - sn * dz) < footHalf + 0.03 &&
          Math.abs(sn * dx + c * dz) < footHalf + 0.03
        )
          return false;
        return fixtures.every(
          ({ at }) => Math.hypot(at.x - x, at.z - z) > 0.07,
        );
      }
      return true;
    };
    const sitePlace = (
      n: number,
      reach: number,
      wide: number,
      rnd = brnd,
      free = siteFree,
    ) => {
      const out: [number, number][] = [];
      for (let tries = 0; out.length < n && tries < n * 3; tries++) {
        const s = -BACK + (reach + BACK) * rnd(),
          t = -wide * 1.8 + wide * 5 * rnd();
        const x = foot.x + along.x * s + across.x * t,
          z = foot.z + along.z * s + across.z * t;
        // (Thinning out toward its edges, so it ends in no line; the river's
        // side ends at the stone.)
        const edge =
          THREE.MathUtils.smoothstep(wide * 3.2 - t, 0, wide * 1.2) *
          THREE.MathUtils.smoothstep(reach - s, 0, reach * 0.3) *
          THREE.MathUtils.smoothstep(s + BACK, 0, 10);
        if (rnd() < edge && free(x, z)) out.push([x, z]);
      }
      return out;
    };
    const endX = foot.x - along.x * 7.5 - across.x * 3.6,
      endZ = foot.z - along.z * 7.5 - across.z * 3.6;
    // The grass there: tussocks of broad blades (from that far a fine one is
    // under a pixel), grown out of the ground in its colour, as the close
    // shot's are, from a picture of the site's ground taken from about the
    // camera's height there; on their own dice.
    {
      const corners = [-BACK, 34].flatMap((sAt) =>
        [-21.6, 38.4].map((tAt) => [
          foot.x + along.x * sAt + across.x * tAt,
          foot.z + along.z * sAt + across.z * tAt,
        ]),
      );
      const xs = corners.map(([x]) => x),
        zs = corners.map(([, z]) => z);
      const siteGround = groundSnap(
        Math.min(...xs),
        Math.min(...zs),
        Math.max(...xs),
        Math.max(...zs),
        15,
        40,
      );
      let tseed = 2207;
      const trnd = () => {
        tseed = (tseed * 16807) % 2147483647;
        return (tseed - 1) / 2147483646;
      };
      const tussockMat = new THREE.ShaderMaterial({
        vertexShader: BLADE_VERT,
        fragmentShader: BLADE_FRAG,
        side: THREE.DoubleSide,
        uniforms: {
          ...night,
          uTime: shared.uTime,
          uWind: windU,
          ...pushU,
          uSway: { value: 0.028 },
          uFade: { value: new THREE.Vector2(35, 55) },
          uRootTip: { value: new THREE.Vector4(0.88, 1.45, 0.7, 2.0) },
          uRootFar: { value: new THREE.Vector2(8, 30) },
          ...siteGround,
        },
      });
      materials.push(tussockMat);
      const keep = bseed;
      bseed = 7741;
      const tussocks = Array.from({ length: TUFTS }, () =>
        tuft(small ? 8 : 12, 2.2),
      );
      bseed = keep;
      const tSpots = sitePlace(small ? 10000 : 30000, 34, 12, trnd, grassFree);
      tussocks.forEach((g, t) =>
        stand(
          g,
          tussockMat,
          tSpots.filter((_, k) => k % TUFTS === t),
          () => 0.08 + trnd() * 0.06,
          trnd,
        ),
      );
      // Thick where the camera looks down on them: round the site, where the
      // lights come down, and before the end's eye down the row (endX, endZ),
      // thinning with distance from them; an unmown meadow, taller.
      const lush: [number, number][] = [];
      for (
        let tries = 0;
        lush.length < (small ? 12000 : 40000) && tries < 400000;
        tries++
      ) {
        const [cx, cz] =
          trnd() < 0.5
            ? [foot.x, foot.z]
            : [endX + along.x * 14, endZ + along.z * 14];
        const r = 22 * Math.pow(trnd(), 0.7),
          a = trnd() * Math.PI * 2;
        const x = cx + Math.cos(a) * r,
          z = cz + Math.sin(a) * r;
        if (grassFree(x, z)) lush.push([x, z]);
      }
      bseed = 9931;
      const tall = Array.from({ length: TUFTS }, () => tuft(8, 2.2));
      bseed = keep;
      tall.forEach((g, t) =>
        stand(
          g,
          tussockMat,
          lush.filter((_, k) => k % TUFTS === t),
          () => 0.11 + trnd() * 0.08,
          trnd,
        ),
      );
    }
    // (The dandelions' dice as they were when the site's tussocks drew on
    // them: their spots first, then nine to each of their tufts' blades and
    // three to each spot.)
    const was = sitePlace(small ? 6000 : 16000, 34, 12).length;
    for (let k = TUFTS * (small ? 8 : 12) * 9 + was * 3; k > 0; k--) brnd();
    // The dandelions there: from that far a head is a pixel or two, so
    // each is drawn as a dot of its yellow (SPECK_*), in clusters, gathered
    // in broad drifts with bare meadow between, as they grow.
    const specks: number[] = [];
    const shade: number[] = [];
    sitePlace(small ? 4500 : 12000, 130, 14)
      // (Fewer far off down the row from where the camera stands at the end,
      // endEye: 7.5 back along the row from CHORTEN, 3.6 out toward the water.)
      .filter(([x, z]) => {
        // (And fewer up the slope, far out from the row on the land side.)
        const out = (x - foot.x) * across.x + (z - foot.z) * across.z;
        // (The end looks down the row: far, there, is downstream.)
        const far = THREE.MathUtils.smoothstep(
          (x - endX) * along.x + (z - endZ) * along.z,
          14,
          55,
        );
        const inDrift = THREE.MathUtils.smoothstep(
          drift(x * 0.35, z * 0.35),
          0.52,
          0.78,
        );
        return (
          brnd() <
          (0.04 + 0.96 * inDrift) *
            (1 - 0.7 * far) *
            (1 - 0.65 * THREE.MathUtils.smoothstep(out, 12, 35))
        );
      })
      .forEach(([cx, cz]) => {
        for (let i = 2 + Math.floor(brnd() * 5); i > 0; i--) {
          const x = cx + (brnd() - 0.5) * 0.6,
            z = cz + (brnd() - 0.5) * 0.6;
          if (!siteFree(x, z)) continue;
          // (Held up on their stalks over the tussocks, as dandelions are.)
          specks.push(x, groundAt(x, z) + 0.12 + brnd() * 0.05, z);
          shade.push(brnd());
        }
      });
    const speckGeo = new THREE.BufferGeometry();
    speckGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(specks, 3),
    );
    speckGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(shade, 1));
    geometries.push(speckGeo);
    const speckMat = new THREE.ShaderMaterial({
      vertexShader: SPECK_VERT,
      fragmentShader: SPECK_FRAG,
      transparent: true,
      uniforms: {
        ...night,
        uDay: dayU,
        uScale: shared.uScale,
        uFade: { value: new THREE.Vector2(70, 110) },
        uSolo: solo.uSolo,
      },
    });
    materials.push(speckMat);
    const speckPts = new THREE.Points(speckGeo, speckMat);
    speckPts.frustumCulled = false;
    scene.add(speckPts);
  }

  /* ── Low mist over the valley floor ── (MISTLAYER_*)
     A layer of it lying a couple of units over the floor, draped over the
     land smoothed broad (so it follows the valley down, and not each hill),
     thickest where the ground beneath lies furthest under it, thinning to
     nothing up the hillsides, so the hills rise out of it. Seen only from
     above it and off in the distance: a pale band where the far floor
     meets the hills and the ranges behind. */
  {
    const X0 = 60,
      X1 = 640,
      Z0 = -180,
      Z1 = 140,
      STEP = 4;
    const nx = Math.round((X1 - X0) / STEP) + 1,
      nz = Math.round((Z1 - Z0) / STEP) + 1;
    const ground = new Float32Array(nx * nz);
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++)
        ground[j * nx + i] = groundAt(X0 + i * STEP, Z0 + j * STEP);
    // The land smoothed broad: a box blur, twice, 9 cells (36 units) across.
    const blur = (src: Float32Array) => {
      const out = new Float32Array(src.length);
      const R = 4;
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++) {
          let s = 0,
            n = 0;
          for (let d = -R; d <= R; d++) {
            const ii = Math.min(nx - 1, Math.max(0, i + d));
            s += src[j * nx + ii];
            n++;
          }
          out[j * nx + i] = s / n;
        }
      const out2 = new Float32Array(src.length);
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++) {
          let s = 0,
            n = 0;
          for (let d = -R; d <= R; d++) {
            const jj = Math.min(nz - 1, Math.max(0, j + d));
            s += out[jj * nx + i];
            n++;
          }
          out2[j * nx + i] = s / n;
        }
      return out2;
    };
    let broad = blur(ground);
    broad = blur(broad);
    // (Its floor: the smoothed land, but never above the land's own low
    // ground round it, so on a hill it lies at the foot, not over the top.)
    const LIFT = 2.4;
    const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, nx - 1, nz - 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    const pos = geo.getAttribute("position");
    const under = new Float32Array(pos.count);
    for (let k = 0; k < pos.count; k++) {
      const i = Math.round((pos.getX(k) - X0) / STEP),
        j = Math.round((pos.getZ(k) - Z0) / STEP);
      const y = Math.min(broad[j * nx + i], ground[j * nx + i] + 6) + LIFT;
      pos.setY(k, y);
      // (Thinning out toward the edges of the land it knows, so it ends in no line.)
      const edge = Math.min(
        pos.getX(k) - X0,
        X1 - pos.getX(k),
        pos.getZ(k) - Z0,
        Z1 - pos.getZ(k),
      );
      // (Lighter round the river's head, where it leaves the gorge and the
      // row begins: the opening comes close over it, and there it hung heavy.)
      const head = Math.hypot(
        pos.getX(k) - FEET[0][0] + 10,
        pos.getZ(k) - FEET[0][2] - 8,
      );
      under[k] =
        (y - ground[j * nx + i]) *
        THREE.MathUtils.smoothstep(edge, 0, 50) *
        THREE.MathUtils.lerp(0.4, 1, THREE.MathUtils.smoothstep(head, 70, 180));
    }
    geo.setAttribute("aUnder", new THREE.BufferAttribute(under, 1));
    geometries.push(geo);
    const mat = new THREE.ShaderMaterial({
      vertexShader: MISTLAYER_VERT,
      fragmentShader: MISTLAYER_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        ...night,
        uDay: dayU,
        uTime: shared.uTime,
        uSolo: solo.uSolo,
        uAmt: { value: 0.45 },
      },
    });
    materials.push(mat);
    const layerMesh = new THREE.Mesh(geo, mat);
    layerMesh.renderOrder = 1;
    layerMesh.frustumCulled = false;
    scene.add(layerMesh);
  }

  /* The mandala the lights make in the sky: above the gathering, a little
     behind its front row, so the first light rises straight up out of the
     hands to its centre. Seen from the camera's place below it, out at the
     water's edge (lookUp), and turned to face it. */
  const lookUp = new THREE.Vector3(g0.x - 14, 0, one.z - 48);
  lookUp.y = groundAt(lookUp.x, lookUp.z) + 0.8;
  const mandC = new THREE.Vector3(g0.x, one.y + 18, one.z + 5);
  const mandN = lookUp.clone().sub(mandC).normalize();
  const mandU = new THREE.Vector3().crossVectors(up, mandN).normalize();
  const mandV = new THREE.Vector3().crossVectors(mandN, mandU);
  const MAND_R = 9;
  // Its places: points along the image's gold lines, as many as there are lights.
  const mandPts = (() => {
    const S = 300;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const cx = cv.getContext("2d", { willReadFrequently: true })!;
    cx.drawImage(mandalaImg, 0, 0, S, S);
    const px = cx.getImageData(0, 0, S, S).data;
    const ink: number[] = [];
    const wt: number[] = [];
    let total = 0;
    for (let i = 0; i < S * S; i++) {
      const w = (px[i * 4 + 3] / 255) * ((px[i * 4] + px[i * 4 + 1]) / 510);
      if (w < 0.25) continue;
      total += w;
      ink.push(i);
      wt.push(total);
    }
    const out: [number, number][] = [];
    for (let j = 0; j < N; j++) {
      const r = rnd() * total;
      let lo = 0;
      let hi = wt.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (wt[mid] < r) lo = mid + 1;
        else hi = mid;
      }
      const i = ink[lo];
      out.push([
        (((i % S) + rnd()) / S) * 2 - 1,
        1 - ((Math.floor(i / S) + rnd()) / S) * 2,
      ]);
    }
    // Filled from the centre out, the first light at its very middle.
    out.sort((a2, b2) => Math.hypot(...a2) - Math.hypot(...b2));
    out[0] = [0, 0];
    return out;
  })();

  for (let j = 0; j < N; j++) {
    // Contributors only on the helix and shell, where they read as points of light.
    const u = j < TOTAL ? rnd() * 0.75 : rnd();
    let x: number, y: number, z: number;
    if (u < 0.34) {
      const t = rnd();
      const ha = t * 26 * Math.PI * 2;
      const r = prof(t) * 1.004;
      x = Math.cos(ha) * r;
      z = Math.sin(ha) * r;
      y = t * HS;
    } else {
      const v = (u - 0.34) / 0.66;
      const t = v < 0.78 ? rnd() : Math.pow(rnd(), 0.8);
      const a = rnd() * Math.PI * 2;
      const r =
        v < 0.6
          ? prof(t) * (1 + (rnd() - 0.5) * 0.045)
          : v < 0.78
            ? prof(t) * Math.pow(rnd(), 0.7)
            : prof(t) * Math.pow(rnd(), 4) * 0.5;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      y = t * HS;
    }
    tgt.set([x * WALK, y * WALK, z * WALK], j * 3);
    ord[j] = y / HS;
    // In the hands of the person in seat j.
    handAt(seats[j], tmpV);
    sct.set([tmpV.x, tmpV.y, tmpV.z], j * 3);
    rand[j] = rnd();
    ids[j] = j < TOTAL ? j + 1 : 0;
  }
  /* The order they leave in: by distance from that one orb (aOrder, 0..1).
     The places in the chorten are dealt out by the same order, lowest first,
     among the contributors and among the rest apart (the contributors keep
     the helix and shell, where they can be found). */
  const far = seats.map((st) => Math.hypot(st.x - one.x, st.z - one.z));
  const dealt = new Float32Array(N * 3);
  const deal = (js: number[]) => {
    // Nearest first: they come down first, from the mandala's centre.
    const byFar = [...js].sort((a2, b2) => far[a2] - far[b2]);
    const byLow = [...js].sort((a2, b2) => tgt[a2 * 3 + 1] - tgt[b2 * 3 + 1]);
    byFar.forEach((j, r) =>
      dealt.set(tgt.subarray(byLow[r] * 3, byLow[r] * 3 + 3), j * 3),
    );
  };
  const all = Array.from({ length: N }, (_, j) => j);
  deal(all.slice(0, TOTAL));
  deal(all.slice(TOTAL));
  tgt.set(dealt);
  /* The river of light: from the mandala's centre, out and down over the
     water, to the edge of the foundation, at its top. */
  const toSite = foot.clone().sub(mandC).setY(0).normalize();
  const ribbon = [
    mandC.clone(),
    mandC
      .clone()
      .addScaledVector(toSite, 10)
      .add(new THREE.Vector3(0, -6, 0)),
    foot
      .clone()
      .addScaledVector(toSite, -8)
      .add(new THREE.Vector3(0, 3.5, 0)),
    foot
      .clone()
      .addScaledVector(toSite, -1.25)
      .add(new THREE.Vector3(0, 0.3, 0)),
  ];
  const mand = new Float32Array(N * 2);
  let firstJ = 0;
  [...all]
    .sort((a2, b2) => far[a2] - far[b2])
    .forEach((j, r) => {
      ord[j] = r / (N - 1);
      mand.set(mandPts[r], j * 2);
      if (r === 0) firstJ = j;
    });
  const crowd = layer(
    {
      position: [tgt, 3],
      aScatter: [sct, 3],
      aRand: [rand, 1],
      aOrder: [ord, 1],
      aMand: [mand, 2],
      aId: [ids, 1],
      aHit: [new Float32Array(N), 1],
    },
    CROWD_VERT,
    CROWD_FRAG,
    {
      uSize: { value: 0.11 }, // an orb about 17 cm across, in its glow, at the people's scale
      uDotSize: { value: 0.016 * Math.pow(WALK, 0.85) * 1.2 },
      uMaxPx: { value: 420 * pr }, // an orb held close to the camera is large
      uMinPx: { value: 3 * pr },
      uReveal: { value: 0 },
      uSel: { value: 0 },
      uRot: { value: 0 },
      uPulse: { value: 0 },
      uGrow: { value: 1 },
      uFoot: { value: foot.clone() },
      uS0: { value: ribbon[0] },
      uS1: { value: ribbon[1] },
      uS2: { value: ribbon[2] },
      uS3: { value: ribbon[3] },
      uBreath: { value: 0 },
      uTall: { value: HS * WALK },
      uMandC: { value: mandC },
      uMandU: { value: mandU },
      uMandV: { value: mandV },
      uMandR: { value: MAND_R },
      uSpin: { value: 0 },
      uGather: { value: 0 },
      uDescend: { value: 0 },
      // Gold through and through: over the lit town a white core washed out.
      uCol: { value: hex(0xb8903f) },
      uCore: { value: hex(0xe2c788) },
      uHotCol: { value: hex(0xfff2d6) },
    },
  );
  const crowdMat = crowd.m;
  // (Under them, from afar, the people themselves: SEATED_*.)
  const seatedMat = new THREE.ShaderMaterial({
    vertexShader: SEATED_VERT,
    fragmentShader: SEATED_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      ...shared,
      uShow: night.uShow,
      uAlpha: { value: 1 },
      uMaxPx: { value: 40 * pr },
      uSize: { value: 0 },
      uCol: { value: hex(0x120c0a) },
    },
  });
  materials.push(seatedMat);
  const seated = new THREE.Points(crowd.g, seatedMat);
  seated.frustumCulled = false;
  seated.renderOrder = 1;
  scene.add(seated);

  /* The people themselves, in the gathering straight across the river from
     CHORTEN's site, where the camera will come down among them. Elsewhere on
     the bank a seated figure is under two pixels tall in every shot, so only
     the orbs are drawn there. */
  const ROBES = [
    0x5a2030, 0x6e4a2a, 0x2c3550, 0x34452f, 0x4a3a44, 0x7a2a2a, 0x3d3a36,
  ].map(hex);
  const figMat = new THREE.ShaderMaterial({
    vertexShader: FIG_VERT,
    fragmentShader: FIG_FRAG,
    uniforms: {
      ...night,
      uOrbAt: { value: orbLocal.clone() },
      uOrbCol: { value: hex(0xffd9a0) },
      uOrbOn: { value: 1 },
      uGather: { value: 0 },
      uFirstOff: { value: new THREE.Vector3() },
    },
  });
  materials.push(figMat);
  // In full within a few seats of the one the camera comes to, simplified
  // beyond, where a face is a few pixels, and simpler again past MID_FIG,
  // where a whole person is a few dozen: there the 5,000 triangles each of
  // eight hundred people cost more than the rest of the close shots.
  const NEAR_FIG = small ? 0.9 : 1.4;
  const MID_FIG = 4;
  const figDist = (st: Seat) => Math.hypot(st.x - one.x, st.z - one.z);
  const isNear = (st: Seat) => figDist(st) < NEAR_FIG;
  const turnQ = new THREE.Quaternion();
  const personScale = new THREE.Vector3(PERSON, PERSON, PERSON);
  const seatOf = new Map(seats.map((st, j) => [st, j]));
  // (Each person's robe drawn in seat order, whichever mesh they are in.)
  // (Those come late sit apart from it: see STRAY.)
  const peopleSeats = seats.filter((st) => st.group === hero);
  // Who sits where: by their own dice, so the seats and robes stay as they were.
  let pseed = 1265;
  const prnd = () => {
    pseed = (pseed * 16807) % 2147483647;
    return (pseed - 1) / 2147483646;
  };
  // (Robes by their own dice too, dealt along the bank, so moving the other
  // gatherings never changes what this one wears.)
  let rseed = 4021;
  const rrnd = () => {
    rseed = (rseed * 16807) % 2147483647;
    return (rseed - 1) / 2147483646;
  };
  const robeOf = new Map(
    [...peopleSeats]
      .sort((p, q) => p.x - q.x || p.z - q.z)
      .map((st) => [st, ROBES[Math.floor(rrnd() * ROBES.length)]]),
  );
  // (Not the one the camera comes to.)
  const greyOf = new Map(
    peopleSeats.map((st) => [st, st !== one && prnd() < 0.22 ? 1 : 0]),
  );
  const groupsOf: [THREE.BufferGeometry, Seat[]][] = [
    [figGeo, peopleSeats.filter(isNear)],
    [figGeoFar, peopleSeats.filter((st) => !isNear(st) && figDist(st) < MID_FIG)],
    [figGeoDistant, peopleSeats.filter((st) => figDist(st) >= MID_FIG)],
  ];
  // (From far off, as from the valley's opening, the people are only a few
  // pixels: there their robes dull this gathering among the others, which
  // show only their lights, so they are drawn only from near enough to read
  // as people: PEOPLE_FROM.)
  const peopleMeshes: THREE.InstancedMesh[] = [];
  const PEOPLE_FROM = 60;
  for (const [geo, list] of groupsOf) {
    const people = new THREE.InstancedMesh(geo, figMat, list.length);
    peopleMeshes.push(people);
    const tint = new Float32Array(list.length * 3);
    list.forEach((st, i) => {
      turnQ.setFromAxisAngle(up, st.yaw);
      people.setMatrixAt(
        i,
        m4.compose(tmpV.set(st.x, st.y, st.z), turnQ, personScale),
      );
      robeOf.get(st)!.toArray(tint, i * 3);
    });
    geo.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 3));
    geo.setAttribute(
      "aLeave",
      new THREE.InstancedBufferAttribute(
        Float32Array.from(list, (st) => ord[seatOf.get(st)!]),
        1,
      ),
    );
    geo.setAttribute(
      "aGrey",
      new THREE.InstancedBufferAttribute(
        Float32Array.from(list, (st) => greyOf.get(st)!),
        1,
      ),
    );
    people.frustumCulled = false;
    scene.add(people);
  }
  /* The gathering's marks on the ground, painted once into a texture the
     terrain reads: under each person a soft shadow where they rest on it,
     and before them their orb's light (blue: when it leaves). Only for the
     gathering the camera comes down among; elsewhere they are too far off. */
  {
    const xs = peopleSeats.map((st) => st.x);
    const zs = peopleSeats.map((st) => st.z);
    const pad = 1;
    const x0 = Math.min(...xs) - pad;
    const z0 = Math.min(...zs) - pad;
    const w = Math.max(...xs) + pad - x0;
    const d = Math.max(...zs) + pad - z0;
    const SIZE = 2048;
    const px = SIZE / Math.max(w, d);
    const layer = () => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = SIZE;
      const cx = cv.getContext("2d")!;
      cx.fillStyle = "#000";
      cx.fillRect(0, 0, SIZE, SIZE);
      return { cv, cx };
    };
    const shadow = layer();
    const light = layer();
    const leave = layer();
    const orbFlat = new THREE.Vector3(orbLocal.x, 0, orbLocal.z).multiplyScalar(
      PERSON,
    );
    const blob = (
      cx: CanvasRenderingContext2D,
      x: number,
      z: number,
      r: number,
      a: number,
    ) => {
      const g = cx.createRadialGradient(
        (x - x0) * px,
        (z - z0) * px,
        0,
        (x - x0) * px,
        (z - z0) * px,
        r * px,
      );
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      cx.fillStyle = g;
      cx.fillRect((x - x0 - r) * px, (z - z0 - r) * px, 2 * r * px, 2 * r * px);
    };
    const seatIndex = new Map(seats.map((st, j) => [st, j]));
    // The moon's way across the ground (from it), for each person's shadow.
    const away = new THREE.Vector2(-nightLight.x, -nightLight.z).normalize();
    for (const st of peopleSeats) {
      // (Out past the gho's hem, darkest under it, and a soft shadow trailing
      // away from the moon.)
      blob(shadow.cx, st.x, st.z - 0.05 * PERSON, 0.95 * PERSON, 0.9);
      for (let k = 1; k <= 4; k++)
        blob(
          shadow.cx,
          st.x + away.x * k * 0.28 * PERSON,
          st.z + away.y * k * 0.28 * PERSON,
          (0.75 - k * 0.06) * PERSON,
          0.32 - k * 0.05,
        );
      const o = orbFlat
        .clone()
        .applyAxisAngle(up, st.yaw)
        .add(tmpV.set(st.x, 0, st.z));
      blob(light.cx, o.x, o.z, 1.0 * PERSON, 0.9);
      const v = Math.round(ord[seatIndex.get(st)!] * 255);
      leave.cx.fillStyle = `rgb(${v},${v},${v})`;
      leave.cx.beginPath();
      leave.cx.arc(
        (o.x - x0) * px,
        (o.z - z0) * px,
        1.3 * PERSON * px,
        0,
        Math.PI * 2,
      );
      leave.cx.fill();
    }
    const read = (cv: HTMLCanvasElement) =>
      cv.getContext("2d")!.getImageData(0, 0, SIZE, SIZE).data;
    const [a, b, e] = [read(shadow.cv), read(light.cv), read(leave.cv)];
    const data = new Uint8Array(SIZE * SIZE * 4);
    for (let i = 0; i < SIZE * SIZE; i++) {
      data[i * 4] = a[i * 4];
      data[i * 4 + 1] = b[i * 4];
      data[i * 4 + 2] = e[i * 4];
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
    tex.colorSpace = THREE.NoColorSpace;
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    crowdMap.uCrowd.value = tex;
    crowdMap.uCrowdBox.value.set(x0, z0, SIZE / px, SIZE / px);
    crowdMap.uCrowdOn.value = 1;
  }
  crowdMat.uniforms.uLag = { value: 0 };
  crowdMat.uniforms.uGhost = { value: 1 };
  // The trails: the crowd drawn again, each a step further behind and
  // fainter, sharing the lights' own uniforms.
  const TRAIL = small
    ? [
        [0.004, 0.45],
        [0.008, 0.2],
      ]
    : [
        [0.003, 0.5],
        [0.006, 0.34],
        [0.009, 0.2],
        [0.012, 0.1],
      ];
  const trails: THREE.Points[] = [];
  for (const [lag, ghost] of TRAIL) {
    const m = new THREE.ShaderMaterial({
      vertexShader: CROWD_VERT,
      fragmentShader: CROWD_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        ...crowdMat.uniforms,
        uLag: { value: lag },
        uGhost: { value: ghost },
      },
    });
    const trail = new THREE.Points(crowd.g, m);
    trail.frustumCulled = false;
    trail.renderOrder = 2;
    trails.push(trail);
    scene.add(trail);
    materials.push(m);
  }

  /* ── Camera ──
     The valley view: from downstream and above, looking back up the valley at
     the middle of the row. The close shot: across the water from CHORTEN. */
  const closeEye = new THREE.Vector3();
  const closeAt = new THREE.Vector3(
    foot.x + 0.5,
    foot.y + CHORTEN_H * 0.28,
    foot.z - 2,
  );
  const wantEye = new THREE.Vector3();
  const orbitEye = new THREE.Vector3();
  const orbitAt = new THREE.Vector3();
  const wantAt = new THREE.Vector3();

  /* Then down among them (approach), to one person in the front row near the
     middle: from in front and a little to one side, at the height of their
     eyes, a metre or so away, as the photographs of the night were taken. */
  const onePos = new THREE.Vector3(one.x, one.y, one.z);
  // A point on that person, from their own metres (+z the way they face).
  const onBody = (x: number, y: number, z: number) =>
    new THREE.Vector3(x, y, z)
      .multiplyScalar(PERSON)
      .applyAxisAngle(up, one.yaw)
      .add(onePos);

  // The close shot is on the orb and the face bowed over it: a little above
  // the orb, to one side, aimed between the two.
  // In profile, as the photographs of the night have them: the face bowed
  // to the orb in the hands, both lit by it.
  const CLOSE = onBody(-1.0, 0.72, 1.05);
  const closeLook = onBody(0, 0.57, 0.28);
  /* The whole night as one way, from the opening's view down the valley and
     in to the one person's orb: the camera's a single curve, and its aim one
     move from the row to the person, each turning one way only. The last of
     it is a push in along the close shot's own line of sight, so the shot
     arrives without a turn; the way down the valley bends onto that line in
     one arc. (Threaded through the old beats, a look across at the site, a
     stop in front of the gathering, a point before the person, then their
     side, the view swung left and back right four times, nearly two hundred
     degrees for fifty.) NIGHT_WIDE: where the way leaves the valley's glide
     and comes down onto the line. */
  /* The way in: a spiral onto the person (a logarithmic one, a bird's as it
     comes in to land on a branch), from the opening's place to the close
     shot's: round them at one even rate while the distance falls by the
     same share at every step, so the picture turns at one rate and moves at
     one pace the whole way, each turning one way only. Looking at them
     throughout, after a short blend out of the opening's view. (A circle's
     arc turned evenly by distance, so the turning all came high up at the
     start and almost none in the long last stretch near the ground; a
     straight push in after a turn had the same fault; threaded through
     waypoints, the view snaked.) NIGHT_WIDE: from here on, in among the
     people. */
  const NIGHT_WIDE = 0.6;
  const spiral = (() => {
    const r0 = Math.hypot(C0.x - closeLook.x, C0.z - closeLook.z);
    const r1 = Math.hypot(CLOSE.x - closeLook.x, CLOSE.z - closeLook.z);
    const th0 = Math.atan2(C0.z - closeLook.z, C0.x - closeLook.x);
    let th1 = Math.atan2(CLOSE.z - closeLook.z, CLOSE.x - closeLook.x);
    // (The shorter way round.)
    while (th1 - th0 > Math.PI) th1 -= 2 * Math.PI;
    while (th1 - th0 < -Math.PI) th1 += 2 * Math.PI;
    const e0 = Math.atan2(C0.y - closeLook.y, r0);
    const e1 = Math.atan2(CLOSE.y - closeLook.y, r1);
    return { r0, r1, th0, th1, e0, e1 };
  })();
  const nightEye = {
    getPoint: (u: number, out: THREE.Vector3) => {
      const r = spiral.r0 * Math.pow(spiral.r1 / spiral.r0, u);
      const th = spiral.th0 + (spiral.th1 - spiral.th0) * u;
      const e = spiral.e0 + (spiral.e1 - spiral.e0) * u;
      return out.set(
        closeLook.x + Math.cos(th) * r,
        closeLook.y + Math.tan(e) * r,
        closeLook.z + Math.sin(th) * r,
      );
    },
  };
  // (From the opening's aim, at the row, onto the person over the first
  // NIGHT_ONTO of the way, turning the same way as the spiral then does.)
  const NIGHT_ONTO = 0.65;
  const aimOpen = T0.clone().sub(C0).normalize();
  const aimEye = new THREE.Vector3();
  const aimTo = new THREE.Vector3();
  const nightAim = {
    getPoint: (u: number, out: THREE.Vector3) => {
      nightEye.getPoint(u, aimEye);
      aimTo.subVectors(closeLook, aimEye);
      const d = Math.max(aimTo.length(), CLOSE.distanceTo(closeLook));
      aimTo
        .normalize()
        .lerp(aimOpen, 1 - THREE.MathUtils.smoothstep(u, 0, NIGHT_ONTO))
        .normalize();
      return out.copy(aimEye).addScaledVector(aimTo, d);
    },
  };
  /* Paced by how fast it looks, not by how far it goes: the same distance
     sweeps the ground past ten times faster four metres up than seventy, so
     taken evenly by distance it crept along the valley and then plunged in.
     Along the way, how far the picture turns for each step: the camera's
     move over the distance to what it sees (the aim, or the ground under it,
     whichever is nearer) and the aim's own turn. The scroll is spent evenly
     on that (nightAt), eased in and out over the first and last NIGHT_EASE. */
  const NIGHT_EASE = 0.16;
  const nightPace = (() => {
    const N = 2400;
    const cum = new Float32Array(N + 1);
    const p = new THREE.Vector3(),
      a = new THREE.Vector3(),
      pp = new THREE.Vector3(),
      dir = new THREE.Vector3(),
      pdir = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      nightEye.getPoint(i / N, p);
      nightAim.getPoint(i / N, a);
      dir.subVectors(a, p);
      const d = dir.length();
      dir.divideScalar(d);
      if (i > 0) {
        const h = Math.max(0.3, p.y - groundAt(p.x, p.z));
        cum[i] =
          cum[i - 1] +
          p.distanceTo(pp) / Math.min(d, 3 * h) +
          dir.angleTo(pdir);
      }
      pp.copy(p);
      pdir.copy(dir);
    }
    for (let i = 0; i <= N; i++) cum[i] /= cum[N];
    return cum;
  })();
  // The scroll's share eased at the two ends: its pace rising and falling
  // smoothly over NIGHT_EASE, even between.
  const nightEase = (() => {
    const N = 512;
    const cum = new Float32Array(N + 1);
    for (let i = 1; i <= N; i++) {
      const x = (i - 0.5) / N;
      cum[i] =
        cum[i - 1] +
        THREE.MathUtils.smoothstep(x, 0, NIGHT_EASE) *
          (1 - THREE.MathUtils.smoothstep(x, 1 - NIGHT_EASE, 1));
    }
    for (let i = 0; i <= N; i++) cum[i] /= cum[N];
    return cum;
  })();
  // A table's value at x (0..1), and the x at which a rising table reaches v.
  const tableAt = (t: Float32Array, x: number) => {
    const f = THREE.MathUtils.clamp(x, 0, 1) * (t.length - 1);
    const i = Math.min(t.length - 2, Math.floor(f));
    return t[i] + (t[i + 1] - t[i]) * (f - i);
  };
  const tableFind = (t: Float32Array, v: number) => {
    let lo = 0,
      hi = t.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (t[mid] < v) lo = mid;
      else hi = mid;
    }
    return (lo + (v - t[lo]) / Math.max(1e-9, t[hi] - t[lo])) / (t.length - 1);
  };
  const nightAt = (night: number) =>
    tableFind(nightPace, tableAt(nightEase, night));
  /* The first light's own way, as CROWD_VERT moves it (first = 1), so the
     camera can follow it: up out of the hands to the mandala's centre, and
     later down from there to the foundation. */
  const cubic = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    k: number,
    out: THREE.Vector3,
  ) => {
    const m = 1 - k;
    return out
      .copy(a)
      .multiplyScalar(m * m * m)
      .addScaledVector(b, 3 * m * m * k)
      .addScaledVector(c, 3 * m * k * k)
      .addScaledVector(d, k * k * k);
  };
  const firstLift = oneOrb
    .clone()
    .add(new THREE.Vector3(0, 6 + rand[firstJ] * 4, 0));
  const firstUnder = mandC.clone().add(new THREE.Vector3(0, -3, 0));
  const PAN = 0.07; // as CROWD_VERT's
  const firstUp = (g: number, out: THREE.Vector3) =>
    cubic(
      oneOrb,
      firstLift,
      firstUnder,
      mandC,
      Math.pow(THREE.MathUtils.smoothstep(g, PAN, PAN + 0.4), 1.6),
      out,
    );
  // How far along the ribbon its head is (the first light down, aOrder 1,
  // as CROWD_VERT has it: JOINF and FL), and where.
  const JOINF = 0.18;
  const FL = 0.7;
  const headAlong = (d: number) =>
    THREE.MathUtils.clamp(
      (THREE.MathUtils.smoothstep(d, 0, 0.75) - JOINF) / (FL - JOINF),
      0,
      1,
    );
  // When the head leaves the centre (smoothstep(d, 0, 0.75) reaching JOINF).
  const D_OUT = 0.75 * 0.3;
  const onRibbon = (k: number, out: THREE.Vector3) =>
    cubic(ribbon[0], ribbon[1], ribbon[2], ribbon[3], k, out);
  const headAt = new THREE.Vector3();
  const headBack = new THREE.Vector3();
  const headAhead = new THREE.Vector3();
  const firstAt = new THREE.Vector3();
  // Where the camera rides relative to it: from the close shot's place, out to
  // a little below and behind.
  const closeOff = CLOSE.clone().sub(oneOrb);
  // Round to the right of the close shot's view, level, a couple of metres off.
  const view0 = closeOff.clone().negate().setY(0).normalize();
  const right0 = new THREE.Vector3().crossVectors(view0, up).normalize();
  // (A side view of them: round to the right, square on to their side.)
  const sideOff = view0
    .clone()
    .multiplyScalar(-0.05)
    .addScaledVector(right0, 0.75);
  const followOff = new THREE.Vector3();
  // How far up (in uGather) the camera rides with it before drawing back.
  const RIDE = 0.3;
  // How far round under the mandala the camera goes while it fills.
  const MANDALA_DRIFT = THREE.MathUtils.degToRad(10);

  /* The release (the raising's first part): from the orb the camera drops
     back low, looking up after the first light as it climbs, and keeps
     drawing back along the ground to the water's edge (lookUp), the people in
     the foreground, their lights rising past it into the mandala overhead. */
  // Where the camera draws back to: toward the water's edge (lookUp), low,
  // near enough the mandala that it fills the upper part of the picture.
  const pullEnd = lookUp
    .clone()
    .lerp(mandC.clone().add(new THREE.Vector3(0, -7, 0)), 0.38);
  /* The ending: low, at about the height of its spire, just behind the
     chorten the lights have made and out on the bank toward the water,
     looking down the valley along the row: it stands large in the foreground
     on the left, the others lining up beyond it, the river on the right, and
     first light ahead (the closing copy sits right, over the river and sky). */
  const downRow = allFeet[Math.min(allFeet.length - 1, CHORTEN_SITE + 10)]
    .clone()
    .sub(foot)
    .setY(0)
    .normalize();
  const landward = new THREE.Vector3(downRow.z, 0, -downRow.x); // to the camera's left, away from the water
  // Far enough behind it that it stands in the left third, the one before it
  // just out of the picture.
  const endEye = foot
    .clone()
    .addScaledVector(downRow, -7.5)
    .addScaledVector(landward, -3.6);
  // (Some sixty metres over the meadow, a little lower than at first.)
  endEye.y = groundAt(endEye.x, endEye.z) + 3.3;

  const endAt = allFeet[Math.min(allFeet.length - 1, CHORTEN_SITE + 22)]
    .clone()
    .addScaledVector(landward, -1.8)
    .add(new THREE.Vector3(0, 0.3, 0));
  // The noon sun: in the upper right of the end's picture, as the moon is in
  // the opening's, so the chortens' shadows fall toward the eye and left.
  {
    const fwd = endAt.clone().sub(endEye).setY(0).normalize();
    const rightOf = new THREE.Vector3(-fwd.z, 0, fwd.x);
    noonSun
      .copy(fwd)
      .addScaledVector(rightOf, 0.5)
      .normalize()
      .multiplyScalar(Math.cos(0.3))
      .setY(Math.sin(0.3));
  }
  /* The trees' and bushes' shadows by day: each a soft, tapering shape on
     the ground cast away from the noon sun (noonSun), as long as its height
     and the sun's low angle make it, laid over the ground's own slope (its
     corners set on the land) so it neither floats nor sinks on a hillside.
     (The trees are pictures turned to the eye, and cast none of their own;
     at noon they stood on the meadow unanchored.) Made once; two triangles
     each; faded in with the day. Those cleared from among the gatherings
     (size 0) cast none. */
  const treeShadowMat = new THREE.ShaderMaterial({
    vertexShader: "attribute vec2 aUv; attribute float aW; varying vec2 vUv; varying float vW; void main() { vUv = aUv; vW = aW; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform float uAmt;
      varying vec2 vUv;
      varying float vW;
      void main() {
        // (Across: -1..1; along: 0 at the foot, 1 at the crown's far end.)
        float along = vUv.y;
        // The crown's shadow, rounder and darker toward the far end, the
        // trunk's a thin line from the foot.
        float crown = 1.0 - smoothstep(0.55, 1.0, length(vec2(vUv.x, (along - 0.62) / 0.42)));
        float trunk = (1.0 - smoothstep(0.06, 0.14, abs(vUv.x))) * smoothstep(0.0, 0.05, along) * (1.0 - smoothstep(0.3, 0.45, along));
        float a = max(crown, trunk * 0.7) * uAmt * vW;
        if (a < 0.004) discard;
        gl_FragColor = vec4(0.0, 0.02, 0.0, a);
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { uAmt: { value: 0 } },
  });
  materials.push(treeShadowMat);
  // (By night as well, fainter and softer, cast from the moonlight the
  // land is shaded by (nightLight), so they agree with the hills' own shade.)
  const treeNightMat = treeShadowMat.clone();
  materials.push(treeNightMat);
  const buildTreeShadows = (light: THREE.Vector3, mat: THREE.ShaderMaterial) => {
    if (!plantAt || !plantSize || !plantKind) return null;
    const aspect = [1.044, 0.81, 1.062, 0.64];
    const sun = light.clone();
    const dir = new THREE.Vector2(-sun.x, -sun.z).normalize();
    const side = new THREE.Vector2(-dir.y, dir.x);
    const slope = sun.y / Math.hypot(sun.x, sun.z); // rise over run
    const pos: number[] = [], uv: number[] = [], w: number[] = [], idx: number[] = [];
    const sizes = plantSize.array as Float32Array;
    for (let i = 0, n = 0; i < sizes.length; i++) {
      const sz = sizes[i];
      if (sz <= 0) continue;
      const x = plantAt[i * 3], z = plantAt[i * 3 + 2];
      const h = sz * aspect[Math.round(plantKind[i])] ;
      const len = Math.min(h / slope, h * 2.6);
      const half = sz * 0.42;
      // (In short lengths, each set on the land, so over a rounded hill it
      // bends with the ground: one flat piece cut straight across it.)
      const SEG = 6;
      const b = n * (SEG + 1) * 2;
      for (let k = 0; k <= SEG; k++) {
        const v = k / SEG;
        const wAt = half * (0.35 + 0.65 * Math.min(1, v / 0.6));
        for (const sgn of [-1, 1]) {
          const cx = x + side.x * sgn * wAt + dir.x * len * v,
            cz = z + side.y * sgn * wAt + dir.y * len * v;
          pos.push(cx, groundAt(cx, cz) + 0.006, cz);
          uv.push(sgn, v);
          w.push(Math.round(plantKind[i]) === 3 ? 0.6 : 1);
        }
        if (k < SEG) {
          const a = b + k * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      n++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("aUv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("aW", new THREE.Float32BufferAttribute(w, 1));
    geo.setIndex(idx);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
    return mesh;
  };
  /* And where each meets the ground, by day and night alike, a small soft
     dark ring round its foot: the earth under a tree's spread, out of the
     sky's light. (The long shadows above fall away from it; without this
     the foot still stood on a lit hill.) */
  const contactMat = new THREE.ShaderMaterial({
    vertexShader: "attribute float aR; varying float vR; void main() { vR = aR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform float uAmt; varying float vR; void main() { float a = (1.0 - smoothstep(0.1, 1.0, vR)) * uAmt; if (a < 0.004) discard; gl_FragColor = vec4(0.0, 0.02, 0.0, a); }",
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { uAmt: { value: 0 } },
  });
  materials.push(contactMat);
  const treeContact = (() => {
    if (!plantAt || !plantSize || !plantKind) return null;
    const pos: number[] = [], rr: number[] = [], idx: number[] = [];
    const sizes = plantSize.array as Float32Array;
    const RIM = 10;
    for (let i = 0, n = 0; i < sizes.length; i++) {
      const sz = sizes[i];
      if (sz <= 0) continue;
      const x = plantAt[i * 3], z = plantAt[i * 3 + 2];
      const rad = sz * (Math.round(plantKind[i]) === 3 ? 0.55 : 0.5);
      const b = n * (RIM + 1);
      pos.push(x, groundAt(x, z) + 0.006, z);
      rr.push(0);
      for (let k = 0; k < RIM; k++) {
        const a = (k / RIM) * Math.PI * 2;
        const cx = x + Math.cos(a) * rad, cz = z + Math.sin(a) * rad;
        pos.push(cx, groundAt(cx, cz) + 0.006, cz);
        rr.push(1);
        idx.push(b, b + 1 + k, b + 1 + ((k + 1) % RIM));
      }
      n++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("aR", new THREE.Float32BufferAttribute(rr, 1));
    geo.setIndex(idx);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, contactMat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
    return mesh;
  })();
  const treeShadows = buildTreeShadows(noonSun, treeShadowMat);
  const treeNightShadows = buildTreeShadows(nightLight, treeNightMat);
  // On a tall, narrow screen, aimed nearer it, so it stays in the picture.
  const endAtNarrow = foot
    .clone()
    .addScaledVector(downRow, 6)
    .addScaledVector(landward, 0.8)
    .add(new THREE.Vector3(0, 1.6, 0));
  // (On trial: fireflies in the ending's night too, over the meadow a few
  // units before its eye, until the day comes.)
  const endFly = (() => {
    const c = endAt.clone().sub(endEye).setY(0).setLength(5).add(endEye);
    return flies.extra(c.x, c.z, 6, small ? 50 : 100, 5531, null);
  })();
  const shotEye = new THREE.Vector3();
  const shotAt = new THREE.Vector3();
  function shot(d: number, approach: number, release: number) {
    // (d: where on the night's way, nightAt's; approach: how far in from the
    // gathering's view.)
    if (release > 0) {
      /* The subject is the first light. The camera pans right, round to its
         side, and rises with it, level with it, so it climbs through the
         picture against the hills and the sky; once it is a few metres up the
         camera stops, then draws back and down along the ground, tilting up to
         the mandala as that fills. */
      /* By the storyboard's beats, all keyed on uGather like the lights:
         the first light (to RIDE): the camera pans to its side, rides with it;
         then one unbroken move (to 0.56): it draws back, down and away toward
           the water, tilting up after the first light as it climbs to the
           mandala's centre, the others rising up through the picture;
         the mandala (to 1): it holds below it as it fills from the centre. */
      const g = gatherNow;
      // (Round to the side unhurried, as the light lifts: not a swing.)
      followOff.lerpVectors(
        closeOff,
        sideOff,
        THREE.MathUtils.smoothstep(g, 0, RIDE),
      );
      // (Easing to a stop past RIDE, not stopping there: stopped dead, the
      // light under a metre off climbed away from it so fast that the camera,
      // looking after it, tipped fifty degrees in four frames, a cut.)
      const gRide =
        g <= RIDE ? g : RIDE + 0.12 * (1 - Math.exp(-(g - RIDE) / 0.12));
      shotEye.copy(firstUp(gRide, firstAt)).add(followOff);
      shotEye.lerp(pullEnd, THREE.MathUtils.smoothstep(g, RIDE + 0.02, 0.56));
      // Looking after the first light all the way, aimed a little below it
      // more and more, so it climbs the picture and the valley stays along the
      // foot of it: it ends at the mandala's centre, upper middle.
      firstUp(g, firstAt);
      // (Kept on the light itself while it climbs into the sky, the camera
      // tilting up after it; lowered toward the mandala's place in the
      // picture only as it reaches the centre.)
      shotAt.copy(firstAt).y -= 6.5 * THREE.MathUtils.smoothstep(g, 0.42, 0.6);
      // (From where the close shot was looking, between the face and the orb,
      // eased onto the light as it begins to rise: never a cut.)
      shotAt.lerp(closeLook, 1 - THREE.MathUtils.smoothstep(g, 0, PAN));
      // While the mandala fills, round under it slowly, MANDALA_DRIFT, the
      // ground and the hills passing beneath it, its centre held: still, the
      // picture stood for screens on end. (From just before the drawing back
      // settles, so the one move runs into the other.)
      // (On into the first of the way down, until the camera turns after the
      // lights: stopped when the mandala was whole, it stood still again
      // until they set off.)
      shotEye
        .sub(mandC)
        .applyAxisAngle(
          up,
          MANDALA_DRIFT *
            THREE.MathUtils.smoothstep(g + 2 * descendNow, 0.5, 1.35),
        )
        .add(mandC);
      return;
    }
    // The night's one way, at the place nightAt found for the scroll.
    nightEye.getPoint(d, shotEye);
    nightAim.getPoint(d, shotAt);
    // Under the path's holds (each line held still while it is read), a slow
    // drift in and to the side with the scroll, rising and settling across
    // the whole night, so the picture is never quite still; gone again
    // where the way down among the people begins.
    // Never into the ground. (The spiral comes down in step with its
    // closing in; held higher, the camera hovered over the person looking
    // steeply down, then dropped the last of the way at once.)
    shotEye.y = Math.max(shotEye.y, groundAt(shotEye.x, shotEye.z) + 0.12);
  }
  const at = new THREE.Vector3();
  let first = true;
  let wide = true;

  /* QUALITY: the page keeps itself smooth on whatever device opens it, as
     108.bt's does. After a few seconds' settling it averages real frames,
     ninety at a time: past 21 ms (under about 48 a second) it draws at 0.85
     of the pixels, down to 0.6 of them (and never under the screen's own:
     sharpness, above); under 17.5 ms for two such spells running it steps
     back up. A step it fell back from is not tried again for a minute, so it
     never see-saws, unless the camera has gone on to another shot (FORGET
     units off): the page's chapters differ in cost twofold, and a heavy
     one's step down was held through the light ones after it. Pixels are what the finish costs by: fewer of them is
     the one change that helps on every device and leaves the picture whole.
     The lens's blur is off at the lowest. */
  let quality = 1;
  let lastNow = 0;
  let startAt = -1;
  let changedAt = -Infinity;
  let fellAt = -Infinity;
  let failedAt = Infinity; // the share it last fell back from
  const failedFrom = new THREE.Vector3(); // and where the camera was
  const FORGET = 8;
  let sum = 0;
  let count = 0;
  let good = 0;
  // (Sizes set in pixels, the lights' and dots' least and most, scaled with
  // it: left as they were, each light grew against the smaller picture and
  // the mandala's thousands ran together into a white sheet.)
  const pxBase = new Map<THREE.IUniform, number>();
  // How much of the first sharpness is drawn now.
  let drawn = 1;
  const setQuality = (q: number) => {
    quality = Math.max(0.6, Math.min(1, q));
    resize();
    if (process.env.NODE_ENV !== "production") (window as unknown as { __grQuality?: number }).__grQuality = quality;
  };
  const watchFrames = () => {
    const now = performance.now();
    const dt = now - lastNow;
    lastNow = now;
    // (Not across a pause: a hidden tab, a stall loading, the first frame.)
    if (dt <= 0 || dt > 250 || document.hidden) return;
    if (startAt < 0) startAt = now;
    if (now - startAt < 3000 || now - changedAt < 4000) {
      sum = count = 0;
      return;
    }
    sum += Math.min(dt, 50);
    if (++count < 90) return;
    const avg = sum / count;
    sum = count = 0;
    if (avg > 21) {
      good = 0;
      fellAt = now;
      if (quality <= 0.6 + 1e-6) return;
      failedAt = quality;
      failedFrom.copy(camera.position);
      setQuality(quality * 0.85);
      changedAt = now;
      return;
    }
    if (avg >= 17.5) {
      good = 0;
      return;
    }
    if (quality >= 1 - 1e-6 || ++good < 2) return;
    const next = Math.min(1, quality / 0.85);
    if (next >= failedAt - 1e-6) {
      if (now - fellAt < 60000 && camera.position.distanceTo(failedFrom) < FORGET) return;
      failedAt = Infinity;
    }
    good = 0;
    setQuality(next);
    changedAt = now;
  };

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(sharpness(quality));
    drawn = renderer.getPixelRatio() / pr;
    for (const m of materials) {
      const u = (m as THREE.ShaderMaterial).uniforms;
      if (!u) continue;
      for (const k of ["uMinPx", "uMaxPx", "uPx"]) {
        const un = u[k];
        if (!un || typeof un.value !== "number") continue;
        if (!pxBase.has(un)) pxBase.set(un, un.value);
        un.value = pxBase.get(un)! * drawn;
      }
    }
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 56 : 40;
    wide = w >= 1024 && camera.aspect > 1.2;
    closeEye.set(
      foot.x - 1.2,
      foot.y + 3.2,
      foot.z + (camera.aspect < 1 ? 15 : 11) * 0.55,
    );
    shared.uScale.value = renderer.getContext().drawingBufferHeight;
  }
  resize();
  if (process.env.NODE_ENV !== "production") (window as unknown as { __grSetQuality?: (q: number) => void }).__grSetQuality = (q) => setQuality(q);

  /* Pointer sway, as 108.bt's hero has it: the camera swings up to SWAY
     degrees either way as the pointer crosses the window, left and right
     only, eased; on a touch screen, a finger dragged across (not down: a
     scroll is left alone) does the same. None under reduced motion. It
     swings round what it looks at when that is near (the one the close shot
     is on), and when it looks far, round a point a few units ahead of the
     eye, so the view turns and the eye moves only a little (swung round a
     point far off, as at first, six degrees threw the eye tens of units). */
  const SWAY = 3;
  const SWAY_PIVOT = 10;
  let sway = 0;
  let swayTarget = 0;
  let swayK = 1;
  const hover = window.matchMedia("(hover: hover) and (pointer: fine)");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointerNdc = new THREE.Vector2();
  let pointerOn = false;
  const onPointer = (e: PointerEvent) => {
    if (still.matches || !hover.matches || e.pointerType !== "mouse") return;
    swayTarget = (e.clientX / window.innerWidth - 0.5) * 2;
    pointerNdc.set((e.clientX / window.innerWidth) * 2 - 1, 1 - (e.clientY / window.innerHeight) * 2);
    pointerOn = true;
    pointerMoved = true;
  };
  const onPointerOut = () => (pointerOn = false);
  document.documentElement.addEventListener("pointerleave", onPointerOut);
  // Where the pointer's ray meets the ground: stepped out from the eye,
  // longer steps further off, then halved back to the crossing. (null when
  // it meets none within reach.)
  const rayTo = new THREE.Vector3();
  const rayAt = new THREE.Vector3();
  const pointerGround = (out: THREE.Vector3, reach = 60) => {
    // (The camera as placed this frame: its matrix is otherwise brought up
    // to date only as it draws.)
    camera.updateMatrixWorld();
    rayTo.set(pointerNdc.x, pointerNdc.y, 0.5).unproject(camera).sub(camera.position).normalize();
    let t0 = 0;
    for (let t = 0.05; t < reach; t += 0.02 + t * 0.04) {
      rayAt.copy(camera.position).addScaledVector(rayTo, t);
      if (rayAt.y < groundAt(rayAt.x, rayAt.z)) {
        let a = t0, b = t;
        for (let k = 0; k < 8; k++) {
          const m = (a + b) / 2;
          rayAt.copy(camera.position).addScaledVector(rayTo, m);
          if (rayAt.y < groundAt(rayAt.x, rayAt.z)) b = m;
          else a = m;
        }
        return out.copy(camera.position).addScaledVector(rayTo, b);
      }
      t0 = t;
    }
    return null;
  };
  const pushHit = new THREE.Vector3();
  const ripHit = new THREE.Vector3();
  /* The ripples' patch (RIP_FRAG): two targets, each step read from one
     and written to the other. Laid where the pointer first touches the
     water, its size by how far off that is (a little over the square root,
     so ripples are larger in the world far off, where at a finger's size
     they would be lost, yet smaller on screen than close by); kept while it
     moves, shifted under the water to keep the pointer near its middle;
     carried downstream with the current; laid afresh once all is still. */
  const ripOpts = {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    anisotropy: 8,
  } as const;
  let ripRead = new THREE.WebGLRenderTarget(RIP_N, RIP_N, ripOpts);
  let ripWrite = new THREE.WebGLRenderTarget(RIP_N, RIP_N, ripOpts);
  shadowMaps.push(ripRead, ripWrite);
  const ripMat = new THREE.ShaderMaterial({
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: RIP_FRAG,
    uniforms: {
      uPrev: { value: null as THREE.Texture | null },
      uShift: { value: new THREE.Vector2() },
      uA: { value: new THREE.Vector4() },
      uB: { value: new THREE.Vector4() },
      uDamp: { value: 0.985 },
    },
    depthTest: false,
    depthWrite: false,
  });
  materials.push(ripMat);
  const ripScene = new THREE.Scene();
  const ripQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ripMat);
  ripQuad.frustumCulled = false;
  ripScene.add(ripQuad);
  geometries.push(ripQuad.geometry);
  const ripCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let ripOn = false;
  let ripStill = 0; // seconds since the pointer last touched it
  let ripRest = 0; // seconds since its last touch while resting
  let ripNext = 1.5; // and until the next
  let ripSteps = 0;
  const ripLast = new THREE.Vector2(); // the pointer's last touch, in the patch
  let ripHad = false;
  const ripStep = (n: number, stamp: boolean, damp = 0.985) => {
    const u = ripMat.uniforms;
    u.uDamp.value = damp;
    const prev = renderer.getRenderTarget();
    for (let i = 0; i < n; i++) {
      u.uPrev.value = ripRead.texture;
      if (!stamp || i > 0) u.uA.value.w = 0;
      renderer.setRenderTarget(ripWrite);
      renderer.render(ripScene, ripCam);
      [ripRead, ripWrite] = [ripWrite, ripRead];
      u.uShift.value.set(0, 0);
    }
    renderer.setRenderTarget(prev);
    ripU.uRipple.value = ripRead.texture;
  };
  const RIP_LOW = 24; // the camera's height over the ground below which they are whole
  const RIP_HIGH = 32; // and above which there are none
  const RIP_FADE = 120; // units from the camera the touches begin to fade
  const RIP_FAR = 170; // and beyond which there are none
  const RIP_RATE = 40; // steps a second

  /* Leaves on the breeze, by day, as 108.bt's: a few dozen carried past
     the camera, in the air a few units before it (by day it stands some way
     up over the meadow, the ground before it out of the picture), on the
     same gusts the
     grass bends to (WIND's windOff), turning slowly, lifted a little by each
     gust and skimming the grass between; one gone out of the box starts
     again on its upwind side. The pointer blows them aside. A little larger
     than a real leaf: the valley is drawn so large that one true to size is
     under a pixel from any of its shots. */
  const LEAF_N = small ? 8 : 18;
  const LEAF_SIZE = 0.022;
  const LEAF_SPAN = 1.6; // the box's half-width, units
  const LEAF_AHEAD = 2.6; // its centre, units along the view
  const leafDir = new THREE.Vector2(0.2, 1).normalize(); // (WIND's)
  const leafSide = new THREE.Vector2(-leafDir.y, leafDir.x);
  const leafGust = (x: number, z: number, t: number) => {
    const g = 0.5 + 0.5 * Math.sin((x * leafDir.x + z * leafDir.y) * 2.8 - t * 1.3);
    return g * g;
  };
  const leafGeo = (() => {
    // A pointed leaf, cupped a little along its length, so it catches the
    // light as it turns rather than reading as a flat card.
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.5);
    shape.bezierCurveTo(0.32, -0.3, 0.3, 0.2, 0, 0.5);
    shape.bezierCurveTo(-0.3, 0.2, -0.32, -0.3, 0, -0.5);
    const g = new THREE.ShapeGeometry(shape, 6);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, -0.35 * pos.getX(i) * pos.getX(i));
    g.computeVertexNormals();
    g.scale(LEAF_SIZE, LEAF_SIZE, LEAF_SIZE);
    return g;
  })();
  geometries.push(leafGeo);
  // (Coloured outright, by day: lit, they took none of the scene's light
  // and drifted through as black specks, read as flies.)
  const leafMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  materials.push(leafMat);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, LEAF_N);
  leaves.frustumCulled = false;
  leaves.visible = false;
  scene.add(leaves);
  const leafCols = ["#6F8A34", "#8FA23F", "#B4A74A", "#C8A24A", "#8C6A3C"].map((c) => new THREE.Color(c));
  const leafState = Array.from({ length: LEAF_N }, (_, i) => {
    leaves.setColorAt(i, leafCols[i % leafCols.length].clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.08));
    return {
      pos: new THREE.Vector3(),
      push: new THREE.Vector3(),
      speed: 0,
      phase: 0,
      spin: new THREE.Vector3(0, 1, 0),
      rate: 0,
      scale: 1,
      placed: false,
    };
  });
  leaves.instanceColor!.needsUpdate = true;
  const leafAt = new THREE.Vector3();
  const leafFwd = new THREE.Vector3();
  const leafSpawn = (leaf: (typeof leafState)[number], anywhere: boolean) => {
    // On the box's upwind side, anywhere across it; or anywhere in it.
    const along = anywhere ? (Math.random() * 2 - 1) * LEAF_SPAN : -LEAF_SPAN;
    const across = (Math.random() * 2 - 1) * LEAF_SPAN;
    const x = leafAt.x + leafDir.x * along + leafSide.x * across;
    const z = leafAt.z + leafDir.y * along + leafSide.y * across;
    leaf.pos.set(x, Math.max(groundAt(x, z) + 0.02, leafAt.y + (Math.random() - 0.5) * 1.4), z);
    leaf.push.set(0, 0, 0);
    leaf.speed = 0.55 + Math.random() * 0.7;
    leaf.phase = Math.random() * Math.PI * 2;
    // (Turning mostly about the upright: about any axis, some flipped edge
    // on, over and over, and read as wings.)
    leaf.spin.set((Math.random() - 0.5) * 0.3, 1, (Math.random() - 0.5) * 0.3).normalize();
    leaf.rate = 0.16 + Math.random() * 0.22;
    leaf.scale = 0.7 + Math.random() * 0.6;
    leaf.placed = true;
  };
  let leafShow = 0;
  const leafQ = new THREE.Quaternion();
  const leafScale = new THREE.Vector3();
  const leafM = new THREE.Matrix4();
  const leafRay = new THREE.Vector3();
  const leafTo = new THREE.Vector3();

  // The pointer's trail over the meadow (POLLEN_*): a ring of specks, the
  // oldest given again as new ones are kicked up.
  const POLLEN_N = small ? 200 : 400;
  const POLLEN_NEAR = 14; // units: the trail's reach by night, the camera down by the gathering
  const POLLEN_END = 55; // and once the stone stands, the camera higher
  const pollenPos = new Float32Array(POLLEN_N * 3);
  const pollenVel = new Float32Array(POLLEN_N * 3);
  const pollenBirth = new Float32Array(POLLEN_N).fill(-100);
  const pollenSize = new Float32Array(POLLEN_N);
  const pollenCol = new Float32Array(POLLEN_N * 3);
  const pollenGeo = new THREE.BufferGeometry();
  const pollenAttr = {
    position: new THREE.BufferAttribute(pollenPos, 3).setUsage(THREE.DynamicDrawUsage),
    aVel: new THREE.BufferAttribute(pollenVel, 3).setUsage(THREE.DynamicDrawUsage),
    aBirth: new THREE.BufferAttribute(pollenBirth, 1).setUsage(THREE.DynamicDrawUsage),
    aSize: new THREE.BufferAttribute(pollenSize, 1).setUsage(THREE.DynamicDrawUsage),
    aCol: new THREE.BufferAttribute(pollenCol, 3).setUsage(THREE.DynamicDrawUsage),
  };
  for (const [name, a] of Object.entries(pollenAttr)) pollenGeo.setAttribute(name, a);
  geometries.push(pollenGeo);
  const pollenMat = new THREE.ShaderMaterial({
    vertexShader: POLLEN_VERT,
    fragmentShader: POLLEN_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // (As 108.bt's, no more than four points across: larger, near the lens,
    // they read as blobs and drew the eye.)
    uniforms: { uTime: shared.uTime, uScale: shared.uScale, uShow: { value: 0 }, uPx: { value: 3 * pr } },
  });
  materials.push(pollenMat);
  const pollen = new THREE.Points(pollenGeo, pollenMat);
  pollen.frustumCulled = false;
  pollen.visible = false;
  scene.add(pollen);
  let pollenNext = 0;
  let pollenHad = false;
  const pollenLast = new THREE.Vector3();
  const pollenHit = new THREE.Vector3();
  const RIP_FLOW = 0.5; // units a second downstream (+x)
  window.addEventListener("pointermove", onPointer, { passive: true });
  let touchX = 0,
    touchY = 0,
    touchFrom = 0,
    touchAcross: boolean | null = null;
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchX = t.clientX;
    touchY = t.clientY;
    touchFrom = swayTarget;
    touchAcross = null;
  };
  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t || still.matches) return;
    const dx = t.clientX - touchX,
      dy = t.clientY - touchY;
    if (touchAcross === null && Math.hypot(dx, dy) > 12)
      touchAcross = Math.abs(dx) > Math.abs(dy) * 1.5;
    if (touchAcross)
      swayTarget = Math.max(
        -1,
        Math.min(1, touchFrom + (2 * dx) / window.innerWidth),
      );
  };
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  const swayAxis = new THREE.Vector3(0, 1, 0);
  const offset = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  const swayAt = new THREE.Vector3();
  const eye = new THREE.Vector3();

  const lastWant = new THREE.Vector3();
  let followMix = 0;
  let trackMix = 0;
  let gatherNow = 0;
  let descendNow = 0;
  let revealNow = 0;
  let rotY = 0;
  let rotTarget = 0;
  let dragging = false;
  const tmp = new THREE.Vector3();
  const ease = (t: number) => t * t * (3 - 2 * t);

  return {
    resize,
    frame(s) {
      // (Only frames drawn at the page's own pace, not filmed ones.)
      // (Not while resting: its frames are spaced on purpose.)
      if (s.dt > 0 && !s.resting) watchFrames();
      else lastNow = performance.now();
      shared.uTime.value = s.time;
      const a = s.fade;
      // Where on the night's way, and from it how far down the valley to the
      // gathering (drift) and in from there to the one person (approach).
      const nightU = nightAt(s.night);
      const drift = THREE.MathUtils.clamp(nightU / NIGHT_WIDE, 0, 1);
      const approach = THREE.MathUtils.clamp(
        (nightU - NIGHT_WIDE) / (1 - NIGHT_WIDE),
        0,
        1,
      );
      const pull = ease(Math.max(s.toValley, s.many));
      const near = (1 - s.toValley) * (1 - s.many);

      // Once the chorten is complete the picture takes the page's maroon and
      // gold, the valley still there under it; it returns to its own colour
      // as the camera pulls back, when the other 107 rise out of their sites.
      night.uShow.value = a;
      grade.uniforms.uTint.value = 1 - s.valley;
      solo.uSolo.value = THREE.MathUtils.smoothstep(1 - s.valley, 0.3, 0.9);
      solo.uDim.value =
        s.many > 0 ? 0 : 0.7 * THREE.MathUtils.smoothstep(drift, 0.05, 0.6);
      grade.uniforms.uTime.value = s.time;
      skyMat.uniforms.uShow.value = night.uShow.value;
      daylight(s.daylight);
      night.uFogNear.value = THREE.MathUtils.lerp(60, 700, pull);
      night.uFogFar.value = THREE.MathUtils.lerp(300, 2600, pull);
      // (Once the camera is up and away from the next sites: rising as it
      // leaves, the nearest build up right by the lens.)
      const rise = THREE.MathUtils.smoothstep(s.many, 0.25, 0.75);
      for (const r of rows) r.mesh.visible = rise > 0;
      nearMat.userData.build.value = rise;
      stupaMat.userData.build.value = rise;
      // 108.bt draws its chortens 1.45 times larger at the valley view; so do
      // these and the crowd's, so the one keeps its place among the others.
      const grow = 1 + 0.45 * s.many;
      placeRow(CHORTEN_H * grow);
      crowdMat.uniforms.uGrow.value = grow;
      // The lamps burn through the night and the raising, dimming at first light.
      const lamps = a * (1 - THREE.MathUtils.smoothstep(s.daylight, 0.3, 0.9));
      // With the breath, the lamps and the glow swell once and settle.
      const swell = Math.sin(Math.PI * s.breath);
      lightsMat.uniforms.uAlpha.value = lamps * (1 + 0.8 * swell);
      // The chortens' light, from the scene's: the key from the moon (then the
      // low sun), the sky's fill, reflections that grow with the dawn, and the
      // site's lamps. (The scene's colours are as written to the screen; the
      // lights work in linear, so they are taken from sRGB.)
      const kc = night.uMoonCol.value as THREE.Vector3;
      const fc = night.uAmbient.value as THREE.Vector3;
      keyLight.color.setRGB(kc.x, kc.y, kc.z, THREE.SRGBColorSpace);
      // (At noon less of it: the sun on white stone, as the day's, would burn
      // it out and set it glowing.)
      const noonK = THREE.MathUtils.smoothstep(s.daylight, 0.55, 1);
      // (The trees' shadows with the sun.)
      treeShadowMat.uniforms.uAmt.value = 0.38 * THREE.MathUtils.smoothstep(s.daylight, 0.45, 0.9) * (1 - solo.uSolo.value);
      if (treeShadows) treeShadows.visible = treeShadowMat.uniforms.uAmt.value > 0.004;
      treeNightMat.uniforms.uAmt.value = 0.2 * (1 - THREE.MathUtils.smoothstep(s.daylight, 0.15, 0.5)) * (1 - solo.uSolo.value) * (night.uShow.value as number);
      if (treeNightShadows) treeNightShadows.visible = treeNightMat.uniforms.uAmt.value > 0.004;
      contactMat.uniforms.uAmt.value = THREE.MathUtils.lerp(0.45, 0.5, s.daylight) * (1 - solo.uSolo.value) * (night.uShow.value as number);
      if (treeContact) treeContact.visible = contactMat.uniforms.uAmt.value > 0.004;
      keyLight.intensity = (1.4 + 1.4 * s.daylight) * (1 - 0.45 * noonK);
      // (The chortens' shadows: soft by the moon, firmer in the noon sun.)
      chShadowU.uChAmt.value =
        night.uShow.value * THREE.MathUtils.lerp(0.4, 0.62, noonK);
      keyLight.target.position.copy(eye);
      keyLight.position
        .copy(eye)
        .addScaledVector(night.uMoon.value as THREE.Vector3, 100);
      fillLight.color.setRGB(
        fc.x * 2.2,
        fc.y * 2.2,
        fc.z * 2.2,
        THREE.SRGBColorSpace,
      );
      // (Less of the sky's fill by day: the sides away from the sun in shade,
      // as the shadows say they are.)
      fillLight.intensity = 0.8 * (1 - 0.4 * noonK);
      stupaMat.envMapIntensity =
        nearMat.envMapIntensity =
        heroMat.envMapIntensity =
          0.5 + 0.3 * s.daylight;
      // The beams go out as the lights begin to wind into the chorten (the
      // first reaching the foundation), and stay out: the lamps themselves
      // still burn, but the light is the chorten's now.
      const beamsOn = 1 - THREE.MathUtils.smoothstep(descendNow, 0.4, 0.5);
      beamMat.uniforms.uAlpha.value = lamps * beamsOn * (1 + 0.6 * swell);
      // (CHORTEN's own lights, for its chorten as it rises: only once the
      // beams are out, so till then its site is lit as the other 107 are.)
      // (Softly: right at its foot and on white stone, at 2.5 they burnt its
      // base out to a white blaze under the bloom once it stood there at
      // night.)
      for (const l of siteLamps)
        l.intensity = 1.1 * lamps * (1 + 0.6 * swell) * (1 - beamsOn);
      // (Scaled by the render scale: at the governor's coarser steps the same
      // glow covers more of the frame, and the mandala's lights ran together.)
      bloom.strength = (0.55 + 0.3 * swell) * (1 - 0.65 * noonK) * (0.4 + 0.6 * Math.min(1, drawn));
      // (By day only the brightest bloom: sunlit white stone stays stone.)
      bloom.threshold = 0.84 + 0.12 * noonK;
      crowdMat.uniforms.uBreath.value = s.breath;
      beams.visible = lamps * beamsOn > 0.01;
      // (The other sites' lit slabs go dark as the camera leaves: passing
      // over them, close, they glare.)
      foundMat.uniforms.uGlow.value =
        lamps * (1 - THREE.MathUtils.smoothstep(s.stone, 0, 0.3));
      // The fixtures: CHORTEN's alone while the others are hidden (uSolo); the
      // lens as lit as the lamps.
      for (const m of fixtureParts)
        m.count = solo.uSolo.value > 0.5 ? 4 : fixtures.length;
      // (By day, the lamps out, only CHORTEN's own four: the others' a pixel
      // or two each down the row, dark against the white stone, flicker as
      // the camera drifts.)
      if (s.daylight > 0.6) for (const m of fixtureParts) m.count = 4;
      lensMat.color.copy(lensCol).multiplyScalar(0.15 + 0.85 * lamps);
      lightsMat.uniforms.uPulse.value = s.pulse * 0.5;
      // The lights go as the 108 stand: each chorten is stone now.
      crowdMat.uniforms.uAlpha.value =
        a * (1 - THREE.MathUtils.smoothstep(s.stone, 0.3, 1));
      seatedMat.uniforms.uAlpha.value = crowdMat.uniforms.uAlpha.value;
      // The fireflies only while the gathering waits in the dark.
      flies.fly.uniforms.uAlpha.value =
        a *
        (1 - THREE.MathUtils.smoothstep(gatherNow, 0.05, 0.3)) *
        (1 - THREE.MathUtils.smoothstep(s.daylight, 0.0, 0.3));
      flies.more.uniforms.uAlpha.value = flies.fly.uniforms.uAlpha.value;
      endFly.uniforms.uAlpha.value =
        a *
        THREE.MathUtils.smoothstep(s.settle, 0, 0.15) *
        (1 - THREE.MathUtils.smoothstep(s.daylight, 0.0, 0.3)) *
        (1 - solo.uSolo.value);
      // The lights follow the scroll eased, not step for step, so they glide
      // into place even where the scroll itself arrives in jumps (touch,
      // keys, the scrollbar). Cut straight there under reduced motion.
      const follow = s.dt > 0 ? 1 - Math.exp(-s.dt * 3) : 1;
      gatherNow += (s.gather - gatherNow) * follow;
      descendNow += (s.descend - descendNow) * follow;
      revealNow += (s.reveal - revealNow) * follow;
      crowdMat.uniforms.uGather.value = gatherNow;
      crowdMat.uniforms.uDescend.value = descendNow;
      figMat.uniforms.uGather.value = gatherNow;
      figMat.uniforms.uFirstOff.value
        .copy(firstUp(gatherNow, firstAt))
        .sub(oneOrb);
      for (const m of peopleMeshes)
        m.visible =
          camera.position.distanceTo(tmpV.set(one.x, one.y, one.z)) <
          PEOPLE_FROM;
      crowdMap.uGatherT.value = gatherNow;
      // The mandala turns slowly, and a little more as it fills.
      crowdMat.uniforms.uSpin.value = s.time * 0.04 + gatherNow * 0.6;
      // The trails are drawn only while lights are in the air.
      for (const t of trails)
        t.visible =
          (gatherNow > 0.001 && descendNow < 0.001) ||
          (descendNow > 0.001 && descendNow < 0.999);
      crowdMat.uniforms.uReveal.value = revealNow;
      crowdMat.uniforms.uPulse.value = s.pulse;

      if (!dragging && !s.hold) rotTarget += s.dt * 0.12 * near;
      rotY += (rotTarget - rotY) * Math.min(1, s.dt * 4);
      crowdMat.uniforms.uRot.value = rotY;
      // CHORTEN's stone: rising as its lights settle (they settle from 0.75 of
      // uDescend, the base first, to the spire at 1), turning with them.
      // Lights only through the raising and while they are found; the stone
      // stands only for the 108, the lights going as it does.
      const stone = s.stone;
      hero1.visible = stone > 0;
      if (hero1.visible) {
        heroMat.userData.build.value = 0.35 * stone;
        hero1.setMatrixAt(
          0,
          chortenAt(foot, CHORTEN_H * grow * 0.96, rotY, m4),
        );
        hero1.instanceMatrix.needsUpdate = true;
      }

      // Eased toward where the story wants it; cut there under reduced motion.
      // Through the night the camera follows its path; pulling back out at
      // the end, it returns to the opening's wide view.
      if (s.many > 0) {
        shotEye.copy(endEye);
        shotAt.copy(camera.aspect < 1 ? endAtNarrow : endAt);
      } else {
        shot(nightU, approach, s.release);
      }
      /* The river of light: the camera pans alongside the ribbon's head, out
         to one side and a little behind it, as it crosses; as the head
         reaches the foundation it settles in front of it, for the coil. */
      // (Round it slowly while it stands complete, rising a little, so the
      // chapters held on it are not a still; settled before the reader
      // explores it.)
      // (And on a little further, slowly, while the night comes back and the
      // stone rises through the lights, before the camera pulls out.)
      const orbitTurn =
        THREE.MathUtils.degToRad(-80) * s.orbit +
        THREE.MathUtils.degToRad(-12) * s.settle;
      orbitEye
        .subVectors(closeEye, foot)
        .applyAxisAngle(up, orbitTurn)
        // (Drawing in a little too: round a chorten alone, little changes.)
        .multiplyScalar(1 - 0.1 * s.orbit)
        .add(foot);
      orbitEye.y += CHORTEN_H * 0.15 * Math.sin(Math.PI * s.orbit);
      // (Where it looks turns with it, or the chorten drifts out of frame.)
      orbitAt.subVectors(closeAt, foot).applyAxisAngle(up, orbitTurn).add(foot);
      const down = descendNow > 0 && s.many === 0;
      if (down) {
        // (Easing to a stop over the last of the way as the head reaches the
        // foundation, for the camera: stopped dead there, it jolted the
        // picture. Only the last: eased all along, the point ran ahead of
        // the braid and the camera looked at where it was not yet.)
        const kh = headAlong(descendNow);
        const EASE_FROM = 0.85;
        const k =
          kh < EASE_FROM
            ? kh
            : EASE_FROM +
              (kh - EASE_FROM) -
              (kh - EASE_FROM) ** 2 / (2 * (1 - EASE_FROM));
        onRibbon(k, headAt);
        // (Its heading from a stretch of the way that never runs past the
        // end: measured to a point just ahead, at the end the two met and
        // the heading, and the camera's side with it, swung at random.)
        const kd = Math.min(k, 0.96);
        onRibbon(kd + 0.03, headAhead);
        const along = headAhead.sub(onRibbon(kd, headBack)).setY(0).normalize();
        const side = new THREE.Vector3(-along.z, 0, along.x);
        if (side.dot(closeEye.clone().sub(foot)) < 0) side.negate();
        // (Further out to the side and up than it was, the braid crossing the
        // picture rather than racing past the lens: alongside it, close, the
        // river swept by three times faster than anything else on the page;
        // much further, the braid shrank to a thread at the picture's edge.)
        const follow = headAt
          .clone()
          .addScaledVector(side, 14)
          .addScaledVector(along, -8)
          .add(new THREE.Vector3(0, 4.5, 0));
        // Looking a little behind the head, so the braid fills the frame.
        onRibbon(Math.max(0, k - 0.08), headBack);
        // (Holding below the mandala while it drains, then after the head.)
        // (Onto the head quickly, so the braid stays in the picture all the
        // way across: blended over longer, the aim hung between it and the
        // mandala and the braid slipped out of the frame.)
        const into = THREE.MathUtils.smoothstep(
          descendNow,
          D_OUT - 0.04,
          D_OUT + 0.1,
        );
        wantEye.lerpVectors(shotEye, follow, into);
        wantAt.lerpVectors(shotAt, headBack.lerp(headAt, 0.6), into);
        // (Closing the same share of the distance left at each step, as the
        // way down to the people does: evenly, it came down onto the chorten
        // fastest at the last.)
        // (Only once the braid is nearly at the foundation, or the camera
        // turned away from it while it was still crossing the river; then
        // closing the same share of the distance left at each step, over a
        // longer stretch, settling while the lights wind up the chorten:
        // taken evenly and short, it came down onto the chorten in a rush.)
        const ARRIVE_NEAR = 0.2;
        const arrive =
          (1 -
            Math.pow(
              ARRIVE_NEAR,
              THREE.MathUtils.smoothstep(descendNow, 0.4, 0.66),
            )) /
          (1 - ARRIVE_NEAR);
        wantEye.lerp(orbitEye, arrive);
        wantAt.lerp(orbitAt, arrive);
      } else {
        wantEye.lerpVectors(orbitEye, shotEye, pull);
        wantAt.lerpVectors(orbitAt, shotAt, pull);
        // Out to the ending over the site, not across it: a straight line
        // runs low past the next foundations, their lit slabs and half-risen
        // stone sweeping by the lens.
        // (Only a little over: higher, it rose and fell back in a hop.)
        if (s.many > 0) wantEye.y += CHORTEN_H * 0.4 * Math.sin(Math.PI * pull);
      }
      // Never below the ground (the close shots are low).
      wantEye.y = Math.max(wantEye.y, groundAt(wantEye.x, wantEye.z) + 0.12);
      // 108bt-web's follow (config.js follow.pose, scroll.follow): a soft
      // 3.2/s at rest, blended up to 8/s while the scroll is moving the
      // camera, so the eased scroll and this ease don't add up to lag.
      const moving =
        wantEye.distanceTo(lastWant) > 0.002 * (1 + wantEye.distanceTo(wantAt))
          ? 1
          : 0;
      lastWant.copy(wantEye);
      // (Slowly: the scroll arrives in bursts, moving one frame and not the
      // next, and followed quickly the rate flickered with them, a shake.)
      followMix += (moving - followMix) * (1 - Math.exp(-s.dt * 2));
      // While it follows a light (riding up beside the first, or after it on
      // the way down), the camera keeps pace with it rather than easing
      // behind: the light's own motion is eased already.
      // (Taken up with the light's own rise, not switched on: switched, the
      // camera would make up the distance it had fallen behind in a lurch.)
      const tracking =
        s.many > 0
          ? 0
          : s.release > 0
            ? THREE.MathUtils.smoothstep(gatherNow, 0, PAN + 0.08) *
              (1 - THREE.MathUtils.smoothstep(gatherNow, RIDE, RIDE + 0.08))
            : // (Taken up and let go gradually: switched off as the lights
              // landed, the camera's pace changed at once.)
              THREE.MathUtils.smoothstep(descendNow, D_OUT, D_OUT + 0.05) *
              (1 - THREE.MathUtils.smoothstep(descendNow, 0.4, 0.55));
      trackMix += (tracking - trackMix) * (1 - Math.exp(-s.dt * 8));
      const rate = THREE.MathUtils.lerp(3.2 + 4.8 * followMix, 20, trackMix);
      const k = first || s.dt === 0 ? 1 : 1 - Math.exp(-s.dt * rate);
      first = false;
      // eye is the eased camera; the bob and the sway are drawn on top of it
      // each frame and never fed back, or the easing chases them and shakes.
      // Riding with the first orb, the camera is fixed to it, both worked out
      // from the same eased value this frame: easing one after the other
      // lets them drift against each other from frame to frame, a shake.
      // (Taking hold gradually as the light begins to rise: the close shot's
      // camera may still be settling then, and taking hold at once would
      // close the last of that distance in a single frame.)
      // (Fully held from the release on, before the light moves (it lifts
      // from PAN): held only partly while it rose, the rest of the way eased
      // at a rate that changed from frame to frame with the frame's length
      // and the scroll's bursts, the camera fell behind it by a different
      // amount each frame and the light shook in the picture.)
      // (And on through the drawing back and the mandala, until the way down
      // begins: the path is eased already, by gatherNow, and eased again
      // here the camera fell behind by a different amount as each burst of
      // scroll came in, and the light jumped in the picture.)
      // (So too pulling back out at the end: that path is the scroll's own,
      // damped already.)
      const rigid =
        s.many > 0
          ? THREE.MathUtils.smoothstep(s.many, 0, 0.03)
          : s.release > 0
            ? THREE.MathUtils.smoothstep(gatherNow, 0, 0.03) *
              (1 - THREE.MathUtils.smoothstep(descendNow, 0, 0.08))
            : 0;
      eye.lerp(wantEye, Math.max(k, rigid));
      at.lerp(wantAt, Math.max(k, rigid));
      if (k === 1) {
        eye.copy(wantEye);
        at.copy(wantAt);
      }
      if (s.dt > 0) sway += (swayTarget - sway) * (1 - Math.exp(-s.dt * 2.5));
      /* Only where the picture holds still to be looked at: the opening
         view over the valley, the close shot on the one person, and the
         ending once the maroon lifts and the chorten stands real. Not on
         the way between (the dive, the light's rise, the mandala, the river
         of light), where the camera travels already and the sway on top
         read as drift; eased in and out, never switched. */
      const swayOpen = 1 - THREE.MathUtils.smoothstep(drift, 0.04, 0.25);
      const swayClose = THREE.MathUtils.smoothstep(approach, 0.9, 1) * (1 - THREE.MathUtils.smoothstep(s.release, 0, 1));
      const swayEnd = THREE.MathUtils.smoothstep(s.settle, 0, 0.05) * (1 - solo.uSolo.value);
      const swayWant = Math.max(swayOpen, swayClose, swayEnd);
      swayK = s.dt > 0 ? swayK + (swayWant - swayK) * (1 - Math.exp(-s.dt * 3)) : swayWant;
      // (The pointer to the right takes the camera round to the right, as
      // 108.bt's does: the subject turning against the pointer.)
      const swayA = THREE.MathUtils.degToRad(SWAY * sway * swayK);
      const reach = eye.distanceTo(at);
      pivot.copy(eye).lerp(at, Math.min(1, SWAY_PIVOT / Math.max(reach, 1e-3)));
      offset.subVectors(eye, pivot).applyAxisAngle(swayAxis, swayA);
      camera.position.copy(pivot).add(offset);
      camera.position.y += Math.sin(s.time * 0.31) * 0.05 * (1 - pull);
      swayAt.subVectors(at, pivot).applyAxisAngle(swayAxis, swayA).add(pivot);
      camera.lookAt(swayAt);
      // (Development only: window.__grOrbit = { a, r, h } circles the person
      // the close shot is on, in their own metres, for looking the figure over.)
      const orbit =
        process.env.NODE_ENV !== "production"
          ? (
              window as unknown as {
                __grOrbit?: { a: number; r: number; h: number };
              }
            ).__grOrbit
          : undefined;
      if (orbit) {
        camera.position.copy(
          onBody(
            Math.sin(orbit.a) * orbit.r,
            orbit.h,
            Math.cos(orbit.a) * orbit.r,
          ),
        );
        camera.lookAt(onBody(0, 0.4, 0.12));
      }
      // (Development only: window.__grCam = { eye, at } looks from any point
      // at any other, scene units, for going over the land from every side;
      // scripts/shoot.mjs's @cam.)
      const devCam =
        process.env.NODE_ENV !== "production"
          ? (window as unknown as { __grCam?: { eye: number[]; at: number[] } })
              .__grCam
          : undefined;
      if (devCam) {
        camera.position.set(devCam.eye[0], devCam.eye[1], devCam.eye[2]);
        camera.lookAt(devCam.at[0], devCam.at[1], devCam.at[2]);
      }
      sky.position.copy(camera.position);

      // Set the picture as 108.bt does: a little low on a wide screen, lifted
      // into the upper part on a phone; close in, the chorten moves right of
      // the copy and up, so its base stays on screen.
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Through the night the site comes up to the middle of the picture,
      // spread across the whole move down the valley (drift), never sideways:
      // only the close shot sets it right of the copy.
      // (At the end too, the picture is centred: the chorten stands whole.)
      const focus = s.many > 0 ? s.many : drift;
      const y = wide
        ? THREE.MathUtils.lerp(-0.17 * (1 - focus), 0.07, near)
        : 0.24;
      // (Not shifted across as the camera comes in among the people: there is
      // no copy beside it now, and the shift panned the picture on top of the
      // camera's own turn.)
      const among = 0;
      camera.setViewOffset(
        w,
        h,
        w > 900 ? -w * 0.18 * Math.max(near, among) : 0,
        h * y,
        w,
        h,
      );
      if (devCam) camera.clearViewOffset();
      camera.updateProjectionMatrix();

      // The lens: focused on the person, the gathering behind them soft,
      // opening as the camera comes in and closing as it leaves for the site.
      // Held on the first light as it rises, the others soft behind it.
      // (By how near the person the camera is, the last few metres only: by
      // the approach's share of the way, it blurred half the move.)
      const lens =
        s.many > 0
          ? 0
          : (1 -
              THREE.MathUtils.smoothstep(
                camera.position.distanceTo(closeLook),
                0.3,
                0.9,
              )) *
            (1 - THREE.MathUtils.smoothstep(gatherNow, 0.05, 0.3)) *
            pull;
      bokeh.enabled = lens > 0.01 && quality > 0.65;
      if (bokeh.enabled) {
        const u = bokeh.uniforms as Record<string, THREE.IUniform>;
        u.focus.value = camera.position.distanceTo(firstUp(gatherNow, firstAt));
        u.aperture.value = 0.006 * lens;
      }
      shadeRow();
      for (const snap of snaps) snap();
      for (const n of nearOnly) n.mesh.visible = camera.position.distanceTo(n.c) < n.reach;
      // The pointer's push on the grass: following the pointer a little
      // behind, easing in, and away when it leaves; its reach a share of the
      // way to the ground it points at, so it parts a like patch on screen.
      {
        const hit = pointerOn && nearOnly.some((n) => n.mesh.visible) ? pointerGround(pushHit) : null;
        // Over the river, moving, it touches the water: a ring at a time as
        // it goes, sized to how far off it is, so they read alike near and
        // far. (groundAt is the meadow's level over the bed; the water lies
        // its BED_DROP lower, so the ray is followed on down to it.)
        {
          const dt = s.dt > 0 ? s.dt : 1 / 60;
          let g: THREE.Vector3 | null = pointerOn ? pointerGround(ripHit, 3000) : null;
          if (g && !(g.z > bedEdge(g.x, "east") && g.z < bedEdge(g.x, "west") && bankSink(g.x, g.z) > 1.3)) g = null;
          if (g) {
            // (groundAt is the meadow's level over the bed; the water lies
            // its BED_DROP lower, so the ray is followed on down to it.)
            for (let k = 0; k < 2; k++) {
              const lift = (g.y - (groundAt(g.x, g.z) - 1.8)) / Math.max(-rayTo.y, 0.05);
              g.addScaledVector(rayTo, lift);
            }
          }
          // (Only once the camera is down by the river, a few metres over
          // the meadow, from the night's low pass along it on: none from
          // high over the valley. Then over all the water in view, but for
          // its farthest reach. By the water's distance alone, the near
          // strip of the low pass rippled and the rest of it, further up the
          // same river, did not.)
          const camUp = camera.position.y - groundAt(camera.position.x, camera.position.z);
          // (Once the night's way down is done the camera stays by the
          // river to the end, though it lifts some metres to follow the
          // lights along it: from there on, on throughout.)
          const ripDown = s.night >= 1 ? 1 : 1 - THREE.MathUtils.smoothstep(camUp, RIP_LOW, RIP_HIGH);
          const ripNear = g
            ? ripDown *
              (1 - THREE.MathUtils.smoothstep(camera.position.distanceTo(g), RIP_FADE, RIP_FAR))
            : 0;
          if (ripNear <= 0) g = null;
          const box = ripU.uRipBox.value;
          ripStill += dt;
          if (g && (!ripOn || ripStill > 5)) {
            box.z = THREE.MathUtils.clamp(5 * Math.pow(camera.position.distanceTo(g), 0.55), 10, 130);
            box.x = g.x - box.z / 2;
            box.y = g.z - box.z / 2;
            ripMat.uniforms.uA.value.w = 0;
            ripStep(2, false, 0);
            ripOn = true;
            ripHad = false;
          }
          const u = ripMat.uniforms;
          let stamp = false;
          if (ripOn) {
            box.x += RIP_FLOW * dt;
            if (g) {
              // Kept near the pointer: moved under the water a whole
              // number of texels when it strays from the middle.
              const tx = Math.round(((g.x - box.x) / box.z - 0.5) * RIP_N);
              const tz = Math.round(((g.z - box.y) / box.z - 0.5) * RIP_N);
              if (Math.abs(tx) > RIP_N * 0.12 || Math.abs(tz) > RIP_N * 0.12) {
                u.uShift.value.set(tx, tz);
                box.x += (tx / RIP_N) * box.z;
                box.y += (tz / RIP_N) * box.z;
                ripLast.x -= tx / RIP_N;
                ripLast.y -= tz / RIP_N;
              }
              const at = new THREE.Vector2((g.x - box.x) / box.z, (g.z - box.y) / box.z);
              const r = 2.5 / RIP_N;
              if (pointerMoved && !ripHad) {
                // (Coming onto the water moving: no touch of its own, which
                // began each wake with a ring stronger than the wake.)
                ripStill = 0;
                ripRest = 0;
              } else if (pointerMoved) {
                // Moving: pressed along its way since the last frame,
                // harder the faster it goes, so it draws a wake.
                const speed = at.distanceTo(ripLast) / dt;
                u.uA.value.set(ripLast.x, ripLast.y, r * 2.2, THREE.MathUtils.clamp(speed * 0.2, 0.012, 0.055) * ripNear);
                u.uB.value.set(at.x, at.y, 0, 0);
                stamp = true;
                ripStill = 0;
                ripRest = 0;
              } else {
                // Resting on the water: a light, broad touch now and then,
                // each a little aside of the last, at no set beat and no
                // set strength, as a drip falls.
                ripRest += dt;
                if (ripRest > (ripHad ? ripNext : 0.4)) {
                  ripNext = 1.3 + Math.random() * 0.9;
                  const jx = at.x + ((Math.random() - 0.5) * 3) / RIP_N;
                  const jz = at.y + ((Math.random() - 0.5) * 3) / RIP_N;
                  u.uA.value.set(jx, jz, r * 2.4, 0.35 * (0.7 + 0.3 * Math.random()) * ripNear);
                  u.uB.value.set(jx, jz, 0, 0);
                  stamp = true;
                  ripStill = 0;
                  ripRest = 0;
                }
              }
              ripLast.copy(at);
              ripHad = true;
            } else ripHad = false;
            ripSteps += dt * RIP_RATE;
            const n = Math.min(4, Math.floor(ripSteps));
            ripSteps -= n;
            if (n > 0 || stamp || u.uShift.value.lengthSq() > 0) ripStep(Math.max(n, 1), stamp);
            if (ripStill > 6) ripOn = false;
          }
          box.w = ripOn ? 1 : 0;
        }
        pointerMoved = false;
        // The leaves: by day only, out of the maroon, the camera down in
        // the meadow, faded in and out.
        {
          const dt = s.dt > 0 ? s.dt : 1 / 60;
          const camUp = camera.position.y - groundAt(camera.position.x, camera.position.z);
          const want =
            still.matches
              ? 0
              : THREE.MathUtils.smoothstep(s.daylight, 0.5, 0.8) *
                (1 - solo.uSolo.value) *
                (1 - THREE.MathUtils.smoothstep(camUp, 8, 12));
          leafShow += (want - leafShow) * (1 - Math.exp(-dt * 1.5));
          leaves.visible = leafShow > 0.01;
          if (leaves.visible) {
            camera.getWorldDirection(leafFwd);
            leafAt.copy(camera.position).addScaledVector(leafFwd, LEAF_AHEAD);
            const t = s.time;
            const w = windU.value;
            // (The pointer's ray, to blow aside the leaves near it.)
            const pointing = pointerOn;
            if (pointing) leafRay.set(pointerNdc.x, pointerNdc.y, 0.5).unproject(camera).sub(camera.position).normalize();
            leafState.forEach((leaf, i) => {
              if (!leaf.placed) leafSpawn(leaf, true);
              const gust = leafGust(leaf.pos.x, leaf.pos.z, t);
              const drift = (0.16 + 0.55 * gust) * leaf.speed * w;
              leaf.pos.x += (leafDir.x * drift + leafSide.x * Math.sin(t * 0.5 + leaf.phase) * 0.05) * dt;
              leaf.pos.z += (leafDir.y * drift + leafSide.y * Math.sin(t * 0.5 + leaf.phase) * 0.05) * dt;
              // Bobbing on the air, lifted by the gusts, settling between.
              leaf.pos.y += (Math.sin(t * 1.1 + leaf.phase) * 0.06 + (gust - 0.35) * 0.1) * w * dt;
              if (pointing) {
                leafTo.subVectors(leaf.pos, camera.position);
                const along = leafTo.dot(leafRay);
                leafTo.addScaledVector(leafRay, -along);
                const d = leafTo.length();
                const reach = 0.12 + along * 0.02;
                if (along > 0 && d < reach) leaf.push.addScaledVector(leafTo.normalize(), ((reach - d) / reach) * 0.9 * dt);
              }
              leaf.pos.addScaledVector(leaf.push, dt);
              leaf.push.multiplyScalar(Math.exp(-dt * 2.5));
              const floor = groundAt(leaf.pos.x, leaf.pos.z) + 0.006;
              // (On the ground a leaf skims rather than sinks.)
              if (leaf.pos.y < floor) leaf.pos.y = floor;
              if (leaf.pos.y > leafAt.y + 0.8) leaf.pos.y -= 0.03 * dt;
              // Out of the box: again on its upwind side.
              const rx = leaf.pos.x - leafAt.x, rz = leaf.pos.z - leafAt.z;
              const a = rx * leafDir.x + rz * leafDir.y, c = rx * leafSide.x + rz * leafSide.y;
              const off = a < -LEAF_SPAN * 1.3 || Math.abs(c) > LEAF_SPAN * 1.2 || Math.abs(leaf.pos.y - leafAt.y) > 1.4;
              if (a > LEAF_SPAN || off) leafSpawn(leaf, off);
              leafQ.setFromAxisAngle(leaf.spin, t * leaf.rate * (0.6 + gust) + leaf.phase);
              leafScale.setScalar(leaf.scale * leafShow);
              leafM.compose(leaf.pos, leafQ, leafScale);
              leaves.setMatrixAt(i, leafM);
            });
            leaves.instanceMatrix.needsUpdate = true;
          }
        }
        // The pointer's trail over the meadow, only on the ground near the
        // eye, as 108.bt's: by night once the camera is down by the
        // gathering, out to POLLEN_NEAR, until the lights rise; again once
        // CHORTEN's stone stands, out to POLLEN_END, the camera higher. Specks
        // spaced by how far it moved, so the trail is even at any speed, and
        // a jump (a scroll, the page crossed) starts anew.
        {
          const down = THREE.MathUtils.smoothstep(s.night, 0.55, 0.6) * (1 - THREE.MathUtils.smoothstep(gatherNow, 0, 0.03));
          const built = THREE.MathUtils.smoothstep(s.stone, 0.9, 1);
          const reach = built > 0 ? POLLEN_END : POLLEN_NEAR;
          const show = still.matches ? 0 : Math.max(down, built) * (1 - solo.uSolo.value);
          // (By day a little stronger: faint gold on sunlit grass was lost.)
          pollenMat.uniforms.uShow.value = show * THREE.MathUtils.lerp(1, 1.7, s.daylight);
          pollen.visible = show > 0.01;
          let g: THREE.Vector3 | null = show > 0.1 && pointerOn ? pointerGround(pollenHit, 3000) : null;
          // (Off only where the ground falls to the river: the bed's outer
          // edges take in meadow by it, and there the trail never showed.)
          if (g && bankSink(g.x, g.z) > 0.3) g = null;
          const gFar = g ? camera.position.distanceTo(g) : 0;
          if (g && gFar > reach) g = null;
          if (g) {
            const far = gFar;
            // (Fading out toward the reach, not stopping at a line.)
            const fade = 1 - THREE.MathUtils.smoothstep(far, reach * 0.7, reach);
            const k = THREE.MathUtils.clamp(far / 10, 0.1, 4);
            const gap = Math.max(0.004, far * 0.0045);
            const moved = pollenHad ? pollenLast.distanceTo(g) : 0;
            if (pollenHad && moved < far * 0.25) {
              const n = Math.min(24, Math.floor(moved / gap));
              const now = shared.uTime.value as number;
              for (let m = 1; m <= n; m++) {
                const f = m / n;
                const i = pollenNext++ % POLLEN_N;
                const j = i * 3;
                pollenPos[j] = THREE.MathUtils.lerp(pollenLast.x, g.x, f) + (Math.random() - 0.5) * 0.06 * k;
                pollenPos[j + 1] = THREE.MathUtils.lerp(pollenLast.y, g.y, f) + (0.04 + Math.random() * 0.12) * k;
                pollenPos[j + 2] = THREE.MathUtils.lerp(pollenLast.z, g.z, f) + (Math.random() - 0.5) * 0.06 * k;
                pollenVel[j] = (Math.random() - 0.5) * 0.14 * k;
                pollenVel[j + 1] = (0.08 + Math.random() * 0.19) * k;
                pollenVel[j + 2] = (Math.random() - 0.5) * 0.14 * k;
                pollenBirth[i] = now;
                // A size in the world, so they are larger close by and finer
                // further off; larger after the stone stands, the camera
                // higher. (Faded toward the reach by size.)
                pollenSize[i] = (built > 0 ? THREE.MathUtils.lerp(0.024, 0.04, s.daylight) : 0.01) * (0.7 + Math.random() * 0.6) * (0.4 + 0.6 * fade);
                pollenCol[j] = 0.68 + Math.random() * 0.22;
                pollenCol[j + 1] = 0.64 + Math.random() * 0.24;
                pollenCol[j + 2] = 0.29 + Math.random() * 0.22;
              }
              if (n) for (const a of Object.values(pollenAttr)) a.needsUpdate = true;
              if (n || !pollenHad) pollenLast.copy(g);
            } else pollenLast.copy(g);
            pollenHad = true;
          } else pollenHad = false;
        }
        const pu = pushU.uPointer.value;
        const dt = s.dt > 0 ? s.dt : 1 / 60;
        if (hit) {
          if (pushU.uPush.value < 0.01) pu.copy(hit);
          else pu.lerp(hit, 1 - Math.exp(-dt * 9));
          pushU.uPushR.value = THREE.MathUtils.clamp(camera.position.distanceTo(hit) * 0.15, 0.08, 0.8);
        }
        pushU.uPush.value += ((hit ? 1 : 0) - pushU.uPush.value) * (1 - Math.exp(-dt * 4));
      }
      // (Development only: window.__grInfo, the frame's draw calls and
      // triangles over all its passes, for measuring what each part costs.)
      const measure = process.env.NODE_ENV !== "production";
      if (measure) {
        renderer.info.autoReset = false;
        renderer.info.reset();
      }
      composer.render(s.dt);
      if (measure) {
        const r = renderer.info.render;
        (window as unknown as { __grScene?: object }).__grScene = { scene, camera, THREE };
        (window as unknown as { __grInfo?: object }).__grInfo = { calls: r.calls, triangles: r.triangles, points: r.points, lines: r.lines, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries };
      }
    },
    select(n) {
      crowdMat.uniforms.uSel.value = n;
      if (!n) return;
      // Turn the chorten so this light faces the camera.
      const k = n - 1;
      let want =
        Math.atan2(camera.position.x - foot.x, camera.position.z - foot.z) -
        Math.atan2(tgt[k * 3], tgt[k * 3 + 2]);
      while (want - rotTarget > Math.PI) want -= Math.PI * 2;
      while (want - rotTarget < -Math.PI) want += Math.PI * 2;
      rotTarget = want;
    },
    setHits(hits) {
      const attr = crowd.g.getAttribute("aHit") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let j = 0; j < TOTAL; j++) arr[j] = hits.has(j + 1) ? 1 : 0;
      attr.needsUpdate = true;
    },
    pickAt(cx, cy) {
      // Nearest light on screen within 18px; among overlaps, the one in front.
      const rect = canvas.getBoundingClientRect();
      const c = Math.cos(rotY);
      const sn = Math.sin(rotY);
      const g = crowdMat.uniforms.uGrow.value as number;
      let best = 0;
      let bestZ = Infinity;
      for (let j = 0; j < TOTAL; j++) {
        const lx = tgt[j * 3] * g;
        const lz = tgt[j * 3 + 2] * g;
        // Same turn as CROWD_VERT applies.
        tmp
          .set(c * lx + sn * lz, tgt[j * 3 + 1] * g, -sn * lx + c * lz)
          .add(foot);
        const depth = tmp.distanceTo(camera.position);
        tmp.project(camera);
        const dx = ((tmp.x + 1) / 2) * rect.width - (cx - rect.left);
        const dy = ((1 - tmp.y) / 2) * rect.height - (cy - rect.top);
        if (dx * dx + dy * dy < 18 * 18 && depth < bestZ) {
          bestZ = depth;
          best = j + 1;
        }
      }
      return best;
    },
    drag(dx) {
      rotTarget += dx * 0.008;
    },
    setDragging(on) {
      dragging = on;
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      for (const rt of groundTargets) rt.dispose();
      for (const rt of shadowMaps) rt.dispose();
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onPointerOut);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      bloom.dispose();
      bokeh.dispose();
      bokehHalf.dispose();
      bokehMix.dispose();
      (bokehMix.material as THREE.ShaderMaterial).dispose();
      grade.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
