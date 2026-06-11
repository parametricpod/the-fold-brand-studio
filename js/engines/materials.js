// materials.js — shared 3D materials for the two ribbon engines (Letter weave +
// Folded ribbon). Two registers that match the studio's two poles:
//   · satin  — MeshPhysicalMaterial with sheen + anisotropy, lit by a procedural
//              PMREM studio environment, so silk catches light.
//   · sketch — a screen-space cross-hatch / pencil shader: pale paper, ink hatching
//              that thickens in the folds and shadows, with a drawn silhouette
//              contour. Reads like the Cloth engine (ink on cream), in 3D.
import * as THREE from "three";

// Procedural studio environment (a few bright softboxes in a dim room). This is
// what makes the satin actually CATCH light — long warm key, cool counter-fill,
// a top highlight streak. Returns a PMREM texture; pass it to scene.environment.
export function makeEnv(renderer) {
  const sc = new THREE.Scene();
  const panel = (w, h, intensity, hex, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity) }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m);
  };
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(20, 24, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3d4149), side: THREE.BackSide })));
  panel(9, 3.2, 5.0, 0xfff1e0, -6, 6, 8);    // warm key softbox, upper left front
  panel(7, 1.6, 2.6, 0xdde8ff, 7, -3, 6);    // cool fill, lower right
  panel(16, 1.0, 3.6, 0xffffff, 0, 9, 2);    // long top streak — the satin highlight band
  panel(6, 1.2, 1.6, 0xffd9c2, -7, -6, 3);   // low warm bounce
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(sc, 0.045).texture;
  pm.dispose();
  sc.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return tex;
}

// Satin: sheen for the fabric backscatter, anisotropy for the silk streak, env for
// the glow. (Needs scene.environment set to makeEnv()'s texture to read as silk.)
export function satinMat(hex) {
  const c = new THREE.Color(hex);
  const m = new THREE.MeshPhysicalMaterial({
    side: THREE.DoubleSide, color: c, roughness: 0.34, metalness: 0,
    sheen: 1, sheenRoughness: 0.42, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.55),
    envMapIntensity: 0.9, specularIntensity: 0.9,
  });
  m.anisotropy = 0.55;
  m.shadowSide = THREE.DoubleSide;
  return m;
}

// Cross-hatch pencil shader. Self-lit (ignores scene lights/env) so it reads as a
// flat drawing: a fixed screen-space key direction shades the form, and the shade
// is rendered as layered ink hatching on pale paper, densest where the surface
// turns away from the light — plus a drawn contour at the silhouette.
const SKETCH_VERT = `
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = -mv.xyz;                       // direction to camera (view space)
    gl_Position = projectionMatrix * mv;
  }
`;
const SKETCH_FRAG = `
  precision highp float;
  varying vec3 vN;
  varying vec3 vView;
  uniform vec3  uInk;
  uniform vec3  uPaper;
  uniform vec3  uLight;                    // view-space key direction
  uniform float uScale;                    // px per hatch line
  uniform float uOpacity;
  uniform float uContour;

  // antialiased coverage of a set of parallel strokes at angle a, with given period
  float strokeCov(vec2 p, float a, float spacing, float halfw) {
    vec2 d = vec2(cos(a), sin(a));
    float v = dot(p, d) / spacing;
    float t = abs(fract(v) - 0.5);         // 0 at a line centre, 0.5 between
    float aa = fwidth(t) + 1e-4;
    return 1.0 - smoothstep(halfw - aa, halfw + aa, t);
  }

  void main() {
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    float ndl = dot(N, normalize(uLight)) * 0.5 + 0.5;     // 0 dark .. 1 lit
    float shade = pow(clamp(ndl, 0.0, 1.0), 0.85);

    vec2 sp = gl_FragCoord.xy / uScale;
    float hw = 0.13, cov = 0.0;
    // layered pencil hatch — light areas get a single diagonal; only the darkest
    // build to a full cross-hatch. Uniform, wide spacing keeps it reading as lines.
    cov = max(cov, strokeCov(sp, 0.34, 1.12, hw) * smoothstep(0.90, 0.70, shade));   // ╱
    cov = max(cov, strokeCov(sp, 1.30, 1.12, hw) * smoothstep(0.60, 0.42, shade));   // ╲ (cross)
    cov = max(cov, strokeCov(sp, 2.68, 1.06, hw) * smoothstep(0.38, 0.20, shade));   // ─
    cov = max(cov, strokeCov(sp, 0.95, 1.00, hw) * smoothstep(0.18, 0.05, shade));   // │ (dense)

    // drawn silhouette contour — ink where the surface turns away from the eye
    float facing = abs(dot(N, normalize(vView)));
    cov = max(cov, smoothstep(0.36, 0.08, facing) * uContour);

    cov = clamp(cov * uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(mix(uPaper, uInk, cov), 1.0);
  }
`;

export function sketchMat({ ink = "#171d60", paper = "#ece6e4", scale = 12, opacity = 1, contour = 0.6 } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uInk: { value: new THREE.Color(ink) },
      uPaper: { value: new THREE.Color(paper) },
      uLight: { value: new THREE.Vector3(-0.5, 0.72, 0.6).normalize() },
      uScale: { value: scale },
      uOpacity: { value: opacity },
      uContour: { value: contour },
    },
    vertexShader: SKETCH_VERT,
    fragmentShader: SKETCH_FRAG,
  });
}

// Build the ribbon material by register name. `scale` should be ~9 * pixelRatio so
// the hatch spacing is resolution-stable.
export function ribbonMaterial(kind, { color, ink, paper, scale }) {
  if (kind === "sketch") return sketchMat({ ink: color || ink, paper, scale });
  return satinMat(color || ink);
}
